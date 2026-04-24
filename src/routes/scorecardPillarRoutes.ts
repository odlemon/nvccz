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
 *     description: Performance UAT (Balanced Scorecard). Returns the configured scorecard pillars with display names and descriptions for KPI configuration screens.
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
 * /performance/scorecard-pillars/{id}:
 *   put:
 *     summary: Update a Scorecard Pillar (display name / description)
 *     description: Performance UAT (Balanced Scorecard). Updates `displayName` and/or `description`. To **rename** the pillar (canonical), send `canonicalName` — this will cascade-update KPIs/goals that reference the previous canonical name and store the old name as an alias.
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

