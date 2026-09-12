// @ts-nocheck

import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";
import { PerformanceScorecardEntryController } from "../controllers/PerformanceScorecardEntryController";

const router = express.Router();

const scorecardEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use(authenticate);

// Reuses the performance.scorecards.* keys already granted by
// scripts/run-performance-role-permissions-migration.ts — this is scorecard-scoped workspace
// data, not a new domain, so it does not need its own permission pair.
const read = requireAnyPermission(["performance.scorecards.view", "performance.scorecards.manage"]);
const write = requireAnyPermission(["performance.scorecards.manage"]);

router.get("/", read, PerformanceScorecardEntryController.list);
router.post("/notes", write, PerformanceScorecardEntryController.addNote);
router.post(
  "/evidence",
  write,
  scorecardEvidenceUpload.single("file"),
  PerformanceScorecardEntryController.addEvidence
);
router.post("/history", write, PerformanceScorecardEntryController.addHistory);
router.post("/publish", write, PerformanceScorecardEntryController.publish);
router.delete("/:id", write, PerformanceScorecardEntryController.remove);

export default router;
