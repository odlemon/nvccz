// @ts-nocheck
import express from "express";
import { ActivityController } from "../controllers/ActivityController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/activities:
 *   post:
 *     summary: Create a new activity for a task or goal
 *     description: Create an activity to track progress on tasks or goals. Automatically updates stage based on value collected vs target.
 *     tags: [Task Management]
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
 *               - activityType
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Completed client meeting"
 *               description:
 *                 type: string
 *                 example: "Met with 3 potential clients to discuss investment opportunities"
 *               activityType:
 *                 type: string
 *                 enum: [task, goal]
 *                 example: "task"
 *               taskId:
 *                 type: string
 *                 example: "cmhbzxtvo0003jm04lt2q8htu"
 *                 description: "Required if activityType is 'task' - The ID of the task being updated. Goal will be automatically found from the task."
 *               goalId:
 *                 type: string
 *                 example: "cmhbzxqxz0001jm04vgtxkmvx"
 *                 description: "Required if activityType is 'goal'"
 *               valueCollected:
 *                 type: number
 *                 example: 50000
 *                 description: "Value collected/achieved in this activity (optional)"
 *     responses:
 *       201:
 *         description: Activity created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Activity created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     activityType:
 *                       type: string
 *                     monetaryValueAchieved:
 *                       type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         firstName:
 *                           type: string
 *                         lastName:
 *                           type: string
 *                         email:
 *                           type: string
 *                     task:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         title:
 *                           type: string
 *                         stage:
 *                           type: string
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/", ActivityController.createActivity);

/**
 * @swagger
 * /api/activities/task/{taskId}:
 *   get:
 *     summary: Get activities for a specific task
 *     description: Retrieve all activities associated with a specific task
 *     tags: [Task Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task activities retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Task activities retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       activityType:
 *                         type: string
 *                       monetaryValueAchieved:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       user:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           email:
 *                             type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/task/:taskId", ActivityController.getTaskActivities);

/**
 * @swagger
 * /api/activities/goal/{goalId}:
 *   get:
 *     summary: Get activities for a specific goal
 *     description: Retrieve all activities associated with a specific goal
 *     tags: [Task Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *         description: Goal ID
 *     responses:
 *       200:
 *         description: Goal activities retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Goal activities retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       activityType:
 *                         type: string
 *                       monetaryValueAchieved:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       user:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           email:
 *                             type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/goal/:goalId", ActivityController.getGoalActivities);

/**
 * @swagger
 * /api/activities/department/{department}/goals:
 *   get:
 *     summary: Get department goals for managers/heads
 *     description: Retrieve department goals that the current user can manage (requires HEAD, DEPUTY role or admin)
 *     tags: [Task Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: department
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Finance, Sales, Operations, Procurement, "Human Resources", Marketing, Legal, IT]
 *         description: Department name
 *     responses:
 *       200:
 *         description: Department goals retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Department goals retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       type:
 *                         type: string
 *                       category:
 *                         type: string
 *                       targetValue:
 *                         type: string
 *                       currentValue:
 *                         type: string
 *                       stage:
 *                         type: string
 *                       createdBy:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           email:
 *                             type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get("/department/:department/goals", ActivityController.getDepartmentGoals);

/**
 * @swagger
 * /api/activities/manager/tasks:
 *   get:
 *     summary: Get tasks created by manager for their department
 *     description: Retrieve all performance tasks created by the current user for their department
 *     tags: [Task Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Manager created tasks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Manager created tasks retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       stage:
 *                         type: string
 *                       priority:
 *                         type: string
 *                       department:
 *                         type: string
 *                       isPerformanceTask:
 *                         type: boolean
 *                       monetaryValue:
 *                         type: string
 *                       goal:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           type:
 *                             type: string
 *                           category:
 *                             type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/manager/tasks", ActivityController.getManagerCreatedTasks);

export default router;
