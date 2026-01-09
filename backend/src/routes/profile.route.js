import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { getMyProfile, updateMyProfile, getProfileByUserId } from "../controllers/profile.controller.js";

const router = express.Router();

router.get("/me", ...requireAuthActive, getMyProfile);
router.put("/me", ...requireAuthActive, updateMyProfile);

// staff/admin xem profile người dùng theo userId
router.get("/:userId", ...requireAuthActive, requireRole("STAFF"), getProfileByUserId);

export default router;
