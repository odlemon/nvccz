// @ts-nocheck
import express from "express";
import { roleController } from "../controllers/RoleController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authenticate";
import { requireCeoOrAdmin } from "../middleware/permissionAuth";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/*
 * @swagger - DISABLED
 * /roles:
 *   post:
 *     summary: Create a new role
 *     description: Create a new role with custom permissions (Admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoleRequest'
 *     responses:
 *       201:
 *         description: Role created successfully
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
 *                   example: Role created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Role'
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict - role name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", requireCeoOrAdmin(), roleController.createRole);

/*
 * @swagger - DISABLED
 * /roles:
 *   get:
 *     summary: Get all roles
 *     description: Retrieve a list of all roles with user counts (Admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Roles retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Role'
 *                       - type: object
 *                         properties:
 *                           _count:
 *                             type: object
 *                             properties:
 *                               users:
 *                                 type: integer
 *                                 example: 1
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", requireCeoOrAdmin(), roleController.getAllRoles);

/*
 * @swagger - DISABLED
 * /roles/{id}:
 *   get:
 *     summary: Get role by ID
 *     description: Retrieve a specific role by ID with assigned users (Admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *         example: clx1234567890abcdef
 *     responses:
 *       200:
 *         description: Role retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Role'
 *                     - type: object
 *                       properties:
 *                         users:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 example: clx1234567890abcdef
 *                               firstName:
 *                                 type: string
 *                                 example: John
 *                               lastName:
 *                                 type: string
 *                                 example: Doe
 *                               email:
 *                                 type: string
 *                                 example: john@example.com
 *                               createdAt:
 *                                 type: string
 *                                 format: date-time
 *                         _count:
 *                           type: object
 *                           properties:
 *                             users:
 *                               type: integer
 *                               example: 1
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Role not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id", requireCeoOrAdmin(), roleController.getRoleById);

/*
 * @swagger - DISABLED
 * /roles/{id}:
 *   put:
 *     summary: Update role
 *     description: Update role information and permissions (Admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *         example: clx1234567890abcdef
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateRoleRequest'
 *     responses:
 *       200:
 *         description: Role updated successfully
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
 *                   example: Role updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Role'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Role not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict - role name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/:id", requireCeoOrAdmin(), roleController.updateRole);

/*
 * @swagger - DISABLED
 * /roles/{id}:
 *   delete:
 *     summary: Delete role
 *     description: Delete a role (Admin only, cannot delete roles with assigned users)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *         example: clx1234567890abcdef
 *     responses:
 *       200:
 *         description: Role deleted successfully
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
 *                   example: Role deleted successfully
 *       400:
 *         description: Bad request - role has assigned users
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Role not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:id", requireCeoOrAdmin(), roleController.deleteRole);

/*
 * @swagger - DISABLED
 * /roles/{id}/permissions:
 *   get:
 *     summary: Get role permissions
 *     description: Retrieve permissions for a specific role (Admin only)
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Role ID
 *         example: clx1234567890abcdef
 *     responses:
 *       200:
 *         description: Role permissions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     roleId:
 *                       type: string
 *                       example: clx1234567890abcdef
 *                     roleName:
 *                       type: string
 *                       example: moderator
 *                     permissions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Permission'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Role not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id/permissions", requireCeoOrAdmin(), roleController.getRolePermissions);

export default router; 
