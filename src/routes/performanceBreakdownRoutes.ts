// @ts-nocheck
import express from "express";
import { PerformanceBreakdownController } from "../controllers/PerformanceBreakdownController";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"
import { goalRule, orgOnly, scoped, personInScope, departmentInScope } from "../services/PerformanceScope";

const router = express.Router();
// breaking a goal down to departments and people is part of goals (the matrix has no separate row for it)
const READ_KEYS = ["performance.goals.view", "performance.goals.manage"]
const WRITE_KEYS = ["performance.goals.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)

/**
 * @swagger
 * /api/performance/breakdown/departments:
 *   post:
 *     summary: Create department breakdown goals
 *     description: Manually create department goals from an organizational goal
 *     tags: [Performance Breakdown]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - parentGoalId
 *               - selectedDepartments
 *               - breakdownData
 *             properties:
 *               parentGoalId:
 *                 type: string
 *                 description: ID of the parent organizational goal
 *               selectedDepartments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [Finance, Sales, Operations, Procurement, "Human Resources", Marketing, Legal, IT, Investments]
 *                 description: Array of hardcoded department names to create goals for
 *               breakdownData:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                       description: Custom title for the department goal
 *                     description:
 *                       type: string
 *                       description: Custom description for the department goal
 *                     targetValue:
 *                       type: number
 *                       description: Target value for this department
 *                     targetUnit:
 *                       type: string
 *                       description: Unit for the target value (USD, clients, etc.)
 *                     priority:
 *                       type: string
 *                       enum: [low, medium, high, critical]
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     targetOperator:
 *                       type: string
 *                       enum: [>=, <=, =]
 *                     dataSourceModule:
 *                       type: string
 *                       enum: [Accounting, Procurement, PortfolioManagement, TaskManagement, Events, Manual]
 *                     dataSourceField:
 *                       type: string
 *                       description: Specific field path in source module
 *                     trackingFrequency:
 *                       type: string
 *                       enum: [Daily, Weekly, Monthly]
 *     responses:
 *       201:
 *         description: Department goals created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 goals:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PerformanceGoal'
 *       400:
 *         description: Bad request - invalid input
 *       500:
 *         description: Internal server error
 */
router.post("/departments", authenticate, guard, orgOnly("Breaking a company goal down across departments needs an organisation-wide role."), PerformanceBreakdownController.createDepartmentBreakdown);

/**
 * @swagger
 * /api/performance/breakdown/individuals:
 *   post:
 *     summary: Create individual breakdown goals
 *     description: Manually create individual goals from a department goal
 *     tags: [Performance Breakdown]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - departmentGoalId
 *               - selectedUsers
 *               - individualData
 *             properties:
 *               departmentGoalId:
 *                 type: string
 *                 description: ID of the parent department goal
 *               selectedUsers:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of user IDs to create goals for
 *               individualData:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                       description: Custom title for the individual goal
 *                     description:
 *                       type: string
 *                       description: Custom description for the individual goal
 *                     targetValue:
 *                       type: number
 *                       description: Target value for this individual
 *                     targetUnit:
 *                       type: string
 *                       description: Unit for the target value (USD, clients, etc.)
 *                     priority:
 *                       type: string
 *                       enum: [low, medium, high, critical]
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     targetOperator:
 *                       type: string
 *                       enum: [>=, <=, =]
 *                     dataSourceModule:
 *                       type: string
 *                       enum: [Accounting, Procurement, PortfolioManagement, TaskManagement, Events, Manual]
 *                     dataSourceField:
 *                       type: string
 *                       description: Specific field path in source module
 *                     trackingFrequency:
 *                       type: string
 *                       enum: [Daily, Weekly, Monthly]
 *     responses:
 *       201:
 *         description: Individual goals created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 goals:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PerformanceGoal'
 *       400:
 *         description: Bad request - invalid input
 *       500:
 *         description: Internal server error
 */
router.post("/individuals", authenticate, guard, goalRule("departmentGoalId", "write"), scoped(async (req, a) => { for (const u of Array.isArray(req.body?.selectedUsers) ? req.body.selectedUsers : []) if (!(await personInScope(a, typeof u === "object" ? u?.id || u?.userId : u))) return "You can only assign goals to people in your department."; }), PerformanceBreakdownController.createIndividualBreakdown);

/**
 * @swagger
 * /api/performance/breakdown/departments/available:
 *   get:
 *     summary: Get available departments for breakdown
 *     description: Get list of hardcoded departments available for goal breakdown
 *     tags: [Performance Breakdown]
 *     responses:
 *       200:
 *         description: Available departments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 departments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         enum: [Finance, Sales, Operations, Procurement, "Human Resources", Marketing, Legal, IT, Investments]
 *                       description:
 *                         type: string
 *       500:
 *         description: Internal server error
 */
// `authenticate` was missing here while the two POSTs above already had it — an omission,
// not a deliberate public endpoint. Verified unauthenticated 200 on local, arcus-dev and
// nvccz-prod before this fix (see design-refs/performance-role-matrix.md §4.1).
router.get("/departments/available", authenticate, guard, PerformanceBreakdownController.getAvailableDepartments);

/**
 * @swagger
 * /api/performance/breakdown/users/{departmentName}:
 *   get:
 *     summary: Get users by department
 *     description: Get list of users in a specific department for individual goal assignment
 *     tags: [Performance Breakdown]
 *     parameters:
 *       - in: path
 *         name: departmentName
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Finance, Sales, Operations, Procurement, "Human Resources", Marketing, Legal, IT, Investments]
 *         description: Hardcoded department name
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       email:
 *                         type: string
 *                       role:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           level:
 *                             type: number
 *       400:
 *         description: Bad request - invalid department name
 *       500:
 *         description: Internal server error
 */
// Returns id, firstName, lastName and email for every user in the department — this was
// reachable with no token at all. Same omission as the route above.
router.get("/users/:departmentName", authenticate, guard, scoped(async (req, a) => (departmentInScope(a, req.params.departmentName) ? null : "You can only list your own department's people.")), PerformanceBreakdownController.getUsersByDepartment);

export default router;
