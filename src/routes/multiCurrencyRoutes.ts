// @ts-nocheck
import express from 'express';
import { MultiCurrencyController } from '../controllers/MultiCurrencyController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Multi-Currency
 *   description: Multi-currency management endpoints
 */

/**
 * @swagger
 * /accounting/multi-currency/exchange-rates:
 *   post:
 *     summary: Create exchange rate
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromCurrencyId
 *               - toCurrencyId
 *               - rate
 *               - effectiveDate
 *             properties:
 *               fromCurrencyId:
 *                 type: string
 *               toCurrencyId:
 *                 type: string
 *               rate:
 *                 type: number
 *               effectiveDate:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Exchange rate created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/exchange-rates', MultiCurrencyController.createExchangeRate);

/**
 * @swagger
 * /accounting/multi-currency/exchange-rates:
 *   get:
 *     summary: Get exchange rates
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of exchange rates
 *       401:
 *         description: Unauthorized
 */
router.get('/exchange-rates', MultiCurrencyController.getExchangeRates);

/**
 * @swagger
 * /accounting/multi-currency/exchange-rates/{id}:
 *   put:
 *     summary: Update exchange rate
 *     tags: [Multi-Currency]
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
 *               rate:
 *                 type: number
 *               effectiveDate:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Exchange rate updated successfully
 *       404:
 *         description: Exchange rate not found
 *       401:
 *         description: Unauthorized
 */
router.put('/exchange-rates/:id', MultiCurrencyController.updateExchangeRate);

/**
 * @swagger
 * /accounting/multi-currency/exchange-rates/{id}:
 *   delete:
 *     summary: Delete exchange rate
 *     tags: [Multi-Currency]
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
 *         description: Exchange rate deleted successfully
 *       404:
 *         description: Exchange rate not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/exchange-rates/:id', MultiCurrencyController.deleteExchangeRate);

/**
 * @swagger
 * /accounting/multi-currency/convert:
 *   post:
 *     summary: Convert currency
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - fromCurrencyId
 *               - toCurrencyId
 *               - conversionDate
 *             properties:
 *               amount:
 *                 type: number
 *               fromCurrencyId:
 *                 type: string
 *               toCurrencyId:
 *                 type: string
 *               conversionDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Currency converted successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/convert', MultiCurrencyController.convertCurrency);

/**
 * @swagger
 * /accounting/multi-currency/payments:
 *   post:
 *     summary: Process multi-currency payment
 *     tags: [Multi-Currency]
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
 *               - paymentAmount
 *               - paymentCurrencyId
 *               - paymentDate
 *             properties:
 *               invoiceId:
 *                 type: string
 *               paymentAmount:
 *                 type: number
 *               paymentCurrencyId:
 *                 type: string
 *               paymentDate:
 *                 type: string
 *                 format: date
 *               exchangeRate:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Multi-currency payment processed successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/payments', MultiCurrencyController.processMultiCurrencyPayment);

/**
 * @swagger
 * /accounting/multi-currency/forex-gain-loss:
 *   get:
 *     summary: Get forex gain/loss
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Forex gain/loss data
 *       401:
 *         description: Unauthorized
 */
router.get('/forex-gain-loss', MultiCurrencyController.getForexGainLoss);

/**
 * @swagger
 * /accounting/multi-currency/dashboard:
 *   get:
 *     summary: Get multi-currency dashboard
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Multi-currency dashboard data
 *       401:
 *         description: Unauthorized
 */
router.get('/dashboard/multi-currency-dashboard', MultiCurrencyController.getMultiCurrencyDashboard);

/**
 * @swagger
 * /accounting/multi-currency/calculate-forex-gain-loss:
 *   post:
 *     summary: Calculate forex gain/loss
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Forex gain/loss calculated successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/calculate-forex-gain-loss', MultiCurrencyController.calculateForexGainLoss);

/**
 * @swagger
 * /accounting/multi-currency/post-forex-gain-loss:
 *   post:
 *     summary: Post forex gain/loss
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Forex gain/loss posted successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/post-forex-gain-loss', MultiCurrencyController.postForexGainLoss);

/**
 * @swagger
 * /accounting/multi-currency/reconcile-invoice/{invoiceId}:
 *   get:
 *     summary: Reconcile multi-currency invoice
 *     tags: [Multi-Currency]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Multi-currency invoice reconciled
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Unauthorized
 */
router.get('/reconcile-invoice/:invoiceId', MultiCurrencyController.reconcileMultiCurrencyInvoice);

export default router;
