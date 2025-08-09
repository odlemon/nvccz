// @ts-nocheck
import { Router } from 'express';
import { MiniKycController } from '../controllers/MiniKycController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/mini-kyc:
 *   post:
 *     summary: Create or update mini-KYC for the authenticated user
 *     tags: [Mini-KYC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateMiniKycRequest'
 *     responses:
 *       200:
 *         description: Mini-KYC created/updated successfully
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
 *                   $ref: '#/components/schemas/MiniKyc'
 *       400:
 *         description: Bad request - data field is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/', MiniKycController.createOrUpdateMiniKyc);

/**
 * @swagger
 * /api/mini-kyc:
 *   get:
 *     summary: Get mini-KYC for the authenticated user
 *     tags: [Mini-KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mini-KYC retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/MiniKyc'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', MiniKycController.getMiniKyc);

/**
 * @swagger
 * /api/mini-kyc:
 *   put:
 *     summary: Update mini-KYC for the authenticated user
 *     tags: [Mini-KYC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMiniKycRequest'
 *     responses:
 *       200:
 *         description: Mini-KYC updated successfully
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
 *                   $ref: '#/components/schemas/MiniKyc'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Mini-KYC not found for this user
 *       500:
 *         description: Internal server error
 */
router.put('/', MiniKycController.updateMiniKyc);

/**
 * @swagger
 * /api/mini-kyc:
 *   delete:
 *     summary: Delete mini-KYC for the authenticated user
 *     tags: [Mini-KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mini-KYC deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Mini-KYC not found for this user
 *       500:
 *         description: Internal server error
 */
router.delete('/', MiniKycController.deleteMiniKyc);

/**
 * @swagger
 * /api/mini-kyc/status:
 *   get:
 *     summary: Check if user has completed mini-KYC
 *     tags: [Mini-KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: KYC status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isCompleted:
 *                       type: boolean
 *                     userId:
 *                       type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/status', MiniKycController.getKycStatus);

/**
 * @swagger
 * /api/mini-kyc/all:
 *   get:
 *     summary: Get all mini-KYC records (admin only)
 *     tags: [Mini-KYC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All mini-KYC records retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MiniKyc'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied - Admin role required
 *       500:
 *         description: Internal server error
 */
router.get('/all', MiniKycController.getAllMiniKyc);

export default router; 