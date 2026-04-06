// @ts-nocheck
import { PrismaClient, ExchangeRate, ForexGainLoss } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../utils/database';
import { prismaInvoiceSnapshotSelect } from '../config/accountingSnapshotResponseSelect';
import {
  extractZwgPerZar,
  fetchZimrateRates,
  pickUsdZwg,
  parseZimrateDateLabel,
  type ZimrateRatesPayload
} from './ZimrateRateService';
import { fetchZimrateRatesOrUatFallback, getLastStoredUsdZwgFromDb } from './UsdZwgRateResolver';
import { randomUUID } from 'crypto';
import { JournalEntryService } from './JournalEntryService';
import AuditService from './AuditService';
import { createJournalEntryWithAuditSequence } from './AuditTrailSequenceService';

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

      // Store/compare exchange rates at UTC start-of-day so lookups are stable across timezones.
      // (Some callers parse YYYY-MM-DD as noon-UTC to avoid off-by-one display issues.)
      const normalizedDate = new Date(date);
      normalizedDate.setUTCHours(0, 0, 0, 0);

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
            date: normalizedDate,
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
          date: normalizedDate,
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
    // Normalize to UTC calendar-day start for exact matching.
    // Important: many endpoints store date-only inputs using a noon-UTC anchor (see `parseDate`)
    // then persist as a DATE; using local `setHours` can shift the day on non-UTC hosts.
    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);
    
    // First try to get exact date match
    let exchangeRate = await prisma.exchangeRate.findUnique({
      where: {
        date_fromCurrencyId_toCurrencyId: {
          date: normalizedDate,
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
        date: { lte: normalizedDate },
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
        date: { lte: normalizedDate },
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
   * UAT Requirement: When invoice is in USD but payment is in ZWL, calculate forex gain/loss
   * based on original ZWL value at invoice creation vs payment ZWL amount
   */
  static async processMultiCurrencyPayment(params: ProcessMultiCurrencyPaymentParams): Promise<{
    forexGainLoss?: ForexGainLossWithDetails;
    convertedAmount: number;
    exchangeRate: number;
    journalEntryId?: string;
  }> {
    try {
      const { invoiceId, paymentCurrencyId, paymentAmount, exchangeRate, createdById } = params;

      // Get invoice details with exchangeRateAtCreation
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

      // UAT Requirement: Calculate forex gain/loss based on original ZWL value
      // Original ZWL value = invoice.totalAmount * exchangeRateAtCreation (rate when invoice was created)
      if (!invoice.exchangeRateAtCreation) {
        throw new Error('Invoice does not have exchangeRateAtCreation. Cannot calculate forex gain/loss.');
      }

      const originalZWLValue = Number(invoice.totalAmount) * Number(invoice.exchangeRateAtCreation);
      const paymentZWLAmount = paymentAmount; // Payment is already in ZWL
      const gainLossAmount = paymentZWLAmount - originalZWLValue;
      const gainLossType = gainLossAmount >= 0 ? 'GAIN' : 'LOSS';

      // Get payment date exchange rate for record keeping
      const paymentDateRate = exchangeRate || await this.getExchangeRateForPayment(invoice.currencyId, paymentCurrencyId);

      // Create forex gain/loss record
      const forexGainLoss = await prisma.forexGainLoss.create({
        data: {
          invoice: invoiceId ? {
            connect: { id: invoiceId }
          } : undefined,
          transactionDate: new Date(),
          fromCurrency: {
            connect: { id: invoice.currencyId }
          },
          toCurrency: {
            connect: { id: paymentCurrencyId }
          },
          originalAmount: new Decimal(originalZWLValue), // Original ZWL value at invoice creation
          convertedAmount: new Decimal(paymentZWLAmount), // Payment amount in ZWL
          exchangeRate: new Decimal(paymentDateRate),
          gainLossAmount: new Decimal(Math.abs(gainLossAmount)),
          gainLossType,
          description: `Multi-currency payment for invoice ${invoice.invoiceNumber || invoice.id}`,
          createdBy: {
            connect: { id: createdById }
          }
        },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
              ...prismaInvoiceSnapshotSelect
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

      // UAT Requirement: Create integrated payment journal entry with forex gain/loss
      // DR: Cash/Bank (paymentZWLAmount), CR: AR (originalZWLValue), CR: Forex Gain (gainLossAmount)
      const journalEntryId = await this.createPaymentWithForexJournalEntry({
        invoice,
        paymentZWLAmount,
        originalZWLValue,
        gainLossAmount: Math.abs(gainLossAmount),
        gainLossType,
        paymentCurrencyId,
        forexGainLossId: forexGainLoss.id,
        createdById
      });

      // Update forex gain/loss with journal entry reference
      await prisma.forexGainLoss.update({
        where: { id: forexGainLoss.id },
        data: { journalEntryId }
      });

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
        convertedAmount: paymentZWLAmount,
        exchangeRate: paymentDateRate,
        journalEntryId
      };
    } catch (error) {
      console.error('Error processing multi-currency payment:', error);
      throw error;
    }
  }

  /**
   * USD sales invoice settled in ZAR from a ZAR bank.
   * (1) Value ZWL (ZiG) obligation at invoice creation: totalUsd × exchangeRateAtCreation.
   * (2) At payment, Zimrate ZAR/ZWL cross → ZAR obligation vs ZAR received → realized FX in ZAR journal + ForexGainLoss (ZWL legs).
   */
  static async processUsdInvoicePaidWithZarBank(params: {
    invoiceId: string;
    paymentAmountZar: number;
    bankId: string;
    createdById: string;
  }): Promise<{
    forexGainLoss: ForexGainLossWithDetails;
    journalEntryId: string;
    breakdown: Record<string, number | string>;
  }> {
    const { invoiceId, paymentAmountZar, bankId, createdById } = params;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { currency: true }
    });
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    if (invoice.currency.code.toUpperCase() !== 'USD') {
      throw new Error('ZAR settlement path only supports USD-denominated invoices');
    }
    if (!invoice.exchangeRateAtCreation) {
      throw new Error('Invoice missing exchangeRateAtCreation (USD→ZWL at creation)');
    }

    const bank = await prisma.bank.findUnique({
      where: { id: bankId },
      include: { glAccount: true, currency: true }
    });
    if (!bank?.glAccountId) {
      throw new Error('Bank not found or has no GL account linked');
    }
    if (bank.currency.code.toUpperCase() !== 'ZAR') {
      throw new Error(`Bank must be ZAR-denominated for this flow; got ${bank.currency.code}`);
    }

    const usdZwlAtCreation = Number(invoice.exchangeRateAtCreation);
    const totalUsd = Number(invoice.totalAmount);
    const originalZwl = totalUsd * usdZwlAtCreation;

    let zimrateFull: ZimrateRatesPayload;
    try {
      zimrateFull = await fetchZimrateRatesOrUatFallback(prisma);
    } catch (e: any) {
      throw new Error(`Zimrate unavailable (needed for ZAR/ZWL payment leg): ${e?.message || e}`);
    }

    const zwgPerZarInfo = extractZwgPerZar(zimrateFull);
    if (!zwgPerZarInfo) {
      throw new Error(
        'No ZAR/ZWL (or ZWG/ZAR) rate in Zimrate; cannot complete USD→ZWL→ZAR conversion'
      );
    }

    const zwlPerZar = zwgPerZarInfo.zwgPerZar;
    const paymentZar = new Decimal(paymentAmountZar);
    const zarObligation = new Decimal(originalZwl)
      .div(zwlPerZar)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const paymentZwlEq = paymentZar.mul(zwlPerZar).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const originalZwlDec = new Decimal(originalZwl).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    const gainLossZwl = paymentZwlEq.minus(originalZwlDec);
    const gainLossType = gainLossZwl.gte(0) ? 'GAIN' : 'LOSS';
    const gainLossZwlAbs = gainLossZwl.abs().toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const fxDiffZar = paymentZar.minus(zarObligation).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const fxDiffAbsZar = fxDiffZar.abs();

    const forexAccount = await MultiCurrencyService.ensureForexGainLossAccount();
    const arAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [{ accountNo: '1200' }, { accountName: { contains: 'Accounts Receivable' } }],
        isActive: true
      }
    });
    if (!arAccount) {
      throw new Error('Accounts Receivable account (1200) not found');
    }

    const forexLossAccount =
      (await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountName: { contains: 'Foreign Exchange Loss' } },
            { accountName: { contains: 'Forex Loss' } },
            { accountNo: '6050' }
          ],
          isActive: true
        }
      })) || forexAccount;

    const forexGainLoss = await prisma.forexGainLoss.create({
      data: {
        invoice: { connect: { id: invoiceId } },
        transactionDate: new Date(),
        fromCurrency: { connect: { id: invoice.currencyId } },
        toCurrency: { connect: { id: bank.currencyId } },
        originalAmount: originalZwlDec.toDecimalPlaces(2),
        convertedAmount: paymentZwlEq.toDecimalPlaces(2),
        exchangeRate: new Decimal(zwlPerZar),
        gainLossAmount: gainLossZwlAbs,
        gainLossType,
        description: `USD invoice ${invoice.invoiceNumber || invoiceId} paid in ZAR; pair ${zwgPerZarInfo.matchedPair}, ZWL/ZAR=${zwlPerZar}`,
        createdBy: { connect: { id: createdById } }
      },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            ...prismaInvoiceSnapshotSelect
          }
        },
        fromCurrency: { select: { id: true, code: true, name: true, symbol: true } },
        toCurrency: { select: { id: true, code: true, name: true, symbol: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } }
      }
    });

    const journalEntry = await createJournalEntryWithAuditSequence({
      transactionDate: new Date(),
      referenceNumber: `PAY-ZAR-${forexGainLoss.id.slice(-8)}`,
      description: `ZAR payment for USD invoice ${invoice.invoiceNumber || invoiceId}`,
      totalAmount: paymentZar,
      currencyId: bank.currencyId,
      status: 'POSTED',
      createdById,
    });

    await prisma.journalEntryLine.create({
      data: {
        journalEntryId: journalEntry.id,
        chartOfAccountId: bank.glAccountId,
        debitAmount: paymentZar,
        creditAmount: new Decimal(0),
        description: 'Customer receipt — ZAR bank',
        vatAmount: new Decimal(0)
      }
    });

    await prisma.journalEntryLine.create({
      data: {
        journalEntryId: journalEntry.id,
        chartOfAccountId: arAccount.id,
        debitAmount: new Decimal(0),
        creditAmount: zarObligation,
        description: 'Clear AR (ZAR equivalent of USD invoice at payment ZWL/ZAR)',
        vatAmount: new Decimal(0)
      }
    });

    if (fxDiffAbsZar.gt(0)) {
      if (paymentZar.gt(zarObligation)) {
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: forexAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: fxDiffAbsZar,
            description: 'Foreign exchange gain (ZAR)',
            vatAmount: new Decimal(0)
          }
        });
      } else {
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: forexLossAccount.id,
            debitAmount: fxDiffAbsZar,
            creditAmount: new Decimal(0),
            description: 'Foreign exchange loss (ZAR)',
            vatAmount: new Decimal(0)
          }
        });
      }
    }

    const roundingRv = await MultiCurrencyService.applyRoundingVarianceToJournalEntry(
      journalEntry.id,
      createdById
    );

    await prisma.forexGainLoss.update({
      where: { id: forexGainLoss.id },
      data: { journalEntryId: journalEntry.id }
    });

    await AuditService.log({
      userId: createdById,
      action: 'CREATE',
      entityType: 'ForexGainLoss',
      entityId: forexGainLoss.id,
      newValues: forexGainLoss
    });

    return {
      forexGainLoss,
      journalEntryId: journalEntry.id,
      breakdown: {
        invoiceTotalUsd: totalUsd,
        usdZwlAtCreation,
        originalZwlAtCreation: Number(originalZwlDec),
        zwlPerZarAtPayment: zwlPerZar,
        zarObligationAtPayment: Number(zarObligation),
        paymentZar: Number(paymentZar),
        paymentZwlEquivalent: Number(paymentZwlEq),
        gainLossZwl: Number(gainLossZwl),
        gainLossType,
        zimratePairUsed: zwgPerZarInfo.matchedPair,
        ...(roundingRv.posted
          ? {
              roundingVariancePosted: true,
              roundingVarianceAmount: roundingRv.roundingAmount,
              roundingVarianceImbalanceBefore: roundingRv.imbalanceBefore
            }
          : {})
      }
    };
  }

  private static async ensureForexGainLossAccount() {
    const existing = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountName: { contains: 'Foreign Exchange' } },
          { accountName: { contains: 'Forex' } },
          { accountName: { contains: 'FX' } }
        ],
        isActive: true
      }
    });
    if (existing) {
      return existing;
    }
    return prisma.chartOfAccounts.create({
      data: {
        accountNo: '6000',
        accountName: 'Foreign Exchange Gain/Loss',
        accountType: 'Revenue',
        financialStatement: 'Income Statement',
        isActive: true
      }
    });
  }

  /** GL account for sub-cent conversion remainders (e.g. 0.001 ZiG) so journals stay balanced. */
  static async ensureRoundingVarianceAccount() {
    const existing = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [{ accountNo: '6095' }, { accountName: { contains: 'Rounding Variance' } }],
        isActive: true
      }
    });
    if (existing) {
      return existing;
    }
    return prisma.chartOfAccounts.create({
      data: {
        accountNo: '6095',
        accountName: 'Rounding Variance',
        accountType: 'Expense',
        financialStatement: 'Income Statement',
        isActive: true
      }
    });
  }

  /**
   * If debits ≠ credits by a tiny amount (within 0.01), post the remainder to Rounding Variance.
   * Requires journal line DECIMAL(15,3) for true 0.001 postings (run db:migrate:journal-line-amount-precision).
   */
  static async applyRoundingVarianceToJournalEntry(
    journalEntryId: string,
    createdById: string
  ): Promise<{ posted: boolean; roundingAmount?: string; imbalanceBefore?: string }> {
    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId }
    });
    if (!lines.length) {
      return { posted: false };
    }

    let dr = new Decimal(0);
    let cr = new Decimal(0);
    for (const l of lines) {
      dr = dr.plus(l.debitAmount ?? 0);
      cr = cr.plus(l.creditAmount ?? 0);
    }

    const imb = dr.minus(cr);
    const EPS = new Decimal('0.0000001');
    const MAX = new Decimal('0.01');

    if (imb.abs().lte(EPS)) {
      return { posted: false, imbalanceBefore: imb.toFixed() };
    }

    if (imb.abs().gt(MAX)) {
      throw new Error(
        `Journal ${journalEntryId} is out of balance by ${imb.toFixed()} (exceeds ${MAX.toFixed()} rounding cap)`
      );
    }

    const postAmt = imb.abs().toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
    if (postAmt.lte(EPS)) {
      return { posted: false, imbalanceBefore: imb.toFixed() };
    }

    const rv = await MultiCurrencyService.ensureRoundingVarianceAccount();

    if (imb.gt(0)) {
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId,
          chartOfAccountId: rv.id,
          debitAmount: new Decimal(0),
          creditAmount: postAmt,
          description: 'Rounding variance (conversion / ZiG remainder)',
          vatAmount: new Decimal(0)
        }
      });
    } else {
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId,
          chartOfAccountId: rv.id,
          debitAmount: postAmt,
          creditAmount: new Decimal(0),
          description: 'Rounding variance (conversion / ZiG remainder)',
          vatAmount: new Decimal(0)
        }
      });
    }

    await AuditService.log({
      userId: createdById,
      action: 'CREATE',
      entityType: 'JournalEntry',
      entityId: journalEntryId,
      newValues: {
        note: 'Rounding variance line',
        roundingAmount: postAmt.toFixed(),
        imbalanceBefore: imb.toFixed()
      }
    });

    return { posted: true, roundingAmount: postAmt.toFixed(), imbalanceBefore: imb.toFixed() };
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
   * Create payment journal entry with integrated forex gain/loss
   * UAT Requirement: DR Cash/Bank (payment amount), CR AR (original ZWL value), CR Forex Gain (difference)
   */
  private static async createPaymentWithForexJournalEntry(params: {
    invoice: any;
    paymentZWLAmount: number;
    originalZWLValue: number;
    gainLossAmount: number;
    gainLossType: 'GAIN' | 'LOSS';
    paymentCurrencyId: string;
    forexGainLossId: string;
    createdById: string;
  }): Promise<string> {
    try {
      const { invoice, paymentZWLAmount, originalZWLValue, gainLossAmount, gainLossType, paymentCurrencyId, forexGainLossId, createdById } = params;

      // Get or create Foreign Exchange Gain/Loss account
      let forexAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountName: { contains: 'Foreign Exchange' } },
            { accountName: { contains: 'Forex' } },
            { accountName: { contains: 'FX' } }
          ],
          isActive: true
        }
      });

      if (!forexAccount) {
        // Create Foreign Exchange Gain/Loss account if it doesn't exist
        forexAccount = await prisma.chartOfAccounts.create({
          data: {
            accountNo: '6000',
            accountName: 'Foreign Exchange Gain/Loss',
            accountType: 'Revenue', // Gains are revenue, losses are expenses (we'll handle both)
            financialStatement: 'Income Statement',
            isActive: true
          }
        });
      }

      // Get Accounts Receivable account
      const arAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: '1200' },
            { accountName: { contains: 'Accounts Receivable' } }
          ],
          isActive: true
        }
      });

      if (!arAccount) {
        throw new Error('Accounts Receivable account (1200) not found');
      }

      // Get Bank/Cash account (use default bank account for ZWL)
      const bankAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: '1100' },
            { accountNo: '1000' },
            { accountName: { contains: 'Bank' } },
            { accountName: { contains: 'Cash' } }
          ],
          isActive: true
        },
        orderBy: { accountNo: 'asc' }
      });

      if (!bankAccount) {
        throw new Error('Bank/Cash account not found');
      }

      // Create journal entry
      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate: new Date(),
        referenceNumber: `PAY-FX-${forexGainLossId.slice(-8)}`,
        description: `Payment for invoice ${invoice.invoiceNumber || invoice.id} with forex ${gainLossType.toLowerCase()}`,
        totalAmount: new Decimal(paymentZWLAmount),
        currencyId: paymentCurrencyId,
        status: 'POSTED',
        createdById,
      });

      // Create journal entry lines according to UAT requirement
      // DR: Cash/Bank (paymentZWLAmount)
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: bankAccount.id,
          debitAmount: new Decimal(paymentZWLAmount),
          creditAmount: new Decimal(0),
          description: `Payment received in ZWL`,
          vatAmount: new Decimal(0)
        }
      });

      // CR: Accounts Receivable (originalZWLValue)
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: arAccount.id,
          debitAmount: new Decimal(0),
          creditAmount: new Decimal(originalZWLValue),
          description: `Clear AR at original ZWL value`,
          vatAmount: new Decimal(0)
        }
      });

      // CR: Foreign Exchange Gain (gainLossAmount) - if GAIN
      // OR DR: Foreign Exchange Loss (gainLossAmount) - if LOSS
      if (gainLossType === 'GAIN') {
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: forexAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(gainLossAmount),
            description: `Foreign exchange gain`,
            vatAmount: new Decimal(0)
          }
        });
      } else {
        // For LOSS, we need to debit the forex account (expense)
        // Check if we need a separate Loss account or use expense account
        const forexLossAccount = await prisma.chartOfAccounts.findFirst({
          where: {
            OR: [
              { accountName: { contains: 'Foreign Exchange Loss' } },
              { accountName: { contains: 'Forex Loss' } },
              { accountNo: '6050' } // Unrealized Loss account found earlier
            ],
            isActive: true
          }
        });

        const lossAccount = forexLossAccount || forexAccount;

        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: lossAccount.id,
            debitAmount: new Decimal(gainLossAmount),
            creditAmount: new Decimal(0),
            description: `Foreign exchange loss`,
            vatAmount: new Decimal(0)
          }
        });
      }

      await MultiCurrencyService.applyRoundingVarianceToJournalEntry(journalEntry.id, createdById);

      return journalEntry.id;
    } catch (error) {
      console.error('Error creating payment with forex journal entry:', error);
      throw error;
    }
  }

  /**
   * Create forex gain/loss journal entry
   */
  private static async createForexGainLossJournalEntry(forexGainLoss: ForexGainLoss, createdById: string): Promise<void> {
    try {
      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate: forexGainLoss.transactionDate,
        referenceNumber: `FOREX-${forexGainLoss.id}`,
        description: `Forex ${forexGainLoss.gainLossType}: ${forexGainLoss.description}`,
        totalAmount: forexGainLoss.gainLossAmount,
        currencyId: forexGainLoss.fromCurrencyId,
        status: 'POSTED',
        createdById,
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
   * Live USD/ZWG from Zimrate shaped like legacy DB exchange-rate rows (frontend-compatible).
   */
  static async getExchangeRates(filters: {
    fromCurrencyId?: string;
    toCurrencyId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
    userId?: string;
  } = {}): Promise<{
    exchangeRates: Array<{
      id: string;
      date: string;
      fromCurrencyId: string;
      toCurrencyId: string;
      rate: string;
      isActive: boolean;
      createdById: string;
      createdAt: string;
      fromCurrency: { id: string; code: string; name: string; symbol: string };
      toCurrency: { id: string; code: string; name: string; symbol: string };
      createdBy: { id: string; firstName: string; lastName: string; email: string };
      /** Present when rate is derived, not a direct Zimrate row (e.g. USD/ZAR cross). */
      rateDerivation?: string;
    }>;
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const pageNum = typeof filters.page === 'number' && Number.isFinite(filters.page) ? filters.page : 1;
      const limitNum =
        typeof filters.limit === 'number' && Number.isFinite(filters.limit) ? filters.limit : 10;
      const page = Math.max(1, pageNum);
      const limit = Math.max(1, Math.min(100, limitNum));

      let zimrateFull: ZimrateRatesPayload | null = null;
      try {
        zimrateFull = await fetchZimrateRates();
      } catch (e) {
        console.warn('[MultiCurrencyService] Zimrate fetch failed for exchange-rates list:', e);
      }

      const usdRow = zimrateFull ? pickUsdZwg(zimrateFull) : null;
      let usdZwg: number;
      let effectiveDate: Date;
      let createdAtIso: string;

      if (usdRow && typeof usdRow.avg === 'number' && !Number.isNaN(usdRow.avg) && usdRow.avg > 0) {
        usdZwg = usdRow.avg;
        const labelDate = parseZimrateDateLabel(usdRow.date_label);
        effectiveDate =
          labelDate ??
          (zimrateFull?.meta?.last_updated ? new Date(zimrateFull.meta.last_updated) : new Date());
        createdAtIso = zimrateFull?.meta?.timestamp
          ? new Date(zimrateFull.meta.timestamp).toISOString()
          : new Date().toISOString();
      } else {
        const stored = await getLastStoredUsdZwgFromDb(prisma);
        if (!stored) {
          throw new Error(
            'USD/ZWG rate unavailable: Zimrate is down and no prior transaction snapshot exists in the database'
          );
        }
        usdZwg = stored.rate;
        effectiveDate = stored.usedAt;
        createdAtIso = stored.usedAt.toISOString();
      }

      const currencies = await prisma.currency.findMany({
        select: { id: true, code: true, name: true, symbol: true }
      });
      const usdCur = currencies.find((c) => c.code.toUpperCase() === 'USD');
      const zwgCur =
        currencies.find((c) => c.code.toUpperCase() === 'ZWL') ??
        currencies.find((c) => c.code.toUpperCase() === 'ZWG');
      const zarCur = currencies.find((c) => c.code.toUpperCase() === 'ZAR');
      if (!usdCur || !zwgCur) {
        throw new Error(
          'Currencies table must include USD and ZWL (or ZWG) for live exchange rate display'
        );
      }

      let createdByUser = filters.userId
        ? await prisma.user.findUnique({
            where: { id: filters.userId },
            select: { id: true, firstName: true, lastName: true, email: true }
          })
        : null;
      if (!createdByUser) {
        createdByUser = await prisma.user.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { id: true, firstName: true, lastName: true, email: true }
        });
      }
      if (!createdByUser) {
        throw new Error('No user found to attach to live exchange rate response');
      }

      const createdBy = {
        id: createdByUser.id,
        firstName: createdByUser.firstName,
        lastName: createdByUser.lastName,
        email: createdByUser.email
      };

      const baseRow = (partial: {
        fromCurrencyId: string;
        toCurrencyId: string;
        rate: string;
        fromCurrency: { id: string; code: string; name: string; symbol: string };
        toCurrency: { id: string; code: string; name: string; symbol: string };
        rateDerivation?: string;
      }) => ({
        id: randomUUID(),
        date: effectiveDate.toISOString(),
        rate: partial.rate,
        isActive: true,
        createdById: createdByUser.id,
        createdAt: createdAtIso,
        fromCurrencyId: partial.fromCurrencyId,
        toCurrencyId: partial.toCurrencyId,
        fromCurrency: partial.fromCurrency,
        toCurrency: partial.toCurrency,
        createdBy,
        ...(partial.rateDerivation ? { rateDerivation: partial.rateDerivation } : {})
      });

      const allRates: Array<ReturnType<typeof baseRow>> = [];

      allRates.push(
        baseRow({
          fromCurrencyId: usdCur.id,
          toCurrencyId: zwgCur.id,
          rate: String(usdZwg),
          fromCurrency: { id: usdCur.id, code: usdCur.code, name: usdCur.name, symbol: usdCur.symbol },
          toCurrency: { id: zwgCur.id, code: zwgCur.code, name: zwgCur.name, symbol: zwgCur.symbol }
        })
      );

      const zwgPerZarInfo = zimrateFull ? extractZwgPerZar(zimrateFull) : null;
      if (zwgPerZarInfo && zarCur) {
        const { zwgPerZar } = zwgPerZarInfo;
        const zarPerZwg = 1 / zwgPerZar;
        allRates.push(
          baseRow({
            fromCurrencyId: zwgCur.id,
            toCurrencyId: zarCur.id,
            rate: String(zarPerZwg),
            fromCurrency: {
              id: zwgCur.id,
              code: zwgCur.code,
              name: zwgCur.name,
              symbol: zwgCur.symbol
            },
            toCurrency: {
              id: zarCur.id,
              code: zarCur.code,
              name: zarCur.name,
              symbol: zarCur.symbol
            }
          })
        );

        const zarPerUsd = usdZwg / zwgPerZar;
        allRates.push(
          baseRow({
            fromCurrencyId: usdCur.id,
            toCurrencyId: zarCur.id,
            rate: String(zarPerUsd),
            fromCurrency: { id: usdCur.id, code: usdCur.code, name: usdCur.name, symbol: usdCur.symbol },
            toCurrency: {
              id: zarCur.id,
              code: zarCur.code,
              name: zarCur.name,
              symbol: zarCur.symbol
            },
            rateDerivation: 'USD/ZAR = (USD/ZWG) / (ZWG per ZAR) using Zimrate ZAR/ZWG (or inverse ZWG/ZAR)'
          })
        );
      } else if (zwgPerZarInfo && !zarCur) {
        console.warn(
          '[MultiCurrencyService] Zimrate includes ZAR/ZWG but currencies table has no ZAR — skipping ZWG/ZAR and USD/ZAR rows'
        );
      } else if (!zwgPerZarInfo && zimrateFull) {
        console.warn(
          '[MultiCurrencyService] No ZAR/ZWG (or ZWG/ZAR) pair in Zimrate response — only USD/ZWG returned'
        );
      }

      let filtered = allRates;
      if (filters.fromCurrencyId) {
        filtered = filtered.filter((r) => r.fromCurrencyId === filters.fromCurrencyId);
      }
      if (filters.toCurrencyId) {
        filtered = filtered.filter((r) => r.toCurrencyId === filters.toCurrencyId);
      }

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const start = (page - 1) * limit;
      const exchangeRates = filtered.slice(start, start + limit);

      return {
        exchangeRates,
        total,
        page,
        totalPages
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
                totalAmount: true,
                ...prismaInvoiceSnapshotSelect
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

  /**
   * Revalue foreign currency bank account
   * UAT Requirement: Calculate unrealized gain/loss when exchange rate changes
   * 
   * @param bankId - Bank account ID to revalue
   * @param newExchangeRate - New exchange rate for revaluation
   * @param revaluationDate - Date of revaluation
   * @param baseCurrencyId - Base currency ID (ZIG/ZWL)
   * @param createdById - User ID creating the revaluation
   * @param oldExchangeRateDate - Optional date to get old exchange rate (defaults to revaluationDate - 1 day)
   */
  static async revalueForeignCurrencyBank(
    bankId: string,
    newExchangeRate: number,
    revaluationDate: Date,
    baseCurrencyId: string,
    createdById: string,
    oldExchangeRateDate?: Date
  ): Promise<{
    bank: any;
    foreignCurrencyBalance: number;
    oldBaseCurrencyValue: number;
    newBaseCurrencyValue: number;
    unrealizedGainLoss: number;
    gainLossType: 'GAIN' | 'LOSS';
    journalEntryId: string;
  }> {
    try {
      // Get bank with GL account and currency
      const bank = await prisma.bank.findUnique({
        where: { id: bankId },
        include: {
          glAccount: true,
          currency: true
        }
      });

      if (!bank) {
        throw new Error('Bank account not found');
      }

      if (!bank.glAccount) {
        throw new Error('Bank GL account not configured');
      }

      // Bank must be in a foreign currency (not base currency)
      if (bank.currencyId === baseCurrencyId) {
        throw new Error('Bank account is already in base currency. Revaluation only applies to foreign currency accounts.');
      }

      // Calculate current balance in foreign currency from journal entries
      // Get all journal entry lines for this bank's GL account up to revaluation date
      const periodEnd = new Date(revaluationDate);
      periodEnd.setHours(23, 59, 59, 999);

      // Optimize query: First get journal entries, then filter lines
      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          transactionDate: {
            lte: periodEnd
          },
          status: 'POSTED',
          // Exclude reversal entries
          AND: [
            {
              referenceNumber: {
                not: {
                  startsWith: 'VR-'
                }
              }
            },
            {
              referenceNumber: {
                not: {
                  startsWith: 'REV-'
                }
              }
            }
          ],
          // Exclude entries linked to voided/reversed cashbook entries
          cashbookEntries: {
            none: {
              OR: [
                { status: 'VOIDED' },
                { reversedAt: { not: null } }
              ]
            }
          }
        },
        select: {
          id: true
        }
      });

      const journalEntryIds = journalEntries.map(je => je.id);

      // Now get journal entry lines for this bank's GL account
      const journalEntryLines = journalEntryIds.length > 0 ? await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: bank.glAccount.id,
          journalEntryId: {
            in: journalEntryIds
          }
        },
        select: {
          debitAmount: true,
          creditAmount: true
        }
      }) : [];

      // Calculate foreign currency balance (in bank's currency)
      // For asset accounts: Balance = Debits - Credits
      let foreignCurrencyBalance = 0;
      for (const line of journalEntryLines) {
        const debit = parseFloat(line.debitAmount.toString());
        const credit = parseFloat(line.creditAmount.toString());
        foreignCurrencyBalance += (debit - credit);
      }

      // Get the old exchange rate used (for old base currency value)
      // If oldExchangeRateDate is provided, use it; otherwise find the rate from the earliest transaction
      let oldRate: number;
      
      if (oldExchangeRateDate) {
        // Use the provided date - parse it correctly
        // Exchange rates are stored with dates, we need to match them correctly
        let normalizedOldDate: Date;
        if (typeof oldExchangeRateDate === 'string' && oldExchangeRateDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Parse YYYY-MM-DD as UTC date to match how Prisma stores dates
          const [year, month, day] = oldExchangeRateDate.split('-').map(Number);
          normalizedOldDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        } else {
          normalizedOldDate = new Date(oldExchangeRateDate);
          normalizedOldDate.setUTCHours(0, 0, 0, 0);
        }
        
        // Get target date as string for comparison
        const targetDateStr = normalizedOldDate.toISOString().split('T')[0];
        
        // Query ALL rates for this currency pair and filter by exact date string match
        // This ensures we get the exact rate for the target date, regardless of timezone issues
        const allRates = await prisma.exchangeRate.findMany({
          where: {
            fromCurrencyId: bank.currencyId,
            toCurrencyId: baseCurrencyId,
            isActive: true
          },
          orderBy: { date: 'desc' }
        });
        
        // Find exact date match by comparing date strings (YYYY-MM-DD)
        let oldExchangeRate = allRates.find(r => {
          const rateDateStr = new Date(r.date).toISOString().split('T')[0];
          return rateDateStr === targetDateStr;
        });
        
        if (oldExchangeRate) {
          console.log(`[Revaluation] Found exact date match: Rate ${oldExchangeRate.rate} on ${targetDateStr}`);
        } else {
          console.log(`[Revaluation] No exact date match found for ${targetDateStr}. Available rates:`);
          // Log available rates for debugging (show last 10)
          allRates.slice(0, 10).forEach(r => {
            const rateDateStr = new Date(r.date).toISOString().split('T')[0];
            console.log(`[Revaluation]   Rate ${r.rate} on ${rateDateStr}`);
          });
          
          // If no exact match found, throw error (don't use older rates)
          throw new Error(`Exchange rate not found for ${bank.currency.code} to base currency on ${targetDateStr}. Please create the exchange rate for this date.`);
        }

        oldRate = Number(oldExchangeRate.rate);
      } else {
        // Find the earliest transaction date and use that rate
        const earliestJournalEntry = await prisma.journalEntry.findFirst({
          where: {
            id: { in: journalEntryIds },
            status: 'POSTED'
          },
          orderBy: { transactionDate: 'asc' },
          select: { transactionDate: true }
        });

        if (earliestJournalEntry) {
          const earliestDate = new Date(earliestJournalEntry.transactionDate);
          earliestDate.setHours(0, 0, 0, 0);
          
          const oldExchangeRate = await this.getExchangeRate(
            bank.currencyId,
            baseCurrencyId,
            earliestDate
          );

          if (!oldExchangeRate) {
            // Fallback to revaluation date minus 1 day
            const fallbackDate = new Date(revaluationDate);
            fallbackDate.setDate(fallbackDate.getDate() - 1);
            fallbackDate.setHours(0, 0, 0, 0);
            
            const fallbackRate = await this.getExchangeRate(
              bank.currencyId,
              baseCurrencyId,
              fallbackDate
            );
            
            if (!fallbackRate) {
              throw new Error(`Old exchange rate not found. Please ensure exchange rates are set up.`);
            }
            oldRate = Number(fallbackRate.rate);
          } else {
            oldRate = Number(oldExchangeRate.rate);
          }
        } else {
          // No transactions found, use revaluation date minus 1 day
          const fallbackDate = new Date(revaluationDate);
          fallbackDate.setDate(fallbackDate.getDate() - 1);
          fallbackDate.setHours(0, 0, 0, 0);
          
          const fallbackRate = await this.getExchangeRate(
            bank.currencyId,
            baseCurrencyId,
            fallbackDate
          );
          
          if (!fallbackRate) {
            throw new Error(`Old exchange rate not found. Please ensure exchange rates are set up.`);
          }
          oldRate = Number(fallbackRate.rate);
        }
      }
      const oldBaseCurrencyValue = foreignCurrencyBalance * oldRate;
      const newBaseCurrencyValue = foreignCurrencyBalance * newExchangeRate;
      const unrealizedGainLoss = newBaseCurrencyValue - oldBaseCurrencyValue;
      const gainLossType = unrealizedGainLoss >= 0 ? 'GAIN' : 'LOSS';

      // Get or create Unrealized FX Gain/Loss account
      let unrealizedGainAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: '4050' }, // Unrealized Gain account
            { accountName: { contains: 'Unrealized' } },
            { accountName: { contains: 'Unrealised' } }
          ],
          isActive: true
        }
      });

      if (!unrealizedGainAccount) {
        // Create Unrealized FX Gain/Loss account if it doesn't exist
        unrealizedGainAccount = await prisma.chartOfAccounts.create({
          data: {
            accountNo: '4050',
            accountName: 'Unrealized Foreign Exchange Gain/Loss',
            accountType: 'Revenue', // Gains are revenue
            financialStatement: 'Income Statement',
            isActive: true
          }
        });
      }

      // Create revaluation journal entry
      // DR: USD Bank (unrealized gain/loss amount)
      // CR: Unrealized FX Gain (if gain) OR DR: Unrealized FX Loss, CR: USD Bank (if loss)
      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate: revaluationDate,
        referenceNumber: `REV-FX-${bank.id.slice(-8)}-${Date.now()}`,
        description: `Foreign currency revaluation for ${bank.name} (${bank.currency.code})`,
        totalAmount: new Decimal(Math.abs(unrealizedGainLoss)),
        currencyId: baseCurrencyId,
        status: 'POSTED',
        createdById,
      });

      if (gainLossType === 'GAIN') {
        // GAIN: DR Bank, CR Unrealized Gain
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: bank.glAccount.id,
            debitAmount: new Decimal(Math.abs(unrealizedGainLoss)),
            creditAmount: new Decimal(0),
            description: `Unrealized FX gain on ${bank.currency.code} bank account`,
            vatAmount: new Decimal(0)
          }
        });

        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: unrealizedGainAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(Math.abs(unrealizedGainLoss)),
            description: `Unrealized foreign exchange gain`,
            vatAmount: new Decimal(0)
          }
        });
      } else {
        // LOSS: DR Unrealized Loss, CR Bank
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: unrealizedGainAccount.id,
            debitAmount: new Decimal(Math.abs(unrealizedGainLoss)),
            creditAmount: new Decimal(0),
            description: `Unrealized foreign exchange loss`,
            vatAmount: new Decimal(0)
          }
        });

        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: bank.glAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(Math.abs(unrealizedGainLoss)),
            description: `Unrealized FX loss on ${bank.currency.code} bank account`,
            vatAmount: new Decimal(0)
          }
        });
      }

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: 'CREATE',
        entityType: 'JournalEntry',
        entityId: journalEntry.id,
        newValues: {
          type: 'ForeignCurrencyRevaluation',
          bankId,
          oldRate,
          newRate: newExchangeRate,
          unrealizedGainLoss
        },
      });

      return {
        bank: {
          id: bank.id,
          name: bank.name,
          accountNumber: bank.accountNumber,
          currency: bank.currency
        },
        foreignCurrencyBalance,
        oldBaseCurrencyValue,
        newBaseCurrencyValue,
        unrealizedGainLoss: Math.abs(unrealizedGainLoss),
        gainLossType,
        journalEntryId: journalEntry.id
      };
    } catch (error) {
      console.error('Error revaluing foreign currency bank:', error);
      throw error;
    }
  }
}
