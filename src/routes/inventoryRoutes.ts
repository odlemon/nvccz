// @ts-nocheck
import express from 'express';
import { InventoryController } from '../controllers/InventoryController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Inventory Management
 *   description: Inventory management endpoints
 */

/**
 * @swagger
 * /accounting/inventory/items:
 *   post:
 *     summary: Create a new inventory item
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemName
 *               - skuNumber
 *               - costOfPurchase
 *               - inventoryAssetAccountId
 *             properties:
 *               itemName:
 *                 type: string
 *               skuNumber:
 *                 type: string
 *               description:
 *                 type: string
 *               costOfPurchase:
 *                 type: number
 *               quantityOnHand:
 *                 type: number
 *               reorderLevel:
 *                 type: number
 *               unitOfMeasure:
 *                 type: string
 *               supplierId:
 *                 type: string
 *               inventoryAssetAccountId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Inventory item created successfully
 *       401:
 *         description: Unauthorized
 */
/**
 * @swagger
 * /accounting/inventory/items:
 *   get:
 *     summary: Get all inventory items
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of inventory items
 *       401:
 *         description: Unauthorized
 */
router.get('/items', InventoryController.getInventoryItems);

/**
 * @swagger
 * /accounting/inventory/items/{id}:
 *   get:
 *     summary: Get inventory item by ID
 *     tags: [Inventory Management]
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
 *         description: Inventory item details
 *       404:
 *         description: Item not found
 *       401:
 *         description: Unauthorized
 */
router.get('/items/:id', InventoryController.getInventoryItem);

/**
 * @swagger
 * /accounting/inventory/items/{id}:
 *   put:
 *     summary: Update inventory item
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
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
 *               itemName:
 *                 type: string
 *               skuNumber:
 *                 type: string
 *               description:
 *                 type: string
 *               costOfPurchase:
 *                 type: number
 *               quantityOnHand:
 *                 type: number
 *               reorderLevel:
 *                 type: number
 *               unitOfMeasure:
 *                 type: string
 *               supplierId:
 *                 type: string
 *               inventoryAssetAccountId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Inventory item updated successfully
 *       404:
 *         description: Item not found
 *       401:
 *         description: Unauthorized
 */
router.put('/items/:id', InventoryController.updateInventoryItem);

/**
 * @swagger
 * /accounting/inventory/items/{id}:
 *   delete:
 *     summary: Delete inventory item
 *     tags: [Inventory Management]
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
 *         description: Inventory item deleted successfully
 *       404:
 *         description: Item not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/items/:id', InventoryController.deleteInventoryItem);

/**
 * @swagger
 * /accounting/inventory/movements:
 *   post:
 *     summary: Record stock movement
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemId
 *               - movementType
 *               - quantity
 *             properties:
 *               itemId:
 *                 type: string
 *               movementType:
 *                 type: string
 *                 enum: [IN, OUT, TRANSFER, ADJUSTMENT]
 *               quantity:
 *                 type: number
 *               reference:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Stock movement recorded successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/movements', InventoryController.recordStockMovement);

/**
 * @swagger
 * /accounting/inventory/items/{itemId}/movements:
 *   get:
 *     summary: Get stock movements for an item
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of stock movements
 *       401:
 *         description: Unauthorized
 */
router.get('/items/:itemId/movements', InventoryController.getStockMovements);

/**
 * @swagger
 * /accounting/inventory/valuation:
 *   get:
 *     summary: Get inventory valuation
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory valuation data
 *       401:
 *         description: Unauthorized
 */
router.get('/valuation', InventoryController.getInventoryValuation);

/**
 * @swagger
 * /accounting/inventory/reorder-alerts:
 *   get:
 *     summary: Get reorder level alerts
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of items that need reordering
 *       401:
 *         description: Unauthorized
 */
router.get('/reorder-alerts', InventoryController.getReorderLevelAlerts);

/**
 * @swagger
 * /accounting/inventory/reorder-levels:
 *   get:
 *     summary: Get reorder levels (alias for reorder-alerts)
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of items that need reordering
 *       401:
 *         description: Unauthorized
 */
router.get('/reorder-levels', InventoryController.getReorderLevelAlerts); // Alias for requirements

/**
 * @swagger
 * /accounting/inventory/dashboard:
 *   get:
 *     summary: Get inventory dashboard
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory dashboard data
 *       401:
 *         description: Unauthorized
 */
router.get('/dashboard', InventoryController.getInventoryDashboard);

/**
 * @swagger
 * /accounting/inventory/sales-invoice:
 *   post:
 *     summary: Process sales invoice
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - invoiceId
 *               - items
 *             properties:
 *               invoiceId:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     itemId:
 *                       type: string
 *                     quantity:
 *                       type: number
 *     responses:
 *       200:
 *         description: Sales invoice processed successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/sales-invoice', InventoryController.processSalesInvoice);

/**
 * @swagger
 * /accounting/inventory/update-stock:
 *   post:
 *     summary: Update stock quantity
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemId
 *               - newQuantity
 *             properties:
 *               itemId:
 *                 type: string
 *               newQuantity:
 *                 type: number
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Stock quantity updated successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/update-stock', InventoryController.updateStockQuantity);

/**
 * @swagger
 * /accounting/inventory/calculate-cogs:
 *   post:
 *     summary: Calculate Cost of Goods Sold
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemId
 *               - quantity
 *               - method
 *             properties:
 *               itemId:
 *                 type: string
 *               quantity:
 *                 type: number
 *               method:
 *                 type: string
 *                 enum: [FIFO, LIFO, AVERAGE]
 *     responses:
 *       200:
 *         description: COGS calculated successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/calculate-cogs', InventoryController.calculateCOGS);

/**
 * @swagger
 * /accounting/inventory/report:
 *   get:
 *     summary: Generate inventory report
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Inventory report generated
 *       401:
 *         description: Unauthorized
 */
router.get('/report', InventoryController.generateInventoryReport);

/**
 * @swagger
 * /accounting/inventory/check-reorder-levels:
 *   get:
 *     summary: Check reorder levels
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reorder level check completed
 *       401:
 *         description: Unauthorized
 */
router.get('/check-reorder-levels', InventoryController.checkReorderLevels);

/**
 * @swagger
 * /accounting/inventory/inventory-value:
 *   get:
 *     summary: Get inventory value
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Total inventory value
 *       401:
 *         description: Unauthorized
 */
router.get('/inventory-value', InventoryController.getInventoryValue);

/**
 * @swagger
 * /accounting/inventory/adjustments:
 *   post:
 *     summary: Create inventory adjustment
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemId
 *               - adjustmentType
 *               - quantity
 *             properties:
 *               itemId:
 *                 type: string
 *               adjustmentType:
 *                 type: string
 *                 enum: [INCREASE, DECREASE]
 *               quantity:
 *                 type: number
 *               reason:
 *                 type: string
 *     responses:
 *       201:
 *         description: Inventory adjustment created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/adjustments', InventoryController.createInventoryAdjustment);

export default router;
