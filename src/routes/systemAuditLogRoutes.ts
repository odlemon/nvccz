// @ts-nocheck
/**
 * System Audit Log (Activity Log) routes.
 * Endpoints to view login, record creation, and report export with user and IP.
 */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { SystemAuditLogController } from "../controllers/SystemAuditLogController";

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * /api/system-audit-log:
 *   get:
 *     summary: Get system audit log (activity log)
 *     description: Returns login, record creation, and report export events with user and IP. Default last 24 hours.
 *     tags: [System Audit Log]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hours
 *         schema:
 *           type: integer
 *           default: 24
 *         description: Time window in hours from now (1-168)
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [LOGIN, CREATE, REPORT_EXPORT, UPDATE, DELETE, POST, VOID]
 *         description: Filter by action
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *         description: Filter by entity type (e.g. User, JournalEntry)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 200
 *         description: Max entries to return (max 500)
 *     responses:
 *       200:
 *         description: System audit log with entries (user and IP per entry)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", SystemAuditLogController.getSystemAuditLog);

/**
 * @swagger
 * /api/system-audit-log/last-24-hours:
 *   get:
 *     summary: Get system audit log for last 24 hours
 *     description: Convenience endpoint for last 24 hours of activity (login, record creation, report export) with user and IP.
 *     tags: [System Audit Log]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Last 24 hours audit log
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/last-24-hours", SystemAuditLogController.getLast24Hours);

export default router;
