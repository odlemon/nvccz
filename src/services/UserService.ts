// @ts-nocheck
import { prisma } from "../utils/database";
import bcrypt from "bcrypt";
import { SendMailClient } from "zeptomail";

// Email configuration
const zeptoUrl = "api.zeptomail.com/";
const zeptoToken = "Zoho-enczapikey wSsVR61/+xejCqZ6mzOpJuptkQxSVlmgER993FKmuHb7HKiT8MdvxELKDFWmTfJMFmZvRTRAorookUoIgGZa3dUszgsFASiF9mqRe1U4J3x17qnvhDzPX29dmxCAL4wPwQ1jmWVjFc8q+g==";
const zeptoClient = new SendMailClient({ url: zeptoUrl, token: zeptoToken });

export class UserService {
  /**
   * Get users filtered by department and/or role
   * Used for approval configuration
   */
  static async getUsersByDepartmentAndRole(
    department?: string,
    departmentRole?: string
  ) {
    try {
      const where: any = {};

      if (department) {
        where.userDepartment = department;
      }

      if (departmentRole) {
        where.departmentRole = departmentRole;
      }

      const users = await prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          departmentRole: true,
          role: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: [
          { userDepartment: 'asc' },
          { departmentRole: 'asc' },
          { firstName: 'asc' }
        ]
      });

      return users;
    } catch (error) {
      console.error("Error getting users by department and role:", error);
      throw error;
    }
  }

  /**
   * Generate a secure password
   */
  static generatePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Get email template for user credentials
   */
  static getCredentialsEmailHTML(firstName: string, lastName: string, email: string, password: string, department: string, roleName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your NVCCZ Account Credentials</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #007bff; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .credentials { background: #e9ecef; padding: 15px; border-radius: 5px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to NVCCZ!</h1>
            <p>Your account has been created successfully</p>
          </div>
          <div class="content">
            <p>Hi ${firstName} ${lastName},</p>
            <p>Welcome to the NVCCZ system! Your account has been created and you've been assigned to the <strong>${department} Department</strong> as a <strong>${roleName}</strong>.</p>
            
            <div class="credentials">
              <h3>🔐 Your Login Credentials</h3>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Password:</strong> <code style="background: #f8f9fa; padding: 2px 6px; border-radius: 3px;">${password}</code></p>
            </div>

            <div class="warning">
              <strong>⚠️ Important Security Notice:</strong>
              <ul>
                <li>Please change your password immediately after first login</li>
                <li>Keep your credentials secure and do not share them</li>
                <li>This is a temporary password for initial access</li>
              </ul>
            </div>

            <p>You can now access the system using these credentials. If you have any questions or need assistance, please contact the IT department.</p>
            
            <p style="text-align: center;">
              <a href="${process.env.FRONTEND_URL || 'https://nvccz-frontend.vercel.app'}/login" class="button">Login to NVCCZ</a>
            </p>
          </div>
          <div class="footer">
            <p>© 2024 NVCCZ. All rights reserved.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get text version of credentials email
   */
  static getCredentialsEmailText(firstName: string, lastName: string, email: string, password: string, department: string, roleName: string): string {
    return `
Welcome to NVCCZ!

Hi ${firstName} ${lastName},

Welcome to the NVCCZ system! Your account has been created and you've been assigned to the ${department} Department as a ${roleName}.

Your Login Credentials:
Email: ${email}
Password: ${password}

IMPORTANT SECURITY NOTICE:
- Please change your password immediately after first login
- Keep your credentials secure and do not share them
- This is a temporary password for initial access

You can now access the system using these credentials. If you have any questions or need assistance, please contact the IT department.

Login URL: ${process.env.FRONTEND_URL || 'https://nvccz-frontend.vercel.app'}/login

© 2024 NVCCZ. All rights reserved.
This is an automated message. Please do not reply to this email.
    `;
  }

  /**
   * Send credentials email
   */
  static async sendCredentialsEmail(email: string, firstName: string, lastName: string, password: string, department: string, roleName: string): Promise<boolean> {
    try {
      const subject = "Your NVCCZ Account Credentials - Welcome!";
      const htmlContent = this.getCredentialsEmailHTML(firstName, lastName, email, password, department, roleName);
      const textContent = this.getCredentialsEmailText(firstName, lastName, email, password, department, roleName);
      
      await zeptoClient.sendMail({
        from: {
          address: "noreply@lysp.io",
          name: "NVCCZ IT Team"
        },
        to: [
          {
            email_address: {
              address: email,
              name: `${firstName} ${lastName}`
            }
          }
        ],
        subject: subject,
        htmlbody: htmlContent,
        textbody: textContent
      });

      console.log(`✅ Credentials email sent to ${email}`);
      return true;
    } catch (error) {
      console.error("❌ Error sending credentials email:", error);
      throw error;
    }
  }

  /**
   * Create a new user with auto-generated password and email credentials
   */
  static async createUser(userData: {
    firstName: string;
    lastName: string;
    email: string;
    department: string;
    roleCode: string;
    departmentRole: string;
  }) {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email }
      });

      if (existingUser) {
        throw new Error("User already exists with this email address");
      }

      // Find the role by code or name
      const role = await prisma.role.findFirst({
        where: { 
          name: { 
            notIn: ["admin", "applicant"]
          }
        }
      });

      if (!role) {
        throw new Error("Could not find appropriate role for user");
      }

      // Generate password
      const password = this.generatePassword();
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email,
          password: hashedPassword,
          userDepartment: userData.department,
          departmentRole: userData.departmentRole,
          roleCode: userData.roleCode,
          roleId: role.id
        }
      });

      // Send credentials email
      await this.sendCredentialsEmail(
        userData.email,
        userData.firstName,
        userData.lastName,
        password,
        userData.department,
        role.name
      );

      return {
        user,
        password, // Return plain password for immediate use if needed
        message: "User created successfully and credentials sent via email"
      };
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }
}


