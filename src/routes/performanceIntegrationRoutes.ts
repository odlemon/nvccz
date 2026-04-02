// @ts-nocheck

import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { PerformanceIntegrationController } from "../controllers/PerformanceIntegrationController";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     PerformanceSyncJob:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         goalId:
 *           type: string
 *         kpiId:
 *           type: string
 *           nullable: true
 *         jobType:
 *           type: string
 *           example: MANUAL_SYNC
 *         status:
 *           type: string
 *           example: COMPLETED
 *         approvalStatus:
 *           type: string
 *           nullable: true
 *         targetEndpoint:
 *           type: string
 *         attempts:
 *           type: integer
 *         errorCode:
 *           type: string
 *           nullable: true
 *         errorMessage:
 *           type: string
 *           nullable: true
 *         nextRetryAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         payloadSummary:
 *           type: object
 *           nullable: true
 *         responsePayload:
 *           type: object
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         startedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         finishedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *     PerformanceSyncRequest:
 *       type: object
 *       properties:
 *         goalId:
 *           type: string
 *           description: Target goal to sync
 *         kpiId:
 *           type: string
 *           description: Alternative KPI identifier when goalId is not supplied
 *         endpointPath:
 *           type: string
 *           description: Optional internal source path or URL. If supplied, the internal path must include /v1/.
 *           example: /api/accounting/v1/pe/portfolio-irr
 *         fieldPath:
 *           type: string
 *           description: Dot-path used to extract the numeric value from the source payload
 *           example: data.metrics.irr
 *         bearerToken:
 *           type: string
 *           description: Optional bearer token forwarded to the internal source
 *         divideBy:
 *           type: number
 *           description: Optional divisor after reading the raw number (e.g. 100 when the API returns USD as integer cents)
 *           example: 100
 *     PerformanceSyncApprovalRequest:
 *       type: object
 *       required:
 *         - goalId
 *         - comment
 *       properties:
 *         goalId:
 *           type: string
 *         approvedValue:
 *           type: number
 *         comment:
 *           type: string
 *     PerformanceSyncOverrideRequest:
 *       type: object
 *       required:
 *         - goalId
 *         - value
 *         - comment
 *       properties:
 *         goalId:
 *           type: string
 *         value:
 *           type: number
 *         comment:
 *           type: string
 *     StandardSuccessEnvelope:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *         data:
 *           type: object
 *         timestamp:
 *           type: string
 *           format: date-time
 *     StandardErrorEnvelope:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *         error:
 *           type: string
 *           nullable: true
 *         timestamp:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/performance/integration/sync:
 *   post:
 *     summary: Run a manual performance KPI sync (HTTP data source)
 *     description: |
 *       Fetches a value from an internal HTTP path (`endpointPath` must include `/v1/`; optional env base URL).
 *       For **portfolio IRR** from PE/accounting without any HTTP hop or base URL, use
 *       `POST /api/performance/integration/sync-pe-portfolio-irr` instead.
 *     tags: [Performance Integration]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceSyncRequest'
 *     responses:
 *       200:
 *         description: Performance sync completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         syncJob:
 *                           $ref: '#/components/schemas/PerformanceSyncJob'
 *                         goal:
 *                           type: object
 *       400:
 *         description: Invalid sync request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/sync", authenticate, PerformanceIntegrationController.runManualSync);

/**
 * @swagger
 * /api/performance/integration/sync-pe-portfolio-irr:
 *   post:
 *     summary: Sync portfolio IRR from PE/accounting (in-process)
 *     description: |
 *       Calculates weighted fund gross IRR via the same engine as the portfolio dashboard (6 decimal places)
 *       and updates performance goals—**no** `endpointPath`, **no** `PERFORMANCE_INTERNAL_BASE_URL`, and **no** HTTP self-call.
 *       Body requires `goalId` or `kpiId`; optional `fundId` scopes IRR to one fund.
 *       **Each affected goal** must have an IRR-linked KPI (`formulaType` `IRR` or `PORTFOLIO_IRR_PCT`, or KPI name indicating IRR); otherwise the request fails and nothing is updated.
 *     tags: [Performance Integration]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               goalId:
 *                 type: string
 *               kpiId:
 *                 type: string
 *               fundId:
 *                 type: string
 *                 description: Omit to aggregate all funds (paid-in weighted).
 *     responses:
 *       200:
 *         description: Sync completed (may be pending manager approval for high-precision KPIs)
 *       400:
 *         description: Invalid request
 */
router.post(
  "/sync-pe-portfolio-irr",
  authenticate,
  PerformanceIntegrationController.syncPePortfolioIrr
);

/**
 * @swagger
 * /api/performance/integration/jobs:
 *   get:
 *     summary: List performance sync jobs
 *     tags: [Performance Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: goalId
 *         schema:
 *           type: string
 *         description: Filter sync jobs by goal
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter sync jobs by job status
 *     responses:
 *       200:
 *         description: Performance sync jobs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PerformanceSyncJob'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/jobs", authenticate, PerformanceIntegrationController.listSyncJobs);

/**
 * @swagger
 * /api/performance/integration/approve:
 *   post:
 *     summary: Approve a pending synced KPI value
 *     tags: [Performance Integration]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceSyncApprovalRequest'
 *     responses:
 *       200:
 *         description: Pending KPI value approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *       400:
 *         description: Invalid approval request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/approve", authenticate, PerformanceIntegrationController.approvePendingSync);

/**
 * @swagger
 * /api/performance/integration/override:
 *   post:
 *     summary: Override an automated KPI value
 *     description: Allows a department manager, HR leader, or CEO to override an automated KPI. A comment is mandatory.
 *     tags: [Performance Integration]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceSyncOverrideRequest'
 *     responses:
 *       200:
 *         description: Automated KPI value overridden successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *       400:
 *         description: Invalid override request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/override", authenticate, PerformanceIntegrationController.overrideAutomatedGoal);

/**
 * @swagger
 * /api/performance/integration/import:
 *   post:
 *     summary: Import KPI targets in bulk
 *     tags: [Performance Integration]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Goal targets imported successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         fileName:
 *                           type: string
 *                         updated:
 *                           type: integer
 *                         skipped:
 *                           type: integer
 *                         results:
 *                           type: array
 *                           items:
 *                             type: object
 *       400:
 *         description: Missing or invalid import file
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/import", authenticate, upload.single("file"), PerformanceIntegrationController.importGoalTargets);

export default router;
