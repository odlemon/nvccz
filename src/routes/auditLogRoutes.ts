// @ts-nocheck
import express from "express";
import { authenticate, authorize } from "../middleware/authenticate";
import { AuditLogController } from "../controllers/AuditLogController";

const router = express.Router();

router.use(authenticate);
router.use(authorize("admin"));

router.get("/", AuditLogController.list);

export default router;
