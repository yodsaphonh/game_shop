import express from "express";
import {
  getWalletBalance,
  depositToWallet,
  withdrawFromWallet,
  getWalletHistory,
  adminViewUserHistory,
  purchaseGame
} from "../controllers/walletController.js";

const router = express.Router();

// ✅ แสดงยอดเงินคงเหลือ
router.get("/:user_id", getWalletBalance);

// ✅ เติมเงิน
router.post("/deposit", depositToWallet);

// ✅ ถอนเงิน
router.post("/withdraw", withdrawFromWallet);

// ✅ ประวัติการทำธุรกรรม
router.get("/history/:user_id", getWalletHistory);
// admin ดูประวัติการทำธุรกรรม ของ user
router.post("/admin/history", adminViewUserHistory);

router.post("/purchase", purchaseGame);
export default router;
