// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { UserController } from "../controllers/UserController";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/users/by-department:
 *   get:
 *     summary: Get users filtered by department and/or role
 *     description: Used for approval configuration - get list of users to assign to approval steps
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *           enum: [Finance, Operations, Procurement, "Human Resources", Marketing, Legal, IT]
 *         description: Filter by hardcoded department
 *       - in: query
 *         name: departmentRole
 *         schema:
 *           type: string
 *           enum: [HEAD, DEPUTY, MEMBER]
 *         description: Filter by department role
 *     responses:
 *       200:
 *         description: List of users matching the filters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 count:
 *                   type: number
 *                 data:
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
 *                       userDepartment:
 *                         type: string
 *                       departmentRole:
 *                         type: string
 *       401:
 *         description: Unauthorized
 */
router.get("/by-department", UserController.getUsersByDepartmentAndRole);

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a new user with auto-generated password
 *     description: Creates a new user account and sends login credentials via email
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - department
 *               - roleCode
 *               - departmentRole
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 example: "Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@company.com"
 *               department:
 *                 type: string
 *                 enum: [Finance, Sales, Operations, Procurement, "Human Resources", Marketing, Legal, IT]
 *                 example: "Finance"
 *               roleCode:
 *                 type: string
 *                 example: "FIN_OFF"
 *                 description: "Hardcoded role code (e.g., FIN_MGR, SALES_OFF, etc.)"
 *               departmentRole:
 *                 type: string
 *                 enum: [HEAD, DEPUTY, MEMBER, OFFICER, SPECIALIST, ASSISTANT]
 *                 example: "OFFICER"
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
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
 *                         userDepartment:
 *                           type: string
 *                         departmentRole:
 *                           type: string
 *                         roleCode:
 *                           type: string
 *                     temporaryPassword:
 *                       type: string
 *                       description: "Temporary password (also sent via email)"
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/", UserController.createUser);

export default router;
