// @ts-nocheck
import express from "express";
import { EnhancedETLController } from "../controllers/EnhancedETLController";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"

const router = express.Router();
const READ_KEYS = ["performance.etl.view", "performance.etl.manage"]
const WRITE_KEYS = ["performance.etl.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)

/**
 * @swagger
 * components:
 *   schemas:
 *     SourceModuleData:
 *       type: object
 *       properties:
 *         accounting:
 *           type: object
 *           properties:
 *             totalRevenue:
 *               type: number
 *             totalExpenses:
 *               type: number
 *             netIncome:
 *               type: number
 *             totalAssets:
 *               type: number
 *             totalLiabilities:
 *               type: number
 *             shareholdersEquity:
 *               type: number
 *             cashBalance:
 *               type: number
 *             accountsReceivable:
 *               type: number
 *             accountsPayable:
 *               type: number
 *         procurement:
 *           type: object
 *           properties:
 *             averageInvoiceProcessingTime:
 *               type: number
 *             averageContractApprovalTime:
 *               type: number
 *             totalProcurementSpend:
 *               type: number
 *             supplierCount:
 *               type: number
 *         tasks:
 *           type: object
 *           properties:
 *             taskCompletionRate:
 *               type: number
 *             averageTimeToHire:
 *               type: number
 *             trainingCompletionRate:
 *               type: number
 *             onboardingCompletionRate:
 *               type: number
 *             totalTasks:
 *               type: number
 *             completedTasks:
 *               type: number
 *         events:
 *           type: object
 *           properties:
 *             eventRSVPRate:
 *               type: number
 *             totalEvents:
 *               type: number
 *             totalGuests:
 *               type: number
 *             confirmedGuests:
 *               type: number
 */

/**
 * @swagger
 * /api/performance/enhanced-etl/run:
 *   post:
 *     summary: Run enhanced ETL pipeline
 *     tags: [Enhanced ETL]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Enhanced ETL pipeline completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/run", authenticate, guard, EnhancedETLController.runETLPipeline);

/**
 * @swagger
 * /api/performance/enhanced-etl/extract:
 *   get:
 *     summary: Extract data from all source modules
 *     tags: [Enhanced ETL]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Data extracted from all source modules successfully
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
 *                   $ref: '#/components/schemas/SourceModuleData'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/extract", authenticate, guard, EnhancedETLController.extractFromAllModules);

/**
 * @swagger
 * /api/performance/enhanced-etl/metrics:
 *   get:
 *     summary: Get current metrics from external data
 *     tags: [Enhanced ETL]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current metrics retrieved successfully
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
 *                   description: Current KPI metrics
 *       404:
 *         description: No current metrics found
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/metrics", authenticate, guard, EnhancedETLController.getCurrentMetrics);

/**
 * @swagger
 * /api/performance/enhanced-etl/schedule:
 *   post:
 *     summary: Schedule ETL job
 *     tags: [Enhanced ETL]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ETL job scheduled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/schedule", authenticate, guard, EnhancedETLController.scheduleETLJob);

/**
 * @swagger
 * /api/performance/enhanced-etl/stats:
 *   get:
 *     summary: Get ETL pipeline statistics
 *     tags: [Enhanced ETL]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ETL statistics retrieved successfully
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
 *                     financial:
 *                       type: object
 *                       properties:
 *                         revenueGrowth:
 *                           type: number
 *                         operatingExpenses:
 *                           type: number
 *                         netProfit:
 *                           type: number
 *                         grossProfitMargin:
 *                           type: number
 *                         netProfitMargin:
 *                           type: number
 *                     operational:
 *                       type: object
 *                       properties:
 *                         taskCompletionRate:
 *                           type: number
 *                         trainingCompletionRate:
 *                           type: number
 *                         eventRSVPRate:
 *                           type: number
 *                         userOnboardingRate:
 *                           type: number
 *                         timeToHire:
 *                           type: number
 *                     procurement:
 *                       type: object
 *                       properties:
 *                         invoiceProcessingTime:
 *                           type: number
 *                         contractApprovalTime:
 *                           type: number
 *       404:
 *         description: No ETL statistics available
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/stats", authenticate, guard, EnhancedETLController.getETLStats);

export default router;
