// @ts-nocheck
import express from "express";
import { ActivityLogController } from "../controllers/ActivityLogController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ActivityLog:
 *       type: object
 *       required:
 *         - activityType
 *         - title
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the activity log
 *         userId:
 *           type: string
 *           description: User ID who performed the activity
 *         activityType:
 *           type: string
 *           enum: [goal_update, task_completion, kpi_update, general]
 *           description: Type of activity
 *         title:
 *           type: string
 *           description: Activity title
 *         description:
 *           type: string
 *           description: Activity description
 *         goalId:
 *           type: string
 *           description: Associated goal ID
 *         taskId:
 *           type: string
 *           description: Associated task ID
 *         kpiId:
 *           type: string
 *           description: Associated KPI ID
 *         monetaryValueAchieved:
 *           type: number
 *           description: Monetary value achieved
 *         percentValueAchieved:
 *           type: number
 *           description: Percentage value achieved
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/activity-logs:
 *   post:
 *     summary: Create a new activity log
 *     tags: [Activity Logs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - activityType
 *               - title
 *             properties:
 *               activityType:
 *                 type: string
 *                 enum: [goal_update, task_completion, kpi_update, general]
 *                 description: Type of activity
 *               title:
 *                 type: string
 *                 description: Activity title
 *               description:
 *                 type: string
 *                 description: Activity description
 *               goalId:
 *                 type: string
 *                 description: Associated goal ID
 *               taskId:
 *                 type: string
 *                 description: Associated task ID
 *               kpiId:
 *                 type: string
 *                 description: Associated KPI ID
 *               monetaryValueAchieved:
 *                 type: number
 *                 description: Monetary value achieved
 *               percentValueAchieved:
 *                 type: number
 *                 description: Percentage value achieved
 *     responses:
 *       201:
 *         description: Activity log created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticate, ActivityLogController.createActivityLog);

/**
 * @swagger
 * /api/activity-logs:
 *   get:
 *     summary: Get all activity logs
 *     tags: [Activity Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: activityType
 *         schema:
 *           type: string
 *           enum: [goal_update, task_completion, kpi_update, general]
 *         description: Filter by activity type
 *       - in: query
 *         name: goalId
 *         schema:
 *           type: string
 *         description: Filter by goal ID
 *       - in: query
 *         name: taskId
 *         schema:
 *           type: string
 *         description: Filter by task ID
 *       - in: query
 *         name: kpiId
 *         schema:
 *           type: string
 *         description: Filter by KPI ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by end date
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title and description
 *     responses:
 *       200:
 *         description: List of activity logs
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, ActivityLogController.getAllActivityLogs);

/**
 * @swagger
 * /api/activity-logs/statistics:
 *   get:
 *     summary: Get activity log statistics
 *     tags: [Activity Logs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Activity log statistics
 *       401:
 *         description: Unauthorized
 */
router.get("/statistics", authenticate, ActivityLogController.getActivityLogStatistics);

/**
 * @swagger
 * /api/activity-logs/{id}:
 *   get:
 *     summary: Get activity log by ID
 *     tags: [Activity Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Activity log ID
 *     responses:
 *       200:
 *         description: Activity log details
 *       404:
 *         description: Activity log not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authenticate, ActivityLogController.getActivityLogById);

export default router;


