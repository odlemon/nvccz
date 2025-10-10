// @ts-nocheck
import express from 'express';
import { StatementOfAccountController } from '../controllers/StatementOfAccountController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Statement of Accounts
 *   description: Statement of accounts management endpoints
 */

/**
 * @swagger
 * /accounting/statements/customer:
 *   post:
 *     summary: Generate statements for all customers
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Customer statements generated successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/customer', StatementOfAccountController.generateAllCustomerStatements);

/**
 * @swagger
 * /accounting/statements/vendor:
 *   post:
 *     summary: Generate statements for all vendors
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Vendor statements generated successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/vendor', StatementOfAccountController.generateAllVendorStatements);

/**
 * @swagger
 * /accounting/statements/customer/{customerId}:
 *   post:
 *     summary: Generate statement for a specific customer
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Customer statement generated successfully
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Unauthorized
 */
router.post('/customer/:customerId', StatementOfAccountController.generateCustomerStatement);

/**
 * @swagger
 * /accounting/statements/vendor/{vendorId}:
 *   post:
 *     summary: Generate statement for a specific vendor
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Vendor statement generated successfully
 *       404:
 *         description: Vendor not found
 *       401:
 *         description: Unauthorized
 */
router.post('/vendor/:vendorId', StatementOfAccountController.generateVendorStatement);

/**
 * @swagger
 * /accounting/statements:
 *   get:
 *     summary: Get all statements
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of statements
 *       401:
 *         description: Unauthorized
 */
router.get('/', StatementOfAccountController.getStatements);

/**
 * @swagger
 * /accounting/statements/{id}:
 *   get:
 *     summary: Get statement by ID
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Statement details
 *       404:
 *         description: Statement not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', StatementOfAccountController.getStatement);

/**
 * @swagger
 * /accounting/statements/{id}:
 *   delete:
 *     summary: Delete statement
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Statement deleted successfully
 *       404:
 *         description: Statement not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', StatementOfAccountController.deleteStatement);

/**
 * @swagger
 * /accounting/statements/customer:
 *   get:
 *     summary: Get all customer statements
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of customer statements
 *       401:
 *         description: Unauthorized
 */
router.get('/customer', StatementOfAccountController.getAllCustomerStatements);

/**
 * @swagger
 * /accounting/statements/vendor:
 *   get:
 *     summary: Get all vendor statements
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of vendor statements
 *       401:
 *         description: Unauthorized
 */
router.get('/vendor', StatementOfAccountController.getAllVendorStatements);

/**
 * @swagger
 * /accounting/statements/customer/{customerId}:
 *   get:
 *     summary: Get statements for a specific customer
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer statements
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Unauthorized
 */
router.get('/customer/:customerId', StatementOfAccountController.getCustomerStatements);

/**
 * @swagger
 * /accounting/statements/vendor/{vendorId}:
 *   get:
 *     summary: Get statements for a specific vendor
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Vendor statements
 *       404:
 *         description: Vendor not found
 *       401:
 *         description: Unauthorized
 */
router.get('/vendor/:vendorId', StatementOfAccountController.getVendorStatements);

/**
 * @swagger
 * /accounting/statements/dashboard:
 *   get:
 *     summary: Get statement dashboard
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statement dashboard data
 *       401:
 *         description: Unauthorized
 */
router.get('/dashboard/statement-dashboard', StatementOfAccountController.getStatementDashboard);

/**
 * @swagger
 * /accounting/statements/{statementId}/format:
 *   get:
 *     summary: Format statement
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: statementId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Formatted statement
 *       404:
 *         description: Statement not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:statementId/format', StatementOfAccountController.formatStatement);

/**
 * @swagger
 * /accounting/statements/{statementId}/email:
 *   post:
 *     summary: Email statement
 *     tags: [Statement of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: statementId
 *         required: true
 *         schema:
 *           type: string
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
 *               subject:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Statement emailed successfully
 *       404:
 *         description: Statement not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:statementId/email', StatementOfAccountController.emailStatement); // Alias for requirements

export default router;
