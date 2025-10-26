// @ts-nocheck
import express from "express";
import { EntryTypeController } from "../controllers/EntryTypeController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/cashbook/entry-types:
 *   post:
 *     summary: Create entry type
 *     description: Create a new cashbook entry type with D/C designation and account access control
 *     tags: [Cashbook - Entry Types]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - transactionType
 *               - counterpartyType
 *             properties:
 *               name:
 *                 type: string
 *                 description: Entry type name
 *                 example: "Customer Receipt"
 *               description:
 *                 type: string
 *                 description: Entry type description
 *                 example: "Receipt from customer payment"
 *               transactionType:
 *                 type: string
 *                 enum: [RECEIPT, PAYMENT]
 *                 description: Transaction type
 *               counterpartyType:
 *                 type: string
 *                 enum: [GL, CUSTOMER, SUPPLIER, ANY]
 *                 description: Allowed counterparty type
 *               defaultGlAccountId:
 *                 type: string
 *                 description: Default GL account ID
 *               isActive:
 *                 type: boolean
 *                 default: true
 *                 description: Whether entry type is active
 *               requiresProjectCode:
 *                 type: boolean
 *                 default: false
 *                 description: Whether project code is required
 *               requiresReference:
 *                 type: boolean
 *                 default: false
 *                 description: Whether reference is required
 *               autoGenerateReference:
 *                 type: boolean
 *                 default: false
 *                 description: Whether to auto-generate reference
 *               referencePrefix:
 *                 type: string
 *                 description: Reference prefix for auto-generation
 *                 example: "CR"
 *               debitCreditLogic:
 *                 type: string
 *                 enum: [AUTO, MANUAL]
 *                 default: AUTO
 *                 description: Debit/credit logic
 *               defaultDebitCredit:
 *                 type: string
 *                 enum: [DEBIT, CREDIT]
 *                 default: DEBIT
 *                 description: Default debit/credit designation
 *     responses:
 *       200:
 *         description: Entry type created successfully
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
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     transactionType:
 *                       type: string
 *                     counterpartyType:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/", EntryTypeController.createEntryType);

/**
 * @swagger
 * /api/cashbook/entry-types:
 *   get:
 *     summary: Get all entry types
 *     description: Get all cashbook entry types with optional filtering
 *     tags: [Cashbook - Entry Types]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: transactionType
 *         schema:
 *           type: string
 *           enum: [RECEIPT, PAYMENT]
 *         description: Filter by transaction type
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Entry types retrieved successfully
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       transactionType:
 *                         type: string
 *                       counterpartyType:
 *                         type: string
 *                       isActive:
 *                         type: boolean
 *                       defaultGlAccount:
 *                         type: object
 *                       createdBy:
 *                         type: object
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get("/", EntryTypeController.getEntryTypes);

/**
 * @swagger
 * /api/cashbook/entry-types/{entryTypeId}:
 *   get:
 *     summary: Get entry type by ID
 *     description: Get detailed information about a specific entry type
 *     tags: [Cashbook - Entry Types]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entryTypeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Entry type ID
 *     responses:
 *       200:
 *         description: Entry type retrieved successfully
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
 *                     name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     transactionType:
 *                       type: string
 *                     counterpartyType:
 *                       type: string
 *                     defaultGlAccountId:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     requiresProjectCode:
 *                       type: boolean
 *                     requiresReference:
 *                       type: boolean
 *                     autoGenerateReference:
 *                       type: boolean
 *                     referencePrefix:
 *                       type: string
 *                     debitCreditLogic:
 *                       type: string
 *                     defaultDebitCredit:
 *                       type: string
 *                     defaultGlAccount:
 *                       type: object
 *                     createdBy:
 *                       type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/:entryTypeId", EntryTypeController.getEntryType);

/**
 * @swagger
 * /api/cashbook/entry-types/{entryTypeId}:
 *   put:
 *     summary: Update entry type
 *     description: Update an existing entry type
 *     tags: [Cashbook - Entry Types]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entryTypeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Entry type ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Entry type name
 *               description:
 *                 type: string
 *                 description: Entry type description
 *               transactionType:
 *                 type: string
 *                 enum: [RECEIPT, PAYMENT]
 *                 description: Transaction type
 *               counterpartyType:
 *                 type: string
 *                 enum: [GL, CUSTOMER, SUPPLIER, ANY]
 *                 description: Allowed counterparty type
 *               defaultGlAccountId:
 *                 type: string
 *                 description: Default GL account ID
 *               isActive:
 *                 type: boolean
 *                 description: Whether entry type is active
 *               requiresProjectCode:
 *                 type: boolean
 *                 description: Whether project code is required
 *               requiresReference:
 *                 type: boolean
 *                 description: Whether reference is required
 *               autoGenerateReference:
 *                 type: boolean
 *                 description: Whether to auto-generate reference
 *               referencePrefix:
 *                 type: string
 *                 description: Reference prefix for auto-generation
 *               debitCreditLogic:
 *                 type: string
 *                 enum: [AUTO, MANUAL]
 *                 description: Debit/credit logic
 *               defaultDebitCredit:
 *                 type: string
 *                 enum: [DEBIT, CREDIT]
 *                 description: Default debit/credit designation
 *     responses:
 *       200:
 *         description: Entry type updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.put("/:entryTypeId", EntryTypeController.updateEntryType);

/**
 * @swagger
 * /api/cashbook/entry-types/{entryTypeId}:
 *   delete:
 *     summary: Delete entry type
 *     description: Delete an entry type (only if not used in transactions)
 *     tags: [Cashbook - Entry Types]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entryTypeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Entry type ID
 *     responses:
 *       200:
 *         description: Entry type deleted successfully
 *       400:
 *         description: Bad request - entry type is in use
 *       401:
 *         description: Unauthorized
 */
router.delete("/:entryTypeId", EntryTypeController.deleteEntryType);

/**
 * @swagger
 * /api/cashbook/entry-types/transaction/{transactionType}:
 *   get:
 *     summary: Get entry types for transaction
 *     description: Get entry types available for creating a specific transaction type
 *     tags: [Cashbook - Entry Types]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [RECEIPT, PAYMENT]
 *         description: Transaction type
 *       - in: query
 *         name: counterpartyType
 *         schema:
 *           type: string
 *           enum: [GL, CUSTOMER, SUPPLIER]
 *         description: Filter by counterparty type
 *     responses:
 *       200:
 *         description: Entry types retrieved successfully
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       transactionType:
 *                         type: string
 *                       counterpartyType:
 *                         type: string
 *                       defaultGlAccount:
 *                         type: object
 *                       requiresProjectCode:
 *                         type: boolean
 *                       requiresReference:
 *                         type: boolean
 *                       autoGenerateReference:
 *                         type: boolean
 *                       referencePrefix:
 *                         type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/transaction/:transactionType", EntryTypeController.getEntryTypesForTransaction);

/**
 * @swagger
 * /api/cashbook/entry-types/statistics:
 *   get:
 *     summary: Get entry type statistics
 *     description: Get statistics about entry types
 *     tags: [Cashbook - Entry Types]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
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
 *                     total:
 *                       type: number
 *                     active:
 *                       type: number
 *                     inactive:
 *                       type: number
 *                     byTransactionType:
 *                       type: object
 *                       properties:
 *                         receipt:
 *                           type: number
 *                         payment:
 *                           type: number
 *                     byCounterpartyType:
 *                       type: object
 *                       properties:
 *                         gl:
 *                           type: number
 *                         customer:
 *                           type: number
 *                         supplier:
 *                           type: number
 *                         any:
 *                           type: number
 *       401:
 *         description: Unauthorized
 */
router.get("/statistics", EntryTypeController.getEntryTypeStatistics);

/**
 * @swagger
 * /api/cashbook/entry-types/{entryTypeId}/validate:
 *   get:
 *     summary: Validate entry type configuration
 *     description: Validate an entry type configuration for issues
 *     tags: [Cashbook - Entry Types]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entryTypeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Entry type ID
 *     responses:
 *       200:
 *         description: Validation completed
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
 *                     entryTypeId:
 *                       type: string
 *                     isValid:
 *                       type: boolean
 *                     issues:
 *                       type: array
 *                       items:
 *                         type: string
 *                     warnings:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/:entryTypeId/validate", EntryTypeController.validateEntryTypeConfiguration);

export default router;

