import express from "express";
import AccountingCloseTaskController from "../controllers/AccountingCloseTaskController";
import { authenticate } from "../middleware/authenticate";
import { requirePermission, requireAnyPermission } from "../middleware/permissionAuth";

const router = express.Router();

router.use(authenticate);

// reading a month's checklist: anyone in accounting; changing it: the period manager (or a task's owner, below)
router.get(
  "/periods/:fiscalPeriodId/tasks",
  requireAnyPermission(["accounting.period_lock.view", "accounting.period_lock.manage", "view_accounting"]),
  AccountingCloseTaskController.listTasks
);

router.post(
  "/periods/:fiscalPeriodId/tasks",
  requirePermission("accounting.period_lock.manage"),
  AccountingCloseTaskController.createTask
);

// the period manager, or the task's owner working their own task (the controller tells them apart)
router.patch(
  "/tasks/:taskId",
  requireAnyPermission(["accounting.period_lock.manage", "manage_accounting"]),
  AccountingCloseTaskController.updateTaskStatus
);

router.get(
  "/periods/:fiscalPeriodId/readiness",
  requireAnyPermission(["accounting.period_lock.view", "accounting.period_lock.manage", "view_accounting"]),
  AccountingCloseTaskController.readiness
);

router.post(
  "/periods/:fiscalPeriodId/tasks/standard",
  requirePermission("accounting.period_lock.manage"),
  AccountingCloseTaskController.addStandard
);

router.get(
  "/periods/:fiscalPeriodId/can-lock",
  requirePermission("accounting.period_lock.view"),
  AccountingCloseTaskController.canLock
);

export default router;
