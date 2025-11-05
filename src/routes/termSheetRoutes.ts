//@ts-nocheck
import express from 'express';
import { TermSheetController } from '../controllers/TermSheetController';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/permissionAuth';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     TermSheet:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         applicationId:
 *           type: string
 *         createdById:
 *           type: string
 *         title:
 *           type: string
 *         version:
 *           type: string
 *         status:
 *           type: string
 *           enum: [DRAFT, FINAL, SIGNED]
 *         investmentAmount:
 *           type: number
 *         equityPercentage:
 *           type: number
 *         valuation:
 *           type: number
 *         keyTerms:
 *           type: string
 *         conditions:
 *           type: string
 *         timeline:
 *           type: string
 *         documentUrl:
 *           type: string
 *         documentFileName:
 *           type: string
 *         documentSize:
 *           type: number
 *         isDraft:
 *           type: boolean
 *         isFinal:
 *           type: boolean
 *         isSigned:
 *           type: boolean
 *         signedAt:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         application:
 *           $ref: '#/components/schemas/Application'
 *         createdBy:
 *           $ref: '#/components/schemas/User'
 *     
 *     CreateTermSheetRequest:
 *       type: object
 *       required:
 *         - title
 *         - investmentAmount
 *       properties:
 *         title:
 *           type: string
 *         investmentAmount:
 *           type: number
 *         equityPercentage:
 *           type: number
 *         valuation:
 *           type: number
 *         keyTerms:
 *           type: string
 *         conditions:
 *           type: string
 *         timeline:
 *           type: string
 *         documentUrl:
 *           type: string
 *         documentFileName:
 *           type: string
 *         documentSize:
 *           type: number
 *     
 *     UpdateTermSheetRequest:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *         investmentAmount:
 *           type: number
 *         equityPercentage:
 *           type: number
 *         valuation:
 *           type: number
 *         keyTerms:
 *           type: string
 *         conditions:
 *           type: string
 *         timeline:
 *           type: string
 *         documentUrl:
 *           type: string
 *         documentFileName:
 *           type: string
 *         documentSize:
 *           type: number
 *         status:
 *           type: string
 *         isDraft:
 *           type: boolean
 *         isFinal:
 *           type: boolean
 */

/**
 * @swagger
 * /api/term-sheets/{applicationId}:
 *   post:
 *     summary: Create a new term sheet for an application
 *     tags: [Term Sheets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTermSheetRequest'
 *     responses:
 *       201:
 *         description: Term sheet created successfully
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
 *                   $ref: '#/components/schemas/TermSheet'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
/**
 * @swagger
 * /api/term-sheets/my:
 *   get:
 *     summary: Get my term sheets
 *     tags: [Term Sheets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: My term sheets retrieved successfully
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
 *                     termSheets:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/TermSheet'
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/my', authenticate, TermSheetController.getMyTermSheets);

router.post('/:applicationId', authenticate, authorize(['admin', 'fund_manager']), TermSheetController.createTermSheet);

/**
 * @swagger
 * /api/term-sheets/{applicationId}:
 *   get:
 *     summary: Get term sheet by application ID
 *     tags: [Term Sheets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Term sheet retrieved successfully
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
 *                   $ref: '#/components/schemas/TermSheet'
 *       404:
 *         description: Term sheet not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:applicationId', authenticate, TermSheetController.getTermSheetByApplicationId);

/**
 * @swagger
 * /api/term-sheets/{applicationId}:
 *   put:
 *     summary: Update term sheet
 *     tags: [Term Sheets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateTermSheetRequest'
 *     responses:
 *       200:
 *         description: Term sheet updated successfully
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
 *                   $ref: '#/components/schemas/TermSheet'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.put('/:applicationId', authenticate, authorize(['admin', 'fund_manager']), TermSheetController.updateTermSheet);

/**
 * @swagger
 * /api/term-sheets/{applicationId}/finalize:
 *   post:
 *     summary: Mark term sheet as final
 *     tags: [Term Sheets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Term sheet marked as final successfully
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
 *                   $ref: '#/components/schemas/TermSheet'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/:applicationId/finalize', authenticate, authorize(['admin', 'fund_manager']), TermSheetController.markAsFinal);

/**
 * @swagger
 * /api/term-sheets/{applicationId}/sign:
 *   post:
 *     summary: Sign term sheet
 *     tags: [Term Sheets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Term sheet signed successfully
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
 *                   $ref: '#/components/schemas/TermSheet'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/:applicationId/sign', authenticate, authorize(['applicant']), TermSheetController.signTermSheet);

/**
 * @swagger
 * /api/term-sheets:
 *   get:
 *     summary: Get all term sheets
 *     tags: [Term Sheets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, FINAL, SIGNED]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Term sheets retrieved successfully
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
 *                     termSheets:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/TermSheet'
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/', authenticate, authorize(['admin', 'fund_manager']), TermSheetController.getAllTermSheets);

export default router;
