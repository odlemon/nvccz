// @ts-nocheck
import express from "express";
import multer from "multer";
import { PerformanceObjectiveService, ObjectiveError } from "../services/PerformanceObjectiveService";
import { PerformanceGoalController } from "../controllers/PerformanceGoalController";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"
import { requireAnyPermission } from "../middleware/permissionAuth"
import { prisma } from "../utils/database"
import { perfActor, perfCan, goalVisible, goalWritable, GOAL_SCOPE_SELECT } from "../services/PerformanceScope"

const router = express.Router();
const READ_KEYS = ["performance.goals.view", "performance.goals.manage"]
const WRITE_KEYS = ["performance.goals.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)
const readGuard = requireAnyPermission(READ_KEYS)

/**
 * Row scope on top of the resource guard (see PerformanceScope): "view" = the caller can see this goal; "write" = they can
 * change it; "checkin" = they can record progress on it — the person it is assigned to may (self-service, like a
 * self-assessment), as may anyone who can change it.
 */
const goalScope = (mode: "view" | "write" | "checkin") => async (req: any, res: any, next: any) => {
  try {
    const a = await perfActor(req.user);
    const g = await prisma.performanceGoal.findUnique({ where: { id: String(req.params.id) }, select: GOAL_SCOPE_SELECT });
    if (!g) return res.status(404).json({ success: false, message: "Goal not found" });
    const ok = mode === "view" ? await goalVisible(a, g)
      : mode === "write" ? await goalWritable(a, g)
      : g.assignedToId === a.id || (perfCan(req.user, "goals", "manage") && (await goalWritable(a, g)));
    if (!ok) return res.status(403).json({ success: false, message: mode === "view" ? "This goal is outside what your role can see." : "Your role cannot change this goal." });
    next();
  } catch (e: any) {
    res.status(e?.statusCode || 500).json({ success: false, message: e?.message || "Error" });
  }
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     PerformanceGoal:
 *       type: object
 *       required:
 *         - title
 *         - type
 *         - startDate
 *         - endDate
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the goal
 *         title:
 *           type: string
 *           description: Goal title
 *         description:
 *           type: string
 *           description: Goal description
 *         type:
 *           type: string
 *           enum: [company, department, individual]
 *           description: Goal type
 *         scorecardPillar:
 *           type: string
 *           description: BSC org pillar (Financial, Customer & Market, etc.); company goals require a pillar or a KPI that has one
 *         parentGoalId:
 *           type: string
 *           description: Parent goal ID for hierarchy
 *         departmentId:
 *           type: string
 *           description: Department ID
 *         monetaryValue:
 *           type: number
 *           description: Target monetary value
 *         percentValue:
 *           type: number
 *           description: Target percentage value
 *         monetaryValueAchieved:
 *           type: number
 *           description: Achieved monetary value
 *         percentValueAchieved:
 *           type: number
 *           description: Achieved percentage value
 *         kpiId:
 *           type: string
 *           description: Associated KPI ID
 *         priority:
 *           type: string
 *           enum: [low, medium, high, critical]
 *           description: Goal priority
 *         status:
 *           type: string
 *           enum: [active, completed, paused, cancelled]
 *           description: Goal status
 *         stage:
 *           type: string
 *           enum: [planning, in_progress, review, completed]
 *           description: Goal stage
 *         startDate:
 *           type: string
 *           format: date-time
 *           description: Goal start date
 *         endDate:
 *           type: string
 *           format: date-time
 *           description: Goal end date
 *         assignedToId:
 *           type: string
 *           description: Assigned user ID
 *         cascadeMode:
 *           type: string
 *           enum: [automatic, manual, both]
 *           description: Goal cascading mode
 */

/**
 * @swagger
 * /performance/goals:
 *   post:
 *     summary: Create a new performance goal
 *     tags: [Performance Goals]
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
 *               - type
 *               - startDate
 *               - endDate
 *             properties:
 *               title:
 *                 type: string
 *                 description: Goal title
 *               description:
 *                 type: string
 *                 description: Goal description
 *               type:
 *                 type: string
 *                 enum: [company, department, individual]
 *                 description: Goal type
 *               scorecardPillar:
 *                 type: string
 *                 description: BSC pillar for company goals; optional for department/individual (can follow backing KPI)
 *               parentGoalId:
 *                 type: string
 *                 description: Parent goal ID for hierarchy
 *               departmentId:
 *                 type: string
 *                 description: Department ID
 *               monetaryValue:
 *                 type: number
 *                 description: Target monetary value
 *               percentValue:
 *                 type: number
 *                 description: Target percentage value
 *               kpiId:
 *                 type: string
 *                 description: Associated KPI ID
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 description: Goal priority
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 description: Goal start date
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: Goal end date
 *               assignedToId:
 *                 type: string
 *                 description: Assigned user ID
 *               cascadeMode:
 *                 type: string
 *                 enum: [automatic, manual, both]
 *                 description: Goal cascading mode
 *     responses:
 *       201:
 *         description: Performance goal created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticate, guard, PerformanceGoalController.createPerformanceGoal);

/**
 * @swagger
 * /performance/goals:
 *   get:
 *     summary: Get all performance goals
 *     tags: [Performance Goals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [company, department, individual]
 *         description: Filter by goal type
 *       - in: query
 *         name: scorecardPillar
 *         schema:
 *           type: string
 *         description: Filter by BSC org pillar (same canonical names as org goals)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, completed, paused, cancelled]
 *         description: Filter by goal status
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by **department name** (matches `departments.name` / display name; same as `departmentName` in responses)
 *       - in: query
 *         name: strategicThemeId
 *         schema:
 *           type: string
 *         description: Filter goals linked to this strategic theme (`performance_strategic_themes.id`)
 *       - in: query
 *         name: pillarId
 *         schema:
 *           type: string
 *         description: Filter by scorecard pillar row id (joins to org pillar / weight line)
 *       - in: query
 *         name: assignedToId
 *         schema:
 *           type: string
 *         description: Filter by assigned user ID
 *       - in: query
 *         name: parentGoalId
 *         schema:
 *           type: string
 *         description: Filter by parent goal ID
 *       - in: query
 *         name: kpiId
 *         schema:
 *           type: string
 *         description: Filter by associated KPI ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title and description
 *     responses:
 *       200:
 *         description: List of performance goals
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, guard, PerformanceGoalController.getAllPerformanceGoals);

/**
 * @swagger
 * /performance/goals/by-kpi/{kpiId}:
 *   get:
 *     summary: Get performance goals for a KPI
 *     description: Returns all goals where `performance_goals.kpiId = {kpiId}` (same goal shape as GET /performance/goals)
 *     tags: [Performance Goals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: kpiId
 *         required: true
 *         schema:
 *           type: string
 *         description: KPI id (kpis.id)
 *     responses:
 *       200:
 *         description: List of performance goals linked to the KPI
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/by-kpi/:kpiId", authenticate, guard, PerformanceGoalController.getGoalsByKpiId);

/**
 * @swagger
 * /performance/goals/statistics:
 *   get:
 *     summary: Get performance goal statistics
 *     tags: [Performance Goals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance goal statistics
 *       401:
 *         description: Unauthorized
 */
router.get("/statistics", authenticate, guard, PerformanceGoalController.getPerformanceGoalStatistics);

/**
 * @swagger
 * /performance/goals/{id}/progress:
 *   put:
 *     summary: Add progress toward a goal (increment)
 *     description: |
 *       Send **`value`** (preferred) or **`currentValue`** (alias): this number is **added** to the goal’s achieved amount
 *       in the goal’s natural unit (USD, percentage points, counts, etc.). Server reads `targetUnit` and syncs legacy
 *       `monetaryValueAchieved` / `percentValueAchieved` and recomputes `progressPercentage`. Parent roll-up may complete shortly after the response.
 *     tags: [Performance Goals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Performance goal ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 type: number
 *                 description: Amount to add to achieved progress (same unit as target)
 *                 example: 50000
 *               currentValue:
 *                 type: number
 *                 description: Alias for value (increment)
 *                 example: 50000
 *     responses:
 *       200:
 *         description: Goal progress updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Goal not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id/progress", authenticate, guard, goalScope("write"), PerformanceGoalController.updateGoalProgress);
router.post("/:id/check-in", authenticate, readGuard, goalScope("checkin"), async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await PerformanceObjectiveService.checkIn(req.params.id, req.body || {}, req.user) });
  } catch (e: any) {
    res.status(e instanceof ObjectiveError ? e.statusCode : 500).json({ success: false, message: e?.message || "Error" });
  }
});
router.get("/:id/check-ins", authenticate, guard, goalScope("view"), async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await PerformanceObjectiveService.history(req.params.id) });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Error" });
  }
});
router.post("/:id/attachments/base64", authenticate, guard, goalScope("write"), PerformanceGoalController.uploadGoalAttachmentBase64);
router.post("/:id/attachments", authenticate, guard, goalScope("write"), upload.array("attachments", 10), PerformanceGoalController.uploadGoalAttachments);

/**
 * @swagger
 * /performance/goals/{id}:
 *   get:
 *     summary: Get performance goal by ID
 *     tags: [Performance Goals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Performance goal ID
 *     responses:
 *       200:
 *         description: Performance goal details
 *       404:
 *         description: Performance goal not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authenticate, guard, goalScope("view"), PerformanceGoalController.getPerformanceGoalById);

/**
 * @swagger
 * /performance/goals/{id}:
 *   put:
 *     summary: Update performance goal
 *     tags: [Performance Goals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Performance goal ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Goal title
 *               description:
 *                 type: string
 *                 description: Goal description
 *               type:
 *                 type: string
 *                 enum: [company, department, individual]
 *                 description: Goal type
 *               scorecardPillar:
 *                 type: string
 *                 description: BSC org pillar
 *               monetaryValue:
 *                 type: number
 *                 description: Target monetary value
 *               percentValue:
 *                 type: number
 *                 description: Target percentage value
 *               monetaryValueAchieved:
 *                 type: number
 *                 description: Achieved monetary value
 *               percentValueAchieved:
 *                 type: number
 *                 description: Achieved percentage value
 *               kpiId:
 *                 type: string
 *                 description: Associated KPI ID
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 description: Goal priority
 *               status:
 *                 type: string
 *                 enum: [active, completed, paused, cancelled]
 *                 description: Goal status
 *               stage:
 *                 type: string
 *                 enum: [planning, in_progress, review, completed]
 *                 description: Goal stage
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 description: Goal start date
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: Goal end date
 *               assignedToId:
 *                 type: string
 *                 description: Assigned user ID
 *     responses:
 *       200:
 *         description: Performance goal updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Performance goal not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", authenticate, guard, goalScope("write"), PerformanceGoalController.updatePerformanceGoal);
/** Same handler as PUT — frontend edit forms use PATCH. */
router.patch("/:id", authenticate, guard, goalScope("write"), PerformanceGoalController.updatePerformanceGoal);

/**
 * @swagger
 * /performance/goals/{id}:
 *   delete:
 *     summary: Delete performance goal
 *     tags: [Performance Goals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Performance goal ID
 *     responses:
 *       200:
 *         description: Performance goal deleted successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Performance goal not found
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", authenticate, guard, goalScope("write"), PerformanceGoalController.deletePerformanceGoal);

export default router;

