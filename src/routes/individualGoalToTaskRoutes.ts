// @ts-nocheck
import express from "express";
import { IndividualGoalToTaskController } from "../controllers/IndividualGoalToTaskController";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"
import { goalRule, scoped, personInScope, departmentInScope } from "../services/PerformanceScope";

const router = express.Router();
const READ_KEYS = ["performance.goals.view", "performance.goals.manage"]
const WRITE_KEYS = ["performance.goals.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)

// Every route in this file was mounted with no guard at all: three of them mutate data
// (goal→task conversion) and two read per-user / per-department task lists. All five were
// reachable without a token on local, arcus-dev and nvccz-prod. Applied router-wide rather
// than per-route so a future addition cannot silently inherit the old behaviour.
// See design-refs/performance-role-matrix.md §4.1.
router.use(authenticate);
router.use(guard);
const userRule = scoped(async (req, a) => ((await personInScope(a, req.params.userId)) ? null : "That person is outside what your role can see."));
const deptRule = scoped(async (req, a) => (departmentInScope(a, req.params.departmentName) ? null : "That department is outside what your role can see."));

/**
 * @swagger
 * /api/performance/individual-goals/{individualGoalId}/convert-to-tasks:
 *   post:
 *     summary: Convert individual goal to tasks
 *     description: Convert a specific individual goal to tasks for the assigned user
 *     tags: [Individual Goal to Task Conversion]
 *     parameters:
 *       - in: path
 *         name: individualGoalId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the individual goal to convert
 *     responses:
 *       200:
 *         description: Individual goal converted to tasks successfully
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
 *         description: Bad request - missing individual goal ID
 *       500:
 *         description: Internal server error
 */
router.post("/individual-goals/:individualGoalId/convert-to-tasks", goalRule("individualGoalId", "write"), IndividualGoalToTaskController.convertIndividualGoalToTasks);

/**
 * @swagger
 * /api/performance/users/{userId}/convert-goals-to-tasks:
 *   post:
 *     summary: Convert all user individual goals to tasks
 *     description: Convert all individual goals assigned to a specific user to tasks
 *     tags: [Individual Goal to Task Conversion]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user whose goals should be converted
 *     responses:
 *       200:
 *         description: User individual goals converted to tasks successfully
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
 *         description: Bad request - missing user ID
 *       500:
 *         description: Internal server error
 */
router.post("/users/:userId/convert-goals-to-tasks", userRule, IndividualGoalToTaskController.convertUserGoalsToTasks);

/**
 * @swagger
 * /api/performance/departments/{departmentName}/convert-goals-to-tasks:
 *   post:
 *     summary: Convert all department individual goals to tasks
 *     description: Convert all individual goals in a specific department to tasks
 *     tags: [Individual Goal to Task Conversion]
 *     parameters:
 *       - in: path
 *         name: departmentName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Finance, Sales, Operations, Procurement, "Human Resources", Marketing, Legal, IT]
 *         description: Hardcoded department name
 *     responses:
 *       200:
 *         description: Department individual goals converted to tasks successfully
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
 *         description: Bad request - invalid department name
 *       500:
 *         description: Internal server error
 */
router.post("/departments/:departmentName/convert-goals-to-tasks", deptRule, IndividualGoalToTaskController.convertDepartmentGoalsToTasks);

/**
 * @swagger
 * /api/performance/users/{userId}/performance-tasks:
 *   get:
 *     summary: Get user's performance tasks
 *     description: Get all performance tasks assigned to a specific user (linked to goals)
 *     tags: [Individual Goal to Task Conversion]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user
 *     responses:
 *       200:
 *         description: User performance tasks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
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
 *       400:
 *         description: Bad request - missing user ID
 *       500:
 *         description: Internal server error
 */
router.get("/users/:userId/performance-tasks", userRule, IndividualGoalToTaskController.getUserPerformanceTasks);

/**
 * @swagger
 * /api/performance/departments/{departmentName}/performance-tasks:
 *   get:
 *     summary: Get department's performance tasks
 *     description: Get all performance tasks in a specific department (linked to goals)
 *     tags: [Individual Goal to Task Conversion]
 *     parameters:
 *       - in: path
 *         name: departmentName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Finance, Sales, Operations, Procurement, "Human Resources", Marketing, Legal, IT]
 *         description: Hardcoded department name
 *     responses:
 *       200:
 *         description: Department performance tasks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
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
 *       400:
 *         description: Bad request - invalid department name
 *       500:
 *         description: Internal server error
 */
router.get("/departments/:departmentName/performance-tasks", deptRule, IndividualGoalToTaskController.getDepartmentPerformanceTasks);

export default router;
