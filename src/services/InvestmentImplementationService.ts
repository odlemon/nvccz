//@ts-nocheck
import { PrismaClient, InvestmentImplementation, InvestmentMilestone, FundDisbursement } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '../utils/database';
import { CashbookService } from './CashbookService';

export interface CreateInvestmentImplementationRequest {
  portfolioCompanyId: string;
  applicationId: string;
  fundId: string; // Required - must link to a fund
  initiatedById: string;
  implementationPlan?: string;
  notes?: string;
  disbursementMode?: 'ONE_TIME' | 'MILESTONE_BASED'; // Optional: defaults to ONE_TIME
  totalCommittedAmount?: number; // Required if MILESTONE_BASED
}

export interface CreateMilestoneRequest {
  title: string;
  description: string;
  amount: number;
  dueDate: Date;
  deliverables?: string;
}

export interface CreateFundDisbursementRequest {
  investmentImplementationId: string;
  milestoneId?: string;
  amount: number;
  disbursementDate: Date;
  disbursementType: string; // INITIAL, MILESTONE, FINAL
  notes?: string;
}

export interface DisbursementSummary {
  totalCommittedAmount: number;
  totalDisbursedAmount: number;
  remainingCommittedAmount: number;
  disbursementCount: number;
  disbursementMode: string;
  disbursements: FundDisbursement[];
}

export interface InvestmentImplementationWithRelations extends InvestmentImplementation {
  portfolioCompany: {
    id: string;
    name: string;
    industry: string;
    status: string;
  };
  application: {
    id: string;
    businessName: string;
    applicantName: string;
    applicantEmail: string;
    currentStage: string;
  };
  fund?: {
    id: string;
    name: string;
    totalAmount: any;
  };
  initiatedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  milestones: InvestmentMilestone[];
  fundDisbursements: FundDisbursement[];
}

export class InvestmentImplementationService {
  /**
   * Get applications with signed term sheets
   */
  static async getApplicationsWithSignedTermSheets(
    page: number = 1,
    limit: number = 10
  ): Promise<{ applications: any[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;

      const [applications, total] = await Promise.all([
        prisma.application.findMany({
          where: {
            termSheet: {
              isSigned: true
            },
            currentStage: "INVESTMENT_IMPLEMENTATION"
          },
          skip,
          take: limit,
          orderBy: { updatedAt: 'desc' },
          include: {
            termSheet: {
              select: {
                id: true,
                title: true,
                investmentAmount: true,
                signedAt: true,
                status: true
              }
            },
            investmentImplementation: {
              select: {
                id: true,
                portfolioCompanyId: true
              }
            }
          }
        }),
        prisma.application.count({
          where: {
            termSheet: {
              isSigned: true
            },
            currentStage: "INVESTMENT_IMPLEMENTATION"
          }
        })
      ]);

      // Get applicant emails from applications
      const applicantEmails = applications.map(app => app.applicantEmail);

      // Find users by applicant emails
      const users = await prisma.user.findMany({
        where: {
          email: {
            in: applicantEmails
          }
        },
        select: {
          id: true,
          email: true
        }
      });

      // Create a map of email to user ID
      const userMap = new Map(users.map(user => [user.email, user.id]));

      // Find portfolio companies for these users
      const userIds = users.map(user => user.id);
      const portfolioCompanies = userIds.length > 0 
        ? await prisma.portfolioCompany.findMany({
            where: {
              userId: {
                in: userIds
              }
            },
            select: {
              id: true,
              userId: true,
              name: true,
              industry: true,
              status: true,
              registrationNumber: true,
              foundingDate: true,
              address: true,
              website: true,
              description: true,
              companySize: true,
              employeeCount: true,
              annualRevenue: true,
              fundingStage: true,
              contactPerson: true,
              contactPhone: true,
              contactEmail: true
            }
          })
        : [];

      // Create a map for quick lookup by user ID
      const portfolioCompanyMap = new Map(
        portfolioCompanies.map(pc => [pc.userId, pc])
      );

      // Attach portfolio company data to applications
      const applicationsWithPortfolioCompanies = applications.map(app => {
        const userId = userMap.get(app.applicantEmail);
        const portfolioCompany = userId ? portfolioCompanyMap.get(userId) : null;
        
        return {
          ...app,
          portfolioCompanyId: portfolioCompany?.id || null,
          portfolioCompany: portfolioCompany || null
        };
      });

      const totalPages = Math.ceil(total / limit);

      return {
        applications: applicationsWithPortfolioCompanies,
        total,
        page,
        totalPages
      };
    } catch (error: any) {
      throw new Error(`Failed to get applications with signed term sheets: ${error.message}`);
    }
  }

  /**
   * Initiate investment implementation
   */
  static async initiateInvestmentImplementation(params: CreateInvestmentImplementationRequest): Promise<InvestmentImplementationWithRelations> {
    try {
             // Validate that application exists and has signed term sheet
       const application = await prisma.application.findUnique({
         where: { id: params.applicationId },
         include: {
           termSheet: true
         }
       });

      if (!application) {
        throw new Error("Application not found");
      }

      if (!application.termSheet || !application.termSheet.isSigned) {
        throw new Error("Application must have a signed term sheet to initiate investment implementation");
      }

      if (application.currentStage !== "INVESTMENT_IMPLEMENTATION") {
        throw new Error("Application must be in INVESTMENT_IMPLEMENTATION stage. Current stage: " + application.currentStage);
      }

      // Check if investment implementation already exists
      const existingImplementation = await prisma.investmentImplementation.findUnique({
        where: { portfolioCompanyId: params.portfolioCompanyId }
      });

      if (existingImplementation) {
        throw new Error("Investment implementation already exists for this portfolio company");
      }

      // Validate milestone-based disbursement requirements
      if (params.disbursementMode === 'MILESTONE_BASED') {
        if (!params.totalCommittedAmount || params.totalCommittedAmount <= 0) {
          throw new Error("totalCommittedAmount is required when disbursementMode is MILESTONE_BASED");
        }
      }

                           // Create investment implementation
        const implementation = await prisma.investmentImplementation.create({
          data: {
            portfolioCompanyId: params.portfolioCompanyId,
            applicationId: params.applicationId,
            fundId: params.fundId, // Link to the fund
            initiatedById: params.initiatedById,
            implementationPlan: params.implementationPlan,
            notes: params.notes,
            disbursementMode: params.disbursementMode || 'ONE_TIME',
            totalCommittedAmount: params.totalCommittedAmount ? new Decimal(params.totalCommittedAmount) : null,
            status: "IN_PROGRESS"
          },
        include: {
          portfolioCompany: {
            select: {
              id: true,
              name: true,
              industry: true,
              status: true
            }
          },
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true
            }
          },
          fund: {
            select: {
              id: true,
              name: true,
              totalAmount: true
            }
          },
          initiatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          milestones: true,
          fundDisbursements: true
        }
      });

      // Create notification for applicant
      await prisma.applicationNotification.create({
        data: {
          applicationId: params.applicationId,
          recipientEmail: application.applicantEmail,
          recipientPhone: application.applicantPhone,
          notificationType: "INVESTMENT_IMPLEMENTATION_STARTED",
          title: "Investment Implementation Started",
          message: `Investment implementation has been initiated for your application (${application.businessName}). The management team will now begin the implementation process.`
        }
      });

      return implementation;
    } catch (error: any) {
      throw new Error(`Failed to initiate investment implementation: ${error.message}`);
    }
  }

  /**
   * Get investment implementation by portfolio company ID
   */
  static async getInvestmentImplementationByPortfolioCompanyId(portfolioCompanyId: string): Promise<InvestmentImplementationWithRelations | null> {
    try {
      const implementation = await prisma.investmentImplementation.findUnique({
        where: { portfolioCompanyId },
        include: {
          portfolioCompany: {
            select: {
              id: true,
              name: true,
              industry: true,
              status: true
            }
          },
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true
            }
          },
          fund: {
            select: {
              id: true,
              name: true,
              totalAmount: true
            }
          },
          initiatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          milestones: {
            orderBy: { dueDate: 'asc' }
          },
          fundDisbursements: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      return implementation;
    } catch (error: any) {
      throw new Error(`Failed to get investment implementation: ${error.message}`);
    }
  }

  /**
   * Update implementation checklist
   */
  static async updateImplementationChecklist(
    portfolioCompanyId: string,
    updates: {
      finalDueDiligence?: boolean;
      contractsSigned?: boolean;
      fundsDisbursed?: boolean;
      notes?: string;
    }
  ): Promise<InvestmentImplementationWithRelations> {
    try {
      const implementation = await prisma.investmentImplementation.findUnique({
        where: { portfolioCompanyId }
      });

      if (!implementation) {
        throw new Error("Investment implementation not found");
      }

      const updatedImplementation = await prisma.investmentImplementation.update({
        where: { portfolioCompanyId },
        data: {
          ...updates,
          updatedAt: new Date()
        },
        include: {
          portfolioCompany: {
            select: {
              id: true,
              name: true,
              industry: true,
              status: true
            }
          },
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true
            }
          },
          fund: {
            select: {
              id: true,
              name: true,
              totalAmount: true
            }
          },
          initiatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          milestones: {
            orderBy: { dueDate: 'asc' }
          },
          fundDisbursements: {
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      return updatedImplementation;
    } catch (error: any) {
      throw new Error(`Failed to update implementation checklist: ${error.message}`);
    }
  }

  /**
   * Add milestone to implementation
   */
  static async addMilestone(
    portfolioCompanyId: string,
    milestoneData: CreateMilestoneRequest
  ): Promise<InvestmentMilestone> {
    try {
      const implementation = await prisma.investmentImplementation.findUnique({
        where: { portfolioCompanyId }
      });

      if (!implementation) {
        throw new Error("Investment implementation not found");
      }

      const milestone = await prisma.investmentMilestone.create({
        data: {
          investmentImplementationId: implementation.id,
          title: milestoneData.title,
          description: milestoneData.description,
          amount: new Decimal(milestoneData.amount),
          dueDate: milestoneData.dueDate,
          deliverables: milestoneData.deliverables
        }
      });

      return milestone;
    } catch (error: any) {
      throw new Error(`Failed to add milestone: ${error.message}`);
    }
  }

  /**
   * Complete milestone
   */
  static async completeMilestone(
    milestoneId: string,
    notes?: string
  ): Promise<InvestmentMilestone> {
    try {
      const milestone = await prisma.investmentMilestone.findUnique({
        where: { id: milestoneId }
      });

      if (!milestone) {
        throw new Error("Milestone not found");
      }

      if (milestone.isCompleted) {
        throw new Error("Milestone is already completed");
      }

      const updatedMilestone = await prisma.investmentMilestone.update({
        where: { id: milestoneId },
        data: {
          isCompleted: true,
          completedAt: new Date(),
          notes: notes,
          updatedAt: new Date()
        }
      });

      return updatedMilestone;
    } catch (error: any) {
      throw new Error(`Failed to complete milestone: ${error.message}`);
    }
  }

  /**
   * Get disbursement summary for an investment implementation
   */
  static async getDisbursementSummary(investmentImplementationId: string): Promise<DisbursementSummary> {
    try {
      const implementation = await prisma.investmentImplementation.findUnique({
        where: { id: investmentImplementationId },
        include: {
          fundDisbursements: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!implementation) {
        throw new Error("Investment implementation not found");
      }

      // Calculate total disbursed (only APPROVED or DISBURSED status)
      const totalDisbursed = implementation.fundDisbursements
        .filter(d => d.status === 'APPROVED' || d.status === 'DISBURSED')
        .reduce((sum, d) => sum.plus(d.amount), new Decimal(0));

      const totalCommitted = implementation.totalCommittedAmount || new Decimal(0);
      const remainingCommitted = totalCommitted.minus(totalDisbursed);

      // Map disbursements to exclude disbursedAt field
      const disbursements = implementation.fundDisbursements.map(d => {
        const { disbursedAt, ...rest } = d;
        return rest;
      });

      return {
        totalCommittedAmount: Number(totalCommitted),
        totalDisbursedAmount: Number(totalDisbursed),
        remainingCommittedAmount: Number(remainingCommitted),
        disbursementCount: implementation.fundDisbursements.length,
        disbursementMode: implementation.disbursementMode || 'ONE_TIME',
        disbursements: disbursements
      };
    } catch (error: any) {
      throw new Error(`Failed to get disbursement summary: ${error.message}`);
    }
  }

  /**
   * Create fund disbursement
   * Supports both ONE_TIME and MILESTONE_BASED disbursement modes
   */
  static async createFundDisbursement(params: CreateFundDisbursementRequest): Promise<FundDisbursement> {
    try {
      // Get the investment implementation to find the associated fund
      const implementation = await prisma.investmentImplementation.findUnique({
        where: { id: params.investmentImplementationId },
        include: { 
          fund: true,
          fundDisbursements: {
            where: {
              status: { in: ['APPROVED', 'DISBURSED'] }
            }
          }
        }
      });

      if (!implementation) {
        throw new Error("Investment implementation not found");
      }

      if (!implementation.fund) {
        throw new Error("Investment implementation is not associated with a fund");
      }

      const disbursementAmount = new Decimal(params.amount);
      const disbursementMode = implementation.disbursementMode || 'ONE_TIME';

      // Validate fund has sufficient remaining amount
      if (implementation.fund.remainingAmount.lessThan(disbursementAmount)) {
        throw new Error("Insufficient funds available in fund for disbursement");
      }

      // For MILESTONE_BASED disbursements, validate against committed amount
      if (disbursementMode === 'MILESTONE_BASED') {
        if (!implementation.totalCommittedAmount) {
          throw new Error("Total committed amount must be set for milestone-based disbursements");
        }

        // Calculate total already disbursed
        const totalDisbursed = implementation.fundDisbursements.reduce(
          (sum, d) => sum.plus(d.amount),
          new Decimal(0)
        );

        // Calculate remaining committed amount
        const remainingCommitted = implementation.totalCommittedAmount.minus(totalDisbursed);

        // Validate this disbursement doesn't exceed remaining committed amount
        if (remainingCommitted.lessThan(disbursementAmount)) {
          throw new Error(
            `Insufficient remaining committed amount. Remaining: $${remainingCommitted.toFixed(2)}, Requested: $${disbursementAmount.toFixed(2)}`
          );
        }
      }

      // Create disbursement
      const disbursement = await prisma.fundDisbursement.create({
        data: {
          fundId: implementation.fund.id,
          investmentImplementationId: params.investmentImplementationId,
          milestoneId: params.milestoneId,
          amount: disbursementAmount,
          disbursementDate: params.disbursementDate,
          disbursementType: params.disbursementType,
          notes: params.notes,
          status: "PENDING"
        }
      });

      return disbursement;
    } catch (error: any) {
      throw new Error(`Failed to create fund disbursement: ${error.message}`);
    }
  }

  /**
   * Approve fund disbursement
   * Creates a cashbook payment entry which automatically creates a journal entry:
   * - Debit: 1501 - Portfolio Investments
   * - Credit: 1010 - Main Bank Account (Main Bank Account)
   */
  static async approveFundDisbursement(
    disbursementId: string,
    approvedById: string
  ): Promise<FundDisbursement> {
    try {
      const disbursement = await prisma.fundDisbursement.findUnique({
        where: { id: disbursementId },
        include: {
          fund: true,
          investmentImplementation: {
            include: {
              portfolioCompany: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!disbursement) {
        throw new Error("Fund disbursement not found");
      }

      if (disbursement.status !== "PENDING") {
        throw new Error("Fund disbursement is not in pending status");
      }

      // Check if fund has sufficient remaining amount
      if (disbursement.fund.remainingAmount.lessThan(disbursement.amount)) {
        throw new Error("Insufficient funds available for disbursement");
      }

      // Get Portfolio Investments account (1501) for GL payment
      const portfolioInvestmentAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: "1501" },
            { accountName: { contains: "Portfolio Investment" } }
          ],
          isActive: true
        }
      });

      if (!portfolioInvestmentAccount) {
        throw new Error("Portfolio Investments account (1501) not found in chart of accounts. Please create this account first.");
      }

      // Get Main Bank Account (1010) - need to find the Bank record, not just the GL account
      const bankGLAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [
            { accountNo: "1010" },
            { accountName: { contains: "Main Bank Account" } }
          ],
          isActive: true
        }
      });

      if (!bankGLAccount) {
        throw new Error("Main Bank Account (1010) not found in chart of accounts. Please create this account first.");
      }

      // Find the bank record linked to this GL account
      const bank = await prisma.bank.findFirst({
        where: {
          glAccountId: bankGLAccount.id,
          isActive: true
        },
        include: {
          currency: true
        }
      });

      if (!bank) {
        throw new Error("Bank account linked to Main Bank Account (1010) not found. Please create a bank account linked to GL account 1010.");
      }

      const disbursementAmount = Number(disbursement.amount);
      const portfolioCompanyName = disbursement.investmentImplementation?.portfolioCompany?.name || "Portfolio Company";

      // Create cashbook payment entry - this will automatically create the journal entry
      const cashbookResult = await CashbookService.createCashPayment({
        bankId: bank.id,
        transactionDate: disbursement.disbursementDate,
        description: `Fund Disbursement - ${portfolioCompanyName} - $${disbursementAmount.toLocaleString()}`,
        amount: disbursementAmount,
        reference: `FD-${disbursementId.substring(0, 8).toUpperCase()}`,
        counterpartyType: 'GL', // GL payment (not customer or supplier)
        glAccountId: portfolioInvestmentAccount.id, // Debit Portfolio Investments
        createdById: approvedById
      });

      if (!cashbookResult.success || !cashbookResult.transaction) {
        throw new Error(cashbookResult.message || "Failed to create cashbook payment");
      }

      // Update journal entry description to use "Bank" instead of "Cashbook PAYMENT"
      if (cashbookResult.journalEntry) {
        await prisma.journalEntry.update({
          where: { id: cashbookResult.journalEntry.id },
          data: {
            description: `Bank Payment: Fund Disbursement - ${portfolioCompanyName} - $${disbursementAmount.toLocaleString()}`
          }
        });
      }

      // Update disbursement status and fund remaining amount in a transaction
      const [updatedDisbursement, updatedFund] = await prisma.$transaction([
        prisma.fundDisbursement.update({
          where: { id: disbursementId },
          data: {
            status: "APPROVED",
            approvedById: approvedById,
            approvedAt: new Date(),
            cashbookEntryId: cashbookResult.transaction.id, // Link to cashbook entry
            updatedAt: new Date()
          }
        }),
        prisma.fund.update({
          where: { id: disbursement.fundId },
          data: {
            remainingAmount: disbursement.fund.remainingAmount.minus(disbursement.amount),
            updatedAt: new Date()
          }
        })
      ]);

      console.log(`✅ Fund disbursement approved and cashbook payment created:`);
      console.log(`   Cashbook Entry: ${cashbookResult.transaction.id}`);
      if (cashbookResult.journalEntry) {
        console.log(`   Journal Entry: ${cashbookResult.journalEntry.referenceNumber}`);
      }
      console.log(`   Debit: ${portfolioInvestmentAccount.accountNo} - ${portfolioInvestmentAccount.accountName} - $${disbursementAmount.toLocaleString()}`);
      console.log(`   Credit: ${bankGLAccount.accountNo} - ${bankGLAccount.accountName} - $${disbursementAmount.toLocaleString()}`);
      console.log(`   ✅ Balanced: Debit = Credit = $${disbursementAmount.toLocaleString()}`);

      return updatedDisbursement;
    } catch (error: any) {
      throw new Error(`Failed to approve fund disbursement: ${error.message}`);
    }
  }

  /**
   * Mark disbursement as disbursed
   */
  static async markDisbursementAsDisbursed(
    disbursementId: string,
    disbursedById: string,
    transactionReference?: string
  ): Promise<FundDisbursement> {
    try {
      const disbursement = await prisma.fundDisbursement.findUnique({
        where: { id: disbursementId },
        include: {
          investmentImplementation: {
            select: {
              id: true,
              applicationId: true,
              portfolioCompanyId: true,
              status: true,
              fundsDisbursed: true
            }
          }
        }
      });

      if (!disbursement) {
        throw new Error("Fund disbursement not found");
      }

      if (disbursement.status !== "APPROVED") {
        throw new Error("Fund disbursement must be approved before marking as disbursed");
      }

      const implementation = disbursement.investmentImplementation;
      if (!implementation) {
        throw new Error("Associated investment implementation not found");
      }

      const updatedDisbursement = await prisma.$transaction(async (tx) => {
        const disbursed = await tx.fundDisbursement.update({
          where: { id: disbursementId },
          data: {
            status: "DISBURSED",
            disbursedById: disbursedById,
            disbursedAt: new Date(),
            transactionReference: transactionReference,
            updatedAt: new Date()
          }
        });

        const remaining = await tx.fundDisbursement.count({
          where: {
            investmentImplementationId: implementation.id,
            status: {
              not: "DISBURSED"
            }
          }
        });

        if (remaining === 0) {
          await tx.investmentImplementation.update({
            where: { id: implementation.id },
            data: {
              fundsDisbursed: true,
              status: "COMPLETED",
              completedAt: new Date(),
              updatedAt: new Date()
            }
          });

          if (implementation.applicationId) {
            await tx.application.update({
              where: { id: implementation.applicationId },
              data: {
                currentStage: "DISBURSED",
                updatedAt: new Date()
              }
            });
          }
        }

        return disbursed;
      });

      return updatedDisbursement;
    } catch (error: any) {
      throw new Error(`Failed to mark disbursement as disbursed: ${error.message}`);
    }
  }

  /**
   * Get all investment implementations (for admin/fund manager)
   */
  static async getAllInvestmentImplementations(
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<{ implementations: InvestmentImplementationWithRelations[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const where: any = {};
      if (status) where.status = status;

      const [implementations, total] = await Promise.all([
        prisma.investmentImplementation.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            portfolioCompany: {
              select: {
                id: true,
                name: true,
                industry: true,
                status: true,
                registrationNumber: true,
                foundingDate: true,
                address: true,
                website: true,
                description: true,
                companySize: true,
                employeeCount: true,
                annualRevenue: true,
                fundingStage: true,
                contactPerson: true,
                contactPhone: true,
                contactEmail: true
              }
            },
            application: {
              select: {
                id: true,
                businessName: true,
                applicantName: true,
                applicantEmail: true,
                currentStage: true
              }
            },
            fund: {
              select: {
                id: true,
                name: true,
                totalAmount: true
              }
            },
            initiatedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            milestones: {
              orderBy: { dueDate: 'asc' }
            },
            fundDisbursements: {
              orderBy: { createdAt: 'desc' }
            }
          }
        }),
        prisma.investmentImplementation.count({ where })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        implementations,
        total,
        page,
        totalPages
      };
    } catch (error: any) {
      throw new Error(`Failed to get investment implementations: ${error.message}`);
    }
  }
}
