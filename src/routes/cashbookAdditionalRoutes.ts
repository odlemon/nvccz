// @ts-nocheck
// Additional Cashbook Routes
// Missing endpoints for complete cashbook functionality

import express from "express";
import ReferenceNumberController from "../controllers/ReferenceNumberController";
import TemplateController from "../controllers/TemplateController";
import DiscountController from "../controllers/DiscountController";
import BankReconciliationController from "../controllers/BankReconciliationController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Reference Number Management Routes
/**
 * @swagger
 * /api/cashbook/reference/next:
 *   get:
 *     summary: Get next reference number
 *     description: Get the next reference number for a transaction type
 *     tags: [Cashbook Reference]
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [RECEIPT, PAYMENT, BATCH]
 *         description: Transaction type
 *     responses:
 *       200:
 *         description: Reference number generated successfully
 */
router.get("/reference/next", ReferenceNumberController.getNextReference);

/**
 * @swagger
 * /api/cashbook/reference/configure:
 *   post:
 *     summary: Configure reference number settings
 *     description: Configure reference number generation settings
 *     tags: [Cashbook Reference]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - prefix
 *               - currentNumber
 *               - incrementBy
 *               - resetPeriod
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [RECEIPT, PAYMENT, BATCH]
 *               prefix:
 *                 type: string
 *               currentNumber:
 *                 type: integer
 *               incrementBy:
 *                 type: integer
 *               resetPeriod:
 *                 type: string
 *                 enum: [DAILY, MONTHLY, YEARLY, NEVER]
 *     responses:
 *       200:
 *         description: Reference number configuration updated successfully
 */
router.post("/reference/configure", ReferenceNumberController.configureReference);

/**
 * @swagger
 * /api/cashbook/reference/settings:
 *   get:
 *     summary: Get reference number settings
 *     description: Get all reference number configuration settings
 *     tags: [Cashbook Reference]
 *     responses:
 *       200:
 *         description: Reference number settings retrieved successfully
 */
router.get("/reference/settings", ReferenceNumberController.getReferenceSettings);

/**
 * @swagger
 * /api/cashbook/reference/reset:
 *   post:
 *     summary: Reset reference number
 *     description: Reset reference number for a specific configuration
 *     tags: [Cashbook Reference]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - configId
 *             properties:
 *               configId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reference number reset successfully
 */
router.post("/reference/reset", ReferenceNumberController.resetReference);

/**
 * @swagger
 * /api/cashbook/reference/validate:
 *   post:
 *     summary: Validate reference number
 *     description: Validate a reference number format and uniqueness
 *     tags: [Cashbook Reference]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reference
 *               - type
 *             properties:
 *               reference:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [RECEIPT, PAYMENT, BATCH]
 *     responses:
 *       200:
 *         description: Reference number validation completed
 */
router.post("/reference/validate", ReferenceNumberController.validateReference);

// Template Management Routes
/**
 * @swagger
 * /api/cashbook/templates:
 *   post:
 *     summary: Create template
 *     description: Create a new cashbook template
 *     tags: [Cashbook Templates]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               projectCode:
 *                 type: string
 *               glAccountId:
 *                 type: string
 *               vatCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Template created successfully
 */
router.post("/templates", TemplateController.createTemplate);

/**
 * @swagger
 * /api/cashbook/templates:
 *   get:
 *     summary: Get templates
 *     description: Get all templates for the authenticated user
 *     tags: [Cashbook Templates]
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 */
router.get("/templates", TemplateController.getTemplates);

/**
 * @swagger
 * /api/cashbook/templates/{id}:
 *   get:
 *     summary: Get template by ID
 *     description: Get a specific template by ID
 *     tags: [Cashbook Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template retrieved successfully
 *       404:
 *         description: Template not found
 */
router.get("/templates/:id", TemplateController.getTemplate);

/**
 * @swagger
 * /api/cashbook/templates/{id}:
 *   put:
 *     summary: Update template
 *     description: Update a template
 *     tags: [Cashbook Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               projectCode:
 *                 type: string
 *               glAccountId:
 *                 type: string
 *               vatCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Template updated successfully
 */
router.put("/templates/:id", TemplateController.updateTemplate);

/**
 * @swagger
 * /api/cashbook/templates/{id}:
 *   delete:
 *     summary: Delete template
 *     description: Delete a template
 *     tags: [Cashbook Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template deleted successfully
 */
router.delete("/templates/:id", TemplateController.deleteTemplate);

/**
 * @swagger
 * /api/cashbook/templates/search:
 *   get:
 *     summary: Search templates
 *     description: Search templates by name, description, or project code
 *     tags: [Cashbook Templates]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Templates search completed
 */
router.get("/templates/search", TemplateController.searchTemplates);

/**
 * @swagger
 * /api/cashbook/templates/frequent:
 *   get:
 *     summary: Get frequently used templates
 *     description: Get frequently used templates for the authenticated user
 *     tags: [Cashbook Templates]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of templates to return
 *     responses:
 *       200:
 *         description: Frequently used templates retrieved successfully
 */
router.get("/templates/frequent", TemplateController.getFrequentTemplates);

/**
 * @swagger
 * /api/cashbook/templates/{id}/apply:
 *   post:
 *     summary: Apply template to transaction
 *     description: Apply a template to create a new transaction
 *     tags: [Cashbook Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bankId
 *               - transactionDate
 *               - amount
 *               - counterpartyType
 *             properties:
 *               bankId:
 *                 type: string
 *               transactionDate:
 *                 type: string
 *                 format: date
 *               amount:
 *                 type: number
 *               reference:
 *                 type: string
 *               counterpartyType:
 *                 type: string
 *                 enum: [GL, CUSTOMER, SUPPLIER]
 *               glAccountId:
 *                 type: string
 *               customerId:
 *                 type: string
 *               vendorId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Template applied successfully
 */
router.post("/templates/:id/apply", TemplateController.applyTemplate);

// Discount Management Routes
/**
 * @swagger
 * /api/cashbook/discounts/calculate:
 *   post:
 *     summary: Calculate discount
 *     description: Calculate discount for a customer or supplier
 *     tags: [Cashbook Discounts]
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
 *               - transactionDate
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [CUSTOMER, SUPPLIER]
 *               entityId:
 *                 type: string
 *               amount:
 *                 type: number
 *               transactionDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Discount calculated successfully
 */
router.post("/discounts/calculate", DiscountController.calculateDiscount);

/**
 * @swagger
 * /api/cashbook/discounts/customer/{customerId}:
 *   get:
 *     summary: Get customer discount
 *     description: Get discount configuration for a customer
 *     tags: [Cashbook Discounts]
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer discount retrieved successfully
 */
router.get("/discounts/customer/:customerId", DiscountController.getCustomerDiscount);

/**
 * @swagger
 * /api/cashbook/discounts/supplier/{supplierId}:
 *   get:
 *     summary: Get supplier discount
 *     description: Get discount configuration for a supplier
 *     tags: [Cashbook Discounts]
 *     parameters:
 *       - in: path
 *         name: supplierId
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *     responses:
 *       200:
 *         description: Supplier discount retrieved successfully
 */
router.get("/discounts/supplier/:supplierId", DiscountController.getSupplierDiscount);

/**
 * @swagger
 * /api/cashbook/discounts:
 *   post:
 *     summary: Create discount configuration
 *     description: Create a new discount configuration
 *     tags: [Cashbook Discounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *               - entityId
 *               - discountType
 *               - discountValue
 *               - validFrom
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [CUSTOMER, SUPPLIER]
 *               entityId:
 *                 type: string
 *               discountType:
 *                 type: string
 *                 enum: [PERCENTAGE, FIXED]
 *               discountValue:
 *                 type: number
 *               minAmount:
 *                 type: number
 *               maxAmount:
 *                 type: number
 *               validFrom:
 *                 type: string
 *                 format: date
 *               validTo:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Discount configuration created successfully
 */
router.post("/discounts", DiscountController.createDiscountConfig);

/**
 * @swagger
 * /api/cashbook/discounts/{id}:
 *   put:
 *     summary: Update discount configuration
 *     description: Update a discount configuration
 *     tags: [Cashbook Discounts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Discount configuration ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               discountType:
 *                 type: string
 *                 enum: [PERCENTAGE, FIXED]
 *               discountValue:
 *                 type: number
 *               minAmount:
 *                 type: number
 *               maxAmount:
 *                 type: number
 *               validFrom:
 *                 type: string
 *                 format: date
 *               validTo:
 *                 type: string
 *                 format: date
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Discount configuration updated successfully
 */
router.put("/discounts/:id", DiscountController.updateDiscountConfig);

/**
 * @swagger
 * /api/cashbook/discounts/{id}:
 *   delete:
 *     summary: Delete discount configuration
 *     description: Delete a discount configuration
 *     tags: [Cashbook Discounts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Discount configuration ID
 *     responses:
 *       200:
 *         description: Discount configuration deleted successfully
 */
router.delete("/discounts/:id", DiscountController.deleteDiscountConfig);

/**
 * @swagger
 * /api/cashbook/discounts:
 *   get:
 *     summary: Get all discount configurations
 *     description: Get all discount configurations
 *     tags: [Cashbook Discounts]
 *     responses:
 *       200:
 *         description: Discount configurations retrieved successfully
 */
router.get("/discounts", DiscountController.getAllDiscountConfigs);

/**
 * @swagger
 * /api/cashbook/discounts/summary:
 *   get:
 *     summary: Get discount summary
 *     description: Get discount summary for a date range
 *     tags: [Cashbook Discounts]
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date
 *       - in: query
 *         name: dateTo
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date
 *     responses:
 *       200:
 *         description: Discount summary retrieved successfully
 */
router.get("/discounts/summary", DiscountController.getDiscountSummary);

// Bank Reconciliation Routes
/**
 * @swagger
 * /api/cashbook/reconciliation/statements:
 *   post:
 *     summary: Create bank statement
 *     description: Create a new bank statement for reconciliation
 *     tags: [Bank Reconciliation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bankId
 *               - statementDate
 *               - openingBalance
 *               - closingBalance
 *               - items
 *             properties:
 *               bankId:
 *                 type: string
 *               statementDate:
 *                 type: string
 *                 format: date
 *               openingBalance:
 *                 type: number
 *               closingBalance:
 *                 type: number
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     transactionDate:
 *                       type: string
 *                       format: date
 *                     description:
 *                       type: string
 *                     reference:
 *                       type: string
 *                     debitAmount:
 *                       type: number
 *                     creditAmount:
 *                       type: number
 *                     balance:
 *                       type: number
 *     responses:
 *       200:
 *         description: Bank statement created successfully
 */
router.post("/reconciliation/statements", BankReconciliationController.createBankStatement);

/**
 * @swagger
 * /api/cashbook/reconciliation/status/{bankId}:
 *   get:
 *     summary: Get reconciliation status
 *     description: Get reconciliation status for a bank
 *     tags: [Bank Reconciliation]
 *     parameters:
 *       - in: path
 *         name: bankId
 *         required: true
 *         schema:
 *           type: string
 *         description: Bank ID
 *     responses:
 *       200:
 *         description: Reconciliation status retrieved successfully
 */
router.get("/reconciliation/status/:bankId", BankReconciliationController.getReconciliationStatus);

/**
 * @swagger
 * /api/cashbook/reconciliation/match/{statementId}:
 *   post:
 *     summary: Perform automatic matching
 *     description: Perform automatic matching for a bank statement
 *     tags: [Bank Reconciliation]
 *     parameters:
 *       - in: path
 *         name: statementId
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     responses:
 *       200:
 *         description: Automatic matching completed successfully
 */
router.post("/reconciliation/match/:statementId", BankReconciliationController.performAutomaticMatching);

/**
 * @swagger
 * /api/cashbook/reconciliation/mismatches/{statementId}:
 *   get:
 *     summary: Get reconciliation mismatches
 *     description: Get reconciliation mismatches for a statement
 *     tags: [Bank Reconciliation]
 *     parameters:
 *       - in: path
 *         name: statementId
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     responses:
 *       200:
 *         description: Reconciliation mismatches retrieved successfully
 */
router.get("/reconciliation/mismatches/:statementId", BankReconciliationController.getReconciliationMismatches);

/**
 * @swagger
 * /api/cashbook/reconciliation/mismatches/{mismatchId}/resolve:
 *   post:
 *     summary: Resolve mismatch
 *     description: Resolve a reconciliation mismatch
 *     tags: [Bank Reconciliation]
 *     parameters:
 *       - in: path
 *         name: mismatchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Mismatch ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [MATCH_TRANSACTION, CREATE_TRANSACTION, IGNORE]
 *               transactionId:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Mismatch resolved successfully
 */
router.post("/reconciliation/mismatches/:mismatchId/resolve", BankReconciliationController.resolveMismatch);

/**
 * @swagger
 * /api/cashbook/reconciliation/mark/{transactionId}:
 *   post:
 *     summary: Mark transaction as reconciled
 *     description: Mark a transaction as reconciled
 *     tags: [Bank Reconciliation]
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction marked as reconciled successfully
 */
router.post("/reconciliation/mark/:transactionId", BankReconciliationController.markTransactionReconciled);

/**
 * @swagger
 * /api/cashbook/reconciliation/complete/{statementId}:
 *   post:
 *     summary: Complete reconciliation
 *     description: Complete reconciliation for a statement
 *     tags: [Bank Reconciliation]
 *     parameters:
 *       - in: path
 *         name: statementId
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     responses:
 *       200:
 *         description: Reconciliation completed successfully
 */
router.post("/reconciliation/complete/:statementId", BankReconciliationController.completeReconciliation);

/**
 * @swagger
 * /api/cashbook/reconciliation/report/{statementId}:
 *   get:
 *     summary: Get reconciliation report
 *     description: Get reconciliation report for a statement
 *     tags: [Bank Reconciliation]
 *     parameters:
 *       - in: path
 *         name: statementId
 *         required: true
 *         schema:
 *           type: string
 *         description: Statement ID
 *     responses:
 *       200:
 *         description: Reconciliation report retrieved successfully
 */
router.get("/reconciliation/report/:statementId", BankReconciliationController.getReconciliationReport);

export default router;


