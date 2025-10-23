// @ts-nocheck
import express from "express";
import { PerformanceGoalController } from "../controllers/PerformanceGoalController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     PerformanceGoal:
 *       type: object
 *       required:
 *         - title
 *         - type
 *         - category
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
 *         category:
 *           type: string
 *           enum: [financial, operational, strategic]
 *           description: Goal category
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
 * /api/performance/goals:
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
 *               - category
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
 *               category:
 *                 type: string
 *                 enum: [financial, operational, strategic]
 *                 description: Goal category
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
router.post("/", authenticate, PerformanceGoalController.createPerformanceGoal);

/**
 * @swagger
 * /api/performance/goals:
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
 *         name: category
 *         schema:
 *           type: string
 *           enum: [financial, operational, strategic]
 *         description: Filter by goal category
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, completed, paused, cancelled]
 *         description: Filter by goal status
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *         description: Filter by department ID
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
router.get("/", authenticate, PerformanceGoalController.getAllPerformanceGoals);

/**
 * @swagger
 * /api/performance/goals/statistics:
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
router.get("/statistics", authenticate, PerformanceGoalController.getPerformanceGoalStatistics);

/**
 * @swagger
 * /api/performance/goals/{id}:
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
router.get("/:id", authenticate, PerformanceGoalController.getPerformanceGoalById);

/**
 * @swagger
 * /api/performance/goals/{id}:
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
 *               category:
 *                 type: string
 *                 enum: [financial, operational, strategic]
 *                 description: Goal category
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
router.put("/:id", authenticate, PerformanceGoalController.updatePerformanceGoal);

/**
 * @swagger
 * /api/performance/goals/{id}:
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
router.delete("/:id", authenticate, PerformanceGoalController.deletePerformanceGoal);

/**
 * @swagger
 * /api/performance/goals/{id}/progress:
 *   put:
 *     summary: Update goal progress with absolute values
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
 *             required:
 *               - currentValue
 *             properties:
 *               currentValue:
 *                 type: number
 *                 description: Current progress value
 *                 example: 1500000
 *     responses:
 *       200:
 *         description: Goal progress updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 goal:
 *                   $ref: '#/components/schemas/PerformanceGoal'
 *       400:
 *         description: Bad request
 *       404:
 *         description: Goal not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id/progress", authenticate, PerformanceGoalController.updateGoalProgress);

export default router;

