import express from "express";
import AccountingCloseTaskController from "../controllers/AccountingCloseTaskController";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/permissionAuth";

const router = express.Router();

router.use(authenticate);

router.get(
  "/periods/:fiscalPeriodId/tasks",
  requirePermission("accounting.period_lock.view"),
  AccountingCloseTaskController.listTasks
);

router.post(
  "/periods/:fiscalPeriodId/tasks",
  requirePermission("accounting.period_lock.manage"),
  AccountingCloseTaskController.createTask
);

router.patch(
  "/tasks/:taskId",
  requirePermission("accounting.period_lock.manage"),
  AccountingCloseTaskController.updateTaskStatus
);

router.get(
  "/periods/:fiscalPeriodId/can-lock",
  requirePermission("accounting.period_lock.view"),
  AccountingCloseTaskController.canLock
);

export default router;
