import express from "express";
import {
  rebuildTodayRanking,
  getTodayRanking,
  getRankingByDate,
  previewRanking,
} from "../controllers/rankingController.js"; 
const router = express.Router();

router.post("/rebuild", rebuildTodayRanking);
router.get("/today", getTodayRanking);
router.get("/by-date", getRankingByDate);
router.get("/preview", previewRanking);

export default router;
