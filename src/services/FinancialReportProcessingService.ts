// @ts-nocheck
import csv from 'csv-parser';
import { PassThrough } from 'stream';
import { prisma } from '../utils/database';
import { FirebaseStorageService } from './FirebaseStorageService';

interface ParsedBalanceSheet {
  reportTitle: string;
  periodStart: string;
  periodEnd: string;
  currentAssets?: number;
  nonCurrentAssets?: number;
  totalAssets?: number;
  currentLiabilities?: number;
  nonCurrentLiabilities?: number;
  totalLiabilities?: number;
  shareholdersEquity?: number;
}

interface ParsedIncomeStatement {
  reportTitle: string;
  periodStart: string;
  periodEnd: string;
  totalRevenue?: number;
  costOfGoodsSold?: number;
  grossProfit?: number;
  operatingExpenses?: number;
  otherIncome?: number;
  otherExpenses?: number;
  netIncome?: number;
}

interface ParsedCashflowStatement {
  reportTitle: string;
  periodStart: string;
  periodEnd: string;
  cashFromOperating?: number;
  cashFromInvesting?: number;
  cashFromFinancing?: number;
  netCashFlow?: number;
  startingCashBalance?: number;
  endingCashBalance?: number;
}

export interface FinancialReportProcessingResult {
  reportId: string;
  reportType: string;
  periodKey: string;
  parsedData: any;
  derivedKpis: Record<string, number>;
  portfolioCompanyId: string;
  previousSnapshot?: any;
}

export class FinancialReportProcessingService {
  static async process(report: any): Promise<FinancialReportProcessingResult> {
    const existing = await prisma.portfolioCompany.findUnique({
      where: { id: report.portfolioCompanyId },
      select: { financialKpis: true }
    });

    const previousSnapshot = existing?.financialKpis
      ? JSON.parse(JSON.stringify(existing.financialKpis))
      : null;

    const fileBuffer = await FirebaseStorageService.downloadImportFile(report.storagePath);
    const periodEnd = new Date(report.periodEnd).toISOString().split('T')[0];
    const parsedData = await this.parseReport(report.reportType, fileBuffer);

    if (!parsedData) {
      throw new Error('Unable to parse financial report data. Please verify the template format.');
    }

    await prisma.$executeRawUnsafe(
      `UPDATE financial_reports SET parsedSnapshot = ?, updatedAt = NOW(3) WHERE id = ?`,
      JSON.stringify({
        reportType: report.reportType,
        parsedData,
        processedAt: new Date().toISOString()
      }),
      report.id
    );

    const derivedKpis = await this.updatePortfolioCompanySnapshots(
      report.portfolioCompanyId,
      periodEnd,
      report.reportType,
      parsedData
    );

    return {
      reportId: report.id,
      reportType: report.reportType,
      periodKey: periodEnd,
      parsedData,
      derivedKpis,
      portfolioCompanyId: report.portfolioCompanyId,
      previousSnapshot
    };
  }

  private static async parseReport(reportType: string, fileBuffer: Buffer) {
    const rows = await this.parseCsvRows(fileBuffer);
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    switch (reportType) {
      case 'BALANCE_SHEET':
        return this.parseBalanceSheetRow(row);
      case 'INCOME_STATEMENT':
        return this.parseIncomeStatementRow(row);
      case 'CASHFLOW_STATEMENT':
        return this.parseCashflowStatementRow(row);
      default:
        return null;
    }
  }

  private static async parseCsvRows(fileBuffer: Buffer): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      const bufferStream = new PassThrough();
      bufferStream.end(fileBuffer);

      bufferStream
        .pipe(csv())
        .on('data', (data: any) => {
          results.push(data);
        })
        .on('end', () => resolve(results))
        .on('error', (error: any) => reject(error));
    });
  }

  private static parseBalanceSheetRow(row: any): ParsedBalanceSheet {
    return {
      reportTitle: (row['Report Title'] || row['report_title'] || '').toString().trim(),
      periodStart: this.parseDateField(row['Reporting Period Start'] || row['period_start']),
      periodEnd: this.parseDateField(row['Reporting Period End'] || row['period_end']),
      currentAssets: this.parseNumber(row['Current Assets']),
      nonCurrentAssets: this.parseNumber(row['Non-Current Assets']),
      totalAssets: this.parseNumber(row['Total Assets']),
      currentLiabilities: this.parseNumber(row['Current Liabilities']),
      nonCurrentLiabilities: this.parseNumber(row['Non-Current Liabilities']),
      totalLiabilities: this.parseNumber(row['Total Liabilities']),
      shareholdersEquity: this.parseNumber(row['Shareholders Equity'])
    };
  }

  private static parseIncomeStatementRow(row: any): ParsedIncomeStatement {
    return {
      reportTitle: (row['Report Title'] || '').toString().trim(),
      periodStart: this.parseDateField(row['Reporting Period Start']),
      periodEnd: this.parseDateField(row['Reporting Period End']),
      totalRevenue: this.parseNumber(row['Total Revenue']),
      costOfGoodsSold: this.parseNumber(row['Cost of Goods Sold']),
      grossProfit: this.parseNumber(row['Gross Profit']),
      operatingExpenses: this.parseNumber(row['Operating Expenses']),
      otherIncome: this.parseNumber(row['Other Income']),
      otherExpenses: this.parseNumber(row['Other Expenses']),
      netIncome: this.parseNumber(row['Net Income'])
    };
  }

  private static parseCashflowStatementRow(row: any): ParsedCashflowStatement {
    return {
      reportTitle: (row['Report Title'] || '').toString().trim(),
      periodStart: this.parseDateField(row['Reporting Period Start']),
      periodEnd: this.parseDateField(row['Reporting Period End']),
      cashFromOperating: this.parseNumber(row['Cash From Operating Activities']),
      cashFromInvesting: this.parseNumber(row['Cash From Investing Activities']),
      cashFromFinancing: this.parseNumber(row['Cash From Financing Activities']),
      netCashFlow: this.parseNumber(row['Net Cash Flow']),
      startingCashBalance: this.parseNumber(row['Starting Cash Balance']),
      endingCashBalance: this.parseNumber(row['Ending Cash Balance'])
    };
  }

  private static parseDateField(value: any): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return value.toString();
    }
    return date.toISOString().split('T')[0];
  }

  private static parseNumber(value: any): number | undefined {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const normalized = value.toString().replace(/[^0-9.-]/g, '');
    if (!normalized) {
      return undefined;
    }
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? undefined : parsed;
  }

  private static async updatePortfolioCompanySnapshots(
    portfolioCompanyId: string,
    periodKey: string,
    reportType: string,
    parsedData: any
  ) {
    const reportKey = this.normalizeReportType(reportType);
    const existing = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { financialKpis: true }
    });

    const snapshot = existing?.financialKpis || {};
    snapshot.reports = snapshot.reports || {};
    snapshot.reports[periodKey] = snapshot.reports[periodKey] || {};
    snapshot.reports[periodKey][reportKey] = parsedData;

    snapshot.latest = snapshot.latest || {};
    snapshot.latest[reportKey] = { ...parsedData, periodKey };
    snapshot.lastReportDate = periodKey;
    snapshot.lastUpdatedAt = new Date().toISOString();

    // Derive KPI values for performance dashboards
    const kpiValues = snapshot.kpiValues || {};
    const periodKpis = kpiValues[periodKey] || {};
    const derivedKpis = this.deriveKpiValues(reportType, parsedData);
    kpiValues[periodKey] = { ...periodKpis, ...derivedKpis };
    snapshot.kpiValues = kpiValues;
    snapshot.latestKpiValues = { ...(snapshot.latestKpiValues || {}), ...derivedKpis };

    await prisma.portfolioCompany.update({
      where: { id: portfolioCompanyId },
      data: { financialKpis: snapshot }
    });

    return derivedKpis;
  }

  private static normalizeReportType(reportType: string) {
    switch (reportType) {
      case 'BALANCE_SHEET':
        return 'balanceSheet';
      case 'INCOME_STATEMENT':
        return 'incomeStatement';
      case 'CASHFLOW_STATEMENT':
        return 'cashflowStatement';
      default:
        return reportType.toLowerCase();
    }
  }

  private static deriveKpiValues(reportType: string, parsedData: any) {
    const values: Record<string, number> = {};

    if (reportType === 'INCOME_STATEMENT') {
      if (parsedData.totalRevenue !== undefined) {
        values['TOTAL_REVENUE'] = parsedData.totalRevenue;
      }
      if (parsedData.netIncome !== undefined) {
        values['NET_PROFIT'] = parsedData.netIncome;
      }
      if (parsedData.operatingExpenses !== undefined) {
        values['OPERATING_EXPENSES'] = parsedData.operatingExpenses;
      }
    }

    if (reportType === 'CASHFLOW_STATEMENT') {
      if (parsedData.netCashFlow !== undefined) {
        values['CASH_FLOW_NET'] = parsedData.netCashFlow;
      }
      if (parsedData.endingCashBalance !== undefined) {
        values['CASH_BALANCE'] = parsedData.endingCashBalance;
      }
    }

    if (reportType === 'BALANCE_SHEET') {
      if (parsedData.totalLiabilities !== undefined) {
        values['TOTAL_LIABILITIES'] = parsedData.totalLiabilities;
      }
      if (parsedData.shareholdersEquity !== undefined) {
        values['SHAREHOLDERS_EQUITY'] = parsedData.shareholdersEquity;
      }
    }

    return values;
  }
}
