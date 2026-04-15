import express from "express";
import FiscalCalendarController from "../controllers/FiscalCalendarController";
import { authenticate } from "../middleware/authenticate";
import {
  requireAnyPermission,
  requirePermission,
} from "../middleware/permissionAuth";

const router = express.Router();

router.use(authenticate);

router.get(
  "/",
  requireAnyPermission([
    "accounting.period_lock.view",
    "accounting.period_lock.manage",
    "manage_accounting",
  ]),
  FiscalCalendarController.getCalendar
);

router.put(
  "/locks/draft",
  requirePermission("accounting.period_lock.manage"),
  FiscalCalendarController.putLocksDraft
);

router.post(
  "/locks/commit",
  requirePermission("accounting.period_lock.manage"),
  FiscalCalendarController.postLocksCommit
);

router.get(
  "/period-lock/audit",
  requireAnyPermission(["accounting.period_lock.audit_view", "accounting.period_lock.manage"]),
  FiscalCalendarController.getAudit
);

router.get(
  "/posting-exceptions",
  requireAnyPermission([
    "accounting.period_lock.view",
    "accounting.period_lock.manage",
    "manage_accounting",
  ]),
  FiscalCalendarController.getExceptions
);

router.patch(
  "/policy",
  requirePermission("accounting.period_lock.manage"),
  FiscalCalendarController.patchPolicy
);

export default router;
