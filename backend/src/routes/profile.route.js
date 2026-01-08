import express from "express";
// import {getProfileByUserId, updateProfile} from "../controllers/profile.controller.js"
import * as profileController from "../controllers/profile.controller.js";

const router = express.Router();

/* ========= PROFILE ========= */

// lấy profile theo id
router.get("/:userId", profileController.getMyProfile);

router.put("/:userId", profileController.updateProfile);

export default router;
