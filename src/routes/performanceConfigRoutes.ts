// @ts-nocheck

import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"
import { PerformanceConfigController } from "../controllers/PerformanceConfigController";

const router = express.Router();
const READ_KEYS = ["performance.config.view", "performance.config.manage"]
const WRITE_KEYS = ["performance.config.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)
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
 *     PerformancePillarConfigResponse:
 *       type: object
 *       properties:
 *         strategyId:
 *           type: string
 *           nullable: true
 *         visionStatement:
 *           type: string
 *           nullable: true
 *         strategyDocumentUrl:
 *           type: string
 *           nullable: true
 *         pillars:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Financial
 *               weight:
 *                 type: number
 *                 example: 25
 *               nonDeletable:
 *                 type: boolean
 *                 example: true
 *     PerformanceStrategy:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         title:
 *           type: string
 *         periodStart:
 *           type: string
 *           format: date-time
 *         periodEnd:
 *           type: string
 *           format: date-time
 *         strategicGoalId:
 *           type: string
 *           nullable: true
 *         strategyDocumentUrl:
 *           type: string
 *           nullable: true
 *         visionStatement:
 *           type: string
 *           nullable: true
 *         pillarWeights:
 *           type: object
 *           properties:
 *             Financial:
 *               type: number
 *             Customer & Market:
 *               type: number
 *             Internal Operations:
 *               type: number
 *             Learning, Growth & HR:
 *               type: number
 *         metadata:
 *           type: object
 *           nullable: true
 *         status:
 *           type: string
 *           example: ACTIVE
 *         archivedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *     PerformanceTheme:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         color:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           example: ACTIVE
 *     PerformanceGoalConfigUpdateRequest:
 *       type: object
 *       properties:
 *         scorecardPillar:
 *           type: string
 *           enum: [Financial, Customer & Market, Internal Operations, Learning, Growth & HR]
 *         scorecardWeight:
 *           type: number
 *           example: 35
 *         strategyId:
 *           type: string
 *         strategicThemeId:
 *           type: string
 *         targetValue:
 *           type: number
 *         preciseTargetValue:
 *           type: number
 *         targetChangeReason:
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
 * /performance/config/vision-statement:
 *   get:
 *     operationId: getPerformanceConfigVisionStatement
 *     summary: Get CEO / organisational vision text only
 *     description: Returns `visionStatement` and `strategyId` from the **active** performance strategy (same source as UAT “line of sight”). Lighter than GET /performance/config/pillars.
 *     tags: [Performance UAT (Balanced Scorecard)]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
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
 *                         strategyId:
 *                           type: string
 *                           nullable: true
 *                         visionStatement:
 *                           type: string
 *                           nullable: true
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/vision-statement", authenticate, guard, PerformanceConfigController.getVisionStatement);

/**
 * @swagger
 * /performance/config/pillars:
 *   get:
 *     summary: Get the fixed Balanced Scorecard pillar configuration
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pillar configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PerformancePillarConfigResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/pillars", authenticate, guard, PerformanceConfigController.getPillars);

/**
 * @swagger
 * /performance/config/strategies:
 *   get:
 *     summary: List performance strategies
 *     description: Each item includes strategyDocumentUrl when a strategy PDF was uploaded (same remote URL as portfolio documents; use GET on that URL in a browser or client to download).
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeArchived
 *         schema:
 *           type: boolean
 *           default: true
 *         description: |
 *           **false** — only strategies used for **active** performance tracking and strategy pickers
 *           (excludes `ARCHIVED` / any row with `archivedAt` set). UAT: after archiving “2023 Strategy Cycle”,
 *           it must **not** appear when this is false.
 *           **true** (default) — all strategies, active and archived.
 *           For **archived-only** lists, prefer **GET /performance/config/strategies/archives** (historical read-only section).
 *     responses:
 *       200:
 *         description: Strategies retrieved successfully
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
 *                         $ref: '#/components/schemas/PerformanceStrategy'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *   post:
 *     summary: Create a performance strategy and store pillar weights
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - periodStart
 *               - periodEnd
 *               - pillarWeights
 *             properties:
 *               title:
 *                 type: string
 *                 example: 2026-2028 Corporate Strategy
 *               periodStart:
 *                 type: string
 *                 format: date-time
 *               periodEnd:
 *                 type: string
 *                 format: date-time
 *               strategicGoalId:
 *                 type: string
 *               strategyDocumentUrl:
 *                 type: string
 *               visionStatement:
 *                 type: string
 *               pillarWeights:
 *                 type: object
 *                 required:
 *                   - Financial
 *                   - Customer & Market
 *                   - Internal Operations
 *                   - Learning, Growth & HR
 *                 properties:
 *                   Financial:
 *                     type: number
 *                     example: 25
 *                   Customer & Market:
 *                     type: number
 *                     example: 25
 *                   Internal Operations:
 *                     type: number
 *                     example: 25
 *                   Learning, Growth & HR:
 *                     type: number
 *                     example: 25
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *     responses:
 *       200:
 *         description: Strategy saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PerformanceStrategy'
 *       400:
 *         description: Validation failure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/strategies", authenticate, guard, PerformanceConfigController.listStrategies);
router.post("/strategies", authenticate, guard, PerformanceConfigController.upsertStrategy);

/**
 * @swagger
 * /performance/config/strategies/archives:
 *   get:
 *     summary: List historical (archived) strategies only
 *     description: |
 *       Read-only **PerformanceStrategy** rows where the cycle was archived (`status: ARCHIVED` or `archivedAt` set).
 *       For the UAT “Historical Archives” area; does not drive active pillars / dashboards (those use the current **ACTIVE** strategy only).
 *       For mixed lists, use **GET /performance/config/strategies**; for **active-only** pickers, use that with **includeArchived=false**.
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Archived strategies retrieved successfully
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
 *                         $ref: '#/components/schemas/PerformanceStrategy'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/strategies/archives", authenticate, guard, PerformanceConfigController.listArchivedStrategies);

/**
 * @swagger
 * /performance/config/strategies/{id}:
 *   get:
 *     summary: Get one performance strategy by id
 *     description: Returns full strategy including strategyDocumentUrl (remote URL for PDF download when set).
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Strategy retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PerformanceStrategy'
 *       404:
 *         description: Strategy not found
 *       401:
 *         description: Unauthorized
 */
router.get("/strategies/:id", authenticate, guard, PerformanceConfigController.getStrategyById);

/**
 * @swagger
 * /performance/config/strategies/{id}:
 *   put:
 *     summary: Update a performance strategy
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               periodStart:
 *                 type: string
 *                 format: date-time
 *               periodEnd:
 *                 type: string
 *                 format: date-time
 *               strategicGoalId:
 *                 type: string
 *               strategyDocumentUrl:
 *                 type: string
 *               visionStatement:
 *                 type: string
 *               pillarWeights:
 *                 type: object
 *                 properties:
 *                   Financial:
 *                     type: number
 *                   Customer & Market:
 *                     type: number
 *                   Internal Operations:
 *                     type: number
 *                   Learning, Growth & HR:
 *                     type: number
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *     responses:
 *       200:
 *         description: Strategy updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PerformanceStrategy'
 *       400:
 *         description: Validation failure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       404:
 *         description: Strategy not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.put("/strategies/:id", authenticate, guard, PerformanceConfigController.upsertStrategy);

/**
 * @swagger
 * /performance/config/strategies/{id}/archive:
 *   post:
 *     summary: Archive a strategy and make it read-only
 *     description: |
 *       UAT **Archive** action: sets `status` to **ARCHIVED** and `archivedAt`. The strategy drops out of
 *       **GET /performance/config/strategies?includeArchived=false** (active pickers) and **pillar / vision** resolution,
 *       which only use a current **ACTIVE** non-archived strategy. View archived cycles under **GET …/strategies/archives**.
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Strategy archived successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PerformanceStrategy'
 *       404:
 *         description: Strategy not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/strategies/:id/archive", authenticate, guard, PerformanceConfigController.archiveStrategy);

/**
 * @swagger
 * /performance/config/strategies/{id}/document:
 *   post:
 *     summary: Upload a strategy document PDF
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Strategy document uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PerformanceStrategy'
 *       400:
 *         description: Missing or invalid upload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/strategies/:id/document", authenticate, guard, upload.single("file"), PerformanceConfigController.uploadStrategyDocument);

/**
 * @swagger
 * /performance/config/themes:
 *   get:
 *     summary: List active strategic themes
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Themes retrieved successfully
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
 *                         $ref: '#/components/schemas/PerformanceTheme'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *   post:
 *     summary: Create a strategic theme
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Market Expansion
 *               description:
 *                 type: string
 *               color:
 *                 type: string
 *                 example: '#0A7C86'
 *     responses:
 *       200:
 *         description: Theme saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardSuccessEnvelope'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PerformanceTheme'
 *       400:
 *         description: Validation failure
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/themes", authenticate, guard, PerformanceConfigController.listThemes);
router.post("/themes", authenticate, guard, PerformanceConfigController.createTheme);

/**
 * @swagger
 * /performance/config/themes/{id}/goals:
 *   get:
 *     summary: Get goals currently mapped to a strategic theme
 *     description: |
 *       Returns the **same goal shape** as **GET /performance/goals?strategicThemeId=** (includes `strategicTheme`
 *       with name/color/description, `scorecardPillar`, `pillarId`, `departmentName`, `type`, KPI, parent, subGoals, etc.)
 *       so org vs department views can filter consistently.
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Theme goal mapping retrieved successfully
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
 *                         type: object
 *       404:
 *         description: Theme not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *   post:
 *     summary: Tag one or more goals with a strategic theme
 *     description: Response `data` lists the tagged goals with the **same full includes** as GET (KPI, pillar, theme, etc.).
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - goalIds
 *             properties:
 *               goalIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Goals tagged successfully
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
 *                         type: object
 *       400:
 *         description: Invalid theme mapping request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/themes/:id/goals", authenticate, guard, PerformanceConfigController.getGoalsByTheme);
router.post("/themes/:id/goals", authenticate, guard, PerformanceConfigController.tagGoalsWithTheme);

/**
 * @swagger
 * /performance/config/goals/{goalId}:
 *   put:
 *     summary: Update goal scorecard and strategy metadata
 *     tags: [Performance Config]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceGoalConfigUpdateRequest'
 *     responses:
 *       200:
 *         description: Goal scorecard configuration updated successfully
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
 *         description: Invalid config update
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       404:
 *         description: Goal not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.put("/goals/:goalId", authenticate, guard, PerformanceConfigController.updateGoalScorecardConfig);

export default router;
