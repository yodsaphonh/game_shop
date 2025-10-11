import express from "express";
import { 
    getUserActivityByAdmin, 
    createDiscountByAdmin,
    getAllDiscountsByAdmin,
    updateDiscountByAdmin,
    deleteDiscountByAdmin

} from "../controllers/adminController.js";

const router = express.Router();

router.post("/user-history", getUserActivityByAdmin);

router.post("/discounts/create", createDiscountByAdmin);
router.post("/discounts/list", getAllDiscountsByAdmin);
router.post("/discounts/update", updateDiscountByAdmin);
router.post("/discounts/delete", deleteDiscountByAdmin);

export default router;
