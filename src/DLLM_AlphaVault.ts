import DLMM, {
  ActivationType,
  deriveCustomizablePermissionlessLbPair,
  LBCLMM_PROGRAM_IDS,
} from "@meteora-ag/dlmm";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SYSVAR_CLOCK_PUBKEY,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  Clock,
  ClockLayout,
  createDummyMint,
  loadKeypairFromFile,
} from "./utils";
import { NATIVE_MINT } from "@solana/spl-token";
import AlphaVault, {
  deriveAlphaVault,
  PoolType,
  PROGRAM_ID,
  VAULT_PROGRAM_ID,
  WhitelistMode,
} from "@meteora-ag/alpha-vault";

export async function createCustomizableDlmmWithPermissionlessVault(
  connection: Connection,
  payer: Keypair,
) {
  const mintX = await createDummyMint(connection, payer).then(
    (info) => info.mint,
  );
  const mintY = NATIVE_MINT;

  // 1. Create DLMM token launch pool
  const binStep = new BN(10);
  const activeId = new BN(0);
  const feeBps = new BN(50);
  const hasAlphaVault = true;
  const creator = payer.publicKey;

  const clockAccount = await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY);
  if (!clockAccount) {
    throw new Error("Clock account not found");
  }
  const clock: Clock = ClockLayout.decode(clockAccount.data);

  // Configure deposit window and activation timing
  const depositDuration = 3600; // 1 hour deposit window
  const buffer = 3600 + 300; // 1h05 buffer (required by Meteora)

  const activationPoint = clock.unixTimestamp.add(
    new BN(depositDuration + buffer),
  );

  const createPoolTx = await DLMM.createCustomizablePermissionlessLbPair(
    connection,
    binStep,
    mintX,
    mintY,
    activeId,
    feeBps,
    ActivationType.Timestamp,
    hasAlphaVault,
    creator,
    activationPoint,
    false,
    {
      cluster: "devnet",
    },
  );

  console.log("Creating pool");
  const createPoolTxHash = await sendAndConfirmTransaction(
    connection,
    createPoolTx,
    [payer],
  );
  console.log(createPoolTxHash);

  await new Promise((resolve) => setTimeout(resolve, 15000));

  const [lbPairKey] = deriveCustomizablePermissionlessLbPair(
    mintX,
    mintY,
    new PublicKey(LBCLMM_PROGRAM_IDS["devnet"]),
  );

  const dlmm = await DLMM.create(connection, lbPairKey, {
    cluster: "devnet",
  });

  // 2. Create permissionless alpha vault
  const depositingPoint = clock.unixTimestamp; // Deposit start immediately
  const startVestingPoint = activationPoint.add(new BN(600)); // Vesting starts 1 minute after pool activation
  const endVestingPoint = startVestingPoint.add(new BN(3600)); // 6 hours vesting duration
  const maxBuyingCap = new BN(25).mul(new BN(LAMPORTS_PER_SOL / 10)); // 100 SOL buying cap
  const escrowFee = new BN(0); // 0 fee to create stake escrow account

  const createAlphaVaultTx = await AlphaVault.createCustomizableProrataVault(
    connection,
    {
      quoteMint: dlmm.lbPair.tokenYMint,
      baseMint: dlmm.lbPair.tokenXMint,
      poolAddress: dlmm.pubkey,
      poolType: PoolType.DLMM,
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
    dlmm.pubkey,
    new PublicKey(PROGRAM_ID.devnet),
  );
  console.log(alphaVaultTxHash);

  console.log("DLLM pool:", dlmm.pubkey.toBase58());
  console.log("Alpha vault:", alphaVaultTxHash);
  console.log("Alpha vault:", alphaVault.toBase58());
}

export async function depositToAlphaVault(
  depositAmount: BN,
  payer: Keypair,
  poolAddress: string,
) {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  const pool = new PublicKey(poolAddress);
  const programId = new PublicKey(PROGRAM_ID.devnet);
  const [vault] = deriveAlphaVault(payer.publicKey, pool, programId);

  console.log("Alpha vault:", vault.toBase58());
  const accountsToFetch = [vault, SYSVAR_CLOCK_PUBKEY];
  const [vaultAccountBuffer, clockAccountBuffer] =
    await connection.getMultipleAccountsInfo(accountsToFetch);

  console.log("Vault account buffer:", vaultAccountBuffer);
  console.log("Clock account buffer:", clockAccountBuffer);

  if (!vaultAccountBuffer || !clockAccountBuffer) {
    throw new Error("Failed to fetch accounts");
  }

  const alphaVault = await AlphaVault.create(connection, vault);
  const depositTx = await alphaVault.deposit(depositAmount, payer.publicKey);

  console.log(`Depositing ${depositAmount.toString()}`);
  const txHash = await sendAndConfirmTransaction(connection, depositTx, [
    payer,
  ]);
  console.log(txHash);

  const escrow = await alphaVault.getEscrow(payer.publicKey);
  console.log("Escrow info");
  console.log(escrow);
}
