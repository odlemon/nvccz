// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";
import { AuditLogController } from "../controllers/AuditLogController";

const router = express.Router();

router.use(authenticate);
router.get(
  "/",
  requireAnyPermission([
    "manage_accounting",
    "view_accounting",
    "accounting.period_lock.audit_view",
  ]),
  AuditLogController.list
);

export default router;
