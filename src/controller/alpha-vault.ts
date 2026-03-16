import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import BN from "bn.js";
import config from "../config";
import AlphaVault from "@meteora-ag/alpha-vault";
import { parseVaultObject } from "../utils";

export const depositToAlphaVault = async (req: any, res: any) => {
  try {
    const { depositAmount, payer } = req.body;

    const payerPublicKey = new PublicKey(payer);

    const vault = new PublicKey(config.vaultAddress);

    const alphaVault = await AlphaVault.create(config.connection, vault);
    const depositTx = await alphaVault.deposit(
      new BN(depositAmount * LAMPORTS_PER_SOL),
      payerPublicKey,
    );
    return res.status(200).json({
      success: true,
      tx: depositTx
        .serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })
        .toString("base64"),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || "Internal server error",
    });
  }
};

export const withdrawFromAlphaVault = async (req: any, res: any) => {
  try {
    const { withdrawAmount, payer } = req.body;

    const payerPublicKey = new PublicKey(payer);

    const vault = new PublicKey(config.vaultAddress);

    const alphaVault = await AlphaVault.create(config.connection, vault);
    const withdrawTx = await alphaVault.withdraw(
      new BN(withdrawAmount * LAMPORTS_PER_SOL),
      payerPublicKey,
    );
    return res.status(200).json({ success: true, tx: withdrawTx });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || "Internal server error",
    });
  }
};

export const claimTokensFromAlphaVault = async (req: any, res: any) => {
  try {
    const { payer } = req.body;

    const payerPublicKey = new PublicKey(payer);

    const vault = new PublicKey(config.vaultAddress);

    const alphaVault = await AlphaVault.create(config.connection, vault);
    const claimTx = await alphaVault.claimToken(payerPublicKey);
    return res.status(200).json({ success: true, tx: claimTx });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || "Internal server error",
    });
  }
};

export const getAlphaVaultInfo = async (req: any, res: any) => {
  try {
    const vault = new PublicKey(config.vaultAddress);

    const alphaVault = await AlphaVault.create(config.connection, vault);
    const activationPoint = alphaVault.activationPoint.toNumber();
    const clockUnixTimestamp = alphaVault.clock.unixTimestamp.toNumber();
    const epochStartTimestamp =
      alphaVault.clock.epochStartTimestamp?.toNumber();

    const vaultInfo = parseVaultObject(alphaVault.vault);
    const vaultPoint = alphaVault.vaultPoint;
    const pubkey = alphaVault.pubkey;
    return res.status(200).json({
      success: true,
      vaultInfo,
      vaultPoint,
      activationPoint,
      clockUnixTimestamp,
      epochStartTimestamp,
      pubkey: pubkey.toBase58(),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || "Internal server error",
    });
  }
};

export const getEscrowInfo = async (req: any, res: any) => {
  try {
    const { payer } = req.body;

    const payerPublicKey = new PublicKey(payer);

    const vault = new PublicKey(config.vaultAddress);

    const alphaVault = await AlphaVault.create(config.connection, vault);
    const escrow = await alphaVault.getEscrow(payerPublicKey);
    const totalDeposit = escrow?.totalDeposit.toNumber() || 0;
    const claimedToken = escrow?.claimedToken.toNumber() || 0;
    const lastClaimedPoint = escrow?.lastClaimedPoint.toNumber() || 0;
    const withdrawnDepositOverflow =
      escrow?.withdrawnDepositOverflow.toNumber() || 0;
    const refunded = escrow?.refunded;
    const maxCap = escrow?.maxCap.toNumber();

    const availableDepositQuota = alphaVault
      .getAvailableDepositQuota(escrow)
      .toNumber();
    const claimInfo = alphaVault.getClaimInfo(escrow);
    const depositInfo = alphaVault.getDepositInfo(escrow);
    const interactionState = await alphaVault.interactionState(escrow);

    // Convert BN values to numbers for better frontend consumption
    const convertedClaimInfo = {
      totalAllocated: claimInfo.totalAllocated.toNumber(),
      totalClaimed: claimInfo.totalClaimed.toNumber(),
      totalClaimable: claimInfo.totalClaimable.toNumber(),
    };

    const convertedDepositInfo = {
      totalDeposit: depositInfo.totalDeposit.toNumber(),
      totalFilled: depositInfo.totalFilled.toNumber(),
      totalReturned: depositInfo.totalReturned.toNumber(),
    };

    const convertedInteractionState = {
      claimInfo: {
        totalAllocated: interactionState.claimInfo.totalAllocated.toNumber(),
        totalClaimed: interactionState.claimInfo.totalClaimed.toNumber(),
        totalClaimable: interactionState.claimInfo.totalClaimable.toNumber(),
      },
      depositInfo: {
        totalDeposit: interactionState.depositInfo.totalDeposit.toNumber(),
        totalFilled: interactionState.depositInfo.totalFilled.toNumber(),
        totalReturned: interactionState.depositInfo.totalReturned.toNumber(),
      },
      availableQuota: interactionState.availableQuota.toNumber(),
      isWhitelisted: interactionState.isWhitelisted,
      canClaim: interactionState.canClaim,
      hadClaimed: interactionState.hadClaimed,
      canDeposit: interactionState.canDeposit,
      hadDeposited: interactionState.hadDeposited,
      canWithdraw: interactionState.canWithdraw,
      canWithdrawDepositOverflow: interactionState.canWithdrawDepositOverflow,
      availableDepositOverflow:
        interactionState.availableDepositOverflow.toNumber(),
      canWithdrawRemainingQuote: interactionState.canWithdrawRemainingQuote,
      hadWithdrawnRemainingQuote: interactionState.hadWithdrawnRemainingQuote,
    };

    return res.status(200).json({
      success: true,
      escrow: {
        ...escrow,
        totalDeposit,
        claimedToken,
        lastClaimedPoint,
        withdrawnDepositOverflow,
        refunded,
        maxCap,
      },
      availableDepositQuota,
      claimInfo: convertedClaimInfo,
      depositInfo: convertedDepositInfo,
      interactionState: convertedInteractionState,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      error: (error as Error).message || "Internal server error",
    });
  }
};
