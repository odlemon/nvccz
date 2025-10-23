// @ts-nocheck
import express from "express";
import { PerformanceWorkflowController } from "../controllers/PerformanceWorkflowController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

/**
 * @swagger
 * /api/performance/workflow/auto-assign-goals/{goalId}:
 *   post:
 *     summary: Auto-assign organizational goals to departments
 *     tags: [Performance Workflow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *         description: Organizational goal ID
 *     responses:
 *       200:
 *         description: Goals auto-assigned successfully
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
router.post("/auto-assign-goals/:goalId", authenticate, PerformanceWorkflowController.autoAssignGoals);

/**
 * @swagger
 * /api/performance/workflow/auto-assign-department-goals/{goalId}:
 *   post:
 *     summary: Auto-assign department goals to team members
 *     tags: [Performance Workflow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *         description: Department goal ID
 *     responses:
 *       200:
 *         description: Department goals auto-assigned successfully
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
router.post("/auto-assign-department-goals/:goalId", authenticate, PerformanceWorkflowController.autoAssignDepartmentGoals);

/**
 * @swagger
 * /api/performance/workflow/update-progress-from-tasks/{taskId}:
 *   post:
 *     summary: Update goal progress from task completion
 *     tags: [Performance Workflow]
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
 *         description: Goal progress updated from task completion
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
router.post("/update-progress-from-tasks/:taskId", authenticate, PerformanceWorkflowController.updateProgressFromTasks);

/**
 * @swagger
 * /api/performance/workflow/check-kpi-thresholds/{goalId}:
 *   post:
 *     summary: Check KPI thresholds and trigger accounting
 *     tags: [Performance Workflow]
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
 *         description: KPI thresholds checked successfully
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
router.post("/check-kpi-thresholds/:goalId", authenticate, PerformanceWorkflowController.checkKPIThresholds);

/**
 * @swagger
 * /api/performance/workflow/check-overdue-goals:
 *   post:
 *     summary: Check for overdue goals
 *     tags: [Performance Workflow]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Overdue goals checked successfully
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
router.post("/check-overdue-goals", authenticate, PerformanceWorkflowController.checkOverdueGoals);

/**
 * @swagger
 * /api/performance/workflow/run-automation:
 *   post:
 *     summary: Run all workflow automation tasks
 *     tags: [Performance Workflow]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workflow automation completed successfully
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
router.post("/run-automation", authenticate, PerformanceWorkflowController.runWorkflowAutomation);

export default router;
