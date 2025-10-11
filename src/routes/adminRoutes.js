import express from "express";
import { getUserActivityByAdmin } from "../controllers/adminController.js";

const router = express.Router();

router.post("/user-history", getUserActivityByAdmin);

export default router;
