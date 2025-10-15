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

export default router;
