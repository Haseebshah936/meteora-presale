import { Connection, Keypair } from "@solana/web3.js";
import dotenv from "dotenv";
import path from "path";
import bs58 from "bs58";

// Load environment variables from .env file
dotenv.config();

interface Config {
  env: string;
  port: number;
  apiVersion: string;
  logLevel: string;
  rpcUrl: string;
  meteoraRpcUrl: string;
  walletKeyPair: Keypair;
  connection: Connection;
  vaultAddress: string;
  poolAddress: string;
}

const config: Config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  apiVersion: process.env.API_VERSION || "v1",
  logLevel: process.env.LOG_LEVEL || "info",
  rpcUrl: process.env.RPC_URL || "",
  meteoraRpcUrl: process.env.METEORA_RPC_URL || "",
  walletKeyPair: Keypair.fromSecretKey(
    bs58.decode(process.env.WALLET_KEYPAIR || ""),
  ),
  connection: new Connection(process.env.RPC_URL || ""),
  vaultAddress: process.env.VAULT_ADDRESS || "",
  poolAddress: process.env.POOL_ADDRESS || "",
};

export default config;
