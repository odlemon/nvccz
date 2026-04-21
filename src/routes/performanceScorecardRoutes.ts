// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { PerformanceScorecardController } from "../controllers/PerformanceScorecardController";

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     PerformanceScorecardPeriodRequest:
 *       type: object
 *       properties:
 *         periodStart:
 *           type: string
 *           format: date-time
 *         periodEnd:
 *           type: string
 *           format: date-time
 *         periodLabel:
 *           type: string
 *         sectionBlendMode:
 *           type: string
 *           enum: [redistribute, penalise]
 *           description: CEO/Board contract scorecard only. Default redistribute — omit non-scoreable sections from the final blend and re-normalise weights; penalise retains legacy behaviour (zero-weight sections still drag the final score).
 *     PerformanceScorecardEnvelope:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             scorecardType:
 *               type: string
 *             employee:
 *               type: object
 *               nullable: true
 *             department:
 *               type: string
 *               nullable: true
 *             goals:
 *               type: array
 *               items:
 *                 type: object
 *             sections:
 *               type: array
 *               items:
 *                 type: object
 *             scores:
 *               type: object
 *             warnings:
 *               type: array
 *               items:
 *                 type: string
 *             document:
 *               type: object
 *             savedRecord:
 *               type: object
 *               nullable: true
 *         timestamp:
 *           type: string
 *           format: date-time
 *     CEOPerformanceScorecardEnvelope:
 *       type: object
 *       description: >
 *         CEO scorecard payload (GET/POST). `data` includes access (canView/canGenerate; both true for any
 *         authenticated user — role gating is client-side), ceo, contract, nested sections A1–D with indicators,
 *         agreedRatingsSummary (including TOTAL), scores (sectionScores, sectionBlendScore, optional budgetScore,
 *         finalScore, performanceLabel), document (header, sectionTables, qualitativeSections.personalAttributes
 *         rating grid, signatureBlock), warnings, and savedRecord when persisted.
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             scorecardType:
 *               type: string
 *               example: CEO
 *             access:
 *               type: object
 *               properties:
 *                 canView:
 *                   type: boolean
 *                 canGenerate:
 *                   type: boolean
 *             ceo:
 *               type: object
 *               properties:
 *                 id: { type: string, nullable: true }
 *                 name: { type: string, nullable: true }
 *                 title: { type: string }
 *             contract:
 *               type: object
 *             sections:
 *               type: object
 *               additionalProperties: true
 *             agreedRatingsSummary:
 *               type: array
 *               items:
 *                 type: object
 *             scores:
 *               type: object
 *             warnings:
 *               type: array
 *               items:
 *                 type: string
 *             document:
 *               type: object
 *             savedRecord:
 *               type: object
 *               nullable: true
 *         timestamp:
 *           type: string
 *           format: date-time
 *     PerformanceOrgBscEnvelope:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             viewType:
 *               type: string
 *               example: ORG_BSC
 *             organisationName:
 *               type: string
 *             reviewPeriod:
 *               type: string
 *             periodStart:
 *               type: string
 *             periodEnd:
 *               type: string
 *             lastUpdated:
 *               type: string
 *             ceoVision:
 *               type: object
 *               properties:
 *                 statement: { type: string, nullable: true }
 *                 strategyDocumentUrl: { type: string, nullable: true }
 *             orgBscScore:
 *               type: number
 *             orgBscStatus:
 *               type: string
 *               enum: [GREEN, AMBER, RED]
 *             warnings:
 *               type: array
 *               items: { type: string }
 *             alerts:
 *               type: array
 *               items:
 *                 type: object
 *             overallScore:
 *               type: number
 *             pillars:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   trendVsPreviousPeriod:
 *                     type: number
 *                     nullable: true
 *                     description: Reserved for future period-over-period pillar trend; null until implemented.
 *             access:
 *               type: object
 *               properties:
 *                 canView: { type: boolean }
 *                 drillDownToDepartment:
 *                   type: boolean
 *                 drillDownToIndividual:
 *                   type: boolean
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
 *         code:
 *           type: string
 *           nullable: true
 *           description: Machine-readable error code when present (e.g. FORBIDDEN, BOARD_CONTRACT_NOT_FOUND)
 *         timestamp:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/performance/scorecards/user:
 *   get:
 *     summary: Preview the current user's employee scorecard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User scorecard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
/**
 * @swagger
 * /api/performance/scorecards/employees-for-generation:
 *   get:
 *     summary: List employees who have an EMPLOYEE performance contract for the period (excludes CEO)
 *     description: Use when choosing who can receive an individual/employee scorecard. Same period query as other scorecard endpoints.
 *     tags: [Updated performance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodStart
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: periodEnd
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: periodLabel
 *         schema: { type: string, example: "2026" }
 *     responses:
 *       200:
 *         description: OK — data.period and data.employees[]
 */
router.get(
  "/employees-for-generation",
  PerformanceScorecardController.listEmployeesForScorecardGeneration
);

router.get("/user", PerformanceScorecardController.getUserScorecard);

/**
 * @swagger
 * /api/performance/scorecards/employee/{employeeId}:
 *   get:
 *     summary: Preview an employee scorecard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Employee scorecard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       404:
 *         description: Employee or contract not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/employee/:employeeId", PerformanceScorecardController.getEmployeeScorecard);

/**
 * @swagger
 * /api/performance/scorecards/employee/{employeeId}/generate:
 *   post:
 *     summary: Persist an employee scorecard draft
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceScorecardPeriodRequest'
 *     responses:
 *       201:
 *         description: Employee scorecard generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/employee/:employeeId/generate", PerformanceScorecardController.generateEmployeeScorecard);

/**
 * @swagger
 * /api/performance/scorecards/department/{department}:
 *   get:
 *     summary: Preview a department scorecard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: department
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *       - in: query
 *         name: departmentId
 *         description: When set, resolves the department by id instead of the path segment
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Department scorecard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
/**
 * @swagger
 * /api/performance/scorecards/department/by-id/{departmentId}:
 *   get:
 *     summary: Preview a department scorecard by department id
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Department scorecard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 */
/**
 * @swagger
 * /api/performance/scorecards/department/by-id/{departmentId}/generate:
 *   post:
 *     summary: Persist a department scorecard draft by department id
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: departmentId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceScorecardPeriodRequest'
 *     responses:
 *       201:
 *         description: Department scorecard generated successfully
 */
router.get(
  "/department/by-id/:departmentId",
  PerformanceScorecardController.getDepartmentScorecardById
);
router.post(
  "/department/by-id/:departmentId/generate",
  PerformanceScorecardController.generateDepartmentScorecardById
);
router.get("/department/:department", PerformanceScorecardController.getDepartmentScorecard);

/**
 * @swagger
 * /api/performance/scorecards/department/{department}/generate:
 *   post:
 *     summary: Persist a department scorecard draft
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: department
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/PerformanceScorecardPeriodRequest'
 *               - type: object
 *                 properties:
 *                   departmentId:
 *                     type: string
 *                     description: When set, resolves department by id (overrides path department name)
 *     responses:
 *       201:
 *         description: Department scorecard generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/department/:department/generate", PerformanceScorecardController.generateDepartmentScorecard);

/**
 * @swagger
 * /api/performance/scorecards/ceo:
 *   get:
 *     summary: Preview the CEO scorecard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *       - in: query
 *         name: sectionBlendMode
 *         schema:
 *           type: string
 *           enum: [redistribute, penalise]
 *     responses:
 *       200:
 *         description: CEO scorecard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CEOPerformanceScorecardEnvelope'
 *       400:
 *         description: Bad request (e.g. cannot persist without subject user, or finalised scorecard exists on generate)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       403:
 *         description: Not authenticated (Bearer token required)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       404:
 *         description: No CEO performance contract for the period; response body may include error code CEO_CONTRACT_NOT_FOUND
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/ceo", PerformanceScorecardController.getCEOScorecard);

/**
 * @swagger
 * /api/performance/scorecards/ceo/generate:
 *   post:
 *     summary: Persist a CEO scorecard draft
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceScorecardPeriodRequest'
 *     responses:
 *       201:
 *         description: CEO scorecard generated successfully (draft upsert)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CEOPerformanceScorecardEnvelope'
 *       400:
 *         description: Bad request (e.g. no indicators linked to CEO contract on save, finalised scorecard exists, contract missing subject user)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       403:
 *         description: Not authenticated (Bearer token required)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       404:
 *         description: No CEO performance contract for the period; response body may include error code CEO_CONTRACT_NOT_FOUND
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/ceo/generate", PerformanceScorecardController.generateCEOScorecard);

/**
 * @swagger
 * /api/performance/scorecards/board:
 *   get:
 *     summary: Preview the Board scorecard (authenticated users; role gating is client-side)
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *       - in: query
 *         name: sectionBlendMode
 *         schema:
 *           type: string
 *           enum: [redistribute, penalise]
 *     responses:
 *       200:
 *         description: Board scorecard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Unauthenticated request rejected by service layer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       404:
 *         description: No BOARD contract for the period (code BOARD_CONTRACT_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/board", PerformanceScorecardController.getBoardScorecard);

/**
 * @swagger
 * /api/performance/scorecards/board/generate:
 *   post:
 *     summary: Persist a Board scorecard draft (authenticated users)
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceScorecardPeriodRequest'
 *     responses:
 *       201:
 *         description: Board scorecard generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       400:
 *         description: e.g. no indicators on contract, or finalised scorecard already exists
 *       403:
 *         description: Unauthenticated request rejected by service layer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       404:
 *         description: No BOARD contract (BOARD_CONTRACT_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/board/generate", PerformanceScorecardController.generateBoardScorecard);

/**
 * @swagger
 * /api/performance/scorecards/org-bsc:
 *   get:
 *     summary: Live organisational BSC dashboard (authenticated users)
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organisational BSC dashboard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceOrgBscEnvelope'
 *       403:
 *         description: Unauthenticated request rejected by service layer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/org-bsc", PerformanceScorecardController.getOrgBSCDashboard);

/**
 * @swagger
 * /api/performance/scorecards/{scorecardId}/finalize:
 *   post:
 *     summary: Finalize and lock a generated scorecard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scorecardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Scorecard finalised successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       404:
 *         description: Scorecard not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/:scorecardId/finalize", PerformanceScorecardController.finalizeScorecard);

export default router;
