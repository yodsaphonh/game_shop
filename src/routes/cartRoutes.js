import express from "express";
import {
  addToCart,
  getCartByUser,
  removeFromCart,
  clearCart,
  checkoutCart
} from "../controllers/cartController.js";

const router = express.Router();

router.post("/add", addToCart);
router.get("/:user_id", getCartByUser);
router.delete("/remove", removeFromCart);
router.delete("/clear/:user_id", clearCart);
router.post("/checkout", checkoutCart)
export default router;
