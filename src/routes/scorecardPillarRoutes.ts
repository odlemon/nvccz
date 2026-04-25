import express from "express";
import { authenticate } from "../middleware/authenticate";
import { ScorecardPillarController } from "../controllers/ScorecardPillarController";

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * /performance/scorecard-pillars:
 *   get:
 *     summary: List Scorecard Pillars (Balanced Scorecard)
 *     description: |
 *       Performance UAT (Balanced Scorecard). Returns DB pillars (`displayName`, `description`, …) plus **`weight`** (0–100) and **`strategyId`**. Save all four weights (summing to 100%) via **PUT /performance/scorecard-pillars/weights** or **POST/PUT /performance/config/strategies** with `pillarWeights`.
 *     tags: ['Performance UAT (Balanced Scorecard)']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pillars retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/", ScorecardPillarController.list);

/**
 * @swagger
 * /performance/scorecard-pillars:
 *   post:
 *     summary: Create/seed a Scorecard Pillar (system)
 *     description: Performance UAT (Balanced Scorecard). Creates (or upserts) one of the 4 organisational pillars. Intended for admin seeding flows.
 *     tags: ['Performance UAT (Balanced Scorecard)']
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [canonicalName]
 *             properties:
 *               canonicalName:
 *                 type: string
 *                 example: Financial
 *               displayName:
 *                 type: string
 *                 example: Financial
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Pillar created
 *       400:
 *         description: Validation error
 */
router.post("/", ScorecardPillarController.create);

/**
 * @swagger
 * /performance/scorecard-pillars/weights:
 *   put:
 *     operationId: putPerformanceScorecardPillarWeights
 *     summary: Set all four BSC pillar weights (must sum to 100%)
 *     description: |
 *       Send **all four** system pillar ids (`bsc_financial`, `bsc_customer_market`, `bsc_internal_operations`,
 *       `bsc_learning_growth_hr`) with weights that **total exactly 100%**. Use `weights: [{ id, weight }, ...]`
 *       and/or `pillarWeights: { "bsc_financial": 25, ... }`. Not available on `PUT .../scorecard-pillars/{id}`.
 *     tags: ['Performance UAT (Balanced Scorecard)']
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Use weights array, pillarWeights object, or both (merged); must include all four ids.
 *             properties:
 *               weights:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [id, weight]
 *                   properties:
 *                     id: { type: string, example: "bsc_financial" }
 *                     weight: { type: number, example: 25 }
 *               pillarWeights:
 *                 type: object
 *                 additionalProperties: { type: number }
 *     responses:
 *       200:
 *         description: Returns updated pillar list (same shape as GET /scorecard-pillars)
 *       400:
 *         description: Validation (e.g. total not 100%, missing id)
 *       401:
 *         description: Unauthorized
 */
router.put("/weights", ScorecardPillarController.updateWeights);

/**
 * @swagger
 * /performance/scorecard-pillars/{id}/company-goal-weights:
 *   put:
 *     operationId: putScorecardPillarCompanyGoalWeights
 *     summary: Set company-goal line weights in this pillar (must total 100%)
 *     description: |
 *       Updates `scorecardWeight` for **every** `company` goal in this pillar that shares the same
 *       `strategyId` and `departmentName` as the goals you list. The numbers must **sum to exactly 100%**
 *       (roll-up uses these weights in org BSC). Requires **`weightChangeReason`**. For a **single** goal
 *       at a time you can also use **PUT /performance/config/goals/{goalId}** with the same 100% rule
 *       against current siblings.
 *     tags: ['Performance UAT (Balanced Scorecard)']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Pillar id (e.g. bsc_internal_operations)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ goalWeights, weightChangeReason ]
 *             properties:
 *               goalWeights:
 *                 type: object
 *                 additionalProperties: { type: number }
 *                 description: goalId (UUID) to weight % for every company goal in this pillar+strategy+dept line
 *               weightChangeReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated performance goals (raw rows)
 *       400:
 *         description: Validation (e.g. total not 100%, wrong goal set)
 *       401:
 *         description: Unauthorized
 */
router.put("/:id/company-goal-weights", ScorecardPillarController.setCompanyGoalWeights);

/**
 * @swagger
 * /performance/scorecard-pillars/{id}:
 *   get:
 *     summary: Get scorecard pillar by id with mapped goals
 *     description: |
 *       Performance UAT (Balanced Scorecard). Returns the pillar row (`id`, `canonicalName`, `displayName`, `description`, **`weight`**, **`strategyId`**, …) and **`goals`** — each goal includes **`weight`** (BSC `scorecardWeight` %, null if unset), **`scorecardWeight`**, **`strategyId`**, and other fields. Goals are matched by `pillar_id` and/or `scorecard_pillar` (and historical aliases).
 *       Optional query: `type`, `status`, `limit` (default 200, max 500), `offset`.
 *     tags: ['Performance UAT (Balanced Scorecard)']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Pillar id (e.g. bsc_financial)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter goals by type (company, department, individual)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by goal status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 200
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Pillar and goals
 *       404:
 *         description: Pillar not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", ScorecardPillarController.getByIdWithGoals);

/**
 * @swagger
 * /performance/scorecard-pillars/{id}:
 *   put:
 *     summary: Update a Scorecard Pillar (display name / description / canonical)
 *     description: |
 *       Performance UAT (Balanced Scorecard). Updates `displayName` and/or `description`, or renames
 *       via `canonicalName`. **Do not send `weight` here** — use **PUT /performance/scorecard-pillars/weights**
 *       to set all four BSC weights (summing to 100%).
 *     tags: ['Performance UAT (Balanced Scorecard)']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Pillar id (e.g. bsc_financial)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *               description:
 *                 type: string
 *               canonicalName:
 *                 type: string
 *                 description: Renames the canonical pillar name (cascades to KPIs/goals; old name becomes an alias)
 *     responses:
 *       200:
 *         description: Pillar updated
 */
router.put("/:id", ScorecardPillarController.update);

/**
 * @swagger
 * /performance/scorecard-pillars/{id}:
 *   delete:
 *     summary: Delete a Scorecard Pillar
 *     description: Performance UAT (Balanced Scorecard). System pillars cannot be deleted; non-system pillars can be deleted only when not referenced by KPIs/goals.
 *     tags: ['Performance UAT (Balanced Scorecard)']
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
 *         description: Pillar deleted
 *       400:
 *         description: Cannot delete pillar (in use or system)
 */
router.delete("/:id", ScorecardPillarController.remove);

export default router;

