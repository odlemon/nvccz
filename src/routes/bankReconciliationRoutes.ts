// @ts-nocheck
import { Router } from 'express';
import { BankReconciliationController } from '../controllers/BankReconciliationController';
import { authenticate } from '../middleware/authenticate';
import multer from 'multer';

const router = Router();
const controller = new BankReconciliationController();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept CSV and Excel files
    if (file.mimetype === 'text/csv' || 
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     BankReconciliation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         fileName:
 *           type: string
 *         fileUrl:
 *           type: string
 *         status:
 *           type: string
 *           enum: [PENDING, PROCESSING, COMPLETED, FAILED, DELETED]
 *         totalTransactions:
 *           type: integer
 *         matchedCount:
 *           type: integer
 *         unmatchedCount:
 *           type: integer
 *         confidenceThreshold:
 *           type: number
 *         overallAccuracy:
 *           type: number
 *         notes:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         createdBy:
 *           $ref: '#/components/schemas/User'
 *         bankTransactions:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BankTransaction'
 *         reconciliationResults:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ReconciliationResult'
 *     
 *     BankTransaction:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         reconciliationId:
 *           type: string
 *         transactionDate:
 *           type: string
 *           format: date-time
 *         description:
 *           type: string
 *         amount:
 *           type: number
 *         reference:
 *           type: string
 *         isMatched:
 *           type: boolean
 *         confidenceScore:
 *           type: number
 *         matchedJournalEntryId:
 *           type: string
 *         notes:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     ReconciliationResult:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         reconciliationId:
 *           type: string
 *         bankTransactionId:
 *           type: string
 *         journalEntryId:
 *           type: string
 *         matchType:
 *           type: string
 *           enum: [EXACT, FUZZY, MANUAL]
 *         confidenceScore:
 *           type: number
 *         status:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED]
 *         notes:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         createdBy:
 *           $ref: '#/components/schemas/User'
 *     
 *     ReconciliationSummary:
 *       type: object
 *       properties:
 *         totalReconciliations:
 *           type: integer
 *         completedReconciliations:
 *           type: integer
 *         pendingReconciliations:
 *           type: integer
 *         failedReconciliations:
 *           type: integer
 *         totalTransactions:
 *           type: integer
 *         matchedTransactions:
 *           type: integer
 *         unmatchedTransactions:
 *           type: integer
 *         averageAccuracy:
 *           type: number
 *     
 *     ManualMatchRequest:
 *       type: object
 *       required:
 *         - reconciliationId
 *         - bankTransactionId
 *         - journalEntryId
 *       properties:
 *         reconciliationId:
 *           type: string
 *         bankTransactionId:
 *           type: string
 *         journalEntryId:
 *           type: string
 *     
 *     RejectRequest:
 *       type: object
 *       properties:
 *         reason:
 *           type: string
 *           description: Optional reason for rejection
 */

/**
 * @swagger
 * tags:
 *   name: Bank Reconciliation
 *   description: Bank reconciliation management endpoints
 */

/**
 * @swagger
 * /api/accounting/bank-reconciliation/upload:
 *   post:
 *     summary: Upload and process bank statement
 *     tags: [Bank Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Bank statement file (CSV or Excel)
 *     responses:
 *       201:
 *         description: Bank statement uploaded and processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Bad request - Invalid file or missing data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.post('/upload', 
  authenticate, 
  upload.single('file'), 
  controller.uploadBankStatement
);

/**
 * @swagger
 * /api/accounting/bank-reconciliation:
 *   get:
 *     summary: Get all bank reconciliations
 *     tags: [Bank Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PROCESSING, COMPLETED, FAILED, DELETED]
 *         description: Filter by reconciliation status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date
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
 *         description: Reconciliations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get('/', 
  authenticate, 
  controller.getReconciliations
);

/**
 * @swagger
 * /api/accounting/bank-reconciliation/summary:
 *   get:
 *     summary: Get reconciliation summary statistics
 *     tags: [Bank Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reconciliation summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ReconciliationSummary'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get('/summary', 
  authenticate, 
  controller.getReconciliationSummary
);

/**
 * @swagger
 * /api/accounting/bank-reconciliation/{id}:
 *   get:
 *     summary: Get reconciliation by ID
 *     tags: [Bank Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Reconciliation ID
 *     responses:
 *       200:
 *         description: Reconciliation retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/BankReconciliation'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Reconciliation not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', 
  authenticate, 
  controller.getReconciliationById
);

/**
 * @swagger
 * /api/accounting/bank-reconciliation/{reconciliationId}/unmatched:
 *   get:
 *     summary: Get unmatched transactions for manual review
 *     tags: [Bank Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reconciliationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Reconciliation ID
 *       - in: query
 *         name: minAmount
 *         schema:
 *           type: number
 *           default: 5.00
 *         description: Minimum amount threshold for unmatched transactions
 *     responses:
 *       200:
 *         description: Unmatched transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BankTransaction'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get('/:reconciliationId/unmatched', 
  authenticate, 
  controller.getUnmatchedTransactions
);

/**
 * @swagger
 * /api/accounting/bank-reconciliation/transactions/{bankTransactionId}/matches:
 *   get:
 *     summary: Get potential matches for a specific transaction
 *     tags: [Bank Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bankTransactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Bank transaction ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of potential matches to return
 *     responses:
 *       200:
 *         description: Potential matches retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ReconciliationResult'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get('/transactions/:bankTransactionId/matches', 
  authenticate, 
  controller.getPotentialMatches
);

/**
 * @swagger
 * /api/accounting/bank-reconciliation/approve-match:
 *   post:
 *     summary: Approve manual match
 *     tags: [Bank Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ManualMatchRequest'
 *     responses:
 *       200:
 *         description: Manual match approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Bad request - Missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.post('/approve-match', 
  authenticate, 
  controller.approveManualMatch
);

/**
 * @swagger
 * /api/accounting/bank-reconciliation/results/{reconciliationResultId}/reject:
 *   post:
 *     summary: Reject a reconciliation result
 *     tags: [Bank Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reconciliationResultId
 *         required: true
 *         schema:
 *           type: string
 *         description: Reconciliation result ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RejectRequest'
 *     responses:
 *       200:
 *         description: Reconciliation result rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.post('/results/:reconciliationResultId/reject', 
  authenticate, 
  controller.rejectReconciliationResult
);

/**
 * @swagger
 * /api/accounting/bank-reconciliation/{reconciliationId}/audit-trail:
 *   get:
 *     summary: Get audit trail for a reconciliation
 *     tags: [Bank Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reconciliationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Reconciliation ID
 *     responses:
 *       200:
 *         description: Audit trail retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ReconciliationAuditTrail'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get('/:reconciliationId/audit-trail', 
  authenticate, 
  controller.getAuditTrail
);

/**
 * @swagger
 * /api/accounting/bank-reconciliation/{id}:
 *   delete:
 *     summary: Delete reconciliation
 *     tags: [Bank Reconciliation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Reconciliation ID
 *     responses:
 *       200:
 *         description: Reconciliation deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', 
  authenticate, 
  controller.deleteReconciliation
);

// Additional Bank Reconciliation Methods
router.post('/manual-reconcile', 
  authenticate, 
  controller.manualReconcile
);

router.post('/create-journal', 
  authenticate, 
  controller.createJournalFromBankStatement
);

router.get('/:reconciliationId/report', 
  authenticate, 
  controller.generateReconciliationReport
);

router.post('/import', 
  authenticate, 
  upload.single('file'), 
  controller.importBankStatement
);

export default router; 