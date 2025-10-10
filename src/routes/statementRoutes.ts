// @ts-nocheck
import express from 'express';
import { StatementOfAccountController } from '../controllers/StatementOfAccountController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Statement Generation (all data - no ID required)
router.post('/customer', StatementOfAccountController.generateAllCustomerStatements);
router.post('/vendor', StatementOfAccountController.generateAllVendorStatements);

// Statement Generation (specific ID)
router.post('/customer/:customerId', StatementOfAccountController.generateCustomerStatement);
router.post('/vendor/:vendorId', StatementOfAccountController.generateVendorStatement);

// Statement Management
router.get('/', StatementOfAccountController.getStatements);
router.get('/:id', StatementOfAccountController.getStatement);
router.delete('/:id', StatementOfAccountController.deleteStatement);

// Customer Statements (all data - no ID required)
router.get('/customer', StatementOfAccountController.getAllCustomerStatements);

// Vendor Statements (all data - no ID required)
router.get('/vendor', StatementOfAccountController.getAllVendorStatements);

// Customer Statements (specific ID)
router.get('/customer/:customerId', StatementOfAccountController.getCustomerStatements);

// Vendor Statements (specific ID)
router.get('/vendor/:vendorId', StatementOfAccountController.getVendorStatements);

// Dashboard
router.get('/dashboard/statement-dashboard', StatementOfAccountController.getStatementDashboard);

// Statement Operations
router.get('/:statementId/format', StatementOfAccountController.formatStatement);
router.post('/:customerId/:statementId/email', StatementOfAccountController.emailStatement);
router.post('/:statementId/email', StatementOfAccountController.emailStatement); // Alias for requirements

export default router;
