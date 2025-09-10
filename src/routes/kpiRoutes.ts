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
 *     tags: [KPIs]
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
 *             properties:
 *               name:
 *                 type: string
 *                 description: KPI name
 *               type:
 *                 type: string
 *                 enum: [Metric, Percentage]
 *                 description: KPI type
 *               branch:
 *                 type: string
 *                 description: Branch association
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
 *     summary: Update KPI
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: KPI name
 *               type:
 *                 type: string
 *                 enum: [Metric, Percentage]
 *                 description: KPI type
 *               branch:
 *                 type: string
 *                 description: Branch association
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
 *               isActive:
 *                 type: boolean
 *                 description: Whether the KPI is active
 *     responses:
 *       200:
 *         description: KPI updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: KPI not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", authenticate, KPIController.updateKPI);

/**
 * @swagger
 * /api/kpis/{id}:
 *   delete:
 *     summary: Delete KPI
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
 *         description: KPI deleted successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: KPI not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", authenticate, KPIController.deleteKPI);

export default router;
