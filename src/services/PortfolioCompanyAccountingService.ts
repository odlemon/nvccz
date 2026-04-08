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
  bankId?: string;
}

export class PortfolioCompanyAccountingService {
  private static async createJournalEntryFromAccountCodes(args: {
    createdById: string;
    transactionDateIso: string; // YYYY-MM-DD
    description: string;
    currencyId: string;
    lines: Array<{
      accountCode: string;
      debitAmount: number;
      creditAmount: number;
      description?: string;
    }>;
  }): Promise<{ journalEntryId: string }> {
    const accountNos = [...new Set(args.lines.map((l) => String(l.accountCode)).filter(Boolean))];
    if (accountNos.includes("1000")) {
      throw new Error("Invalid accountCode: 1000 is a reporting bucket and cannot be posted to.");
    }

    const accounts = await prisma.chartOfAccounts.findMany({
      where: { accountNo: { in: accountNos }, isActive: true },
      select: { id: true, accountNo: true },
    });
    const byNo = new Map(accounts.map((a) => [String(a.accountNo), a.id]));
    const missing = accountNos.filter((n) => !byNo.has(String(n)));
    if (missing.length > 0) {
      throw new Error(`Unknown/Inactive accountCode(s): ${missing.join(", ")}`);
    }

    const txDate = new Date(args.transactionDateIso);
    if (Number.isNaN(txDate.getTime())) {
      throw new Error("Invalid transactionDateIso (expected YYYY-MM-DD)");
    }

    const result = await JournalEntryService.createManualJournalEntry({
      transactionDate: txDate,
      referenceNumber: `AUTO-${Date.now()}`,
      description: args.description,
      currencyId: args.currencyId,
      journalEntryLines: args.lines.map((l) => ({
        chartOfAccountId: byNo.get(String(l.accountCode))!,
        debitAmount: Number(l.debitAmount || 0),
        creditAmount: Number(l.creditAmount || 0),
        description: l.description || args.description,
      })),
      createdById: args.createdById,
    } as any);

    if (!result?.success || !result?.journalEntry?.id) {
      throw new Error(result?.error || "Failed to post journal entry");
    }

    return { journalEntryId: result.journalEntry.id };
  }

  static async recordValuationAdjustment(params: ValuationAdjustmentParams) {
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: params.portfolioCompanyId },
      select: { id: true, name: true, financialKpis: true }
    });

    if (!company) {
      throw new Error('Portfolio company not found');
    }

    // Guardrail: do not allow valuation dated on/before last approved reporting period.
    const lastReportDateRaw = company.financialKpis?.lastReportDate;
    if (lastReportDateRaw) {
      const last = new Date(String(lastReportDateRaw));
      const val = new Date(params.valuationDate);
      if (!Number.isNaN(last.getTime()) && !Number.isNaN(val.getTime())) {
        // Compare by date (YYYY-MM-DD) in UTC.
        const lastIso = last.toISOString().split('T')[0];
        const valIso = val.toISOString().split('T')[0];
        if (valIso <= lastIso) {
          throw new Error(
            `Valuation date must be after lastReportDate (${lastIso}). Received valuationDate=${valIso}.`
          );
        }
      }
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

    const currencyId = await this.getDefaultCurrencyId();
    const txDateIso = new Date(params.valuationDate).toISOString().split("T")[0];
    const description = `Valuation adjustment for ${company.name}`;

    const { journalEntryId } = await this.createJournalEntryFromAccountCodes({
      createdById: params.approvedById,
      transactionDateIso: txDateIso,
      description,
      currencyId,
      lines:
        difference > 0
          ? [
              {
                accountCode: "1502",
                debitAmount: Math.abs(difference),
                creditAmount: 0,
                description: "Increase in investment fair value",
              },
              {
                accountCode: "4050",
                debitAmount: 0,
                creditAmount: Math.abs(difference),
                description: "Unrealized gain on investment",
              },
            ]
          : [
              {
                accountCode: "6050",
                debitAmount: Math.abs(difference),
                creditAmount: 0,
                description: "Unrealized loss on investment",
              },
              {
                accountCode: "1502",
                debitAmount: 0,
                creditAmount: Math.abs(difference),
                description: "Decrease in investment fair value",
              },
            ],
    });

    await prisma.$executeRawUnsafe(
      `UPDATE portfolio_company_valuations
       SET journalEntryId = ?, updatedAt = NOW(3)
       WHERE id = ?`,
      journalEntryId,
      valuationId
    );

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

    const currencyId = await this.getDefaultCurrencyId();

    // Debit an actual bank-linked GL (never 1000 reporting bucket).
    const bank = params.bankId
      ? await prisma.bank.findUnique({
          where: { id: params.bankId },
          select: { id: true, isActive: true, glAccount: { select: { accountNo: true } } },
        })
      : await prisma.bank.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true, isActive: true, glAccount: { select: { accountNo: true } } },
        });

    if (!bank?.glAccount?.accountNo) {
      throw new Error("No active bank with a linked GL account found (bankId required or configure a default active bank)");
    }
    if (String(bank.glAccount.accountNo) === "1000") {
      throw new Error("Invalid bank GL configuration: bank is linked to reporting bucket accountNo=1000");
    }

    const txDateIso = new Date(params.dividendDate).toISOString().split("T")[0];
    const description = `Dividend income from ${company.name}`;

    const { journalEntryId } = await this.createJournalEntryFromAccountCodes({
      createdById: params.approvedById,
      transactionDateIso: txDateIso,
      description,
      currencyId,
      lines: [
        {
          accountCode: String(bank.glAccount.accountNo),
          debitAmount: params.amount,
          creditAmount: 0,
          description: "Dividend cash received",
        },
        {
          accountCode: "4100",
          debitAmount: 0,
          creditAmount: params.amount,
          description: "Dividend income",
        },
      ],
    });

    await prisma.$executeRawUnsafe(
      `UPDATE portfolio_company_dividends
       SET journalEntryId = ?, updatedAt = NOW(3)
       WHERE id = ?`,
      journalEntryId,
      dividendId
    );

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
