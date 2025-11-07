// @ts-nocheck
import { prisma } from "../utils/database";
import bcrypt from "bcrypt";
import { SendMailClient } from "zeptomail";

const BOARD_VOTING_ROLE_CODES = ["BOARD_CHAIR", "BOARD_MEMBER"];

// Email configuration
const zeptoUrl = "api.zeptomail.com/";
const zeptoToken = "Zoho-enczapikey wSsVR61/+xejCqZ6mzOpJuptkQxSVlmgER993FKmuHb7HKiT8MdvxELKDFWmTfJMFmZvRTRAorookUoIgGZa3dUszgsFASiF9mqRe1U4J3x17qnvhDzPX29dmxCAL4wPwQ1jmWVjFc8q+g==";
const zeptoClient = new SendMailClient({ url: zeptoUrl, token: zeptoToken });

export class UserService {
  private static isBoardVotingRole(roleCode?: string | null): boolean {
    return !!roleCode && BOARD_VOTING_ROLE_CODES.includes(roleCode);
  }

  private static validateVotingPowerValue(value: number) {
    if (Number.isNaN(value)) {
      throw new Error("Voting power must be a valid number");
    }
    if (value <= 0 || value > 100) {
      throw new Error("Voting power must be greater than 0 and less than or equal to 100");
    }
  }

  private static async fetchBoardVotingMembers() {
    return prisma.user.findMany({
      where: {
        userDepartment: "Investments",
        roleCode: {
          in: BOARD_VOTING_ROLE_CODES
        }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        roleCode: true,
        departmentRole: true,
        votingPower: true
      }
    });
  }

  static async getBoardVotingMembers() {
    const members = await this.fetchBoardVotingMembers();
    return members.map(member => ({
      ...member,
      votingPower: member.votingPower !== null && member.votingPower !== undefined
        ? Number(member.votingPower)
        : null
    }));
  }

  private static async getTotalBoardVotingPower(): Promise<number> {
    const voters = await this.fetchBoardVotingMembers();

    return voters.reduce((sum, voter) => {
      const value = voter.votingPower ? Number(voter.votingPower) : 0;
      return sum + value;
    }, 0);
  }

  private static ensureVotingPowerTotalWithinBounds(total: number) {
    if (total > 100.0001) {
      throw new Error(`Total board voting power cannot exceed 100%. Current total: ${total.toFixed(2)}%`);
    }
  }

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
      const normalizedEmail = userData.email.trim().toLowerCase();

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail,
            mode: 'insensitive'
          }
        }
      });

      if (existingUser) {
        throw new Error("User already exists with this email address");
      }

      // Prevent creating users for emails that already have an application
      const existingApplication = await prisma.application.findFirst({
        where: {
          applicantEmail: {
            equals: normalizedEmail,
            mode: 'insensitive'
          }
        }
      });

      if (existingApplication) {
        throw new Error("An application already exists with this email address");
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

      const isBoardRole = this.isBoardVotingRole(userData.roleCode);

      if (isBoardRole) {
        if (userData.department !== "Investments") {
          throw new Error("Board roles must be assigned to the Investments department");
        }

        if (userData.roleCode === "BOARD_CHAIR") {
          const existingChair = await prisma.user.findFirst({
            where: {
              roleCode: "BOARD_CHAIR"
            }
          });

          if (existingChair) {
            throw new Error("Only one Board Chairman is allowed in the system");
          }
        }
      }

      // Generate password
      const password = this.generatePassword();
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: normalizedEmail,
          password: hashedPassword,
          userDepartment: userData.department,
          departmentRole: userData.departmentRole,
          roleCode: userData.roleCode,
          roleId: role.id,
          votingPower: null
        }
      });

      // Send credentials email
      await this.sendCredentialsEmail(
        normalizedEmail,
        userData.firstName,
        userData.lastName,
        password,
        userData.department,
        role.name
      );

      return {
        user: {
          ...user,
          votingPower: user.votingPower ? Number(user.votingPower) : null
        },
        password, // Return plain password for immediate use if needed
        message: "User created successfully and credentials sent via email"
      };
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  /**
   * Get all users
   * Excludes applicants (users with role name "applicant")
   */
  static async getAllUsers() {
    try {
      const users = await prisma.user.findMany({
        where: {
          role: {
            name: {
              not: "applicant" // Exclude applicants
            }
          }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          departmentRole: true,
          roleCode: true,
          votingPower: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true
            }
          },
          createdAt: true,
          updatedAt: true
        },
        orderBy: [
          { firstName: 'asc' },
          { lastName: 'asc' }
        ]
      });

      return users;
    } catch (error) {
      console.error("Error getting all users:", error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  static async getUserById(id: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          departmentRole: true,
          roleCode: true,
          votingPower: true,
          role: {
            select: {
              id: true,
              name: true,
              description: true,
              permissions: true
            }
          },
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        throw new Error("User not found");
      }

      return user;
    } catch (error) {
      console.error("Error getting user by ID:", error);
      throw error;
    }
  }

  /**
   * Update user
   */
  static async updateUser(id: string, userData: {
    firstName?: string;
    lastName?: string;
    email?: string;
    department?: string;
    roleCode?: string;
    departmentRole?: string;
    roleId?: string;
  }) {
    try {
      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { id }
      });

      if (!existingUser) {
        throw new Error("User not found");
      }

      // If email is being updated, check if it's already taken
      if (userData.email && userData.email !== existingUser.email) {
        const emailTaken = await prisma.user.findUnique({
          where: { email: userData.email }
        });

        if (emailTaken) {
          throw new Error("Email already taken by another user");
        }
      }

      // Validate department if provided
      if (userData.department) {
        const validDepartments = ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT", "Investments"];
        if (!validDepartments.includes(userData.department)) {
          throw new Error(`Invalid department. Valid departments: ${validDepartments.join(", ")}`);
        }
      }

      // Validate email format if provided
      if (userData.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userData.email)) {
          throw new Error("Invalid email format");
        }
      }

      // Validate roleId if provided
      if (userData.roleId) {
        const role = await prisma.role.findUnique({
          where: { id: userData.roleId }
        });

        if (!role) {
          throw new Error("Role not found");
        }
      }

      const targetRoleCode = userData.roleCode ?? existingUser.roleCode;
      const isBoardRole = this.isBoardVotingRole(targetRoleCode);

      if (isBoardRole) {
        const departmentToSet = userData.department ?? existingUser.userDepartment;
        if (departmentToSet !== "Investments") {
          throw new Error("Board roles must be assigned to the Investments department");
        }

        if (targetRoleCode === "BOARD_CHAIR") {
          const existingChair = await prisma.user.findFirst({
            where: {
              roleCode: "BOARD_CHAIR",
              id: {
                not: id
              }
            }
          });

          if (existingChair) {
            throw new Error("Only one Board Chairman is allowed in the system");
          }
        }
      }

      // Update user - explicitly exclude password (password should only be changed via change-password endpoint)
      const updateData: any = {};
      if (userData.firstName) updateData.firstName = userData.firstName;
      if (userData.lastName) updateData.lastName = userData.lastName;
      if (userData.email) updateData.email = userData.email.toLowerCase().trim();
      if (userData.department) updateData.userDepartment = userData.department;
      if (userData.roleCode) updateData.roleCode = userData.roleCode;
      if (userData.departmentRole) updateData.departmentRole = userData.departmentRole;
      if (userData.roleId) updateData.roleId = userData.roleId;
      if (!isBoardRole && this.isBoardVotingRole(existingUser.roleCode)) {
        updateData.votingPower = null;
      }
      // Password is explicitly excluded - must use change-password endpoint

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        include: {
          role: {
            select: {
              id: true,
              name: true,
              description: true
            }
          }
        }
      });

      // Return only the fields we want, with role as optional
      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        userDepartment: user.userDepartment,
        departmentRole: user.departmentRole,
        roleCode: user.roleCode,
        votingPower: user.votingPower ? Number(user.votingPower) : null,
        role: user.role ? {
          id: user.role.id,
          name: user.role.name,
          description: user.role.description
        } : null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
  }

  /**
   * Delete user
   */
  static async deleteUser(id: string) {
    try {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          role: true
        }
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Check if this is the last admin user
      if (user.role?.name === "admin") {
        const adminCount = await prisma.user.count({
          where: {
            role: {
              name: "admin"
            }
          }
        });

        if (adminCount <= 1) {
          throw new Error("Cannot delete the last admin user");
        }
      }

      // Delete user
      await prisma.user.delete({
        where: { id }
      });

      return { message: "User deleted successfully" };
    } catch (error) {
      console.error("Error deleting user:", error);
      throw error;
    }
  }

  /**
   * Configure voting power for board members
   */
  static async setVotingPower(userId: string, votingPower: number | null) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error("User not found");
      }

      if (!this.isBoardVotingRole(user.roleCode)) {
        throw new Error("Voting power can only be configured for board roles");
      }

      if (user.userDepartment !== "Investments") {
        throw new Error("Board voting roles must belong to the Investments department");
      }

      let valueToSet: number | null = null;
      if (votingPower !== null && votingPower !== undefined) {
        const numericValue = Number(votingPower);
        this.validateVotingPowerValue(numericValue);
        valueToSet = numericValue;
      }

      const currentValue = user.votingPower ? Number(user.votingPower) : 0;
      const totalVotingPower = await this.getTotalBoardVotingPower();
      const newTotal = totalVotingPower - currentValue + (valueToSet ?? 0);
      this.ensureVotingPowerTotalWithinBounds(newTotal);

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          votingPower: valueToSet
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          departmentRole: true,
          roleCode: true,
          votingPower: true
        }
      });

      return {
        ...updatedUser,
        votingPower: updatedUser.votingPower !== null && updatedUser.votingPower !== undefined
          ? Number(updatedUser.votingPower)
          : null
      };
    } catch (error) {
      console.error("Error setting voting power:", error);
      throw error;
    }
  }
}


