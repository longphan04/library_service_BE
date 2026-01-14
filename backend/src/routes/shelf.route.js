import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  getAllShelves,
  getShelfById,
  createShelf,
  updateShelf,
  deleteShelf
} from "../controllers/shelf.controller.js";

const router = express.Router();

router.get("/", getAllShelves);
router.get("/:id", getShelfById);
router.post("/", ...requireAuthActive, requireRole("STAFF"), createShelf);
router.put("/:id", ...requireAuthActive, requireRole("STAFF"), updateShelf);
router.delete("/:id", ...requireAuthActive, requireRole("STAFF"), deleteShelf);

export default router;