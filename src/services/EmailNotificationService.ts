//@ts-nocheck
import { emailTransport, getFromAddress } from "../config/email.config";
import {
  formatDueDateForEmail,
  getInvesteeReportsPortalUrl,
  MANDATORY_REPORTING_ATTACHMENTS,
  mandatoryAttachmentsHtmlList,
  reportingPeriodQuarterLabel,
  type ReportingMandatoryAttachment,
} from "../utils/reportingEmail";
import { capitalCallNoticeEmailSubject } from "../utils/capitalCallNoticeSubject";
import {
  getEmailBrandingCached,
  loadEmailBrandingFromDb,
  renderEmailFooter,
  renderEmailHeader,
  renderEmailSignature,
  type EmailBranding,
} from "../utils/emailBranding";
import {
  coverImageInlineAttachment,
  fetchCoverInlineAttachment,
  fetchLogoInlineAttachment,
  inlineExternalImagesInNewsletterHtml,
  type NewsletterInlineAttachment,
} from "../utils/newsletterEmailImages";
import { CompanyProfileAddressService } from "./CompanyProfileAddressService";
import { CompanyProfileService } from "./CompanyProfileService";
import {
  escapeAttrForEmail,
  escapeHtmlForEmail,
  wrapTransactionalNewsletterEmailDocument,
  buildNewsletterEmailDocumentHtml,
  buildNewsletterTransactionalEmailRows,
  fetchNewsletterTransactionalLogoAttachment,
} from "../utils/newsletterEmailLayout";
import { buildVendorRfqResponsePageUrl } from "../utils/vendorRfqEmailLinks";
import { buildVendorPoInvoiceResponsePageUrl } from "../utils/vendorPoInvoiceEmailLinks";

export interface EmailNotificationData {
  applicantName: string;
  applicantEmail: string;
  businessName: string;
  applicationId: string;
  currentStage: string;
  additionalInfo?: any;
}

export class EmailNotificationService {
  /** Same outer shell, header, title band, body font, and footer as internal newsletter emails. */
  private static composeNewsletterTransactionalHtml(params: {
    branding: EmailBranding;
    pageTitle: string;
    preheader: string;
    emailHeading: string;
    headerTagline: string;
    bodyInnerHtml: string;
    teamLabel: string;
    extraHeadInner?: string;
  }): string {
    const headerAndTitleTrsHtml = renderEmailHeader(params.branding, {
      title: params.emailHeading,
      tagline: params.headerTagline,
    });
    const footerTrHtml = renderEmailFooter(params.branding);
    const signatureHtml = renderEmailSignature(params.teamLabel, params.branding);
    return wrapTransactionalNewsletterEmailDocument({
      pageTitle: params.pageTitle,
      preheader: params.preheader,
      headerAndTitleTrsHtml,
      bodyInnerHtml: params.bodyInnerHtml + signatureHtml,
      footerTrHtml,
      extraHeadInner: params.extraHeadInner,
    });
  }

  /**
   * Send application received confirmation email (newsletter letterhead + CID logo).
   */
  static async sendApplicationReceivedEmail(data: EmailNotificationData): Promise<void> {
    try {
      const { html, attachments, subject } =
        await EmailNotificationService.buildApplicationLifecycleEmailBrandedDocument({
          data,
          emailHeading: "Application received",
          headerTagline: "Investment applications",
          subjectPrefix: "Investment application received",
          preheader: `We received your application for ${data.businessName}.`,
          bodyInnerHtml: EmailNotificationService.buildApplicationReceivedBodyHtml(data),
          metaLine: `Investment applications · ${new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}`,
          footerAudienceNote:
            "You are receiving this because you submitted an investment application. This is an automated message — please do not reply.",
        });

      const from = getFromAddress("investment");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject,
        html,
        attachments: attachments.length ? attachments : undefined,
      });

      console.log(`Application received email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending application received email:", error);
      throw error;
    }
  }

  /**
   * Send due diligence started email
   */
  static async sendDueDiligenceStartedEmail(data: EmailNotificationData): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Active due diligence",
        subjectPrefix: "Application passed screening — Active Due Diligence",
        preheader: `Due diligence has started for ${data.businessName}.`,
        bodyInnerHtml: EmailNotificationService.buildDueDiligenceStartedBodyHtml(data),
      });
      console.log(`Due diligence started email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending due diligence started email:", error);
      throw error;
    }
  }

  /**
   * Send due diligence completed email
   */
  static async sendDueDiligenceCompletedEmail(data: EmailNotificationData): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Due diligence completed",
        subjectPrefix: "Due Diligence Process Completed",
        preheader: `Due diligence is complete for ${data.businessName}.`,
        bodyInnerHtml: EmailNotificationService.buildDueDiligenceCompletedBodyHtml(data),
      });
      console.log(`Due diligence completed email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending due diligence completed email:", error);
      throw error;
    }
  }

  /**
   * Notify DD reviewer / deal owner when due diligence is completed.
   */
  static async sendDueDiligenceCompletedReviewerEmail(data: {
    reviewerName: string;
    reviewerEmail: string;
    businessName: string;
    applicationId: string;
    recommendation: string;
    overallScore: string;
  }): Promise<void> {
    try {
      const esc = escapeHtmlForEmail;
      const bodyInnerHtml = `
        <p style="margin:0 0 16px 0;">Hello ${esc(data.reviewerName)},</p>
        <p style="margin:0 0 16px 0;">Due diligence has been completed for <strong>${esc(data.businessName)}</strong>. The deal is ready for term sheet preparation.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr><td style="padding:16px 18px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#334155;">
            <div><strong>Application:</strong> ${esc(data.applicationId)}</div>
            <div style="margin-top:8px;"><strong>Recommendation:</strong> ${esc(data.recommendation || '—')}</div>
            <div style="margin-top:8px;"><strong>Overall score:</strong> ${esc(data.overallScore || '—')}</div>
          </td></tr>
        </table>
        ${EmailNotificationService.brandedSignoffHtml()}`;
      await EmailNotificationService.sendBrandedInvestmentMail({
        toName: data.reviewerName,
        toEmail: data.reviewerEmail,
        emailHeading: "Due diligence completed",
        headerTagline: "Deal workflow",
        subjectPrefix: "Due Diligence Completed",
        preheader: `DD complete · ${data.businessName}`,
        bodyInnerHtml,
        footerAudienceNote:
          "You are receiving this because you are the assigned due diligence reviewer for this deal.",
      });
      console.log(`Due diligence completed reviewer email sent to ${data.reviewerEmail}`);
    } catch (error) {
      console.error("Error sending due diligence completed reviewer email:", error);
      throw error;
    }
  }

  /**
   * Send due diligence task assigned email
   */
  static async sendDueDiligenceTaskAssignedEmail(data: {
    assigneeName: string;
    assigneeEmail: string;
    taskTitle: string;
    businessName: string;
    applicationId: string;
    taskId: string;
  }): Promise<void> {
    try {
      const esc = escapeHtmlForEmail;
      const bodyInnerHtml = `
        <p style="margin:0 0 16px 0;">Dear ${esc(data.assigneeName)},</p>
        <p style="margin:0 0 16px 0;">You have been assigned a new due diligence task. Please open the performance module to view details and start work.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr><td style="padding:16px 18px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#334155;">
            <div><strong>Task:</strong> ${esc(data.taskTitle)}</div>
            <div style="margin-top:8px;"><strong>Business:</strong> ${esc(data.businessName)}</div>
            <div style="margin-top:8px;"><strong>Application ID:</strong> ${esc(data.applicationId)}</div>
          </td></tr>
        </table>
        ${EmailNotificationService.brandedSignoffHtml()}`;
      await EmailNotificationService.sendBrandedInvestmentMail({
        toName: data.assigneeName,
        toEmail: data.assigneeEmail,
        emailHeading: "New due diligence task",
        headerTagline: "Deal workflow",
        subjectPrefix: "New Due Diligence Task Assigned",
        preheader: `Task assigned: ${data.taskTitle}`,
        bodyInnerHtml,
        footerAudienceNote:
          "You are receiving this because you were assigned a due diligence task. This is an automated message — please do not reply.",
      });
      console.log(`Due diligence task assigned email sent to ${data.assigneeEmail}`);
    } catch (error) {
      console.error("Error sending due diligence task assigned email:", error);
      throw error;
    }
  }

  /**
   * Notify assignee when an individual performance goal is converted to a task (goal breakdown).
   */
  static async sendPerformanceGoalTaskAssignedEmail(data: {
    assigneeName: string;
    assigneeEmail: string;
    taskTitle: string;
    taskId: string;
    targetValueDisplay: string;
    targetUnit: string;
    priority: string;
    startDateDisplay: string;
    endDateDisplay: string;
    departmentName?: string | null;
    description?: string | null;
  }): Promise<void> {
    try {
      const subject = `New performance task — ${data.taskTitle} — ${process.env.COMPANY_NAME_SHORT || "NVCCZ"}`;
      const htmlContent = this.getPerformanceGoalTaskAssignedTemplate(data);

      const from = getFromAddress("platform");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.assigneeName}" <${data.assigneeEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Performance goal task email sent to ${data.assigneeEmail}`);
    } catch (error) {
      console.error("Error sending performance goal task email:", error);
      throw error;
    }
  }

  /**
   * Notify a user they were assigned as a budget owner on an FP&A annual budget cycle.
   */
  static async sendBudgetOwnerAssignedEmail(data: {
    assigneeName: string;
    assigneeEmail: string;
    cycleName: string;
    fiscalYear: number;
    departmentName?: string | null;
    taskTitle?: string | null;
    cycleId: string;
    taskId?: string | null;
    dueDateDisplay?: string | null;
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const base = String(process.env.FRONTEND_URL || "http://app.kyntaro.com").replace(/\/+$/, "");
      const budgetPath = `/forecasting/budget?cycleId=${encodeURIComponent(data.cycleId)}`;
      const link = `${base}${budgetPath}`;
      const subject = `Budget owner assignment — ${data.cycleName} — ${process.env.COMPANY_NAME_SHORT || "NVCCZ"}`;
      const deptLine = data.departmentName
        ? `<p><strong>Department:</strong> ${escapeHtmlForEmail(data.departmentName)}</p>`
        : "";
      const dueLine = data.dueDateDisplay
        ? `<p><strong>Due:</strong> ${escapeHtmlForEmail(data.dueDateDisplay)}</p>`
        : "";
      const bodyInnerHtml = `
            <p>Dear ${escapeHtmlForEmail(data.assigneeName)},</p>
            <p>You have been assigned as a <strong>budget owner</strong> for the following annual budget cycle.</p>
            <p><strong>Cycle:</strong> ${escapeHtmlForEmail(data.cycleName)} (FY${data.fiscalYear})</p>
            ${deptLine}
            ${data.taskTitle ? `<p><strong>Task:</strong> ${escapeHtmlForEmail(data.taskTitle)}</p>` : ""}
            ${dueLine}
            <p>Please open the Budgeting workspace to enter your budget lines and submit when ready.</p>
            <p><a href="${escapeAttrForEmail(link)}" target="_blank" style="display:inline-block;padding:10px 16px;background:#1e40af;color:#fff;text-decoration:none;border-radius:4px;">Open budget cycle</a></p>
            <p style="font-size:12px;color:#64748b;">Or go to: ${escapeHtmlForEmail(link)}</p>`;

      const htmlContent = EmailNotificationService.composeNewsletterTransactionalHtml({
        branding,
        pageTitle: subject,
        preheader: `You are a budget owner for ${data.cycleName}`,
        emailHeading: "Budget owner assignment",
        headerTagline: "FP&A Budgeting",
        bodyInnerHtml,
        teamLabel: "FP&A Team",
      });

      const from = getFromAddress("platform");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.assigneeName}" <${data.assigneeEmail}>`,
        subject,
        html: htmlContent,
      });
      console.log(`Budget owner assignment email sent to ${data.assigneeEmail} (cycle ${data.cycleId})`);
    } catch (error) {
      console.error("Error sending budget owner assignment email:", error);
      throw error;
    }
  }

  /**
   * Generic FP&A budget-cycle lifecycle email (submit / review / return / approve / lock).
   */
  static async sendFpaBudgetLifecycleEmail(data: {
    recipientName: string;
    recipientEmail: string;
    subject: string;
    heading: string;
    preheader: string;
    bodyInnerHtml: string;
    cycleId: string;
    ctaLabel?: string;
    path?: string | null;
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const base = String(process.env.FRONTEND_URL || "http://app.kyntaro.com").replace(/\/+$/, "");
      const budgetPath =
        data.path || `/forecasting/budget?cycleId=${encodeURIComponent(data.cycleId)}`;
      const link = budgetPath.startsWith("http") ? budgetPath : `${base}${budgetPath}`;
      const cta = data.ctaLabel || "Open budget cycle";
      const bodyInnerHtml = `
            ${data.bodyInnerHtml}
            <p><a href="${escapeAttrForEmail(link)}" target="_blank" style="display:inline-block;padding:10px 16px;background:#1e40af;color:#fff;text-decoration:none;border-radius:4px;">${escapeHtmlForEmail(cta)}</a></p>
            <p style="font-size:12px;color:#64748b;">Or go to: ${escapeHtmlForEmail(link)}</p>`;

      const htmlContent = EmailNotificationService.composeNewsletterTransactionalHtml({
        branding,
        pageTitle: data.subject,
        preheader: data.preheader,
        emailHeading: data.heading,
        headerTagline: "FP&A Budgeting",
        bodyInnerHtml,
        teamLabel: "FP&A Team",
      });

      const from = getFromAddress("platform");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.recipientName}" <${data.recipientEmail}>`,
        subject: data.subject,
        html: htmlContent,
      });
      console.log(`FP&A budget email sent to ${data.recipientEmail}: ${data.subject}`);
    } catch (error) {
      console.error("Error sending FP&A budget lifecycle email:", error);
      throw error;
    }
  }

  /**
   * HR / cycle trigger: remind reviewees that a manager-created review exists
   * and they have not yet completed the self-assessment portion.
   */
  static async sendPerformanceReviewSelfAssessmentReminderEmail(data: {
    revieweeName: string;
    revieweeEmail: string;
    reviewTitle: string;
    reviewPeriod: string;
    cycleTitle: string;
    selfAssessmentDeadlineDisplay: string;
    reviewId: string;
  }): Promise<void> {
    try {
      const subject = `Action required: complete your self-assessment — ${data.cycleTitle} — ${process.env.COMPANY_NAME_SHORT || "NVCCZ"}`;
      const htmlContent = this.getPerformanceReviewSelfAssessmentReminderTemplate(data);

      const from = getFromAddress("platform");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.revieweeName}" <${data.revieweeEmail}>`,
        subject,
        html: htmlContent
      });

      console.log(`Performance review self-assessment reminder sent to ${data.revieweeEmail} (review ${data.reviewId})`);
    } catch (error) {
      console.error("Error sending performance review self-assessment reminder:", error);
      throw error;
    }
  }

  /** Optional cycle awareness for the assigned reviewer (manager). Returns false if skipped (no email). */
  static async sendPerformanceReviewCycleReviewerAwarenessEmail(data: {
    reviewerName: string;
    reviewerEmail: string;
    revieweeName: string;
    reviewTitle: string;
    reviewPeriod: string;
    cycleTitle: string;
    reviewId: string;
  }): Promise<boolean> {
    const to = String(data.reviewerEmail || "").trim();
    if (!to) {
      return false;
    }
    try {
      const esc = (s: string) =>
        String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      const subject = `Review cycle — ${esc(data.cycleTitle)} — ${process.env.COMPANY_NAME_SHORT || "NVCCZ"}`;
      const htmlContent = `<p>Hello ${esc(data.reviewerName)},</p>
<p>The performance review cycle <strong>${esc(data.cycleTitle)}</strong> is active.
<strong>${esc(data.revieweeName)}</strong> has been notified to complete their self-assessment for
<strong>${esc(data.reviewTitle)}</strong> (${esc(data.reviewPeriod)}).</p>
<p>Review reference: <code>${esc(data.reviewId)}</code></p>`;
      const from = getFromAddress("platform");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.reviewerName}" <${to}>`,
        subject,
        html: htmlContent
      });
      console.log(`Performance review cycle reviewer notice sent to ${to} (review ${data.reviewId})`);
      return true;
    } catch (error) {
      console.error("Error sending performance review cycle reviewer notice:", error);
      throw error;
    }
  }

  /** Optional cycle awareness for linked external stakeholder. Returns false if skipped (no email). */
  static async sendPerformanceReviewCycleStakeholderAwarenessEmail(data: {
    stakeholderName: string;
    stakeholderEmail: string;
    revieweeName: string;
    reviewTitle: string;
    reviewPeriod: string;
    cycleTitle: string;
    reviewId: string;
  }): Promise<boolean> {
    const to = String(data.stakeholderEmail || "").trim();
    if (!to) {
      return false;
    }
    try {
      const esc = (s: string) =>
        String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      const subject = `Performance review cycle — independent evaluation may be required — ${esc(
        data.cycleTitle
      )}`;
      const htmlContent = `<p>Hello ${esc(data.stakeholderName)},</p>
<p>A performance review cycle (<strong>${esc(data.cycleTitle)}</strong>) has started for
<strong>${esc(data.revieweeName)}</strong> — <strong>${esc(data.reviewTitle)}</strong> (${esc(
        data.reviewPeriod
      )}). You may be asked to provide independent evaluation in the system.</p>
<p>Review reference: <code>${esc(data.reviewId)}</code></p>`;
      const from = getFromAddress("platform");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.stakeholderName}" <${to}>`,
        subject,
        html: htmlContent
      });
      console.log(`Performance review cycle stakeholder notice sent to ${to} (review ${data.reviewId})`);
      return true;
    } catch (error) {
      console.error("Error sending performance review cycle stakeholder notice:", error);
      throw error;
    }
  }

  /**
   * Send due diligence activity update email (to CIO)
   */
  static async sendDueDiligenceActivityUpdateEmail(data: {
    cioName: string;
    cioEmail: string;
    assigneeName: string;
    taskTitle: string;
    activityTitle: string;
    activityId: string;
    taskId: string;
    hasDocuments: boolean;
  }): Promise<void> {
    try {
      const esc = escapeHtmlForEmail;
      const bodyInnerHtml = `
        <p style="margin:0 0 16px 0;">Dear ${esc(data.cioName)},</p>
        <p style="margin:0 0 16px 0;"><strong>${esc(data.assigneeName)}</strong> submitted a due diligence activity update that needs your review.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr><td style="padding:16px 18px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#334155;">
            <div><strong>Task:</strong> ${esc(data.taskTitle)}</div>
            <div style="margin-top:8px;"><strong>Activity:</strong> ${esc(data.activityTitle)}</div>
            <div style="margin-top:8px;"><strong>Documents attached:</strong> ${data.hasDocuments ? "Yes" : "No"}</div>
          </td></tr>
        </table>
        ${EmailNotificationService.brandedSignoffHtml()}`;
      await EmailNotificationService.sendBrandedInvestmentMail({
        toName: data.cioName,
        toEmail: data.cioEmail,
        emailHeading: "Due diligence activity update",
        headerTagline: "Deal workflow",
        subjectPrefix: "Due Diligence Activity Update",
        preheader: `Update on ${data.activityTitle}`,
        bodyInnerHtml,
        footerAudienceNote:
          "You are receiving this because you review due diligence activities. This is an automated message — please do not reply.",
      });
      console.log(`Due diligence activity update email sent to ${data.cioEmail}`);
    } catch (error) {
      console.error("Error sending due diligence activity update email:", error);
      throw error;
    }
  }

  /**
   * Lead investment analyst assigned to a deal (screening / DD owner). Fire-and-forget from API; failures are logged only.
   */
  static async sendLeadAnalystAssignedEmail(data: {
    analystName: string;
    analystEmail: string;
    businessName: string;
    dealReference: string | null;
  }): Promise<void> {
    try {
      const to = String(data.analystEmail || "").trim();
      if (!to) {
        return;
      }
      const esc = escapeHtmlForEmail;
      const base = String(process.env.FRONTEND_URL || "http://app.kyntaro.com").replace(/\/+$/, "");
      const applicationsPath = `${base}/portfolio-v11/deals`;
      const refSentence = data.dealReference
        ? ` Deal reference: <strong>${esc(data.dealReference)}</strong>.`
        : "";
      const bodyInnerHtml = `
        <p style="margin:0 0 16px 0;">Dear ${esc(data.analystName)},</p>
        <p style="margin:0 0 16px 0;">You have been assigned as the <strong>lead investment analyst</strong> for <strong>${esc(data.businessName)}</strong>.${refSentence}</p>
        ${EmailNotificationService.brandedCtaHtml(applicationsPath, "Open Deal Flow")}
        ${EmailNotificationService.brandedSignoffHtml()}`;
      const refSuffix = data.dealReference ? ` — ${data.dealReference}` : "";
      await EmailNotificationService.sendBrandedInvestmentMail({
        toName: data.analystName,
        toEmail: to,
        emailHeading: "Lead analyst assignment",
        headerTagline: "Deal workflow",
        subjectPrefix: `Lead analyst assignment — ${data.businessName}${refSuffix}`,
        preheader: `You are lead analyst for ${data.businessName}`,
        bodyInnerHtml,
        footerAudienceNote:
          "You are receiving this because you were assigned as lead analyst on a deal. This is an automated message — please do not reply.",
      });
      console.log(`Lead analyst assignment email sent to ${to}`);
    } catch (error) {
      console.error("Error sending lead analyst assignment email:", error);
    }
  }

  /** Portfolio deal collaboration feed @mention — deep link to deal card (`/deals/{applicationId}`). */
  static async sendPortfolioDealFeedMentionEmail(data: {
    recipientName: string;
    recipientEmail: string;
    authorName: string;
    businessName: string;
    applicationId: string;
    commentPreview: string;
  }): Promise<void> {
    try {
      const esc = escapeHtmlForEmail;
      const base = String(process.env.FRONTEND_URL || "http://app.kyntaro.com").replace(/\/+$/, "");
      const dealPath = `${base}/portfolio-v11/deals`;
      const safePreview = esc(String(data.commentPreview || ""));
      const bodyInnerHtml = `
        <p style="margin:0 0 16px 0;">Dear ${esc(data.recipientName)},</p>
        <p style="margin:0 0 16px 0;"><strong>${esc(data.authorName)}</strong> mentioned you in the portfolio deal collaboration thread for <strong>${esc(data.businessName)}</strong>.</p>
        <p style="margin:0 0 16px 0;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;white-space:pre-wrap;">${safePreview}</p>
        ${EmailNotificationService.brandedCtaHtml(dealPath, "Open Deal Flow")}
        ${EmailNotificationService.brandedSignoffHtml()}`;
      await EmailNotificationService.sendBrandedInvestmentMail({
        toName: data.recipientName,
        toEmail: data.recipientEmail,
        emailHeading: "Deal mention",
        headerTagline: "Deal collaboration",
        subjectPrefix: `Deal mention — ${data.businessName}`,
        preheader: `${data.authorName} mentioned you on ${data.businessName}`,
        bodyInnerHtml,
        footerAudienceNote:
          "You are receiving this because you were mentioned on a deal. This is an automated message — please do not reply.",
      });
      console.log(`Portfolio deal feed mention email sent to ${data.recipientEmail}`);
    } catch (error) {
      console.error("Error sending portfolio deal feed mention email:", error);
      throw error;
    }
  }

  /**
   * CF-3: CIO @mention on deal-linked task collaboration — email with deep link to deal card.
   */
  static async sendDealCollaborationMentionEmail(data: {
    recipientName: string;
    recipientEmail: string;
    authorName: string;
    taskTitle: string;
    dealId?: string;
    commentPreview: string;
  }): Promise<void> {
    try {
      const esc = escapeHtmlForEmail;
      const base = String(process.env.FRONTEND_URL || "http://app.kyntaro.com").replace(/\/+$/, "");
      const dealPath = data.dealId ? `${base}/portfolio-v11/deals` : `${base}/tasks`;
      const safePreview = esc(String(data.commentPreview || ""));
      const bodyInnerHtml = `
        <p style="margin:0 0 16px 0;">Dear ${esc(data.recipientName)},</p>
        <p style="margin:0 0 16px 0;"><strong>${esc(data.authorName)}</strong> mentioned you in the collaboration thread for task <strong>${esc(data.taskTitle)}</strong>.</p>
        <p style="margin:0 0 16px 0;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;white-space:pre-wrap;">${safePreview}</p>
        ${EmailNotificationService.brandedCtaHtml(dealPath, "Open in Arcus")}
        ${EmailNotificationService.brandedSignoffHtml()}`;
      await EmailNotificationService.sendBrandedInvestmentMail({
        toName: data.recipientName,
        toEmail: data.recipientEmail,
        emailHeading: "You were mentioned",
        headerTagline: "Deal collaboration",
        subjectPrefix: `You were mentioned — ${data.taskTitle}`,
        preheader: `${data.authorName} mentioned you on ${data.taskTitle}`,
        bodyInnerHtml,
        footerAudienceNote:
          "You are receiving this because you were mentioned on a deal task. This is an automated message — please do not reply.",
      });
      console.log(`Deal collaboration mention email sent to ${data.recipientEmail}`);
    } catch (error) {
      console.error("Error sending deal collaboration mention email:", error);
      throw error;
    }
  }

  /**
   * Send due diligence activity approved email (to assignee)
   */
  static async sendDueDiligenceActivityApprovedEmail(data: {
    assigneeName: string;
    assigneeEmail: string;
    taskTitle: string;
    activityTitle: string;
    activityId: string;
    approved: boolean;
    comments?: string;
  }): Promise<void> {
    try {
      const esc = escapeHtmlForEmail;
      const outcome = data.approved ? "approved" : "rejected";
      const commentsBlock = data.comments
        ? `<p style="margin:0 0 16px 0;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">${esc(data.comments)}</p>`
        : "";
      const bodyInnerHtml = `
        <p style="margin:0 0 16px 0;">Dear ${esc(data.assigneeName)},</p>
        <p style="margin:0 0 16px 0;">Your due diligence activity <strong>${esc(data.activityTitle)}</strong> on task <strong>${esc(data.taskTitle)}</strong> was <strong>${outcome}</strong>.</p>
        ${commentsBlock}
        ${EmailNotificationService.brandedSignoffHtml()}`;
      await EmailNotificationService.sendBrandedInvestmentMail({
        toName: data.assigneeName,
        toEmail: data.assigneeEmail,
        emailHeading: data.approved ? "Activity approved" : "Activity rejected",
        headerTagline: "Deal workflow",
        subjectPrefix: data.approved
          ? "Due Diligence Activity Approved"
          : "Due Diligence Activity Rejected",
        preheader: `${data.activityTitle} was ${outcome}`,
        bodyInnerHtml,
        footerAudienceNote:
          "You are receiving this because of a due diligence activity review. This is an automated message — please do not reply.",
      });
      console.log(`Due diligence activity ${outcome} email sent to ${data.assigneeEmail}`);
    } catch (error) {
      console.error("Error sending due diligence activity approval email:", error);
      throw error;
    }
  }

  /**
   * Send board review started email
   */
  static async sendBoardReviewStartedEmail(data: EmailNotificationData): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Board review started",
        subjectPrefix: "Board Review Process Started",
        preheader: `Board review has started for ${data.businessName}.`,
        bodyInnerHtml: EmailNotificationService.buildBoardReviewStartedBodyHtml(data),
      });
      console.log(`Board review started email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending board review started email:", error);
      throw error;
    }
  }

  static async sendBoardVoteRequestEmail(data: {
    recipientName: string;
    recipientEmail: string;
    businessName: string;
    /** Shown as “Deal reference” in the email when set; internal application id is not shown. */
    dealReference?: string | null;
    voteUrl: string;
  }): Promise<void> {
    try {
      const esc = escapeHtmlForEmail;
      const refPart =
        data.dealReference && String(data.dealReference).trim()
          ? ` (Deal reference: <strong>${esc(String(data.dealReference).trim())}</strong>)`
          : "";
      const bodyInnerHtml = `
        <p style="margin:0 0 16px 0;">Dear ${esc(data.recipientName)},</p>
        <p style="margin:0 0 16px 0;">A board review vote is required for <strong>${esc(data.businessName)}</strong>${refPart}.</p>
        <p style="margin:0 0 16px 0;">Please review the materials and cast your vote at your earliest convenience. Your voting power will be applied automatically.</p>
        ${EmailNotificationService.brandedCtaHtml(data.voteUrl, "Cast your vote")}
        ${EmailNotificationService.brandedSignoffHtml()}`;
      await EmailNotificationService.sendBrandedInvestmentMail({
        toName: data.recipientName,
        toEmail: data.recipientEmail,
        emailHeading: "Board vote required",
        headerTagline: "Board review",
        subjectPrefix: `Board Vote Requested - ${data.businessName}`,
        preheader: `Please vote on ${data.businessName}`,
        bodyInnerHtml,
        headers: { "X-Priority": "1", Importance: "high" },
        footerAudienceNote:
          "You are receiving this because you are a board voter on this deal. This is an automated message — please do not reply.",
      });
      console.log(`Board vote request email sent to ${data.recipientEmail}`);
    } catch (error) {
      console.error("Error sending board vote request email:", error);
      throw error;
    }
  }

  static async sendBoardVoteResultsEmail(data: {
    recipientName: string;
    recipientEmail: string;
    businessName: string;
    applicationId: string;
    approvePower: number;
    rejectPower: number;
    majorityDecision: string;
    votes: Array<{ voterName: string; vote: string; comment?: string | null; votingPower: number }>;
  }): Promise<void> {
    try {
      const esc = escapeHtmlForEmail;
      const votesRows = data.votes
        .map(
          (vote) => `
          <tr>
            <td style="padding:8px;border:1px solid #e2e8f0;">${esc(vote.voterName)}</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${vote.vote === "APPROVE" ? "Approve" : "Reject"}</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${vote.votingPower.toFixed(2)}%</td>
            <td style="padding:8px;border:1px solid #e2e8f0;">${vote.comment ? esc(vote.comment) : "—"}</td>
          </tr>`
        )
        .join("");
      const bodyInnerHtml = `
        <p style="margin:0 0 16px 0;">Dear ${esc(data.recipientName)},</p>
        <p style="margin:0 0 16px 0;">Voting for <strong>${esc(data.businessName)}</strong> has concluded.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr><td style="padding:16px 18px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#334155;">
            <div><strong>Majority decision:</strong> ${data.majorityDecision === "APPROVE" ? "Approved" : "Rejected"}</div>
            <div style="margin-top:8px;"><strong>Approve power:</strong> ${data.approvePower.toFixed(2)}%</div>
            <div style="margin-top:8px;"><strong>Reject power:</strong> ${data.rejectPower.toFixed(2)}%</div>
          </td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Board member</th>
              <th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Vote</th>
              <th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Power</th>
              <th style="padding:8px;border:1px solid #e2e8f0;text-align:left;">Comment</th>
            </tr>
          </thead>
          <tbody>${votesRows}</tbody>
        </table>
        ${EmailNotificationService.brandedSignoffHtml()}`;
      await EmailNotificationService.sendBrandedInvestmentMail({
        toName: data.recipientName,
        toEmail: data.recipientEmail,
        emailHeading: "Board vote results",
        headerTagline: "Board review",
        subjectPrefix: `Board Vote Results - ${data.businessName}`,
        preheader: `Vote results for ${data.businessName}`,
        bodyInnerHtml,
        footerAudienceNote:
          "You are receiving this because you participated in a board vote. This is an automated message — please do not reply.",
      });
      console.log(`Board vote results email sent to ${data.recipientEmail}`);
    } catch (error) {
      console.error("Error sending board vote results email:", error);
      throw error;
    }
  }

  static async sendFinancialReportSubmittedEmail(data: {
    recipients: Array<{ email: string; firstName: string; lastName: string }>;
    companyName: string;
    reportType: string;
    title: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<void> {
    if (!data.recipients || data.recipients.length === 0) {
      return;
    }

    const subject = `New Financial Report Submitted - ${data.companyName}`;
    const period = `${data.periodStart.toISOString().split('T')[0]} to ${data.periodEnd.toISOString().split('T')[0]}`;
    const html = `
      <p>Hello Team,</p>
      <p><strong>${data.companyName}</strong> submitted a <strong>${data.reportType.replace('_', ' ')}</strong> titled <strong>${data.title}</strong>.</p>
      <p>Reporting period: ${period}</p>
      <p>Please review the report in the portfolio dashboard.</p>
    `;

    const from = getFromAddress('investment');
    const recipients = data.recipients.map(recipient => 
      `"${`${recipient.firstName} ${recipient.lastName}`.trim()}" <${recipient.email}>`
    ).join(', ');
    await emailTransport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: recipients,
      subject,
      html: html
    });
  }

  /**
   * Automated reporting emails (open period, T−3, overdue). Snapshot returned for DB audit (`reporting_notification_logs.meta`).
   */
  static async sendReportingPeriodReminderEmail(data: {
    recipientEmail: string;
    companyName: string;
    reportingPeriod: string; // YYYY-MM-DD
    dueDate: string; // YYYY-MM-DD
    isOverdue: boolean;
    /** REQUEST = first “Request for data”; REMINDER = T−3; OVERDUE = past due. */
    kind: "REQUEST" | "REMINDER" | "OVERDUE";
    /** Mandatory Excel/PDF list (from open-calendar API or defaults). */
    mandatoryAttachments?: ReadonlyArray<ReportingMandatoryAttachment>;
    /** Primary financial contact name vs company (default companyName). */
    recipientMailboxName?: string;
    recipientGreetingName?: string;
  }): Promise<{ subject: string; html: string }> {
    const periodLabel = reportingPeriodQuarterLabel(data.reportingPeriod);
    const dueDisplay = formatDueDateForEmail(data.dueDate);
    const portalUrl = getInvesteeReportsPortalUrl();
    const attachList =
      data.mandatoryAttachments?.length > 0 ? data.mandatoryAttachments : MANDATORY_REPORTING_ATTACHMENTS;
    const greet = (data.recipientGreetingName || data.companyName).replace(/"/g, "");
    const toName = (data.recipientMailboxName || data.companyName).replace(/"/g, "");

    let subject: string;
    let leadParagraph: string;
    if (data.kind === "REQUEST") {
      subject = `Request for data — ${periodLabel} — ${data.companyName}`;
      leadParagraph = `<p>You have a new <strong>reporting period</strong> open: <strong>${periodLabel}</strong> (period end <strong>${data.reportingPeriod}</strong>). Please submit the required package by the due date below.</p>`;
    } else if (data.kind === "OVERDUE" || data.isOverdue) {
      subject = `Urgent: overdue reporting — ${periodLabel} — ${data.companyName}`;
      leadParagraph = `<p>This is a <strong>past-due</strong> reminder for your reporting package for <strong>${periodLabel}</strong> (period end <strong>${data.reportingPeriod}</strong>).</p>`;
    } else {
      subject = `Reminder: reporting due soon — ${periodLabel} — ${data.companyName}`;
      leadParagraph = `<p>This is a friendly reminder to complete your reporting package for <strong>${periodLabel}</strong> (period end <strong>${data.reportingPeriod}</strong>).</p>`;
    }

    const html = `
      <p>Hello ${greet},</p>
      ${leadParagraph}
      <p><strong>Reporting period:</strong> ${periodLabel} <span style="color:#64748b">(${data.reportingPeriod})</span></p>
      <p><strong>Due date:</strong> ${dueDisplay}</p>
      <p><strong>Submit here:</strong> <a href="${portalUrl}" target="_blank" rel="noopener noreferrer">${portalUrl}</a></p>
      <p><strong>Mandatory attachments:</strong></p>
      ${mandatoryAttachmentsHtmlList(attachList)}
      <p>Thank you.</p>
    `;

    const from = getFromAddress("investment");
    await emailTransport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: `"${toName}" <${data.recipientEmail}>`,
      subject,
      html,
    });
    return { subject, html };
  }

  /** Analyst-initiated nudge: same reporting context as automated mail, with custom body text. */
  static async sendReportingManualNudgeEmail(data: {
    recipientEmail: string;
    companyName: string;
    reportingPeriod: string;
    dueDate: string;
    analystMessage: string;
    isOverdue: boolean;
    mandatoryAttachments?: ReadonlyArray<ReportingMandatoryAttachment>;
    recipientMailboxName?: string;
    recipientGreetingName?: string;
  }): Promise<{ subject: string; html: string }> {
    const escape = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>");

    const periodLabel = reportingPeriodQuarterLabel(data.reportingPeriod);
    const dueDisplay = formatDueDateForEmail(data.dueDate);
    const portalUrl = getInvesteeReportsPortalUrl();
    const attachList =
      data.mandatoryAttachments?.length > 0 ? data.mandatoryAttachments : MANDATORY_REPORTING_ATTACHMENTS;
    const greet = (data.recipientGreetingName || data.companyName).replace(/"/g, "");
    const toName = (data.recipientMailboxName || data.companyName).replace(/"/g, "");

    const subject = data.isOverdue
      ? `Important: reporting follow-up (overdue) — ${periodLabel} — ${data.companyName}`
      : `Reporting follow-up — ${periodLabel} — ${data.companyName}`;

    const html = `
      <p>Hello ${greet},</p>
      <p>Our team asked us to follow up on your reporting package for <strong>${periodLabel}</strong> <span style="color:#64748b">(${data.reportingPeriod})</span>.</p>
      <p><strong>Due date:</strong> ${dueDisplay}</p>
      ${data.isOverdue ? "<p><strong>This period is now past due.</strong></p>" : ""}
      <p><strong>Message from the team:</strong></p>
      <blockquote style="margin:12px 0;padding:12px 16px;border-left:4px solid #2563eb;background:#f8fafc;">
        ${escape(data.analystMessage)}
      </blockquote>
      <p><strong>Submit here:</strong> <a href="${portalUrl}" target="_blank" rel="noopener noreferrer">${portalUrl}</a></p>
      <p><strong>Mandatory attachments:</strong></p>
      ${mandatoryAttachmentsHtmlList(attachList)}
      <p>Thank you.</p>
    `;

    const from = getFromAddress("investment");
    await emailTransport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: `"${toName}" <${data.recipientEmail}>`,
      subject,
      html,
    });
    return { subject, html };
  }

  /**
   * Notify procurement requester when a vendor submits a quotation
   */
  static async sendQuotationSubmittedNotification(data: {
    requesterName: string;
    requesterEmail: string;
    rfqNumber: string;
    requisitionNumber?: string;
    requisitionTitle?: string;
    quotationNumber: string;
    vendorName: string;
    vendorEmail: string;
    companyName?: string | null;
    contactPerson?: string | null;
    taxEIN?: string | null;
    phoneNumber?: string | null;
    address?: string | null;
    paymentTerms?: string | null;
    deliveryTerms?: string | null;
    deliveryTime?: string | null;
    totalAmount: number;
    currencyCode: string;
    items: Array<{
      itemName: string;
      description?: string;
      quantity: number;
      unit?: string;
      unitPrice: number;
      totalPrice: number;
    }>;
    notes?: string;
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `Quotation submitted for ${data.rfqNumber}`;
      const htmlContent = this.getQuotationSubmittedNotificationTemplate(data, branding);

      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.requesterName}" <${data.requesterEmail}>`,
        subject,
        html: htmlContent
      });

      console.log(`✅ Quotation submission notification sent to ${data.requesterEmail}`);
    } catch (error) {
      console.error("❌ Error sending quotation submission notification:", error);
      throw error;
    }
  }

  /**
   * Procurement desk copy when a vendor submits a quotation (no portal links).
   */
  static async sendQuotationSubmittedDeskCopy(data: {
    recipientName: string;
    recipientEmail: string;
    vendorName: string;
    vendorEmail: string;
    companyName?: string | null;
    contactPerson?: string | null;
    taxEIN?: string | null;
    phoneNumber?: string | null;
    address?: string | null;
    paymentTerms?: string | null;
    deliveryTerms?: string | null;
    deliveryTime?: string | null;
    rfqNumber: string;
    quotationNumber: string;
    totalAmount: number;
    currencyCode: string;
    items: Array<{
      itemName: string;
      description?: string;
      quantity: number;
      unit?: string;
      unitPrice: number;
      totalPrice: number;
    }>;
    requisitionNumber?: string;
    requisitionTitle?: string;
    notes?: string;
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `[Desk] Quotation submitted — ${data.rfqNumber} — ${data.quotationNumber}`;
      const htmlContent = this.getQuotationSubmittedDeskCopyTemplate(data, branding);
      const from = getFromAddress("procurement");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.recipientName}" <${data.recipientEmail}>`,
        subject,
        html: htmlContent,
      });
      console.log(`✅ Quotation desk copy sent to ${data.recipientEmail}`);
    } catch (error) {
      console.error("❌ Error sending quotation desk copy:", error);
      throw error;
    }
  }

  /**
   * Notify procurement desk when a vendor submits a procurement invoice via the public flow (no links).
   */
  static async sendProcurementInvoiceCreatedForReview(data: {
    recipients: { email: string; name: string }[];
    vendorName: string;
    invoiceNumber: string;
    poNumber?: string | null;
    totalAmount: number;
    currencyCode: string;
  }): Promise<void> {
    if (!data.recipients.length) {
      console.warn("sendProcurementInvoiceCreatedForReview: no recipients");
      return;
    }
    try {
      const branding = await getEmailBrandingCached();
      const totalLabel = `${data.currencyCode} ${Number(data.totalAmount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
      const he = (s: string) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const invNo = he(data.invoiceNumber);
      const vend = he(data.vendorName);
      const po = data.poNumber ? he(String(data.poNumber)) : "";
      const subject = `Vendor procurement invoice ${data.invoiceNumber} — review`;
      const from = getFromAddress("procurement");
      for (const r of data.recipients) {
        try {
          const rn = he(r.name || "Colleague");
          const bodyInner = `
        <p>Dear ${rn},</p>
        <p>A vendor has submitted a procurement invoice for review.</p>
        <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:14px 18px;margin:18px 0;border-radius:4px;">
          <div><strong>Invoice number:</strong> ${invNo}</div>
          <div><strong>Vendor:</strong> ${vend}</div>
          ${data.poNumber ? `<div><strong>Purchase order:</strong> ${po}</div>` : ""}
          <div><strong>Total:</strong> ${totalLabel}</div>
        </div>
        <p>Please route this document through your usual procurement and finance review process.</p>`;
          const htmlContent = EmailNotificationService.composeNewsletterTransactionalHtml({
            branding,
            pageTitle: `New vendor procurement invoice — ${branding.companyName}`,
            preheader: `${subject} — ${branding.companyName}`,
            emailHeading: "New vendor procurement invoice",
            headerTagline: "Procurement",
            bodyInnerHtml: bodyInner,
            teamLabel: "Procurement Team",
          });
          await emailTransport.sendMail({
            from: `"${from.name}" <${from.address}>`,
            to: `"${r.name}" <${r.email}>`,
            subject,
            html: htmlContent,
          });
          console.log(`✅ Vendor procurement invoice notification sent to ${r.email}`);
        } catch (oneErr) {
          console.error(`❌ Desk invoice notify failed for ${r.email}:`, (oneErr as Error)?.message || oneErr);
        }
      }
    } catch (error) {
      console.error("❌ Error sending procurement invoice desk notification:", error);
      throw error;
    }
  }

  /**
   * A procurement invoice was flagged (three-way match, possible duplicate, or the supplier's document disagreeing with
   * the capture): tell its reviewers why (SRD §3, §6.6).
   */
  static async sendProcurementInvoiceFlagged(data: {
    recipients: { email: string; name: string }[];
    vendorName: string;
    invoiceNumber: string;
    poNumber?: string | null;
    totalAmount: number;
    currencyCode: string;
    reasons: string[];
  }): Promise<void> {
    if (!data.recipients.length) return;
    const branding = await getEmailBrandingCached();
    const he = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const totalLabel = `${data.currencyCode} ${Number(data.totalAmount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    const subject = `Invoice ${data.invoiceNumber} flagged for review`;
    const from = getFromAddress("procurement");
    const reasons = data.reasons.map((r) => `<li style="margin:4px 0">${he(r)}</li>`).join("");
    for (const r of data.recipients) {
      try {
        const bodyInner = `
        <p>Dear ${he(r.name || "Colleague")},</p>
        <p>A supplier invoice needs review before it is approved for payment.</p>
        <div style="background:#fff7ed;border-left:4px solid #ea580c;padding:14px 18px;margin:18px 0;border-radius:4px;">
          <div><strong>Invoice:</strong> ${he(data.invoiceNumber)}</div>
          <div><strong>Vendor:</strong> ${he(data.vendorName)}</div>
          ${data.poNumber ? `<div><strong>Purchase order:</strong> ${he(String(data.poNumber))}</div>` : ""}
          <div><strong>Total:</strong> ${totalLabel}</div>
        </div>
        <p><strong>Why it was flagged</strong></p>
        <ul style="padding-left:18px">${reasons}</ul>
        <p>Open Procurement → Invoices &amp; 3-Way Match to review it.</p>`;
        const htmlContent = EmailNotificationService.composeNewsletterTransactionalHtml({
          branding,
          pageTitle: `Invoice flagged — ${branding.companyName}`,
          preheader: `${subject} — ${branding.companyName}`,
          emailHeading: "Invoice flagged for review",
          headerTagline: "Procurement",
          bodyInnerHtml: bodyInner,
          teamLabel: "Procurement Team",
        });
        await emailTransport.sendMail({
          from: `"${from.name}" <${from.address}>`,
          to: `"${r.name}" <${r.email}>`,
          subject,
          html: htmlContent,
        });
      } catch (oneErr) {
        console.error(`❌ Flagged invoice email failed for ${r.email}:`, (oneErr as Error)?.message || oneErr);
      }
    }
  }

  /**
   * Notify PR owner when their linked RFQ is awarded (no portal links).
   */
  static async sendRfqAwardedToSubmitter(data: {
    submitterName: string;
    submitterEmail: string;
    requisitionNumber: string;
    requisitionTitle: string;
    rfqNumber: string;
    winningQuotationNumber: string;
    awardedVendorName: string;
    awardRationale: string;
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const he = (s: string) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const subject = `RFQ ${data.rfqNumber} awarded — ${data.requisitionNumber}`;
      const bodyInner = `
        <p>Dear ${he(data.submitterName)},</p>
        <p>The RFQ linked to your purchase requisition has been <strong>awarded</strong>.</p>
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:14px 18px;margin:18px 0;border-radius:4px;">
          <div><strong>Requisition:</strong> ${he(data.requisitionNumber)} — ${he(data.requisitionTitle)}</div>
          <div><strong>RFQ:</strong> ${he(data.rfqNumber)}</div>
          <div><strong>Winning quotation:</strong> ${he(data.winningQuotationNumber)}</div>
          <div><strong>Awarded vendor:</strong> ${he(data.awardedVendorName)}</div>
        </div>
        <div style="background:#f9fafb;padding:14px 18px;border-radius:4px;margin:18px 0;">
          <p style="margin:0;"><strong>Rationale</strong></p>
          <p style="margin:8px 0 0 0;">${he(data.awardRationale)}</p>
        </div>
        <p>Your procurement contact will advise on next steps.</p>`;
      const htmlContent = EmailNotificationService.composeNewsletterTransactionalHtml({
        branding,
        pageTitle: `RFQ awarded — ${branding.companyName}`,
        preheader: `${subject} — ${branding.companyName}`,
        emailHeading: "RFQ awarded",
        headerTagline: "Procurement",
        bodyInnerHtml: bodyInner,
        teamLabel: "Procurement Team",
      });
      const from = getFromAddress("procurement");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.submitterName}" <${data.submitterEmail}>`,
        subject,
        html: htmlContent,
      });
      console.log(`✅ RFQ awarded notification sent to ${data.submitterEmail}`);
    } catch (error) {
      console.error("❌ Error sending RFQ awarded notification:", error);
      throw error;
    }
  }

  static async sendFinancialReportAcceptedEmail(data: {
    recipientEmail: string;
    companyName: string;
    reportType: string;
    title: string;
    periodStart: Date;
    periodEnd: Date;
    status: string;
    comment?: string;
  }): Promise<void> {
    const subject = `Financial Report Accepted - ${data.companyName}`;
    const period = `${data.periodStart.toISOString().split('T')[0]} to ${data.periodEnd.toISOString().split('T')[0]}`;
    const html = `
      <p>Hello,</p>
      <p>Your <strong>${data.reportType.replace('_', ' ')}</strong> titled <strong>${data.title}</strong> has been <strong>accepted</strong>.</p>
      <p>Reporting period: ${period}</p>
      ${data.comment ? `<p><strong>Reviewer Comment:</strong> ${data.comment}</p>` : ''}
      <p>Thank you for keeping your financials up to date.</p>
    `;

    const from = getFromAddress('investment');
    await emailTransport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: `"${data.companyName}" <${data.recipientEmail}>`,
      subject,
      html: html
    });
  }

  /** Investee: staff asked for corrections (resubmit / re-upload allowed). */
  static async sendFinancialReportNeedsRevisionEmail(data: {
    recipientEmail: string;
    companyName: string;
    reportType: string;
    title: string;
    periodStart: Date;
    periodEnd: Date;
    comment?: string;
  }): Promise<void> {
    const subject = `Action required: revise your financial report — ${data.companyName}`;
    const period = `${data.periodStart.toISOString().split('T')[0]} to ${data.periodEnd.toISOString().split('T')[0]}`;
    const html = `
      <p>Hello,</p>
      <p>Your <strong>${String(data.reportType).replace(/_/g, " ")}</strong> titled <strong>${data.title}</strong> needs <strong>revisions</strong> before it can be approved.</p>
      <p>Reporting period: ${period}</p>
      ${data.comment ? `<p><strong>Reviewer feedback:</strong> ${data.comment}</p>` : "<p>Please correct your entries or re-upload the required documents, then submit again from the portal.</p>"}
    `;

    const from = getFromAddress("investment");
    await emailTransport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: `"${data.companyName}" <${data.recipientEmail}>`,
      subject,
      html,
    });
  }

  /** Investee: submission was rejected (resubmit / fix data as directed). */
  static async sendFinancialReportRejectedEmail(data: {
    recipientEmail: string;
    companyName: string;
    reportType: string;
    title: string;
    periodStart: Date;
    periodEnd: Date;
    status: string;
    comment?: string;
  }): Promise<void> {
    const subject = `Financial report rejected — ${data.companyName}`;
    const period = `${data.periodStart.toISOString().split('T')[0]} to ${data.periodEnd.toISOString().split('T')[0]}`;
    const html = `
      <p>Hello,</p>
      <p>Your <strong>${String(data.reportType).replace(/_/g, " ")}</strong> titled <strong>${data.title}</strong> has been <strong>rejected</strong>.</p>
      <p>Reporting period: ${period}</p>
      ${data.comment ? `<p><strong>Reviewer feedback:</strong> ${data.comment}</p>` : "<p>Please review the feedback, correct your submission or attach a new document, and resubmit from the investee portal.</p>"}
    `;

    const from = getFromAddress("investment");
    await emailTransport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: `"${data.companyName}" <${data.recipientEmail}>`,
      subject,
      html,
    });
  }

  /**
   * Send investment decision email
   */
  static async sendInvestmentDecisionEmail(data: EmailNotificationData): Promise<void> {
    try {
      const isApproved = data.currentStage === "BOARD_APPROVED";
      const isRejected = data.currentStage === "BOARD_REJECTED";
      const heading = isApproved
        ? "Investment approved"
        : isRejected
          ? "Investment not approved"
          : "Conditional approval";
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: heading,
        subjectPrefix: "Investment Decision Update",
        preheader: `Board decision for ${data.businessName}`,
        bodyInnerHtml: EmailNotificationService.buildInvestmentDecisionBodyHtml(data),
      });
      console.log(`Investment decision email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending investment decision email:", error);
      throw error;
    }
  }

  /**
   * Send investment implementation started email
   */
  static async sendInvestmentImplementationStartedEmail(data: EmailNotificationData): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Investment implementation started",
        subjectPrefix: "Investment Implementation Started",
        preheader: `Implementation has started for ${data.businessName}.`,
        bodyInnerHtml: EmailNotificationService.buildInvestmentImplementationStartedBodyHtml(data),
      });
      console.log(`Investment implementation started email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending investment implementation started email:", error);
      throw error;
    }
  }

  /**
   * Analyst request for clarification on a submitted funding application.
   */
  static async sendClarificationRequest(params: {
    to: string;
    subject: string;
    message: string;
    businessName: string;
    dealReference?: string | null;
    applicantName?: string | null;
    requestedByName?: string | null;
  }): Promise<void> {
    const from = getFromAddress("investment");
    const applicant = params.applicantName || "Applicant";
    const ref = params.dealReference ? ` (${params.dealReference})` : "";
    const body = `
      <p>Dear ${escapeHtmlForEmail(applicant)},</p>
      <p>The investment team has requested clarification on your application for
      <strong>${escapeHtmlForEmail(params.businessName)}</strong>${escapeHtmlForEmail(ref)}.</p>
      <p><strong>Subject:</strong> ${escapeHtmlForEmail(params.subject)}</p>
      <div style="white-space:pre-wrap;border-left:3px solid #2563eb;padding-left:12px;margin:16px 0;">
        ${escapeHtmlForEmail(params.message)}
      </div>
      ${params.requestedByName ? `<p>Requested by: ${escapeHtmlForEmail(params.requestedByName)}</p>` : ""}
      <p>Please reply to this email with the requested information.</p>
    `;
    const mail = {
      from: `"${from.name}" <${from.address}>`,
      to: params.to,
      subject: params.subject.startsWith("[")
        ? params.subject
        : `[Clarification] ${params.subject}`,
      html: body,
      text: params.message,
    };
    let lastError: any;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await emailTransport.sendMail(mail);
        console.log(`Clarification request email sent to ${params.to} (attempt ${attempt})`);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        console.error(`Clarification email attempt ${attempt} failed:`, (err as any)?.message || err);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
      }
    }
    if (lastError) throw lastError;
  }

  /**
   * Send application shortlisted email (newsletter letterhead + CID logo).
   */
  static async sendApplicationShortlistedEmail(data: EmailNotificationData): Promise<void> {
    try {
      const { html, attachments, subject } =
        await EmailNotificationService.buildApplicationLifecycleEmailBrandedDocument({
          data,
          emailHeading: "Application shortlisted",
          headerTagline: "Investment applications",
          subjectPrefix: "Application shortlisted",
          preheader: `Your application for ${data.businessName} has been shortlisted.`,
          bodyInnerHtml: EmailNotificationService.buildApplicationShortlistedBodyHtml(data),
          metaLine: `Investment applications · ${new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}`,
          footerAudienceNote:
            "You are receiving this because you submitted an investment application. This is an automated message — please do not reply.",
        });

      const from = getFromAddress("investment");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject,
        html,
        attachments: attachments.length ? attachments : undefined,
      });

      console.log(`Application shortlisted email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending application shortlisted email:", error);
      throw error;
    }
  }

  /**
   * Send application below threshold email (softer than rejection)
   */
  static async sendApplicationBelowThresholdEmail(data: EmailNotificationData): Promise<void> {
    try {
      console.log(`📧 Attempting to send below threshold email to ${data.applicantEmail}`, {
        applicationId: data.applicationId,
        businessName: data.businessName
      });

      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Application update",
        subjectPrefix: "Application Update",
        preheader: `An update on your application for ${data.businessName}.`,
        bodyInnerHtml: EmailNotificationService.buildApplicationBelowThresholdBodyHtml(data),
      });

      console.log(`✅ Application below threshold email sent successfully to ${data.applicantEmail}`, {
        applicationId: data.applicationId
      });
    } catch (error: any) {
      console.error("❌ Error sending application below threshold email:", {
        applicantEmail: data.applicantEmail,
        applicationId: data.applicationId,
        error: error.message,
        stack: error.stack,
        errorDetails: error
      });
      throw error;
    }
  }

  /**
   * Application rejected — Nyasha-approved copy, newsletter-style letterhead.
   * Branding from `getEmailBrandingCached()` (active Company Profile address + profile — same data as GET /api/company-profile/addresses).
   */
  static async sendApplicationRejectedEmail(data: EmailNotificationData): Promise<void> {
    try {
      const { html, attachments, subject } = await EmailNotificationService.buildApplicationRejectionEmailBrandedDocument(
        data
      );
      const from = getFromAddress("investment");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject,
        html,
        attachments: attachments.length ? attachments : undefined,
      });
      console.log(`Application rejection email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending application rejected email:", error);
      throw error;
    }
  }

  /**
   * Newsletter-style HTML + CID logo (mirrors `broadcastInternalNewsletterEmails` letterhead/footer).
   */
  private static async buildApplicationRejectionEmailBrandedDocument(data: EmailNotificationData): Promise<{
    html: string;
    attachments: NewsletterInlineAttachment[];
    subject: string;
  }> {
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    let branding: EmailBranding;
    try {
      branding = await getEmailBrandingCached();
    } catch {
      branding = {
        companyName: process.env.COMPANY_NAME_SHORT || "NVCCZ",
        logoUrl: null,
        addressLines: [],
        contactEmail: null,
        contactPhone: null,
        website: null,
      };
    }

    const companyNameEsc = esc(branding.companyName);
    const founderEsc = esc(data.applicantName);

    let logoAttachment: NewsletterInlineAttachment | null = null;
    if (branding.logoUrl) {
      try {
        const fetched = await fetchLogoInlineAttachment(branding.logoUrl, {
          cid: "application-rejection-logo@nvccz",
        });
        if (fetched) {
          logoAttachment = fetched;
        }
      } catch {
        logoAttachment = null;
      }
    }

    const headerBlock = `
      <tr>
        <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:24px 28px;color:#ffffff;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:0.2px;line-height:1.2;">${companyNameEsc}</div>
                <div style="margin-top:4px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">Application update</div>
                ${
                  branding.addressLines.length
                    ? `<div style="margin-top:10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#cbd5f5;">${branding.addressLines
                        .map((l) => `<div>${esc(l)}</div>`)
                        .join("")}</div>`
                    : ""
                }
              </td>
              <td style="vertical-align:middle;text-align:right;width:84px;">
                ${
                  logoAttachment
                    ? `<img src="cid:${logoAttachment.cid}" alt="${companyNameEsc}" width="64" height="64" style="width:64px;height:64px;border-radius:999px;object-fit:cover;display:inline-block;border:2px solid rgba(255,255,255,0.6);" />`
                    : ""
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>`;

    const bodyBlock = `
      <tr>
        <td style="padding:24px 28px 8px 28px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#1f2937;">
            <p style="margin:0 0 16px 0;">Dear ${founderEsc},</p>
            <p style="margin:0 0 16px 0;">Thank you for submitting your application and for taking the time to share your company story with us.</p>
            <p style="margin:0 0 16px 0;">We have completed our review and, after careful consideration, we will not be moving forward with your application at this time. This decision was based on our current investment priorities, and not as a reflection of the strength of your team or the potential of your business.</p>
            <p style="margin:0 0 16px 0;">We appreciate your interest in ${companyNameEsc} and wish you every success as you continue to build.</p>
            <p style="margin:24px 0 0 0;">Kind regards,<br/><strong>${companyNameEsc}</strong></p>
            <p style="margin:20px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#64748b;">Please note: This inbox is not monitored for application responses. Please do not reply directly to this email.</p>
          </div>
        </td>
      </tr>`;

    const contactPieces: string[] = [];
    if (branding.contactEmail) contactPieces.push(esc(branding.contactEmail));
    if (branding.contactPhone) contactPieces.push(`Tel: ${esc(branding.contactPhone)}`);
    if (branding.website) contactPieces.push(esc(String(branding.website).replace(/^https?:\/\//, "")));
    const contactHtml = contactPieces.length
      ? `<div style="margin-top:6px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#cbd5f5;">${contactPieces.join(
          " &nbsp;·&nbsp; "
        )}</div>`
      : "";
    const addressFooterHtml = branding.addressLines.length
      ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#cbd5f5;">${branding.addressLines
          .map((l) => esc(l))
          .join(" &nbsp;·&nbsp; ")}</div>`
      : "";
    const year = new Date().getFullYear();
    const footerBlock = `
      <tr>
        <td style="background:#0f172a;padding:22px 28px;color:#e2e8f0;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#ffffff;">${companyNameEsc}</div>
          ${addressFooterHtml}
          ${contactHtml}
          <div style="margin-top:12px;border-top:1px solid #1e293b;padding-top:10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#94a3b8;">
            © ${year} ${companyNameEsc}. All rights reserved. &nbsp;·&nbsp; This is an automated message — please do not reply.
          </div>
        </td>
      </tr>`;

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Application update — ${companyNameEsc}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;color:transparent;">Application update — ${companyNameEsc}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eef2f7;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            ${headerBlock}
            ${bodyBlock}
            ${footerBlock}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const attachments: NewsletterInlineAttachment[] = logoAttachment ? [logoAttachment] : [];
    const subject = `Application update — ${branding.companyName}`;
    return { html, attachments, subject };
  }

  /**
   * Vendor self-registration approved by staff — same letterhead layout as portfolio screening rejection.
   */
  static async sendVendorRegistrationApprovedEmail(data: {
    vendorEmail: string;
    vendorName: string;
    contactPerson?: string | null;
  }): Promise<void> {
    try {
      const { html, attachments, subject } =
        await EmailNotificationService.buildVendorRegistrationApprovedBrandedDocument(data);
      const from = getFromAddress("procurement");
      const displayName = String(data.contactPerson || "").trim() || data.vendorName;
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${displayName}" <${data.vendorEmail}>`,
        subject,
        html,
        attachments: attachments.length ? attachments : undefined,
      });
      console.log(`Vendor registration approved email sent to ${data.vendorEmail}`);
    } catch (error) {
      console.error("Error sending vendor registration approved email:", error);
      throw error;
    }
  }

  /** Tells a vendor who registered on the vendor portal that the registration was declined, and why. */
  static async sendVendorRegistrationDeclinedEmail(data: {
    vendorEmail: string;
    vendorName: string;
    contactPerson?: string | null;
    reason: string;
  }): Promise<void> {
    const esc = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    let companyName = process.env.COMPANY_NAME_SHORT || "NVCCZ";
    let contactEmail: string | null = null;
    try {
      const branding = await getEmailBrandingCached();
      companyName = branding.companyName || companyName;
      contactEmail = branding.contactEmail || null;
    } catch {
      /* the company name from the environment is enough */
    }
    const addressee = String(data.contactPerson || "").trim() || data.vendorName;
    const subject = `${companyName}: vendor registration not approved`;
    const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;max-width:640px;margin:0 auto;font-family:Helvetica,Arial,sans-serif;">
      <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:24px 28px;color:#ffffff;">
        <div style="font-size:20px;font-weight:700;">${esc(companyName)}</div>
        <div style="margin-top:4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">Vendor registration not approved</div>
      </td></tr>
      <tr><td style="padding:24px 28px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#1f2937;">
        <p style="margin:0 0 16px 0;">Dear ${esc(addressee)},</p>
        <p style="margin:0 0 16px 0;">Thank you for registering <strong>${esc(data.vendorName)}</strong> on our vendor portal. After review, the registration has <strong>not been approved</strong>.</p>
        <p style="margin:0 0 8px 0;">The reason given:</p>
        <blockquote style="margin:0 0 16px 0;padding:12px 16px;border-left:4px solid #1e3a8a;background:#f1f5f9;">${esc(data.reason)}</blockquote>
        <p style="margin:0 0 16px 0;">You are welcome to register again on the vendor portal once this has been addressed${contactEmail ? `, or contact us at ${esc(contactEmail)}` : ""}.</p>
        <p style="margin:24px 0 0 0;">Kind regards,<br/><strong>${esc(companyName)}</strong></p>
      </td></tr>
    </table>`;
    const from = getFromAddress("procurement");
    await emailTransport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: `"${addressee}" <${data.vendorEmail}>`,
      subject,
      html,
    });
    console.log(`Vendor registration declined email sent to ${data.vendorEmail}`);
  }

  private static async buildVendorRegistrationApprovedBrandedDocument(data: {
    vendorEmail: string;
    vendorName: string;
    contactPerson?: string | null;
  }): Promise<{ html: string; attachments: NewsletterInlineAttachment[]; subject: string }> {
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    let branding: EmailBranding;
    try {
      branding = await getEmailBrandingCached();
    } catch {
      try {
        branding = await loadEmailBrandingFromDb();
      } catch {
        branding = {
          companyName: process.env.COMPANY_NAME_SHORT || "NVCCZ",
          logoUrl: null,
          addressLines: [],
          contactEmail: null,
          contactPhone: null,
          website: null,
        };
      }
    }

    const companyNameEsc = esc(branding.companyName);
    const vendorNameEsc = esc(data.vendorName);
    const addresseeEsc = esc(String(data.contactPerson || "").trim() || data.vendorName);

    let logoAttachment: NewsletterInlineAttachment | null = null;
    if (branding.logoUrl) {
      try {
        logoAttachment = await fetchLogoInlineAttachment(branding.logoUrl, {
          cid: "vendor-registration-approved-logo@nvccz",
        });
      } catch {
        logoAttachment = null;
      }
    }

    const headerBlock = `
      <tr>
        <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:24px 28px;color:#ffffff;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:0.2px;line-height:1.2;">${companyNameEsc}</div>
                <div style="margin-top:4px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">Vendor registration approved</div>
                ${
                  branding.addressLines.length
                    ? `<div style="margin-top:10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#cbd5f5;">${branding.addressLines
                        .map((l) => `<div>${esc(l)}</div>`)
                        .join("")}</div>`
                    : ""
                }
              </td>
              <td style="vertical-align:middle;text-align:right;width:84px;">
                ${
                  logoAttachment
                    ? `<img src="cid:${logoAttachment.cid}" alt="${companyNameEsc}" width="64" height="64" style="width:64px;height:64px;border-radius:999px;object-fit:cover;display:inline-block;border:2px solid rgba(255,255,255,0.6);" />`
                    : ""
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>`;

    const bodyBlock = `
      <tr>
        <td style="padding:24px 28px 8px 28px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#1f2937;">
            <p style="margin:0 0 16px 0;">Dear ${addresseeEsc},</p>
            <p style="margin:0 0 16px 0;">We are pleased to confirm that <strong>${vendorNameEsc}</strong> has been <strong>approved</strong> as an active vendor on the procurement register for ${companyNameEsc}.</p>
            <p style="margin:0 0 16px 0;">Our team may contact you at this email address for quotations, purchase orders, and related correspondence.</p>
            <p style="margin:24px 0 0 0;">Kind regards,<br/><strong>${companyNameEsc}</strong></p>
            <p style="margin:20px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:#64748b;">Please note: This inbox is not monitored for open-ended vendor support. For procurement queries, use the contact details in the footer below or those shared directly by your buyer.</p>
          </div>
        </td>
      </tr>`;

    const contactPieces: string[] = [];
    if (branding.contactEmail) contactPieces.push(esc(branding.contactEmail));
    if (branding.contactPhone) contactPieces.push(`Tel: ${esc(branding.contactPhone)}`);
    if (branding.website) contactPieces.push(esc(String(branding.website).replace(/^https?:\/\//, "")));
    const contactHtml = contactPieces.length
      ? `<div style="margin-top:6px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#cbd5f5;">${contactPieces.join(
          " &nbsp;·&nbsp; "
        )}</div>`
      : "";
    const addressFooterHtml = branding.addressLines.length
      ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#cbd5f5;">${branding.addressLines
          .map((l) => esc(l))
          .join(" &nbsp;·&nbsp; ")}</div>`
      : "";
    const year = new Date().getFullYear();
    const footerBlock = `
      <tr>
        <td style="background:#0f172a;padding:22px 28px;color:#e2e8f0;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#ffffff;">${companyNameEsc}</div>
          ${addressFooterHtml}
          ${contactHtml}
          <div style="margin-top:12px;border-top:1px solid #1e293b;padding-top:10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#94a3b8;">
            © ${year} ${companyNameEsc}. All rights reserved. &nbsp;·&nbsp; This is an automated message — please do not reply.
          </div>
        </td>
      </tr>`;

    const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Vendor registration approved — ${companyNameEsc}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;color:transparent;">Vendor registration approved — ${companyNameEsc}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eef2f7;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            ${headerBlock}
            ${bodyBlock}
            ${footerBlock}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    const attachments: NewsletterInlineAttachment[] = logoAttachment ? [logoAttachment] : [];
    const subject = `Vendor registration approved — ${branding.companyName}`;
    return { html, attachments, subject };
  }

  /**
   * Send term sheet created email
   */
  static async sendTermSheetCreatedEmail(data: EmailNotificationData): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Your term sheet is ready",
        subjectPrefix: "Your Term Sheet is Ready for Review",
        preheader: `A term sheet is ready for ${data.businessName}.`,
        bodyInnerHtml: EmailNotificationService.buildTermSheetCreatedBodyHtml(data),
      });
      console.log(`Term sheet created email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending term sheet created email:", error);
      throw error;
    }
  }

  /**
   * Send term sheet approved email
   */
  static async sendTermSheetApprovedEmail(data: EmailNotificationData): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Term sheet approved",
        subjectPrefix: "Term Sheet Approved",
        preheader: `Term sheet approved for ${data.businessName}.`,
        bodyInnerHtml: EmailNotificationService.buildTermSheetApprovedBodyHtml(data),
      });
      console.log(`Term sheet approved email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending term sheet approved email:", error);
      throw error;
    }
  }

  /**
   * Send term sheet rejected email
   */
  static async sendTermSheetRejectedEmail(data: EmailNotificationData): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Term sheet update",
        subjectPrefix: "Term Sheet Update",
        preheader: `An update on the term sheet for ${data.businessName}.`,
        bodyInnerHtml: EmailNotificationService.buildTermSheetRejectedBodyHtml(data),
      });
      console.log(`Term sheet rejected email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending term sheet rejected email:", error);
      throw error;
    }
  }

  /**
   * Send applicant portal login credentials (e.g. after DD completion creates a new user). No investment-approval wording.
   */
  static async sendInvestmentApprovedAccountCreatedEmail(data: EmailNotificationData & { tempPassword: string }): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Your portal login",
        subjectPrefix: `Your ${process.env.COMPANY_NAME_SHORT || "NVCCZ"} portal login`,
        preheader: "Your portal account credentials are ready.",
        bodyInnerHtml: EmailNotificationService.buildPortalCredentialsBodyHtml(data),
      });
      console.log(`Applicant portal credentials email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending applicant portal credentials email:", error);
      throw error;
    }
  }

  /**
   * Send portfolio company created email
   */
  static async sendPortfolioCompanyCreatedEmail(data: EmailNotificationData): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Welcome to the portfolio",
        subjectPrefix: `Welcome to ${process.env.COMPANY_NAME_SHORT || "NVCCZ"} Portfolio`,
        preheader: `${data.businessName} is now a portfolio company.`,
        bodyInnerHtml: EmailNotificationService.buildPortfolioCompanyCreatedBodyHtml(data),
      });
      console.log(`Portfolio company created email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending portfolio company created email:", error);
      throw error;
    }
  }

  /**
   * Send general stage update email
   */
  static async sendStageUpdateEmail(data: EmailNotificationData): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Application status update",
        subjectPrefix: `Application Status Update - ${data.currentStage}`,
        preheader: `Status update for ${data.businessName}: ${data.currentStage}`,
        bodyInnerHtml: EmailNotificationService.buildStageUpdateBodyHtml(data),
      });
      console.log(`Stage update email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending stage update email:", error);
      throw error;
    }
  }

  /**
   * Shared newsletter letterhead shell for applicant lifecycle emails (received / shortlisted).
   * Same card + gradient header + CID logo + dark footer as internal newsletters.
   */
  private static async buildApplicationLifecycleEmailBrandedDocument(params: {
    data: EmailNotificationData;
    emailHeading: string;
    headerTagline: string;
    subjectPrefix: string;
    preheader: string;
    bodyInnerHtml: string;
    footerAudienceNote?: string;
    metaLine?: string;
  }): Promise<{ html: string; attachments: NewsletterInlineAttachment[]; subject: string }> {
    let branding: EmailBranding;
    try {
      branding = await getEmailBrandingCached();
    } catch {
      branding = {
        companyName: process.env.COMPANY_NAME_SHORT || "NVCCZ",
        logoUrl: null,
        addressLines: [],
        contactEmail: null,
        contactPhone: null,
        website: null,
      };
    }

    const { imgTag, attachment } = await fetchNewsletterTransactionalLogoAttachment(
      branding,
      "application-lifecycle-logo@nvccz"
    );

    const submittedLabel = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const rows = buildNewsletterTransactionalEmailRows({
      branding,
      logoImgTag: imgTag,
      headerTagline: params.headerTagline,
      emailHeading: params.emailHeading,
      metaLine: params.metaLine || `Portfolio · ${submittedLabel}`,
      bodyInnerHtml: params.bodyInnerHtml,
      footerAudienceNote:
        params.footerAudienceNote ||
        "You are receiving this because of activity on an investment application or deal. This is an automated message — please do not reply.",
    });

    const html = buildNewsletterEmailDocumentHtml({
      pageTitleEscaped: escapeHtmlForEmail(params.emailHeading),
      preheaderEscaped: escapeHtmlForEmail(params.preheader),
      innerRowsHtml: rows,
    });

    return {
      html,
      attachments: attachment ? [attachment] : [],
      subject: `${params.subjectPrefix} — ${branding.companyName}`,
    };
  }

  private static async sendBrandedInvestmentMail(opts: {
    toName: string;
    toEmail: string;
    emailHeading: string;
    headerTagline?: string;
    subjectPrefix: string;
    preheader: string;
    bodyInnerHtml: string;
    footerAudienceNote?: string;
    metaLine?: string;
    fromKey?: "investment" | "platform";
    headers?: Record<string, string>;
  }): Promise<void> {
    const dummy: EmailNotificationData = {
      applicantName: opts.toName,
      applicantEmail: opts.toEmail,
      businessName: "",
      applicationId: "",
      currentStage: "",
    };
    const { html, attachments, subject } =
      await EmailNotificationService.buildApplicationLifecycleEmailBrandedDocument({
        data: dummy,
        emailHeading: opts.emailHeading,
        headerTagline: opts.headerTagline || "Portfolio",
        subjectPrefix: opts.subjectPrefix,
        preheader: opts.preheader,
        bodyInnerHtml: opts.bodyInnerHtml,
        footerAudienceNote: opts.footerAudienceNote,
        metaLine: opts.metaLine,
      });
    const from = getFromAddress(opts.fromKey || "investment");
    const safeName = String(opts.toName || "Recipient").replace(/"/g, "'").slice(0, 120);
    await emailTransport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: `"${safeName}" <${opts.toEmail}>`,
      subject,
      html,
      attachments: attachments.length ? attachments : undefined,
      headers: opts.headers,
    });
  }

  private static async sendBrandedApplicantEmail(
    data: EmailNotificationData,
    opts: {
      emailHeading: string;
      subjectPrefix: string;
      preheader: string;
      bodyInnerHtml: string;
      headerTagline?: string;
      fromKey?: "investment" | "platform";
    }
  ): Promise<void> {
    await EmailNotificationService.sendBrandedInvestmentMail({
      toName: data.applicantName,
      toEmail: data.applicantEmail,
      emailHeading: opts.emailHeading,
      headerTagline: opts.headerTagline || "Investment applications",
      subjectPrefix: opts.subjectPrefix,
      preheader: opts.preheader,
      bodyInnerHtml: opts.bodyInnerHtml,
      fromKey: opts.fromKey,
      footerAudienceNote:
        "You are receiving this because you submitted an investment application. This is an automated message — please do not reply.",
      metaLine: `Investment applications · ${new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`,
    });
  }

  private static brandedCtaHtml(href: string, label: string): string {
    const esc = escapeHtmlForEmail;
    return `<p style="margin:20px 0 16px 0;"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:12px 22px;background:#1e3a8a;color:#ffffff;text-decoration:none;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;">${esc(label)}</a></p>`;
  }

  private static brandedSignoffHtml(): string {
    return `<p style="margin:24px 0 0 0;">Kind regards,<br/><strong>Investment Team</strong></p>`;
  }

  private static buildApplicationDetailsCardHtml(data: EmailNotificationData, extraRowsHtml = ""): string {
    const esc = escapeHtmlForEmail;
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
        <tr>
          <td style="padding:16px 18px;">
            <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#64748b;margin-bottom:10px;">Application details</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#334155;">
              <tr>
                <td style="padding:4px 0;width:42%;color:#64748b;">Application ID</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">${esc(data.applicationId)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#64748b;">Business</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">${esc(data.businessName)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#64748b;">Status</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">${esc(data.currentStage || "Received")}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#64748b;">Date</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">${esc(
                  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
                )}</td>
              </tr>
              ${extraRowsHtml}
            </table>
          </td>
        </tr>
      </table>`;
  }

  private static buildApplicationReceivedBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    const name = esc(data.applicantName);
    const business = esc(data.businessName);
    return `
      <p style="margin:0 0 16px 0;">Dear ${name},</p>
      <p style="margin:0 0 16px 0;">Thank you for submitting your investment application for <strong>${business}</strong>. We have successfully received your application and supporting documents.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data, `
              <tr>
                <td style="padding:4px 0;color:#64748b;">Current stage</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">Application received</td>
              </tr>`)}
      <p style="margin:0 0 10px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;">What happens next</p>
      <ol style="margin:0 0 16px 0;padding-left:20px;">
        <li style="margin-bottom:8px;"><strong>Initial review</strong> — we confirm completeness and strategic fit.</li>
        <li style="margin-bottom:8px;"><strong>Screening</strong> — your application is assessed against our investment criteria.</li>
        <li style="margin-bottom:8px;"><strong>Due diligence</strong> — if shortlisted, we undertake a deeper review.</li>
        <li style="margin-bottom:8px;"><strong>Decision</strong> — you will receive a clear update by email.</li>
      </ol>
      <p style="margin:0 0 16px 0;">We typically review applications within 2–3 weeks. You will receive email updates at each stage.</p>
      <p style="margin:24px 0 0 0;">Kind regards,<br/><strong>Investment Team</strong></p>`;
  }

  private static buildApplicationShortlistedBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    const name = esc(data.applicantName);
    const business = esc(data.businessName);
    const scoreRow =
      data.additionalInfo?.score != null
        ? `<tr>
                <td style="padding:4px 0;color:#64748b;">Screening score</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">${esc(String(data.additionalInfo.score))}%</td>
              </tr>`
        : "";
    return `
      <p style="margin:0 0 16px 0;">Dear ${name},</p>
      <p style="margin:0 0 16px 0;">Congratulations — your application for <strong>${business}</strong> has been <strong>shortlisted</strong> and will proceed to the next stage of our process.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data, scoreRow)}
      <p style="margin:0 0 10px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;">What happens next</p>
      <ul style="margin:0 0 16px 0;padding-left:20px;">
        <li style="margin-bottom:8px;">Financial analysis and verification</li>
        <li style="margin-bottom:8px;">Market and competitive review</li>
        <li style="margin-bottom:8px;">Management team evaluation</li>
        <li style="margin-bottom:8px;">Legal and regulatory checks</li>
            </ul>
      <p style="margin:0 0 16px 0;">Our team may contact you if additional information is required. We anticipate completing this stage within 2–3 weeks.</p>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildDueDiligenceStartedBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">Your application for <strong>${esc(data.businessName)}</strong> has <strong>passed screening</strong> and moved to <strong>Active Due Diligence</strong>.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data)}
      <p style="margin:0 0 10px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;">What we will review</p>
      <ul style="margin:0 0 16px 0;padding-left:20px;">
        <li style="margin-bottom:8px;">Financial analysis and projections</li>
        <li style="margin-bottom:8px;">Market and competitive positioning</li>
        <li style="margin-bottom:8px;">Management team evaluation</li>
        <li style="margin-bottom:8px;">Legal and regulatory compliance</li>
      </ul>
      <p style="margin:0 0 16px 0;">Our team may contact you for additional information. Please respond promptly so the process can continue smoothly.</p>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildDueDiligenceCompletedBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">Due diligence for <strong>${esc(data.businessName)}</strong> is complete. Your application will now move to board review.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data)}
      <p style="margin:0 0 16px 0;">Board review typically takes 1–2 weeks. We will email you when a decision is ready.</p>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildBoardReviewStartedBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">Your application for <strong>${esc(data.businessName)}</strong> is now under <strong>board review</strong>.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data)}
      <p style="margin:0 0 16px 0;">The investment committee will review diligence findings and decide on next steps. This usually takes 1–2 weeks.</p>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildInvestmentDecisionBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    const isApproved = data.currentStage === "BOARD_APPROVED";
    const isRejected = data.currentStage === "BOARD_REJECTED";
    const statusText = isApproved
      ? "Investment approved"
      : isRejected
        ? "Investment not approved"
        : "Conditional approval";
    const decisionCopy = isApproved
      ? `<p style="margin:0 0 16px 0;">Congratulations — your application has been <strong>approved</strong>. Our team will contact you shortly about next steps, terms, and implementation.</p>`
      : isRejected
        ? `<p style="margin:0 0 16px 0;">After careful consideration, we will not proceed with an investment at this time. This does not reflect on the quality of your business — you are welcome to reapply in future.</p>`
        : `<p style="margin:0 0 16px 0;">We are offering <strong>conditional approval</strong>. Our team will contact you to discuss the conditions that must be met before we proceed.</p>`;
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">We have completed board review of your application for <strong>${esc(data.businessName)}</strong>.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data, `
              <tr>
                <td style="padding:4px 0;color:#64748b;">Decision</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">${esc(statusText)}</td>
              </tr>`)}
      ${decisionCopy}
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildInvestmentImplementationStartedBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">We are beginning investment implementation for <strong>${esc(data.businessName)}</strong>.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data)}
      <p style="margin:0 0 10px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;">Next steps</p>
      <ul style="margin:0 0 16px 0;padding-left:20px;">
        <li style="margin-bottom:8px;">Finalize documentation</li>
        <li style="margin-bottom:8px;">Complete legal and regulatory requirements</li>
        <li style="margin-bottom:8px;">Set up monitoring and reporting</li>
        <li style="margin-bottom:8px;">Begin disbursement planning</li>
      </ul>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildApplicationBelowThresholdBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    const reasoningText = String(
      data.additionalInfo?.rejectionReason || data.additionalInfo?.aiReasoning || ""
    );
    let feedbackSummary = "";
    if (reasoningText) {
      const sentences = reasoningText.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
      const summary = (sentences.slice(0, 2).join(" ") || reasoningText).substring(0, 200);
      feedbackSummary = summary + (summary.length >= 200 ? "..." : "");
    }
    const scoreRow =
      data.additionalInfo?.score != null
        ? `<tr>
                <td style="padding:4px 0;color:#64748b;">Screening score</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">${esc(String(data.additionalInfo.score))}%</td>
              </tr>`
        : "";
    const feedbackBlock = feedbackSummary
      ? `<p style="margin:0 0 10px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;">Summary feedback</p>
         <p style="margin:0 0 16px 0;padding:14px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;color:#9a3412;">${esc(feedbackSummary)}</p>`
      : "";
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">Thank you for submitting your application for <strong>${esc(data.businessName)}</strong>. After review, it does not meet our current investment criteria at this time.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data, scoreRow)}
      ${feedbackBlock}
      <p style="margin:0 0 16px 0;">We encourage you to continue developing the business and consider reapplying in the future.</p>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildTermSheetCreatedBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    const loginBase = String(process.env.FRONTEND_URL || "http://app.kyntaro.com").replace(/\/+$/, "");
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">A term sheet has been prepared for your investment in <strong>${esc(data.businessName)}</strong>. Please review it on the platform.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data)}
      ${EmailNotificationService.brandedCtaHtml(`${loginBase}/login`, "Open platform login")}
      <p style="margin:0 0 16px 0;">Sign in with <strong>${esc(data.applicantEmail)}</strong> to review and download the term sheet.</p>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildTermSheetApprovedBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">The term sheet for <strong>${esc(data.businessName)}</strong> has been <strong>approved</strong>. We will proceed with legal documentation and implementation.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data)}
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildTermSheetRejectedBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">After careful consideration, we will not proceed with the current term sheet for <strong>${esc(data.businessName)}</strong>.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data)}
      <p style="margin:0 0 16px 0;">We appreciate your understanding and encourage you to explore other funding options.</p>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildPortalCredentialsBodyHtml(
    data: EmailNotificationData & { tempPassword: string }
  ): string {
    const esc = escapeHtmlForEmail;
    const loginBase = String(process.env.FRONTEND_URL || "http://app.kyntaro.com").replace(/\/+$/, "");
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">An account has been created for <strong>${esc(data.businessName)}</strong>. Use the credentials below to sign in.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
        <tr><td style="padding:16px 18px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#1e3a8a;">
          <div><strong>Email:</strong> ${esc(data.applicantEmail)}</div>
          <div style="margin-top:8px;"><strong>Temporary password:</strong> ${esc(data.tempPassword)}</div>
        </td></tr>
      </table>
      ${EmailNotificationService.brandedCtaHtml(`${loginBase}/login`, "Sign in to the portal")}
      <p style="margin:0 0 16px 0;"><strong>Security:</strong> Change your password after your first login.</p>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildPortfolioCompanyCreatedBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">Welcome — <strong>${esc(data.businessName)}</strong> is now part of our portfolio.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data)}
      <p style="margin:0 0 16px 0;">Our portfolio team will contact you to set up check-ins, reporting, and ongoing support.</p>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildStageUpdateBodyHtml(data: EmailNotificationData): string {
    const esc = escapeHtmlForEmail;
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">There is an update on your investment application for <strong>${esc(data.businessName)}</strong>.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data)}
      <p style="margin:0 0 16px 0;">We will continue to email you as the application progresses.</p>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildDisbursementApprovedBodyHtml(
    data: EmailNotificationData & {
      disbursementAmount: number;
      disbursementDate: Date;
      immediateDisbursement?: boolean;
    }
  ): string {
    const esc = escapeHtmlForEmail;
    const when = data.disbursementDate instanceof Date ? data.disbursementDate : new Date(data.disbursementDate);
    const amount = `$${Number(data.disbursementAmount || 0).toLocaleString()}`;
    const copy = data.immediateDisbursement
      ? `<p style="margin:0 0 16px 0;">Your funding disbursement request has been <strong>approved</strong> and funds for this tranche have been disbursed.</p>`
      : `<p style="margin:0 0 16px 0;">Your fund disbursement request has been <strong>approved</strong> and is being processed.</p>`;
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      ${copy}
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data, `
              <tr>
                <td style="padding:4px 0;color:#64748b;">Amount</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">${esc(amount)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;color:#64748b;">Scheduled date</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">${esc(when.toLocaleDateString())}</td>
              </tr>`)}
      <p style="margin:0 0 16px 0;">You will receive a separate confirmation with the transaction reference when the transfer completes.</p>
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  private static buildDisbursementCompletedBodyHtml(
    data: EmailNotificationData & { disbursementAmount: number; transactionReference?: string }
  ): string {
    const esc = escapeHtmlForEmail;
    const amount = `$${Number(data.disbursementAmount || 0).toLocaleString()}`;
    const refRow = data.transactionReference
      ? `<tr>
                <td style="padding:4px 0;color:#64748b;">Transaction reference</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">${esc(data.transactionReference)}</td>
              </tr>`
      : "";
    return `
      <p style="margin:0 0 16px 0;">Dear ${esc(data.applicantName)},</p>
      <p style="margin:0 0 16px 0;">Fund disbursement for <strong>${esc(data.businessName)}</strong> is <strong>complete</strong>.</p>
      ${EmailNotificationService.buildApplicationDetailsCardHtml(data, `
              <tr>
                <td style="padding:4px 0;color:#64748b;">Amount</td>
                <td style="padding:4px 0;font-weight:600;color:#0f172a;">${esc(amount)}</td>
              </tr>${refRow}`)}
      ${EmailNotificationService.brandedSignoffHtml()}`;
  }

  // Email Templates (legacy fallbacks retained for other callers)

  private static getApplicationReceivedTemplate(data: EmailNotificationData): string {
    // Kept for backward compatibility; live sends use branded letterhead.
    return EmailNotificationService.buildApplicationReceivedBodyHtml(data);
  }

  private static getDueDiligenceStartedTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Due Diligence Started - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f0fdf4; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Screening passed — Active Due Diligence</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>

            <p>Your application for <strong>${data.businessName}</strong> has <strong>passed screening</strong> and has moved to <strong>Active Due Diligence</strong>. Our team will now conduct a detailed review.</p>

            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Current Status:</strong> Active Due Diligence</li>
              <li><strong>Due Diligence Started:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <h3>What is Due Diligence?</h3>
            <p>Due diligence is our comprehensive analysis of your business, including:</p>
            <ul>
              <li>Financial analysis and projections</li>
              <li>Market analysis and competitive positioning</li>
              <li>Management team evaluation</li>
              <li>Legal and regulatory compliance</li>
              <li>Technology and intellectual property assessment</li>
            </ul>
            
            <h3>What to expect:</h3>
            <p>Our due diligence team may contact you for additional information or clarification. Please respond promptly to any requests to keep the process moving smoothly.</p>
            
            <p>We anticipate completing the due diligence process within 2-3 weeks, after which your application will proceed to the board review stage.</p>
            
            <p>Thank you for your patience and cooperation.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getDueDiligenceTaskAssignedTemplate(data: {
    assigneeName: string;
    assigneeEmail: string;
    taskTitle: string;
    businessName: string;
    applicationId: string;
    taskId: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Due Diligence Task Assigned - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #059669; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">📋 New Task Assigned</h1>
          </div>
          <div class="content">
            <p>Dear ${data.assigneeName},</p>
            
            <p>You have been assigned a new due diligence task. Please log in to the performance module to view the task details and start working on it.</p>
            
            <div class="info-box">
              <p style="margin: 0;"><strong>Task Title:</strong> ${data.taskTitle}</p>
              <p style="margin: 10px 0 0 0;"><strong>Business:</strong> ${data.businessName}</p>
              <p style="margin: 10px 0 0 0;"><strong>Application ID:</strong> ${data.applicationId}</p>
            </div>

            <p>This task has been automatically synced with the performance module. You can update your progress and upload relevant documents as you work on the task.</p>
            
            <p>Please ensure you complete this task within the specified deadline.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated notification from ${process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Investment Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getPerformanceGoalTaskAssignedTemplate(data: {
    assigneeName: string;
    assigneeEmail: string;
    taskTitle: string;
    taskId: string;
    targetValueDisplay: string;
    targetUnit: string;
    priority: string;
    startDateDisplay: string;
    endDateDisplay: string;
    departmentName?: string | null;
    description?: string | null;
  }): string {
    const esc = (v: string | null | undefined) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const deptRow =
      data.departmentName != null && String(data.departmentName).trim() !== ""
        ? `<p style="margin: 10px 0 0 0;"><strong>Department:</strong> ${esc(data.departmentName)}</p>`
        : "";
    const descBlock =
      data.description != null && String(data.description).trim() !== ""
        ? `<p style="margin: 16px 0 0 0;"><strong>Description:</strong><br/>${esc(data.description)}</p>`
        : "";

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New performance task — ${process.env.COMPANY_NAME_SHORT || "NVCCZ"}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1d4ed8; color: white; padding: 20px; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #eff6ff; border-left: 4px solid #1d4ed8; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">New performance task</h1>
          </div>
          <div class="content">
            <p>Dear ${esc(data.assigneeName)},</p>
            <p>A new task has been created from your individual performance goal. Please sign in to the platform to view it in your task list and update progress.</p>
            <div class="info-box">
              <p style="margin: 0;"><strong>Title:</strong> ${esc(data.taskTitle)}</p>
              <p style="margin: 10px 0 0 0;"><strong>Target value:</strong> ${esc(data.targetValueDisplay)} <strong>${esc(data.targetUnit)}</strong></p>
              <p style="margin: 10px 0 0 0;"><strong>Priority:</strong> ${esc(data.priority)}</p>
              <p style="margin: 10px 0 0 0;"><strong>Goal period:</strong> ${esc(data.startDateDisplay)} → ${esc(data.endDateDisplay)}</p>
              ${deptRow}
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #6b7280;"><strong>Task ID:</strong> ${esc(data.taskId)}</p>
            </div>
            ${descBlock}
            <p style="margin-top: 24px;">Best regards,<br/>
            <strong>${process.env.EMAIL_FROM_NAME_PLATFORM || "NVCCZ Investment Platform"}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© ${new Date().getFullYear()} ${process.env.COMPANY_NAME_SHORT || "NVCCZ"}.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getPerformanceReviewSelfAssessmentReminderTemplate(data: {
    revieweeName: string;
    revieweeEmail: string;
    reviewTitle: string;
    reviewPeriod: string;
    cycleTitle: string;
    selfAssessmentDeadlineDisplay: string;
    reviewId: string;
  }): string {
    const esc = (v: string | null | undefined) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Performance self-assessment — ${process.env.COMPANY_NAME_SHORT || "NVCCZ"}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #0f766e; color: white; padding: 20px; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #f0fdfa; border-left: 4px solid #0d9488; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Performance review — self-assessment</h1>
          </div>
          <div class="content">
            <p>Dear ${esc(data.revieweeName)},</p>
            <p>Your manager has opened a performance review for you as part of <strong>${esc(data.cycleTitle)}</strong>. Please sign in to the platform and complete your <strong>self-assessment</strong> so the process can continue.</p>
            <div class="info-box">
              <p style="margin: 0;"><strong>Review:</strong> ${esc(data.reviewTitle)}</p>
              <p style="margin: 10px 0 0 0;"><strong>Period:</strong> ${esc(data.reviewPeriod)}</p>
              <p style="margin: 10px 0 0 0;"><strong>Self-assessment target date:</strong> ${esc(data.selfAssessmentDeadlineDisplay)}</p>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #6b7280;"><strong>Review ID:</strong> ${esc(data.reviewId)}</p>
            </div>
            <p style="margin-top: 24px;">If you have questions, contact HR or your line manager.</p>
            <p>Best regards,<br/>
            <strong>${process.env.EMAIL_FROM_NAME_PLATFORM || "NVCCZ Investment Platform"}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© ${new Date().getFullYear()} ${process.env.COMPANY_NAME_SHORT || "NVCCZ"}.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getDueDiligenceActivityUpdateTemplate(data: {
    cioName: string;
    cioEmail: string;
    assigneeName: string;
    taskTitle: string;
    activityTitle: string;
    activityId: string;
    taskId: string;
    hasDocuments: boolean;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Due Diligence Activity Update - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #7c3aed; color: white; padding: 20px; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #faf5ff; border-left: 4px solid #7c3aed; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">📊 Activity Update</h1>
          </div>
          <div class="content">
            <p>Dear ${data.cioName},</p>
            
            <p><strong>${data.assigneeName}</strong> has updated their progress on the following task:</p>
            
            <div class="info-box">
              <p style="margin: 0;"><strong>Task:</strong> ${data.taskTitle}</p>
              <p style="margin: 10px 0 0 0;"><strong>Activity:</strong> ${data.activityTitle}</p>
              ${data.hasDocuments ? '<p style="margin: 10px 0 0 0;"><strong>📎 Documents:</strong> Attached</p>' : ''}
            </div>

            <p>Please review the activity update and attached documents (if any) in the due diligence panel. You can approve or request changes as needed.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated notification from ${process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Investment Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getDueDiligenceActivityApprovedTemplate(data: {
    assigneeName: string;
    assigneeEmail: string;
    taskTitle: string;
    activityTitle: string;
    activityId: string;
    approved: boolean;
    comments?: string;
  }): string {
    const statusColor = data.approved ? '#059669' : '#dc2626';
    const statusText = data.approved ? 'Approved' : 'Rejected';
    const statusIcon = data.approved ? '✅' : '❌';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Activity ${statusText} - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${statusColor}; color: white; padding: 20px; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: ${data.approved ? '#f0fdf4' : '#fef2f2'}; border-left: 4px solid ${statusColor}; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">${statusIcon} Activity ${statusText}</h1>
          </div>
          <div class="content">
            <p>Dear ${data.assigneeName},</p>
            
            <p>Your activity update has been reviewed and <strong>${statusText.toLowerCase()}</strong>:</p>
            
            <div class="info-box">
              <p style="margin: 0;"><strong>Task:</strong> ${data.taskTitle}</p>
              <p style="margin: 10px 0 0 0;"><strong>Activity:</strong> ${data.activityTitle}</p>
            </div>

            ${data.comments ? `
            <div style="background: #f9fafb; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Comments:</strong></p>
              <p style="margin: 10px 0 0 0;">${data.comments}</p>
            </div>
            ` : ''}

            ${data.approved ? 
              '<p>Great work! Your activity has been approved. Please continue with the task.</p>' :
              '<p>Please review the comments above and make the necessary changes. You can update your activity and resubmit for review.</p>'
            }
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated notification from ${process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Investment Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getDueDiligenceCompletedTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Due Diligence Completed - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #7c3aed; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #faf5ff; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Due Diligence Process Completed</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>We are pleased to inform you that the due diligence process for <strong>${data.businessName}</strong> has been completed successfully.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Current Status:</strong> Due Diligence Completed</li>
              <li><strong>Completed Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <h3>What happens next?</h3>
            <p>Your application will now proceed to the board review stage, where our investment committee will evaluate your business and make a final investment decision.</p>
            
            <p>The board review process typically takes 1-2 weeks, after which you will receive a final decision on your investment application.</p>
            
            <p>We will keep you updated throughout the process.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getBoardReviewStartedTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Board Review Started - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #fef2f2; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Board Review Process Started</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>Your application for <strong>${data.businessName}</strong> has successfully completed the due diligence process and is now under board review.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Current Status:</strong> Under Board Review</li>
              <li><strong>Board Review Started:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <h3>What is Board Review?</h3>
            <p>The board review is the final stage of our investment evaluation process. Our investment committee will:</p>
            <ul>
              <li>Review the due diligence findings</li>
              <li>Evaluate the investment opportunity</li>
              <li>Assess risk and return potential</li>
              <li>Make a final investment decision</li>
            </ul>
            
            <h3>What to expect:</h3>
            <p>The board review process typically takes 1-2 weeks. You will receive a final decision on your investment application once the review is complete.</p>
            
            <p>This is the final stage of our evaluation process, and we appreciate your patience.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getBoardVoteRequestTemplate(data: {
    recipientName: string;
    businessName: string;
    dealReference?: string | null;
    voteUrl: string;
  }): string {
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const refPart =
      data.dealReference && String(data.dealReference).trim()
        ? ` (Deal reference: <strong>${esc(String(data.dealReference).trim())}</strong>)`
        : "";
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Board Vote Requested</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1f2937; color: white; padding: 20px; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #f3f4f6; border-left: 4px solid #1f2937; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #1f2937; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Board Vote Required</h1>
          </div>
          <div class="content">
            <p>Dear ${data.recipientName},</p>

            <p>A new board review vote is required for <strong>${esc(data.businessName)}</strong>${refPart}.</p>

            <div class="info-box">
              <p style="margin: 0;">Please review the materials and cast your vote at your earliest convenience. Your voting power will be applied automatically.</p>
            </div>

            <p style="text-align: center;">
              <a class="button" href="${data.voteUrl}">Cast Your Vote</a>
            </p>

            <p>If you have any questions, please contact the Investment Team.</p>

            <p>Thank you for your prompt attention.</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from ${process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Investment Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getBoardVoteResultsTemplate(data: {
    recipientName: string;
    businessName: string;
    applicationId: string;
    approvePower: number;
    rejectPower: number;
    majorityDecision: string;
    votes: Array<{ voterName: string; vote: string; comment?: string | null; votingPower: number }>;
  }): string {
    const votesRows = data.votes
      .map(vote => `
        <tr>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${vote.voterName}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${vote.vote === 'APPROVE' ? 'Approve' : 'Reject'}</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${vote.votingPower.toFixed(2)}%</td>
          <td style="padding: 8px; border: 1px solid #e5e7eb;">${vote.comment ? vote.comment : '-'}</td>
        </tr>
      `)
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Board Vote Results</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 700px; margin: 0 auto; padding: 20px; }
          .header { background-color: #111827; color: white; padding: 20px; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          .summary { background: #f9fafb; border: 1px solid #e5e7eb; padding: 15px; border-radius: 4px; }
          .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Board Vote Results</h1>
          </div>
          <div class="content">
            <p>Dear ${data.recipientName},</p>

            <p>The voting process for <strong>${data.businessName}</strong> (Application ID: <strong>${data.applicationId}</strong>) has concluded.</p>

            <div class="summary">
              <p><strong>Majority Decision:</strong> ${data.majorityDecision === 'APPROVE' ? 'Approved' : 'Rejected'}</p>
              <p><strong>Approve Power:</strong> ${data.approvePower.toFixed(2)}%</p>
              <p><strong>Reject Power:</strong> ${data.rejectPower.toFixed(2)}%</p>
            </div>

            <table>
              <thead>
                <tr style="background: #f3f4f6;">
                  <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Board Member</th>
                  <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Vote</th>
                  <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Voting Power</th>
                  <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Comment</th>
                </tr>
              </thead>
              <tbody>
                ${votesRows}
              </tbody>
            </table>

            <p>Thank you for participating in the board review process.</p>
          </div>
          <div class="footer">
            <p>This is an automated notification from ${process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Investment Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getInvestmentDecisionTemplate(data: EmailNotificationData): string {
    const isApproved = data.currentStage === 'BOARD_APPROVED';
    const isRejected = data.currentStage === 'BOARD_REJECTED';
    const isConditional = data.currentStage === 'BOARD_CONDITIONAL';
    
    let statusText = '';
    let statusColor = '';
    let contentColor = '';
    
    if (isApproved) {
      statusText = 'Investment Approved';
      statusColor = '#059669';
      contentColor = '#f0fdf4';
    } else if (isRejected) {
      statusText = 'Investment Not Approved';
      statusColor = '#dc2626';
      contentColor = '#fef2f2';
    } else if (isConditional) {
      statusText = 'Conditional Approval';
      statusColor = '#d97706';
      contentColor = '#fffbeb';
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Investment Decision - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: ${statusColor}; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: ${contentColor}; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>${statusText}</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>We have completed the board review of your application for <strong>${data.businessName}</strong> and have reached a decision.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Decision:</strong> ${statusText}</li>
              <li><strong>Decision Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            ${isApproved ? `
            <h3>Congratulations!</h3>
            <p>We are pleased to inform you that your investment application has been approved. Our team will contact you shortly to discuss the next steps in the investment process.</p>
            <p>You will receive detailed information about the investment terms, timeline, and implementation process.</p>
            ` : isRejected ? `
            <h3>Application Decision</h3>
            <p>After careful consideration, we have decided not to proceed with an investment in your business at this time.</p>
            <p>This decision does not reflect on the quality of your business or your team. We encourage you to continue developing your business and consider reapplying in the future.</p>
            ` : `
            <h3>Conditional Approval</h3>
            <p>We are pleased to offer conditional approval for your investment application. This means we are interested in investing, but certain conditions must be met before we can proceed.</p>
            <p>Our team will contact you to discuss the specific conditions and next steps.</p>
            `}
            
            <p>Thank you for your interest in ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'} and for the time and effort you put into your application.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getInvestmentImplementationStartedTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Investment Implementation Started - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Investment Implementation Started</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>Congratulations! We are excited to begin the investment implementation process for <strong>${data.businessName}</strong>.</p>
            
            <h3>Investment Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Current Status:</strong> Investment Implementation</li>
              <li><strong>Implementation Started:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <h3>What happens next?</h3>
            <p>Our investment implementation team will work with you to:</p>
            <ul>
              <li>Finalize investment terms and documentation</li>
              <li>Complete legal and regulatory requirements</li>
              <li>Set up monitoring and reporting systems</li>
              <li>Begin the investment disbursement process</li>
            </ul>
            
            <p>You will receive regular updates throughout the implementation process and will have a dedicated point of contact for any questions or concerns.</p>
            
            <p>Welcome to the ${process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} portfolio!</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getApplicationShortlistedTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Application Shortlisted - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f0fdf4; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Application Shortlisted</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>Congratulations! Your application for <strong>${data.businessName}</strong> has been shortlisted and will proceed to the due diligence stage.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Current Status:</strong> Shortlisted</li>
              <li><strong>Shortlisted Date:</strong> ${new Date().toLocaleDateString()}</li>
              ${data.additionalInfo?.score ? `<li><strong>Application Score:</strong> ${data.additionalInfo.score}%</li>` : ''}
            </ul>
            
            ${data.additionalInfo?.documents && data.additionalInfo.documents.length > 0 ? `
            <h3>Your Submitted Documents:</h3>
            <ul>
              ${data.additionalInfo.documents.map((doc: any) => `
                <li>
                  <strong>${doc.type.replace(/_/g, ' ')}:</strong> 
                  <a href="${doc.url}" target="_blank">${doc.fileName}</a>
                </li>
              `).join('')}
            </ul>
            ` : ''}
            
            <h3>What happens next?</h3>
            <p>Your application will now undergo a comprehensive due diligence process, which includes:</p>
            <ul>
              <li>Financial analysis and verification</li>
              <li>Market research and competitive analysis</li>
              <li>Management team evaluation</li>
              <li>Legal and regulatory compliance review</li>
            </ul>
            
            <p>Our due diligence team will contact you if they need any additional information or clarification.</p>
            
            <p>We anticipate completing the due diligence process within 2-3 weeks.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static escapeHtmlPlain(value: string): string {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Plain HTML fallback (deprecated paths only). Main send uses `buildApplicationRejectionEmailBrandedDocument`. */
  private static getGenericApplicationRejectionEmailHtml(data: EmailNotificationData): string {
    const org = process.env.COMPANY_NAME_SHORT || "NVCCZ";
    const name = this.escapeHtmlPlain(data.applicantName);
    const orgEsc = this.escapeHtmlPlain(org);
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #333; line-height: 1.5; max-width: 560px; margin: 0; padding: 16px;">
<p>Dear ${name},</p>
<p>Thank you for submitting your application and for taking the time to share your company story with us.</p>
<p>We have completed our review and, after careful consideration, we will not be moving forward with your application at this time. This decision was based on our current investment priorities, and not as a reflection of the strength of your team or the potential of your business.</p>
<p>We appreciate your interest in ${orgEsc} and wish you every success as you continue to build.</p>
<p>Kind regards,<br><strong>${orgEsc}</strong></p>
<p style="font-size: 12px; color: #666; margin-top: 24px;">Please note: This inbox is not monitored for application responses. Please do not reply directly to this email.</p>
</body>
</html>`;
  }

  /**
   * @deprecated Prefer getGenericApplicationRejectionEmailHtml for rejection sends.
   */
  private static getApplicationRejectedTemplate(data: EmailNotificationData): string {
    return this.getGenericApplicationRejectionEmailHtml(data);
  }

  private static getApplicationBelowThresholdTemplate(data: EmailNotificationData): string {
    const escapeHtml = (value: string) => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const reasoningText = data.additionalInfo?.rejectionReason || data.additionalInfo?.aiReasoning || '';

    // Create a summary from the AI reasoning (limit to 2-3 key points)
    let feedbackSummary = '';
    if (reasoningText) {
      const sentences = reasoningText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
      if (sentences.length > 0) {
        const summarySentences = sentences.slice(0, 2).map(s => s.trim());
        const summary = summarySentences.join(' ').substring(0, 200);
        feedbackSummary = summary + (summary.length >= 200 ? '...' : '');
      } else {
        feedbackSummary = reasoningText.substring(0, 200) + (reasoningText.length > 200 ? '...' : '');
      }
    }

    let detailedFeedback = '';
    if (reasoningText) {
      const points = reasoningText.split(/(?<=[.!?])\s+/).map(point => point.trim()).filter(Boolean);
      if (points.length > 0) {
        detailedFeedback = `
          <ul>
            ${points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}
          </ul>
        `;
      } else {
        detailedFeedback = `<p>${escapeHtml(reasoningText)}</p>`;
      }
    }

    const documentList = Array.isArray(data.additionalInfo?.documents) && data.additionalInfo.documents.length > 0
      ? `
        <h3>Documents Reviewed</h3>
        <ul>
          ${data.additionalInfo.documents.map((doc: any) => `
            <li>
              <strong>${escapeHtml(doc.type?.replace(/_/g, ' ') || 'Document')}:</strong>
              ${doc.url ? `<a href="${doc.url}" target="_blank">${escapeHtml(doc.fileName || 'View Document')}</a>` : escapeHtml(doc.fileName || 'Unavailable')}
            </li>
          `).join('')}
        </ul>
      `
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Application Update - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #fef2f2; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Application Update</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>Thank you for your interest in ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'} and for submitting your application for <strong>${data.businessName}</strong>.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Status:</strong> Below Investment Threshold</li>
              <li><strong>Review Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <h3>Application Review Outcome</h3>
            <p>After careful consideration and evaluation, your application does not meet our current investment criteria at this time. We appreciate the effort you put into your submission.</p>
            
            ${feedbackSummary ? `
            <h3>Summary Feedback:</h3>
            <div style="background-color: #fff; padding: 15px; border-left: 4px solid #dc2626; margin: 15px 0;">
              <p style="margin: 0; color: #666; line-height: 1.8;">${escapeHtml(feedbackSummary)}</p>
            </div>
            ` : ''}

            ${data.additionalInfo?.score !== undefined ? `
            <h3>Application Score</h3>
            <p style="color: #444; line-height: 1.8;">Your application received an initial screening score of <strong>${data.additionalInfo.score}%</strong>.</p>
            ` : ''}

            ${detailedFeedback ? `
            <h3>Detailed Review Notes</h3>
            <div style="background-color: #fff; padding: 15px; border-left: 4px solid #dc2626; margin: 15px 0;">
              ${detailedFeedback}
            </div>
            ` : ''}

            ${documentList}
            
            <p>This decision does not reflect on the quality of your business or your team. We encourage you to:</p>
            <ul>
              <li>Continue developing your business</li>
              <li>Consider reapplying in the future</li>
              <li>Explore other funding opportunities</li>
            </ul>
            
            <p>We appreciate the time and effort you put into your application and wish you success with your business.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getTermSheetCreatedTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Term Sheet Created - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #7c3aed; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #faf5ff; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Term Sheet Created</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>We are pleased to inform you that a term sheet has been created for your investment in <strong>${data.businessName}</strong>.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Current Status:</strong> Term Sheet Created</li>
              <li><strong>Created Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <h3>What is a Term Sheet?</h3>
            <p>A term sheet is a non-binding document that outlines the key terms and conditions of the proposed investment. It includes:</p>
            <ul>
              <li>Investment amount and equity percentage</li>
              <li>Valuation and ownership structure</li>
              <li>Board representation and voting rights</li>
              <li>Key terms and conditions</li>
            </ul>
            
            <h3>🔐 Access Your Term Sheet</h3>
            <p>Your term sheet is now available for review on the ${process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} platform. You can:</p>
            <ul>
              <li>Log in to your account to view the term sheet</li>
              <li>Review all terms and conditions</li>
              <li>Download the document for your records</li>
              <li>Contact our team with any questions</li>
            </ul>
            
            <div style="background-color: #e5f3ff; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <h4>🌐 Platform Access</h4>
              <p><strong>Login URL:</strong> <a href="${process.env.FRONTEND_URL || 'http://app.kyntaro.com'}/login" target="_blank" style="color: #1e40af;">${process.env.FRONTEND_URL || 'http://app.kyntaro.com'}/login</a></p>
              <p><strong>Your Email:</strong> ${data.applicantEmail}</p>
              <p>Use your existing login credentials to access the platform.</p>
            </div>
            
            <h3>Next Steps:</h3>
            <p>Please log in to review your term sheet and let us know if you have any questions or concerns.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getTermSheetApprovedTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Term Sheet Approved - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f0fdf4; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Term Sheet Approved</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>Excellent news! The term sheet for your investment in <strong>${data.businessName}</strong> has been approved by both parties.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Current Status:</strong> Term Sheet Approved</li>
              <li><strong>Approved Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <h3>What happens next?</h3>
            <p>With the term sheet approved, we will now proceed to:</p>
            <ul>
              <li>Finalize legal documentation</li>
              <li>Complete regulatory requirements</li>
              <li>Begin the investment implementation process</li>
              <li>Set up monitoring and reporting systems</li>
            </ul>
            
            <p>Our team will contact you shortly to coordinate the next steps in the investment process.</p>
            
            <p>Congratulations on reaching this important milestone!</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getTermSheetRejectedTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Term Sheet Update - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #fef2f2; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Term Sheet Update</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>We are writing to inform you about the status of the term sheet for your investment in <strong>${data.businessName}</strong>.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Status:</strong> Term Sheet Not Approved</li>
              <li><strong>Updated Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <h3>Term Sheet Status</h3>
            <p>After careful consideration, we have decided not to proceed with the current term sheet proposal.</p>
            
            <p>This decision may be due to:</p>
            <ul>
              <li>Changes in market conditions</li>
              <li>Revised investment criteria</li>
              <li>Portfolio balance considerations</li>
              <li>Strategic alignment factors</li>
            </ul>
            
            <p>We appreciate your understanding and encourage you to consider other funding opportunities.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getInvestmentApprovedAccountCreatedTemplate(data: EmailNotificationData & { tempPassword: string }): string {
    const loginBase = process.env.FRONTEND_URL || 'http://app.kyntaro.com';
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Your ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'} portal login</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
          .credentials { background-color: #e5f3ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</h1>
            <h2>Your portal login</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>An account has been created for <strong>${data.businessName}</strong> on the ${process.env.COMPANY_NAME_FULL || 'NVCCZ'} platform. Use the credentials below to sign in.</p>
            
            <div class="credentials">
              <h3>Login credentials</h3>
              <p><strong>Email:</strong> ${data.applicantEmail}</p>
              <p><strong>Temporary password:</strong> ${data.tempPassword}</p>
              <p><strong>Login URL:</strong> <a href="${loginBase}/login" target="_blank">${loginBase}/login</a></p>
            </div>
            
            <p><strong>Security:</strong> Change your password after your first login.</p>
            
            <p>If you did not expect this email, contact support.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getPortfolioCompanyCreatedTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'} Portfolio - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Welcome to ${process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Portfolio</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>Congratulations! <strong>${data.businessName}</strong> is now officially part of the ${process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} portfolio.</p>
            
            <h3>Portfolio Company Details:</h3>
            <ul>
              <li><strong>Company Name:</strong> ${data.businessName}</li>
              <li><strong>Portfolio Status:</strong> Active</li>
              <li><strong>Onboarding Date:</strong> ${new Date().toLocaleDateString()}</li>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
            </ul>
            
            <h3>What this means for you:</h3>
            <p>As a portfolio company, you now have access to:</p>
            <ul>
              <li>Strategic guidance and mentorship</li>
              <li>Network connections and partnerships</li>
              <li>Operational support and resources</li>
              <li>Regular monitoring and reporting</li>
            </ul>
            
            <h3>Next Steps:</h3>
            <p>Our portfolio management team will contact you to:</p>
            <ul>
              <li>Set up regular check-ins and reporting</li>
              <li>Introduce you to our network</li>
              <li>Provide strategic guidance and support</li>
              <li>Monitor progress and milestones</li>
            </ul>
            
            <p>Welcome to the ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'} family! We're excited to support your growth and success.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getStageUpdateTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Application Status Update - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Application Status Update</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>We have an update on your investment application for <strong>${data.businessName}</strong>.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Current Status:</strong> ${data.currentStage}</li>
              <li><strong>Updated Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <p>We will continue to keep you updated as your application progresses through our investment process.</p>
            
            <p>If you have any questions, please don't hesitate to contact our investment team.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Notify CFO users that a tranche is waiting for approval (after POST create disbursement).
   */
  static async sendFundDisbursementPendingCfoEmail(data: {
    recipientName: string;
    recipientEmail: string;
    businessName: string;
    portfolioCompanyName: string;
    dealReference: string | null;
    amountDisplay: string;
    trancheIndex: number;
    disbursementId: string;
    investmentImplementationId: string;
    disbursementDate: Date;
  }): Promise<void> {
    try {
      const esc = escapeHtmlForEmail;
      const when =
        data.disbursementDate instanceof Date
          ? data.disbursementDate
          : new Date(data.disbursementDate);
      const base = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
      const queueUrl = base ? `${base}/portfolio-v11` : "";
      const dealLine = data.dealReference
        ? `<div style="margin-top:8px;"><strong>Deal reference:</strong> ${esc(data.dealReference)}</div>`
        : "";
      const bodyInnerHtml = `
        <p style="margin:0 0 16px 0;">Dear ${esc(data.recipientName)},</p>
        <p style="margin:0 0 16px 0;">A fund disbursement request requires CFO approval.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr><td style="padding:16px 18px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#334155;">
            <div><strong>${esc(data.businessName)}</strong> (${esc(data.portfolioCompanyName)})</div>
              ${dealLine}
            <div style="margin-top:8px;"><strong>Tranche:</strong> ${data.trancheIndex}</div>
            <div style="margin-top:8px;"><strong>Amount:</strong> ${esc(data.amountDisplay)}</div>
            <div style="margin-top:8px;"><strong>Scheduled date:</strong> ${esc(when.toLocaleDateString())}</div>
          </td></tr>
        </table>
        ${queueUrl ? EmailNotificationService.brandedCtaHtml(queueUrl, "Open portfolio") : ""}
        ${EmailNotificationService.brandedSignoffHtml()}`;
      await EmailNotificationService.sendBrandedInvestmentMail({
        toName: data.recipientName,
        toEmail: data.recipientEmail,
        emailHeading: "Tranche pending approval",
        headerTagline: "Fund disbursements",
        subjectPrefix: `Fund disbursement pending your approval — ${data.businessName}`,
        preheader: `CFO approval needed for ${data.businessName}`,
        bodyInnerHtml,
        headers: { "X-Priority": "1", Importance: "high" },
        footerAudienceNote:
          "You are receiving this because you approve fund disbursements. This is an automated message — please do not reply.",
      });
      console.log("CFO pending disbursement email sent", { to: data.recipientEmail, disbursementId: data.disbursementId });
    } catch (error) {
      console.error("Failed to send CFO pending disbursement email:", error);
    }
  }

  static async sendDisbursementApprovedEmail(
    data: EmailNotificationData & {
      disbursementAmount: number;
      disbursementDate: Date;
      /** When true, copy reflects CFO approve + cashbook/GL in one step (no “processing queue” wording). */
      immediateDisbursement?: boolean;
    }
  ): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Fund disbursement approved",
        subjectPrefix: "Fund Disbursement Approved",
        preheader: `Disbursement approved for ${data.businessName}`,
        bodyInnerHtml: EmailNotificationService.buildDisbursementApprovedBodyHtml(data),
        fromKey: "platform",
      });
      console.log("Disbursement approved email sent successfully", {
        applicantEmail: data.applicantEmail,
        applicationId: data.applicationId
      });
    } catch (error) {
      console.error("Failed to send disbursement approved email:", error);
    }
  }

  /**
   * Send disbursement completed email
   */
  static async sendDisbursementCompletedEmail(data: EmailNotificationData & { disbursementAmount: number, transactionReference?: string }): Promise<void> {
    try {
      await EmailNotificationService.sendBrandedApplicantEmail(data, {
        emailHeading: "Fund disbursement completed",
        subjectPrefix: "Fund Disbursement Completed",
        preheader: `Disbursement completed for ${data.businessName}`,
        bodyInnerHtml: EmailNotificationService.buildDisbursementCompletedBodyHtml(data),
        fromKey: "platform",
      });
      console.log("Disbursement completed email sent successfully", {
        applicantEmail: data.applicantEmail,
        applicationId: data.applicationId
      });
    } catch (error) {
      console.error("Failed to send disbursement completed email:", error);
    }
  }

  /**
   * Notify lead investment analyst that a pending tranche was CFO-approved (and posted).
   */
  static async sendFundDisbursementApprovedAnalystEmail(data: {
    analystName: string;
    analystEmail: string;
    businessName: string;
    applicationId: string;
    disbursementId: string;
    disbursementAmount: number;
    transactionReference?: string;
  }): Promise<void> {
    try {
      const to = String(data.analystEmail || "").trim();
      if (!to) return;
      const esc = escapeHtmlForEmail;
      const amount = `$${Number(data.disbursementAmount || 0).toLocaleString()}`;
      const ref = data.transactionReference ? esc(data.transactionReference) : "N/A";
      const bodyInnerHtml = `
        <p style="margin:0 0 16px 0;">Dear ${esc(data.analystName)},</p>
        <p style="margin:0 0 16px 0;">The funding disbursement request for <strong>${esc(data.businessName)}</strong> has been <strong>approved</strong> by finance and posted.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr><td style="padding:16px 18px;font-family:Helvetica,Arial,sans-serif;font-size:14px;color:#334155;">
            <div><strong>Amount:</strong> ${esc(amount)}</div>
            <div style="margin-top:8px;"><strong>Transaction reference:</strong> ${ref}</div>
            <div style="margin-top:8px;"><strong>Application ID:</strong> ${esc(data.applicationId)}</div>
          </td></tr>
        </table>
        ${EmailNotificationService.brandedSignoffHtml()}`;
      await EmailNotificationService.sendBrandedInvestmentMail({
        toName: data.analystName,
        toEmail: to,
        emailHeading: "Disbursement approved",
        headerTagline: "Fund disbursements",
        subjectPrefix: `Disbursement request approved — ${data.businessName}`,
        preheader: `Disbursement approved for ${data.businessName}`,
        bodyInnerHtml,
        fromKey: "platform",
        footerAudienceNote:
          "You are receiving this because you are the lead analyst on this deal. This is an automated message — please do not reply.",
      });
      console.log("Fund disbursement approved (analyst) email sent", { to, applicationId: data.applicationId });
    } catch (error) {
      console.error("Failed to send fund disbursement approved analyst email:", error);
    }
  }

  private static getFundDisbursementApprovedAnalystTemplate(data: {
    analystName: string;
    businessName: string;
    applicationId: string;
    disbursementId: string;
    disbursementAmount: number;
    transactionReference?: string;
  }): string {
    const esc = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const ref = data.transactionReference ? esc(data.transactionReference) : "N/A";
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Disbursement approved</title></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <p>Dear ${esc(data.analystName)},</p>
          <p>The <strong>funding disbursement request</strong> for <strong>${esc(data.businessName)}</strong> has been <strong>approved</strong> by finance and <strong>posted</strong> (cashbook / GL).</p>
          <ul>
            <li><strong>Application ID:</strong> ${esc(data.applicationId)}</li>
            <li><strong>Disbursement ID:</strong> ${esc(data.disbursementId)}</li>
            <li><strong>Amount:</strong> $${Number(data.disbursementAmount).toLocaleString()}</li>
            <li><strong>Payment reference:</strong> ${ref}</li>
          </ul>
          <p>You can follow up with the investee as needed. This is an automated notification from ${esc(process.env.COMPANY_NAME_SHORT || "NVCCZ")}.</p>
          <p>Regards,<br/><strong>${esc(process.env.EMAIL_FROM_NAME_INVESTMENT || "NVCCZ Investment Platform")}</strong></p>
        </div>
      </body>
      </html>
    `;
  }

  private static getDisbursementApprovedTemplate(
    data: EmailNotificationData & {
      disbursementAmount: number;
      disbursementDate: Date;
      immediateDisbursement?: boolean;
    }
  ): string {
    const disbursementDate = data.disbursementDate instanceof Date ? data.disbursementDate : new Date(data.disbursementDate);
    if (data.immediateDisbursement) {
      return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Fund Disbursement Approved - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
          .highlight { background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .amount { font-size: 24px; font-weight: bold; color: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Fund Disbursement Approved</h1>
            <h2>NVCCZ Investment Platform</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            <div class="highlight">
              <h3>✅ Request approved</h3>
              <p>Your <strong>funding disbursement request</strong> has been <strong>approved</strong> by our finance team. The payment has been recorded and <strong>funds have been disbursed</strong> according to this tranche.</p>
            </div>
            <h3>Disbursement details</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business name:</strong> ${data.businessName}</li>
              <li><strong>Amount:</strong> <span class="amount">$${data.disbursementAmount.toLocaleString()}</span></li>
              <li><strong>Scheduled disbursement date:</strong> ${disbursementDate.toLocaleDateString()}</li>
            </ul>
            <p>You will receive a separate confirmation with your <strong>transaction reference</strong> and next steps.</p>
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    }
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Fund Disbursement Approved - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
          .highlight { background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .amount { font-size: 24px; font-weight: bold; color: #2563eb; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Fund Disbursement Approved</h1>
            <h2>NVCCZ Investment Platform</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <div class="highlight">
              <h3>✅ Disbursement Approved</h3>
              <p>We are pleased to inform you that your fund disbursement request has been approved and is now being processed.</p>
            </div>
            
            <h3>Disbursement Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Disbursement Amount:</strong> <span class="amount">$${data.disbursementAmount.toLocaleString()}</span></li>
              <li><strong>Scheduled Disbursement Date:</strong> ${disbursementDate.toLocaleDateString()}</li>
              <li><strong>Status:</strong> Approved - Processing</li>
            </ul>
            
            <h3>What Happens Next:</h3>
            <ul>
              <li>The disbursement has been approved and is now in the processing queue</li>
              <li>Our finance team will process the transfer according to the scheduled disbursement date</li>
              <li>You will receive another notification once the funds have been successfully transferred to your account</li>
              <li>Please ensure your bank account details are up to date in your profile</li>
            </ul>
            
            <p><strong>Important:</strong> Please note that the actual transfer may take a few business days to complete. You will receive a confirmation email with the transaction reference once the funds have been disbursed.</p>
            
            <p>If you have any questions about this disbursement or need to update your bank account information, please contact our investment team immediately.</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getDisbursementCompletedTemplate(data: EmailNotificationData & { disbursementAmount: number, transactionReference?: string }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Fund Disbursement Completed - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
          .highlight { background-color: #d1fae5; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .amount { font-size: 24px; font-weight: bold; color: #059669; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Fund Disbursement Completed</h1>
            <h2>NVCCZ Investment Platform</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <div class="highlight">
              <h3>✅ Disbursement Successfully Completed</h3>
              <p>Your funding disbursement request was <strong>approved</strong> by our finance team. Your fund disbursement is now <strong>complete</strong> and the funds have been <strong>disbursed</strong> (recorded for payment from our side).</p>
            </div>
            
            <h3>Disbursement Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Disbursement Amount:</strong> <span class="amount">$${data.disbursementAmount.toLocaleString()}</span></li>
              <li><strong>Transaction Reference:</strong> ${data.transactionReference || 'N/A'}</li>
              <li><strong>Disbursement Date:</strong> ${new Date().toLocaleDateString()}</li>
              <li><strong>Status:</strong> Completed</li>
            </ul>
            
            <h3>Next Steps:</h3>
            <ul>
              <li>Monitor your bank account for the disbursement</li>
              <li>Keep track of your investment milestones</li>
              <li>Maintain regular communication with our investment team</li>
              <li>Submit required reports as per your investment agreement</li>
            </ul>
            
            <p><strong>Important:</strong> Please ensure you use these funds according to your approved business plan and investment agreement. Regular reporting and milestone tracking will be required.</p>
            
            <p>If you have any questions about this disbursement or need assistance with your investment, please don't hesitate to contact our investment team.</p>
            
            <p>Congratulations on reaching this important milestone in your investment journey!</p>
            
            <p>Best regards,<br>
            <strong>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Send payslip email to employee
   */
  static async sendPayslipEmail(payslipData: any): Promise<void> {
    try {
      const subject = `Your Payslip - ${payslipData.payrollRun.payPeriod} - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const employeeName = `${payslipData.employee.user.firstName} ${payslipData.employee.user.lastName}`;
      const company = process.env.COMPANY_NAME_SHORT || "NVCCZ";
      const htmlContent = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222;">
        <p>Dear ${employeeName},</p>
        <p>Please find attached your payslip for <strong>${String(payslipData.payrollRun.payPeriod || "")}</strong>.</p>
        <p>If you have any questions, please contact the HR/Payroll team.</p>
        <p>Regards,<br><strong>${company}</strong></p>
      </body></html>`;
      
      const from = getFromAddress('payroll');
      const email = String(payslipData?.employee?.user?.email || "").trim();
      if (!email) {
        throw new Error("Cannot send payslip email: employee email is missing");
      }

      const pdfAttachment = payslipData?.pdfAttachment;

      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: [{ name: employeeName, address: email }],
        subject: subject,
        html: htmlContent,
        attachments: pdfAttachment
          ? [
              {
                filename: pdfAttachment.filename,
                content: pdfAttachment.content,
              },
            ]
          : undefined,
      });

      console.log(`Payslip email sent to ${email}`);
    } catch (error) {
      console.error("Error sending payslip email:", error);
      throw error;
    }
  }

  /**
   * Get payslip email template
   */
  private static getPayslipTemplate(data: any): string {
    const { employee, payrollRun, grossPay, totalDeductions, netPay, currency, companyName } = data;
    const employeeName = `${employee.user.firstName} ${employee.user.lastName}`;
    const currencySymbol = currency?.symbol || currency?.code || '$';

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payslip</title>
        <style>
          body {
            font-family: 'Arial', sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 700px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
          }
          .header h2 {
            margin: 10px 0 0 0;
            font-size: 18px;
            font-weight: normal;
          }
          .content {
            padding: 30px;
          }
          .payslip-info {
            margin-bottom: 30px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-bottom: 20px;
          }
          .info-item {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
          }
          .info-item strong {
            display: block;
            color: #667eea;
            margin-bottom: 5px;
            font-size: 12px;
            text-transform: uppercase;
          }
          .info-item span {
            font-size: 16px;
            color: #333;
          }
          .earnings-section, .deductions-section {
            margin-top: 30px;
          }
          .section-title {
            background-color: #667eea;
            color: #ffffff;
            padding: 10px 15px;
            border-radius: 5px;
            margin-bottom: 15px;
            font-weight: bold;
          }
          .summary-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
          }
          .summary-table td {
            padding: 10px;
            border-bottom: 1px solid #e0e0e0;
          }
          .summary-table td:first-child {
            font-weight: 500;
          }
          .summary-table td:last-child {
            text-align: right;
            font-weight: bold;
          }
          .total-row {
            background-color: #f8f9fa;
            font-size: 18px;
          }
          .net-pay-row {
            background-color: #667eea;
            color: #ffffff;
            font-size: 20px;
          }
          .amount {
            color: #667eea;
            font-weight: bold;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
          }
          @media only screen and (max-width: 600px) {
            .info-grid {
              grid-template-columns: 1fr;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💼 Payslip</h1>
            <h2>${payrollRun.payPeriod}</h2>
          </div>
          <div class="content">
            <div class="payslip-info">
              <h3>Employee Information</h3>
              <div class="info-grid">
                <div class="info-item">
                  <strong>Employee Name</strong>
                  <span>${employeeName}</span>
                </div>
                <div class="info-item">
                  <strong>Employee Number</strong>
                  <span>${employee.employeeNumber}</span>
                </div>
                <div class="info-item">
                  <strong>Email</strong>
                  <span>${employee.user.email}</span>
                </div>
                <div class="info-item">
                  <strong>Pay Period</strong>
                  <span>${payrollRun.payPeriod}</span>
                </div>
                <div class="info-item">
                  <strong>Payment Date</strong>
                  <span>${new Date(payrollRun.endDate).toLocaleDateString()}</span>
                </div>
                <div class="info-item">
                  <strong>Company</strong>
                  <span>${companyName}</span>
                </div>
              </div>
            </div>

            <div class="earnings-section">
              <div class="section-title">💰 Earnings</div>
              <table class="summary-table">
                <tr>
                  <td>Basic Salary</td>
                  <td>${currencySymbol}${employee.basicSalary.toLocaleString()}</td>
                </tr>
                <tr class="total-row">
                  <td>Gross Pay</td>
                  <td>${currencySymbol}${grossPay.toLocaleString()}</td>
                </tr>
              </table>
            </div>

            <div class="deductions-section">
              <div class="section-title">📉 Deductions</div>
              <table class="summary-table">
                <tr>
                  <td>Total Deductions</td>
                  <td>${currencySymbol}${totalDeductions.toLocaleString()}</td>
                </tr>
              </table>
            </div>

            <table class="summary-table" style="margin-top: 30px;">
              <tr class="net-pay-row">
                <td>Net Pay</td>
                <td>${currencySymbol}${netPay.toLocaleString()}</td>
              </tr>
            </table>

            <div style="margin-top: 30px; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 5px;">
              <p style="margin: 0;"><strong>📍 Bank Details:</strong></p>
              <p style="margin: 5px 0 0 0;">
                Bank: ${employee.bankName || 'Not provided'}<br>
                Account Number: ${employee.accountNumber || 'Not provided'}<br>
                Branch Code: ${employee.branchCode || 'Not provided'}
              </p>
            </div>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              <strong>Note:</strong> This is a computer-generated payslip. For any queries or concerns, please contact the HR department.
            </p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2026 ${companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Send event invitation email
   */
  static async sendEventInvitationEmail(data: any): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `You're Invited: ${data.eventTitle} - ${branding.companyName}`;
      const htmlContent = this.getEventInvitationTemplate(data, branding);
      
      const from = getFromAddress('events');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.guestName}" <${data.guestEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Event invitation email sent to ${data.guestEmail}`);
    } catch (error) {
      console.error("Error sending event invitation email:", error);
      throw error;
    }
  }

  /**
   * Send RSVP notification email to organizer
   */
  static async sendRSVPNotificationEmail(data: any): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `RSVP Update: ${data.eventTitle} - ${branding.companyName}`;
      const htmlContent = this.getRSVPNotificationTemplate(data, branding);
      
      const from = getFromAddress('events');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.organizerName}" <${data.organizerEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`RSVP notification email sent to ${data.organizerEmail}`);
    } catch (error) {
      console.error("Error sending RSVP notification email:", error);
      throw error;
    }
  }

  /**
   * Send budget approval email
   */
  static async sendBudgetApprovalEmail(data: any): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `Budget Approved: ${data.eventTitle} - ${branding.companyName}`;
      const htmlContent = this.getBudgetApprovalTemplate(data, branding);
      
      const from = getFromAddress('finance');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.organizerName}" <${data.organizerEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Budget approval email sent to ${data.organizerEmail}`);
    } catch (error) {
      console.error("Error sending budget approval email:", error);
      throw error;
    }
  }

  /**
   * Get event invitation email template
   */
  private static getEventInvitationTemplate(data: any, branding: EmailBranding): string {
    const eventDate = new Date(data.eventDate).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const extraHeadInner = `<style>
          .event-details {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .event-details h3 {
            margin-top: 0;
            color: #1e3a8a;
          }
          .rsvp-section {
            background-color: #e8f5e8;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: center;
          }
          .rsvp-button {
            display: inline-block;
            background-color: #28a745;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            margin: 10px 5px;
          }
          .rsvp-button.decline {
            background-color: #dc3545;
          }
          .rsvp-button.maybe {
            background-color: #ffc107;
            color: #333;
          }
        </style>`;

    const bodyInner = `
            <p>Dear ${data.guestName},</p>
            <p>You have been invited to attend an event organized by ${branding.companyName}.</p>
            <div class="event-details">
              <h3>📅 Event Details</h3>
              <p><strong>Event:</strong> ${data.eventTitle}</p>
              <p><strong>Date & Time:</strong> ${eventDate}</p>
              ${data.eventLocation ? `<p><strong>Location:</strong> ${data.eventLocation}</p>` : ""}
              ${data.rsvpDeadline ? `<p><strong>RSVP Deadline:</strong> ${new Date(data.rsvpDeadline).toLocaleDateString()}</p>` : ""}
            </div>
            <div class="rsvp-section">
              <h3>📝 Please RSVP</h3>
              <p>Click one of the buttons below to respond to this invitation:</p>
              <a href="${process.env.EVENTS_PORTAL_URL || "http://app.kyntaro.com"}/events/rsvp/${data.invitationToken}?status=accepted" class="rsvp-button">✅ Accept</a>
              <a href="${process.env.EVENTS_PORTAL_URL || "http://app.kyntaro.com"}/events/rsvp/${data.invitationToken}?status=declined" class="rsvp-button decline">❌ Decline</a>
              <a href="${process.env.EVENTS_PORTAL_URL || "http://app.kyntaro.com"}/events/rsvp/${data.invitationToken}?status=maybe" class="rsvp-button maybe">🤔 Maybe</a>
            </div>
            <p><strong>Note:</strong> This invitation is personalized for you. Please use the RSVP links above to respond.</p>
            <p>We look forward to seeing you at the event!</p>`;

    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `Event invitation — ${branding.companyName}`,
      preheader: `${data.eventTitle} — ${branding.companyName}`,
      emailHeading: "Event invitation",
      headerTagline: "Events",
      bodyInnerHtml: bodyInner,
      teamLabel: "Events Team",
      extraHeadInner,
    });
  }

  /**
   * Get RSVP notification email template
   */
  private static getRSVPNotificationTemplate(data: any, branding: EmailBranding): string {
    const statusEmoji = {
      ACCEPTED: "✅",
      DECLINED: "❌",
      MAYBE: "🤔",
    };

    const statusColor = {
      ACCEPTED: "#28a745",
      DECLINED: "#dc3545",
      MAYBE: "#ffc107",
    };

    const extraHeadInner = `<style>
          .rsvp-update {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid ${statusColor[data.rsvpStatus]};
          }
        </style>`;

    const bodyInner = `
            <p>Dear ${data.organizerName},</p>
            <p>You have received a new RSVP response for your event:</p>
            <div class="rsvp-update">
              <h3>${statusEmoji[data.rsvpStatus]} RSVP Response</h3>
              <p><strong>Event:</strong> ${data.eventTitle}</p>
              <p><strong>Guest:</strong> ${data.guestName}</p>
              <p><strong>Response:</strong> ${data.rsvpStatus}</p>
              ${data.rsvpNotes ? `<p><strong>Notes:</strong> ${data.rsvpNotes}</p>` : ""}
            </div>
            <p>You can view all RSVP responses and manage your event through the ${branding.companyName} platform.</p>`;

    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `RSVP update — ${branding.companyName}`,
      preheader: `${data.eventTitle} — ${branding.companyName}`,
      emailHeading: "RSVP update",
      headerTagline: "Events",
      bodyInnerHtml: bodyInner,
      teamLabel: "Events Team",
      extraHeadInner,
    });
  }

  /**
   * Get budget approval email template
   */
  private static getBudgetApprovalTemplate(data: any, branding: EmailBranding): string {
    const extraHeadInner = `<style>
          .approval-details {
            background-color: #e8f5e8;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #28a745;
          }
        </style>`;

    const bodyInner = `
            <p>Dear ${data.organizerName},</p>
            <p>Great news! Your event budget has been approved by the finance team.</p>
            <div class="approval-details">
              <h3>💰 Budget Approval Details</h3>
              <p><strong>Event:</strong> ${data.eventTitle}</p>
              <p><strong>Approved Budget:</strong> $${data.approvedBudget.toLocaleString()}</p>
              ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ""}
            </div>
            <p>You can now proceed with your event planning and start making necessary arrangements. Remember to keep all receipts and documentation for expense tracking.</p>
            <p>If you have any questions about the approved budget or need assistance with event planning, please don't hesitate to contact the finance team.</p>`;

    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `Budget approved — ${branding.companyName}`,
      preheader: `${data.eventTitle} — ${branding.companyName}`,
      emailHeading: "Budget approved",
      headerTagline: "Finance",
      bodyInnerHtml: bodyInner,
      teamLabel: "Finance Team",
      extraHeadInner,
    });
  }

  /**
   * Send RFQ (Request for Quote) to vendor
   */
  static async sendRFQToVendor(data: {
    vendorName: string;
    vendorEmail: string;
    rfqNumber: string;
    /** Per-vendor invitation token; used to build the submission link when public base URL env is set. */
    invitationToken: string;
    rfqDate: Date;
    title: string;
    description: string;
    items: Array<{
      itemName: string;
      description?: string;
      quantity: number;
      unit?: string;
      specifications?: any;
    }>;
    deliveryAddress?: string;
    expectedDeliveryDate?: Date;
    rfqDeadline?: Date;
    specialRequirements?: string;
    /** From RFQ create payload (not stored on procurement_rfqs row). */
    priority?: string;
    visibility?: string;
    requisitionNumber?: string;
    requisitionTitle?: string;
    companyName?: string;
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `Request for Quote ${data.rfqNumber} - ${branding.companyName}`;
      const htmlContent = this.getRFQTemplate(data, branding);
      
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.vendorName}" <${data.vendorEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`✅ RFQ ${data.rfqNumber} sent to ${data.vendorEmail}`);
    } catch (error) {
      console.error("❌ Error sending RFQ email:", error);
      throw error;
    }
  }

  /**
   * Notify an invited vendor of a staff-posted RFQ clarification (Q&A addendum).
   */
  static async sendRfqClarificationToVendor(data: {
    vendorName: string;
    vendorEmail: string;
    rfqNumber: string;
    rfqTitle: string;
    clarificationText: string;
    postedByName?: string;
    attachmentUrl?: string;
    invitationToken?: string;
    rfqDeadline?: Date;
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const esc = (v: unknown) => escapeHtmlForEmail(String(v ?? ""));
      const escBr = (v: unknown) => esc(v).replace(/\n/g, "<br>");

      const quotationSubmitUrl =
        data.invitationToken?.trim().length > 0
          ? buildVendorRfqResponsePageUrl({
              invitationToken: data.invitationToken.trim(),
              rfqNumber: data.rfqNumber,
              fallbackBaseUrl: branding.website,
            })
          : null;
      const quotationSubmitUrlAttr = quotationSubmitUrl ? escapeAttrForEmail(quotationSubmitUrl) : "";

      const deadlineLine = data.rfqDeadline
        ? esc(
            data.rfqDeadline.toLocaleString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })
          )
        : null;

      const attachmentBlock = data.attachmentUrl?.trim()
        ? `<p><strong>Attachment:</strong> <a href="${escapeAttrForEmail(data.attachmentUrl.trim())}">${esc(data.attachmentUrl.trim())}</a></p>`
        : "";

      const submitCta = quotationSubmitUrl
        ? `<p style="text-align:center;margin:24px 0;">
              <a href="${quotationSubmitUrlAttr}" style="display:inline-block;background-color:#4CAF50;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;font-weight:600;">View RFQ &amp; submit quotation</a>
            </p>
            <p style="font-size:13px;color:#64748b;word-break:break-all;">${esc(quotationSubmitUrl)}</p>`
        : `<p style="font-size:14px;color:#64748b;">Use the quotation link from your original RFQ invitation email to view this clarification and submit your quote.</p>`;

      const postedByBlock = data.postedByName
        ? `<p style="color:#475569;font-size:14px;">Posted by: <strong>${esc(data.postedByName)}</strong></p>`
        : "";
      const deadlineBlock = deadlineLine
        ? `<p style="font-size:14px;"><strong>Quote deadline:</strong> ${deadlineLine}</p>`
        : "";

      const bodyInnerHtml = `
            <p>Dear ${esc(data.vendorName)},</p>
            <p>Procurement has published a <strong>clarification</strong> for RFQ <strong>${esc(data.rfqNumber)}</strong> (${esc(data.rfqTitle)}). Please review it before submitting or updating your quotation.</p>
            ${postedByBlock}
            ${deadlineBlock}
            <div style="background-color:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;border-left:4px solid #2196F3;">
              <h3 style="margin-top:0;">Clarification</h3>
              <div style="font-size:15px;line-height:1.6;">${escBr(data.clarificationText)}</div>
            </div>
            ${attachmentBlock}
            ${submitCta}
            <p>If you have questions, reply to this email or contact our procurement team.</p>`;

      const htmlContent = EmailNotificationService.composeNewsletterTransactionalHtml({
        branding,
        pageTitle: `RFQ clarification ${data.rfqNumber}`,
        preheader: `Clarification for ${data.rfqNumber}`,
        emailHeading: `RFQ clarification — ${data.rfqNumber}`,
        headerTagline: "Procurement",
        bodyInnerHtml,
        teamLabel: "Procurement Team",
      });

      const subject = `RFQ clarification ${data.rfqNumber} — ${branding.companyName}`;
      const from = getFromAddress("procurement");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.vendorName}" <${data.vendorEmail}>`,
        subject,
        html: htmlContent,
      });

      console.log(`✅ RFQ clarification ${data.rfqNumber} sent to ${data.vendorEmail}`);
    } catch (error) {
      console.error("❌ Error sending RFQ clarification email:", error);
      throw error;
    }
  }

  /**
   * High-priority alert when vendor IBAN or account number changes (fraud-prevention UAT).
   */
  static async sendVendorBankCriticalChangeAlert(data: {
    vendorName: string;
    vendorId: string;
    bankId: string;
    actorUserId: string;
    changedFields?: string[];
  }): Promise<void> {
    const { prisma } = await import("../utils/database");
    const toSet = new Set<string>();
    const envCfo = process.env.CFO_EMAIL;
    if (envCfo) {
      envCfo.split(/[,;]/).forEach((e) => {
        const t = e.trim();
        if (t) toSet.add(t);
      });
    }
    const cfos = await prisma.user.findMany({
      where: {
        OR: [
          { roleCode: "CFO" },
          { role: { name: "Chief Financial Officer" } },
        ],
      },
      select: { email: true },
    });
    for (const u of cfos) {
      if (u.email) toSet.add(u.email.trim());
    }
    if (toSet.size === 0) {
      console.warn(
        "[VendorBank] Critical change alert: no CFO_EMAIL and no users with CFO role (roleCode CFO or role name Chief Financial Officer)"
      );
      return;
    }
    const actor = await prisma.user.findUnique({
      where: { id: data.actorUserId },
      select: { firstName: true, lastName: true, email: true },
    });
    const actorLabel = actor
      ? `${actor.firstName || ""} ${actor.lastName || ""} (${actor.email || data.actorUserId})`.trim()
      : data.actorUserId;
    const fieldsLine =
      data.changedFields && data.changedFields.length
        ? `<li><strong>Fields changed:</strong> ${data.changedFields.join(", ")}</li>`
        : "";
    const subject = `[HIGH] Vendor banking details changed — ${data.vendorName}`;
    const html = `
      <p>A vendor <strong>account number</strong> and/or <strong>IBAN</strong> was modified.</p>
      <ul>
        <li><strong>Vendor:</strong> ${data.vendorName} (${data.vendorId})</li>
        <li><strong>Vendor bank record:</strong> ${data.bankId}</li>
        ${fieldsLine}
        <li><strong>Changed by:</strong> ${actorLabel}</li>
        <li><strong>Time:</strong> ${new Date().toISOString()}</li>
      </ul>
      <p>Review audit logs for entity type <code>VendorBank</code> (filter by this bank id or vendor id) if this change was not expected.</p>
    `;
    const from = getFromAddress("procurement");
    for (const to of toSet) {
      try {
        await emailTransport.sendMail({
          from: `"${from.name}" <${from.address}>`,
          to,
          subject,
          html,
        });
      } catch (err) {
        console.error("[VendorBank] CFO critical-change email failed for", to, err);
      }
    }
  }

  /**
   * Send quotation accepted email to vendor
   */
  static async sendQuotationAcceptedEmail(data: {
    vendorName: string;
    vendorEmail: string;
    quotationNumber: string;
    quotationAmount: number;
    currencyCode: string;
    reviewNotes?: string;
    companyName?: string;
    rfqNumber?: string;
    /** Optional PDF copy of the quotation with ACCEPTED watermark. */
    pdfAttachment?: { filename: string; content: Buffer };
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `Quotation Accepted - ${data.quotationNumber}`;
      const htmlContent = this.getQuotationAcceptedTemplate(data, branding);
      
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.vendorName}" <${data.vendorEmail}>`,
        subject: subject,
        html: htmlContent,
        attachments: data.pdfAttachment
          ? [{ filename: data.pdfAttachment.filename, content: data.pdfAttachment.content }]
          : undefined,
      });

      console.log(`✅ Quotation accepted email sent to ${data.vendorEmail}`);
    } catch (error) {
      console.error("❌ Error sending quotation accepted email:", error);
      throw error;
    }
  }

  /**
   * Send quotation rejected email to vendor
   */
  static async sendQuotationRejectedEmail(data: {
    vendorName: string;
    vendorEmail: string;
    quotationNumber: string;
    quotationAmount: number;
    currencyCode: string;
    rejectionReason?: string;
    companyName?: string;
    /** Optional PDF copy of the quotation with REJECTED watermark. */
    pdfAttachment?: { filename: string; content: Buffer };
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `Quotation Status Update - ${data.quotationNumber}`;
      const htmlContent = this.getQuotationRejectedTemplate(data, branding);
      
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.vendorName}" <${data.vendorEmail}>`,
        subject: subject,
        html: htmlContent,
        attachments: data.pdfAttachment
          ? [{ filename: data.pdfAttachment.filename, content: data.pdfAttachment.content }]
          : undefined,
      });

      console.log(`✅ Quotation rejected email sent to ${data.vendorEmail}`);
    } catch (error) {
      console.error("❌ Error sending quotation rejected email:", error);
      throw error;
    }
  }

  /**
   * Send invoice approved notification to vendor
   */
  static async sendInvoiceApprovedEmail(data: {
    vendorName: string;
    vendorEmail: string;
    invoiceNumber: string;
    invoiceAmount: number;
    currencyCode: string;
    approvedDate: Date;
    dueDate?: Date;
    companyName?: string;
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `Invoice Approved - ${data.invoiceNumber}`;
      const htmlContent = this.getInvoiceApprovedTemplate(data, branding);
      
      const from = getFromAddress('finance');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.vendorName}" <${data.vendorEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`✅ Invoice approved email sent to ${data.vendorEmail}`);
    } catch (error) {
      console.error("❌ Error sending invoice approved email:", error);
      throw error;
    }
  }

  /**
   * Send invoice paid notification to vendor
   */
  static async sendInvoicePaidEmail(data: {
    vendorName: string;
    vendorEmail: string;
    invoiceNumber: string;
    invoiceAmount: number;
    currencyCode: string;
    paymentDate: Date;
    paymentReference?: string;
    paymentMethod: string;
    isPartialPayment?: boolean;
    remainingBalance?: number;
    companyName?: string;
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `Payment Confirmation - Invoice ${data.invoiceNumber}`;
      const htmlContent = this.getInvoicePaidTemplate(data, branding);
      
      const from = getFromAddress('finance');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.vendorName}" <${data.vendorEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`✅ Invoice paid email sent to ${data.vendorEmail}`);
    } catch (error) {
      console.error("❌ Error sending invoice paid email:", error);
      throw error;
    }
  }

  /**
   * Send requisition created/submitted notification to department HEAD
   */
  static async sendRequisitionSubmittedToHead(data: {
    headName: string;
    headEmail: string;
    requisitionNumber: string;
    title: string;
    department: string;
    submittedByName: string;
    submittedByEmail: string;
    totalAmount: number;
    itemCount: number;
    status: string;
    companyName?: string;
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `New Requisition Requires Approval - ${data.requisitionNumber}`;
      const htmlContent = this.getRequisitionSubmittedToHeadTemplate(data, branding);
      
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.headName}" <${data.headEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`✅ Requisition submitted notification sent to ${data.headEmail}`);
    } catch (error) {
      console.error("❌ Error sending requisition submitted email:", error);
      throw error;
    }
  }

  /**
   * Suite 02: investee drawdown PR submitted → notify VC procurement desk (pending VC executive review).
   */
  static async sendInvesteeDrawdownSubmittedToProcurementDesk(data: {
    recipients: { email: string; name: string }[];
    portfolioCompanyName: string;
    requisitionNumber: string;
    title: string;
    drawdownAmount: string;
    submittedByName: string;
    useOfFundsDocumentUrl: string | null;
  }): Promise<void> {
    try {
      if (!data.recipients.length) {
        console.warn(
          "[Suite 02] sendInvesteeDrawdownSubmittedToProcurementDesk: no recipients; set PROCUREMENT_INVESTEE_NOTIFY_EMAILS or assign Procurement users."
        );
        return;
      }
      const esc = (s: string) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const subSafe = String(data.requisitionNumber).replace(/[\r\n]/g, " ");
      const subject = `Investee drawdown PR — Pending VC review — ${subSafe}`;
      const branding = await getEmailBrandingCached();
      const docNote =
        data.useOfFundsDocumentUrl && String(data.useOfFundsDocumentUrl).trim() !== ""
          ? `<p>A <strong>use of funds / business case</strong> document was included with this submission.</p>`
          : "";
      const bodyInner = `
        <p>A purchase requisition was submitted for <strong>VC executive review</strong> (Suite 02).</p>
        <ul>
          <li><strong>Portfolio company:</strong> ${esc(data.portfolioCompanyName)}</li>
          <li><strong>Requisition:</strong> ${esc(data.requisitionNumber)} — ${esc(data.title)}</li>
          <li><strong>Drawdown amount:</strong> ${esc(data.drawdownAmount)}</li>
          <li><strong>Submitted by:</strong> ${esc(data.submittedByName)}</li>
        </ul>
        ${docNote}
        <p>Please route this through your usual VC executive review process (CFO approval gate).</p>`;
      const htmlContent = EmailNotificationService.composeNewsletterTransactionalHtml({
        branding,
        pageTitle: `Investee drawdown PR — ${branding.companyName}`,
        preheader: `${subject} — ${branding.companyName}`,
        emailHeading: "Investee drawdown PR",
        headerTagline: "Procurement",
        bodyInnerHtml: bodyInner,
        teamLabel: "Procurement Team",
      });
      const from = getFromAddress("procurement");
      for (const r of data.recipients) {
        await emailTransport.sendMail({
          from: `"${from.name}" <${from.address}>`,
          to: `"${r.name}" <${r.email}>`,
          subject,
          html: htmlContent,
        });
        console.log(`✅ Suite 02 investee drawdown notification sent to ${r.email}`);
      }
    } catch (error) {
      console.error("❌ Error sending investee drawdown procurement notification:", error);
      throw error;
    }
  }

  /**
   * Send requisition approval notification to submitter
   * When `procurementStageType` is set (e.g. from the procurement approval workflow), copy and labels match PO / invoice / GRN.
   */
  static async sendRequisitionApprovedToSubmitter(data: {
    submitterName: string;
    submitterEmail: string;
    requisitionNumber: string;
    title: string;
    department: string;
    approvedByName: string;
    approvedByEmail: string;
    approvalComments?: string;
    companyName?: string;
    /** If omitted, treated as purchase requisition (legacy callers). */
    procurementStageType?: "PURCHASE_REQUISITION" | "PURCHASE_ORDER" | "INVOICE" | "GRN";
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const labels = EmailNotificationService.procurementApprovedSubmitterLabels(data.procurementStageType);
      const subject = `${labels.subjectPrefix} — ${data.requisitionNumber}`;
      const htmlContent = this.getRequisitionApprovedTemplate(data, branding);
      
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.submitterName}" <${data.submitterEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`✅ Requisition approved notification sent to ${data.submitterEmail}`);
    } catch (error) {
      console.error("❌ Error sending requisition approved email:", error);
      throw error;
    }
  }

  /**
   * Send requisition rejection notification to submitter
   * When `procurementStageType` is set, wording matches the entity (PO / invoice / GRN), same layout as approval-complete mail.
   */
  static async sendRequisitionRejectedToSubmitter(data: {
    submitterName: string;
    submitterEmail: string;
    requisitionNumber: string;
    title: string;
    department: string;
    rejectedByName: string;
    rejectedByEmail: string;
    rejectionReason?: string;
    companyName?: string;
    procurementStageType?: "PURCHASE_REQUISITION" | "PURCHASE_ORDER" | "INVOICE" | "GRN";
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const labels = EmailNotificationService.procurementRejectedSubmitterLabels(data.procurementStageType);
      const subject = `${labels.subjectPrefix} — ${data.requisitionNumber}`;
      const htmlContent = this.getRequisitionRejectedTemplate(data, branding);
      
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.submitterName}" <${data.submitterEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`✅ Requisition rejected notification sent to ${data.submitterEmail}`);
    } catch (error) {
      console.error("❌ Error sending requisition rejected email:", error);
      throw error;
    }
  }

  /**
   * Send approval step notification to next approver
   */
  static async sendApprovalStepNotification(data: {
    approverName: string;
    approverEmail: string;
    entityType: string;
    entityNumber: string;
    entityTitle: string;
    stepNumber: number;
    stepName: string;
    totalSteps: number;
    submittedByName: string;
    submittedByEmail: string;
    department: string;
    companyName?: string;
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();
      const subject = `Approval Required - ${data.entityType}: ${data.entityNumber}`;
      const htmlContent = this.getApprovalStepNotificationTemplate(data, branding);
      
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.approverName}" <${data.approverEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`✅ Approval step notification sent to ${data.approverEmail}`);
    } catch (error) {
      console.error("❌ Error sending approval step notification:", error);
      throw error;
    }
  }

  /**
   * Send Purchase Order to vendor
   */
  static async sendPurchaseOrderToVendor(data: {
    vendorName: string;
    vendorEmail: string;
    poNumber: string;
    poDate: Date;
    totalAmount: number;
    currency: string;
    items: Array<{
      itemName: string;
      description?: string;
      quantity: number;
      unit?: string;
      unitPrice: number;
      total: number;
    }>;
    deliveryAddress?: string;
    expectedDeliveryDate?: Date;
    paymentTerms?: string;
    notes?: string;
    companyName?: string;
    /** Suite 04: one-time POST link for vendor acknowledgement */
    vendorAckUrl?: string;
    verificationUrl?: string;
    /** Branded PO PDF (letterhead via `ProcurementPoPdfService`); required for vendor send. */
    pdfAttachment: { filename: string; content: Buffer };
    /** Escaped `href` for vendor invoice submission (signed portal token in query). */
    vendorInvoiceSubmitUrlEscaped?: string;
    /** Raw portal token (for plain-text URL in email body). */
    vendorInvoicePortalToken?: string;
    /** Present when PO is issued immediately after quotation acceptance. */
    quotationAcceptContext?: {
      quotationNumber: string;
      quotationAmount: number;
      currencyCode: string;
      reviewNotes?: string;
      rfqNumber?: string;
    };
  }): Promise<void> {
    try {
      if (!data.pdfAttachment?.content || !Buffer.isBuffer(data.pdfAttachment.content) || data.pdfAttachment.content.length === 0) {
        throw new Error("Purchase order email requires a non-empty PDF attachment");
      }

      const branding = await getEmailBrandingCached();
      const accepted = data.quotationAcceptContext;
      const subject = accepted
        ? `Quotation accepted — Purchase Order ${data.poNumber} — ${branding.companyName}`
        : `Purchase Order ${data.poNumber} - ${branding.companyName}`;
      const htmlContent = this.getPurchaseOrderTemplate(data, branding);
      
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.vendorName}" <${data.vendorEmail}>`,
        subject: subject,
        html: htmlContent,
        attachments: [
          {
            filename: data.pdfAttachment.filename,
            content: data.pdfAttachment.content,
            contentType: "application/pdf",
          },
        ],
      });

      console.log(`✅ Purchase Order ${data.poNumber} sent to ${data.vendorEmail}`);
    } catch (error) {
      console.error("❌ Error sending purchase order email:", error);
      throw error;
    }
  }

  /**
   * Generate RFQ email template
   */
  private static getRFQTemplate(data: {
    vendorName: string;
    vendorEmail: string;
    rfqNumber: string;
    invitationToken: string;
    rfqDate: Date;
    title: string;
    description: string;
    items: Array<{
      itemName: string;
      description?: string;
      quantity: number;
      unit?: string;
      specifications?: any;
    }>;
    deliveryAddress?: string;
    expectedDeliveryDate?: Date;
    rfqDeadline?: Date;
    specialRequirements?: string;
    priority?: string;
    visibility?: string;
    requisitionNumber?: string;
    requisitionTitle?: string;
    companyName?: string;
  }, branding: EmailBranding): string {
    const esc = (v: unknown) => escapeHtmlForEmail(String(v ?? ""));
    const escBr = (v: unknown) => esc(v).replace(/\n/g, "<br>");
    const notSpecified = '<span style="color:#64748b;">Not specified</span>';
    const cellOrNotSpecified = (v: unknown) => {
      const t = String(v ?? "").trim();
      return t ? escBr(t) : notSpecified;
    };

    const fmtLongDate = (d: Date) =>
      d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const fmtLongDateTime = (d: Date) =>
      d.toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });

    const formattedDate = fmtLongDate(data.rfqDate);
    const expectedDeliveryDisplay = data.expectedDeliveryDate
      ? esc(fmtLongDate(data.expectedDeliveryDate))
      : notSpecified;
    const deadlineFull = data.rfqDeadline ? esc(fmtLongDateTime(data.rfqDeadline)) : notSpecified;
    const deadlineShort = data.rfqDeadline ? esc(fmtLongDate(data.rfqDeadline)) : "As soon as possible";

    const visibilityLabel =
      data.visibility === "PUBLIC_LISTING"
        ? "Public listing"
        : data.visibility === "INVITED_ONLY"
          ? "Invited vendors only"
          : data.visibility
            ? esc(data.visibility)
            : notSpecified;

    const prRefRow =
      data.requisitionNumber || data.requisitionTitle
        ? `<tr>
                  <td>Purchase requisition</td>
                  <td>${data.requisitionNumber ? esc(data.requisitionNumber) : notSpecified}${
                    data.requisitionTitle
                      ? ` <span style="color:#475569;">— ${esc(data.requisitionTitle)}</span>`
                      : ""
                  }</td>
                </tr>`
        : "";

    const quotationSubmitUrl =
      data.invitationToken?.trim().length > 0
        ? buildVendorRfqResponsePageUrl({
            invitationToken: data.invitationToken.trim(),
            rfqNumber: data.rfqNumber,
            fallbackBaseUrl: branding.website,
          })
        : null;
    const quotationSubmitUrlAttr = quotationSubmitUrl ? escapeAttrForEmail(quotationSubmitUrl) : "";
    const quotationSubmitUrlText = quotationSubmitUrl ? esc(quotationSubmitUrl) : "";

    const extraHeadInner = `<style>
          .rfq-info {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .rfq-info table {
            width: 100%;
            border-collapse: collapse;
          }
          .rfq-info td {
            padding: 8px 0;
          }
          .rfq-info td:first-child {
            font-weight: 600;
            width: 40%;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .items-table th {
            background-color: #4CAF50;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
          }
          .items-table td {
            padding: 12px;
            border-bottom: 1px solid #dee2e6;
          }
          .items-table tr:hover {
            background-color: #f8f9fa;
          }
          .items-table .item-description {
            font-size: 0.9em;
            color: #666;
            margin-top: 4px;
          }
          .items-table .item-specs {
            font-size: 0.85em;
            color: #888;
            margin-top: 4px;
            font-style: italic;
          }
          .highlight-box {
            background-color: #fff3cd;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #ffc107;
          }
          .deadline-box {
            background-color: #ffebee;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #f44336;
            font-weight: 600;
          }
          .requirements {
            background-color: #e7f3ff;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #007bff;
          }
          .action-button {
            display: inline-block;
            background-color: #4CAF50;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            margin: 15px 0;
            font-weight: 600;
          }
          .instruction-list {
            background-color: #f0f8ff;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .instruction-list h3 {
            color: #2196F3;
            margin-top: 0;
          }
          .instruction-list ol {
            margin: 10px 0;
            padding-left: 20px;
          }
          .instruction-list li {
            margin: 8px 0;
          }
        </style>`;

    const bodyInner = `
            <p>Dear ${esc(data.vendorName)},</p>
            <p>We are seeking competitive quotes for the following items/services. Please review the details below and provide your best pricing.</p>
            <div class="rfq-info">
              <h3 style="margin-top: 0;">📋 RFQ summary</h3>
              <table>
                <tr>
                  <td>RFQ number</td>
                  <td><strong>${esc(data.rfqNumber)}</strong></td>
                </tr>
                <tr>
                  <td>Issue date</td>
                  <td>${esc(formattedDate)}</td>
                </tr>
                <tr>
                  <td>Title</td>
                  <td><strong>${esc(data.title)}</strong></td>
                </tr>
                <tr>
                  <td>Priority</td>
                  <td>${data.priority ? esc(data.priority) : notSpecified}</td>
                </tr>
                <tr>
                  <td>Visibility</td>
                  <td>${visibilityLabel}</td>
                </tr>
                ${prRefRow}
                <tr>
                  <td>Quote submission deadline</td>
                  <td><strong>${deadlineFull}</strong></td>
                </tr>
                <tr>
                  <td>Expected delivery</td>
                  <td>${expectedDeliveryDisplay}</td>
                </tr>
                <tr>
                  <td>Delivery address</td>
                  <td>${cellOrNotSpecified(data.deliveryAddress)}</td>
                </tr>
                <tr>
                  <td>Special requirements</td>
                  <td>${cellOrNotSpecified(data.specialRequirements)}</td>
                </tr>
              </table>
            </div>
            ${data.description ? `
            <div>
              <h3>📝 Description</h3>
              <p>${escBr(data.description)}</p>
            </div>
            ` : ""}
            <div class="deadline-box">
              ⏰ <strong>Quote submission deadline:</strong> ${deadlineFull}
            </div>
            <h3>📦 Items / services required</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 40%;">Item / service</th>
                  <th style="text-align: right;">Quantity</th>
                  <th style="text-align: right;">Unit</th>
                </tr>
              </thead>
              <tbody>
                ${data.items
                  .map(
                    (item) => `
                  <tr>
                    <td>
                      <strong>${esc(item.itemName)}</strong>
                      ${item.description ? `<div class="item-description">${esc(String(item.description))}</div>` : ""}
                      ${item.specifications != null ? `<div class="item-specs">Specs: ${esc(JSON.stringify(item.specifications))}</div>` : ""}
                    </td>
                    <td style="text-align: right;">${esc(item.quantity)}</td>
                    <td style="text-align: right;">${esc(item.unit || "unit")}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
            ${
              quotationSubmitUrl
                ? `<div style="text-align:center;margin:28px 0 8px;">
              <a href="${quotationSubmitUrlAttr}" class="action-button">Submit your quotation online</a>
              <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#64748b;margin-top:14px;max-width:520px;margin-left:auto;margin-right:auto;">
                Use this secure link for <strong>${esc(data.rfqNumber)}</strong>. If the button does not work, copy and paste the URL into your browser.
              </p>
              <p style="font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all;color:#475569;max-width:560px;margin:10px auto 0;text-align:left;">
                ${quotationSubmitUrlText}
              </p>
            </div>`
                : `<div class="highlight-box" style="border-left-color:#64748b;background-color:#f1f5f9;">
              <p style="margin:0;font-size:14px;line-height:1.5;">
                <strong>Online submission link</strong> could not be built (no public app base URL found).
                Set <code>VENDOR_PORTAL_BASE_URL</code> or <code>FRONTEND_URL</code>, include an <code>https://</code> origin in <code>CORS_ORIGINS</code>, or set <code>WEB_APP_URL</code> / <code>API_PUBLIC_BASE_URL</code> / company profile <strong>website</strong>. Path override: <code>VENDOR_RFQ_RESPONSE_PATH</code> (default <code>/vendor-quotations/rfq-respond</code>).
              </p>
            </div>`
            }
            <div class="instruction-list">
              <h3>📧 How to submit your quote</h3>
              <p>${
                quotationSubmitUrl
                  ? "Click the button above to open the quotation form, or reply to this email (or contact our procurement team using the details in the footer) and include the following:"
                  : "Please reply to this email (or contact our procurement team using the details in the footer) and include the following:"
              }</p>
              <ol>
                <li><strong>RFQ reference:</strong> ${esc(data.rfqNumber)}</li>
                <li><strong>Company name</strong> and <strong>tax / VAT number</strong></li>
                <li><strong>Contact person</strong> and <strong>phone number</strong></li>
                <li><strong>Unit price</strong> for each line item</li>
                <li><strong>Total price</strong> including all costs</li>
                <li><strong>VAT / tax</strong> amount (if applicable)</li>
                <li><strong>Delivery timeline</strong></li>
                <li><strong>Payment terms</strong> you require</li>
                <li><strong>Warranty / guarantee</strong> (if applicable)</li>
                <li><strong>Validity period</strong> of your quote</li>
                <li>Any <strong>additional notes</strong> or terms</li>
              </ol>
            </div>
            <div class="highlight-box">
              <h3 style="margin-top: 0;">💡 Quote format example</h3>
              <p><strong>Item 1:</strong> Office Rent - $5,000 per month<br>
              <strong>Item 2:</strong> Cleaning Services - $500 per month<br>
              <strong>Subtotal:</strong> $5,500<br>
              <strong>VAT:</strong> $852.50<br>
              <strong>Total:</strong> $6,352.50<br>
              <strong>Delivery:</strong> Immediate<br>
              <strong>Payment Terms:</strong> NET 30<br>
              <strong>Quote valid until:</strong> ${deadlineShort}</p>
            </div>
            <p><strong>Important notes:</strong></p>
            <ul>
              <li>All prices should be in <strong>USD</strong> or <strong>ZWL</strong> (please specify)</li>
              <li>Include any applicable taxes in your quote</li>
              <li>Specify delivery costs separately if applicable</li>
              <li>Attach any relevant product specifications or brochures</li>
              <li>Provide company registration details</li>
            </ul>
            <p>We appreciate your prompt response and look forward to receiving your competitive quote. If you have any questions about this RFQ, please don't hesitate to contact our procurement team.</p>`;

    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `RFQ ${data.rfqNumber} — ${branding.companyName}`,
      preheader: `${data.title} — ${branding.companyName}`,
      emailHeading: `RFQ ${data.rfqNumber}`,
      headerTagline: "Procurement",
      bodyInnerHtml: bodyInner,
      teamLabel: "Procurement Team",
      extraHeadInner,
    });
  }

  /**
   * Vendor / supplier block for quotation submission emails (requester + desk).
   */
  private static buildQuotationSubmittedVendorDetailsHtml(data: {
    companyName?: string | null;
    contactPerson?: string | null;
    vendorEmail?: string | null;
    taxEIN?: string | null;
    phoneNumber?: string | null;
    address?: string | null;
    paymentTerms?: string | null;
    deliveryTerms?: string | null;
    deliveryTime?: string | null;
  }): string {
    const row = (label: string, val?: string | null) => {
      const t = val != null ? String(val).trim() : "";
      if (!t) return "";
      const content = escapeHtmlForEmail(t).replace(/\n/g, "<br>");
      return `<tr><td style="width:38%;vertical-align:top;padding:6px 0;"><strong>${escapeHtmlForEmail(label)}</strong></td><td style="padding:6px 0;">${content}</td></tr>`;
    };
    const rows = [
      row("Company / legal name", data.companyName),
      row("Contact person", data.contactPerson),
      row("Email", data.vendorEmail),
      row("Tax / VAT number", data.taxEIN),
      row("Phone", data.phoneNumber),
      row("Address", data.address),
      row("Payment terms (this quote)", data.paymentTerms),
      row("Delivery terms", data.deliveryTerms),
      row("Delivery time", data.deliveryTime),
    ].join("");
    if (!rows.trim()) return "";
    return `<h3 style="margin-top:22px;">Vendor details</h3><table class="meta-table">${rows}</table>`;
  }

  /**
   * Generate notification template for new vendor quotation (sent to requester)
   */
  private static getQuotationSubmittedNotificationTemplate(data: {
    requesterName: string;
    rfqNumber: string;
    requisitionNumber?: string;
    requisitionTitle?: string;
    quotationNumber: string;
    vendorName: string;
    vendorEmail: string;
    companyName?: string | null;
    contactPerson?: string | null;
    taxEIN?: string | null;
    phoneNumber?: string | null;
    address?: string | null;
    paymentTerms?: string | null;
    deliveryTerms?: string | null;
    deliveryTime?: string | null;
    totalAmount: number;
    currencyCode: string;
    items: Array<{
      itemName: string;
      description?: string;
      quantity: number;
      unit?: string;
      unitPrice: number;
      totalPrice: number;
    }>;
    notes?: string;
  }, branding: EmailBranding): string {
    const currencySymbol = data.currencyCode === 'USD' ? '$' : data.currencyCode === 'ZWL' ? 'ZWL' : data.currencyCode;
    const extraHeadInner = `<style>
          .meta-table, .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          .meta-table td {
            padding: 6px 0;
          }
          .items-table th,
          .items-table td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
          }
          .items-table th {
            background: #0f766e;
            color: white;
            text-align: left;
          }
          .total-row td {
            font-weight: bold;
          }
          .note {
            background: #f0fdf4;
            border-left: 4px solid #22c55e;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
          }
        </style>`;
    const bodyInner = `
          <p>Dear ${data.requesterName},</p>
          <p><strong>${data.vendorName}</strong> has submitted a quotation for RFQ <strong>${data.rfqNumber}</strong>.</p>
          ${data.requisitionNumber ? `<p><strong>Requisition:</strong> ${data.requisitionNumber}${data.requisitionTitle ? ` – ${data.requisitionTitle}` : ''}</p>` : ''}
          <table class="meta-table">
            <tr>
              <td><strong>Quotation Number:</strong></td>
              <td>${data.quotationNumber}</td>
            </tr>
            <tr>
              <td><strong>Total Amount:</strong></td>
              <td>${currencySymbol}${data.totalAmount.toFixed(2)}</td>
            </tr>
          </table>
          ${EmailNotificationService.buildQuotationSubmittedVendorDetailsHtml({
            companyName: data.companyName,
            contactPerson: data.contactPerson,
            vendorEmail: data.vendorEmail,
            taxEIN: data.taxEIN,
            phoneNumber: data.phoneNumber,
            address: data.address,
            paymentTerms: data.paymentTerms,
            deliveryTerms: data.deliveryTerms,
            deliveryTime: data.deliveryTime,
          })}
          <h3>Items</h3>
          <table class="items-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit</th>
                <th style="text-align:right;">Unit Price</th>
                <th style="text-align:right;">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${data.items.map(item => `
                <tr>
                  <td>
                    <strong>${item.itemName}</strong>
                    ${item.description ? `<br><small>${item.description}</small>` : ''}
                  </td>
                  <td>${item.quantity}</td>
                  <td>${item.unit || 'unit'}</td>
                  <td style="text-align:right;">${currencySymbol}${item.unitPrice.toFixed(2)}</td>
                  <td style="text-align:right;">${currencySymbol}${item.totalPrice.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="4" style="text-align:right;">Total</td>
                <td style="text-align:right;">${currencySymbol}${data.totalAmount.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
          ${data.notes ? `<div class="note"><strong>Vendor notes:</strong> ${data.notes}</div>` : ''}
          <p style="margin-top: 20px;">Please review this quotation through your usual procurement channels.</p>`;
    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `New quotation received — ${branding.companyName}`,
      preheader: `${data.rfqNumber} — ${branding.companyName}`,
      emailHeading: "New quotation received",
      headerTagline: "Procurement",
      bodyInnerHtml: bodyInner,
      teamLabel: "Procurement Team",
      extraHeadInner,
    });
  }

  /** Desk / FYI copy of quotation submission (same facts as requester email, different greeting). */
  private static getQuotationSubmittedDeskCopyTemplate(
    data: {
      recipientName: string;
      rfqNumber: string;
      requisitionNumber?: string;
      requisitionTitle?: string;
      quotationNumber: string;
      vendorName: string;
      vendorEmail: string;
      companyName?: string | null;
      contactPerson?: string | null;
      taxEIN?: string | null;
      phoneNumber?: string | null;
      address?: string | null;
      paymentTerms?: string | null;
      deliveryTerms?: string | null;
      deliveryTime?: string | null;
      totalAmount: number;
      currencyCode: string;
      items: Array<{
        itemName: string;
        description?: string;
        quantity: number;
        unit?: string;
        unitPrice: number;
        totalPrice: number;
      }>;
      notes?: string;
    },
    branding: EmailBranding
  ): string {
    const currencySymbol =
      data.currencyCode === "USD" ? "$" : data.currencyCode === "ZWL" ? "ZWL" : data.currencyCode;
    const extraHeadInner = `<style>
          .meta-table, .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          .meta-table td {
            padding: 6px 0;
          }
          .items-table th,
          .items-table td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
          }
          .items-table th {
            background: #0f766e;
            color: white;
            text-align: left;
          }
          .total-row td {
            font-weight: bold;
          }
          .note {
            background: #f0fdf4;
            border-left: 4px solid #22c55e;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
          }
        </style>`;
    const bodyInner = `
            <p>Dear ${data.recipientName},</p>
            <p><strong>${data.vendorName}</strong> has submitted a quotation for RFQ <strong>${data.rfqNumber}</strong>.</p>
            ${data.requisitionNumber ? `<p><strong>Requisition:</strong> ${data.requisitionNumber}${data.requisitionTitle ? ` – ${data.requisitionTitle}` : ""}</p>` : ""}
            <table class="meta-table">
              <tr>
                <td><strong>Quotation number:</strong></td>
                <td>${data.quotationNumber}</td>
              </tr>
              <tr>
                <td><strong>Total amount:</strong></td>
                <td>${currencySymbol}${data.totalAmount.toFixed(2)}</td>
              </tr>
            </table>
            ${EmailNotificationService.buildQuotationSubmittedVendorDetailsHtml({
              companyName: data.companyName,
              contactPerson: data.contactPerson,
              vendorEmail: data.vendorEmail,
              taxEIN: data.taxEIN,
              phoneNumber: data.phoneNumber,
              address: data.address,
              paymentTerms: data.paymentTerms,
              deliveryTerms: data.deliveryTerms,
              deliveryTime: data.deliveryTime,
            })}
            <h3>Items</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th style="text-align:right;">Unit price</th>
                  <th style="text-align:right;">Line total</th>
                </tr>
              </thead>
              <tbody>
                ${data.items
                  .map(
                    (item) => `
                <tr>
                  <td>
                    <strong>${item.itemName}</strong>
                    ${item.description ? `<br><small>${item.description}</small>` : ""}
                  </td>
                  <td>${item.quantity}</td>
                  <td>${item.unit || "unit"}</td>
                  <td style="text-align:right;">${currencySymbol}${item.unitPrice.toFixed(2)}</td>
                  <td style="text-align:right;">${currencySymbol}${item.totalPrice.toFixed(2)}</td>
                </tr>
              `
                  )
                  .join("")}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td colspan="4" style="text-align:right;">Total</td>
                  <td style="text-align:right;">${currencySymbol}${data.totalAmount.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            ${data.notes ? `<div class="note"><strong>Vendor notes:</strong> ${data.notes}</div>` : ""}
            <p style="margin-top: 20px;">Please coordinate review through your usual procurement channels.</p>`;
    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `New quotation (desk copy) — ${branding.companyName}`,
      preheader: `${data.rfqNumber} — ${branding.companyName}`,
      emailHeading: "New quotation (desk copy)",
      headerTagline: "Procurement",
      bodyInnerHtml: bodyInner,
      teamLabel: "Procurement Team",
      extraHeadInner,
    });
  }

  /**
   * Generate Purchase Order email template
   */
  private static getPurchaseOrderTemplate(data: {
    vendorName: string;
    poNumber: string;
    poDate: Date;
    totalAmount: number;
    currency: string;
    items: Array<{
      itemName: string;
      description?: string;
      quantity: number;
      unit?: string;
      unitPrice: number;
      total: number;
    }>;
    deliveryAddress?: string;
    expectedDeliveryDate?: Date;
    paymentTerms?: string;
    notes?: string;
    companyName?: string;
    vendorAckUrl?: string;
    verificationUrl?: string;
    vendorInvoiceSubmitUrlEscaped?: string;
    vendorInvoicePortalToken?: string;
    quotationAcceptContext?: {
      quotationNumber: string;
      quotationAmount: number;
      currencyCode: string;
      reviewNotes?: string;
      rfqNumber?: string;
    };
  }, branding: EmailBranding): string {
    const esc = (v: unknown) => escapeHtmlForEmail(String(v ?? ""));
    const escBr = (v: unknown) => esc(v).replace(/\n/g, "<br>");
    const accepted = data.quotationAcceptContext;
    const currencySymbol = data.currency === 'USD' ? '$' : data.currency === 'ZWL' ? 'ZWL' : data.currency;
    const formattedDate = data.poDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    const expectedDelivery = data.expectedDeliveryDate 
      ? data.expectedDeliveryDate.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : 'To be confirmed';

    const extraHeadInner = `<style>
          .po-info {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .po-info table {
            width: 100%;
            border-collapse: collapse;
          }
          .po-info td {
            padding: 8px 0;
          }
          .po-info td:first-child {
            font-weight: 600;
            width: 40%;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .items-table th {
            background-color: #1e3a8a;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
          }
          .items-table td {
            padding: 12px;
            border-bottom: 1px solid #dee2e6;
          }
          .items-table tr:hover {
            background-color: #f8f9fa;
          }
          .items-table .item-description {
            font-size: 0.9em;
            color: #666;
            margin-top: 4px;
          }
          .total-row {
            background-color: #e8f5e8;
            font-weight: bold;
            font-size: 1.1em;
          }
          .delivery-info {
            background-color: #fff3cd;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #ffc107;
          }
          .notes {
            background-color: #e7f3ff;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #007bff;
          }
          .action-button {
            display: inline-block;
            background-color: #28a745;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            margin: 15px 0;
            font-weight: 600;
          }
          .accept-box {
            background-color: #f0fdf4;
            border-left: 4px solid #10b981;
            padding: 16px 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .instruction-list {
            background-color: #f8fafc;
            padding: 16px 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #1e3a8a;
          }
          .highlight-box {
            background-color: #fffbeb;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #f59e0b;
          }
        </style>`;

    const invoiceSubmitUrl =
      data.vendorInvoicePortalToken?.trim().length > 0
        ? buildVendorPoInvoiceResponsePageUrl(data.vendorInvoicePortalToken.trim())
        : null;
    const invoiceSubmitUrlAttr = invoiceSubmitUrl ? escapeAttrForEmail(invoiceSubmitUrl) : "";
    const invoiceSubmitUrlText = invoiceSubmitUrl ? esc(invoiceSubmitUrl) : "";

    const introHtml = accepted
      ? `<p>Dear ${esc(data.vendorName)},</p>
            <p>We are pleased to inform you that your quotation <strong>${esc(accepted.quotationNumber)}</strong> has been <strong>accepted</strong>.</p>
            <div class="accept-box">
              <p style="margin:0 0 8px;"><strong>Accepted quotation:</strong> ${esc(accepted.quotationNumber)}</p>
              ${accepted.rfqNumber ? `<p style="margin:0 0 8px;"><strong>RFQ reference:</strong> ${esc(accepted.rfqNumber)}</p>` : ""}
              <p style="margin:0;"><strong>Quoted total:</strong> ${esc(accepted.currencyCode)} ${accepted.quotationAmount.toFixed(2)}</p>
            </div>
            ${accepted.reviewNotes ? `
            <div class="notes">
              <h3 style="margin-top: 0;">Review notes</h3>
              <p>${escBr(accepted.reviewNotes)}</p>
            </div>` : ""}
            <p>A formal <strong>purchase order (${esc(data.poNumber)})</strong> is attached as a PDF and summarised below. Please deliver against this PO and submit your tax invoice using the secure link in this email.</p>`
      : `<p>Dear ${esc(data.vendorName)},</p>
            <p>Please find below our purchase order for your review and processing. A PDF copy is attached to this email.</p>`;

    const bodyInner = `
            ${introHtml}
            <div class="po-info">
              <h3 style="margin-top: 0;">📋 Order Information</h3>
              <table>
                <tr>
                  <td>PO Number:</td>
                  <td><strong>${esc(data.poNumber)}</strong></td>
                </tr>
                <tr>
                  <td>Date:</td>
                  <td>${esc(formattedDate)}</td>
                </tr>
                <tr>
                  <td>Vendor:</td>
                  <td>${esc(data.vendorName)}</td>
                </tr>
                ${data.paymentTerms ? `
                <tr>
                  <td>Payment Terms:</td>
                  <td>${esc(data.paymentTerms)}</td>
                </tr>
                ` : ""}
              </table>
            </div>
            ${data.deliveryAddress ? `
            <div class="delivery-info">
              <h3 style="margin-top: 0;">🚚 Delivery Information</h3>
              <p><strong>Delivery Address:</strong><br>${escBr(data.deliveryAddress)}</p>
              <p><strong>Expected Delivery Date:</strong> ${expectedDelivery}</p>
            </div>
            ` : ""}
            <h3>📝 Order Items</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 40%;">Item</th>
                  <th style="text-align: right;">Quantity</th>
                  <th style="text-align: right;">Unit Price</th>
                  <th style="text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${data.items
                  .map(
                    (item) => `
                  <tr>
                    <td>
                      <strong>${item.itemName}</strong>
                      ${item.description ? `<div class="item-description">${item.description}</div>` : ""}
                    </td>
                    <td style="text-align: right;">${item.quantity}</td>
                    <td style="text-align: right;">${currencySymbol}${item.unitPrice.toFixed(2)}</td>
                    <td style="text-align: right;">${currencySymbol}${item.total.toFixed(2)}</td>
                  </tr>
                `
                  )
                  .join("")}
                <tr class="total-row">
                  <td colspan="3" style="text-align: right;">Total Amount:</td>
                  <td style="text-align: right;">${currencySymbol}${data.totalAmount.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            ${data.notes ? `
            <div class="notes">
              <h3 style="margin-top: 0;">💬 Additional Notes</h3>
              <p>${data.notes}</p>
            </div>
            ` : ""}
            <h3>Expected line items on your tax invoice</h3>
            <p>Your invoice must match this purchase order — same items, quantities, and unit prices unless we agreed otherwise in writing.</p>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 36%;">Item</th>
                  <th style="text-align: right;">Qty</th>
                  <th style="text-align: right;">Unit</th>
                  <th style="text-align: right;">Unit price</th>
                  <th style="text-align: right;">Line total</th>
                </tr>
              </thead>
              <tbody>
                ${data.items
                  .map(
                    (item) => `
                  <tr>
                    <td>
                      <strong>${esc(item.itemName)}</strong>
                      ${item.description ? `<div class="item-description">${esc(String(item.description))}</div>` : ""}
                    </td>
                    <td style="text-align: right;">${esc(item.quantity)}</td>
                    <td style="text-align: right;">${esc(item.unit || "unit")}</td>
                    <td style="text-align: right;">${currencySymbol}${item.unitPrice.toFixed(2)}</td>
                    <td style="text-align: right;">${currencySymbol}${item.total.toFixed(2)}</td>
                  </tr>
                `
                  )
                  .join("")}
              </tbody>
            </table>
            ${
              invoiceSubmitUrl
                ? `<div style="text-align:center;margin:28px 0 8px;">
              <a href="${invoiceSubmitUrlAttr || data.vendorInvoiceSubmitUrlEscaped}" class="action-button">Submit your invoice online</a>
              <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#64748b;margin-top:14px;max-width:520px;margin-left:auto;margin-right:auto;">
                Secure link for PO <strong>${esc(data.poNumber)}</strong>. The URL includes a signed token for your company and this order.
              </p>
              <p style="font-family:ui-monospace,Consolas,monospace;font-size:11px;word-break:break-all;color:#475569;max-width:560px;margin:10px auto 0;text-align:left;">
                ${invoiceSubmitUrlText}
              </p>
            </div>`
                : data.vendorInvoiceSubmitUrlEscaped
                  ? `<div style="text-align:center;margin:24px 0;">
              <a href="${data.vendorInvoiceSubmitUrlEscaped}" class="action-button">Submit your invoice online</a>
            </div>`
                  : `<div class="highlight-box" style="border-left-color:#64748b;background-color:#f1f5f9;">
              <p style="margin:0;font-size:14px;line-height:1.5;">
                <strong>Online invoice link</strong> could not be built. Set <code>VENDOR_PORTAL_BASE_URL</code> or <code>FRONTEND_URL</code>. Path: <code>VENDOR_PO_INVOICE_RESPONSE_PATH</code> (default <code>/vendor/invoice/submit</code>).
              </p>
            </div>`
            }
            <div class="instruction-list">
              <h3 style="margin-top:0;">How to submit your invoice</h3>
              <p>${
                invoiceSubmitUrl || data.vendorInvoiceSubmitUrlEscaped
                  ? "Use the button above, or reply to this email and include:"
                  : "Reply to this email or contact procurement and include:"
              }</p>
              <ol>
                <li><strong>PO reference:</strong> ${esc(data.poNumber)}</li>
                ${accepted ? `<li><strong>Quotation reference:</strong> ${esc(accepted.quotationNumber)}</li>` : ""}
                <li><strong>Company name</strong> and <strong>tax / VAT number</strong></li>
                <li><strong>Invoice number</strong> and <strong>invoice date</strong></li>
                <li>Line items matching the table above</li>
                <li><strong>Subtotal</strong>, <strong>VAT / tax</strong>, and <strong>total</strong> in <strong>${esc(data.currency)}</strong></li>
                <li>PDF or scan of your signed tax invoice (if uploading online)</li>
              </ol>
            </div>
            <p>Please confirm receipt of this purchase order and your estimated delivery timeline.</p>`;

    const pageTitle = accepted
      ? `Quotation accepted — PO ${data.poNumber} — ${branding.companyName}`
      : `Purchase Order ${data.poNumber} — ${branding.companyName}`;
    const emailHeading = accepted
      ? `Quotation accepted — purchase order issued`
      : `Purchase Order ${data.poNumber}`;

    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle,
      preheader: accepted
        ? `${accepted.quotationNumber} accepted — PO ${data.poNumber}`
        : `PO ${data.poNumber} — ${branding.companyName}`,
      emailHeading,
      headerTagline: "Procurement",
      bodyInnerHtml: bodyInner,
      teamLabel: "Procurement Team",
      extraHeadInner,
    });
  }

  /**
   * Quotation Accepted Email Template
   */
  private static getQuotationAcceptedTemplate(data: {
    vendorName: string;
    vendorEmail: string;
    quotationNumber: string;
    quotationAmount: number;
    currencyCode: string;
    reviewNotes?: string;
    companyName?: string;
    rfqNumber?: string;
  }, branding: EmailBranding): string {
    const extraHeadInner = `<style>
          .info-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .amount { font-size: 24px; font-weight: bold; color: #10b981; margin: 10px 0; }
          .notes { background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; }
          ul { padding-left: 20px; }
        </style>`;
    const bodyInner = `
          <p>Dear ${data.vendorName},</p>
          <p>Great news! We are pleased to inform you that your quotation has been <strong>accepted</strong>.</p>
          <div class="info-box">
            <p style="margin: 0;"><strong>📋 Quotation Number:</strong> ${data.quotationNumber}</p>
            <div class="amount">${data.currencyCode} ${data.quotationAmount.toFixed(2)}</div>
          </div>
          ${data.reviewNotes ? `
          <div class="notes">
            <h3 style="margin-top: 0;">💬 Review Notes</h3>
            <p>${data.reviewNotes}</p>
          </div>
          ` : ''}
          <p><strong>Next steps:</strong></p>
          <ul>
            <li>Finalize the preparation of the items or services you quoted</li>
            <li>Ensure delivery aligns with the timeframe you submitted</li>
            <li>Prepare your tax invoice referencing quotation <strong>${data.quotationNumber}</strong>; our team will advise how to submit it</li>
          </ul>
          <p>Thank you for your competitive pricing and professional service. We look forward to a successful transaction and continued business relationship.</p>
          <p>If you have any questions, please don't hesitate to contact our procurement team.</p>`;
    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `Quotation accepted — ${branding.companyName}`,
      preheader: `${data.quotationNumber} — ${branding.companyName}`,
      emailHeading: "Quotation accepted",
      headerTagline: "Procurement",
      bodyInnerHtml: bodyInner,
      teamLabel: "Procurement Team",
      extraHeadInner,
    });
  }

  /**
   * Quotation Rejected Email Template
   */
  private static getQuotationRejectedTemplate(data: {
    vendorName: string;
    quotationNumber: string;
    quotationAmount: number;
    currencyCode: string;
    rejectionReason?: string;
    companyName?: string;
  }, branding: EmailBranding): string {
    const extraHeadInner = `<style>
          .info-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .reason { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
          ul { padding-left: 20px; }
        </style>`;
    const bodyInner = `
          <p>Dear ${data.vendorName},</p>
          <p>Thank you for submitting your quotation for our recent request. After careful review and consideration, we regret to inform you that we will not be proceeding with your quotation at this time.</p>
          <div class="info-box">
            <p style="margin: 0;"><strong>📋 Quotation Number:</strong> ${data.quotationNumber}</p>
            <p style="margin: 10px 0 0 0;"><strong>Amount:</strong> ${data.currencyCode} ${data.quotationAmount.toFixed(2)}</p>
          </div>
          ${data.rejectionReason ? `
          <div class="reason">
            <h3 style="margin-top: 0;">📝 Reason</h3>
            <p>${data.rejectionReason}</p>
          </div>
          ` : ''}
          <p>Please note that this decision does not reflect negatively on your company or services. We receive multiple quotations and must make decisions based on various factors including:</p>
          <ul>
            <li>Pricing and budget constraints</li>
            <li>Delivery timelines</li>
            <li>Technical specifications</li>
            <li>Past performance and reliability</li>
            <li>Overall business requirements</li>
          </ul>
          <p>We value our relationship with you and hope to have the opportunity to work together on future projects. Please feel free to participate in our future RFQs.</p>
          <p>Thank you for your time and effort in preparing the quotation.</p>`;
    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `Quotation status update — ${branding.companyName}`,
      preheader: `${data.quotationNumber} — ${branding.companyName}`,
      emailHeading: "Quotation status update",
      headerTagline: "Procurement",
      bodyInnerHtml: bodyInner,
      teamLabel: "Procurement Team",
      extraHeadInner,
    });
  }

  /**
   * Invoice Approved Email Template
   */
  private static getInvoiceApprovedTemplate(data: {
    vendorName: string;
    invoiceNumber: string;
    invoiceAmount: number;
    currencyCode: string;
    approvedDate: Date;
    dueDate?: Date;
    companyName?: string;
  }, branding: EmailBranding): string {
    const formattedDate = data.approvedDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const dueDateFormatted = data.dueDate ? new Date(data.dueDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : null;

    const extraHeadInner = `<style>
          .amount { font-size: 28px; font-weight: bold; color: #10b981; margin: 15px 0; text-align: center; }
          .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
          .info-box { background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>`;
    const bodyInner = `
          <p>Dear ${data.vendorName},</p>
          <p>We are pleased to inform you that your invoice has been approved and is ready for payment processing.</p>
          <div class="amount">
            ${data.currencyCode} ${data.invoiceAmount.toFixed(2)}
          </div>
          <div class="details">
            <h3 style="margin-top: 0;">📋 Invoice Details</h3>
            <div class="detail-row">
              <span><strong>Invoice Number:</strong></span>
              <span>${data.invoiceNumber}</span>
            </div>
            <div class="detail-row">
              <span><strong>Amount:</strong></span>
              <span>${data.currencyCode} ${data.invoiceAmount.toFixed(2)}</span>
            </div>
            <div class="detail-row">
              <span><strong>Approved Date:</strong></span>
              <span>${formattedDate}</span>
            </div>
            ${dueDateFormatted ? `
            <div class="detail-row">
              <span><strong>Due Date:</strong></span>
              <span>${dueDateFormatted}</span>
            </div>
            ` : ''}
          </div>
          <div class="info-box">
            <p style="margin: 0;"><strong>ℹ️ Next Steps:</strong></p>
            <p style="margin: 5px 0 0 0;">Payment will be processed according to our payment terms. You will receive a separate payment confirmation email once the payment has been completed.</p>
          </div>
          <p>Thank you for your business. We appreciate your patience during the approval process.</p>`;
    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `Invoice approved — ${branding.companyName}`,
      preheader: `${data.invoiceNumber} — ${branding.companyName}`,
      emailHeading: "Invoice approved",
      headerTagline: "Finance",
      bodyInnerHtml: bodyInner,
      teamLabel: "Finance Team",
      extraHeadInner,
    });
  }

  /**
   * Invoice Paid Email Template
   */
  private static getInvoicePaidTemplate(data: {
    vendorName: string;
    invoiceNumber: string;
    invoiceAmount: number;
    currencyCode: string;
    paymentDate: Date;
    paymentReference?: string;
    paymentMethod: string;
    isPartialPayment?: boolean;
    remainingBalance?: number;
    companyName?: string;
  }, branding: EmailBranding): string {
    const formattedDate = data.paymentDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const extraHeadInner = `<style>
          .info-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .payment-amount { font-size: 28px; font-weight: bold; color: #3b82f6; margin: 15px 0; text-align: center; }
          .payment-details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .payment-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        </style>`;
    const bodyInner = `
          <p>Dear ${data.vendorName},</p>
          <p>We are pleased to confirm that payment for your invoice has been processed successfully.</p>
          <div class="payment-amount">
            ${data.currencyCode} ${data.invoiceAmount.toFixed(2)}
          </div>
          <div class="payment-details">
            <h3 style="margin-top: 0;">📋 Payment Details</h3>
            <div class="payment-row">
              <span><strong>Invoice Number:</strong></span>
              <span>${data.invoiceNumber}</span>
            </div>
            <div class="payment-row">
              <span><strong>Amount Paid:</strong></span>
              <span>${data.currencyCode} ${data.invoiceAmount.toFixed(2)}</span>
            </div>
            <div class="payment-row">
              <span><strong>Payment Date:</strong></span>
              <span>${formattedDate}</span>
            </div>
            <div class="payment-row">
              <span><strong>Payment Method:</strong></span>
              <span>${data.paymentMethod}</span>
            </div>
            ${data.paymentReference ? `
            <div class="payment-row">
              <span><strong>Reference Number:</strong></span>
              <span>${data.paymentReference}</span>
            </div>
            ` : ''}
            ${data.isPartialPayment && data.remainingBalance ? `
            <div class="payment-row" style="border-bottom: none;">
              <span><strong>Remaining Balance:</strong></span>
              <span style="color: #dc2626; font-weight: bold;">${data.currencyCode} ${data.remainingBalance.toFixed(2)}</span>
            </div>
            ` : ''}
          </div>
          ${data.isPartialPayment ? `
          <div class="info-box" style="background: #fef3c7; border-left-color: #f59e0b;">
            <p style="margin: 0;"><strong>⚠️ Partial Payment:</strong></p>
            <p style="margin: 5px 0 0 0;">This is a partial payment. A remaining balance of <strong>${data.currencyCode} ${data.remainingBalance?.toFixed(2) || '0.00'}</strong> is still pending.</p>
          </div>
          ` : ''}
          <div class="info-box">
            <p style="margin: 0;"><strong>ℹ️ Important:</strong></p>
            <p style="margin: 5px 0 0 0;">The payment should reflect in your account within 1-3 business days, depending on your bank's processing time.</p>
          </div>
          <p><strong>If you have any questions:</strong></p>
          <ul>
            <li>Please verify the payment against your records</li>
            <li>Contact our finance team if there are any discrepancies</li>
            <li>Keep this email for your records</li>
          </ul>
          <p>Thank you for your excellent service and cooperation. We look forward to continuing our business relationship.</p>`;
    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `Payment confirmation — ${branding.companyName}`,
      preheader: `${data.invoiceNumber} — ${branding.companyName}`,
      emailHeading: "Payment confirmation",
      headerTagline: "Finance",
      bodyInnerHtml: bodyInner,
      teamLabel: "Finance Team",
      extraHeadInner,
    });
  }

  /**
   * Get requisition submitted to head email template
   */
  private static getRequisitionSubmittedToHeadTemplate(data: {
    headName: string;
    requisitionNumber: string;
    title: string;
    department: string;
    submittedByName: string;
    submittedByEmail: string;
    totalAmount: number;
    itemCount: number;
    status: string;
    companyName?: string;
  }, branding: EmailBranding): string {
    const extraHeadInner = `<style>
          .info-box { background: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>`;
    const bodyInner = `
            <p>Dear ${data.headName},</p>
            <p>A new purchase requisition has been submitted and requires your approval:</p>
            <div class="info-box">
              <p style="margin: 0;"><strong>Requisition Number:</strong> ${data.requisitionNumber}</p>
              <p style="margin: 10px 0 0 0;"><strong>Title / summary:</strong> ${data.title}</p>
              <p style="margin: 10px 0 0 0;"><strong>Department:</strong> ${data.department}</p>
              <p style="margin: 10px 0 0 0;"><strong>Submitted By:</strong> ${data.submittedByName} (${data.submittedByEmail})</p>
              <p style="margin: 10px 0 0 0;"><strong>Items:</strong> ${data.itemCount}</p>
              <p style="margin: 10px 0 0 0;"><strong>Total Amount:</strong> ${data.totalAmount.toFixed(2)}</p>
              <p style="margin: 10px 0 0 0;"><strong>Status:</strong> ${data.status}</p>
            </div>
            <p>Please review and approve or reject this requisition through your usual internal channels.</p>`;
    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `Requisition approval required — ${branding.companyName}`,
      preheader: `${data.requisitionNumber} — ${branding.companyName}`,
      emailHeading: "Requisition approval required",
      headerTagline: "Procurement",
      bodyInnerHtml: bodyInner,
      teamLabel: "Procurement Team",
      extraHeadInner,
    });
  }

  /**
   * Copy + labels for submitter "approval complete" emails (workflow and direct PR approve).
   */
  private static procurementApprovedSubmitterLabels(
    procurementStageType?: "PURCHASE_REQUISITION" | "PURCHASE_ORDER" | "INVOICE" | "GRN"
  ) {
    const s = procurementStageType || "PURCHASE_REQUISITION";
    if (s === "PURCHASE_ORDER") {
      return {
        subjectPrefix: "Purchase order approved",
        headerTitle: "Purchase order approved",
        htmlTitle: "Purchase order approved",
        leadParagraph:
          "Great news! The approval workflow for your purchase order is complete:",
        referenceLabel: "PO number",
        showDepartment: false,
      };
    }
    if (s === "INVOICE") {
      return {
        subjectPrefix: "Procurement invoice approved",
        headerTitle: "Procurement invoice approved",
        htmlTitle: "Procurement invoice approved",
        leadParagraph:
          "Great news! The approval workflow for your procurement invoice is complete:",
        referenceLabel: "Invoice number",
        showDepartment: false,
      };
    }
    if (s === "GRN") {
      return {
        subjectPrefix: "GRN approved",
        headerTitle: "Goods received note approved",
        htmlTitle: "GRN approved",
        leadParagraph:
          "Great news! The approval workflow for your goods received note (GRN) is complete:",
        referenceLabel: "GRN number",
        showDepartment: false,
      };
    }
    return {
      subjectPrefix: "Requisition approved",
      headerTitle: "Requisition approved",
      htmlTitle: "Requisition approved",
      leadParagraph: "Great news! Your purchase requisition has been approved:",
      referenceLabel: "Requisition number",
      showDepartment: true,
    };
  }

  /**
   * Copy + labels for submitter rejection emails (workflow and direct PR reject).
   */
  private static procurementRejectedSubmitterLabels(
    procurementStageType?: "PURCHASE_REQUISITION" | "PURCHASE_ORDER" | "INVOICE" | "GRN"
  ) {
    const s = procurementStageType || "PURCHASE_REQUISITION";
    if (s === "PURCHASE_ORDER") {
      return {
        subjectPrefix: "Purchase order not approved",
        headerTitle: "Purchase order not approved",
        htmlTitle: "Purchase order not approved",
        leadParagraph: "Your purchase order has been rejected:",
        referenceLabel: "PO number",
        showDepartment: false,
      };
    }
    if (s === "INVOICE") {
      return {
        subjectPrefix: "Procurement invoice not approved",
        headerTitle: "Procurement invoice not approved",
        htmlTitle: "Procurement invoice not approved",
        leadParagraph: "Your procurement invoice has been rejected:",
        referenceLabel: "Invoice number",
        showDepartment: false,
      };
    }
    if (s === "GRN") {
      return {
        subjectPrefix: "GRN not approved",
        headerTitle: "Goods received note not approved",
        htmlTitle: "GRN not approved",
        leadParagraph: "Your goods received note (GRN) has been rejected:",
        referenceLabel: "GRN number",
        showDepartment: false,
      };
    }
    return {
      subjectPrefix: "Requisition rejected",
      headerTitle: "Requisition rejected",
      htmlTitle: "Requisition rejected",
      leadParagraph: "Your purchase requisition has been rejected:",
      referenceLabel: "Requisition number",
      showDepartment: true,
    };
  }

  /**
   * Get requisition approved email template
   */
  private static getRequisitionApprovedTemplate(
    data: {
      submitterName: string;
      requisitionNumber: string;
      title: string;
      department: string;
      approvedByName: string;
      approvedByEmail: string;
      approvalComments?: string;
      companyName?: string;
      procurementStageType?: "PURCHASE_REQUISITION" | "PURCHASE_ORDER" | "INVOICE" | "GRN";
    },
    branding: EmailBranding
  ): string {
    const L = EmailNotificationService.procurementApprovedSubmitterLabels(data.procurementStageType);
    const deptRow =
      L.showDepartment
        ? `<p style="margin: 10px 0 0 0;"><strong>Department:</strong> ${data.department}</p>`
        : "";
    const extraHeadInner = `<style>
          .info-box { background: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>`;
    const bodyInner = `
            <p>Dear ${data.submitterName},</p>
            <p>${L.leadParagraph}</p>
            <div class="info-box">
              <p style="margin: 0;"><strong>${L.referenceLabel}:</strong> ${data.requisitionNumber}</p>
              <p style="margin: 10px 0 0 0;"><strong>Title / summary:</strong> ${data.title}</p>
              ${deptRow}
              <p style="margin: 10px 0 0 0;"><strong>Approved By:</strong> ${data.approvedByName}${data.approvedByEmail ? ` (${data.approvedByEmail})` : ""}</p>
            </div>
            ${data.approvalComments ? `
            <div style="background: #f9fafb; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Approval Comments:</strong></p>
              <p style="margin: 10px 0 0 0;">${data.approvalComments}</p>
            </div>
            ` : ''}
            <p>You can now proceed with the next steps in the procurement process.</p>`;
    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `${L.headerTitle} — ${branding.companyName}`,
      preheader: `${data.requisitionNumber} — ${branding.companyName}`,
      emailHeading: L.headerTitle,
      headerTagline: "Procurement",
      bodyInnerHtml: bodyInner,
      teamLabel: "Procurement Team",
      extraHeadInner,
    });
  }

  /**
   * Get requisition rejected email template
   */
  private static getRequisitionRejectedTemplate(
    data: {
      submitterName: string;
      requisitionNumber: string;
      title: string;
      department: string;
      rejectedByName: string;
      rejectedByEmail: string;
      rejectionReason?: string;
      companyName?: string;
      procurementStageType?: "PURCHASE_REQUISITION" | "PURCHASE_ORDER" | "INVOICE" | "GRN";
    },
    branding: EmailBranding
  ): string {
    const L = EmailNotificationService.procurementRejectedSubmitterLabels(data.procurementStageType);
    const deptRow =
      L.showDepartment
        ? `<p style="margin: 10px 0 0 0;"><strong>Department:</strong> ${data.department}</p>`
        : "";
    const extraHeadInner = `<style>
          .info-box { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>`;
    const bodyInner = `
            <p>Dear ${data.submitterName},</p>
            <p>${L.leadParagraph}</p>
            <div class="info-box">
              <p style="margin: 0;"><strong>${L.referenceLabel}:</strong> ${data.requisitionNumber}</p>
              <p style="margin: 10px 0 0 0;"><strong>Title / summary:</strong> ${data.title}</p>
              ${deptRow}
              <p style="margin: 10px 0 0 0;"><strong>Rejected By:</strong> ${data.rejectedByName}${data.rejectedByEmail ? ` (${data.rejectedByEmail})` : ""}</p>
            </div>
            ${data.rejectionReason ? `
            <div style="background: #f9fafb; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Rejection Reason:</strong></p>
              <p style="margin: 10px 0 0 0;">${data.rejectionReason}</p>
            </div>
            ` : ''}
            <p>Please review the rejection reason and make necessary changes before resubmitting.</p>`;
    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `${L.headerTitle} — ${branding.companyName}`,
      preheader: `${data.requisitionNumber} — ${branding.companyName}`,
      emailHeading: L.headerTitle,
      headerTagline: "Procurement",
      bodyInnerHtml: bodyInner,
      teamLabel: "Procurement Team",
      extraHeadInner,
    });
  }

  /**
   * Get approval step notification email template
   */
  private static getApprovalStepNotificationTemplate(data: {
    approverName: string;
    entityType: string;
    entityNumber: string;
    entityTitle: string;
    stepNumber: number;
    stepName: string;
    totalSteps: number;
    submittedByName: string;
    submittedByEmail: string;
    department: string;
    companyName?: string;
  }, branding: EmailBranding): string {
    const extraHeadInner = `<style>
          .info-box { background: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; border-radius: 4px; }
        </style>`;
    const bodyInner = `
            <p>Dear ${data.approverName},</p>
            <p>An approval request is pending your review:</p>
            <div class="info-box">
              <p style="margin: 0;"><strong>Entity Type:</strong> ${data.entityType}</p>
              <p style="margin: 10px 0 0 0;"><strong>${data.entityType} Number:</strong> ${data.entityNumber}</p>
              <p style="margin: 10px 0 0 0;"><strong>Title / summary:</strong> ${data.entityTitle}</p>
              <p style="margin: 10px 0 0 0;"><strong>Department:</strong> ${data.department}</p>
              <p style="margin: 10px 0 0 0;"><strong>Submitted By:</strong> ${data.submittedByName} (${data.submittedByEmail})</p>
              <p style="margin: 10px 0 0 0;"><strong>Step:</strong> ${data.stepNumber} of ${data.totalSteps} - ${data.stepName}</p>
            </div>
            <p>Please review and approve or reject this request through your usual internal channels.</p>`;
    return EmailNotificationService.composeNewsletterTransactionalHtml({
      branding,
      pageTitle: `Approval required — ${branding.companyName}`,
      preheader: `${data.entityNumber} — ${branding.companyName}`,
      emailHeading: "Approval required",
      headerTagline: "Procurement",
      bodyInnerHtml: bodyInner,
      teamLabel: "Procurement Team",
      extraHeadInner,
    });
  }

  /**
   * Notify accountants when a recurring journal template posts a POSTED JE.
   * Recipients: ACCOUNTANT_NOTIFICATION_EMAILS (comma-separated) plus users whose role grants manage_accounting.
   */
  static async notifyAccountantsRecurringJournalPosted(data: {
    templateName: string;
    referenceNumber: string;
    journalEntryId: string;
    yearMonth: string;
  }): Promise<void> {
    const { prisma } = await import("../utils/database");
    const fromEnv =
      process.env.ACCOUNTANT_NOTIFICATION_EMAILS?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const users = await prisma.user.findMany({
      select: { email: true, role: { select: { permissions: true } } },
    });
    const fromRoles: string[] = [];
    for (const u of users) {
      const perms = u.role?.permissions;
      if (!Array.isArray(perms)) continue;
      const ok = perms.some(
        (p: { name?: string; value?: boolean }) => p?.name === "manage_accounting" && p?.value === true
      );
      if (ok && u.email) fromRoles.push(u.email);
    }
    const recipients = [...new Set([...fromEnv, ...fromRoles])];
    if (!recipients.length) {
      console.warn(
        "notifyAccountantsRecurringJournalPosted: no recipients (set ACCOUNTANT_NOTIFICATION_EMAILS or assign manage_accounting)"
      );
      return;
    }
    const subject = `Recurring journal posted: ${data.templateName} (${data.yearMonth})`;
    const html = `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #333;">
        <p>A scheduled recurring journal has been posted.</p>
        <ul>
          <li><strong>Template:</strong> ${data.templateName}</li>
          <li><strong>Period:</strong> ${data.yearMonth}</li>
          <li><strong>Reference:</strong> ${data.referenceNumber}</li>
          <li><strong>Journal entry ID:</strong> ${data.journalEntryId}</li>
        </ul>
        <p>${process.env.COMPANY_NAME_SHORT || "NVCCZ"} Accounting</p>
      </body></html>`;
    const from = getFromAddress("finance");
    await emailTransport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: recipients.join(", "),
      subject,
      html,
    });
    console.log(`Recurring journal notification sent to ${recipients.length} recipient(s)`);
  }

  /**
   * Capital call notice — subject per spec: `Capital Call Notice , {fundName} , {date}` (spaces around commas).
   * HTML body plus official notice PDF attachment (same content as GET …/notice).
   */
  static async sendCapitalCallNoticeEmail(data: {
    lpEmail: string;
    lpDisplayName: string;
    fundName: string;
    subjectDateLabel: string;
    html: string;
    pdfAttachment?: { filename: string; content: Buffer };
  }): Promise<void> {
    const subject = capitalCallNoticeEmailSubject(data.fundName, data.subjectDateLabel);
    const from = getFromAddress("investment");
    const email = String(data.lpEmail ?? "").trim();
    if (!email) {
      throw new Error("No recipients defined (LP email empty)");
    }
    const result = await emailTransport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: [{ name: data.lpDisplayName, address: email }],
      subject,
      html: data.html,
      attachments: data.pdfAttachment
        ? [
            {
              filename: data.pdfAttachment.filename,
              content: data.pdfAttachment.content,
            },
          ]
        : undefined,
    });
    // Helpful ops log for tracing delivery attempts (does not guarantee inbox delivery).
    console.log("sendCapitalCallNoticeEmail: queued", {
      to: email,
      subject,
      messageId: (result as any)?.messageId,
      accepted: (result as any)?.accepted,
      rejected: (result as any)?.rejected,
      response: (result as any)?.response
    });
  }

  /**
   * Broadcast a new internal company newsletter by email (staff only — callers should pre-filter recipients).
   */
  static async broadcastInternalNewsletterEmails(data: {
    recipients: Array<{ email: string; firstName?: string | null; lastName?: string | null }>;
    title: string;
    content: string;
    /** Stored URL — fetched server-side unless `coverImageFromUpload` is provided. */
    imageUrl?: string | null;
    /** Prefer buffer from multipart upload (`inline_upload`-style URLs are not fetchable). */
    coverImageFromUpload?: { content: Buffer | Uint8Array; contentType: string; filename?: string } | null;
    authorDisplayName: string;
  }): Promise<{
    attempted: number;
    succeeded: number;
    failed: Array<{ email: string; message: string }>;
  }> {
    const esc = (s: string) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const stripScripts = (html: string) =>
      String(html).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    const from = getFromAddress("platform");
    const trimBaseEnv = (s: string | undefined): string | null => {
      const t = String(s || "").trim();
      return t ? t.replace(/\/$/, "") : null;
    };
    const publicBase =
      trimBaseEnv(process.env.FRONTEND_URL) || trimBaseEnv(process.env.NEXT_PUBLIC_APP_URL) || null;
    /** Unwrap `<a>` tags so the message has no clickable URLs (text inside links is kept). */
    const stripAnchorTags = (html: string) =>
      String(html).replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, (_, inner: string) => inner);

    const toBuffer = (x: unknown): Buffer | null => {
      if (x == null) return null;
      if (Buffer.isBuffer(x)) return x;
      if (x instanceof Uint8Array) return Buffer.from(x);
      if (ArrayBuffer.isView(x)) {
        const v = x as ArrayBufferView;
        return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
      }
      return null;
    };

    /** Letterhead from accounting Company Profile (logo + address + contact lines). */
    let branding: EmailBranding;
    try {
      branding = await getEmailBrandingCached();
    } catch (err) {
      console.warn("[newsletter-email] getEmailBrandingCached failed, loading branding from DB:", err);
      try {
        branding = await loadEmailBrandingFromDb();
      } catch {
        branding = {
          companyName: process.env.COMPANY_NAME_SHORT || "NVCCZ",
          logoUrl: null,
          addressLines: [],
          contactEmail: null,
          contactPhone: null,
          website: null,
        };
      }
    }

    /**
     * Newsletter letterhead name comes from the active CompanyProfileAddress.label
     * (managed in Settings → Addresses), with CompanyProfile.legalName as the only
     * fallback. Never `process.env` — that was producing wrong names like "Niakazi".
     */
    let letterheadName = "";
    try {
      const [activeAddr, profile] = await Promise.all([
        CompanyProfileAddressService.getActive(),
        CompanyProfileService.getCompanyProfile(),
      ]);
      letterheadName =
        (activeAddr?.label && String(activeAddr.label).trim()) ||
        (profile?.legalName && String(profile.legalName).trim()) ||
        "";
    } catch {
      letterheadName = "";
    }
    if (!letterheadName) {
      letterheadName = branding.companyName || "Company";
    }
    const companyNameEsc = esc(letterheadName);

    /** Inline the company logo as a CID attachment so Gmail/Outlook render it without remote fetch. */
    let logoAttachment: NewsletterInlineAttachment | null = null;
    if (branding.logoUrl) {
      try {
        logoAttachment = await fetchLogoInlineAttachment(branding.logoUrl, {
          cid: "newsletter-logo@nvccz",
        });
      } catch {
        logoAttachment = null;
      }
    }

    /** Body HTML + optional `<img>` → CID (never block sends — skip on error). */
    let bodyProcessed = stripAnchorTags(stripScripts(data.content));
    let bodyInlineAttachments: NewsletterInlineAttachment[] = [];
    try {
      const bodyInlined = await inlineExternalImagesInNewsletterHtml(bodyProcessed, { publicBase });
      bodyProcessed = bodyInlined.html;
      bodyInlineAttachments = bodyInlined.attachments;
    } catch (bodyImgErr) {
      console.warn(
        "[newsletter-email] Skipping body image inlining (sending HTML as-is):",
        bodyImgErr instanceof Error ? bodyImgErr.message : bodyImgErr
      );
    }

    /** Cover attachment: prefer multipart buffer (multer may use Uint8Array, not Buffer). */
    let coverAttachment: NewsletterInlineAttachment | null = null;
    try {
      const uploadCover = data.coverImageFromUpload;
      const uploadBuf = toBuffer(uploadCover?.content);
      if (uploadBuf && uploadBuf.length > 0) {
        coverAttachment = coverImageInlineAttachment({
          content: uploadBuf,
          contentType: uploadCover?.contentType || "image/jpeg",
          filename: uploadCover?.filename
        });
      } else {
        coverAttachment = await fetchCoverInlineAttachment(String(data.imageUrl || "").trim());
      }
    } catch (coverErr) {
      console.warn(
        "[newsletter-email] Skipping cover inline image (email still sends):",
        coverErr instanceof Error ? coverErr.message : coverErr
      );
    }

    const mimeAttachments: NewsletterInlineAttachment[] = [
      ...(logoAttachment ? [logoAttachment] : []),
      ...(coverAttachment ? [coverAttachment] : []),
      ...bodyInlineAttachments
    ];

    const titleEsc = esc(data.title);
    const authorEsc = esc(data.authorDisplayName || "");
    const issueDateEsc = esc(
      new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" })
    );

    /** Branded letterhead bar (table-based for Outlook compatibility). */
    const headerBlock = `
      <tr>
        <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:24px 28px;color:#ffffff;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:0.2px;line-height:1.2;">${companyNameEsc}</div>
                <div style="margin-top:4px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">Company Newsletter</div>
                ${branding.addressLines.length
                  ? `<div style="margin-top:10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#cbd5f5;">${branding.addressLines
                      .map((l) => `<div>${esc(l)}</div>`)
                      .join("")}</div>`
                  : ""}
              </td>
              <td style="vertical-align:middle;text-align:right;width:84px;">
                ${logoAttachment
                  ? `<img src="cid:${logoAttachment.cid}" alt="${companyNameEsc}" width="64" height="64" style="width:64px;height:64px;border-radius:999px;object-fit:cover;display:inline-block;border:2px solid rgba(255,255,255,0.6);" />`
                  : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;

    const issueMetaBlock = `
      <tr>
        <td style="padding:18px 28px 0 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#64748b;letter-spacing:1.5px;text-transform:uppercase;">${issueDateEsc}${authorEsc ? ` &nbsp;·&nbsp; ${authorEsc}` : ""}</td>
            </tr>
          </table>
        </td>
      </tr>`;

    const titleBlock = `
      <tr>
        <td style="padding:6px 28px 14px 28px;">
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:#0f172a;font-weight:700;">${titleEsc}</h1>
          <div style="margin-top:14px;height:3px;width:48px;background:#1e3a8a;border-radius:2px;"></div>
        </td>
      </tr>`;

    const coverBlock = coverAttachment
      ? `<tr>
          <td style="padding:8px 28px 0 28px;">
            <img src="cid:${coverAttachment.cid}" alt="" width="544" style="display:block;width:100%;max-width:544px;height:auto;border-radius:8px;border:0;outline:none;text-decoration:none;" />
          </td>
        </tr>`
      : "";

    const bodyBlock = `
      <tr>
        <td style="padding:20px 28px 8px 28px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#1f2937;">
            ${bodyProcessed}
          </div>
        </td>
      </tr>`;

    /** Footer letterhead-style strip with contact info. */
    const contactPieces: string[] = [];
    if (branding.contactEmail) contactPieces.push(esc(branding.contactEmail));
    if (branding.contactPhone) contactPieces.push(`Tel: ${esc(branding.contactPhone)}`);
    if (branding.website) contactPieces.push(esc(branding.website.replace(/^https?:\/\//, "")));
    const contactHtml = contactPieces.length
      ? `<div style="margin-top:6px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#cbd5f5;">${contactPieces.join(" &nbsp;·&nbsp; ")}</div>`
      : "";
    const addressFooterHtml = branding.addressLines.length
      ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#cbd5f5;">${branding.addressLines
          .map((l) => esc(l))
          .join(" &nbsp;·&nbsp; ")}</div>`
      : "";
    const year = new Date().getFullYear();
    const footerBlock = `
      <tr>
        <td style="background:#0f172a;padding:22px 28px;color:#e2e8f0;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#ffffff;">${companyNameEsc}</div>
          ${addressFooterHtml}
          ${contactHtml}
          <div style="margin-top:12px;border-top:1px solid #1e293b;padding-top:10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#94a3b8;">
            © ${year} ${companyNameEsc}. All rights reserved. &nbsp;·&nbsp; You are receiving this because you are a member of ${companyNameEsc}. This is an automated message — please do not reply.
          </div>
        </td>
      </tr>`;

    const failed: Array<{ email: string; message: string }> = [];
    let succeeded = 0;

    for (const r of data.recipients) {
      const to = String(r.email ?? "")
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
        failed.push({ email: r.email || "(empty)", message: "Invalid email" });
        continue;
      }
      try {
        const displayName = [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || r.firstName || "User";

        const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${titleEsc}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;color:transparent;">${titleEsc} — ${companyNameEsc} newsletter</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eef2f7;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            ${headerBlock}
            ${issueMetaBlock}
            ${titleBlock}
            ${coverBlock}
            ${bodyBlock}
            ${footerBlock}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

        await emailTransport.sendMail({
          from: `"${from.name}" <${from.address}>`,
          to: { name: displayName, address: to },
          subject: `${data.title} — ${letterheadName}`,
          html,
          attachments: mimeAttachments.length ? mimeAttachments : undefined,
        });
        succeeded++;
      } catch (e: any) {
        failed.push({ email: r.email, message: e?.message || String(e) });
      }
    }

    return { attempted: data.recipients.length, succeeded, failed };
  }

  /**
   * Send a sales invoice (Accounting > Invoices) to the customer with a branded PDF attachment.
   * Mirrors `sendPayslipEmail` but is best-effort: callers should wrap in try/catch and
   * not roll back the underlying status change if email/PDF generation fails.
   */
  static async sendInvoiceToCustomer(data: {
    customerName: string;
    customerEmail: string;
    invoiceNumber: string;
    invoiceDate: Date | string;
    totalAmount: number;
    currencyCode: string;
    dueDate?: Date | string | null;
    description?: string | null;
    pdfAttachment?: { filename: string; content: Buffer };
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();

      const dateLabel = (() => {
        const dt = data.invoiceDate instanceof Date ? data.invoiceDate : new Date(data.invoiceDate);
        return Number.isNaN(dt.getTime())
          ? String(data.invoiceDate)
          : dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      })();
      const dueLabel = (() => {
        if (!data.dueDate) return null;
        const dt = data.dueDate instanceof Date ? data.dueDate : new Date(data.dueDate);
        return Number.isNaN(dt.getTime())
          ? String(data.dueDate)
          : dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      })();
      const totalLabel = `${data.currencyCode} ${Number(data.totalAmount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      const subject = `Invoice ${data.invoiceNumber} - ${branding.companyName}`;
      const emailHeading = `Invoice ${data.invoiceNumber}`;
      const bodyInner = `
        <p>Dear ${data.customerName || "Customer"},</p>
        <p>Please find attached your invoice <strong>${data.invoiceNumber}</strong> dated <strong>${dateLabel}</strong>${
        dueLabel ? `, due on <strong>${dueLabel}</strong>` : ""
      }.</p>
        <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:14px 18px;margin:18px 0;border-radius:4px;">
          <div><strong>Invoice number:</strong> ${data.invoiceNumber}</div>
          <div><strong>Invoice date:</strong> ${dateLabel}</div>
          ${dueLabel ? `<div><strong>Due date:</strong> ${dueLabel}</div>` : ""}
          <div><strong>Total due:</strong> ${totalLabel}</div>
        </div>
        ${
          data.description
            ? `<p style="color:#444;"><strong>Description:</strong> ${String(data.description)}</p>`
            : ""
        }
        <p>If you have any questions about this invoice please reply to this email or contact our finance team.</p>`;
      const htmlContent = EmailNotificationService.composeNewsletterTransactionalHtml({
        branding,
        pageTitle: `${emailHeading} — ${branding.companyName}`,
        preheader: `${subject} — ${branding.companyName}`,
        emailHeading,
        headerTagline: "Finance",
        bodyInnerHtml: bodyInner,
        teamLabel: "Accounts Receivable",
      });

      const from = getFromAddress("finance");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.customerName}" <${data.customerEmail}>`,
        subject,
        html: htmlContent,
        attachments: data.pdfAttachment
          ? [{ filename: data.pdfAttachment.filename, content: data.pdfAttachment.content }]
          : undefined,
      });

      console.log(`✅ Invoice ${data.invoiceNumber} emailed to ${data.customerEmail}`);
    } catch (error) {
      console.error("❌ Error sending invoice email:", error);
      throw error;
    }
  }

  /**
   * Notify the vendor that their submitted invoice has been approved by the buyer,
   * attaching a branded PDF copy. Best-effort.
   */
  static async sendProcurementInvoiceToVendor(data: {
    vendorName: string;
    vendorEmail: string;
    invoiceNumber: string;
    invoiceDate: Date | string;
    totalAmount: number;
    currencyCode: string;
    dueDate?: Date | string | null;
    poNumber?: string | null;
    pdfAttachment?: { filename: string; content: Buffer };
  }): Promise<void> {
    try {
      const branding = await getEmailBrandingCached();

      const dateLabel = (() => {
        const dt = data.invoiceDate instanceof Date ? data.invoiceDate : new Date(data.invoiceDate);
        return Number.isNaN(dt.getTime())
          ? String(data.invoiceDate)
          : dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      })();
      const dueLabel = (() => {
        if (!data.dueDate) return null;
        const dt = data.dueDate instanceof Date ? data.dueDate : new Date(data.dueDate);
        return Number.isNaN(dt.getTime())
          ? String(data.dueDate)
          : dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      })();
      const totalLabel = `${data.currencyCode} ${Number(data.totalAmount).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      const subject = `Invoice ${data.invoiceNumber} approved - ${branding.companyName}`;
      const emailHeading = `Invoice ${data.invoiceNumber} approved`;
      const bodyInner = `
        <p>Dear ${data.vendorName || "Vendor"},</p>
        <p>Your invoice <strong>${data.invoiceNumber}</strong> has been approved. Please find a copy attached for your records.</p>
        <div style="background:#ecfdf5;border-left:4px solid #16a34a;padding:14px 18px;margin:18px 0;border-radius:4px;">
          <div><strong>Invoice number:</strong> ${data.invoiceNumber}</div>
          <div><strong>Invoice date:</strong> ${dateLabel}</div>
          ${dueLabel ? `<div><strong>Due date:</strong> ${dueLabel}</div>` : ""}
          ${data.poNumber ? `<div><strong>Purchase order:</strong> ${data.poNumber}</div>` : ""}
          <div><strong>Total approved:</strong> ${totalLabel}</div>
        </div>
        <p>Payment will be processed in line with the agreed payment terms. You will receive a separate notification once payment is released.</p>`;
      const htmlContent = EmailNotificationService.composeNewsletterTransactionalHtml({
        branding,
        pageTitle: `${emailHeading} — ${branding.companyName}`,
        preheader: `${subject} — ${branding.companyName}`,
        emailHeading,
        headerTagline: "Procurement",
        bodyInnerHtml: bodyInner,
        teamLabel: "Procurement Team",
      });

      const from = getFromAddress("procurement");
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.vendorName}" <${data.vendorEmail}>`,
        subject,
        html: htmlContent,
        attachments: data.pdfAttachment
          ? [{ filename: data.pdfAttachment.filename, content: data.pdfAttachment.content }]
          : undefined,
      });

      console.log(`✅ Procurement invoice ${data.invoiceNumber} emailed to ${data.vendorEmail}`);
    } catch (error) {
      console.error("❌ Error sending procurement invoice email:", error);
      throw error;
    }
  }
}
