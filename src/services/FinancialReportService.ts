// @ts-nocheck
import { randomUUID } from 'crypto';
import { prisma } from '../utils/database';
import { FirebaseStorageService } from './FirebaseStorageService';
import { EmailNotificationService } from './EmailNotificationService';

export type FinancialReportType = 'BALANCE_SHEET' | 'INCOME_STATEMENT' | 'CASHFLOW_STATEMENT';
export type FinancialReportPeriod = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
export type FinancialReportStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'NEEDS_REVISION';

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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
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

    await this.notifySubmission(params.portfolioCompanyId, params.reportType, params.title, params.periodStart, params.periodEnd);

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

  static async listReportsForCompany(portfolioCompanyId: string) {
    return prisma.$queryRawUnsafe(
      `SELECT fr.*, u.firstName as submittedByFirstName, u.lastName as submittedByLastName
       FROM financial_reports fr
       JOIN users u ON u.id = fr.submittedById
       WHERE fr.portfolioCompanyId = ?
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

    const status = params.action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';

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
      params.mappingSnapshot ? JSON.stringify(params.mappingSnapshot) : null,
      params.reportId
    );

    if (params.action === 'ACCEPT') {
      await this.enqueueProcessingJob(params.reportId);
      await this.notifyOutcome(report, 'ACCEPTED', params.comment);
    } else {
      await this.notifyOutcome(report, 'REJECTED', params.comment);
    }
  }

  static async enqueueProcessingJob(reportId: string) {
    console.log(`🧾 Queueing financial report processing for report ${reportId}`);
    // Placeholder for queue integration – hook into background worker
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
}
