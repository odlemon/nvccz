// @ts-nocheck
/**
 * Database-backed KPI catalog (kpis table) — create / update.
 * Mounted at `/api/performance/kpis` alongside hardcoded KPI listing routes (different HTTP methods).
 */
import express from "express";
import { KPIController } from "../controllers/KPIController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

/**
 * @swagger
 * /api/performance/kpis:
 *   post:
 *     summary: Create a KPI (database catalog)
 *     description: |
 *       Persists a row in `kpis`. **catalogDepartmentName** must match `departments.name` exactly; **`departmentId` is set automatically** from that name (do not send a conflicting `departmentId`).
 *       For hardcoded KPI reference data only, see GET routes on this path.
 *     tags: [performance-kpis]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type, isReverseKpi, weightValue, hasUnit, unitCategory, unit, unitSymbol, unitPosition, code, description, catalogDepartmentName, accountType, journalEntryType, isFinancial]
 *             properties:
 *               name: { type: string }
 *               type: { type: string, enum: [Metric, Percentage] }
 *               isReverseKpi: { type: boolean, description: "When true, goals using this KPI default to reverse scoring" }
 *               weightValue: { type: number }
 *               hasUnit: { type: boolean }
 *               unitCategory: { type: string }
 *               unit: { type: string }
 *               unitSymbol: { type: string }
 *               unitPosition: { type: string, enum: [prefix, suffix] }
 *               code: { type: string }
 *               description: { type: string }
 *               catalogDepartmentName: { type: string, description: "Exact match to departments.name — server sets departmentId" }
 *               accountType: { type: string, enum: [Revenue, Expense, Asset, Liability, Equity] }
 *               accountNumber: { type: string, nullable: true }
 *               journalEntryType: { type: string, enum: [Debit, Credit] }
 *               isFinancial: { type: boolean }
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticate, KPIController.createKPI);

/**
 * @swagger
 * /api/performance/kpis/{id}:
 *   patch:
 *     summary: Update a KPI (database catalog) — canonical edit endpoint
 *     tags: [performance-kpis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               type: { type: string, enum: [Metric, Percentage] }
 *               departmentId: { type: string, nullable: true, description: "Use when not sending catalogDepartmentName; must match resolved id if both sent" }
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
 *               catalogDepartmentName: { type: string, description: "If set, exact departments.name — sets departmentId" }
 *               accountType: { type: string, enum: [Revenue, Expense, Asset, Liability, Equity] }
 *               accountNumber: { type: string, nullable: true }
 *               journalEntryType: { type: string, enum: [Debit, Credit] }
 *               isFinancial: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.patch("/:id", authenticate, KPIController.updateKPI);

/**
 * @swagger
 * /api/performance/kpis/{id}:
 *   put:
 *     summary: Update a KPI (database catalog) — PUT alias (same as PATCH)
 *     tags: [performance-kpis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Partial update — same fields as PATCH
 *             properties:
 *               name: { type: string }
 *               type: { type: string, enum: [Metric, Percentage] }
 *               departmentId: { type: string, nullable: true, description: "Use when not sending catalogDepartmentName; must match resolved id if both sent" }
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
 *               catalogDepartmentName: { type: string, nullable: true, description: "Exact departments.name; null/empty clears department" }
 *               accountType: { type: string, enum: [Revenue, Expense, Asset, Liability, Equity] }
 *               accountNumber: { type: string, nullable: true }
 *               journalEntryType: { type: string, enum: [Debit, Credit] }
 *               isFinancial: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", authenticate, KPIController.updateKPI);

/**
 * @swagger
 * /api/performance/kpis/{id}:
 *   delete:
 *     summary: Delete a KPI (database catalog) — canonical delete endpoint
 *     tags: [performance-kpis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", authenticate, KPIController.deleteKPI);

export default router;
