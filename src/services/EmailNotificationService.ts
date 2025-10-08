//@ts-nocheck
import { SendMailClient } from "zeptomail";

const zeptoUrl = "api.zeptomail.com/";
const zeptoToken = "Zoho-enczapikey wSsVR61/+xejCqZ6mzOpJuptkQxSVlmgER993FKmuHb7HKiT8MdvxELKDFWmTfJMFmZvRTRAorookUoIgGZa3dUszgsFASiF9mqRe1U4J3x17qnvhDzPX29dmxCAL4wPwQ1jmWVjFc8q+g==";

const zeptoClient = new SendMailClient({ url: zeptoUrl, token: zeptoToken });

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
      const subject = "Investment Application Received - NVCCZ";
      const htmlContent = this.getApplicationReceivedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
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
      const subject = "Due Diligence Process Started - NVCCZ";
      const htmlContent = this.getDueDiligenceStartedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
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
      const subject = "Due Diligence Process Completed - NVCCZ";
      const htmlContent = this.getDueDiligenceCompletedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
      });

      console.log(`Due diligence completed email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending due diligence completed email:", error);
      throw error;
    }
  }

  /**
   * Send board review started email
   */
  static async sendBoardReviewStartedEmail(data: EmailNotificationData): Promise<void> {
    try {
      const subject = "Board Review Process Started - NVCCZ";
      const htmlContent = this.getBoardReviewStartedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
      });

      console.log(`Board review started email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending board review started email:", error);
      throw error;
    }
  }

  /**
   * Send investment decision email
   */
  static async sendInvestmentDecisionEmail(data: EmailNotificationData): Promise<void> {
    try {
      const subject = "Investment Decision Update - NVCCZ";
      const htmlContent = this.getInvestmentDecisionTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
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
      const subject = "Investment Implementation Started - NVCCZ";
      const htmlContent = this.getInvestmentImplementationStartedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
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
      const subject = "Application Shortlisted - NVCCZ";
      const htmlContent = this.getApplicationShortlistedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
      });

      console.log(`Application shortlisted email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending application shortlisted email:", error);
      throw error;
    }
  }

  /**
   * Send application rejected email
   */
  static async sendApplicationRejectedEmail(data: EmailNotificationData): Promise<void> {
    try {
      const subject = "Application Update - NVCCZ";
      const htmlContent = this.getApplicationRejectedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
      });

      console.log(`Application rejected email sent to ${data.applicantEmail}`);
    } catch (error) {
      console.error("Error sending application rejected email:", error);
      throw error;
    }
  }

  /**
   * Send term sheet created email
   */
  static async sendTermSheetCreatedEmail(data: EmailNotificationData): Promise<void> {
    try {
      const subject = "Your Term Sheet is Ready for Review - NVCCZ";
      const htmlContent = this.getTermSheetCreatedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
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
      const subject = "Term Sheet Approved - NVCCZ";
      const htmlContent = this.getTermSheetApprovedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
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
      const subject = "Term Sheet Update - NVCCZ";
      const htmlContent = this.getTermSheetRejectedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
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
      const subject = "Investment Approved - Welcome to NVCCZ Portfolio!";
      const htmlContent = this.getInvestmentApprovedAccountCreatedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
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
      const subject = "Welcome to NVCCZ Portfolio - NVCCZ";
      const htmlContent = this.getPortfolioCompanyCreatedTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
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
      const subject = `Application Status Update - ${data.currentStage} - NVCCZ`;
      const htmlContent = this.getStageUpdateTemplate(data);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Investment Team"
        },
        to: [
          {
            email_address: {
              address: data.applicantEmail,
              name: data.applicantName
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
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
        <title>Application Received - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
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
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Due Diligence Started - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
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
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Due Diligence Completed - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
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
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Board Review Started - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
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
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Investment Decision - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
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
            
            <p>Thank you for your interest in NVCCZ and for the time and effort you put into your application.</p>
            
            <p>Best regards,<br>
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Investment Implementation Started - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
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
            
            <p>Welcome to the NVCCZ portfolio!</p>
            
            <p>Best regards,<br>
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Application Shortlisted - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
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
            </ul>
            
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
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private static getApplicationRejectedTemplate(data: EmailNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Application Update - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
            <h2>Application Update</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>Thank you for your interest in NVCCZ and for submitting your application for <strong>${data.businessName}</strong>.</p>
            
            <h3>Application Details:</h3>
            <ul>
              <li><strong>Application ID:</strong> ${data.applicationId}</li>
              <li><strong>Business Name:</strong> ${data.businessName}</li>
              <li><strong>Status:</strong> Not Selected</li>
              <li><strong>Decision Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
            
            <h3>Application Decision</h3>
            <p>After careful consideration, we have decided not to proceed with your application at this time.</p>
            
            <p>This decision does not reflect on the quality of your business or your team. We encourage you to:</p>
            <ul>
              <li>Continue developing your business</li>
              <li>Consider reapplying in the future</li>
              <li>Explore other funding opportunities</li>
            </ul>
            
            <p>We appreciate the time and effort you put into your application and wish you success with your business.</p>
            
            <p>Best regards,<br>
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Term Sheet Created - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
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
            <p>Your term sheet is now available for review on the NVCCZ platform. You can:</p>
            <ul>
              <li>Log in to your account to view the term sheet</li>
              <li>Review all terms and conditions</li>
              <li>Download the document for your records</li>
              <li>Contact our team with any questions</li>
            </ul>
            
            <div style="background-color: #e5f3ff; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <h4>🌐 Platform Access</h4>
              <p><strong>Login URL:</strong> <a href="http://k8cgsgsckswkkkgo0k4sko84.31.220.82.129.sslip.io/" target="_blank" style="color: #1e40af;">http://k8cgsgsckswkkkgo0k4sko84.31.220.82.129.sslip.io/</a></p>
              <p><strong>Your Email:</strong> ${data.applicantEmail}</p>
              <p>Use your existing login credentials to access the platform.</p>
            </div>
            
            <h3>Next Steps:</h3>
            <p>Please log in to review your term sheet and let us know if you have any questions or concerns.</p>
            
            <p>Best regards,<br>
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Term Sheet Approved - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
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
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Term Sheet Update - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
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
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Investment Approved - Welcome to NVCCZ Portfolio!</title>
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
            <h2>Investment Approved - Welcome to NVCCZ Portfolio!</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p><strong>Excellent news!</strong> We are thrilled to inform you that your investment application for <strong>${data.businessName}</strong> has been approved by our board!</p>
            
            <h3>🎯 What happens next?</h3>
            <p>We have created your company account and you can now access the NVCCZ platform to:</p>
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
              <p><strong>Login URL:</strong> <a href="http://k8cgsgsckswkkkgo0k4sko84.31.220.82.129.sslip.io/" target="_blank">http://k8cgsgsckswkkkgo0k4sko84.31.220.82.129.sslip.io/</a></p>
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
            
            <p>Welcome to the NVCCZ family! We're excited to support your growth and success.</p>
            
            <p>If you have any questions or need assistance, please don't hesitate to contact our team.</p>
            
            <p>Best regards,<br>
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Welcome to NVCCZ Portfolio - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
            <h2>Welcome to NVCCZ Portfolio</h2>
          </div>
          <div class="content">
            <p>Dear ${data.applicantName},</p>
            
            <p>Congratulations! <strong>${data.businessName}</strong> is now officially part of the NVCCZ portfolio.</p>
            
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
            
            <p>Welcome to the NVCCZ family! We're excited to support your growth and success.</p>
            
            <p>Best regards,<br>
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
        <title>Application Status Update - NVCCZ</title>
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
            <h1>NVCCZ Investment Team</h1>
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
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
      const subject = "Fund Disbursement Completed - NVCCZ";
      const htmlBody = this.getDisbursementCompletedTemplate(data);

      await zeptoClient.sendMail({
        from: { address: "noreply@nvccz.co.zw", name: "NVCCZ Investment Platform" },
        to: [{ address: data.applicantEmail, name: data.applicantName }],
        subject,
        htmlbody: htmlBody
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
        <title>Fund Disbursement Completed - NVCCZ</title>
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
            <strong>NVCCZ Investment Team</strong></p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© 2024 NVCCZ. All rights reserved.</p>
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
      const subject = `Your Payslip - ${payslipData.payrollRun.payPeriod} - NVCCZ`;
      const htmlContent = this.getPayslipTemplate(payslipData);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ Payroll Team"
        },
        to: [
          {
            email_address: {
              address: payslipData.employee.user.email,
              name: `${payslipData.employee.user.firstName} ${payslipData.employee.user.lastName}`
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent
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
            <p>© 2024 ${companyName}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
