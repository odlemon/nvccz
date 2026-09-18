// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { requireInternalStaffUser, requirePermission } from "../middleware/permissionAuth";
import { UserController } from "../controllers/UserController";
import { SavedFilterFavoriteController } from "../controllers/SavedFilterFavoriteController";

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
// Directory listing: internal audience, but every staff role legitimately needs
// it (assignment pickers, reviewer selection), so this is a staff check rather
// than a specific permission.
router.get("/", requireInternalStaffUser(), UserController.getAllUsers);

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
 * /users/me/saved-filter-favorites:
 *   get:
 *     summary: List my saved filter favorites
 *     description: Optional query routeKey scopes to one screen/module (client-defined key).
 *     tags: [Saved filter favorites]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: routeKey
 *         schema: { type: string }
 *         example: sales-invoices
 *     responses:
 *       200:
 *         description: List of presets with name, routeKey, filters JSON
 *   post:
 *     summary: Save a named filter preset
 *     tags: [Saved filter favorites]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, routeKey, filters]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Western Region Sales
 *               routeKey:
 *                 type: string
 *                 description: Client route or module key so the UI knows where to apply filters
 *                 example: sales-invoices
 *               filters:
 *                 type: object
 *                 description: Arbitrary JSON your frontend replays as query/body when opening the favorite
 *               sortOrder:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Created
 */
router.get("/me/saved-filter-favorites", SavedFilterFavoriteController.list);
router.post("/me/saved-filter-favorites", SavedFilterFavoriteController.create);

/**
 * @swagger
 * /users/me/saved-filter-favorites/{presetId}:
 *   get:
 *     summary: Get one saved filter favorite
 *     tags: [Saved filter favorites]
 *     security:
 *       - bearerAuth: []
 *   patch:
 *     summary: Update name, routeKey, filters, or sortOrder
 *     tags: [Saved filter favorites]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Remove a favorite
 *     tags: [Saved filter favorites]
 *     security:
 *       - bearerAuth: []
 */
router.get("/me/saved-filter-favorites/:presetId", SavedFilterFavoriteController.getById);
router.patch("/me/saved-filter-favorites/:presetId", SavedFilterFavoriteController.update);
router.delete("/me/saved-filter-favorites/:presetId", SavedFilterFavoriteController.remove);

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
 *                   - Investments
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
// Account creation is privilege granting: it returns a temporary password and
// assigns a role. Guarded strictly -- an INVESTEE account reached this and
// created an IT_MGR user.
router.post("/", requireInternalStaffUser(), requirePermission("manage_users"), UserController.createUser);

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
 *                   - Investments
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
router.put("/:id", requireInternalStaffUser(), requirePermission("manage_users"), UserController.updateUser);

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete user
 *     description: Delete a user from the system. Cannot delete the last admin user. Journal entries and other owned records are automatically reassigned to another admin before deletion.
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
