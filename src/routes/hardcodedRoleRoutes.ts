// @ts-nocheck
import express from "express";
import { HardcodedRoleController } from "../controllers/HardcodedRoleController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();
const controller = new HardcodedRoleController();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Hardcoded Roles
 *   description: Hardcoded system roles grouped by department
 */

/**
 * @swagger
 * /hardcoded-roles:
 *   get:
 *     summary: Get all hardcoded roles
 *     description: Retrieve all 35 hardcoded system roles across all 7 departments as a flat list
 *     tags: [Hardcoded Roles]
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
 *                 message:
 *                   type: string
 *                   example: Hardcoded roles retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code:
 *                         type: string
 *                         example: FIN_MGR
 *                       name:
 *                         type: string
 *                         example: Finance Manager
 *                       level:
 *                         type: integer
 *                         example: 5
 *                       department:
 *                         type: string
 *                         example: Finance
 *                       description:
 *                         type: string
 *                         example: Head of finance department, oversees all financial operations
 *                 count:
 *                   type: integer
 *                   example: 35
 *       401:
 *         description: Unauthorized - missing or invalid token
 */
router.get("/", controller.getAllRoles.bind(controller));

/**
 * @swagger
 * /hardcoded-roles/departments-with-roles:
 *   get:
 *     summary: Get all departments with their roles (RECOMMENDED)
 *     description: Retrieve all 7 departments grouped with their respective roles. This is the preferred endpoint for getting the complete role structure organized by department.
 *     tags: [Hardcoded Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Departments with roles retrieved successfully
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
 *                   example: All departments with roles retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       department:
 *                         type: string
 *                         example: Finance
 *                       departmentCode:
 *                         type: string
 *                         example: FINANCE
 *                       description:
 *                         type: string
 *                         example: Finance Department
 *                       roles:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             code:
 *                               type: string
 *                               example: FIN_MGR
 *                             name:
 *                               type: string
 *                               example: Finance Manager
 *                             level:
 *                               type: integer
 *                               example: 5
 *                             department:
 *                               type: string
 *                               example: Finance
 *                             description:
 *                               type: string
 *                               example: Head of finance department, oversees all financial operations
 *                 count:
 *                   type: integer
 *                   example: 7
 *       401:
 *         description: Unauthorized - missing or invalid token
 */
router.get("/departments-with-roles", controller.getAllDepartmentsWithRoles.bind(controller));

/**
 * @swagger
 * /hardcoded-roles/departments:
 *   get:
 *     summary: Get all departments
 *     description: Retrieve a list of all 7 departments without their roles
 *     tags: [Hardcoded Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Departments retrieved successfully
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
 *                   example: All departments retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                         example: Finance
 *                       code:
 *                         type: string
 *                         example: FINANCE
 *                       description:
 *                         type: string
 *                         example: Finance Department
 *                 count:
 *                   type: integer
 *                   example: 7
 *       401:
 *         description: Unauthorized - missing or invalid token
 */
router.get("/departments", controller.getAllDepartments.bind(controller));

export default router;

