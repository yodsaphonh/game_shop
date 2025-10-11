import express from "express";
import upload from "../middlewares/uploadMiddleware.js";
import {
  getAllUsers,
  getUserById,
  registerUser,
  loginUser,
  updateUser,
} from "../controllers/userController.js";

const router = express.Router();

router.get("/", getAllUsers);
router.get("/:id", getUserById);
router.post("/register", upload.single("avatar"), registerUser);
router.post("/login", loginUser);
router.post("/update", upload.single("avatar"), updateUser);
export default router;
