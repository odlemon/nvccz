// @ts-nocheck
import { PrismaClient, ExchangeRate, ForexGainLoss } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { dbConnection } from '../utils/database';
import { JournalEntryService } from './JournalEntryService';
import AuditService from './AuditService';

const prisma = dbConnection.getPrismaClient();

export interface CreateExchangeRateParams {
  date: Date;
  fromCurrencyId: string;
  toCurrencyId: string;
  rate: number;
  createdById: string;
}

export interface ConvertCurrencyParams {
  amount: number;
  fromCurrencyId: string;
  toCurrencyId: string;
  date?: Date;
}

export interface ProcessMultiCurrencyPaymentParams {
  invoiceId: string;
  paymentCurrencyId: string;
  paymentAmount: number;
  exchangeRate?: number;
  createdById: string;
}

export interface ExchangeRateWithDetails extends ExchangeRate {
  fromCurrency: {
    id: string;
    code: string;
    name: string;
    symbol: string;
  };
  toCurrency: {
    id: string;
    code: string;
    name: string;
    symbol: string;
  };
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface ForexGainLossWithDetails extends ForexGainLoss {
  invoice?: {
    id: string;
    invoiceNumber?: string;
    totalAmount: Decimal;
  };
  fromCurrency: {
    id: string;
    code: string;
    name: string;
    symbol: string;
  };
  toCurrency: {
    id: string;
    code: string;
    name: string;
    symbol: string;
  };
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export class MultiCurrencyService {
  /**
   * Create exchange rate
   */
  static async createExchangeRate(params: CreateExchangeRateParams): Promise<ExchangeRateWithDetails> {
    try {
      const { date, fromCurrencyId, toCurrencyId, rate, createdById } = params;

      // Validate currencies exist
      const [fromCurrency, toCurrency] = await Promise.all([
        prisma.currency.findUnique({ where: { id: fromCurrencyId } }),
        prisma.currency.findUnique({ where: { id: toCurrencyId } })
      ]);

      if (!fromCurrency || !toCurrency) {
        throw new Error('One or both currencies not found');
      }

      if (fromCurrencyId === toCurrencyId) {
        throw new Error('From and to currencies cannot be the same');
      }

      // Check if rate already exists for this date and currency pair
      const existingRate = await prisma.exchangeRate.findUnique({
        where: {
          date_fromCurrencyId_toCurrencyId: {
            date,
            fromCurrencyId,
            toCurrencyId
          }
        }
      });

      if (existingRate) {
        throw new Error('Exchange rate already exists for this date and currency pair');
      }

      // Create exchange rate
      const exchangeRate = await prisma.exchangeRate.create({
        data: {
          date,
          rate: new Decimal(rate),
          fromCurrency: {
            connect: { id: fromCurrencyId }
          },
          toCurrency: {
            connect: { id: toCurrencyId }
          },
          createdBy: {
            connect: { id: createdById }
          }
        },
        include: {
          fromCurrency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          toCurrency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: 'CREATE',
        entityType: 'ExchangeRate',
        entityId: exchangeRate.id,
        newValues: exchangeRate,
      });

      return exchangeRate;
    } catch (error) {
      console.error('Error creating exchange rate:', error);
      throw error;
    }
  }

  /**
   * Convert currency amount
   */
  static async convertCurrency(params: ConvertCurrencyParams): Promise<{
    originalAmount: number;
    convertedAmount: number;
    exchangeRate: number;
    fromCurrency: string;
    toCurrency: string;
  }> {
    try {
      const { amount, fromCurrencyId, toCurrencyId, date = new Date() } = params;

      if (fromCurrencyId === toCurrencyId) {
        return {
          originalAmount: amount,
          convertedAmount: amount,
          exchangeRate: 1,
          fromCurrency: 'Same',
          toCurrency: 'Same'
        };
      }

      // Get exchange rate
      const exchangeRate = await this.getExchangeRate(fromCurrencyId, toCurrencyId, date);

      if (!exchangeRate) {
        throw new Error(`Exchange rate not found for ${fromCurrencyId} to ${toCurrencyId} on ${date.toISOString()}`);
      }

      const convertedAmount = amount * Number(exchangeRate.rate);

      // Get currency details
      const [fromCurrency, toCurrency] = await Promise.all([
        prisma.currency.findUnique({ where: { id: fromCurrencyId } }),
        prisma.currency.findUnique({ where: { id: toCurrencyId } })
      ]);

      return {
        originalAmount: amount,
        convertedAmount,
        exchangeRate: Number(exchangeRate.rate),
        fromCurrency: fromCurrency?.code || fromCurrencyId,
        toCurrency: toCurrency?.code || toCurrencyId
      };
    } catch (error) {
      console.error('Error converting currency:', error);
      throw error;
    }
  }

  /**
   * Get exchange rate for currency pair and date
   */
  private static async getExchangeRate(fromCurrencyId: string, toCurrencyId: string, date: Date): Promise<ExchangeRate | null> {
    // First try to get exact date match
    let exchangeRate = await prisma.exchangeRate.findUnique({
      where: {
        date_fromCurrencyId_toCurrencyId: {
          date,
          fromCurrencyId,
          toCurrencyId
        }
      }
    });

    if (exchangeRate) {
      return exchangeRate;
    }

    // If no exact match, get the most recent rate before the date
    exchangeRate = await prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId,
        toCurrencyId,
        date: { lte: date },
        isActive: true
      },
      orderBy: { date: 'desc' }
    });

    if (exchangeRate) {
      return exchangeRate;
    }

    // If still no match, try reverse rate (1/rate)
    const reverseRate = await prisma.exchangeRate.findFirst({
      where: {
        fromCurrencyId: toCurrencyId,
        toCurrencyId: fromCurrencyId,
        date: { lte: date },
        isActive: true
      },
      orderBy: { date: 'desc' }
    });

    if (reverseRate) {
      return {
        ...reverseRate,
        fromCurrencyId,
        toCurrencyId,
        rate: new Decimal(1).div(reverseRate.rate)
      };
    }

    return null;
  }

  /**
   * Process multi-currency payment
   */
  static async processMultiCurrencyPayment(params: ProcessMultiCurrencyPaymentParams): Promise<{
    forexGainLoss?: ForexGainLossWithDetails;
    convertedAmount: number;
    exchangeRate: number;
  }> {
    try {
      const { invoiceId, paymentCurrencyId, paymentAmount, exchangeRate, createdById } = params;

      // Get invoice details
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId }
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // If payment currency is same as invoice currency, no conversion needed
      if (paymentCurrencyId === invoice.currencyId) {
        return {
          convertedAmount: paymentAmount,
          exchangeRate: 1
        };
      }

      // Get exchange rate
      const rate = exchangeRate || await this.getExchangeRateForPayment(invoice.currencyId, paymentCurrencyId);
      const convertedAmount = paymentAmount * rate;

      // Calculate forex gain/loss
      const originalAmount = Number(invoice.totalAmount);
      const gainLossAmount = convertedAmount - originalAmount;
      const gainLossType = gainLossAmount >= 0 ? 'GAIN' : 'LOSS';

      // Create forex gain/loss record
      const forexGainLoss = await prisma.forexGainLoss.create({
        data: {
          invoiceId,
          transactionDate: new Date(),
          fromCurrencyId: invoice.currencyId,
          toCurrencyId: paymentCurrencyId,
          originalAmount: new Decimal(originalAmount),
          convertedAmount: new Decimal(convertedAmount),
          exchangeRate: new Decimal(rate),
          gainLossAmount: new Decimal(Math.abs(gainLossAmount)),
          gainLossType,
          description: `Multi-currency payment for invoice ${invoice.invoiceNumber || invoice.id}`
        },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true
            }
          },
          fromCurrency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          toCurrency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Create forex gain/loss journal entry
      await this.createForexGainLossJournalEntry(forexGainLoss, createdById);

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: 'CREATE',
        entityType: 'ForexGainLoss',
        entityId: forexGainLoss.id,
        newValues: forexGainLoss,
      });

      return {
        forexGainLoss,
        convertedAmount,
        exchangeRate: rate
      };
    } catch (error) {
      console.error('Error processing multi-currency payment:', error);
      throw error;
    }
  }

  /**
   * Get exchange rate for payment
   */
  private static async getExchangeRateForPayment(fromCurrencyId: string, toCurrencyId: string): Promise<number> {
    const exchangeRate = await this.getExchangeRate(fromCurrencyId, toCurrencyId, new Date());
    
    if (!exchangeRate) {
      throw new Error(`Exchange rate not found for ${fromCurrencyId} to ${toCurrencyId}`);
    }

    return Number(exchangeRate.rate);
  }

  /**
   * Create forex gain/loss journal entry
   */
  private static async createForexGainLossJournalEntry(forexGainLoss: ForexGainLoss, createdById: string): Promise<void> {
    try {
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: forexGainLoss.transactionDate,
          referenceNumber: `FOREX-${forexGainLoss.id}`,
          description: `Forex ${forexGainLoss.gainLossType}: ${forexGainLoss.description}`,
          totalAmount: forexGainLoss.gainLossAmount,
          currencyId: forexGainLoss.fromCurrencyId,
          status: 'POSTED',
          createdById
        }
      });

      // Get forex gain/loss account
      const forexAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          accountName: { contains: 'Foreign Exchange' },
          isActive: true
        }
      });

      if (!forexAccount) {
        throw new Error('Foreign Exchange account not found');
      }

      // Get accounts receivable account
      const accountsReceivableAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          accountName: { contains: 'Accounts Receivable' },
          isActive: true
        }
      });

      if (!accountsReceivableAccount) {
        throw new Error('Accounts Receivable account not found');
      }

      // Create journal entry lines
      if (forexGainLoss.gainLossType === 'GAIN') {
        // Dr Accounts Receivable, Cr Foreign Exchange Gain
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: accountsReceivableAccount.id,
            debitAmount: forexGainLoss.gainLossAmount,
            creditAmount: new Decimal(0),
            description: `Forex gain adjustment`,
            vatAmount: new Decimal(0)
          }
        });

        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: forexAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: forexGainLoss.gainLossAmount,
            description: `Foreign exchange gain`,
            vatAmount: new Decimal(0)
          }
        });
      } else {
        // Dr Foreign Exchange Loss, Cr Accounts Receivable
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: forexAccount.id,
            debitAmount: forexGainLoss.gainLossAmount,
            creditAmount: new Decimal(0),
            description: `Foreign exchange loss`,
            vatAmount: new Decimal(0)
          }
        });

        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: accountsReceivableAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: forexGainLoss.gainLossAmount,
            description: `Forex loss adjustment`,
            vatAmount: new Decimal(0)
          }
        });
      }

      // Update forex gain/loss with journal entry reference
      await prisma.forexGainLoss.update({
        where: { id: forexGainLoss.id },
        data: { journalEntryId: journalEntry.id }
      });
    } catch (error) {
      console.error('Error creating forex gain/loss journal entry:', error);
      throw error;
    }
  }

  /**
   * Get exchange rates with filtering
   */
  static async getExchangeRates(filters: {
    fromCurrencyId?: string;
    toCurrencyId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    exchangeRates: ExchangeRateWithDetails[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        fromCurrencyId,
        toCurrencyId,
        dateFrom,
        dateTo,
        page = 1,
        limit = 10
      } = filters;

      const where: any = {};

      if (fromCurrencyId) {
        where.fromCurrencyId = fromCurrencyId;
      }

      if (toCurrencyId) {
        where.toCurrencyId = toCurrencyId;
      }

      if (dateFrom || dateTo) {
        where.date = {};
        if (dateFrom) where.date.gte = dateFrom;
        if (dateTo) where.date.lte = dateTo;
      }

      const [exchangeRates, total] = await Promise.all([
        prisma.exchangeRate.findMany({
          where,
          include: {
            fromCurrency: {
              select: {
                id: true,
                code: true,
                name: true,
                symbol: true
              }
            },
            toCurrency: {
              select: {
                id: true,
                code: true,
                name: true,
                symbol: true
              }
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          orderBy: { date: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.exchangeRate.count({ where })
      ]);

      return {
        exchangeRates,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error getting exchange rates:', error);
      throw error;
    }
  }

  /**
   * Get forex gain/loss records
   */
  static async getForexGainLoss(filters: {
    invoiceId?: string;
    gainLossType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    forexGainLoss: ForexGainLossWithDetails[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        invoiceId,
        gainLossType,
        dateFrom,
        dateTo,
        page = 1,
        limit = 10
      } = filters;

      const where: any = {};

      if (invoiceId) {
        where.invoiceId = invoiceId;
      }

      if (gainLossType) {
        where.gainLossType = gainLossType;
      }

      if (dateFrom || dateTo) {
        where.transactionDate = {};
        if (dateFrom) where.transactionDate.gte = dateFrom;
        if (dateTo) where.transactionDate.lte = dateTo;
      }

      const [forexGainLoss, total] = await Promise.all([
        prisma.forexGainLoss.findMany({
          where,
          include: {
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                totalAmount: true
              }
            },
            fromCurrency: {
              select: {
                id: true,
                code: true,
                name: true,
                symbol: true
              }
            },
            toCurrency: {
              select: {
                id: true,
                code: true,
                name: true,
                symbol: true
              }
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          orderBy: { transactionDate: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.forexGainLoss.count({ where })
      ]);

      return {
        forexGainLoss,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error getting forex gain/loss:', error);
      throw error;
    }
  }

  /**
   * Update exchange rate
   */
  static async updateExchangeRate(
    exchangeRateId: string,
    updates: Partial<CreateExchangeRateParams>,
    updatedById: string
  ): Promise<ExchangeRateWithDetails> {
    try {
      const exchangeRate = await prisma.exchangeRate.findUnique({
        where: { id: exchangeRateId }
      });

      if (!exchangeRate) {
        throw new Error('Exchange rate not found');
      }

      const updatedExchangeRate = await prisma.exchangeRate.update({
        where: { id: exchangeRateId },
        data: {
          ...(updates.rate && { rate: new Decimal(updates.rate) }),
          ...(updates.isActive !== undefined && { isActive: updates.isActive })
        },
        include: {
          fromCurrency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          toCurrency: {
            select: {
              id: true,
              code: true,
              name: true,
              symbol: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Audit log
      await AuditService.log({
        userId: updatedById,
        action: 'UPDATE',
        entityType: 'ExchangeRate',
        entityId: exchangeRateId,
        oldValues: exchangeRate,
        newValues: updatedExchangeRate,
      });

      return updatedExchangeRate;
    } catch (error) {
      console.error('Error updating exchange rate:', error);
      throw error;
    }
  }

  /**
   * Delete exchange rate
   */
  static async deleteExchangeRate(exchangeRateId: string, deletedById: string): Promise<void> {
    try {
      const exchangeRate = await prisma.exchangeRate.findUnique({
        where: { id: exchangeRateId }
      });

      if (!exchangeRate) {
        throw new Error('Exchange rate not found');
      }

      await prisma.exchangeRate.delete({
        where: { id: exchangeRateId }
      });

      // Audit log
      await AuditService.log({
        userId: deletedById,
        action: 'DELETE',
        entityType: 'ExchangeRate',
        entityId: exchangeRateId,
        oldValues: exchangeRate,
      });
    } catch (error) {
      console.error('Error deleting exchange rate:', error);
      throw error;
    }
  }

  /**
   * Calculate forex gain/loss for specific invoice and payment
   */
  static async calculateForexGainLoss(
    invoiceId: string, 
    paymentCurrency: string, 
    paymentAmount: number
  ): Promise<{
    originalAmount: number;
    convertedAmount: number;
    exchangeRate: number;
    gainLossAmount: number;
    gainLossType: 'GAIN' | 'LOSS' | 'NONE';
  }> {
    try {
      // Get invoice details
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { currency: true }
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      const originalAmount = Number(invoice.totalAmount);
      const originalCurrency = invoice.currency.code;

      // Get exchange rate
      const exchangeRate = await this.getExchangeRateForPayment(
        invoice.currencyId, 
        paymentCurrency
      );

      // Convert payment amount to original currency
      const convertedAmount = paymentAmount / exchangeRate;
      
      // Calculate gain/loss
      const gainLossAmount = originalAmount - convertedAmount;
      const gainLossType = gainLossAmount > 0 ? 'GAIN' : gainLossAmount < 0 ? 'LOSS' : 'NONE';

      return {
        originalAmount,
        convertedAmount,
        exchangeRate,
        gainLossAmount: Math.abs(gainLossAmount),
        gainLossType
      };
    } catch (error) {
      console.error('Error calculating forex gain/loss:', error);
      throw error;
    }
  }

  /**
   * Reconcile multi-currency invoice
   */
  static async reconcileMultiCurrencyInvoice(invoiceId: string): Promise<{
    invoiceId: string;
    originalAmount: number;
    originalCurrency: string;
    totalPayments: number;
    paymentCurrency: string;
    forexGainLoss: number;
    reconciliationStatus: 'RECONCILED' | 'PARTIAL' | 'UNRECONCILED';
  }> {
    try {
      // Get invoice details
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { currency: true }
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Get all payments for this invoice
      const payments = await prisma.payment.findMany({
        where: { invoiceId },
        include: { currency: true }
      });

      const originalAmount = Number(invoice.totalAmount);
      const originalCurrency = invoice.currency.code;
      
      // Calculate total payments in original currency
      let totalPaymentsInOriginalCurrency = 0;
      let forexGainLoss = 0;

      for (const payment of payments) {
        if (payment.currency.code === originalCurrency) {
          totalPaymentsInOriginalCurrency += Number(payment.amount);
        } else {
          // Convert payment to original currency
          const exchangeRate = await this.getExchangeRateForPayment(
            payment.currencyId, 
            invoice.currencyId
          );
          const convertedAmount = Number(payment.amount) / exchangeRate;
          totalPaymentsInOriginalCurrency += convertedAmount;
          
          // Calculate forex gain/loss for this payment
          const paymentForexGainLoss = originalAmount - convertedAmount;
          forexGainLoss += paymentForexGainLoss;
        }
      }

      // Determine reconciliation status
      let reconciliationStatus: 'RECONCILED' | 'PARTIAL' | 'UNRECONCILED';
      if (Math.abs(totalPaymentsInOriginalCurrency - originalAmount) < 0.01) {
        reconciliationStatus = 'RECONCILED';
      } else if (totalPaymentsInOriginalCurrency > 0) {
        reconciliationStatus = 'PARTIAL';
      } else {
        reconciliationStatus = 'UNRECONCILED';
      }

      return {
        invoiceId,
        originalAmount,
        originalCurrency,
        totalPayments: totalPaymentsInOriginalCurrency,
        paymentCurrency: originalCurrency,
        forexGainLoss,
        reconciliationStatus
      };
    } catch (error) {
      console.error('Error reconciling multi-currency invoice:', error);
      throw error;
    }
  }

  /**
   * Post forex gain/loss as standalone method
   */
  static async postForexGainLoss(
    amount: number, 
    currency: string, 
    gainLoss: 'GAIN' | 'LOSS',
    createdById: string
  ): Promise<ForexGainLoss> {
    try {
      // Get or create forex gain/loss account
      let forexAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          accountName: { contains: 'Foreign Exchange' },
          isActive: true
        }
      });

      if (!forexAccount) {
        // Create forex account if it doesn't exist
        forexAccount = await prisma.chartOfAccounts.create({
          data: {
            accountNo: '6000',
            accountName: 'Foreign Exchange Gain/Loss',
            accountType: 'EXPENSE',
            parentAccountId: null,
            isActive: true,
            createdById
          }
        });
      }

      // Create forex gain/loss record
      const forexGainLoss = await prisma.forexGainLoss.create({
        data: {
          transactionDate: new Date(),
          fromCurrencyId: currency, // This should be the original currency
          toCurrencyId: currency,   // This should be the payment currency
          originalAmount: new Decimal(amount),
          convertedAmount: new Decimal(amount),
          exchangeRate: new Decimal(1),
          gainLossAmount: new Decimal(amount),
          gainLossType: gainLoss,
          description: `Manual forex ${gainLoss.toLowerCase()} posting`,
          createdById
        }
      });

      // Create journal entry
      await this.createForexGainLossJournalEntry(forexGainLoss, createdById);

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: 'CREATE',
        entityType: 'ForexGainLoss',
        entityId: forexGainLoss.id,
        newValues: forexGainLoss,
      });

      return forexGainLoss;
    } catch (error) {
      console.error('Error posting forex gain/loss:', error);
      throw error;
    }
  }
}
