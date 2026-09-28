// @ts-nocheck
import express from 'express';
import { AssetController } from '../controllers/AssetController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// Cron: must be registered BEFORE authenticate() — no JWT (shared secret only).
router.post('/depreciation/cron/monthly', AssetController.postMonthlyDepreciationCron);

// Apply authentication middleware to all other routes
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Asset Management
 *   description: Asset management endpoints
 */

/**
 * @swagger
 * /accounting/assets:
 *   post:
 *     summary: Create a new asset
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assetName
 *               - assetCode
 *               - cost
 *               - usefulLifeYears
 *               - depreciationMethod
 *               - assetAccountId
 *               - accumulatedDepreciationAccountId
 *               - depreciationExpenseAccountId
 *             properties:
 *               assetName:
 *                 type: string
 *               assetCode:
 *                 type: string
 *               description:
 *                 type: string
 *               cost:
 *                 type: number
 *               usefulLifeYears:
 *                 type: number
 *               depreciationMethod:
 *                 type: string
 *                 enum: [STRAIGHT_LINE, DECLINING_BALANCE, SUM_OF_YEARS]
 *               assetAccountId:
 *                 type: string
 *               accumulatedDepreciationAccountId:
 *                 type: string
 *               depreciationExpenseAccountId:
 *                 type: string
 *               purchaseDate:
 *                 type: string
 *                 format: date
 *               location:
 *                 type: string
 *               vendor:
 *                 type: string
 *     responses:
 *       201:
 *         description: Asset created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/', AssetController.createAsset);

/**
 * @swagger
 * /accounting/assets:
 *   get:
 *     summary: Get all assets
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of assets
 *       401:
 *         description: Unauthorized
 */
router.get('/', AssetController.getAssets);

/**
 * @swagger
 * /accounting/assets/register:
 *   get:
 *     summary: Get asset register (active in-use assets)
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Asset register data
 *       401:
 *         description: Unauthorized
 */
/** Posted supplier bills an asset can be bought on (its cost is moved out of the bill's expense line, FA-07). */
router.get('/bills', async (_req: any, res: any) => {
  try {
    const { prisma } = await import('../utils/database');
    const rows = await prisma.procurementInvoice.findMany({ where: { journalEntry: { status: 'POSTED' } }, orderBy: { invoiceDate: 'desc' }, take: 200, select: { id: true, invoiceNumber: true, invoiceDate: true, subtotal: true, totalAmount: true, vendor: { select: { name: true } } } });
    res.json({ success: true, data: rows.map((b) => ({ id: b.id, invoiceNumber: b.invoiceNumber, date: b.invoiceDate, supplier: b.vendor?.name || null, netAmount: Number(b.subtotal), total: Number(b.totalAmount) })) });
  } catch (e: any) { res.status(500).json({ success: false, message: e?.message || 'Failed to list bills' }); }
});
router.get('/register', AssetController.getAssetRegister);

/**
 * @swagger
 * /accounting/assets/depreciation-schedule:
 *   get:
 *     summary: Get depreciation schedule (alias)
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Depreciation schedule
 *       401:
 *         description: Unauthorized
 */
router.get('/depreciation-schedule', AssetController.getDepreciationSchedule);

/**
 * @swagger
 * /accounting/assets/{id}:
 *   get:
 *     summary: Get asset by ID
 *     tags: [Asset Management]
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
 *         description: Asset details
 *       404:
 *         description: Asset not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', AssetController.getAsset);

/**
 * @swagger
 * /accounting/assets/{id}:
 *   put:
 *     summary: Update asset
 *     tags: [Asset Management]
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
 *               assetName:
 *                 type: string
 *               assetCode:
 *                 type: string
 *               description:
 *                 type: string
 *               cost:
 *                 type: number
 *               usefulLifeYears:
 *                 type: number
 *               depreciationMethod:
 *                 type: string
 *                 enum: [STRAIGHT_LINE, DECLINING_BALANCE, SUM_OF_YEARS]
 *               location:
 *                 type: string
 *               vendor:
 *                 type: string
 *     responses:
 *       200:
 *         description: Asset updated successfully
 *       404:
 *         description: Asset not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', AssetController.updateAsset);

/**
 * @swagger
 * /accounting/assets/{id}:
 *   delete:
 *     summary: Delete asset
 *     tags: [Asset Management]
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
 *         description: Asset deleted successfully
 *       404:
 *         description: Asset not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', AssetController.deleteAsset);

/**
 * @swagger
 * /accounting/assets/{assetId}/depreciation/backfill:
 *   post:
 *     summary: Calculate + post depreciation for a date range
 *     description: |
 *       Walks month-by-month from `startDate` (or purchase date if omitted) through `endDate`,
 *       calculating and posting depreciation for each due period.
 *       Already-processed months are silently skipped (idempotent).
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *         description: Asset ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [endDate]
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2024-08-01"
 *                 description: Start of range (defaults to asset purchase date if omitted)
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-03-31"
 *                 description: End of range (inclusive)
 *               autoPost:
 *                 type: boolean
 *                 default: true
 *                 description: Automatically post journal entries after calculating
 *     responses:
 *       200:
 *         description: Backfill completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     periodsAttempted:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["2024-08", "2024-09", "2024-10"]
 *                     created:
 *                       type: array
 *                       items:
 *                         type: string
 *                     posted:
 *                       type: array
 *                       items:
 *                         type: string
 *                     skipped:
 *                       type: array
 *                       items:
 *                         type: string
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: object
 */
router.post('/:assetId/depreciation/backfill', AssetController.backfillDepreciation);
router.post('/:id/depreciation/backfill', AssetController.backfillDepreciation);

/**
 * @swagger
 * /accounting/assets/{assetId}/depreciation:
 *   post:
 *     summary: Calculate depreciation for an asset
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
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
 *               - period
 *             properties:
 *               period:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Depreciation calculated successfully
 *       404:
 *         description: Asset not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:assetId/depreciation', AssetController.calculateDepreciation);

/**
 * @swagger
 * /accounting/assets/{id}/depreciate:
 *   post:
 *     summary: Calculate depreciation for an asset (alias)
 *     tags: [Asset Management]
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
 *             required:
 *               - period
 *             properties:
 *               period:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Depreciation calculated successfully
 *       404:
 *         description: Asset not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/depreciate', AssetController.calculateDepreciation); // Alias for requirements

/**
 * @swagger
 * /accounting/assets/depreciation/{depreciationId}/post:
 *   post:
 *     summary: Post depreciation entry
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: depreciationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Depreciation posted successfully
 *       404:
 *         description: Depreciation not found
 *       401:
 *         description: Unauthorized
 */
router.post('/depreciation/:depreciationId/post', AssetController.postDepreciation);

/**
 * @swagger
 * /accounting/assets/{assetId}/dispose:
 *   post:
 *     summary: Dispose of an asset
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
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
 *               - disposalDate
 *               - disposalValue
 *             properties:
 *               disposalDate:
 *                 type: string
 *                 format: date
 *               disposalValue:
 *                 type: number
 *               disposalReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Asset disposed successfully
 *       404:
 *         description: Asset not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:assetId/dispose', AssetController.disposeAsset);

/**
 * @swagger
 * /accounting/assets/{id}/dispose:
 *   post:
 *     summary: Dispose of an asset (alias)
 *     tags: [Asset Management]
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
 *             required:
 *               - disposalDate
 *               - disposalValue
 *             properties:
 *               disposalDate:
 *                 type: string
 *                 format: date
 *               disposalValue:
 *                 type: number
 *               disposalReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Asset disposed successfully
 *       404:
 *         description: Asset not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/dispose', AssetController.disposeAsset); // Alias for requirements

/**
 * @swagger
 * /accounting/assets/{assetId}/depreciation-schedule:
 *   get:
 *     summary: Get depreciation schedule for an asset
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Depreciation schedule
 *       404:
 *         description: Asset not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:assetId/depreciation-schedule', AssetController.getDepreciationSchedule);

/**
 * @swagger
 * /accounting/assets/dashboard:
 *   get:
 *     summary: Get asset dashboard
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Asset dashboard data
 *       401:
 *         description: Unauthorized
 */
router.get('/dashboard/asset-dashboard', AssetController.getAssetDashboard);

/**
 * @swagger
 * /accounting/assets/depreciation/monthly:
 *   post:
 *     summary: Post monthly depreciation
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - month
 *               - year
 *             properties:
 *               month:
 *                 type: number
 *               year:
 *                 type: number
 *     responses:
 *       200:
 *         description: Monthly depreciation posted successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/depreciation/preview', AssetController.previewMonthlyDepreciation);
router.post('/depreciation/monthly', AssetController.postMonthlyDepreciation);

/**
 * @swagger
 * /accounting/assets/depreciation/annual:
 *   post:
 *     summary: Post annual depreciation
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - year
 *             properties:
 *               year:
 *                 type: number
 *     responses:
 *       200:
 *         description: Annual depreciation posted successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/depreciation/annual', AssetController.postAnnualDepreciation);

/**
 * @swagger
 * /accounting/assets/{id}/revalue:
 *   post:
 *     summary: Revalue an asset
 *     tags: [Asset Management]
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
 *             required:
 *               - newValue
 *               - revaluationDate
 *             properties:
 *               newValue:
 *                 type: number
 *               revaluationDate:
 *                 type: string
 *                 format: date
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Asset revalued successfully
 *       404:
 *         description: Asset not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/revalue', AssetController.revalueAsset);

/**
 * @swagger
 * /accounting/assets/register/generate:
 *   get:
 *     summary: Generate asset register
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Asset register generated
 *       401:
 *         description: Unauthorized
 */
router.get('/register/generate', AssetController.generateAssetRegister);

/**
 * @swagger
 * /accounting/assets/depreciation-schedule/generate:
 *   get:
 *     summary: Generate depreciation schedule
 *     tags: [Asset Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Depreciation schedule generated
 *       401:
 *         description: Unauthorized
 */
router.get('/depreciation-schedule/generate', AssetController.generateDepreciationSchedule);

export default router;
