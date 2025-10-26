// @ts-nocheck
// Production Cashbook Routes
// Essential API endpoints for cashbook functionality

import express from "express";
import CashbookController from "../controllers/CashbookController";
import CashbookBatchImportController from "../controllers/CashbookBatchImportController";
import ReferenceNumberController from "../controllers/ReferenceNumberController";
import TemplateController from "../controllers/TemplateController";
import { CustomerController } from "../controllers/CustomerController";
import { VendorController } from "../controllers/VendorController";
import DiscountController from "../controllers/DiscountController";
import { authenticate } from "../middleware/authenticate";
import multer from 'multer';

const router = express.Router();

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Cashbook
 *   description: Cashbook management endpoints for receipts, payments, and batch processing
 */

// ============================================================================
// CORE CASHBOOK TRANSACTIONS
// ============================================================================

/**
 * @swagger
 * /api/cashbook/receipts:
 *   post:
 *     summary: Create cash receipt
 *     description: Create a new cash receipt transaction
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bankId
 *               - transactionDate
 *               - description
 *               - amount
 *               - counterpartyType
 *             properties:
 *               bankId:
 *                 type: string
 *                 description: Bank account ID
 *                 example: "cmh5u1h3y0001unagy8qtrkng"
 *               transactionDate:
 *                 type: string
 *                 format: date
 *                 description: Transaction date
 *                 example: "2025-10-26"
 *               description:
 *                 type: string
 *                 description: Transaction description
 *                 example: "Payment from customer"
 *               amount:
 *                 type: number
 *                 description: Transaction amount
 *                 example: 1000.00
 *               reference:
 *                 type: string
 *                 description: Transaction reference
 *                 example: "REC-001"
 *               counterpartyType:
 *                 type: string
 *                 enum: [GL, CUSTOMER, SUPPLIER]
 *                 description: Counterparty type
 *                 example: "CUSTOMER"
 *               glAccountId:
 *                 type: string
 *                 description: GL account ID (required for GL transactions)
 *                 example: "cmh3c1dq80000unxkthh69y9g"
 *               customerId:
 *                 type: string
 *                 description: Customer ID (required for customer transactions)
 *                 example: "cmh3c8jk60000un0ke5broxit"
 *               vendorId:
 *                 type: string
 *                 description: Vendor ID (required for supplier transactions)
 *                 example: "cmh3c7tcr0000uni4ho18pluc"
 *               vatCode:
 *                 type: string
 *                 enum: [15%, 0%, EXEMPT]
 *                 default: "15%"
 *                 description: VAT code
 *               projectCode:
 *                 type: string
 *                 description: Project code
 *                 example: "PROJ-001"
 *               discount:
 *                 type: number
 *                 description: Settlement discount
 *                 example: 0.00
 *     responses:
 *       200:
 *         description: Cash receipt created successfully
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
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 */
router.post("/receipts", CashbookController.createReceipt);

/**
 * @swagger
 * /api/cashbook/payments:
 *   post:
 *     summary: Create cash payment
 *     description: Create a new cash payment transaction
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bankId
 *               - transactionDate
 *               - description
 *               - amount
 *               - counterpartyType
 *             properties:
 *               bankId:
 *                 type: string
 *                 description: Bank account ID
 *                 example: "cmh5u1h3y0001unagy8qtrkng"
 *               transactionDate:
 *                 type: string
 *                 format: date
 *                 description: Transaction date
 *                 example: "2025-10-26"
 *               description:
 *                 type: string
 *                 description: Transaction description
 *                 example: "Payment to supplier"
 *               amount:
 *                 type: number
 *                 description: Transaction amount
 *                 example: 500.00
 *               reference:
 *                 type: string
 *                 description: Transaction reference
 *                 example: "PAY-001"
 *               counterpartyType:
 *                 type: string
 *                 enum: [GL, CUSTOMER, SUPPLIER]
 *                 description: Counterparty type
 *                 example: "SUPPLIER"
 *               glAccountId:
 *                 type: string
 *                 description: GL account ID (required for GL transactions)
 *               customerId:
 *                 type: string
 *                 description: Customer ID (required for customer transactions)
 *               vendorId:
 *                 type: string
 *                 description: Vendor ID (required for supplier transactions)
 *                 example: "cmh3c7tcr0000uni4ho18pluc"
 *               vatCode:
 *                 type: string
 *                 enum: [15%, 0%, EXEMPT]
 *                 default: "15%"
 *                 description: VAT code
 *               projectCode:
 *                 type: string
 *                 description: Project code
 *               discount:
 *                 type: number
 *                 description: Settlement discount
 *     responses:
 *       200:
 *         description: Cash payment created successfully
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 */
router.post("/payments", CashbookController.createPayment);

/**
 * @swagger
 * /api/cashbook/transactions/{id}/post:
 *   post:
 *     summary: Post transaction
 *     description: Post a cashbook transaction to the general ledger
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction posted successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/transactions/:id/post", CashbookController.postTransaction);

/**
 * @swagger
 * /api/cashbook/transactions/{id}/void:
 *   post:
 *     summary: Void transaction
 *     description: Void a cashbook transaction
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for voiding
 *                 example: "Duplicate transaction"
 *     responses:
 *       200:
 *         description: Transaction voided successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/transactions/:id/void", CashbookController.voidTransaction);

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * @swagger
 * /api/cashbook/batches:
 *   post:
 *     summary: Create batch
 *     description: Create a new cashbook batch
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - batchName
 *             properties:
 *               batchName:
 *                 type: string
 *                 description: Batch name
 *                 example: "Daily Receipts Batch"
 *               description:
 *                 type: string
 *                 description: Batch description
 *                 example: "Morning receipts for 2025-10-26"
 *     responses:
 *       200:
 *         description: Batch created successfully
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 */
router.post("/batches", CashbookController.createBatch);

/**
 * @swagger
 * /api/cashbook/batches:
 *   get:
 *     summary: Get batches
 *     description: Get list of cashbook batches with optional filters
 *     tags: [Cashbook]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, POSTED, VOIDED]
 *         description: Filter by batch status
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
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Batches retrieved successfully
 */
router.get("/batches", CashbookController.listBatches);

/**
 * @swagger
 * /api/cashbook/batches/{id}:
 *   get:
 *     summary: Get batch details
 *     description: Get details of a specific batch including transactions
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     responses:
 *       200:
 *         description: Batch details retrieved successfully
 *       404:
 *         description: Batch not found
 */
router.get("/batches/:id", CashbookController.getBatch);

/**
 * @swagger
 * /api/cashbook/batches/{batchId}/transactions/{transactionId}:
 *   post:
 *     summary: Add transaction to batch
 *     description: Add a transaction to an existing batch
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction added to batch successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/batches/:batchId/transactions/:transactionId", CashbookController.addTransactionToBatch);

/**
 * @swagger
 * /api/cashbook/batches/{id}/post:
 *   post:
 *     summary: Post batch
 *     description: Post all transactions in a batch to the general ledger
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     responses:
 *       200:
 *         description: Batch posted successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/batches/:id/post", CashbookController.postBatch);

// ============================================================================
// BATCH IMPORT/EXPORT
// ============================================================================

/**
 * @swagger
 * /api/cashbook/batches/import:
 *   post:
 *     summary: Import CSV batch
 *     description: Import cashbook transactions from CSV file
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file containing transactions
 *               batchName:
 *                 type: string
 *                 description: Name for the imported batch
 *                 example: "Imported Transactions"
 *     responses:
 *       200:
 *         description: CSV imported successfully
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 */
router.post("/batches/import", upload.single('file'), CashbookBatchImportController.importCSV);

/**
 * @swagger
 * /api/cashbook/batches/{id}/export:
 *   get:
 *     summary: Export batch to CSV
 *     description: Export a specific batch to CSV format
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     responses:
 *       200:
 *         description: CSV file generated successfully
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       404:
 *         description: Batch not found
 */
router.get("/batches/:id/export", CashbookBatchImportController.exportBatch);

/**
 * @swagger
 * /api/cashbook/batches/export/all:
 *   get:
 *     summary: Export all batches
 *     description: Export all batches to a single CSV file
 *     tags: [Cashbook]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, POSTED, VOIDED]
 *         description: Filter by batch status
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date
 *     responses:
 *       200:
 *         description: CSV file generated successfully
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get("/batches/export/all", CashbookBatchImportController.exportAllBatches);

// ============================================================================
// REFERENCE DATA
// ============================================================================

/**
 * @swagger
 * /api/cashbook/banks:
 *   get:
 *     summary: Get bank accounts
 *     description: Get list of active bank accounts
 *     tags: [Cashbook]
 *     responses:
 *       200:
 *         description: Bank accounts retrieved successfully
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       accountNumber:
 *                         type: string
 *                       currency:
 *                         type: object
 *                       glAccount:
 *                         type: object
 */
router.get("/banks", CashbookController.getBanks);

/**
 * @swagger
 * /api/cashbook/banks:
 *   post:
 *     summary: Create bank account
 *     description: Create a new bank account for cashbook
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - accountNumber
 *               - currencyId
 *               - glAccountId
 *             properties:
 *               name:
 *                 type: string
 *                 description: Bank account name
 *                 example: "Main Operating Account"
 *               accountNumber:
 *                 type: string
 *                 description: Bank account number
 *                 example: "1234567890"
 *               currencyId:
 *                 type: string
 *                 description: Currency ID
 *                 example: "cmh3bymy70000una4yk8leusu"
 *               glAccountId:
 *                 type: string
 *                 description: GL account ID
 *                 example: "cmh3c1fdt0001unxkqzzihy55"
 *               bankCode:
 *                 type: string
 *                 description: Bank code
 *                 example: "CBZ"
 *               branchCode:
 *                 type: string
 *                 description: Branch code
 *                 example: "001"
 *               isActive:
 *                 type: boolean
 *                 default: true
 *                 description: Whether account is active
 *     responses:
 *       200:
 *         description: Bank account created successfully
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 */
router.post("/banks", CashbookController.createBank);

/**
 * @swagger
 * /api/cashbook/customers:
 *   get:
 *     summary: Get customers
 *     description: Get list of active customers
 *     tags: [Cashbook]
 *     responses:
 *       200:
 *         description: Customers retrieved successfully
 */
router.get("/customers", CustomerController.getCustomers);

/**
 * @swagger
 * /api/cashbook/customers/{id}:
 *   get:
 *     summary: Get customer details
 *     description: Get details of a specific customer
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer details retrieved successfully
 *       404:
 *         description: Customer not found
 */
router.get("/customers/:id", CustomerController.getCustomerById);

/**
 * @swagger
 * /api/cashbook/vendors:
 *   get:
 *     summary: Get vendors
 *     description: Get list of active vendors
 *     tags: [Cashbook]
 *     responses:
 *       200:
 *         description: Vendors retrieved successfully
 */
router.get("/vendors", VendorController.getVendors);

/**
 * @swagger
 * /api/cashbook/gl-accounts:
 *   get:
 *     summary: Get chart of accounts
 *     description: Get chart of accounts for cashbook transactions
 *     tags: [Cashbook]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by account type
 *     responses:
 *       200:
 *         description: Chart of accounts retrieved successfully
 */
router.get("/gl-accounts", CashbookController.getAccounts);

/**
 * @swagger
 * /api/cashbook/entries:
 *   get:
 *     summary: Get all cashbook entries
 *     description: Retrieve all cashbook entries with optional filtering
 *     tags: [Cashbook]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: bankId
 *         schema:
 *           type: string
 *         description: Filter by bank ID
 *       - in: query
 *         name: transactionType
 *         schema:
 *           type: string
 *           enum: [RECEIPT, PAYMENT]
 *         description: Filter by transaction type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, POSTED, VOIDED]
 *         description: Filter by status
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date (YYYY-MM-DD)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date (YYYY-MM-DD)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of entries to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *         description: Number of entries to skip
 *     responses:
 *       200:
 *         description: Cashbook entries retrieved successfully
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
 *                   example: "Cashbook entries retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CashbookEntry'
 *       400:
 *         description: Bad request - invalid parameters
 *       401:
 *         description: Unauthorized
 */
router.get("/entries", CashbookController.getCashbookEntries);

// ============================================================================
// REFERENCE NUMBER CONFIGURATION
// ============================================================================

/**
 * @swagger
 * /api/cashbook/reference/configure:
 *   post:
 *     summary: Configure reference number settings
 *     description: Configure reference number generation settings
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - prefix
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [RECEIPT, PAYMENT, BATCH]
 *                 description: Reference type
 *                 example: "RECEIPT"
 *               prefix:
 *                 type: string
 *                 description: Reference prefix
 *                 example: "REC"
 *               incrementBy:
 *                 type: integer
 *                 default: 1
 *                 description: Increment by value
 *               resetPeriod:
 *                 type: string
 *                 enum: [DAILY, MONTHLY, YEARLY, NEVER]
 *                 default: "NEVER"
 *                 description: Reset period
 *     responses:
 *       200:
 *         description: Reference configuration updated successfully
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 */
router.post("/reference/configure", ReferenceNumberController.configureReference);

/**
 * @swagger
 * /api/cashbook/reference/next:
 *   get:
 *     summary: Get next reference number
 *     description: Get the next reference number for a specific type
 *     tags: [Cashbook]
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [RECEIPT, PAYMENT, BATCH]
 *         description: Reference type
 *     responses:
 *       200:
 *         description: Next reference number retrieved successfully
 */
router.get("/reference/next", ReferenceNumberController.getNextReference);

// ============================================================================
// TEMPLATES
// ============================================================================

/**
 * @swagger
 * /api/cashbook/templates:
 *   post:
 *     summary: Create template
 *     description: Create a new cashbook transaction template
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *               - bankId
 *               - amount
 *             properties:
 *               name:
 *                 type: string
 *                 description: Template name
 *                 example: "Monthly Rent Payment"
 *               type:
 *                 type: string
 *                 enum: [RECEIPT, PAYMENT]
 *                 description: Transaction type
 *                 example: "PAYMENT"
 *               bankId:
 *                 type: string
 *                 description: Default bank account ID
 *               amount:
 *                 type: number
 *                 description: Default amount
 *               description:
 *                 type: string
 *                 description: Default description
 *               counterpartyType:
 *                 type: string
 *                 enum: [GL, CUSTOMER, SUPPLIER]
 *                 description: Default counterparty type
 *               glAccountId:
 *                 type: string
 *                 description: Default GL account ID
 *               customerId:
 *                 type: string
 *                 description: Default customer ID
 *               vendorId:
 *                 type: string
 *                 description: Default vendor ID
 *     responses:
 *       200:
 *         description: Template created successfully
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 */
router.post("/templates", TemplateController.createTemplate);

// ============================================================================
// DISCOUNT CONFIGURATION
// ============================================================================

/**
 * @swagger
 * /api/cashbook/discounts/configure:
 *   post:
 *     summary: Configure settlement discounts
 *     description: Configure settlement discount settings for customers/vendors
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *               - entityId
 *               - discountPercentage
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [CUSTOMER, VENDOR]
 *                 description: Entity type
 *                 example: "CUSTOMER"
 *               entityId:
 *                 type: string
 *                 description: Customer or vendor ID
 *                 example: "cmh3c8jk60000un0ke5broxit"
 *               discountPercentage:
 *                 type: number
 *                 description: Discount percentage
 *                 example: 2.5
 *               earlyPaymentDays:
 *                 type: integer
 *                 description: Days for early payment discount
 *                 example: 10
 *     responses:
 *       200:
 *         description: Discount configuration updated successfully
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 */
router.post("/discounts/configure", DiscountController.createDiscountConfig);

/**
 * @swagger
 * /api/cashbook/discounts/calculate:
 *   post:
 *     summary: Calculate settlement discount
 *     description: Calculate settlement discount for a transaction
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *               - entityId
 *               - amount
 *               - dueDate
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [CUSTOMER, VENDOR]
 *                 description: Entity type
 *               entityId:
 *                 type: string
 *                 description: Customer or vendor ID
 *               amount:
 *                 type: number
 *                 description: Transaction amount
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 description: Due date
 *               paymentDate:
 *                 type: string
 *                 format: date
 *                 description: Payment date
 *     responses:
 *       200:
 *         description: Discount calculated successfully
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 */
router.post("/discounts/calculate", DiscountController.calculateDiscount);

export default router;