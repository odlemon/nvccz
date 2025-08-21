import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";
import bcrypt from "bcryptjs";

const prisma = dbConnection.getPrismaClient();

export interface CreatePortfolioCompanyRequest {
  // User details
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  
  // Company details
  name: string;
  registrationNumber: string;
  industry: string;
  foundingDate: Date;
  address: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  status?: string;
  companySize?: string;
  employeeCount?: number;
  annualRevenue?: number;
  fundingStage?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  socialMedia?: Record<string, string>;
}

export interface UpdatePortfolioCompanyRequest {
  name?: string;
  industry?: string;
  foundingDate?: Date;
  address?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  status?: string;
  companySize?: string;
  employeeCount?: number;
  annualRevenue?: number;
  fundingStage?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  socialMedia?: Record<string, string>;
}

export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export class PortfolioCompanyService {
  // Create user account
  static async createUser(request: CreateUserRequest) {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: request.email }
      });

      if (existingUser) {
        throw new Error("User with this email already exists");
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(request.password, 12);

      // Get applicant role (create if doesn't exist)
      let applicantRole = await prisma.role.findUnique({
        where: { name: "applicant" }
      });

      if (!applicantRole) {
        applicantRole = await prisma.role.create({
          data: {
            name: "applicant",
            description: "Applicant user role - can create and manage company profiles",
            permissions: {
              "portfolio_company": ["read", "write"],
              "profile": ["read", "write"],
              "applications": ["read", "write"]
            }
          }
        });
      }

              // Create user
        const user = await prisma.user.create({
          data: {
            firstName: request.firstName,
            lastName: request.lastName,
            email: request.email,
            password: hashedPassword,
            roleId: applicantRole.id
          }
        });

      return user;
    } catch (error) {
      throw error;
    }
  }

  // Create portfolio company with user
  static async createPortfolioCompany(request: CreatePortfolioCompanyRequest) {
    try {
      // Check if registration number already exists
      const existingCompany = await prisma.portfolioCompany.findUnique({
        where: { registrationNumber: request.registrationNumber }
      });

      if (existingCompany) {
        throw new Error("Company with this registration number already exists");
      }

      // Create user first
      const user = await this.createUser({
        firstName: request.firstName,
        lastName: request.lastName,
        email: request.email,
        password: request.password
      });

      // Create portfolio company
      const portfolioCompany = await prisma.portfolioCompany.create({
        data: {
          userId: user.id,
          name: request.name,
          registrationNumber: request.registrationNumber,
          industry: request.industry,
          foundingDate: request.foundingDate,
          address: request.address,
          website: request.website,
          description: request.description,
          logoUrl: request.logoUrl,
          status: request.status || "PENDING",
          companySize: request.companySize,
          employeeCount: request.employeeCount,
          annualRevenue: request.annualRevenue,
          fundingStage: request.fundingStage,
          contactPerson: request.contactPerson,
          contactPhone: request.contactPhone,
          contactEmail: request.contactEmail,
          socialMedia: request.socialMedia
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      return portfolioCompany;
    } catch (error) {
      throw error;
    }
  }

  // Get portfolio company by ID
  static async getPortfolioCompanyById(id: string) {
    try {
      const portfolioCompany = await prisma.portfolioCompany.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!portfolioCompany) {
        throw new Error("Portfolio company not found");
      }

      return portfolioCompany;
    } catch (error) {
      throw error;
    }
  }

  // Get portfolio company by user ID
  static async getPortfolioCompanyByUserId(userId: string) {
    try {
      const portfolioCompany = await prisma.portfolioCompany.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!portfolioCompany) {
        throw new Error("Portfolio company not found for this user");
      }

      return portfolioCompany;
    } catch (error) {
      throw error;
    }
  }

  // Get current user's portfolio company (from authenticated user)
  static async getCurrentUserPortfolioCompany(userId: string) {
    try {
      const portfolioCompany = await prisma.portfolioCompany.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!portfolioCompany) {
        throw new Error("You don't have a portfolio company profile yet");
      }

      return portfolioCompany;
    } catch (error) {
      throw error;
    }
  }

  // Update portfolio company
  static async updatePortfolioCompany(id: string, request: UpdatePortfolioCompanyRequest) {
    try {
      const existingCompany = await prisma.portfolioCompany.findUnique({
        where: { id }
      });

      if (!existingCompany) {
        throw new Error("Portfolio company not found");
      }

      const updatedCompany = await prisma.portfolioCompany.update({
        where: { id },
        data: {
          name: request.name,
          industry: request.industry,
          foundingDate: request.foundingDate,
          address: request.address,
          website: request.website,
          description: request.description,
          logoUrl: request.logoUrl,
          status: request.status,
          companySize: request.companySize,
          employeeCount: request.employeeCount,
          annualRevenue: request.annualRevenue,
          fundingStage: request.fundingStage,
          contactPerson: request.contactPerson,
          contactPhone: request.contactPhone,
          contactEmail: request.contactEmail,
          socialMedia: request.socialMedia
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      return updatedCompany;
    } catch (error) {
      throw error;
    }
  }

  // Update current user's portfolio company
  static async updateCurrentUserPortfolioCompany(userId: string, request: UpdatePortfolioCompanyRequest) {
    try {
      const existingCompany = await prisma.portfolioCompany.findUnique({
        where: { userId }
      });

      if (!existingCompany) {
        throw new Error("You don't have a portfolio company profile yet");
      }

      const updatedCompany = await prisma.portfolioCompany.update({
        where: { userId },
        data: {
          name: request.name,
          industry: request.industry,
          foundingDate: request.foundingDate,
          address: request.address,
          website: request.website,
          description: request.description,
          logoUrl: request.logoUrl,
          status: request.status,
          companySize: request.companySize,
          employeeCount: request.employeeCount,
          annualRevenue: request.annualRevenue,
          fundingStage: request.fundingStage,
          contactPerson: request.contactPerson,
          contactPhone: request.contactPhone,
          contactEmail: request.contactEmail,
          socialMedia: request.socialMedia
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      return updatedCompany;
    } catch (error) {
      throw error;
    }
  }

  // Get all portfolio companies
  static async getAllPortfolioCompanies() {
    try {
      const portfolioCompanies = await prisma.portfolioCompany.findMany({
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return portfolioCompanies;
    } catch (error) {
      throw error;
    }
  }

  // Delete portfolio company
  static async deletePortfolioCompany(id: string) {
    try {
      const existingCompany = await prisma.portfolioCompany.findUnique({
        where: { id },
        include: { user: true }
      });

      if (!existingCompany) {
        throw new Error("Portfolio company not found");
      }

      // Delete the portfolio company (this will cascade to user due to onDelete: Cascade)
      await prisma.portfolioCompany.delete({
        where: { id }
      });

      return { message: "Portfolio company deleted successfully" };
    } catch (error) {
      throw error;
    }
  }
}
