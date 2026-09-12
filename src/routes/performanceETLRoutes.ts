// @ts-nocheck
import express from "express";
import { PerformanceETLController } from "../controllers/PerformanceETLController";
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
 *     PerformanceData:
 *       type: object
 *       properties:
 *         goals:
 *           type: array
 *           description: Performance goals data
 *         tasks:
 *           type: array
 *           description: Performance tasks data
 *         kpis:
 *           type: array
 *           description: KPI data
 *         scorecards:
 *           type: array
 *           description: Performance scorecards data
 *         reviews:
 *           type: array
 *           description: Performance reviews data
 *         activities:
 *           type: array
 *           description: Performance activities data
 *     ExternalDataRecord:
 *       type: object
 *       properties:
 *         module:
 *           type: string
 *           description: Module name
 *         entityType:
 *           type: string
 *           description: Entity type
 *         entityId:
 *           type: string
 *           description: Entity ID
 *         data:
 *           type: object
 *           description: Transformed data
 *         timestamp:
 *           type: string
 *           format: date-time
 *           description: Timestamp
 *         status:
 *           type: string
 *           description: Status
 */

/**
 * @swagger
 * /api/performance/etl/extract:
 *   get:
 *     summary: Extract performance data from all performance-related tables
 *     tags: [Performance ETL]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance data extracted successfully
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
 *                     goals:
 *                       type: number
 *                     tasks:
 *                       type: number
 *                     kpis:
 *                       type: number
 *                     scorecards:
 *                       type: number
 *                     reviews:
 *                       type: number
 *                     activities:
 *                       type: number
 *                 extractedData:
 *                   $ref: '#/components/schemas/PerformanceData'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/extract", authenticate, guard, PerformanceETLController.extractPerformanceData);

/**
 * @swagger
 * /api/performance/etl/transform:
 *   post:
 *     summary: Transform performance data for external systems
 *     tags: [Performance ETL]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rawData
 *             properties:
 *               rawData:
 *                 $ref: '#/components/schemas/PerformanceData'
 *     responses:
 *       200:
 *         description: Performance data transformed successfully
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
 *                     records:
 *                       type: number
 *                     entityTypes:
 *                       type: array
 *                       items:
 *                         type: string
 *                 transformedData:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ExternalDataRecord'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/transform", authenticate, guard, PerformanceETLController.transformData);

/**
 * @swagger
 * /api/performance/etl/load:
 *   post:
 *     summary: Load transformed data into external_data collection
 *     tags: [Performance ETL]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transformedData
 *             properties:
 *               transformedData:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ExternalDataRecord'
 *     responses:
 *       200:
 *         description: Performance data loaded to external_data successfully
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
 *                     recordsLoaded:
 *                       type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/load", authenticate, guard, PerformanceETLController.loadToExternalData);

/**
 * @swagger
 * /api/performance/etl/run:
 *   post:
 *     summary: Run complete ETL pipeline (extract, transform, load)
 *     tags: [Performance ETL]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: ETL pipeline completed successfully
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
router.post("/run", authenticate, guard, PerformanceETLController.runETLPipeline);

/**
 * @swagger
 * /api/performance/etl/schedule:
 *   post:
 *     summary: Schedule ETL job for automated execution
 *     tags: [Performance ETL]
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
router.post("/schedule", authenticate, guard, PerformanceETLController.scheduleETLJob);

/**
 * @swagger
 * /api/performance/etl/stats:
 *   get:
 *     summary: Get external data statistics
 *     tags: [Performance ETL]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: External data statistics retrieved successfully
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       module:
 *                         type: string
 *                       entityType:
 *                         type: string
 *                       _count:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/stats", authenticate, guard, PerformanceETLController.getExternalDataStats);

export default router;
