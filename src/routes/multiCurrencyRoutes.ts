// @ts-nocheck
import express from 'express';
import { MultiCurrencyController } from '../controllers/MultiCurrencyController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Exchange Rate Management
router.post('/exchange-rates', MultiCurrencyController.createExchangeRate);
router.get('/exchange-rates', MultiCurrencyController.getExchangeRates);
router.put('/exchange-rates/:id', MultiCurrencyController.updateExchangeRate);
router.delete('/exchange-rates/:id', MultiCurrencyController.deleteExchangeRate);

// Currency Conversion
router.post('/convert', MultiCurrencyController.convertCurrency);

// Multi-Currency Payments
router.post('/payments', MultiCurrencyController.processMultiCurrencyPayment);

// Forex Gain/Loss
router.get('/forex-gain-loss', MultiCurrencyController.getForexGainLoss);

// Dashboard
router.get('/dashboard/multi-currency-dashboard', MultiCurrencyController.getMultiCurrencyDashboard);

// Additional Multi-Currency Methods
router.post('/calculate-forex-gain-loss', MultiCurrencyController.calculateForexGainLoss);
router.post('/post-forex-gain-loss', MultiCurrencyController.postForexGainLoss);
router.get('/reconcile-invoice/:invoiceId', MultiCurrencyController.reconcileMultiCurrencyInvoice);

export default router;
