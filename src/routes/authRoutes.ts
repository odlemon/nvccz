// @ts-nocheck
// routes/authRoutes.ts

import express from "express";
import { authController } from "../controllers/AuthController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user with email and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Bad request - missing email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", authController.login);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Public endpoint to request a password reset link. If the email exists, a reset link will be sent.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Password reset link sent (if email exists)
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
 *                   example: "If an account with that email exists, a password reset link has been sent"
 *       400:
 *         description: Bad request - missing email
 *       500:
 *         description: Internal server error
 */
router.post("/forgot-password", authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using token
 *     description: Public endpoint to reset password using a token from the password reset email.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 example: "reset-token-from-email"
 *               newPassword:
 *                 type: string
 *                 example: "newPassword123"
 *                 description: "New password (must be at least 6 characters)"
 *     responses:
 *       200:
 *         description: Password reset successfully
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
 *                   example: "Password has been reset successfully"
 *       400:
 *         description: Bad request - invalid token or weak password
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post("/reset-password", authController.resetPassword);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user information
 *     description: Retrieve information about the currently authenticated user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
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
 *                     userId:
 *                       type: string
 *                       example: clx1234567890abcdef
 *                     email:
 *                       type: string
 *                       example: admin@nvccz.co.zw
 *                     firstName:
 *                       type: string
 *                       example: Admin
 *                     lastName:
 *                       type: string
 *                       example: User
 *                     role:
 *                       type: string
 *                       example: admin
 *                     permissions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Permission'
 *       401:
 *         description: Unauthorized - invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/me", authenticate, authController.me);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change user password
 *     description: Change the password for the currently authenticated user. Requires current password verification.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: "oldPassword123"
 *                 description: "Current password for verification"
 *               newPassword:
 *                 type: string
 *                 example: "newPassword456"
 *                 description: "New password (must be at least 6 characters)"
 *     responses:
 *       200:
 *         description: Password changed successfully
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
 *                   example: "Password changed successfully"
 *       400:
 *         description: Bad request - missing fields or invalid password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Current password and new password are required"
 *       401:
 *         description: Unauthorized - invalid current password or missing token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Current password is incorrect"
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post("/change-password", authenticate, authController.changePassword);

export default router;
