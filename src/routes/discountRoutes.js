// routes/discountRoutes.js
import express from "express";
import {
  getAllDiscounts
} from "../controllers/discountController.js"; 
const router = express.Router();

/* ------------------------------------ 👥 USER ------------------------------------ */
router.get("/available", getAllDiscounts);

export default router;
