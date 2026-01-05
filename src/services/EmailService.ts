// @ts-nocheck
import crypto from 'crypto';

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private static instance: EmailService;

  private constructor() {}

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Generate a secure confirmation token
   */
  public generateConfirmationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Send double opt-in confirmation email
   */
  public async sendConfirmationEmail(email: string, firstName: string | null, confirmationToken: string): Promise<boolean> {
    try {
      const confirmationUrl = `${process.env.FRONTEND_URL || 'http://app.kyntaro.com'}/confirm-newsletter?token=${confirmationToken}`;
      
      const emailData: EmailData = {
        to: email,
        subject: 'Confirm Your Newsletter Subscription',
        html: this.getConfirmationEmailHTML(firstName, confirmationUrl),
        text: this.getConfirmationEmailText(firstName, confirmationUrl)
      };

      // In production, this would integrate with a real email service
      // For now, we'll log the email data
      console.log('📧 Sending confirmation email:', {
        to: emailData.to,
        subject: emailData.subject,
        confirmationUrl
      });

      // Simulate email sending delay
      await new Promise(resolve => setTimeout(resolve, 100));

      return true;
    } catch (error) {
      console.error('Error sending confirmation email:', error);
      return false;
    }
  }

  /**
   * Send welcome email after confirmation
   */
  public async sendWelcomeEmail(email: string, firstName: string | null, topics: string[]): Promise<boolean> {
    try {
      const emailData: EmailData = {
        to: email,
        subject: 'Welcome to Our Newsletter!',
        html: this.getWelcomeEmailHTML(firstName, topics),
        text: this.getWelcomeEmailText(firstName, topics)
      };

      console.log('📧 Sending welcome email:', {
        to: emailData.to,
        subject: emailData.subject,
        topics
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      return true;
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return false;
    }
  }

  /**
   * Get confirmation email HTML template
   */
  private getConfirmationEmailHTML(firstName: string | null, confirmationUrl: string): string {
    const name = firstName || 'there';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirm Your Newsletter Subscription</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #007bff; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Confirm Your Newsletter Subscription</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>Thank you for subscribing to our newsletter! To complete your subscription, please click the button below:</p>
            <p style="text-align: center;">
              <a href="${confirmationUrl}" class="button">Confirm Subscription</a>
            </p>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p>${confirmationUrl}</p>
            <p>This link will expire in 24 hours for security reasons.</p>
            <p>If you didn't request this subscription, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get confirmation email text template
   */
  private getConfirmationEmailText(firstName: string | null, confirmationUrl: string): string {
    const name = firstName || 'there';
    
    return `
Confirm Your Newsletter Subscription

Hi ${name},

Thank you for subscribing to our newsletter! To complete your subscription, please visit this link:

${confirmationUrl}

This link will expire in 24 hours for security reasons.

If you didn't request this subscription, you can safely ignore this email.

© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.
    `;
  }

  /**
   * Get welcome email HTML template
   */
  private getWelcomeEmailHTML(firstName: string | null, topics: string[]): string {
    const name = firstName || 'there';
    const topicsList = topics.length > 0 ? topics.map(topic => `<li>${topic}</li>`).join('') : '<li>General updates</li>';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Our Newsletter!</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Our Newsletter!</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>🎉 Your newsletter subscription has been confirmed! You're now part of our community.</p>
            <p>You'll receive updates about:</p>
            <ul>${topicsList}</ul>
            <p>We're excited to share valuable content with you. Stay tuned for our next newsletter!</p>
            <p>Best regards,<br>The NVCCZ Team</p>
          </div>
          <div class="footer">
            <p>© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.</p>
            <p><a href="${process.env.FRONTEND_URL || 'http://app.kyntaro.com'}/unsubscribe">Unsubscribe</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get welcome email text template
   */
  private getWelcomeEmailText(firstName: string | null, topics: string[]): string {
    const name = firstName || 'there';
    const topicsList = topics.length > 0 ? topics.join(', ') : 'General updates';
    
    return `
Welcome to Our Newsletter!

Hi ${name},

🎉 Your newsletter subscription has been confirmed! You're now part of our community.

You'll receive updates about: ${topicsList}

We're excited to share valuable content with you. Stay tuned for our next newsletter!

Best regards,
The NVCCZ Team

© 2026 ${process.env.COMPANY_NAME_SHORT || 'NVCCZ'}. All rights reserved.
    `;
  }
}

export default EmailService.getInstance();


