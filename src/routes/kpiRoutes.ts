// @ts-nocheck
import express from "express";
import { KPIController } from "../controllers/KPIController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     KPI:
 *       type: object
 *       required:
 *         - name
 *         - type
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the KPI
 *         name:
 *           type: string
 *           description: KPI name
 *         type:
 *           type: string
 *           enum: [Metric, Percentage]
 *           description: KPI type
 *         branch:
 *           type: string
 *           description: Branch association
 *         weightValue:
 *           type: number
 *           description: Weight value for the KPI
 *         hasUnit:
 *           type: boolean
 *           description: Whether the KPI has a unit
 *         unitCategory:
 *           type: string
 *           description: Unit category
 *         unit:
 *           type: string
 *           description: Unit name
 *         unitSymbol:
 *           type: string
 *           description: Unit symbol
 *         unitPosition:
 *           type: string
 *           enum: [prefix, suffix]
 *           description: Unit position
 *         isActive:
 *           type: boolean
 *           description: Whether the KPI is active
 *         scorecardPillar:
 *           type: string
 *           nullable: true
 *           description: BSC org pillar (e.g. Financial, Customer & Market)
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/kpis:
 *   post:
 *     summary: Create a new KPI
 *     tags: [KPIs, performance-kpis]
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
 *               - type
 *               - isReverseKpi
 *               - weightValue
 *               - hasUnit
 *               - unitCategory
 *               - unit
 *               - unitSymbol
 *               - unitPosition
 *               - code
 *               - description
 *               - catalogDepartmentName
 *               - accountType
 *               - journalEntryType
 *               - isFinancial
 *             properties:
 *               name:
 *                 type: string
 *                 description: KPI name
 *               type:
 *                 type: string
 *                 enum: [Metric, Percentage]
 *                 description: KPI type
 *               isReverseKpi:
 *                 type: boolean
 *                 description: Lower actual is better — goals linked by kpiName default to reverse scoring
 *               weightValue:
 *                 type: number
 *                 description: Weight value for the KPI
 *               hasUnit:
 *                 type: boolean
 *                 description: Whether the KPI has a unit
 *               unitCategory:
 *                 type: string
 *                 description: Unit category
 *               unit:
 *                 type: string
 *                 description: Unit name
 *               unitSymbol:
 *                 type: string
 *                 description: Unit symbol
 *               unitPosition:
 *                 type: string
 *                 enum: [prefix, suffix]
 *                 description: Unit position
 *               code:
 *                 type: string
 *                 description: Stable catalog code (e.g. TRAINING_EXPENSE)
 *               description:
 *                 type: string
 *                 description: Long description (catalog)
 *               catalogDepartmentName:
 *                 type: string
 *                 description: Exact departments.name — server sets departmentId
 *               accountType:
 *                 type: string
 *                 enum: [Revenue, Expense, Asset, Liability, Equity]
 *               accountNumber:
 *                 type: string
 *                 nullable: true
 *                 description: GL/chart id for journals; required when isFinancial is true
 *               journalEntryType:
 *                 type: string
 *                 enum: [Debit, Credit]
 *               isFinancial:
 *                 type: boolean
 *               scorecardPillar:
 *                 type: string
 *                 description: Optional. BSC org pillar; if omitted, inferred from name/accounts
 *     responses:
 *       201:
 *         description: KPI created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticate, KPIController.createKPI);

/**
 * @swagger
 * /api/kpis:
 *   get:
 *     summary: Get all KPIs
 *     tags: [KPIs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [Metric, Percentage]
 *         description: Filter by KPI type
 *       - in: query
 *         name: branch
 *         schema:
 *           type: string
 *         description: Filter by branch
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: hasUnit
 *         schema:
 *           type: boolean
 *         description: Filter by unit availability
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in name, unit category, and unit
 *       - in: query
 *         name: scorecardPillar
 *         schema:
 *           type: string
 *         description: Filter by BSC org pillar (exact match to stored value, e.g. Financial)
 *     responses:
 *       200:
 *         description: List of KPIs
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, KPIController.getAllKPIs);

/**
 * @swagger
 * /api/kpis/statistics:
 *   get:
 *     summary: Get KPI statistics
 *     tags: [KPIs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KPI statistics
 *       401:
 *         description: Unauthorized
 */
router.get("/statistics", authenticate, KPIController.getKPIStatistics);

/**
 * @swagger
 * /api/kpis/tracking:
 *   get:
 *     summary: Get comprehensive KPI tracking data for all KPIs
 *     tags: [KPIs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: kpiId
 *         schema:
 *           type: string
 *         description: Filter by specific KPI ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [Metric, Percentage]
 *         description: Filter by KPI type
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *         description: Filter by department ID
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: scorecardPillar
 *         schema:
 *           type: string
 *         description: Filter by BSC org pillar (exact match)
 *     responses:
 *       200:
 *         description: Comprehensive KPI tracking data with progress metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     kpis:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           type:
 *                             type: string
 *                           scorecardPillar:
 *                             type: string
 *                             nullable: true
 *                           departmentId:
 *                             type: string
 *                           tracking:
 *                             type: object
 *                             properties:
 *                               totalGoals:
 *                                 type: number
 *                               activeGoals:
 *                                 type: number
 *                               completedGoals:
 *                                 type: number
 *                               goalCompletionRate:
 *                                 type: number
 *                               monetaryProgress:
 *                                 type: number
 *                               percentProgress:
 *                                 type: number
 *                               isOnTrack:
 *                                 type: boolean
 *                               needsAttention:
 *                                 type: boolean
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalKPIs:
 *                           type: number
 *                         activeKPIs:
 *                           type: number
 *                         onTrackKPIs:
 *                           type: number
 *                         needsAttentionKPIs:
 *                           type: number
 *                         overallProgress:
 *                           type: number
 *                         systemHealth:
 *                           type: string
 *                           enum: [healthy, warning, critical]
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad request
 */
router.get("/tracking", authenticate, KPIController.getKPITracking);

/**
 * @swagger
 * /api/kpis/analytics/summary:
 *   get:
 *     summary: Get KPI analytics summary
 *     tags: [KPIs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *         description: Filter by department ID
 *       - in: query
 *         name: scorecardPillar
 *         schema:
 *           type: string
 *         description: Filter by BSC org pillar (exact match)
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, quarter, year]
 *           default: month
 *         description: Time period for analytics
 *     responses:
 *       200:
 *         description: KPI analytics summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalKPIs:
 *                           type: number
 *                         activeKPIs:
 *                           type: number
 *                         completedKPIs:
 *                           type: number
 *                         averageProgress:
 *                           type: number
 *                         onTrackPercentage:
 *                           type: number
 *                     departmentBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           departmentId:
 *                             type: string
 *                           departmentName:
 *                             type: string
 *                           kpiCount:
 *                             type: number
 *                           averageProgress:
 *                             type: number
 *                     performanceMetrics:
 *                       type: object
 *                       properties:
 *                         topPerformingKPIs:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               scorecardPillar:
 *                                 type: string
 *                                 nullable: true
 *                               progress:
 *                                 type: number
 *                         needsAttentionKPIs:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               scorecardPillar:
 *                                 type: string
 *                                 nullable: true
 *                               progress:
 *                                 type: number
 *                     trends:
 *                       type: object
 *                       properties:
 *                         period:
 *                           type: string
 *                         improvementRate:
 *                           type: number
 *                         declineRate:
 *                           type: number
 *                         stableRate:
 *                           type: number
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad request
 */
router.get("/analytics/summary", authenticate, KPIController.getKPIAnalyticsSummary);

/**
 * @swagger
 * /api/kpis/{id}:
 *   get:
 *     summary: Get KPI by ID
 *     tags: [KPIs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: KPI ID
 *     responses:
 *       200:
 *         description: KPI details
 *       404:
 *         description: KPI not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authenticate, KPIController.getKPIById);

/**
 * @swagger
 * /api/kpis/{id}:
 *   put:
 *     summary: Update KPI (same handler as PATCH /api/performance/kpis/{id})
 *     tags: [KPIs, performance-kpis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Partial update — send only fields to change
 *             properties:
 *               name: { type: string }
 *               type: { type: string, enum: [Metric, Percentage] }
 *               departmentId: { type: string, nullable: true }
 *               isReverseKpi: { type: boolean }
 *               weightValue: { type: number }
 *               hasUnit: { type: boolean }
 *               unitCategory: { type: string }
 *               unit: { type: string }
 *               unitSymbol: { type: string }
 *               unitPosition: { type: string, enum: [prefix, suffix] }
 *               isActive: { type: boolean }
 *               code: { type: string }
 *               description: { type: string }
 *               catalogDepartmentName: { type: string, nullable: true }
 *               accountType: { type: string, enum: [Revenue, Expense, Asset, Liability, Equity] }
 *               accountNumber: { type: string, nullable: true }
 *               journalEntryType: { type: string, enum: [Debit, Credit] }
 *               isFinancial: { type: boolean }
 *               scorecardPillar:
 *                 type: string
 *                 nullable: true
 *                 description: BSC org pillar; omit to leave unchanged
 *     responses:
 *       200:
 *         description: KPI updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", authenticate, KPIController.updateKPI);

/**
 * @swagger
 * /api/kpis/{id}:
 *   delete:
 *     summary: Delete KPI (same handler as DELETE /api/performance/kpis/{id})
 *     tags: [KPIs, performance-kpis]
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
 *         description: Deleted
 *       400:
 *         description: Validation or cannot delete (e.g. linked goals)
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", authenticate, KPIController.deleteKPI);

export default router;
