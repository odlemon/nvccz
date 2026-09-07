// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";
import { timesheetController } from "../controllers/TimesheetController";

const router = express.Router();

router.use(authenticate);

// "view" covers self-service (own timesheet + own entries); "manage" additionally covers
// approving/returning other users' timesheets and the Projects catalog (see projectRoutes.ts).
const SELF_SERVICE = ["accounting.timesheets.view", "accounting.timesheets.manage", "manage_accounting"];
const MANAGE_ONLY = ["accounting.timesheets.manage", "manage_accounting"];

router.get("/mine", requireAnyPermission(SELF_SERVICE), timesheetController.mine);
router.get("/pending-approval", requireAnyPermission(MANAGE_ONLY), timesheetController.pendingApproval);
router.post("/:weekEnding/entries", requireAnyPermission(SELF_SERVICE), timesheetController.upsertEntry);
router.post("/:id/submit", requireAnyPermission(SELF_SERVICE), timesheetController.submit);
router.post("/:id/approve", requireAnyPermission(MANAGE_ONLY), timesheetController.approve);
router.post("/:id/return", requireAnyPermission(MANAGE_ONLY), timesheetController.returnTimesheet);

export default router;
