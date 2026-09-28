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
 * /accounting/inventory/settings:
 *   get:
 *     summary: Get perpetual inventory policy (e.g. allow negative stock)
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings
 *   patch:
 *     summary: Update perpetual inventory policy
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
 *               - allowNegativeStock
 *             properties:
 *               allowNegativeStock:
 *                 type: boolean
 *                 description: When true, sales/OUT can drive quantity below zero after client confirms (acknowledgeNegativeStock).
 */
router.get('/settings', InventoryController.getInventorySettings);
router.patch('/settings', InventoryController.updateInventorySettings);

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
 *                 default: pieces
 *               vendorId:
 *                 type: string
 *                 description: Optional - Link to vendor/supplier
 *               inventoryAssetAccountId:
 *                 type: string
 *                 description: Optional - If not provided, system will auto-select the Inventory account
 *     responses:
 *       201:
 *         description: Inventory item created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/items', InventoryController.createInventoryItem);

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
 *               vendorId:
 *                 type: string
 *                 description: Optional - Link to vendor/supplier
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

/** The inventory accounts' ledger balances beside the value of the stock that posts to them. */
router.get('/tie-out', async (_req: any, res: any) => {
  try { const { InventoryLedgerService } = await import('../services/InventoryLedgerService'); res.json({ success: true, data: await InventoryLedgerService.tieOut() }); }
  catch (e: any) { res.status(500).json({ success: false, message: e?.message || 'Failed to compare the ledger and stock' }); }
});
/** The latest stock movements across items (?itemId= for one), each with its item, who recorded it and its journal. */
router.get('/movements', async (req: any, res: any) => {
  try {
    const { prisma } = await import('../utils/database');
    const rows = await prisma.stockMovement.findMany({ where: req.query.itemId ? { itemId: String(req.query.itemId) } : {}, orderBy: { createdAt: 'desc' }, take: Math.min(500, Number(req.query.limit) || 200), include: { item: { select: { skuNumber: true, itemName: true, unitOfMeasure: true } }, createdBy: { select: { firstName: true, lastName: true, email: true } } } });
    const refs = rows.map((m) => `STK-${m.id}`);
    const jes = await prisma.journalEntry.findMany({ where: { referenceNumber: { in: refs } }, select: { id: true, referenceNumber: true, status: true } });
    const byRef = new Map(jes.map((j) => [j.referenceNumber, j]));
    res.json({ success: true, data: rows.map((m) => ({ ...m, journal: byRef.get(`STK-${m.id}`) || null })) });
  } catch (e: any) { res.status(500).json({ success: false, message: e?.message || 'Failed to list stock movements' }); }
});
/** Opening + receipts − issues ± adjustments = closing, per item, for ?from=&to= (tenant days). */
router.get('/roll-forward', async (req: any, res: any) => {
  const ok = (d: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  if (!ok(req.query.from) || !ok(req.query.to)) { res.status(400).json({ success: false, message: 'Give from and to dates (YYYY-MM-DD).' }); return; }
  try { const { InventoryLedgerService } = await import('../services/InventoryLedgerService'); res.json({ success: true, data: await InventoryLedgerService.rollForward(String(req.query.from), String(req.query.to)) }); }
  catch (e: any) { res.status(500).json({ success: false, message: e?.message || 'Failed to build the roll-forward' }); }
});

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
 *               acknowledgeNegativeStock:
 *                 type: boolean
 *                 description: Required when policy allows negative stock and demand exceeds on-hand (retry after 409).
 *     responses:
 *       200:
 *         description: Sales invoice processed successfully
 *       400:
 *         description: Insufficient stock (negative stock not allowed)
 *       409:
 *         description: Confirmation required — negative stock allowed but acknowledgeNegativeStock not sent
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
