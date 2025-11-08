// @ts-nocheck
import { randomUUID } from 'crypto';
import { prisma } from '../utils/database';
import { FirebaseStorageService } from './FirebaseStorageService';
import { EmailNotificationService } from './EmailNotificationService';
import { FinancialReportProcessingService } from './FinancialReportProcessingService';
import { PortfolioCompanyAccountingService } from './PortfolioCompanyAccountingService';
import { join } from 'path';
import { readFileSync } from 'fs';

export type FinancialReportType = 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASHFLOW_STATEMENT';
export type FinancialReportPeriod = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
export type FinancialReportStatus = 'DRAFT' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'NEEDS_REVISION';

interface CreateReportParams {
  portfolioCompanyId: string;
  submittedById: string;
  reportType: FinancialReportType;
  periodType: FinancialReportPeriod;
  periodStart: Date;
  periodEnd: Date;
  title: string;
  description?: string;
  templateVersion?: string;
  fileBuffer: Buffer;
  originalFileName: string;
}

interface ReviewReportParams {
  reportId: string;
  reviewerId: string;
  action: 'ACCEPT' | 'REJECT';
  comment?: string;
  mappingSnapshot?: any;
}

export class FinancialReportService {
  static async createReport(params: CreateReportParams) {
    const id = randomUUID();

    const uploadResult = await FirebaseStorageService.uploadFinancialReport(
      params.fileBuffer,
      params.portfolioCompanyId,
      id,
      params.originalFileName
    );

    await prisma.$executeRawUnsafe(
      `INSERT INTO financial_reports (
        id,
        portfolioCompanyId,
        submittedById,
        reportType,
        periodType,
        periodStart,
        periodEnd,
        title,
        description,
        reportUrl,
        storagePath,
        templateVersion,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`,
      id,
      params.portfolioCompanyId,
      params.submittedById,
      params.reportType,
      params.periodType,
      this.formatDate(params.periodStart),
      this.formatDate(params.periodEnd),
      params.title,
      params.description || null,
      uploadResult.downloadURL,
      uploadResult.filePath,
      params.templateVersion || 'v1'
    );

    return {
      id,
      reportUrl: uploadResult.downloadURL
    };
  }

  static async listReportsForApplicant(userId: string) {
    const companies = await prisma.portfolioCompany.findMany({
      where: { userId },
      select: { id: true, name: true }
    });

    if (companies.length === 0) {
      return [];
    }

    const companyIds = companies.map(c => `'${c.id}'`).join(',');

    const rows = await prisma.$queryRawUnsafe(
      `SELECT fr.*, pc.name as companyName
       FROM financial_reports fr
       JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
       WHERE fr.portfolioCompanyId IN (${companyIds})
       ORDER BY fr.createdAt DESC`
    );

    return rows;
  }

  static async downloadReportTemplate(reportType: string): Promise<Buffer> {
    const normalized = reportType?.toUpperCase();
    let filePath: string;

    switch (normalized) {
      case 'BALANCE_SHEET':
        filePath = join(__dirname, '..', '..', 'templates', 'financial-reports', 'balance_sheet_template.csv');
        break;
      case 'CASHFLOW_STATEMENT':
        filePath = join(__dirname, '..', '..', 'templates', 'financial-reports', 'cashflow_statement_template.csv');
        break;
      case 'INCOME_STATEMENT':
      default:
        filePath = join(__dirname, '..', '..', 'templates', 'financial-reports', 'income_statement_template.csv');
        break;
    }

    return readFileSync(filePath);
  }

  static async listReportsForCompany(portfolioCompanyId: string) {
    return prisma.$queryRawUnsafe(
      `SELECT fr.*, u.firstName as submittedByFirstName, u.lastName as submittedByLastName
       FROM financial_reports fr
       JOIN users u ON u.id = fr.submittedById
       WHERE fr.portfolioCompanyId = ?
         AND fr.status <> 'DRAFT'
       ORDER BY fr.createdAt DESC`,
      portfolioCompanyId
    );
  }

  static async getReportById(reportId: string) {
    const [report] = await prisma.$queryRawUnsafe(
      `SELECT fr.*, pc.contactEmail, pc.name as companyName, pc.id as portfolioCompanyId
       FROM financial_reports fr
       JOIN portfolio_companies pc ON pc.id = fr.portfolioCompanyId
       WHERE fr.id = ?
       LIMIT 1`,
      reportId
    );

    return report || null;
  }

  static async reviewReport(params: ReviewReportParams) {
    const report = await this.getReportById(params.reportId);
    if (!report) {
      throw new Error('Financial report not found');
    }

    if (report.status === 'DRAFT') {
      throw new Error('Report has not been submitted for review');
    }

    const mappingPayload = this.normalizeMapping(params.mappingSnapshot) || this.normalizeMapping(report.mappingSnapshot);
    let status = params.action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';

    await prisma.$executeRawUnsafe(
      `UPDATE financial_reports
       SET status = ?,
           reviewerId = ?,
           reviewedAt = NOW(),
           reviewerComment = ?,
           mappingSnapshot = ?
       WHERE id = ?`,
      status,
      params.reviewerId,
      params.comment || null,
      params.mappingSnapshot ? JSON.stringify(params.mappingSnapshot) : (report.mappingSnapshot ?? null),
      params.reportId
    );

    if (params.action === 'ACCEPT') {
      try {
        await FinancialReportProcessingService.process(report);
        await this.runPostApprovalAutomations(report, params.reviewerId, mappingPayload);
        await this.notifyOutcome(report, 'ACCEPTED', params.comment);
      } catch (error: any) {
        console.error('❌ Failed to process accepted financial report:', error);
        await prisma.$executeRawUnsafe(
          `UPDATE financial_reports
           SET status = 'NEEDS_REVISION',
               reviewerComment = CONCAT(COALESCE(reviewerComment, ''), '\nProcessing error: ', ?)
           WHERE id = ?`,
          error.message || 'Processing error',
          params.reportId
        );
        await this.notifyOutcome(report, 'REJECTED', `${params.comment ? params.comment + '\n' : ''}Processing error: ${error.message || error}`);
        throw error;
      }
    } else {
      await this.notifyOutcome(report, 'REJECTED', params.comment);
    }
  }

  static async enqueueProcessingJob(reportId: string) {
    console.log(`🧾 Queueing financial report processing for report ${reportId}`);
    // Placeholder for queue integration – hook into background worker
  }

  static async submitDraft(reportId: string, userId: string) {
    await this.submitDrafts([reportId], userId);
  }

  static async submitDrafts(reportIds: string[], userId: string) {
    if (!reportIds || reportIds.length === 0) {
      throw new Error('No reports provided');
    }

    const reports = await prisma.$queryRawUnsafe<any[]>(
      `SELECT fr.*
       FROM financial_reports fr
       WHERE fr.id IN (${reportIds.map(() => '?').join(',')})`,
      ...reportIds
    );

    if (reports.length !== reportIds.length) {
      throw new Error('One or more reports not found');
    }

    const invalidOwner = reports.find(report => report.submittedById !== userId);
    if (invalidOwner) {
      throw new Error('One or more reports do not belong to you');
    }

    const invalidStatus = reports.find(report => !['DRAFT', 'NEEDS_REVISION'].includes(report.status));
    if (invalidStatus) {
      throw new Error('Only draft or needs revision reports can be submitted');
    }

    await prisma.$executeRawUnsafe(
      `UPDATE financial_reports
       SET status = 'PENDING',
           updatedAt = NOW()
       WHERE id IN (${reportIds.map(() => '?').join(',')})`,
      ...reportIds
    );

    await Promise.all(
      reports.map(report =>
        this.notifySubmission(report.portfolioCompanyId, report.reportType, report.title, report.periodStart, report.periodEnd)
      )
    );
  }

  private static async notifySubmission(portfolioCompanyId: string, reportType: string, title: string, periodStart: Date, periodEnd: Date) {
    const investmentRoles = ["BOARD_CHAIR", "CIO", "INV_ANALYST"];

    const recipients = await prisma.user.findMany({
      where: {
        userDepartment: 'Investments',
        roleCode: { in: investmentRoles }
      },
      select: {
        email: true,
        firstName: true,
        lastName: true
      }
    });

    if (recipients.length === 0) {
      return;
    }

    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { name: true }
    });

    await EmailNotificationService.sendFinancialReportSubmittedEmail({
      recipients,
      companyName: company?.name || 'Portfolio Company',
      reportType,
      title,
      periodStart,
      periodEnd
    });
  }

  private static async notifyOutcome(report: any, status: FinancialReportStatus, comment?: string) {
    const contactEmail = report.contactEmail || (await this.findApplicantEmail(report.portfolioCompanyId));
    if (!contactEmail) {
      return;
    }

    const payload = {
      recipientEmail: contactEmail,
      companyName: report.companyName,
      reportType: report.reportType,
      title: report.title,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      status,
      comment: comment || ''
    };

    if (status === 'ACCEPTED') {
      await EmailNotificationService.sendFinancialReportAcceptedEmail(payload);
    } else {
      await EmailNotificationService.sendFinancialReportRejectedEmail(payload);
    }
  }

  private static async findApplicantEmail(portfolioCompanyId: string) {
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: {
        user: {
          select: { email: true }
        }
      }
    });

    return company?.user?.email || null;
  }

  private static formatDate(date: Date) {
    const instance = date instanceof Date ? date : new Date(date);
    return instance.toISOString().split('T')[0];
  }

  private static normalizeMapping(raw: any): any | null {
    if (!raw) {
      return null;
    }

    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.warn('⚠️ Unable to parse mapping snapshot string, skipping automation payload');
        return null;
      }
    }

    return raw;
  }

  private static async runPostApprovalAutomations(report: any, reviewerId: string, mapping: any): Promise<void> {
    if (!mapping) {
      return;
    }

    const automations: Promise<any>[] = [];

    const valuationPayload = mapping.valuationAdjustment || mapping.valuation;
    if (valuationPayload) {
      const newAmount = this.ensureNumeric(
        valuationPayload.newAmount ?? valuationPayload.amount ?? valuationPayload.value,
        'Valuation automation requires a numeric newAmount'
      );
      const previousAmount = await this.resolvePreviousValuationAmount(
        report.portfolioCompanyId,
        valuationPayload.previousAmount
      );
      const valuationDate = valuationPayload.valuationDate || valuationPayload.date || report.periodEnd || new Date();
      const difference = Number((newAmount - previousAmount).toFixed(2));

      if (difference !== 0) {
        automations.push(
          PortfolioCompanyAccountingService.recordValuationAdjustment({
            portfolioCompanyId: report.portfolioCompanyId,
            previousAmount,
            newAmount,
            valuationDate,
            approvedById: reviewerId,
            notes: valuationPayload.notes || valuationPayload.comment || null
          })
        );
      }
    }

    const dividendPayloads = this.normalizeDividends(mapping);
    for (const dividend of dividendPayloads) {
      const amount = this.ensureNumeric(
        dividend.amount ?? dividend.value,
        'Dividend automation requires a numeric amount'
      );

      if (amount <= 0) {
        throw new Error('Dividend automation requires amount greater than zero');
      }

      const dividendDate = dividend.dividendDate || dividend.date || report.periodEnd || new Date();

      automations.push(
        PortfolioCompanyAccountingService.recordDividend({
          portfolioCompanyId: report.portfolioCompanyId,
          amount,
          dividendDate,
          approvedById: reviewerId,
          notes: dividend.notes || dividend.comment || null
        })
      );
    }

    await Promise.all(automations);
  }

  private static normalizeDividends(mapping: any): any[] {
    if (!mapping) {
      return [];
    }

    if (Array.isArray(mapping.dividends)) {
      return mapping.dividends;
    }

    if (mapping.dividend) {
      return [mapping.dividend];
    }

    return [];
  }

  private static ensureNumeric(value: any, errorMessage: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(errorMessage);
    }
    return Number(parsed.toFixed(2));
  }

  private static async resolvePreviousValuationAmount(portfolioCompanyId: string, provided?: any): Promise<number> {
    if (provided !== undefined && provided !== null && Number.isFinite(Number(provided))) {
      return Number(Number(provided).toFixed(2));
    }

    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { financialKpis: true }
    });

    const kpis = company?.financialKpis;
    const latest = kpis?.latestValuation?.amount ?? kpis?.latest?.PORTFOLIO_FAIR_VALUE;

    if (latest !== undefined && latest !== null && Number.isFinite(Number(latest))) {
      return Number(Number(latest).toFixed(2));
    }

    return 0;
  }
}
