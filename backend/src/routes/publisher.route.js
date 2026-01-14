import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  getAllPublishers,
  getPublisherById,
  createPublisher,
  updatePublisher,
  deletePublisher
} from "../controllers/publisher.controller.js";

const router = express.Router();

router.get("/", getAllPublishers);
router.get("/:id", getPublisherById);
router.post("/", ...requireAuthActive, requireRole("STAFF"), createPublisher);
router.put("/:id", ...requireAuthActive, requireRole("STAFF"), updatePublisher);
router.delete("/:id", ...requireAuthActive, requireRole("STAFF"), deletePublisher);

export default router;