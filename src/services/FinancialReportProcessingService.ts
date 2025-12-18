// @ts-nocheck
import csv from 'csv-parser';
import { PassThrough } from 'stream';
import XLSX from 'xlsx';
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

// XLSX Parsing Interfaces
interface ParsedIncomeStatementXLSX {
  years: string[]; // ['2025', '2024', '2023']
  revenue: { [year: string]: number };
  cogs: { [year: string]: number };
  operatingExpenses: { [year: string]: number };
  netIncome: { [year: string]: number };
  grossProfit: { [year: string]: number };
  operatingIncome: { [year: string]: number };
  totalNetRevenue: { [year: string]: number };
}

interface ParsedNonFinancialKPIs {
  parameters: Array<{
    parameter: string;
    description: string;
    output: string | number;
  }>;
  totals: Record<string, number>; // Aggregated KPI totals
}

interface ParsedStatementOfFinancialPosition {
  ownerEquity: {
    investment: number;
    retainedEarnings: number;
    other: number;
    total: number;
  };
  ratios: Record<string, number>; // Financial ratios
  totalLongTermLiabilities?: number;
  totalLiabilitiesAndEquity?: number;
}

interface ParsedCashflowStatementXLSX {
  operations: {
    receipts: number;
    payments: number;
    net: number;
  };
  investing: {
    receipts: number;
    payments: number;
    net: number;
  };
  financing: {
    receipts: number;
    payments: number;
    net: number;
  };
  netIncrease: number;
  endingBalance: number;
  startingBalance?: number;
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

    // Apply period aggregation if needed
    // Create a copy to avoid mutating original parsedData
    let aggregatedData = JSON.parse(JSON.stringify(parsedData));
    
    if (report.periodType === 'QUARTERLY' && (report.reportType === 'INCOME_STATEMENT' || report.reportType === 'INCOME_STATEMENTS')) {
      // Aggregate last 3 months for quarterly report
      const quarterlyRevenue = await this.aggregateQuarterlyIncome(
        report.portfolioCompanyId,
        new Date(report.periodEnd)
      );
      if (aggregatedData.totalNetRevenue && aggregatedData.years) {
        // XLSX format - update latest year
        aggregatedData.totalNetRevenue[aggregatedData.years[0]] = quarterlyRevenue;
        aggregatedData.revenue[aggregatedData.years[0]] = quarterlyRevenue;
      } else {
        // CSV format
        aggregatedData.totalRevenue = quarterlyRevenue;
      }
    } else if (report.periodType === 'ANNUAL' && (report.reportType === 'INCOME_STATEMENT' || report.reportType === 'INCOME_STATEMENTS')) {
      // Sum all monthly/quarterly for annual revenue
      const annualRevenue = await this.aggregateAnnualIncome(
        report.portfolioCompanyId,
        new Date(report.periodEnd)
      );
      if (aggregatedData.totalNetRevenue && aggregatedData.years) {
        // XLSX format - update latest year
        aggregatedData.totalNetRevenue[aggregatedData.years[0]] = annualRevenue;
        aggregatedData.revenue[aggregatedData.years[0]] = annualRevenue;
      } else {
        // CSV format
        aggregatedData.totalRevenue = annualRevenue;
      }
    }

    const derivedKpis = await this.updatePortfolioCompanySnapshots(
      report.portfolioCompanyId,
      periodEnd,
      report.reportType,
      aggregatedData
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
    // Detect file type (CSV or XLSX)
    const isXLSX = this.isXLSXFile(fileBuffer);
    
    if (isXLSX) {
      return await this.parseXLSXReport(reportType, fileBuffer);
    } else {
      // CSV parsing (backward compatibility)
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
  }

  private static isXLSXFile(buffer: Buffer): boolean {
    // XLSX files start with PK (ZIP signature) or check magic bytes
    const signature = buffer.slice(0, 4);
    // XLSX files are ZIP archives, check for ZIP signature
    return signature[0] === 0x50 && signature[1] === 0x4B && 
           (signature[2] === 0x03 || signature[2] === 0x05 || signature[2] === 0x07);
  }

  private static async parseXLSXReport(reportType: string, fileBuffer: Buffer): Promise<any> {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      switch (reportType) {
        case 'INCOME_STATEMENTS':
          return this.parseIncomeStatementXLSX(data);
        case 'NON_FINANCIAL_KPIS':
          return this.parseNonFinancialKPIsXLSX(data);
        case 'STATEMENT_OF_FINANCIAL_POSITION':
          return this.parseStatementOfFinancialPositionXLSX(data);
        case 'CASHFLOW_STATEMENTS':
          return this.parseCashflowStatementXLSX(data);
        default:
          return null;
      }
    } catch (error: any) {
      console.error('Error parsing XLSX file:', error);
      throw new Error(`Failed to parse XLSX file: ${error.message}`);
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

  // XLSX Parsing Methods
  private static parseIncomeStatementXLSX(data: any[][]): ParsedIncomeStatementXLSX {
    const result: ParsedIncomeStatementXLSX = {
      years: [],
      revenue: {},
      cogs: {},
      operatingExpenses: {},
      netIncome: {},
      grossProfit: {},
      operatingIncome: {},
      totalNetRevenue: {}
    };

    // Find header row with years (2025, 2024, 2023)
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (Array.isArray(row) && row.some(cell => /202[3-5]/.test(String(cell)))) {
        headerRowIndex = i;
        // Extract years from header
        for (let j = 1; j < row.length; j++) {
          const cell = String(row[j] || '').trim();
          if (/202[3-5]/.test(cell)) {
            result.years.push(cell);
          }
        }
        break;
      }
    }

    if (headerRowIndex === -1 || result.years.length === 0) {
      throw new Error('Could not find year columns in income statement');
    }

    // Parse data rows
    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];
      if (!Array.isArray(row) || row.length === 0) continue;

      const label = String(row[0] || '').toLowerCase().trim();
      
      // Extract values for each year
      for (let yearIdx = 0; yearIdx < result.years.length; yearIdx++) {
        const year = result.years[yearIdx];
        const colIdx = yearIdx + 1;
        const value = this.parseNumber(row[colIdx]);

        if (label.includes('total net revenue')) {
          result.totalNetRevenue[year] = value || 0;
          result.revenue[year] = value || 0;
        } else if (label.includes('total cost of goods sold')) {
          result.cogs[year] = value || 0;
        } else if (label.includes('gross profit')) {
          result.grossProfit[year] = value || 0;
        } else if (label.includes('total operating expenses')) {
          result.operatingExpenses[year] = value || 0;
        } else if (label.includes('operating income') || label.includes('ebit')) {
          result.operatingIncome[year] = value || 0;
        } else if (label.includes('net income')) {
          result.netIncome[year] = value || 0;
        }
      }
    }

    return result;
  }

  private static parseNonFinancialKPIsXLSX(data: any[][]): ParsedNonFinancialKPIs {
    const result: ParsedNonFinancialKPIs = {
      parameters: [],
      totals: {}
    };

    // Find header row
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(5, data.length); i++) {
      const row = data[i];
      if (Array.isArray(row) && row[0]?.toString().toLowerCase().includes('parameter')) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      throw new Error('Could not find header row in non-financial KPIs');
    }

    // Parse data rows
    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];
      if (!Array.isArray(row) || row.length < 3) continue;

      const parameter = String(row[0] || '').trim();
      const description = String(row[1] || '').trim();
      const output = String(row[2] || '').trim();

      if (!parameter && !description) continue; // Skip empty rows

      const outputNum = this.parseNumber(output);
      
      result.parameters.push({
        parameter,
        description,
        output: outputNum !== undefined ? outputNum : output
      });

      // Extract totals from numeric outputs
      if (outputNum !== undefined && !isNaN(outputNum)) {
        const key = parameter || description || `kpi_${i}`;
        result.totals[key] = (result.totals[key] || 0) + outputNum;
      }
    }

    return result;
  }

  private static parseStatementOfFinancialPositionXLSX(data: any[][]): ParsedStatementOfFinancialPosition {
    const result: ParsedStatementOfFinancialPosition = {
      ownerEquity: {
        investment: 0,
        retainedEarnings: 0,
        other: 0,
        total: 0
      },
      ratios: {}
    };

    // Parse owner's equity section
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!Array.isArray(row)) continue;

      const label = String(row[0] || '').toLowerCase().trim();
      const value = this.parseNumber(row[1]) || this.parseNumber(row[2]) || 0;

      if (label.includes('owner\'s investment') || label.includes('owner investment')) {
        result.ownerEquity.investment = value;
      } else if (label.includes('retained earnings')) {
        result.ownerEquity.retainedEarnings = value;
      } else if (label.includes('other') && label.includes('equity')) {
        result.ownerEquity.other = value;
      } else if (label.includes('total owner\'s equity') || label.includes('total owner equity')) {
        result.ownerEquity.total = value;
      } else if (label.includes('total long-term liabilities')) {
        result.totalLongTermLiabilities = value;
      } else if (label.includes('total liabilities and owner\'s equity')) {
        result.totalLiabilitiesAndEquity = value;
      }

      // Parse financial ratios (after "Common Financial Ratios" header)
      if (label.includes('common financial ratios') || label.includes('profitability ratios')) {
        // Parse ratios in subsequent rows
        for (let j = i + 1; j < Math.min(i + 20, data.length); j++) {
          const ratioRow = data[j];
          if (!Array.isArray(ratioRow) || ratioRow.length < 2) continue;
          
          const ratioName = String(ratioRow[0] || '').trim();
          const ratioValue = this.parseNumber(ratioRow[1]) || this.parseNumber(ratioRow[2]);
          
          if (ratioName && ratioValue !== undefined) {
            result.ratios[ratioName] = ratioValue;
          }
        }
        break;
      }
    }

    return result;
  }

  private static parseCashflowStatementXLSX(data: any[][]): ParsedCashflowStatementXLSX {
    const result: ParsedCashflowStatementXLSX = {
      operations: { receipts: 0, payments: 0, net: 0 },
      investing: { receipts: 0, payments: 0, net: 0 },
      financing: { receipts: 0, payments: 0, net: 0 },
      netIncrease: 0,
      endingBalance: 0,
      startingBalance: 0
    };

    let currentSection = '';
    let operationsReceipts = 0;
    let operationsPayments = 0;
    let investingReceipts = 0;
    let investingPayments = 0;
    let financingReceipts = 0;
    let financingPayments = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!Array.isArray(row)) continue;

      const label = String(row[0] || '').toLowerCase().trim();
      const value = this.parseNumber(row[1]) || 0;

      // Detect section headers
      if (label.includes('operations')) {
        currentSection = 'operations';
      } else if (label.includes('investing activities')) {
        currentSection = 'investing';
      } else if (label.includes('financing activities')) {
        currentSection = 'financing';
      }

      // Parse cash receipts and payments
      if (label.includes('cash receipts from')) {
        // Next rows will be receipts
        for (let j = i + 1; j < Math.min(i + 10, data.length); j++) {
          const receiptRow = data[j];
          if (!Array.isArray(receiptRow)) continue;
          const receiptLabel = String(receiptRow[0] || '').toLowerCase().trim();
          const receiptValue = this.parseNumber(receiptRow[1]) || 0;
          
          if (receiptLabel.includes('cash paid for')) break;
          if (receiptValue > 0) {
            if (currentSection === 'operations') operationsReceipts += receiptValue;
            else if (currentSection === 'investing') investingReceipts += receiptValue;
            else if (currentSection === 'financing') financingReceipts += receiptValue;
          }
        }
      } else if (label.includes('cash paid for')) {
        // Next rows will be payments
        for (let j = i + 1; j < Math.min(i + 10, data.length); j++) {
          const paymentRow = data[j];
          if (!Array.isArray(paymentRow)) continue;
          const paymentLabel = String(paymentRow[0] || '').toLowerCase().trim();
          const paymentValue = this.parseNumber(paymentRow[1]) || 0;
          
          if (paymentLabel.includes('net cash flow') || paymentLabel.includes('cash receipts')) break;
          if (paymentValue > 0) {
            if (currentSection === 'operations') operationsPayments += paymentValue;
            else if (currentSection === 'investing') investingPayments += paymentValue;
            else if (currentSection === 'financing') financingPayments += paymentValue;
          }
        }
      }

      // Parse summary lines
      if (label.includes('net cash flow from operations')) {
        result.operations.net = value;
      } else if (label.includes('net cash flow from investing')) {
        result.investing.net = value;
      } else if (label.includes('net cash flow from financing')) {
        result.financing.net = value;
      } else if (label.includes('net increase in cash')) {
        result.netIncrease = value;
      } else if (label.includes('cash at end of year')) {
        result.endingBalance = value;
      } else if (label.includes('cash at beginning of year')) {
        result.startingBalance = value;
      }
    }

    // Set calculated values
    result.operations.receipts = operationsReceipts;
    result.operations.payments = operationsPayments;
    result.investing.receipts = investingReceipts;
    result.investing.payments = investingPayments;
    result.financing.receipts = financingReceipts;
    result.financing.payments = financingPayments;

    return result;
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
      case 'STATEMENT_OF_FINANCIAL_POSITION':
        return 'balanceSheet';
      case 'INCOME_STATEMENT':
      case 'INCOME_STATEMENTS':
        return 'incomeStatement';
      case 'CASHFLOW_STATEMENT':
      case 'CASHFLOW_STATEMENTS':
        return 'cashflowStatement';
      case 'NON_FINANCIAL_KPIS':
        return 'nonFinancialKPIs';
      default:
        return reportType.toLowerCase();
    }
  }

  private static deriveKpiValues(reportType: string, parsedData: any) {
    const values: Record<string, number> = {};

    if (reportType === 'INCOME_STATEMENT' || reportType === 'INCOME_STATEMENTS') {
      // Handle both old CSV format and new XLSX format
      if (parsedData.totalRevenue !== undefined) {
        values['TOTAL_REVENUE'] = parsedData.totalRevenue;
      } else if (parsedData.totalNetRevenue) {
        // XLSX format with multiple years - use latest year or sum
        const years = parsedData.years || [];
        if (years.length > 0) {
          const latestYear = years[0]; // Most recent year
          values['TOTAL_REVENUE'] = parsedData.totalNetRevenue[latestYear] || 0;
        }
      }
      
      if (parsedData.netIncome !== undefined) {
        values['NET_PROFIT'] = parsedData.netIncome;
      } else if (parsedData.netIncome && parsedData.years) {
        const latestYear = parsedData.years[0];
        values['NET_PROFIT'] = parsedData.netIncome[latestYear] || 0;
      }
      
      if (parsedData.operatingExpenses !== undefined) {
        values['OPERATING_EXPENSES'] = parsedData.operatingExpenses;
      } else if (parsedData.operatingExpenses && parsedData.years) {
        const latestYear = parsedData.years[0];
        values['OPERATING_EXPENSES'] = parsedData.operatingExpenses[latestYear] || 0;
      }
    }

    if (reportType === 'CASHFLOW_STATEMENT' || reportType === 'CASHFLOW_STATEMENTS') {
      if (parsedData.netCashFlow !== undefined) {
        values['CASH_FLOW_NET'] = parsedData.netCashFlow;
      } else if (parsedData.netIncrease !== undefined) {
        values['CASH_FLOW_NET'] = parsedData.netIncrease;
      }
      
      if (parsedData.endingCashBalance !== undefined) {
        values['CASH_BALANCE'] = parsedData.endingCashBalance;
      } else if (parsedData.endingBalance !== undefined) {
        values['CASH_BALANCE'] = parsedData.endingBalance;
      }
    }

    if (reportType === 'BALANCE_SHEET' || reportType === 'STATEMENT_OF_FINANCIAL_POSITION') {
      if (parsedData.totalLiabilities !== undefined) {
        values['TOTAL_LIABILITIES'] = parsedData.totalLiabilities;
      } else if (parsedData.totalLongTermLiabilities !== undefined) {
        values['TOTAL_LIABILITIES'] = parsedData.totalLongTermLiabilities;
      }
      
      if (parsedData.shareholdersEquity !== undefined) {
        values['SHAREHOLDERS_EQUITY'] = parsedData.shareholdersEquity;
      } else if (parsedData.ownerEquity?.total !== undefined) {
        values['SHAREHOLDERS_EQUITY'] = parsedData.ownerEquity.total;
      }
    }

    if (reportType === 'NON_FINANCIAL_KPIS') {
      // Extract totals from non-financial KPIs
      if (parsedData.totals) {
        Object.keys(parsedData.totals).forEach(key => {
          values[`NON_FINANCIAL_${key.toUpperCase().replace(/\s+/g, '_')}`] = parsedData.totals[key];
        });
      }
    }

    return values;
  }

  // Period Aggregation Methods
  private static async aggregateQuarterlyIncome(
    portfolioCompanyId: string,
    periodEnd: Date
  ): Promise<number> {
    // Sum last 3 months of income statements
    const threeMonthsAgo = new Date(periodEnd);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const reports = await prisma.$queryRawUnsafe<any[]>(
      `SELECT parsedSnapshot
       FROM financial_reports
       WHERE portfolioCompanyId = ?
         AND reportType IN ('INCOME_STATEMENT', 'INCOME_STATEMENTS')
         AND periodEnd >= ?
         AND periodEnd <= ?
         AND status = 'ACCEPTED'
       ORDER BY periodEnd ASC`,
      portfolioCompanyId,
      threeMonthsAgo.toISOString().split('T')[0],
      periodEnd.toISOString().split('T')[0]
    );

    let totalRevenue = 0;
    for (const report of reports) {
      if (report.parsedSnapshot) {
        const snapshot = JSON.parse(report.parsedSnapshot);
        const data = snapshot.parsedData;
        
        if (data.totalRevenue !== undefined) {
          totalRevenue += data.totalRevenue;
        } else if (data.totalNetRevenue && data.years) {
          // XLSX format - use latest year
          const latestYear = data.years[0];
          totalRevenue += data.totalNetRevenue[latestYear] || 0;
        }
      }
    }

    return totalRevenue;
  }

  private static async aggregateAnnualIncome(
    portfolioCompanyId: string,
    periodEnd: Date
  ): Promise<number> {
    // Sum all monthly/quarterly income statements for the year
    const yearStart = new Date(periodEnd);
    yearStart.setMonth(0, 1); // January 1st
    yearStart.setHours(0, 0, 0, 0);

    const reports = await prisma.$queryRawUnsafe<any[]>(
      `SELECT parsedSnapshot
       FROM financial_reports
       WHERE portfolioCompanyId = ?
         AND reportType IN ('INCOME_STATEMENT', 'INCOME_STATEMENTS')
         AND periodEnd >= ?
         AND periodEnd <= ?
         AND status = 'ACCEPTED'
       ORDER BY periodEnd ASC`,
      portfolioCompanyId,
      yearStart.toISOString().split('T')[0],
      periodEnd.toISOString().split('T')[0]
    );

    let totalRevenue = 0;
    for (const report of reports) {
      if (report.parsedSnapshot) {
        const snapshot = JSON.parse(report.parsedSnapshot);
        const data = snapshot.parsedData;
        
        if (data.totalRevenue !== undefined) {
          totalRevenue += data.totalRevenue;
        } else if (data.totalNetRevenue && data.years) {
          // XLSX format - use latest year
          const latestYear = data.years[0];
          totalRevenue += data.totalNetRevenue[latestYear] || 0;
        }
      }
    }

    return totalRevenue;
  }
}
