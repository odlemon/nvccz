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
 * /tasks:
 *   post:
 *     summary: Create a new task
 *     description: New assignees in **team** receive **TASK_ASSIGNED** notifications and **notification_created** (WebSocket). Use **PUT /tasks/{id}** to reassign later.
 *     tags:
 *       - Performance UAT (Tasks & board)
 *       - Tasks
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
 *                 enum: [todo, in_progress, completed, overdue, delayed, amber, red]
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
 *           example:
 *             title: "Prepare April KPI pack"
 *             description: "Compile KPI narrative and upload evidence"
 *             team: ["userAId"]
 *             stage: "todo"
 *             date: "2026-04-30T00:00:00.000Z"
 *             priority: "high"
 *     responses:
 *       201:
 *         description: Task created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 task: { type: object }
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticate, TaskController.createTask);

/**
 * @swagger
 * /tasks:
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
 *           enum: [todo, in_progress, completed, overdue, delayed, amber, red]
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
 * /tasks/status-options:
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
 * /tasks/my:
 *   get:
 *     summary: Get current user's tasks (my board)
 *     description: |
 *       Tasks where the current user is in **team** (not trashed by default). **UAT — after reassign** via
 *       **PUT /tasks/{id}**, a removed assignee will not see the task here; the new assignee will on next fetch or via WebSocket-driven refresh.
 *     tags:
 *       - Performance UAT (Tasks & board)
 *       - Tasks
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *           enum: [todo, in_progress, completed, overdue, delayed, amber, red]
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
 * /tasks/{id}/comments:
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
 * /tasks/{id}/mention-suggestions:
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
 * /tasks/{id}/comments/{commentId}:
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
 * /tasks/{id}/attachments:
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
 * /tasks/statistics:
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
 * /tasks/{id}:
 *   get:
 *     summary: Get task by ID (task details for edit / reassignment)
 *     description: |
 *       **UAT — open task details** before calling **PUT /tasks/{id}** with a new **team** list. Includes **team** and related goal/KPI data for the form.
 *     tags:
 *       - Performance UAT (Tasks & board)
 *       - Tasks
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
 * /tasks/bulk/stage:
 *   put:
 *     summary: Bulk update task stage (multi-select)
 *     description: |
 *       Same service as **PUT /tasks/bulk/status-update**; response is slightly shorter (no `affectedGoalIds` rollup).
 *       **D.05** multi-select column moves — body **`taskIds`** (non-empty array) and **`stage`** (required). Optional
 *       incremental **`monetaryValueAchieved`** / **`percentValueAchieved`** passed through to the bulk stage logic.
 *     tags:
 *       - Performance UAT (Tasks & board)
 *       - Tasks
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskIds
 *               - stage
 *             properties:
 *               taskIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Task IDs to move
 *               stage:
 *                 type: string
 *                 enum: [todo, in_progress, completed, overdue, delayed, amber, red]
 *                 description: New stage to apply to all tasks
 *               monetaryValueAchieved:
 *                 type: number
 *                 description: Optional aggregate increment for the bulk update
 *               percentValueAchieved:
 *                 type: number
 *                 description: Optional aggregate increment for the bulk update
 *           example:
 *             taskIds: ["task1", "task2"]
 *             stage: "in_progress"
 *     responses:
 *       200:
 *         description: Tasks updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Tasks updated successfully" }
 *                 count: { type: number }
 *                 tasks: { type: array, items: { type: object } }
 *       400:
 *         description: Validation error — e.g. taskIds and stage are required
 * /tasks/bulk/status-update:
 *   put:
 *     summary: Bulk status update (D.05 multi-select)
 *     description: |
 *       Dedicated endpoint for bulk column/stage changes. Same request as **PUT /tasks/bulk/stage**; this variant returns
 *       **`affectedGoalIds`** / **`affectedGoalCount`** for performance-goal rollups.
 *     tags:
 *       - Performance UAT (Tasks & board)
 *       - Tasks
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - taskIds
 *               - stage
 *             properties:
 *               taskIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Task IDs to move to the new stage
 *               stage:
 *                 type: string
 *                 enum: [todo, in_progress, completed, overdue, delayed, amber, red]
 *                 description: New stage to apply to all tasks
 *               monetaryValueAchieved:
 *                 type: number
 *               percentValueAchieved:
 *                 type: number
 *           example:
 *             taskIds: ["task1", "task2", "task3"]
 *             stage: "completed"
 *             monetaryValueAchieved: 15000
 *     responses:
 *       200:
 *         description: Bulk status update completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Bulk status update completed successfully" }
 *                 count: { type: number }
 *                 affectedGoalCount: { type: number }
 *                 affectedGoalIds:
 *                   type: array
 *                   items: { type: string }
 *                 tasks: { type: array, items: { type: object } }
 *       400:
 *         description: Validation or business error
 */
router.put("/bulk/stage", authenticate, TaskController.bulkUpdateTaskStage);
router.put("/bulk/status-update", authenticate, TaskController.bulkStatusUpdate);
router.delete("/bulk", authenticate, TaskController.bulkTrashTasks);
router.delete("/:id", authenticate, TaskController.deleteTask);

/**
 * @swagger
 * /tasks/{id}/stage:
 *   put:
 *     summary: Update task stage
 *     tags:
 *       - Performance UAT (Tasks & board)
 *       - Tasks
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
 *                 enum: [todo, in_progress, completed, overdue, delayed, amber, red]
 *                 description: New task stage
 *               monetaryValueAchieved:
 *                 type: number
 *                 description: Additional monetary value achieved
 *               percentValueAchieved:
 *                 type: number
 *                 description: Additional percentage value achieved
 *           example:
 *             stage: "completed"
 *             monetaryValueAchieved: 5000
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

/**
 * @swagger
 * /tasks/{id}:
 *   put:
 *     summary: Update task (reassign, fields, performance links)
 *     description: |
 *       **UAT — reassign task:** send **`team`** as the full list of assignee user IDs. Users removed from
 *       **`team`** no longer see the task on **GET /tasks/my**; each user newly added gets a **TASK_ASSIGNED**
 *       notification (title: "New task assigned") and a **`notification_created`** WebSocket event for instant UI updates.
 *     tags:
 *       - Performance UAT (Tasks & board)
 *       - Tasks
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
 *                 description: Full list of assignee user IDs (replace entire assignment set)
 *               stage:
 *                 type: string
 *                 enum: [todo, in_progress, completed, overdue, delayed, amber, red]
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
 *           example:
 *             team: ["userBId"]
 *             priority: "high"
 *     responses:
 *       200:
 *         description: Task updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 task: { type: object }
 *       400:
 *         description: Bad request
 *       404:
 *         description: Task not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", authenticate, TaskController.updateTask);

/**
 * @swagger
 * /tasks/{id}/activity:
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

