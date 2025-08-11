// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { targetController } from "../controllers/TargetController";

const router = express.Router();

// Create target
router.post("/", authenticate, targetController.createTarget);

// Get target summary (must come before /:id to avoid conflicts)
router.get("/summary", authenticate, targetController.getTargetSummary);

// Get target by ID
router.get("/:id", authenticate, targetController.getTargetById);

// Get all targets with filtering and pagination
router.get("/", authenticate, targetController.getTargets);

// Update target
router.put("/:id", authenticate, targetController.updateTarget);

// Delete target (soft delete)
router.delete("/:id", authenticate, targetController.deleteTarget);

export default router; 