// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { UserController } from "../controllers/UserController";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users
 *     description: Retrieve a list of all users in the system
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
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
 *                       roleCode:
 *                         type: string
 *                       role:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           description:
 *                             type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get("/", UserController.getAllUsers);

/**
 * @swagger
 * /users/by-department:
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
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieve a specific user by their ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User retrieved successfully
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
 *                     id:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     userDepartment:
 *                       type: string
 *                     departmentRole:
 *                       type: string
 *                     roleCode:
 *                       type: string
 *                     role:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         description:
 *                           type: string
 *                         permissions:
 *                           type: array
 *                           items:
 *                             type: object
 *       404:
 *         description: User not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", UserController.getUserById);

/**
 * @swagger
 * /users:
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
 *                 enum:
 *                   - Finance
 *                   - Sales
 *                   - Operations
 *                   - Procurement
 *                   - "Human Resources"
 *                   - Marketing
 *                   - Legal
 *                   - IT
 *                 example: "Finance"
 *                 description: "User's department (must match one of the allowed values)"
 *               roleCode:
 *                 type: string
 *                 example: "FIN_OFF"
 *                 description: "Hardcoded role code (e.g., FIN_MGR, FIN_OFF, SALES_OFF, PROC_MGR, OPS_MGR, etc.)"
 *               departmentRole:
 *                 type: string
 *                 enum:
 *                   - HEAD
 *                   - DEPUTY
 *                   - MEMBER
 *                   - OFFICER
 *                   - SPECIALIST
 *                   - ASSISTANT
 *                 example: "OFFICER"
 *                 description: "User's role within the department"
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

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update user
 *     description: Update an existing user's information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: "John"
 *                 description: "User's first name"
 *               lastName:
 *                 type: string
 *                 example: "Doe"
 *                 description: "User's last name"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john.doe@nvccz.co.zw"
 *                 description: "Valid email address (will be converted to lowercase automatically)"
 *               department:
 *                 type: string
 *                 enum:
 *                   - Finance
 *                   - Sales
 *                   - Operations
 *                   - Procurement
 *                   - "Human Resources"
 *                   - Marketing
 *                   - Legal
 *                   - IT
 *                 example: "Finance"
 *                 description: "User's department (must match one of the allowed values)"
 *               roleCode:
 *                 type: string
 *                 example: "FIN_OFF"
 *                 description: "Hardcoded role code (e.g., FIN_MGR, FIN_OFF, SALES_OFF, PROC_MGR, OPS_MGR, etc.)"
 *               departmentRole:
 *                 type: string
 *                 enum:
 *                   - HEAD
 *                   - DEPUTY
 *                   - MEMBER
 *                   - OFFICER
 *                   - SPECIALIST
 *                   - ASSISTANT
 *                 example: "OFFICER"
 *                 description: "User's role within the department"
 *               roleId:
 *                 type: string
 *                 example: "clx1234567890abcdef"
 *                 description: "Optional: Role ID to assign to user (if provided, will override roleCode)"
 *     responses:
 *       200:
 *         description: User updated successfully
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
 *                     id:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     userDepartment:
 *                       type: string
 *                     departmentRole:
 *                       type: string
 *                     roleCode:
 *                       type: string
 *                     role:
 *                       type: object
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.put("/:id", UserController.updateUser);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user
 *     description: Delete a user from the system. Cannot delete the last admin user.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
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
 *         description: Bad request - cannot delete last admin user
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.delete("/:id", UserController.deleteUser);

export default router;
