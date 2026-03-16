import {
  CpAmm,
  FEE_DENOMINATOR,
  BaseFeeMode,
  getLiquidityDeltaFromAmountA,
  PoolState,
  SCALE_OFFSET,
  getBaseFeeParams,
  PoolFeesParams,
  getDynamicFeeParams,
  getSqrtPriceFromPrice,
} from "@meteora-ag/cp-amm-sdk";
import { ActivationType } from "@meteora-ag/dlmm";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import { BN } from "bn.js";
import AlphaVault, {
  deriveAlphaVault,
  PoolType,
  WhitelistMode,
  PROGRAM_ID,
} from "@meteora-ag/alpha-vault";
import {
  Clock,
  ClockLayout,
  createDummyMint,
  loadKeypairFromFile,
  parseVaultObject,
} from "./utils";
import config from "./config";

export async function createCustomizableDammV2WithPermissionlessVault(
  connection: Connection,
  payer: Keypair,
) {
  const tokenAMint = await createDummyMint(connection, payer).then(
    (info) => info.mint,
  );
  const tokenBMint = NATIVE_MINT;

  const sqrtMinPrice = getSqrtPriceFromPrice("0.00025", 6, 9);
  const sqrtMaxPrice = getSqrtPriceFromPrice("0.01", 6, 9);

  const hasAlphaVault = true;
  const creator = payer.publicKey;

  const clockAccount = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  const clock: Clock = ClockLayout.decode(clockAccount!.data);

  // Configure deposit window and activation timing
  const depositDuration = 1800; // 1/2 hour deposit window
  const buffer = 3600 + 300; // 1h05 buffer (required by Meteora)

  const activationPoint = clock.unixTimestamp.add(
    new BN(depositDuration + buffer),
  );

  const positionNftMint = Keypair.generate();
  const cpAmm = new CpAmm(connection);

  const tokenAAmount = new BN(15_000_000_000);
  const tokenBAmount = new BN(0);
  const collectFeeMode = 0; // Both token

  const liquidityDelta = getLiquidityDeltaFromAmountA(
    tokenAAmount,
    sqrtMinPrice,
    sqrtMaxPrice,
    collectFeeMode,
  );

  const feePct = 5;
  const protocolFeePercent = 20;
  const referralFeePercent = 20;
  const cliffFeeNumerator = new BN(feePct)
    .mul(new BN(FEE_DENOMINATOR))
    .divn(100);

  const baseFee = getBaseFeeParams(
    {
      baseFeeMode: BaseFeeMode.FeeMarketCapSchedulerExponential,
      feeMarketCapSchedulerParam: {
        startingFeeBps: 1111,
        endingFeeBps: 100,
        numberOfPeriod: 3,
        sqrtPriceStepBps: 2000,
        schedulerExpirationDuration: 60,
      },
    },
    9,
    ActivationType.Timestamp,
  );

  console.log("Base fee:", baseFee);

  const poolFees: PoolFeesParams = {
    baseFee,
    padding: 0,
    dynamicFee: getDynamicFeeParams(500),
    compoundingFeeBps: 0,
  };

  const { tx, pool } = await cpAmm.createCustomPool({
    payer: payer.publicKey,
    creator,
    positionNft: positionNftMint.publicKey,
    tokenAMint,
    tokenBMint,
    tokenAAmount,
    tokenBAmount,
    sqrtMinPrice,
    sqrtMaxPrice,
    initSqrtPrice: sqrtMinPrice,
    hasAlphaVault,
    activationType: ActivationType.Timestamp,
    collectFeeMode,
    activationPoint,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
    liquidityDelta,
    poolFees,
  });

  console.log("Creating pool: ", pool.toBase58());
  const createPoolTxHash = await sendAndConfirmTransaction(connection, tx, [
    payer,
    positionNftMint,
  ]);

  console.log("Pool tx hash:", createPoolTxHash);

  await new Promise((resolve) => setTimeout(resolve, 15000));

  const poolAccount = await connection.getAccountInfo(pool);
  if (!poolAccount) {
    throw new Error("Pool account not found");
  }
  const dammV2Pool: PoolState = await cpAmm._program.coder.accounts.decode(
    "pool",
    poolAccount.data,
  );

  // 2. Create permissionless alpha vault
  const depositingPoint = clock.unixTimestamp; // Deposit start immediately
  const startVestingPoint = activationPoint.add(new BN(600)); // Vesting starts 1 minute after pool activation
  const endVestingPoint = startVestingPoint.add(new BN(3600)); // 6 hours vesting duration
  const maxBuyingCap = new BN(25).mul(new BN(LAMPORTS_PER_SOL / 10)); // 100 SOL buying cap
  const escrowFee = new BN(0); // 0 fee to create stake escrow account

  const createAlphaVaultTx = await AlphaVault.createCustomizableProrataVault(
    connection,
    {
      quoteMint: dammV2Pool.tokenBMint,
      baseMint: dammV2Pool.tokenAMint,
      poolAddress: pool,
      poolType: PoolType.DAMMV2,
      depositingPoint,
      startVestingPoint,
      endVestingPoint,
      maxBuyingCap,
      escrowFee,
      whitelistMode: WhitelistMode.Permissionless,
    },
    creator,
    {
      cluster: "devnet",
    },
  );

  console.log("Creating alpha vault");
  const alphaVaultTxHash = await sendAndConfirmTransaction(
    connection,
    createAlphaVaultTx,
    [payer],
  );

  await new Promise((resolve) => setTimeout(resolve, 15000));

  const [alphaVault] = deriveAlphaVault(
    payer.publicKey,
    pool,
    new PublicKey(PROGRAM_ID.devnet),
  );
  console.log(alphaVaultTxHash);

  console.log("DAMMV2 pool:", pool.toBase58());
  console.log("Alpha vault:", alphaVaultTxHash);
  console.log("Alpha vault:", alphaVault.toBase58());
  console.log("Position NFT mint:", positionNftMint.publicKey.toBase58());
  console.log("Token A mint:", tokenAMint.toBase58());
  console.log("Token B mint:", tokenBMint.toBase58());
  console.log("Creator:", payer.publicKey.toBase58());
  console.log("Pool type:", PoolType.DAMMV2);
  console.log("Deposit start point:", depositingPoint.toString());
  console.log("Vesting start point:", startVestingPoint.toString());
  console.log("Vesting end point:", endVestingPoint.toString());
  console.log("Max buying cap:", maxBuyingCap.toString());
  console.log("Escrow fee:", escrowFee.toString());
  console.log("Whitelist mode:", WhitelistMode.Permissionless);
}

export async function getAlphaVaultInfo(
  connection: Connection,
  pool: string,
  creator: Keypair,
) {
  const poolAddress = new PublicKey(pool);

  const [vault] = deriveAlphaVault(
    creator.publicKey,
    poolAddress,
    new PublicKey(PROGRAM_ID.devnet),
  );

  const alphaVault = await AlphaVault.create(connection, vault);

  console.log("Alpha vault address:", vault.toBase58());

  const activationPoint = alphaVault.activationPoint.toNumber();
  console.log("Activation point:", activationPoint);
  console.log(
    "Activation point date:",
    new Date(activationPoint * 1000).toISOString(),
  );

  const clockUnixTimestamp = alphaVault.clock.unixTimestamp.toNumber();
  console.log("Clock unix timestamp:", clockUnixTimestamp);
  console.log(
    "Clock unix timestamp date:",
    new Date(clockUnixTimestamp * 1000).toISOString(),
  );

  console.log("Clock slot:", alphaVault.clock.slot.toNumber());
  console.log("Clock epoch:", alphaVault.clock.epoch?.toNumber());

  const epochStartTimestamp = alphaVault.clock.epochStartTimestamp?.toNumber();
  if (epochStartTimestamp) {
    console.log("Clock epoch start timestamp:", epochStartTimestamp);
    console.log(
      "Clock epoch start timestamp date:",
      new Date(epochStartTimestamp * 1000).toISOString(),
    );
  }

  console.log(
    "Clock leader schedule epoch:",
    alphaVault.clock.leaderScheduleEpoch?.toNumber(),
  );
  console.log("Mode:", alphaVault.mode);
  console.log(
    "Pre-activation duration:",
    alphaVault.preActivationDuration.toNumber(),
  );
  console.log("Public key:", alphaVault.pubkey);
  console.log("Vault:", parseVaultObject(alphaVault.vault));
  console.log("Vault point:", alphaVault.vaultPoint);

  // Log vault point timestamps as dates
  const vaultPoint = alphaVault.vaultPoint;
  console.log("Vault point dates:");
  if (vaultPoint.firstJoinPoint > 0) {
    console.log(
      "  First join point:",
      new Date(vaultPoint.firstJoinPoint * 1000).toISOString(),
    );
  }
  if (vaultPoint.lastJoinPoint > 0) {
    console.log(
      "  Last join point:",
      new Date(vaultPoint.lastJoinPoint * 1000).toISOString(),
    );
  }
  if (vaultPoint.lastBuyingPoint > 0) {
    console.log(
      "  Last buying point:",
      new Date(vaultPoint.lastBuyingPoint * 1000).toISOString(),
    );
  }
  if (vaultPoint.startVestingPoint > 0) {
    console.log(
      "  Start vesting point:",
      new Date(vaultPoint.startVestingPoint * 1000).toISOString(),
    );
  }
  if (vaultPoint.endVestingPoint > 0) {
    console.log(
      "  End vesting point:",
      new Date(vaultPoint.endVestingPoint * 1000).toISOString(),
    );
  }

  console.log("Vault state:", alphaVault.vaultState);
}

// export async function fillVaultWithDAMMv2() {
//   console.log("Attempting to fill vault:", config.vaultAddress);

//   const alphaVault = await AlphaVault.create(
//     config.connection,
//     new PublicKey(config.vaultAddress),
//   );

//   // Critical check: Verify vault exists and is properly initialized
//   console.log("Vault successfully loaded:", !!alphaVault);
//   console.log("Vault address:", alphaVault.pubkey.toBase58());

//   console.log("Pool type: ", alphaVault.vault.poolType == PoolType.DAMMV2);
//   console.log("Vault state:", alphaVault.vaultState);
//   console.log("Activation point:", alphaVault.activationPoint.toNumber());
//   console.log("Current time:", Date.now() / 1000);
//   console.log(
//     "Is vault activated:",
//     Date.now() / 1000 > alphaVault.activationPoint.toNumber(),
//   );

//   // Check vault deposits and state
//   console.log("Total deposit:", alphaVault.vault.totalDeposit.toString());
//   console.log("Total escrow:", alphaVault.vault.totalEscrow.toString());
//   console.log("Swapped amount:", alphaVault.vault.swappedAmount.toString());
//   console.log("Bought token:", alphaVault.vault.boughtToken.toString());

//   // Check if vault needs filling
//   const needsFilling =
//     alphaVault.vault.totalDeposit.gt(new BN(0)) &&
//     alphaVault.vault.swappedAmount.eq(new BN(0));
//   console.log("Vault needs filling:", needsFilling);

//   // Check if vault can be filled
//   try {
//     // First try to get more detailed vault state
//     console.log("\nDetailed vault analysis:");
//     console.log("Vault point:", alphaVault.vaultPoint);
//     console.log("Clock:", alphaVault.clock.unixTimestamp.toNumber());

//     // Check if we can get any transaction at all
//     console.log("\nTrying different fill approaches...");

//     // Try 1: Standard fillVault
//     console.log("1. Trying standard fillVault...");
//     const fillVaultWithDynamicAmmTransaction = await alphaVault.fillVault(
//       config.walletKeyPair.publicKey,
//     );

//     if (fillVaultWithDynamicAmmTransaction) {
//       console.log("✓ Standard fillVault worked!");
//     } else {
//       console.log("✗ Standard fillVault returned undefined");

//       // Try 2: Check if there are any available methods
//       console.log("2. Checking available vault methods...");
//       console.log(
//         "Available methods:",
//         Object.getOwnPropertyNames(Object.getPrototypeOf(alphaVault)),
//       );

//       // Try 3: Check vault interaction state
//       console.log("3. Checking if vault allows any interactions...");
//       try {
//         const dummyEscrow = await alphaVault.getEscrow(
//           config.walletKeyPair.publicKey,
//         );
//         console.log("Escrow exists:", !!dummyEscrow);
//         if (dummyEscrow) {
//           const interactionState =
//             await alphaVault.interactionState(dummyEscrow);
//           console.log("Can deposit:", interactionState.canDeposit);
//           console.log("Can withdraw:", interactionState.canWithdraw);
//           console.log("Can claim:", interactionState.canClaim);
//         }
//       } catch (e) {
//         console.log("No escrow found for this wallet");
//       }
//     }

//     if (!fillVaultWithDynamicAmmTransaction) {
//       console.log(
//         "fillVault returned undefined - vault might not be ready to fill",
//       );
//       console.log("Possible reasons:");
//       console.log(
//         "1. Pool has been activated:",
//         Date.now() / 1000 > alphaVault.activationPoint.toNumber(),
//       );
//       console.log("2. Vault state allows filling:", alphaVault.vaultState);
//       console.log(
//         "3. There are deposits to fill:",
//         alphaVault.vault.totalDeposit.toString(),
//         "lamports",
//       );
//       console.log(
//         "4. Vault hasn't been filled yet:",
//         alphaVault.vault.swappedAmount.toString(),
//         "swapped",
//       );
//       console.log("5. Vault mode:", alphaVault.vault.vaultMode);

//       // Additional checks for DAMM v2 specific requirements
//       console.log("\nDAMM v2 specific checks:");
//       console.log(
//         "- Pool type is DAMM v2:",
//         alphaVault.vault.poolType === PoolType.DAMMV2,
//       );
//       console.log(
//         "- Vault authority:",
//         alphaVault.vault.vaultAuthority.toBase58(),
//       );
//       console.log("- Pool address:", alphaVault.vault.pool.toBase58());

//       return;
//     }

//     console.log("Fill vault with DAMMv2: ", fillVaultWithDynamicAmmTransaction);
//     const txHash = await sendAndConfirmTransaction(
//       config.connection,
//       fillVaultWithDynamicAmmTransaction,
//       [config.walletKeyPair],
//     );
//     console.log("Fill transaction hash:", txHash);
//   } catch (error) {
//     console.error("Error filling vault:", error);
//   }
// }

export async function fillVaultWithDammV2() {
  try {
    const alphaVault = await AlphaVault.create(
      config.connection,
      new PublicKey(config.vaultAddress),
    );

    let poolTypeName = "Unknown";
    switch (alphaVault.vault.poolType) {
      case PoolType.DLMM: {
        poolTypeName = "DLMM";
        break;
      }
      case PoolType.DAMM: {
        poolTypeName = "Dynamic AMM";
        break;
      }
      case PoolType.DAMMV2: {
        poolTypeName = "DAMM v2";
        break;
      }
    }
    console.log("Pool type: ", poolTypeName);

    const payer = config.walletKeyPair;

    // Dynamic AMM v2 require only single fill transaction
    const fillVaultWithDammV2Transaction = await alphaVault.fillVault(
      payer.publicKey,
    );

    if (!fillVaultWithDammV2Transaction) {
      console.log("Fill vault with dynamic AMM v2: No transaction generated");
      return;
    }

    console.log("Fill vault with dynamic AMM v2");
    const txHash = await sendAndConfirmTransaction(
      config.connection,
      fillVaultWithDammV2Transaction,
      [payer],
    );
    console.log(txHash);
  } catch (error) {
    console.error("Error filling vault:", error);
  }
}