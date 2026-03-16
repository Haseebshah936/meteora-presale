import express from "express";
import {
  claimTokensFromAlphaVault,
  depositToAlphaVault,
  getAlphaVaultInfo,
  getEscrowInfo,
  withdrawFromAlphaVault,
} from "../controller/alpha-vault";

const alphaVaultRouter = express.Router();

alphaVaultRouter.get("/", getAlphaVaultInfo);

alphaVaultRouter.post("/escrow", getEscrowInfo);

alphaVaultRouter.post("/deposit", depositToAlphaVault);

alphaVaultRouter.post("/claim-tokens", claimTokensFromAlphaVault);

alphaVaultRouter.post("/withdraw", withdrawFromAlphaVault);

export default alphaVaultRouter;
