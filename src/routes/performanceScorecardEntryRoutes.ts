// @ts-nocheck

import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";
import { PerformanceScorecardEntryController } from "../controllers/PerformanceScorecardEntryController";
import { prisma } from "../utils/database";
import { scoped, personInScope } from "../services/PerformanceScope";

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
// an employee's entries follow their scorecard: seen by the person and whoever may see them; written by a manager of them
const entryView = scoped(async (req, a) => ((await personInScope(a, req.query.employeeId)) ? null : "This scorecard is outside what your role can see."));
const entryWrite = scoped(async (req, a) => {
  let uid = req.body?.employeeId;
  if (!uid && req.params.id) uid = (await (prisma as any).performanceScorecardEntry.findUnique({ where: { id: String(req.params.id) }, select: { employeeId: true } }).catch(() => null))?.employeeId;
  if (!uid) return null;
  if (uid === a.id && !a.isAdmin) return "No one edits their own scorecard.";
  return (await personInScope(a, uid)) ? null : "Your role cannot change this person's scorecard.";
});

router.get("/", read, entryView, PerformanceScorecardEntryController.list);
router.post("/notes", write, entryWrite, PerformanceScorecardEntryController.addNote);
router.post(
  "/evidence",
  write,
  scorecardEvidenceUpload.single("file"),
  entryWrite, // after the upload parser: the employee id arrives in the multipart body
  PerformanceScorecardEntryController.addEvidence
);
router.post("/history", write, entryWrite, PerformanceScorecardEntryController.addHistory);
router.post("/publish", write, entryWrite, PerformanceScorecardEntryController.publish);
router.delete("/:id", write, entryWrite, PerformanceScorecardEntryController.remove);

export default router;
