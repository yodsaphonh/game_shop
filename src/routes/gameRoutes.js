import express from "express";
import upload from "../middlewares/uploadMiddleware.js";
import {
  createGame,
  getAllGames,
  getGameById,
  updateGame,
  deleteGame,
  searchGames,
  getAllGameCategories
} from "../controllers/gameController.js";

const router = express.Router();


/* ======================================================
                      Routes All User
   ====================================================== */
router.get("/search", searchGames);
router.get("/categories", getAllGameCategories);

/* ======================================================
                      Routes Admin
   ====================================================== */

// ✅ CREATE — ต้องเป็น Admin เท่านั้น
router.post("/", upload.single("cover"), createGame);

// ✅ READ (All Games)
router.get("/", getAllGames);

// ✅ READ (Single Game by ID)
router.get("/:id", getGameById);

// ✅ UPDATE — ต้องเป็น Admin เท่านั้น
router.post("/update", upload.single("cover"), updateGame);

// ✅ DELETE — ต้องเป็น Admin เท่านั้น
router.delete("/:id", deleteGame);

export default router;
