// @ts-nocheck
import express from "express";
import multer from "multer";
import { TaskController } from "../controllers/TaskController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();
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
 *     Task:
 *       type: object
 *       required:
 *         - title
 *         - team
 *         - date
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the task
 *         title:
 *           type: string
 *           description: Task title
 *         description:
 *           type: string
 *           description: Task description
 *         team:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of user IDs assigned to the task
 *         stage:
 *           type: string
 *           enum: [todo, in_progress, completed, overdue]
 *           description: Task stage
 *         date:
 *           type: string
 *           format: date-time
 *           description: Task due date
 *         priority:
 *           type: string
 *           enum: [low, medium, high, critical]
 *           description: Task priority
 *         assets:
 *           type: string
 *           description: Task assets
 *         branch:
 *           type: string
 *           description: Branch association
 *         department:
 *           type: string
 *           description: Department association
 *         ruleset:
 *           type: string
 *           description: Task ruleset
 *         goalId:
 *           type: string
 *           description: Associated performance goal ID
 *         performanceCategory:
 *           type: string
 *           enum: [business, performance, operational]
 *           description: Performance category
 *         isPerformanceTask:
 *           type: boolean
 *           description: Whether this is a performance task
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
 *         kpi:
 *           type: object
 *           description: Associated KPI information
 *         isOverdue:
 *           type: boolean
 *           description: Whether the task is overdue
 *         overdueStatus:
 *           type: string
 *           enum: [overdue_todo, overdue_in_progress, overdue_completed]
 *           description: Overdue status tag
 *         originalStage:
 *           type: string
 *           description: Original stage before overdue
 *         activities:
 *           type: array
 *           description: Task activities
 *         isTrashed:
 *           type: boolean
 *           description: Whether the task is trashed
 */

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create a new task
 *     tags: [Tasks]
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
 *               - team
 *               - date
 *             properties:
 *               title:
 *                 type: string
 *                 description: Task title
 *               description:
 *                 type: string
 *                 description: Task description
 *               team:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of user IDs assigned to the task
 *               stage:
 *                 type: string
 *                 enum: [todo, in_progress, completed, overdue]
 *                 description: Task stage
 *               date:
 *                 type: string
 *                 format: date-time
 *                 description: Task due date
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 description: Task priority
 *               assets:
 *                 type: string
 *                 description: Task assets
 *               branch:
 *                 type: string
 *                 description: Branch association
 *               department:
 *                 type: string
 *                 description: Department association
 *               ruleset:
 *                 type: string
 *                 description: Task ruleset
 *               goalId:
 *                 type: string
 *                 description: Associated performance goal ID
 *               performanceCategory:
 *                 type: string
 *                 enum: [business, performance, operational]
 *                 description: Performance category
 *               isPerformanceTask:
 *                 type: boolean
 *                 description: Whether this is a performance task
 *               monetaryValue:
 *                 type: number
 *                 description: Target monetary value
 *               percentValue:
 *                 type: number
 *                 description: Target percentage value
 *               kpi:
 *                 type: object
 *                 description: Associated KPI information
 *     responses:
 *       201:
 *         description: Task created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticate, TaskController.createTask);

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Get all tasks
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *           enum: [todo, in_progress, completed, overdue]
 *         description: Filter by task stage
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by task priority
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *       - in: query
 *         name: performanceCategory
 *         schema:
 *           type: string
 *           enum: [business, performance, operational]
 *         description: Filter by performance category
 *       - in: query
 *         name: isPerformanceTask
 *         schema:
 *           type: boolean
 *         description: Filter by performance task flag
 *       - in: query
 *         name: goalId
 *         schema:
 *           type: string
 *         description: Filter by performance goal ID
 *       - in: query
 *         name: isOverdue
 *         schema:
 *           type: boolean
 *         description: Filter by overdue status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title, stage, and priority
 *     responses:
 *       200:
 *         description: List of tasks
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, TaskController.getAllTasks);
/**
 * @swagger
 * /api/tasks/status-options:
 *   get:
 *     summary: Get supported task statuses for Kanban and scorecard workflows
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Task status options returned successfully
 */
router.get("/status-options", authenticate, TaskController.getTaskStageOptions);

/**
 * @swagger
 * /api/tasks/my:
 *   get:
 *     summary: Get current user's tasks
 *     description: Retrieve all tasks assigned to the current user
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *           enum: [todo, in_progress, completed, overdue]
 *         description: Filter by task stage
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by task priority
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department
 *       - in: query
 *         name: performanceCategory
 *         schema:
 *           type: string
 *           enum: [business, performance, operational]
 *         description: Filter by performance category
 *       - in: query
 *         name: isPerformanceTask
 *         schema:
 *           type: boolean
 *         description: Filter by performance task flag
 *       - in: query
 *         name: goalId
 *         schema:
 *           type: string
 *         description: Filter by performance goal ID
 *       - in: query
 *         name: isOverdue
 *         schema:
 *           type: boolean
 *         description: Filter by overdue status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title, stage, and priority
 *     responses:
 *       200:
 *         description: User's tasks retrieved successfully
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
 *                   example: "Your tasks retrieved successfully"
 *                 count:
 *                   type: number
 *                   example: 5
 *                 tasks:
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
 *                       isOverdue:
 *                         type: boolean
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
 *                           parentGoal:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               title:
 *                                 type: string
 *                               parentGoal:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: string
 *                                   title:
 *                                     type: string
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad request
 */
router.get("/my", authenticate, TaskController.getMyTasks);
/**
 * @swagger
 * /api/tasks/{id}/comments:
 *   get:
 *     summary: Get task collaboration comments and system messages
 *     tags: [Tasks]
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
 *         description: Task comments returned successfully
 *   post:
 *     summary: Post a task comment with optional mentions and attachments
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *               mentionUserIds:
 *                 type: string
 *                 description: JSON array of user IDs
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Task comment created successfully
 */
router.get("/:id/comments", authenticate, TaskController.getTaskComments);
router.get("/:id/messages", authenticate, TaskController.getTaskMessages);
router.post("/:id/messages", authenticate, TaskController.createTaskMessage);
router.delete("/:id/messages/:msgId", authenticate, TaskController.deleteTaskMessage);
router.get("/:id/chats/:msgId", authenticate, TaskController.getTaskChatMessage);
/**
 * @swagger
 * /api/tasks/{id}/mention-suggestions:
 *   get:
 *     summary: Search valid task mention candidates
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Mention candidates returned successfully
 */
router.get("/:id/mention-suggestions", authenticate, TaskController.getMentionSuggestions);
router.post("/:id/comments", authenticate, upload.array("attachments", 10), TaskController.createTaskComment);
/**
 * @swagger
 * /api/tasks/{id}/comments/{commentId}:
 *   delete:
 *     summary: Delete your own task comment
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task comment deleted successfully
 */
router.delete("/:id/comments/:commentId", authenticate, TaskController.deleteTaskComment);
/**
 * @swagger
 * /api/tasks/{id}/attachments:
 *   post:
 *     summary: Upload one or more task attachments
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Task attachments uploaded successfully
 */
router.post("/:id/attachments", authenticate, upload.array("attachments", 10), TaskController.uploadTaskAttachments);
router.post("/:id/attachments/base64", authenticate, TaskController.uploadTaskAttachmentBase64);

/**
 * @swagger
 * /api/tasks/statistics:
 *   get:
 *     summary: Get task statistics
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Task statistics
 *       401:
 *         description: Unauthorized
 */
router.get("/statistics", authenticate, TaskController.getTaskStatistics);

/**
 * @swagger
 * /api/tasks/{id}:
 *   get:
 *     summary: Get task by ID
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *     responses:
 *       200:
 *         description: Task details
 *       404:
 *         description: Task not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authenticate, TaskController.getTaskById);

/**
 * @swagger
 * /api/tasks/{id}:
 *   put:
 *     summary: Update task
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Task title
 *               description:
 *                 type: string
 *                 description: Task description
 *               team:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of user IDs assigned to the task
 *               stage:
 *                 type: string
 *                 enum: [todo, in_progress, completed, overdue]
 *                 description: Task stage
 *               date:
 *                 type: string
 *                 format: date-time
 *                 description: Task due date
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 description: Task priority
 *               assets:
 *                 type: string
 *                 description: Task assets
 *               branch:
 *                 type: string
 *                 description: Branch association
 *               department:
 *                 type: string
 *                 description: Department association
 *               ruleset:
 *                 type: string
 *                 description: Task ruleset
 *               goalId:
 *                 type: string
 *                 description: Associated performance goal ID
 *               performanceCategory:
 *                 type: string
 *                 enum: [business, performance, operational]
 *                 description: Performance category
 *               isPerformanceTask:
 *                 type: boolean
 *                 description: Whether this is a performance task
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
 *               kpi:
 *                 type: object
 *                 description: Associated KPI information
 *     responses:
 *       200:
 *         description: Task updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Task not found
 *       401:
 *         description: Unauthorized
 */
router.put("/bulk/stage", authenticate, TaskController.bulkUpdateTaskStage);
router.put("/bulk/status-update", authenticate, TaskController.bulkStatusUpdate);
router.delete("/bulk", authenticate, TaskController.bulkTrashTasks);

/**
 * @swagger
 * /api/tasks/{id}/stage:
 *   put:
 *     summary: Update task stage
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stage
 *             properties:
 *               stage:
 *                 type: string
 *                 enum: [todo, in_progress, completed, overdue]
 *                 description: New task stage
 *               monetaryValueAchieved:
 *                 type: number
 *                 description: Additional monetary value achieved
 *               percentValueAchieved:
 *                 type: number
 *                 description: Additional percentage value achieved
 *     responses:
 *       200:
 *         description: Task stage updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Task not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id/stage", authenticate, TaskController.updateTaskStage);

router.put("/:id", authenticate, TaskController.updateTask);

/**
 * @swagger
 * /api/tasks/{id}/activity:
 *   post:
 *     summary: Post task activity
 *     tags: [Tasks]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Task ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - activity
 *               - userId
 *             properties:
 *               type:
 *                 type: string
 *                 description: Activity type
 *               activity:
 *                 type: string
 *                 description: Activity description
 *               monetaryValueAchieved:
 *                 type: number
 *                 description: Monetary value achieved
 *               percentValueAchieved:
 *                 type: number
 *                 description: Percentage value achieved
 *               userId:
 *                 type: string
 *                 description: User ID performing the activity
 *               approverId:
 *                 type: string
 *                 description: Approver user ID
 *               approvedDate:
 *                 type: string
 *                 format: date-time
 *                 description: Approval date
 *     responses:
 *       200:
 *         description: Activity posted successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Task not found
 *       401:
 *         description: Unauthorized
 */
router.post("/:id/activity", authenticate, TaskController.postTaskActivity);
router.post("/:id/historical-entry", authenticate, TaskController.recordHistoricalEntry);

export default router;

