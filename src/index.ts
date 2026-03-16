import { clusterApiUrl, Connection } from "@solana/web3.js";
import config from "./config";
import {
  createCustomizableDammV2WithPermissionlessVault,
  fillVaultWithDammV2,
  getAlphaVaultInfo,
} from "./DAMMV2_AlphaVault";
import {
  createCustomizableDlmmWithPermissionlessVault,
  depositToAlphaVault,
} from "./DLLM_AlphaVault";
import BN from "bn.js";
import cors from "cors";
import express from "express";
import alphaVaultRouter from "./routes/alpha-vault";

/**
 * NOTE: Function to create damm v2 with permissionless vault
//  */
// createCustomizableDammV2WithPermissionlessVault(
//   config.connection,
//   config.walletKeyPair,
// )
//   .then(() => {
//     console.log("Done");
//   })
//   .catch(console.error);


// NOTE: This will get the alpha vault info
getAlphaVaultInfo(
  config.connection,
  config.poolAddress,
  config.walletKeyPair,
)
  .then(() => {
    console.log("Done");
  })
  .catch(console.error);

// NOTE: Function to crank the Alpha Vault
// fillVaultWithDammV2()
//   .then(() => {
//     console.log("Done");
//   })
//   .catch(console.error);

const app = express();

const allowedOrigins = [
  'https://critters.quest',
  'https://blinks.critters.quest',
  'https://genesis-quest.critters.quest',
  'https://blind-box-claim.critters.quest',
  'https://localhost:3001',
  'https://localhost:3075',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3075'
];

// CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true); // Allow the request
    } else {
      callback(new Error('Not allowed by CORS')); // Reject the request
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed HTTP methods
  credentials: true, // If you need to allow credentials like cookies
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api/alpha-vault", alphaVaultRouter);

app.listen(5003, () => {
  console.log("Server started on port 5003");
});

