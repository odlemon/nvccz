// @ts-nocheck
import { Request, Response } from 'express';
import { MultiCurrencyService } from '../services/MultiCurrencyService';
import { PrismaClient } from '@prisma/client';

import { dbConnection } from '../utils/database';
const prisma = dbConnection.getPrismaClient();

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export class MultiCurrencyController {
  /**
   * Create exchange rate
   */
  static async createExchangeRate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        effectiveDate,
        fromCurrencyId,
        toCurrencyId,
        rate,
        notes
      } = req.body;

      // Validation
      if (!effectiveDate || !fromCurrencyId || !toCurrencyId || !rate) {
        res.status(400).json({
          error: 'Missing required fields: effectiveDate, fromCurrencyId, toCurrencyId, rate'
        });
        return;
      }

      const exchangeRate = await MultiCurrencyService.createExchangeRate({
        date: new Date(effectiveDate),
        fromCurrencyId,
        toCurrencyId,
        rate: parseFloat(rate),
        createdById: userId
      });

      res.status(201).json({
        success: true,
        message: 'Exchange rate created successfully',
        data: exchangeRate
      });
    } catch (error: any) {
      console.error('Error creating exchange rate:', error);
      res.status(500).json({
        error: 'Failed to create exchange rate',
        details: error.message
      });
    }
  }

  /**
   * Convert currency
   */
  static async convertCurrency(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        amount,
        fromCurrencyId,
        toCurrencyId,
        date
      } = req.body;

      // Validation
      if (!amount || !fromCurrencyId || !toCurrencyId) {
        res.status(400).json({
          error: 'Missing required fields: amount, fromCurrencyId, toCurrencyId'
        });
        return;
      }

      const result = await MultiCurrencyService.convertCurrency({
        amount: parseFloat(amount),
        fromCurrencyId,
        toCurrencyId,
        date: date ? new Date(date) : undefined
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error converting currency:', error);
      res.status(500).json({
        error: 'Failed to convert currency',
        details: error.message
      });
    }
  }

  /**
   * Process multi-currency payment
   */
  static async processMultiCurrencyPayment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        invoiceId,
        paymentCurrencyId,
        paymentAmount,
        exchangeRate
      } = req.body;

      // Validation
      if (!invoiceId || !paymentCurrencyId || !paymentAmount) {
        res.status(400).json({
          error: 'Missing required fields: invoiceId, paymentCurrencyId, paymentAmount'
        });
        return;
      }

      const result = await MultiCurrencyService.processMultiCurrencyPayment({
        invoiceId,
        paymentCurrencyId,
        paymentAmount: parseFloat(paymentAmount),
        exchangeRate: exchangeRate ? parseFloat(exchangeRate) : undefined,
        createdById: userId
      });

      res.json({
        success: true,
        message: 'Multi-currency payment processed successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error processing multi-currency payment:', error);
      res.status(500).json({
        error: 'Failed to process multi-currency payment',
        details: error.message
      });
    }
  }

  /**
   * Get exchange rates with filtering
   */
  static async getExchangeRates(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        fromCurrencyId,
        toCurrencyId,
        dateFrom,
        dateTo,
        page = 1,
        limit = 10
      } = req.query;

      const result = await MultiCurrencyService.getExchangeRates({
        fromCurrencyId: fromCurrencyId as string,
        toCurrencyId: toCurrencyId as string,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting exchange rates:', error);
      res.status(500).json({
        error: 'Failed to get exchange rates',
        details: error.message
      });
    }
  }

  /**
   * Get forex gain/loss records
   */
  static async getForexGainLoss(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        invoiceId,
        gainLossType,
        dateFrom,
        dateTo,
        page = 1,
        limit = 10
      } = req.query;

      const result = await MultiCurrencyService.getForexGainLoss({
        invoiceId: invoiceId as string,
        gainLossType: gainLossType as string,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting forex gain/loss:', error);
      res.status(500).json({
        error: 'Failed to get forex gain/loss',
        details: error.message
      });
    }
  }

  /**
   * Update exchange rate
   */
  static async updateExchangeRate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      const updates = req.body;

      const updatedExchangeRate = await MultiCurrencyService.updateExchangeRate(id, updates, userId);

      res.json({
        success: true,
        message: 'Exchange rate updated successfully',
        data: updatedExchangeRate
      });
    } catch (error: any) {
      console.error('Error updating exchange rate:', error);
      res.status(500).json({
        error: 'Failed to update exchange rate',
        details: error.message
      });
    }
  }

  /**
   * Delete exchange rate
   */
  static async deleteExchangeRate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;

      await MultiCurrencyService.deleteExchangeRate(id, userId);

      res.json({
        success: true,
        message: 'Exchange rate deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting exchange rate:', error);
      res.status(500).json({
        error: 'Failed to delete exchange rate',
        details: error.message
      });
    }
  }

  /**
   * Get multi-currency dashboard data
   */
  static async getMultiCurrencyDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const [
        totalExchangeRates,
        activeExchangeRates,
        totalForexGainLoss,
        totalGains,
        totalLosses,
        recentExchangeRates,
        recentForexGainLoss
      ] = await Promise.all([
        prisma.exchangeRate.count(),
        prisma.exchangeRate.count({ where: { isActive: true } }),
        prisma.forexGainLoss.count(),
        prisma.forexGainLoss.aggregate({
          where: { gainLossType: 'GAIN' },
          _sum: { gainLossAmount: true }
        }),
        prisma.forexGainLoss.aggregate({
          where: { gainLossType: 'LOSS' },
          _sum: { gainLossAmount: true }
        }),
        prisma.exchangeRate.findMany({
          orderBy: { date: 'desc' },
          take: 10,
          include: {
            fromCurrency: {
              select: {
                code: true,
                name: true,
                symbol: true
              }
            },
            toCurrency: {
              select: {
                code: true,
                name: true,
                symbol: true
              }
            }
          }
        }),
        prisma.forexGainLoss.findMany({
          orderBy: { transactionDate: 'desc' },
          take: 10,
          include: {
            invoice: {
              select: {
                invoiceNumber: true,
                totalAmount: true
              }
            },
            fromCurrency: {
              select: {
                code: true,
                symbol: true
              }
            },
            toCurrency: {
              select: {
                code: true,
                symbol: true
              }
            }
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          totalExchangeRates,
          activeExchangeRates,
          totalForexGainLoss,
          totalGains: Number(totalGains._sum.gainLossAmount || 0),
          totalLosses: Number(totalLosses._sum.gainLossAmount || 0),
          recentExchangeRates,
          recentForexGainLoss
        }
      });
    } catch (error: any) {
      console.error('Error getting multi-currency dashboard:', error);
      res.status(500).json({
        error: 'Failed to get multi-currency dashboard',
        details: error.message
      });
    }
  }

  /**
   * Calculate forex gain/loss
   */
  static async calculateForexGainLoss(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { invoiceId, paymentCurrency, paymentAmount } = req.body;

      // Validation
      if (!invoiceId || !paymentCurrency || !paymentAmount) {
        res.status(400).json({
          error: 'Missing required fields: invoiceId, paymentCurrency, paymentAmount'
        });
        return;
      }

      const result = await MultiCurrencyService.calculateForexGainLoss(
        invoiceId, 
        paymentCurrency, 
        paymentAmount
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error calculating forex gain/loss:', error);
      res.status(500).json({
        error: 'Failed to calculate forex gain/loss',
        details: error.message
      });
    }
  }

  /**
   * Post forex gain/loss
   */
  static async postForexGainLoss(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { amount, currency, gainLoss } = req.body;

      // Validation
      if (!amount || !currency || !gainLoss) {
        res.status(400).json({
          error: 'Missing required fields: amount, currency, gainLoss'
        });
        return;
      }

      if (!['GAIN', 'LOSS'].includes(gainLoss)) {
        res.status(400).json({
          error: 'Invalid gainLoss. Must be GAIN or LOSS'
        });
        return;
      }

      const result = await MultiCurrencyService.postForexGainLoss(
        amount, 
        currency, 
        gainLoss, 
        userId
      );

      res.json({
        success: true,
        message: 'Forex gain/loss posted successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error posting forex gain/loss:', error);
      res.status(500).json({
        error: 'Failed to post forex gain/loss',
        details: error.message
      });
    }
  }

  /**
   * Reconcile multi-currency invoice
   */
  static async reconcileMultiCurrencyInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { invoiceId } = req.params;

      if (!invoiceId) {
        res.status(400).json({
          error: 'Missing required parameter: invoiceId'
        });
        return;
      }

      const result = await MultiCurrencyService.reconcileMultiCurrencyInvoice(invoiceId);

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error reconciling multi-currency invoice:', error);
      res.status(500).json({
        error: 'Failed to reconcile multi-currency invoice',
        details: error.message
      });
    }
  }
}
