// @ts-nocheck
import { randomUUID } from 'crypto';
import { prisma } from '../utils/database';
import { JournalEntryService } from './JournalEntryService';

interface ValuationAdjustmentParams {
  portfolioCompanyId: string;
  previousAmount: number;
  newAmount: number;
  valuationDate: string | Date;
  approvedById: string;
  notes?: string;
}

interface DividendRecordParams {
  portfolioCompanyId: string;
  amount: number;
  dividendDate: string | Date;
  approvedById: string;
  notes?: string;
}

export class PortfolioCompanyAccountingService {
  static async recordValuationAdjustment(params: ValuationAdjustmentParams) {
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: params.portfolioCompanyId },
      select: { id: true, name: true, financialKpis: true }
    });

    if (!company) {
      throw new Error('Portfolio company not found');
    }

    const difference = Number((params.newAmount - params.previousAmount).toFixed(2));
    if (difference === 0) {
      throw new Error('Valuation difference must not be zero');
    }

    const valuationId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO portfolio_company_valuations (
        id,
        portfolioCompanyId,
        previousAmount,
        newAmount,
        difference,
        valuationDate,
        approvedById,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ,
      valuationId,
      params.portfolioCompanyId,
      params.previousAmount,
      params.newAmount,
      difference,
      PortfolioCompanyAccountingService.formatDate(params.valuationDate),
      params.approvedById,
      params.notes || null
    );

    const investmentAssetAccountId = await this.getAccountId('1502');
    const unrealizedGainAccountId = await this.getAccountId('4050');
    const unrealizedLossAccountId = await this.getAccountId('6050');
    const currencyId = await this.getDefaultCurrencyId();

    const lines = difference > 0
      ? [
          {
            chartOfAccountId: investmentAssetAccountId,
            debitAmount: Math.abs(difference),
            creditAmount: 0,
            description: 'Increase in investment fair value'
          },
          {
            chartOfAccountId: unrealizedGainAccountId,
            debitAmount: 0,
            creditAmount: Math.abs(difference),
            description: 'Unrealized gain on investment'
          }
        ]
      : [
          {
            chartOfAccountId: unrealizedLossAccountId,
            debitAmount: Math.abs(difference),
            creditAmount: 0,
            description: 'Unrealized loss on investment'
          },
          {
            chartOfAccountId: investmentAssetAccountId,
            debitAmount: 0,
            creditAmount: Math.abs(difference),
            description: 'Decrease in investment fair value'
          }
        ];

    const journalEntryResult = await JournalEntryService.createManualJournalEntry({
      transactionDate: new Date(params.valuationDate),
      referenceNumber: `VAL-${Date.now()}`,
      description: `Valuation adjustment for ${company.name}`,
      currencyId,
      journalEntryLines: lines,
      createdById: params.approvedById
    });

    if (!journalEntryResult?.success || !journalEntryResult?.journalEntry) {
      throw new Error(journalEntryResult?.error || 'Failed to create journal entry for valuation adjustment');
    }

    const journalEntryId = journalEntryResult.journalEntry.id;

    await prisma.$executeRawUnsafe(
      `UPDATE portfolio_company_valuations
       SET journalEntryId = ?, updatedAt = NOW(3)
       WHERE id = ?`,
      journalEntryId,
      valuationId
    );

    await prisma.journalEntry.update({
      where: { id: journalEntryId },
      data: { status: 'POSTED' }
    });

    await this.updateFinancialSnapshotsForValuation(company.id, company.financialKpis, {
      valuationDate: PortfolioCompanyAccountingService.formatDate(params.valuationDate),
      previousAmount: params.previousAmount,
      newAmount: params.newAmount,
      difference,
      journalEntryId
    });

    return {
      valuationId,
      journalEntryId,
      difference
    };
  }

  static async recordDividend(params: DividendRecordParams) {
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: params.portfolioCompanyId },
      select: { id: true, name: true, financialKpis: true }
    });

    if (!company) {
      throw new Error('Portfolio company not found');
    }

    if (params.amount <= 0) {
      throw new Error('Dividend amount must be greater than zero');
    }

    const dividendId = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO portfolio_company_dividends (
        id,
        portfolioCompanyId,
        amount,
        dividendDate,
        approvedById,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?)` ,
      dividendId,
      params.portfolioCompanyId,
      params.amount,
      PortfolioCompanyAccountingService.formatDate(params.dividendDate),
      params.approvedById,
      params.notes || null
    );

    const cashAccountId = await this.getAccountId('1000');
    const dividendIncomeAccountId = await this.getAccountId('4100');
    const currencyId = await this.getDefaultCurrencyId();

    const journalEntryResult = await JournalEntryService.createManualJournalEntry({
      transactionDate: new Date(params.dividendDate),
      referenceNumber: `DIV-${Date.now()}`,
      description: `Dividend income from ${company.name}`,
      currencyId,
      journalEntryLines: [
        {
          chartOfAccountId: cashAccountId,
          debitAmount: params.amount,
          creditAmount: 0,
          description: 'Dividend cash received'
        },
        {
          chartOfAccountId: dividendIncomeAccountId,
          debitAmount: 0,
          creditAmount: params.amount,
          description: 'Dividend income'
        }
      ],
      createdById: params.approvedById
    });

    if (!journalEntryResult?.success || !journalEntryResult?.journalEntry) {
      throw new Error(journalEntryResult?.error || 'Failed to create journal entry for dividend');
    }

    const journalEntryId = journalEntryResult.journalEntry.id;

    await prisma.$executeRawUnsafe(
      `UPDATE portfolio_company_dividends
       SET journalEntryId = ?, updatedAt = NOW(3)
       WHERE id = ?`,
      journalEntryId,
      dividendId
    );

    await prisma.journalEntry.update({
      where: { id: journalEntryId },
      data: { status: 'POSTED' }
    });

    await this.updateFinancialSnapshotsForDividend(company.id, company.financialKpis, {
      dividendDate: PortfolioCompanyAccountingService.formatDate(params.dividendDate),
      amount: params.amount,
      journalEntryId
    });

    return {
      dividendId,
      journalEntryId
    };
  }

  private static async getAccountId(accountNo: string): Promise<string> {
    const account = await prisma.chartOfAccounts.findUnique({
      where: { accountNo }
    });

    if (!account) {
      throw new Error(`GL account ${accountNo} not found. Please run the seeding script.`);
    }

    return account.id;
  }

  private static async getDefaultCurrencyId(): Promise<string> {
    const currency = await prisma.currency.findFirst({
      where: { isDefault: true }
    });

    if (currency) {
      return currency.id;
    }

    const fallback = await prisma.currency.findFirst();
    if (!fallback) {
      throw new Error('No currencies configured in the system');
    }

    return fallback.id;
  }

  private static async updateFinancialSnapshotsForValuation(
    portfolioCompanyId: string,
    financialKpis: any,
    payload: { valuationDate: string; previousAmount: number; newAmount: number; difference: number; journalEntryId: string }
  ) {
    const snapshot = financialKpis || {};
    snapshot.valuationHistory = snapshot.valuationHistory || [];
    snapshot.valuationHistory.push({
      valuationDate: payload.valuationDate,
      previousAmount: payload.previousAmount,
      newAmount: payload.newAmount,
      difference: payload.difference,
      journalEntryId: payload.journalEntryId
    });

    snapshot.latestValuation = {
      valuationDate: payload.valuationDate,
      amount: payload.newAmount,
      difference: payload.difference,
      journalEntryId: payload.journalEntryId
    };

    snapshot.lastValuationAt = payload.valuationDate;

    const kpiValues = snapshot.kpiValues || {};
    const periodKpis = kpiValues[payload.valuationDate] || {};
    periodKpis['PORTFOLIO_FAIR_VALUE'] = payload.newAmount;
    periodKpis['UNREALIZED_GAIN_LOSS'] = payload.difference;
    kpiValues[payload.valuationDate] = periodKpis;
    snapshot.kpiValues = kpiValues;
    snapshot.latestKpiValues = {
      ...(snapshot.latestKpiValues || {}),
      PORTFOLIO_FAIR_VALUE: payload.newAmount,
      UNREALIZED_GAIN_LOSS: payload.difference
    };

    await prisma.portfolioCompany.update({
      where: { id: portfolioCompanyId },
      data: { financialKpis: snapshot }
    });
  }

  private static async updateFinancialSnapshotsForDividend(
    portfolioCompanyId: string,
    financialKpis: any,
    payload: { dividendDate: string; amount: number; journalEntryId: string }
  ) {
    const snapshot = financialKpis || {};
    snapshot.dividendHistory = snapshot.dividendHistory || [];
    snapshot.dividendHistory.push({
      dividendDate: payload.dividendDate,
      amount: payload.amount,
      journalEntryId: payload.journalEntryId
    });

    snapshot.latestDividend = {
      dividendDate: payload.dividendDate,
      amount: payload.amount,
      journalEntryId: payload.journalEntryId
    };

    const cumulative = snapshot.cumulativeDividendIncome || 0;
    snapshot.cumulativeDividendIncome = Number((cumulative + payload.amount).toFixed(2));

    const kpiValues = snapshot.kpiValues || {};
    const periodKpis = kpiValues[payload.dividendDate] || {};
    periodKpis['DIVIDEND_INCOME'] = payload.amount;
    kpiValues[payload.dividendDate] = periodKpis;
    snapshot.kpiValues = kpiValues;
    snapshot.latestKpiValues = {
      ...(snapshot.latestKpiValues || {}),
      DIVIDEND_INCOME: payload.amount
    };

    await prisma.portfolioCompany.update({
      where: { id: portfolioCompanyId },
      data: { financialKpis: snapshot }
    });
  }

  private static formatDate(value: string | Date): string {
    if (!value) {
      return new Date().toISOString().split('T')[0];
    }
    const dateInstance = value instanceof Date ? value : new Date(value);
    if (isNaN(dateInstance.getTime())) {
      return new Date().toISOString().split('T')[0];
    }
    return dateInstance.toISOString().split('T')[0];
  }
}
