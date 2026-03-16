import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import fs from "fs";
import * as Token from "@solana/spl-token";
import { struct, u64, i64 } from "@coral-xyz/borsh";
import BN from "bn.js";

export async function createDummyMint(connection: Connection, payer: Keypair) {
  console.log("Create mint");
  const mintAInfo = await createTokenAndMint(
    connection,
    payer,
    6,
    100_000_000_000,
  );

  return mintAInfo;
}

export function bpsToNumerator(bps: BN) {
  // Default fee denominator is 100_000
  return bps.mul(new BN(10));
}

export async function createDummyMints(connection: Connection, payer: Keypair) {
  console.log("Creating mint A");
  const mintAInfo = await createDummyMint(connection, payer);

  console.log("Creating mint B");
  const mintBInfo = await createDummyMint(connection, payer);

  return {
    mintAInfo,
    mintBInfo,
  };
}

export interface Clock {
  slot: BN;
  epochStartTimestamp: BN;
  epoch: BN;
  leaderScheduleEpoch: BN;
  unixTimestamp: BN;
}

export const ClockLayout = struct([
  u64("slot"),
  i64("epochStartTimestamp"),
  u64("epoch"),
  u64("leaderScheduleEpoch"),
  i64("unixTimestamp"),
]);

export enum ActivationType {
  Slot,
  Timestamp,
}

export function loadKeypairFromFile(filePath: string): Keypair {
  const keypairFile = JSON.parse(fs.readFileSync(filePath).toString());
  const keypair = Uint8Array.from(keypairFile as number[]);
  return Keypair.fromSecretKey(keypair);
}

export async function createTokenAndMint(
  connection: Connection,
  payer: Keypair,
  decimals: number,
  supply: number,
) {
  const lamports = await Token.getMinimumBalanceForRentExemptMint(connection);
  const mintKeypair = Keypair.generate();
  const programId = Token.TOKEN_PROGRAM_ID;

  const minterATA = Token.getAssociatedTokenAddressSync(
    mintKeypair.publicKey,
    payer.publicKey,
  );

  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: Token.MINT_SIZE,
      lamports,
      programId,
    }),
    Token.createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      payer.publicKey,
      null,
      programId,
    ),
    Token.createAssociatedTokenAccountInstruction(
      payer.publicKey,
      minterATA,
      payer.publicKey,
      mintKeypair.publicKey,
      Token.TOKEN_PROGRAM_ID,
      Token.ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    Token.createMintToInstruction(
      mintKeypair.publicKey,
      minterATA,
      payer.publicKey,
      supply,
      [],
      Token.TOKEN_PROGRAM_ID,
    ),
  );

  transaction.recentBlockhash = await connection
    .getLatestBlockhash()
    .then((res) => res.blockhash);

  const txHash = await connection.sendTransaction(transaction, [
    payer,
    mintKeypair,
  ]);
  await connection.confirmTransaction(txHash, "finalized");

  return {
    mint: mintKeypair.publicKey,
    ata: minterATA,
  };
}

export function parseVaultObject(vault: any) {
  const parsed: any = {};

  for (const [key, value] of Object.entries(vault)) {
    if (value && typeof value === "object") {
      // Handle PublicKey objects
      if (value.constructor.name === "PublicKey") {
        parsed[key] = (value as PublicKey).toBase58();
      }
      // Handle BN objects
      else if (value.constructor.name === "BN") {
        parsed[key] = (value as any).toString();
      }
      // Handle arrays
      else if (Array.isArray(value)) {
        parsed[key] = value.map((item) => {
          if (item && item.constructor.name === "BN") {
            return (item as any).toString();
          }
          return item;
        });
      }
      // Handle other objects recursively
      else {
        parsed[key] = parseVaultObject(value);
      }
    } else {
      parsed[key] = value;
    }
  }

  return parsed;
}
