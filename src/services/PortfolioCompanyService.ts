// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";
import bcrypt from "bcryptjs";

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
  
  // New enhanced fields
  fundId?: string;
  startDate?: Date;
  endDate?: Date;
  capTable?: any;
  financialKpis?: any;
  financialHistoryExcel?: any;
  eSign?: any;
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
  
  // New enhanced fields
  fundId?: string;
  startDate?: Date;
  endDate?: Date;
  capTable?: any;
  financialKpis?: any;
  financialHistoryExcel?: any;
  eSign?: any;
}

export interface CreateUserRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface CreatePortfolioCompanyByAdminRequest {
  // User details (optional - can create without user)
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  userId?: string; // If user already exists
  
  // Company details
  name: string;
  registrationNumber?: string; // Made optional for admin creation
  industry?: string; // Made optional for admin creation
  foundingDate?: Date; // Made optional for admin creation
  address?: string; // Made optional for admin creation
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
  
  // Enhanced fields
  fundId?: string;
  startDate?: Date;
  endDate?: Date;
  capTable?: any;
  financialKpis?: any;
  financialHistoryExcel?: any;
  eSign?: any;
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
          status: request.status || "APPROVED",
          companySize: request.companySize,
          employeeCount: request.employeeCount,
          annualRevenue: request.annualRevenue,
          fundingStage: request.fundingStage,
          contactPerson: request.contactPerson,
          contactPhone: request.contactPhone,
          contactEmail: request.contactEmail,
          socialMedia: request.socialMedia,
          // New enhanced fields
          fundId: request.fundId,
          startDate: request.startDate,
          endDate: request.endDate,
          capTable: request.capTable,
          financialKpis: request.financialKpis,
          financialHistoryExcel: request.financialHistoryExcel,
          eSign: request.eSign
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

  // Create portfolio company by admin (with or without user)
  static async createPortfolioCompanyByAdmin(request: CreatePortfolioCompanyByAdminRequest) {
    try {
      // Check if registration number already exists (only if provided)
      if (request.registrationNumber) {
        const existingCompany = await prisma.portfolioCompany.findUnique({
          where: { registrationNumber: request.registrationNumber }
        });

        if (existingCompany) {
          throw new Error("Company with this registration number already exists");
        }
      }

      let userId: string;

      if (request.userId) {
        // Use existing user
        const existingUser = await prisma.user.findUnique({
          where: { id: request.userId }
        });
        
        if (!existingUser) {
          throw new Error("User not found");
        }
        
        userId = request.userId;
      } else if (request.email && request.firstName && request.lastName && request.password) {
        // Create new user
        const user = await this.createUser({
          firstName: request.firstName,
          lastName: request.lastName,
          email: request.email,
          password: request.password
        });
        userId = user.id;
      } else {
        // Create a minimal user for admin-created companies
        const user = await this.createUser({
          firstName: request.firstName || "Admin",
          lastName: request.lastName || "Created",
          email: request.email || `admin-created-${Date.now()}@example.com`,
          password: request.password || "TempPassword123!"
        });
        userId = user.id;
      }

      // Generate registration number if not provided
      const registrationNumber = request.registrationNumber || `REG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      // Handle founding date properly
      let foundingDate: Date;
      if (request.foundingDate) {
        foundingDate = new Date(request.foundingDate);
        // Validate the date
        if (isNaN(foundingDate.getTime())) {
          foundingDate = new Date(); // Fallback to current date if invalid
        }
      } else {
        foundingDate = new Date(); // Default to current date
      }

      // Create portfolio company
      const portfolioCompany = await prisma.portfolioCompany.create({
        data: {
          userId: userId,
          name: request.name,
          registrationNumber: registrationNumber,
          industry: request.industry || "Technology", // Default industry
          foundingDate: foundingDate,
          address: request.address || "Address not provided", // Default address
          website: request.website,
          description: request.description,
          logoUrl: request.logoUrl,
          status: request.status || "ACTIVE",
          companySize: request.companySize,
          employeeCount: request.employeeCount,
          annualRevenue: request.annualRevenue,
          fundingStage: request.fundingStage,
          contactPerson: request.contactPerson,
          contactPhone: request.contactPhone,
          contactEmail: request.contactEmail,
          socialMedia: request.socialMedia,
          // Enhanced fields
          fundId: request.fundId || null,
          startDate: request.startDate ? new Date(request.startDate) : null,
          endDate: request.endDate ? new Date(request.endDate) : null,
          capTable: request.capTable,
          financialKpis: request.financialKpis,
          financialHistoryExcel: request.financialHistoryExcel,
          eSign: request.eSign
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
          },
          fund: {
            select: {
              id: true,
              name: true,
              description: true
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
          },
          fund: {
            select: {
              id: true,
              name: true,
              description: true
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
          },
          fund: {
            select: {
              id: true,
              name: true,
              description: true
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
          },
          fund: {
            select: {
              id: true,
              name: true,
              description: true
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
          socialMedia: request.socialMedia,
          // Enhanced fields
          fundId: request.fundId,
          startDate: request.startDate,
          endDate: request.endDate,
          capTable: request.capTable,
          financialKpis: request.financialKpis,
          financialHistoryExcel: request.financialHistoryExcel,
          eSign: request.eSign
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
          },
          fund: {
            select: {
              id: true,
              name: true,
              description: true
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
          socialMedia: request.socialMedia,
          // Enhanced fields
          fundId: request.fundId,
          startDate: request.startDate,
          endDate: request.endDate,
          capTable: request.capTable,
          financialKpis: request.financialKpis,
          financialHistoryExcel: request.financialHistoryExcel,
          eSign: request.eSign
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
          },
          fund: {
            select: {
              id: true,
              name: true,
              description: true
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
          },
          fund: {
            select: {
              id: true,
              name: true,
              description: true
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

  /**
   * Get all portfolio companies with investment amounts (total disbursed)
   */
  static async getAllPortfolioCompaniesWithInvestments() {
    try {
      const portfolioCompanies = await prisma.portfolioCompany.findMany({
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          fund: {
            select: {
              id: true,
              name: true,
              description: true
            }
          },
          investmentImplementation: {
            include: {
              fund: {
                select: {
                  id: true,
                  name: true,
                  description: true
                }
              },
              fundDisbursements: {
                select: {
                  id: true,
                  amount: true,
                  disbursementDate: true,
                  disbursementType: true,
                  status: true
                },
                orderBy: { disbursementDate: 'desc' }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Calculate total investment for each company
      const companiesWithInvestments = portfolioCompanies.map(company => {
        // Get ALL disbursements (not filtered)
        const allDisbursements = company.investmentImplementation?.fundDisbursements || [];
        
        // Calculate total invested from APPROVED and DISBURSED only
        const totalInvested = allDisbursements
          .filter(d => d.status === 'APPROVED' || d.status === 'DISBURSED')
          .reduce((sum, d) => {
            return sum + Number(d.amount);
          }, 0);

        // Determine status based on fund disbursements only
        // Priority: DISBURSED > APPROVED > PENDING > NO_INVESTMENT
        let disbursementStatus = 'NO_INVESTMENT';
        if (allDisbursements.length > 0) {
          const hasDisbursed = allDisbursements.some(d => d.status === 'DISBURSED');
          const hasApproved = allDisbursements.some(d => d.status === 'APPROVED');
          const hasPending = allDisbursements.some(d => d.status === 'PENDING');
          
          if (hasDisbursed) {
            disbursementStatus = 'DISBURSED';
          } else if (hasApproved) {
            disbursementStatus = 'APPROVED';
          } else if (hasPending) {
            disbursementStatus = 'PENDING';
          }
        }

        // Use fund from investmentImplementation if available, otherwise from portfolioCompany
        const fund = company.investmentImplementation?.fund || company.fund;

        return {
          id: company.id,
          name: company.name,
          registrationNumber: company.registrationNumber,
          industry: company.industry,
          status: disbursementStatus, // Status based on fund disbursements only
          fund: fund,
          user: company.user,
          totalInvested: totalInvested,
          disbursements: allDisbursements, // Return ALL disbursements, not just approved/disbursed
          startDate: company.startDate,
          endDate: company.endDate,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt
        };
      });

      // Endpoint is "with-investments": exclude companies that have no investment activity
      // (i.e. no disbursements at all). A company is considered "with investments" when it
      // has at least one disbursement in any state (PENDING/APPROVED/DISBURSED).
      const onlyWithInvestments = companiesWithInvestments.filter(
        c => c.status !== 'NO_INVESTMENT'
      );

      return onlyWithInvestments;
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
