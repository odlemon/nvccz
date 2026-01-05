//@ts-nocheck
import { emailTransport, getFromAddress } from "../config/email.config";

export interface EmailNotificationData {
  applicantName: string;
  applicantEmail: string;
  businessName: string;
  applicationId: string;
  currentStage: string;
  additionalInfo?: any;
}

export class EmailNotificationService {
  /**
   * Send application received confirmation email
   */
  static async sendApplicationReceivedEmail(data: EmailNotificationData): Promise<void> {
    try {
      const subject = `Investment Application Received - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getApplicationReceivedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
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
      const subject = `Due Diligence Process Started - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getDueDiligenceStartedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
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
      const subject = `Due Diligence Process Completed - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getDueDiligenceCompletedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Due diligence completed email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending due diligence completed email:", error);
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
      const subject = `New Due Diligence Task Assigned - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getDueDiligenceTaskAssignedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.assigneeName}" <${data.assigneeEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Due diligence task assigned email sent to ${data.assigneeEmail}`);
    } catch (error) {
      console.error("Error sending due diligence task assigned email:", error);
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
      const subject = `Due Diligence Activity Update - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getDueDiligenceActivityUpdateTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.cioName}" <${data.cioEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Due diligence activity update email sent to ${data.cioEmail}`);
    } catch (error) {
      console.error("Error sending due diligence activity update email:", error);
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
      const subject = data.approved 
        ? `Due Diligence Activity Approved - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`
        : `Due Diligence Activity Rejected - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getDueDiligenceActivityApprovedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.assigneeName}" <${data.assigneeEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Due diligence activity ${data.approved ? 'approved' : 'rejected'} email sent to ${data.assigneeEmail}`);
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
      const subject = `Board Review Process Started - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getBoardReviewStartedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
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
    applicationId: string;
    voteUrl: string;
  }): Promise<void> {
    try {
      const subject = `Board Vote Requested - ${data.businessName}`;
      const htmlContent = this.getBoardVoteRequestTemplate(data);

      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.recipientName}" <${data.recipientEmail}>`,
        subject,
        html: htmlContent
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
      const subject = `Board Vote Results - ${data.businessName}`;
      const htmlContent = this.getBoardVoteResultsTemplate(data);

      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.recipientName}" <${data.recipientEmail}>`,
        subject,
        html: htmlContent
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
      const subject = `Quotation submitted for ${data.rfqNumber}`;
      const htmlContent = this.getQuotationSubmittedNotificationTemplate(data);

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
    const subject = `Financial Report Update Needed - ${data.companyName}`;
    const period = `${data.periodStart.toISOString().split('T')[0]} to ${data.periodEnd.toISOString().split('T')[0]}`;
    const html = `
      <p>Hello,</p>
      <p>Your <strong>${data.reportType.replace('_', ' ')}</strong> titled <strong>${data.title}</strong> requires updates.</p>
      <p>Reporting period: ${period}</p>
      ${data.comment ? `<p><strong>Reviewer Comment:</strong> ${data.comment}</p>` : '<p>Please review and resubmit the report.</p>'}
    `;

    const from = getFromAddress('investment');
    await emailTransport.sendMail({
      from: `"${from.name}" <${from.address}>`,
      to: `"${data.companyName}" <${data.recipientEmail}>`,
      subject,
      html: html
    });
  }

  /**
   * Send investment decision email
   */
  static async sendInvestmentDecisionEmail(data: EmailNotificationData): Promise<void> {
    try {
      const subject = `Investment Decision Update - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = EmailNotificationService.getInvestmentDecisionTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
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
      const subject = `Investment Implementation Started - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getInvestmentImplementationStartedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Investment implementation started email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending investment implementation started email:", error);
      throw error;
    }
  }

  /**
   * Send application shortlisted email
   */
  static async sendApplicationShortlistedEmail(data: EmailNotificationData): Promise<void> {
    try {
      const subject = `Application Shortlisted - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getApplicationShortlistedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
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

      const subject = `Application Update - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getApplicationBelowThresholdTemplate(data);
      
      console.log(`📧 Email content generated, sending via email service...`, {
        applicantEmail: data.applicantEmail,
        subject: subject,
        contentLength: htmlContent.length
      });

      const from = getFromAddress('investment');
      const result = await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`✅ Application below threshold email sent successfully to ${data.applicantEmail}`, {
        applicationId: data.applicationId,
        result: result
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
   * @deprecated Use sendApplicationBelowThresholdEmail instead
   * Send application rejected email (kept for backwards compatibility)
   */
  static async sendApplicationRejectedEmail(data: EmailNotificationData): Promise<void> {
    return this.sendApplicationBelowThresholdEmail(data);
  }

  /**
   * Send term sheet created email
   */
  static async sendTermSheetCreatedEmail(data: EmailNotificationData): Promise<void> {
    try {
      const subject = `Your Term Sheet is Ready for Review - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getTermSheetCreatedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
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
      const subject = `Term Sheet Approved - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getTermSheetApprovedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
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
      const subject = `Term Sheet Update - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getTermSheetRejectedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Term sheet rejected email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending term sheet rejected email:", error);
      throw error;
    }
  }

  /**
   * Send investment approved and account created email
   */
  static async sendInvestmentApprovedAccountCreatedEmail(data: EmailNotificationData & { tempPassword: string }): Promise<void> {
    try {
      const subject = `Investment Approved - Welcome to ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'} Portfolio!`;
      const htmlContent = this.getInvestmentApprovedAccountCreatedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Investment approved account created email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending investment approved account created email:", error);
      throw error;
    }
  }

  /**
   * Send portfolio company created email
   */
  static async sendPortfolioCompanyCreatedEmail(data: EmailNotificationData): Promise<void> {
    try {
      const subject = `Welcome to ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'} Portfolio - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getPortfolioCompanyCreatedTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
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
      const subject = `Application Status Update - ${data.currentStage} - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getStageUpdateTemplate(data);
      
      const from = getFromAddress('investment');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Stage update email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending stage update email:", error);
      throw error;
    }
  }

  // Email Templates

  private static getApplicationReceivedTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Application Received - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f8fafc; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
          .button { background-color: #1e40af; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${process.env.EMAIL_FROM_NAME_INVESTMENT || 'NVCCZ Investment Team'}</h1>
            <h2>Application Received</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>Thank you for submitting your investment application for <strong>${data.businessName}</strong>. We have successfully received your application and it is now under review.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Current Status:</strong> Application Received</li>
              <li><strong>Date Submitted:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <h3>What happens next?</h3>
            <p>Our investment team will review your application and supporting documents. You will receive updates at each stage of the process:</p>
            <ol>
              <li><strong>Initial Review</strong> - We'll assess your application completeness</li>
              <li><strong>Due Diligence</strong> - Detailed analysis of your business</li>
              <li><strong>Board Review</strong> - Investment committee evaluation</li>
              <li><strong>Final Decision</strong> - Investment approval or feedback</li>
            </ol>
            
            <p>We typically review applications within 2-3 weeks. You will receive email updates at each stage of the process.</p>
            
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
            <h2>Due Diligence Process Started</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>Great news! Your application for <strong>${data.businessName}</strong> has passed the initial review and we are now beginning the due diligence process.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Current Status:</strong> Under Due Diligence</li>
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
    applicationId: string;
    voteUrl: string;
  }): string {
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

            <p>A new board review vote is required for <strong>${data.businessName}</strong> (Application ID: <strong>${data.applicationId}</strong>).</p>

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

  /**
   * @deprecated Use getApplicationBelowThresholdTemplate instead
   */
  private static getApplicationRejectedTemplate(data: EmailNotificationData): string {
    return this.getApplicationBelowThresholdTemplate(data);
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
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Investment Approved - Welcome to ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'} Portfolio!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f0fdf4; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 14px; }
          .credentials { background-color: #e5f3ff; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .button { background-color: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Congratulations!</h1>
            <h2>Investment Approved - Welcome to ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'} Portfolio!</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p><strong>Excellent news!</strong> We are thrilled to inform you that your investment application for <strong>${data.businessName}</strong> has been approved by our board!</p>
            
            <h3>🎯 What happens next?</h3>
            <p>We have created your company account and you can now access the ${process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} platform to:</p>
            <ul>
              <li>View and sign your term sheet</li>
              <li>Access your company dashboard</li>
              <li>Manage your portfolio company profile</li>
              <li>Track your investment progress</li>
            </ul>
            
            <div class="credentials">
              <h3>🔐 Your Login Credentials</h3>
              <p><strong>Email:</strong> ${data.applicantEmail}</p>
              <p><strong>Temporary Password:</strong> ${data.tempPassword}</p>
              <p><strong>Login URL:</strong> <a href="${process.env.FRONTEND_URL || 'http://app.kyntaro.com'}/login" target="_blank">${process.env.FRONTEND_URL || 'http://app.kyntaro.com'}/login</a></p>
            </div>
            
            <h3>⚠️ Important Security Note</h3>
            <p>Please change your password immediately after your first login for security purposes.</p>
            
            <h3>📋 Next Steps</h3>
            <ol>
              <li>Log in to your account using the credentials above</li>
              <li>Change your password to something secure</li>
              <li>Complete your company profile</li>
              <li>Review and sign your term sheet</li>
            </ol>
            
            <p>Welcome to the ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'} family! We're excited to support your growth and success.</p>
            
            <p>If you have any questions or need assistance, please don't hesitate to contact our team.</p>
            
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
   * Send disbursement completed email
   */
  static async sendDisbursementCompletedEmail(data: EmailNotificationData & { disbursementAmount: number, transactionReference?: string }): Promise<void> {
    try {
      const subject = `Fund Disbursement Completed - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlBody = this.getDisbursementCompletedTemplate(data);

      const from = getFromAddress('platform');
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${data.applicantName}" <${data.applicantEmail}>`,
        subject,
        html: htmlBody
      });

      console.log("Disbursement completed email sent successfully", {
        applicantEmail: data.applicantEmail,
        applicationId: data.applicationId
      });
    } catch (error) {
      console.error("Failed to send disbursement completed email:", error);
    }
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
              <p>We are pleased to inform you that your fund disbursement has been successfully completed and the funds have been transferred to your account.</p>
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
      const htmlContent = this.getPayslipTemplate(payslipData);
      
      const from = getFromAddress('payroll');
      const employeeName = `${payslipData.employee.user.firstName} ${payslipData.employee.user.lastName}`;
      await emailTransport.sendMail({
        from: `"${from.name}" <${from.address}>`,
        to: `"${employeeName}" <${payslipData.employee.user.email}>`,
        subject: subject,
        html: htmlContent
      });

      console.log(`Payslip email sent to ${payslipData.employee.user.email}`);
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
      const subject = `You're Invited: ${data.eventTitle} - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getEventInvitationTemplate(data);
      
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
      const subject = `RSVP Update: ${data.eventTitle} - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getRSVPNotificationTemplate(data);
      
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
      const subject = `Budget Approved: ${data.eventTitle} - ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getBudgetApprovalTemplate(data);
      
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
  private static getEventInvitationTemplate(data: any): string {
    const eventDate = new Date(data.eventDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Event Invitation</title>
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
          .event-details {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .event-details h3 {
            margin-top: 0;
            color: #667eea;
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
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 You're Invited!</h1>
            <h2>NVCCZ Event Invitation</h2>
          </div>
          <div class="content">
            <p>Dear ${data.guestName},</p>
            
            <p>You have been invited to attend an exciting event organized by NVCCZ!</p>
            
            <div class="event-details">
              <h3>📅 Event Details</h3>
              <p><strong>Event:</strong> ${data.eventTitle}</p>
              <p><strong>Date & Time:</strong> ${eventDate}</p>
              ${data.eventLocation ? `<p><strong>Location:</strong> ${data.eventLocation}</p>` : ''}
              ${data.rsvpDeadline ? `<p><strong>RSVP Deadline:</strong> ${new Date(data.rsvpDeadline).toLocaleDateString()}</p>` : ''}
            </div>
            
            <div class="rsvp-section">
              <h3>📝 Please RSVP</h3>
              <p>Click one of the buttons below to respond to this invitation:</p>
              <a href="${process.env.EVENTS_PORTAL_URL || 'http://app.kyntaro.com'}/events/rsvp/${data.invitationToken}?status=accepted" class="rsvp-button">✅ Accept</a>
              <a href="${process.env.EVENTS_PORTAL_URL || 'http://app.kyntaro.com'}/events/rsvp/${data.invitationToken}?status=declined" class="rsvp-button decline">❌ Decline</a>
              <a href="${process.env.EVENTS_PORTAL_URL || 'http://app.kyntaro.com'}/events/rsvp/${data.invitationToken}?status=maybe" class="rsvp-button maybe">🤔 Maybe</a>
            </div>
            
            <p><strong>Note:</strong> This invitation is personalized for you. Please use the RSVP links above to respond.</p>
            
            <p>We look forward to seeing you at the event!</p>
            
            <p>Best regards,<br>
            <strong>NVCCZ Events Team</strong></p>
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
   * Get RSVP notification email template
   */
  private static getRSVPNotificationTemplate(data: any): string {
    const statusEmoji = {
      'ACCEPTED': '✅',
      'DECLINED': '❌',
      'MAYBE': '🤔'
    };

    const statusColor = {
      'ACCEPTED': '#28a745',
      'DECLINED': '#dc3545',
      'MAYBE': '#ffc107'
    };

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>RSVP Update</title>
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
          .content {
            padding: 30px;
          }
          .rsvp-update {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid ${statusColor[data.rsvpStatus]};
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📝 RSVP Update</h1>
            <h2>NVCCZ Event Management</h2>
          </div>
          <div class="content">
            <p>Dear ${data.organizerName},</p>
            
            <p>You have received a new RSVP response for your event:</p>
            
            <div class="rsvp-update">
              <h3>${statusEmoji[data.rsvpStatus]} RSVP Response</h3>
              <p><strong>Event:</strong> ${data.eventTitle}</p>
              <p><strong>Guest:</strong> ${data.guestName}</p>
              <p><strong>Response:</strong> ${data.rsvpStatus}</p>
              ${data.rsvpNotes ? `<p><strong>Notes:</strong> ${data.rsvpNotes}</p>` : ''}
            </div>
            
            <p>You can view all RSVP responses and manage your event through the ${process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} platform.</p>
            
            <p>Best regards,<br>
            <strong>NVCCZ Events Team</strong></p>
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
   * Get budget approval email template
   */
  private static getBudgetApprovalTemplate(data: any): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Budget Approved</title>
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
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: #ffffff;
            padding: 30px;
            text-align: center;
          }
          .content {
            padding: 30px;
          }
          .approval-details {
            background-color: #e8f5e8;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #28a745;
          }
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Budget Approved</h1>
            <h2>NVCCZ Finance Team</h2>
          </div>
          <div class="content">
            <p>Dear ${data.organizerName},</p>
            
            <p>Great news! Your event budget has been approved by the finance team.</p>
            
            <div class="approval-details">
              <h3>💰 Budget Approval Details</h3>
              <p><strong>Event:</strong> ${data.eventTitle}</p>
              <p><strong>Approved Budget:</strong> $${data.approvedBudget.toLocaleString()}</p>
              ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
            </div>
            
            <p>You can now proceed with your event planning and start making necessary arrangements. Remember to keep all receipts and documentation for expense tracking.</p>
            
            <p>If you have any questions about the approved budget or need assistance with event planning, please don't hesitate to contact the finance team.</p>
            
            <p>Best regards,<br>
            <strong>NVCCZ Finance Team</strong></p>
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
   * Send RFQ (Request for Quote) to vendor
   */
  static async sendRFQToVendor(data: {
    vendorName: string;
    vendorEmail: string;
    rfqNumber: string;
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
    companyName?: string;
  }): Promise<void> {
    try {
      const subject = `Request for Quote ${data.rfqNumber} - ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getRFQTemplate(data);
      
      const fromName = data.companyName || getFromAddress('procurement').name;
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${fromName}" <${from.address}>`,
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
  }): Promise<void> {
    try {
      const subject = `Quotation Accepted - ${data.quotationNumber}`;
      const htmlContent = this.getQuotationAcceptedTemplate(data);
      
      const fromName = data.companyName || getFromAddress('procurement').name;
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${fromName}" <${from.address}>`,
        to: `"${data.vendorName}" <${data.vendorEmail}>`,
        subject: subject,
        html: htmlContent
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
  }): Promise<void> {
    try {
      const subject = `Quotation Status Update - ${data.quotationNumber}`;
      const htmlContent = this.getQuotationRejectedTemplate(data);
      
      const fromName = data.companyName || getFromAddress('procurement').name;
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${fromName}" <${from.address}>`,
        to: `"${data.vendorName}" <${data.vendorEmail}>`,
        subject: subject,
        html: htmlContent
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
      const subject = `Invoice Approved - ${data.invoiceNumber}`;
      const htmlContent = this.getInvoiceApprovedTemplate(data);
      
      const fromName = data.companyName || getFromAddress('finance').name;
      const from = getFromAddress('finance');
      await emailTransport.sendMail({
        from: `"${fromName}" <${from.address}>`,
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
      const subject = `Payment Confirmation - Invoice ${data.invoiceNumber}`;
      const htmlContent = this.getInvoicePaidTemplate(data);
      
      const fromName = data.companyName || getFromAddress('finance').name;
      const from = getFromAddress('finance');
      await emailTransport.sendMail({
        from: `"${fromName}" <${from.address}>`,
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
      const subject = `New Requisition Requires Approval - ${data.requisitionNumber}`;
      const htmlContent = this.getRequisitionSubmittedToHeadTemplate(data);
      
      const fromName = data.companyName || getFromAddress('procurement').name;
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${fromName}" <${from.address}>`,
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
   * Send requisition approval notification to submitter
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
  }): Promise<void> {
    try {
      const subject = `Requisition Approved - ${data.requisitionNumber}`;
      const htmlContent = this.getRequisitionApprovedTemplate(data);
      
      const fromName = data.companyName || getFromAddress('procurement').name;
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${fromName}" <${from.address}>`,
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
  }): Promise<void> {
    try {
      const subject = `Requisition Rejected - ${data.requisitionNumber}`;
      const htmlContent = this.getRequisitionRejectedTemplate(data);
      
      const fromName = data.companyName || getFromAddress('procurement').name;
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${fromName}" <${from.address}>`,
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
      const subject = `Approval Required - ${data.entityType}: ${data.entityNumber}`;
      const htmlContent = this.getApprovalStepNotificationTemplate(data);
      
      const fromName = data.companyName || getFromAddress('procurement').name;
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${fromName}" <${from.address}>`,
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
      unitPrice: number;
      total: number;
    }>;
    deliveryAddress?: string;
    expectedDeliveryDate?: Date;
    paymentTerms?: string;
    notes?: string;
    companyName?: string;
  }): Promise<void> {
    try {
      const subject = `Purchase Order ${data.poNumber} - ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}`;
      const htmlContent = this.getPurchaseOrderTemplate(data);
      
      const fromName = data.companyName || getFromAddress('procurement').name;
      const from = getFromAddress('procurement');
      await emailTransport.sendMail({
        from: `"${fromName}" <${from.address}>`,
        to: `"${data.vendorName}" <${data.vendorEmail}>`,
        subject: subject,
        html: htmlContent
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
    rfqNumber: string;
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
    companyName?: string;
  }): string {
    const formattedDate = data.rfqDate.toLocaleDateString('en-US', { 
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
      : 'To be discussed';
    const deadline = data.rfqDeadline
      ? data.rfqDeadline.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : 'As soon as possible';
    const frontendBase = (process.env.PROCUREMENT_PORTAL_URL || 'http://app.kyntaro.com').replace(/\/$/, '');
    const vendorSubmissionUrl = `${frontendBase}/vendor/quotation/submit?rfqNumber=${encodeURIComponent(
      data.rfqNumber
    )}&vendorEmail=${encodeURIComponent(data.vendorEmail)}&vendorName=${encodeURIComponent(data.vendorName)}`;
    const apiBase = (process.env.API_URL || 'https://nvccz-pi.vercel.app/api').replace(/\/$/, '');
    const apiEndpoint = `${apiBase}/vendor-quotations/submit`;
    const sampleItem = data.items[0] || { itemName: 'Item 1', quantity: 1, unit: 'unit' };
    const apiPayload = {
      rfqNumber: data.rfqNumber,
      vendorName: data.vendorName,
      vendorEmail: data.vendorEmail,
      rfqId: data.rfqNumber,
      items: [
        {
          itemName: sampleItem.itemName,
          quantity: sampleItem.quantity,
          unit: sampleItem.unit || 'unit',
          unitPrice: 0
        }
      ]
    };
    const payloadExample = JSON.stringify(apiPayload, null, 2).replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 700px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
            color: white;
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 30px;
          }
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
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
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
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📋 REQUEST FOR QUOTE</h1>
            <h2>${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</h2>
          </div>
          <div class="content">
            <p>Dear ${data.vendorName},</p>
            
            <p>We are seeking competitive quotes for the following items/services. Please review the details below and provide your best pricing.</p>
            
            <div class="rfq-info">
              <h3 style="margin-top: 0;">📋 RFQ Information</h3>
              <table>
                <tr>
                  <td>RFQ Number:</td>
                  <td><strong>${data.rfqNumber}</strong></td>
                </tr>
                <tr>
                  <td>Date:</td>
                  <td>${formattedDate}</td>
                </tr>
                <tr>
                  <td>Project/Title:</td>
                  <td><strong>${data.title}</strong></td>
                </tr>
              </table>
            </div>

            ${data.description ? `
            <div>
              <h3>📝 Description</h3>
              <p>${data.description}</p>
            </div>
            ` : ''}

            <div class="deadline-box">
              ⏰ <strong>Quote Submission Deadline:</strong> ${deadline}
            </div>

            <h3>📦 Items/Services Required</h3>
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 40%;">Item/Service</th>
                  <th style="text-align: right;">Quantity</th>
                  <th style="text-align: right;">Unit</th>
                </tr>
              </thead>
              <tbody>
                ${data.items.map(item => `
                  <tr>
                    <td>
                      <strong>${item.itemName}</strong>
                      ${item.description ? `<div class="item-description">${item.description}</div>` : ''}
                      ${item.specifications ? `<div class="item-specs">Specs: ${JSON.stringify(item.specifications)}</div>` : ''}
                    </td>
                    <td style="text-align: right;">${item.quantity}</td>
                    <td style="text-align: right;">${item.unit || 'unit'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            ${data.deliveryAddress ? `
            <div style="margin: 20px 0;">
              <h3>🚚 Delivery Information</h3>
              <p><strong>Delivery Address:</strong><br>${data.deliveryAddress}</p>
              <p><strong>Expected Delivery Date:</strong> ${expectedDelivery}</p>
            </div>
            ` : ''}

            ${data.specialRequirements ? `
            <div class="requirements">
              <h3 style="margin-top: 0;">⚡ Special Requirements</h3>
              <p>${data.specialRequirements}</p>
            </div>
            ` : ''}

            <div class="instruction-list">
              <h3>📧 How to Submit Your Quote</h3>
              <p><strong>Option 1: Submit Online (Recommended) 🌟</strong></p>
              <p>Click the button below to submit your quotation through our secure online form:</p>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${vendorSubmissionUrl}" class="action-button" style="color: white;">
                  📝 Submit Your Quotation Online
                </a>
              </div>
              <p style="font-size: 0.9em; color: #666; text-align: center;">
                This is the fastest way to submit your quote and ensures accuracy!
              </p>
              
              <p><strong>Option 2: Reply by Email</strong></p>
              <p>Alternatively, you can reply to this email with the following information:</p>
              <ol>
                <li><strong>Company Name</strong> and <strong>Tax EIN/VAT Number</strong></li>
                <li><strong>Contact Person</strong> and <strong>Phone Number</strong></li>
                <li><strong>Unit Price</strong> for each item</li>
                <li><strong>Total Price</strong> including all costs</li>
                <li><strong>VAT/Tax</strong> amount (if applicable)</li>
                <li><strong>Delivery Timeline</strong> (how soon you can deliver)</li>
                <li><strong>Payment Terms</strong> you require</li>
                <li><strong>Warranty/Guarantee</strong> period (if applicable)</li>
                <li><strong>Validity Period</strong> of your quote</li>
                <li>Any <strong>additional notes</strong> or terms</li>
              </ol>
            </div>

            <div class="instruction-list" style="margin-top: 10px;">
              <p><strong>Option 3: Submit via API</strong></p>
              <p>POST the following JSON to <a href="${apiEndpoint}" target="_blank" rel="noreferrer">${apiEndpoint}</a> with <code>Content-Type: application/json</code>:</p>
              <pre style="background-color: #f5f5f5; border-radius: 8px; padding: 15px; overflow-x: auto; font-size: 0.85em;">${payloadExample}</pre>
              <p>Send the request when you are ready to submit your best pricing; the body can include the full item list plus pricing, delivery and payment terms.</p>
            </div>

            <div class="highlight-box">
              <h3 style="margin-top: 0;">💡 Quote Format Example</h3>
              <p><strong>Item 1:</strong> Office Rent - $5,000 per month<br>
              <strong>Item 2:</strong> Cleaning Services - $500 per month<br>
              <strong>Subtotal:</strong> $5,500<br>
              <strong>VAT (14.5%):</strong> $797.50<br>
              <strong>Total:</strong> $6,297.50<br>
              <strong>Delivery:</strong> Immediate<br>
              <strong>Payment Terms:</strong> NET 30<br>
              <strong>Quote Valid Until:</strong> ${deadline}</p>
            </div>

            <p><strong>Important Notes:</strong></p>
            <ul>
              <li>All prices should be in <strong>USD</strong> or <strong>ZWL</strong> (please specify)</li>
              <li>Include any applicable taxes in your quote</li>
              <li>Specify delivery costs separately if applicable</li>
              <li>Attach any relevant product specifications or brochures</li>
              <li>Provide company registration details</li>
            </ul>

            <p>We appreciate your prompt response and look forward to receiving your competitive quote. If you have any questions about this RFQ, please don't hesitate to contact our procurement team.</p>
            
            <p>Best regards,<br>
            <strong>Procurement Team</strong><br>
            ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</p>
          </div>
          <div class="footer">
            <p>This is an official Request for Quote from ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}.</p>
            <p>RFQ Reference: ${data.rfqNumber}</p>
            <p>For any inquiries, please reply to this email or contact ${process.env.EMAIL_CONTACT_PROCUREMENT || 'procurement@nvccz.com'}</p>
            <p>© 2026 ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
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
  }): string {
    const currencySymbol = data.currencyCode === 'USD' ? '$' : data.currencyCode === 'ZWL' ? 'ZWL' : data.currencyCode;
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Quotation Submitted</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #222;
            background-color: #f8fafc;
            margin: 0;
            padding: 20px;
          }
          .card {
            background: #fff;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
            max-width: 700px;
            margin: 0 auto;
          }
          h1 {
            color: #0f766e;
            margin-bottom: 5px;
          }
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
        </style>
      </head>
      <body>
        <div class="card">
          <h1>New quotation received</h1>
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
          <p style="margin-top: 20px;">You can review the submitted quotation in the Procurement → Vendor Quotations panel.</p>
          <p>Best regards,<br><strong>NVCCZ Procurement Team</strong></p>
        </div>
      </body>
      </html>
    `;
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
      unitPrice: number;
      total: number;
    }>;
    deliveryAddress?: string;
    expectedDeliveryDate?: Date;
    paymentTerms?: string;
    notes?: string;
    companyName?: string;
  }): string {
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

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 700px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
          }
          .content {
            padding: 30px;
          }
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
            background-color: #667eea;
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
          .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #666;
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
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Purchase Order</h1>
            <h2>${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</h2>
          </div>
          <div class="content">
            <p>Dear ${data.vendorName},</p>
            
            <p>Please find below our purchase order for your review and processing.</p>
            
            <div class="po-info">
              <h3 style="margin-top: 0;">📋 Order Information</h3>
              <table>
                <tr>
                  <td>PO Number:</td>
                  <td><strong>${data.poNumber}</strong></td>
                </tr>
                <tr>
                  <td>Date:</td>
                  <td>${formattedDate}</td>
                </tr>
                <tr>
                  <td>Vendor:</td>
                  <td>${data.vendorName}</td>
                </tr>
                ${data.paymentTerms ? `
                <tr>
                  <td>Payment Terms:</td>
                  <td>${data.paymentTerms}</td>
                </tr>
                ` : ''}
              </table>
            </div>

            ${data.deliveryAddress ? `
            <div class="delivery-info">
              <h3 style="margin-top: 0;">🚚 Delivery Information</h3>
              <p><strong>Delivery Address:</strong><br>${data.deliveryAddress}</p>
              <p><strong>Expected Delivery Date:</strong> ${expectedDelivery}</p>
            </div>
            ` : ''}

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
                ${data.items.map(item => `
                  <tr>
                    <td>
                      <strong>${item.itemName}</strong>
                      ${item.description ? `<div class="item-description">${item.description}</div>` : ''}
                    </td>
                    <td style="text-align: right;">${item.quantity}</td>
                    <td style="text-align: right;">${currencySymbol}${item.unitPrice.toFixed(2)}</td>
                    <td style="text-align: right;">${currencySymbol}${item.total.toFixed(2)}</td>
                  </tr>
                `).join('')}
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
            ` : ''}

            <p>Please confirm receipt of this purchase order and provide us with your acceptance and estimated delivery timeline.</p>
            
            <p><strong>Next Steps:</strong></p>
            <ul>
              <li>Review the order details carefully</li>
              <li>Confirm your acceptance of the order</li>
              <li>Provide delivery timeline confirmation</li>
              <li>Send your invoice as per the agreed terms</li>
            </ul>

            <p>If you have any questions or need clarification on any items, please don't hesitate to contact our procurement team.</p>
            
            <p>Best regards,<br>
            <strong>Procurement Team</strong><br>
            ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</p>
          </div>
          <div class="footer">
            <p>This is an official purchase order from ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}.</p>
            <p>For any inquiries, please contact ${process.env.EMAIL_CONTACT_PROCUREMENT || 'procurement@nvccz.com'}</p>
            <p>© 2026 ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Quotation Accepted Email Template
   */
  private static getQuotationAcceptedTemplate(data: {
    vendorName: string;
    quotationNumber: string;
    quotationAmount: number;
    currencyCode: string;
    reviewNotes?: string;
    companyName?: string;
    rfqNumber?: string;
  }): string {
    const frontendBase = (process.env.PROCUREMENT_PORTAL_URL || 'http://app.kyntaro.com').replace(/\/$/, '');
    const invoiceUrl = `${frontendBase}/vendor/invoice/submit?quotationNumber=${encodeURIComponent(
      data.quotationNumber
    )}&vendorEmail=${encodeURIComponent(data.vendorEmail)}${data.rfqNumber ? `&rfqNumber=${encodeURIComponent(data.rfqNumber)}` : ''}`;
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .amount { font-size: 24px; font-weight: bold; color: #10b981; margin: 10px 0; }
          .notes { background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0; font-size: 28px;">✅ Quotation Accepted!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</p>
        </div>
        <div class="content">
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

          <p><strong>Next Steps:</strong></p>
          <ul>
            <li>Finalize the preparation of the items/services you quoted</li>
            <li>Ensure delivery aligns with the timeframe you submitted</li>
            <li>Use the button below to submit your invoice referencing <strong>${data.quotationNumber}</strong></li>
          </ul>
          <div style="text-align:center; margin:30px 0;">
            <a href="${invoiceUrl}" class="button">Submit Your Invoice</a>
          </div>

          <p>Thank you for your competitive pricing and professional service. We look forward to a successful transaction and continued business relationship.</p>
          
          <p>If you have any questions, please don't hesitate to contact our procurement team.</p>
          
          <p>Best regards,<br>
          <strong>Procurement Team</strong><br>
          ${data.companyName || 'NVCCZ'}</p>
        </div>
        <div class="footer">
          <p>This is an official notification from ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}.</p>
          <p>For any inquiries, please contact ${process.env.EMAIL_CONTACT_PROCUREMENT || 'procurement@nvccz.com'}</p>
          <p>© 2026 ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;
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
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .reason { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 10px 10px; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0; font-size: 28px;">📋 Quotation Status Update</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</p>
        </div>
        <div class="content">
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
          
          <p>Thank you for your time and effort in preparing the quotation.</p>
          
          <p>Best regards,<br>
          <strong>Procurement Team</strong><br>
          ${data.companyName || 'NVCCZ'}</p>
        </div>
        <div class="footer">
          <p>This is an official notification from ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}.</p>
          <p>For any inquiries, please contact ${process.env.EMAIL_CONTACT_PROCUREMENT || 'procurement@nvccz.com'}</p>
          <p>© 2026 ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;
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
  }): string {
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

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #ecfdf5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .amount { font-size: 28px; font-weight: bold; color: #10b981; margin: 15px 0; text-align: center; }
          .details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .detail-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 10px 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0; font-size: 28px;">✅ Invoice Approved</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</p>
        </div>
        <div class="content">
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

          <p>Thank you for your business. We appreciate your patience during the approval process.</p>
          
          <p>Best regards,<br>
          <strong>Finance Team</strong><br>
          ${data.companyName || 'NVCCZ'}</p>
        </div>
        <div class="footer">
          <p>This is an official notification from ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}.</p>
          <p>For any inquiries, please contact ${process.env.EMAIL_CONTACT_FINANCE || 'finance@nvccz.com'}</p>
          <p>© 2026 ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;
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
  }): string {
    const formattedDate = data.paymentDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .payment-amount { font-size: 28px; font-weight: bold; color: #3b82f6; margin: 15px 0; text-align: center; }
          .payment-details { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .payment-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 10px 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 style="margin: 0; font-size: 28px;">💰 Payment Confirmation</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}</p>
        </div>
        <div class="content">
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

          <p>Thank you for your excellent service and cooperation. We look forward to continuing our business relationship.</p>
          
          <p>Best regards,<br>
          <strong>Finance Team</strong><br>
          ${data.companyName || 'NVCCZ'}</p>
        </div>
        <div class="footer">
          <p>This is an official payment confirmation from ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}.</p>
          <p>For any inquiries, please contact ${process.env.EMAIL_CONTACT_FINANCE || 'finance@nvccz.com'}</p>
          <p>© 2026 ${data.companyName || process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;
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
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>New Requisition Requires Approval</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">📋 New Requisition Requires Your Approval</h1>
          </div>
          <div class="content">
            <p>Dear ${data.headName},</p>
            
            <p>A new purchase requisition has been submitted and requires your approval:</p>
            
            <div class="info-box">
              <p style="margin: 0;"><strong>Requisition Number:</strong> ${data.requisitionNumber}</p>
              <p style="margin: 10px 0 0 0;"><strong>Title:</strong> ${data.title}</p>
              <p style="margin: 10px 0 0 0;"><strong>Department:</strong> ${data.department}</p>
              <p style="margin: 10px 0 0 0;"><strong>Submitted By:</strong> ${data.submittedByName} (${data.submittedByEmail})</p>
              <p style="margin: 10px 0 0 0;"><strong>Items:</strong> ${data.itemCount}</p>
              <p style="margin: 10px 0 0 0;"><strong>Total Amount:</strong> ${data.totalAmount.toFixed(2)}</p>
              <p style="margin: 10px 0 0 0;"><strong>Status:</strong> ${data.status}</p>
            </div>

            <p>Please review and approve or reject this requisition in the procurement system.</p>
            
            <p>Best regards,<br>
            <strong>${data.companyName || process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Procurement System</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated notification from ${data.companyName || process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Procurement System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get requisition approved email template
   */
  private static getRequisitionApprovedTemplate(data: {
    submitterName: string;
    requisitionNumber: string;
    title: string;
    department: string;
    approvedByName: string;
    approvedByEmail: string;
    approvalComments?: string;
    companyName?: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Requisition Approved</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #059669; color: white; padding: 20px; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #f0fdf4; border-left: 4px solid #059669; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">✅ Requisition Approved</h1>
          </div>
          <div class="content">
            <p>Dear ${data.submitterName},</p>
            
            <p>Great news! Your purchase requisition has been approved:</p>
            
            <div class="info-box">
              <p style="margin: 0;"><strong>Requisition Number:</strong> ${data.requisitionNumber}</p>
              <p style="margin: 10px 0 0 0;"><strong>Title:</strong> ${data.title}</p>
              <p style="margin: 10px 0 0 0;"><strong>Department:</strong> ${data.department}</p>
              <p style="margin: 10px 0 0 0;"><strong>Approved By:</strong> ${data.approvedByName} (${data.approvedByEmail})</p>
            </div>

            ${data.approvalComments ? `
            <div style="background: #f9fafb; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Approval Comments:</strong></p>
              <p style="margin: 10px 0 0 0;">${data.approvalComments}</p>
            </div>
            ` : ''}

            <p>You can now proceed with the next steps in the procurement process.</p>
            
            <p>Best regards,<br>
            <strong>${data.companyName || process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Procurement System</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated notification from ${data.companyName || process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Procurement System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get requisition rejected email template
   */
  private static getRequisitionRejectedTemplate(data: {
    submitterName: string;
    requisitionNumber: string;
    title: string;
    department: string;
    rejectedByName: string;
    rejectedByEmail: string;
    rejectionReason?: string;
    companyName?: string;
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Requisition Rejected</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">❌ Requisition Rejected</h1>
          </div>
          <div class="content">
            <p>Dear ${data.submitterName},</p>
            
            <p>Your purchase requisition has been rejected:</p>
            
            <div class="info-box">
              <p style="margin: 0;"><strong>Requisition Number:</strong> ${data.requisitionNumber}</p>
              <p style="margin: 10px 0 0 0;"><strong>Title:</strong> ${data.title}</p>
              <p style="margin: 10px 0 0 0;"><strong>Department:</strong> ${data.department}</p>
              <p style="margin: 10px 0 0 0;"><strong>Rejected By:</strong> ${data.rejectedByName} (${data.rejectedByEmail})</p>
            </div>

            ${data.rejectionReason ? `
            <div style="background: #f9fafb; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Rejection Reason:</strong></p>
              <p style="margin: 10px 0 0 0;">${data.rejectionReason}</p>
            </div>
            ` : ''}

            <p>Please review the rejection reason and make necessary changes before resubmitting.</p>
            
            <p>Best regards,<br>
            <strong>${data.companyName || process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Procurement System</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated notification from ${data.companyName || process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Procurement System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
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
  }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Approval Required</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; }
          .info-box { background: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">📋 Approval Required</h1>
          </div>
          <div class="content">
            <p>Dear ${data.approverName},</p>
            
            <p>An approval request is pending your review:</p>
            
            <div class="info-box">
              <p style="margin: 0;"><strong>Entity Type:</strong> ${data.entityType}</p>
              <p style="margin: 10px 0 0 0;"><strong>${data.entityType} Number:</strong> ${data.entityNumber}</p>
              <p style="margin: 10px 0 0 0;"><strong>Title:</strong> ${data.entityTitle}</p>
              <p style="margin: 10px 0 0 0;"><strong>Department:</strong> ${data.department}</p>
              <p style="margin: 10px 0 0 0;"><strong>Submitted By:</strong> ${data.submittedByName} (${data.submittedByEmail})</p>
              <p style="margin: 10px 0 0 0;"><strong>Step:</strong> ${data.stepNumber} of ${data.totalSteps} - ${data.stepName}</p>
            </div>

            <p>Please review and approve or reject this request in the procurement system.</p>
            
            <p>Best regards,<br>
            <strong>${data.companyName || process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Procurement System</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated notification from ${data.companyName || process.env.COMPANY_NAME_FULL || 'National Venture Capital Company of Zimbabwe'} Procurement System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
