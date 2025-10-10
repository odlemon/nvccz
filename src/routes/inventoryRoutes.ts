// @ts-nocheck
import express from 'express';
import { InventoryController } from '../controllers/InventoryController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Inventory Items Management
router.post('/items', InventoryController.createInventoryItem);
router.get('/items', InventoryController.getInventoryItems);
router.get('/items/:id', InventoryController.getInventoryItem);
router.put('/items/:id', InventoryController.updateInventoryItem);
router.delete('/items/:id', InventoryController.deleteInventoryItem);

// Stock Movements
router.post('/movements', InventoryController.recordStockMovement);
router.get('/items/:itemId/movements', InventoryController.getStockMovements);

// Inventory Valuation and Reports
router.get('/valuation', InventoryController.getInventoryValuation);
router.get('/reorder-alerts', InventoryController.getReorderLevelAlerts);
router.get('/reorder-levels', InventoryController.getReorderLevelAlerts); // Alias for requirements
router.get('/dashboard', InventoryController.getInventoryDashboard);

// Sales Invoice Processing
router.post('/sales-invoice', InventoryController.processSalesInvoice);

// Additional Inventory Methods
router.post('/update-stock', InventoryController.updateStockQuantity);
router.post('/calculate-cogs', InventoryController.calculateCOGS);
router.get('/report', InventoryController.generateInventoryReport);
router.get('/check-reorder-levels', InventoryController.checkReorderLevels);
router.get('/inventory-value', InventoryController.getInventoryValue);
router.post('/adjustments', InventoryController.createInventoryAdjustment);

export default router;
