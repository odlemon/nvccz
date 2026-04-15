// @ts-nocheck
import { randomUUID } from 'crypto';
import { prisma } from '../utils/database';
import { JournalEntryService } from './JournalEntryService';

/** PMRAS-3.2 / spreadsheet UAT — exact validation copy. */
const VALUATION_BLOCKED_UNTIL_REPORT_APPROVED =
  "Cannot update valuation until the latest financial reporting period is approved.";

interface ValuationAdjustmentParams {
  portfolioCompanyId: string;
  previousAmount: number;
  newAmount: number;
  valuationDate: string | Date;
  approvedById: string;
  /** Required non-empty narrative (or pass legacy `notes`). */
  reasonForAdjustment?: string;
  notes?: string;
  authToken?: string;
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

  /**
   * Latest calendar `reportingPeriod` row must include at least one **ACCEPTED** `financial_reports` row.
   */
  private static async assertLatestFinancialReportingPeriodApproved(portfolioCompanyId: string): Promise<void> {
    const maxRows = await prisma.$queryRawUnsafe<Array<{ maxP: Date | string | null }>>(
      `SELECT MAX(reportingPeriod) AS maxP FROM financial_reports WHERE portfolioCompanyId = ?`,
      portfolioCompanyId
    );
    const maxP = maxRows[0]?.maxP;
    if (maxP == null) {
      throw new Error(VALUATION_BLOCKED_UNTIL_REPORT_APPROVED);
    }
    const maxKey = maxP instanceof Date ? maxP.toISOString().slice(0, 10) : String(maxP).slice(0, 10);
    const accRows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM financial_reports
       WHERE portfolioCompanyId = ?
         AND DATE(reportingPeriod) = DATE(?)
         AND status = 'ACCEPTED'`,
      portfolioCompanyId,
      maxKey
    );
    if (Number(accRows[0]?.c ?? 0) < 1) {
      throw new Error(VALUATION_BLOCKED_UNTIL_REPORT_APPROVED);
    }
  }

  static async recordValuationAdjustment(params: ValuationAdjustmentParams) {
    const reason = String(params.reasonForAdjustment ?? params.notes ?? "").trim();
    if (!reason) {
      throw new Error("reasonForAdjustment is required (non-empty); you may send `notes` for backward compatibility.");
    }

    const company = await prisma.portfolioCompany.findUnique({
      where: { id: params.portfolioCompanyId },
      select: { id: true, name: true, financialKpis: true }
    });

    if (!company) {
      throw new Error('Portfolio company not found');
    }

    await this.assertLatestFinancialReportingPeriodApproved(params.portfolioCompanyId);

    // As-of date must be strictly after last approved period end stored on the company KPI snapshot.
    // Block only when the as-of date is **strictly before** the last approved period end.
    // (Same calendar day as `lastReportDate` is allowed — e.g. ACCEPT sync sets lastReportDate = period end, then automation values as-of that date.)
    const lastReportDateRaw = company.financialKpis?.lastReportDate;
    if (lastReportDateRaw) {
      const last = new Date(String(lastReportDateRaw));
      const val = new Date(params.valuationDate);
      if (!Number.isNaN(last.getTime()) && !Number.isNaN(val.getTime())) {
        const lastIso = last.toISOString().split('T')[0];
        const valIso = val.toISOString().split('T')[0];
        if (valIso < lastIso) {
          throw new Error(VALUATION_BLOCKED_UNTIL_REPORT_APPROVED);
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
      reason
    );

    const currencyId = await this.getDefaultCurrencyId();
    const txDateIso = new Date(params.valuationDate).toISOString().split("T")[0];
    // Arcus SRD §2.1 (gain) / §2.2 (loss): VC books only — 1502 with 4050 (gain) or 6050 (loss).
    const description =
      difference > 0
        ? `Unrealized Gain on ${company.name} Valuation Adjustment.`
        : `Unrealized Loss on ${company.name} Valuation Adjustment.`;

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
                description: "Investment Asset — increase fair value (Dr)",
              },
              {
                accountCode: "4050",
                debitAmount: 0,
                creditAmount: Math.abs(difference),
                description: "Unrealized Gain on Investment (Cr)",
              },
            ]
          : [
              {
                accountCode: "6050",
                debitAmount: Math.abs(difference),
                creditAmount: 0,
                description: "Unrealized Loss on Investment (Dr)",
              },
              {
                accountCode: "1502",
                debitAmount: 0,
                creditAmount: Math.abs(difference),
                description: "Investment Asset — decrease fair value (Cr)",
              },
            ],
    });

    console.log(
      JSON.stringify({
        triggerId: "CF-PMRAS-3.2",
        event: "VALUATION_ADJUSTMENT_JE_POSTED",
        portfolioCompanyId: params.portfolioCompanyId,
        valuationId,
        journalEntryId,
        difference,
      })
    );

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

    await prisma.auditLog.create({
      data: {
        userId: params.approvedById,
        action: "PORTFOLIO_VALUATION_ADJUSTMENT",
        entityType: "PORTFOLIO_COMPANY",
        entityId: params.portfolioCompanyId,
        oldValues: {
          previousValue: params.previousAmount,
          valuationDate: PortfolioCompanyAccountingService.formatDate(params.valuationDate),
        },
        newValues: {
          newValue: params.newAmount,
          reasonForAdjustment: reason,
          triggerId: "CF-PMRAS-3.2",
          journalEntryId,
          valuationId,
          difference,
        },
      },
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
    // Arcus SRD §2.3: dividend — Dr cash/bank, Cr 4100; does not touch 1502 (no valuation adjustment).
    const description = `Dividend received — ${company.name}`;

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
          description: "Cash / bank — dividend received (Dr)",
        },
        {
          accountCode: "4100",
          debitAmount: 0,
          creditAmount: params.amount,
          description: "Dividend Income (Cr)",
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

    snapshot.currentValuation = payload.newAmount;

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
