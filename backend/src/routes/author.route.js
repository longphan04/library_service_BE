import express from "express";
import { requireAuthActive } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  getAllAuthors,
  getAuthorById,
  createAuthor,
  updateAuthor,
  deleteAuthor
} from "../controllers/author.controller.js";

const router = express.Router();

router.get("/", getAllAuthors);
router.get("/:id", getAuthorById);
router.post("/", ...requireAuthActive, requireRole("STAFF"), createAuthor);
router.put("/:id", ...requireAuthActive, requireRole("STAFF"), updateAuthor);
router.delete("/:id", ...requireAuthActive, requireRole("STAFF"), deleteAuthor);

export default router;