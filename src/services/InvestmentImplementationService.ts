//@ts-nocheck
import { PrismaClient, InvestmentImplementation, InvestmentMilestone, FundDisbursement } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '../utils/database';
import { FUND_DISBURSEMENT_COMPLIANCE_BLOCKED_MESSAGE } from '../config/applicationStatutoryCompliance';
import { CashbookService } from './CashbookService';
import { EmailNotificationService } from './EmailNotificationService';
import { MultiCurrencyService } from './MultiCurrencyService';

function assertApplicationComplianceForDisbursement(
  app: { complianceCleared?: boolean } | null | undefined
): void {
  if (!app?.complianceCleared) {
    throw new Error(FUND_DISBURSEMENT_COMPLIANCE_BLOCKED_MESSAGE);
  }
}

export interface CreateInvestmentImplementationRequest {
  portfolioCompanyId: string;
  applicationId: string;
  fundId: string; // Required - must link to a fund
  initiatedById: string;
  implementationPlan?: string;
  notes?: string;
  disbursementMode?: 'ONE_TIME' | 'MILESTONE_BASED'; // Optional: defaults to ONE_TIME
  totalCommittedAmount?: number; // Required if MILESTONE_BASED
  /** IC cap / commitment currency (defaults to system default currency or USD). */
  commitmentCurrencyId?: string;
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
  /**
   * Payout currency for `amount`. When omitted, same as implementation commitment currency.
   * Cross-currency uses latest system rate from `exchange_rates` as of disbursementDate (not manual).
   */
  paymentCurrencyId?: string;
}

export type DisbursementListItem = FundDisbursement & {
  trancheIndex: number;
  cfoApprovalStatusLabel?: string;
};

export interface DisbursementSummary {
  totalCommittedAmount: number;
  totalDisbursedAmount: number;
  remainingCommittedAmount: number;
  /** Same as remainingCommittedAmount (UAT: undrawn commitment). */
  undrawnCommittedAmount: number;
  /** Sum of PENDING tranches in commitment currency (reserves cap). */
  pendingCommitmentAmount: number;
  commitmentCurrencyCode: string | null;
  disbursementCount: number;
  disbursementMode: string;
  disbursements: DisbursementListItem[];
  complianceCleared: boolean;
  kycVerified: boolean;
  disbursementBlockedReason: string | null;
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
  /** Amount in commitment / IC cap currency for a disbursement row (legacy rows: amount only). */
  private static commitmentEquivalent(d: { amount: unknown; amountCommitmentCurrency?: unknown }): Decimal {
    if (d.amountCommitmentCurrency != null && d.amountCommitmentCurrency !== undefined) {
      return new Decimal(d.amountCommitmentCurrency as any);
    }
    return new Decimal(d.amount as any);
  }

  private static async resolveCommitmentCurrencyIdForImplementation(implementation: {
    commitmentCurrencyId?: string | null;
  }): Promise<string> {
    if (implementation.commitmentCurrencyId) {
      return implementation.commitmentCurrencyId;
    }
    const cur =
      (await prisma.currency.findFirst({ where: { isDefault: true } })) ||
      (await prisma.currency.findFirst({ where: { code: "USD" } }));
    if (!cur) {
      throw new Error(
        "No commitment currency on implementation and no default/USD currency in system. Set InvestmentImplementation.commitmentCurrencyId or configure currencies."
      );
    }
    return cur.id;
  }

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

      let commitmentCurrencyId: string;
      if (params.commitmentCurrencyId) {
        const cc = await prisma.currency.findFirst({
          where: { id: params.commitmentCurrencyId, isActive: true }
        });
        if (!cc) {
          throw new Error("commitmentCurrencyId is not a valid active currency");
        }
        commitmentCurrencyId = cc.id;
      } else {
        commitmentCurrencyId =
          await InvestmentImplementationService.resolveCommitmentCurrencyIdForImplementation({
            commitmentCurrencyId: null
          });
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
            commitmentCurrencyId,
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
          application: {
            select: {
              id: true,
              complianceCleared: true,
              kycVerified: true
            }
          },
          commitmentCurrency: { select: { code: true } },
          fundDisbursements: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!implementation) {
        throw new Error("Investment implementation not found");
      }

      const totalDisbursed = implementation.fundDisbursements
        .filter((d) => d.status === "APPROVED" || d.status === "DISBURSED")
        .reduce((sum, d) => sum.plus(InvestmentImplementationService.commitmentEquivalent(d)), new Decimal(0));

      const pendingCommitment = implementation.fundDisbursements
        .filter((d) => d.status === "PENDING")
        .reduce((sum, d) => sum.plus(InvestmentImplementationService.commitmentEquivalent(d)), new Decimal(0));

      const totalCommitted = implementation.totalCommittedAmount || new Decimal(0);
      const remainingCommitted = totalCommitted.minus(totalDisbursed);

      const sorted = [...implementation.fundDisbursements].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const trancheById = new Map(sorted.map((d, i) => [d.id, i + 1]));

      const disbursements: DisbursementListItem[] = implementation.fundDisbursements.map((d) => {
        const { disbursedAt, ...rest } = d;
        const trancheIndex = trancheById.get(d.id) ?? 1;
        let cfoApprovalStatusLabel: string | undefined;
        if (d.status === "PENDING") cfoApprovalStatusLabel = "PENDING_CFO_APPROVAL";
        else if (d.status === "REJECTED") cfoApprovalStatusLabel = "REJECTED";
        return { ...rest, trancheIndex, cfoApprovalStatusLabel };
      });

      const cleared = Boolean(implementation.application?.complianceCleared);
      const kyc = Boolean(implementation.application?.kycVerified);
      const remainingNum = Number(remainingCommitted);

      return {
        totalCommittedAmount: Number(totalCommitted),
        totalDisbursedAmount: Number(totalDisbursed),
        remainingCommittedAmount: remainingNum,
        undrawnCommittedAmount: remainingNum,
        pendingCommitmentAmount: Number(pendingCommitment),
        commitmentCurrencyCode: implementation.commitmentCurrency?.code ?? null,
        disbursementCount: implementation.fundDisbursements.length,
        disbursementMode: implementation.disbursementMode || "ONE_TIME",
        disbursements,
        complianceCleared: cleared,
        kycVerified: kyc,
        disbursementBlockedReason: cleared ? null : FUND_DISBURSEMENT_COMPLIANCE_BLOCKED_MESSAGE
      };
    } catch (error: any) {
      throw new Error(`Failed to get disbursement summary: ${error.message}`);
    }
  }

  /**
   * Create fund disbursement
   * Supports both ONE_TIME and MILESTONE_BASED disbursement modes
   */
  static async createFundDisbursement(
    params: CreateFundDisbursementRequest
  ): Promise<DisbursementListItem> {
    try {
      const implementation = await prisma.investmentImplementation.findUnique({
        where: { id: params.investmentImplementationId },
        include: {
          fund: true,
          application: {
            select: {
              id: true,
              complianceCleared: true
            }
          },
          fundDisbursements: {
            where: {
              status: { in: ["PENDING", "APPROVED", "DISBURSED"] }
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

      assertApplicationComplianceForDisbursement(implementation.application);

      const commitmentCurrencyId =
        await InvestmentImplementationService.resolveCommitmentCurrencyIdForImplementation(implementation);

      let paymentCurrencyId = params.paymentCurrencyId || commitmentCurrencyId;
      if (params.paymentCurrencyId) {
        const pc = await prisma.currency.findFirst({
          where: { id: params.paymentCurrencyId, isActive: true }
        });
        if (!pc) {
          throw new Error("paymentCurrencyId is not a valid active currency");
        }
        paymentCurrencyId = pc.id;
      }

      const disbursementAmount = new Decimal(params.amount);
      if (disbursementAmount.lte(0)) {
        throw new Error("Disbursement amount must be positive");
      }

      const conv = await MultiCurrencyService.convertCurrency({
        amount: Number(disbursementAmount),
        fromCurrencyId: paymentCurrencyId,
        toCurrencyId: commitmentCurrencyId,
        date: params.disbursementDate
      });
      const amountCommitmentCurrency = new Decimal(conv.convertedAmount);
      const appliedRate = new Decimal(conv.exchangeRate);

      const disbursementMode = implementation.disbursementMode || "ONE_TIME";

      if (implementation.fund.remainingAmount.lessThan(amountCommitmentCurrency)) {
        throw new Error("Insufficient funds available in fund for disbursement (commitment-currency equivalent)");
      }

      if (disbursementMode === "MILESTONE_BASED" && !implementation.totalCommittedAmount) {
        throw new Error("Total committed amount must be set for milestone-based disbursements");
      }

      if (implementation.totalCommittedAmount) {
        const reserved = implementation.fundDisbursements.reduce(
          (sum, d) => sum.plus(InvestmentImplementationService.commitmentEquivalent(d)),
          new Decimal(0)
        );
        const remainingCap = implementation.totalCommittedAmount.minus(reserved);
        if (remainingCap.lessThan(amountCommitmentCurrency)) {
          throw new Error(
            `Insufficient remaining committed amount (IC cap). Remaining: ${remainingCap.toFixed(2)}, this tranche (commitment CCY): ${amountCommitmentCurrency.toFixed(2)}`
          );
        }
      }

      const priorCount = await prisma.fundDisbursement.count({
        where: { investmentImplementationId: params.investmentImplementationId }
      });
      const trancheIndex = priorCount + 1;

      const disbursement = await prisma.fundDisbursement.create({
        data: {
          fundId: implementation.fund.id,
          investmentImplementationId: params.investmentImplementationId,
          milestoneId: params.milestoneId,
          amount: disbursementAmount,
          disbursementDate: params.disbursementDate,
          disbursementType: params.disbursementType,
          notes: params.notes,
          status: "PENDING",
          paymentCurrencyId,
          commitmentCurrencyId,
          amountCommitmentCurrency,
          appliedExchangeRate: appliedRate
        }
      });

      void InvestmentImplementationService.notifyCfosOfPendingDisbursement(
        disbursement.id,
        trancheIndex
      ).catch((e) => console.error("notifyCfosOfPendingDisbursement:", e));

      return {
        ...disbursement,
        trancheIndex,
        cfoApprovalStatusLabel: "PENDING_CFO_APPROVAL" as const
      };
    } catch (error: any) {
      throw new Error(`Failed to create fund disbursement: ${error.message}`);
    }
  }

  /**
   * Email all users with CFO role after a tranche is created (PENDING).
   */
  static async notifyCfosOfPendingDisbursement(
    disbursementId: string,
    trancheIndex: number
  ): Promise<void> {
    const d = await prisma.fundDisbursement.findUnique({
      where: { id: disbursementId },
      include: {
        paymentCurrency: { select: { code: true } },
        investmentImplementation: {
          include: {
            application: { select: { businessName: true, dealReference: true } },
            portfolioCompany: { select: { name: true } }
          }
        }
      }
    });
    if (!d || d.status !== "PENDING") return;

    const cfos = await prisma.user.findMany({
      where: {
        OR: [
          { roleCode: "CFO" },
          { role: { name: "Chief Financial Officer" } },
          { role: { name: "CFO" } }
        ]
      },
      select: { email: true, firstName: true, lastName: true }
    });
    if (cfos.length === 0) {
      console.warn("No CFO users found for pending disbursement notification");
      return;
    }

    const businessName =
      d.investmentImplementation.application?.businessName || "Unknown business";
    const portfolioCompanyName =
      d.investmentImplementation.portfolioCompany?.name || "—";
    const dealReference = d.investmentImplementation.application?.dealReference ?? null;
    const code = d.paymentCurrency?.code || "USD";
    const amountDisplay = `${code} ${Number(d.amount).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;

    await Promise.all(
      cfos.map((u) =>
        EmailNotificationService.sendFundDisbursementPendingCfoEmail({
          recipientName: [u.firstName, u.lastName].filter(Boolean).join(" ") || "CFO",
          recipientEmail: u.email,
          businessName,
          portfolioCompanyName,
          dealReference,
          amountDisplay,
          trancheIndex,
          disbursementId: d.id,
          investmentImplementationId: d.investmentImplementationId,
          disbursementDate: d.disbursementDate
        })
      )
    );
  }

  /**
   * All PENDING tranches company-wide (review queue).
   */
  static async listPendingDisbursementRequests() {
    const pending = await prisma.fundDisbursement.findMany({
      where: { status: "PENDING" },
      orderBy: [{ investmentImplementationId: "asc" }, { createdAt: "asc" }],
      include: {
        paymentCurrency: { select: { code: true } },
        investmentImplementation: {
          include: {
            application: { select: { businessName: true, dealReference: true } },
            portfolioCompany: { select: { name: true } }
          }
        }
      }
    });

    const implIds = [...new Set(pending.map((p) => p.investmentImplementationId))];
    const allOrdered =
      implIds.length === 0
        ? []
        : await prisma.fundDisbursement.findMany({
            where: { investmentImplementationId: { in: implIds } },
            orderBy: [{ investmentImplementationId: "asc" }, { createdAt: "asc" }],
            select: { id: true, investmentImplementationId: true }
          });

    const trancheById = new Map<string, number>();
    let curImpl = "";
    let n = 0;
    for (const row of allOrdered) {
      if (row.investmentImplementationId !== curImpl) {
        curImpl = row.investmentImplementationId;
        n = 0;
      }
      n += 1;
      trancheById.set(row.id, n);
    }

    return pending.map((row) => {
      const { investmentImplementation, paymentCurrency, ...disb } = row;
      const trancheIndex = trancheById.get(row.id) ?? 1;
      return {
        ...disb,
        trancheIndex,
        cfoApprovalStatusLabel: "PENDING_CFO_APPROVAL" as const,
        portfolioCompanyName: investmentImplementation.portfolioCompany?.name ?? null,
        businessName: investmentImplementation.application?.businessName ?? null,
        dealReference: investmentImplementation.application?.dealReference ?? null,
        paymentCurrencyCode: paymentCurrency?.code ?? null
      };
    });
  }

  /**
   * Banks eligible for fund-disbursement approval: active, linked GL on chart of accounts.
   * Optional paymentCurrencyId filters to banks in that currency (match tranche payout currency).
   */
  static async listBanksForFundDisbursementApproval(paymentCurrencyId?: string | null) {
    const banks = await prisma.bank.findMany({
      where: {
        isActive: true,
        glAccountId: { not: null },
        ...(paymentCurrencyId ? { currencyId: paymentCurrencyId } : {})
      },
      include: {
        currency: { select: { id: true, code: true, name: true } },
        glAccount: {
          select: {
            id: true,
            accountNo: true,
            accountName: true,
            accountType: true
          }
        }
      },
      orderBy: [{ name: "asc" }, { accountNumber: "asc" }]
    });

    return banks.map((b) => ({
      id: b.id,
      name: b.name,
      accountNumber: b.accountNumber,
      currencyId: b.currencyId,
      currencyCode: b.currency.code,
      currencyName: b.currency.name,
      glAccount: {
        id: b.glAccount!.id,
        accountNo: b.glAccount!.accountNo,
        accountName: b.glAccount!.accountName,
        accountType: b.glAccount!.accountType
      }
    }));
  }

  /**
   * Universal approve / reject for a PENDING tranche (reject does not touch cashbook or fund balance).
   * APPROVE requires bankId (CFO-selected payout bank with GL link; currency must match tranche payment currency).
   */
  static async applyFundDisbursementDecision(
    disbursementId: string,
    actorUserId: string,
    decision: "APPROVE" | "REJECT",
    reason?: string,
    bankId?: string
  ): Promise<FundDisbursement> {
    if (decision === "APPROVE") {
      const bid = bankId?.trim();
      if (!bid) {
        throw new Error(
          "bankId is required when approving. Use GET /api/investment-implementations/disbursement-banks to list eligible banks."
        );
      }
      return InvestmentImplementationService.approveFundDisbursement(
        disbursementId,
        actorUserId,
        bid
      );
    }
    return InvestmentImplementationService.rejectFundDisbursement(
      disbursementId,
      actorUserId,
      reason
    );
  }

  static async rejectFundDisbursement(
    disbursementId: string,
    rejectedById: string,
    reason?: string
  ): Promise<FundDisbursement> {
    try {
      const disbursement = await prisma.fundDisbursement.findUnique({
        where: { id: disbursementId }
      });

      if (!disbursement) {
        throw new Error("Fund disbursement not found");
      }

      if (disbursement.status !== "PENDING") {
        throw new Error("Fund disbursement is not in pending status");
      }

      const stamp = new Date().toISOString();
      const reasonLine = reason?.trim() ? ` Reason: ${reason.trim()}` : "";
      const block = `[Rejected ${stamp} by ${rejectedById}]${reasonLine}`;
      const newNotes = disbursement.notes?.trim()
        ? `${disbursement.notes.trim()}\n${block}`
        : block;

      return await prisma.fundDisbursement.update({
        where: { id: disbursementId },
        data: {
          status: "REJECTED",
          notes: newNotes,
          updatedAt: new Date()
        }
      });
    } catch (error: any) {
      throw new Error(`Failed to reject fund disbursement: ${error.message}`);
    }
  }

  /**
   * Approve fund disbursement: cashbook PAYMENT + posted journal
   * — Debit Portfolio Investments (1501), Credit selected bank's GL account.
   */
  static async approveFundDisbursement(
    disbursementId: string,
    approvedById: string,
    bankId: string
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
                  name: true,
                  user: {
                    select: {
                      email: true,
                      firstName: true,
                      lastName: true
                    }
                  }
                }
              },
              application: {
                select: {
                  id: true,
                  applicantName: true,
                  applicantEmail: true,
                  businessName: true,
                  complianceCleared: true,
                  assignedAnalystId: true,
                  assignedAnalyst: {
                    select: {
                      email: true,
                      firstName: true,
                      lastName: true
                    }
                  }
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

      assertApplicationComplianceForDisbursement(
        disbursement.investmentImplementation?.application
      );

      const [portfolioInvestmentAccount, bank] = await Promise.all([
        prisma.chartOfAccounts.findFirst({
          where: {
            OR: [
              { accountNo: "1501" },
              { accountName: { contains: "Portfolio Investment" } }
            ],
            isActive: true
          }
        }),
        prisma.bank.findFirst({
          where: {
            id: bankId,
            isActive: true,
            glAccountId: { not: null }
          },
          include: { currency: true, glAccount: true }
        })
      ]);

      if (!portfolioInvestmentAccount) {
        throw new Error("Portfolio Investments account (1501) not found in chart of accounts. Please create this account first.");
      }

      if (!bank?.glAccount) {
        throw new Error(
          "Bank not found, inactive, or missing a chart-of-accounts link. Choose a bank from GET /api/investment-implementations/disbursement-banks."
        );
      }

      if (disbursement.paymentCurrencyId && bank.currencyId !== disbursement.paymentCurrencyId) {
        throw new Error(
          "Selected bank currency must match this tranche payment currency. Filter disbursement-banks with paymentCurrencyId or pick another bank."
        );
      }

      const deductFromFund =
        disbursement.amountCommitmentCurrency != null
          ? new Decimal(disbursement.amountCommitmentCurrency)
          : new Decimal(disbursement.amount);

      if (disbursement.fund.remainingAmount.lessThan(deductFromFund)) {
        throw new Error("Insufficient funds available for disbursement");
      }

      const disbursementAmount = Number(disbursement.amount);
      const paymentReference = `FD-${disbursementId.substring(0, 8).toUpperCase()}`;
      const portfolioCompanyName = disbursement.investmentImplementation?.portfolioCompany?.name || "Portfolio Company";
      const cashbookDescription = `Fund Disbursement - ${portfolioCompanyName} - $${disbursementAmount.toLocaleString()}`;
      const journalHeaderDescription = `Bank Payment: ${cashbookDescription}`;

      const cashbookResult = await CashbookService.createCashPayment({
        bankId: bank.id,
        transactionDate: disbursement.disbursementDate,
        description: cashbookDescription,
        amount: disbursementAmount,
        reference: paymentReference,
        counterpartyType: "GL",
        glAccountId: portfolioInvestmentAccount.id,
        createdById: approvedById,
        skipVatRateRefresh: true,
        preloadedBank: bank,
        journalHeaderDescription
      });

      if (!cashbookResult.success || !cashbookResult.transaction) {
        throw new Error(cashbookResult.message || "Failed to create cashbook payment");
      }

      const implementation = disbursement.investmentImplementation;

      const updatedDisbursement = await prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const disbursementUpdate = await tx.fundDisbursement.update({
            where: { id: disbursementId },
            data: {
              status: "DISBURSED",
              approvedById: approvedById,
              approvedAt: now,
              cashbookEntryId: cashbookResult.transaction.id,
              disbursedById: approvedById,
              disbursedAt: now,
              transactionReference: paymentReference,
              updatedAt: now
            }
          });

          await tx.fund.update({
            where: { id: disbursement.fundId },
            data: {
              remainingAmount: disbursement.fund.remainingAmount.minus(deductFromFund),
              updatedAt: new Date()
            }
          });

          if (implementation) {
            await InvestmentImplementationService.applyPostDisbursementSideEffects(tx, {
              investmentImplementation: {
                id: implementation.id,
                portfolioCompanyId: implementation.portfolioCompanyId,
                applicationId: implementation.applicationId
              },
              fundId: disbursement.fundId
            });
          }

          return disbursementUpdate;
        },
        { maxWait: 10_000, timeout: 20_000 }
      );

      console.log(`✅ Fund disbursement approved, posted to cashbook/GL, and marked DISBURSED:`);
      console.log(`   Cashbook Entry: ${cashbookResult.transaction.id}`);
      if (cashbookResult.journalEntry) {
        console.log(`   Journal Entry: ${cashbookResult.journalEntry.referenceNumber}`);
      }
      console.log(`   Debit: ${portfolioInvestmentAccount.accountNo} - ${portfolioInvestmentAccount.accountName} - $${disbursementAmount.toLocaleString()}`);
      const creditCoa = bank.glAccount;
      console.log(
        `   Credit: ${creditCoa?.accountNo ?? "bank GL unset"} - ${creditCoa?.accountName ?? "Bank"} - $${disbursementAmount.toLocaleString()}`
      );
      console.log(`   ✅ Balanced: Debit = Credit = $${disbursementAmount.toLocaleString()}`);

      const applicantInfo = this.getApplicantInfoFromDisbursement(disbursement);
      if (applicantInfo) {
        void Promise.all([
          EmailNotificationService.sendDisbursementApprovedEmail({
            applicantName: applicantInfo.name,
            applicantEmail: applicantInfo.email,
            businessName: applicantInfo.businessName,
            applicationId: applicantInfo.applicationId,
            currentStage: "DISBURSED",
            disbursementAmount: disbursementAmount,
            disbursementDate: disbursement.disbursementDate,
            immediateDisbursement: true
          }),
          EmailNotificationService.sendDisbursementCompletedEmail({
            applicantName: applicantInfo.name,
            applicantEmail: applicantInfo.email,
            businessName: applicantInfo.businessName,
            applicationId: applicantInfo.applicationId,
            currentStage: "DISBURSED",
            disbursementAmount: disbursementAmount,
            transactionReference: paymentReference
          })
        ])
          .then(() =>
            console.log(
              `✅ Disbursement approved + completed emails sent to applicant ${applicantInfo.email}`
            )
          )
          .catch((emailError: any) =>
            console.error(`❌ Failed to send applicant disbursement emails: ${emailError.message}`)
          );
      } else {
        console.warn(`⚠️ Could not find applicant info for disbursement ${disbursementId}`);
      }

      const appRow = disbursement.investmentImplementation?.application;
      const analystUser = appRow?.assignedAnalyst;
      const analystEmail = analystUser?.email?.trim();
      if (analystEmail) {
        const analystName =
          `${analystUser.firstName || ""} ${analystUser.lastName || ""}`.trim() || "Analyst";
        const biz =
          applicantInfo?.businessName ||
          appRow?.businessName ||
          portfolioCompanyName;
        void EmailNotificationService.sendFundDisbursementApprovedAnalystEmail({
          analystName,
          analystEmail,
          businessName: biz,
          applicationId: appRow.id,
          disbursementId,
          disbursementAmount,
          transactionReference: paymentReference
        })
          .then(() => console.log(`✅ Disbursement approved email sent to analyst ${analystEmail}`))
          .catch((emailError: any) =>
            console.error(`❌ Failed to send analyst disbursement email: ${emailError.message}`)
          );
      } else if (appRow) {
        console.warn(
          `⚠️ No assigned analyst email for application ${appRow.id}; skipping analyst disbursement notification`
        );
      }

      return updatedDisbursement;
    } catch (error: any) {
      throw new Error(`Failed to approve fund disbursement: ${error.message}`);
    }
  }

  /**
   * After a tranche reaches DISBURSED: align PC/application fundId and, when no other
   * non-DISBURSED tranches remain on the implementation, complete the implementation and set application to DISBURSED.
   */
  private static async applyPostDisbursementSideEffects(
    tx: any,
    params: {
      investmentImplementation: {
        id: string;
        portfolioCompanyId: string;
        applicationId: string;
      };
      fundId: string;
    }
  ): Promise<void> {
    const { investmentImplementation: impl, fundId } = params;
    await tx.portfolioCompany.update({
      where: { id: impl.portfolioCompanyId },
      data: {
        fundId,
        updatedAt: new Date()
      }
    });
    await tx.application.update({
      where: { id: impl.applicationId },
      data: {
        fundId,
        updatedAt: new Date()
      }
    });

    const remaining = await tx.fundDisbursement.count({
      where: {
        investmentImplementationId: impl.id,
        status: { not: "DISBURSED" }
      }
    });

    if (remaining === 0) {
      await tx.investmentImplementation.update({
        where: { id: impl.id },
        data: {
          fundsDisbursed: true,
          status: "COMPLETED",
          completedAt: new Date(),
          updatedAt: new Date()
        }
      });
      await tx.application.update({
        where: { id: impl.applicationId },
        data: {
          currentStage: "DISBURSED",
          updatedAt: new Date()
        }
      });
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
          fund: {
            select: {
              id: true
            }
          },
          investmentImplementation: {
            include: {
              portfolioCompany: {
                select: {
                  id: true,
                  name: true,
                  user: {
                    select: {
                      email: true,
                      firstName: true,
                      lastName: true
                    }
                  }
                }
              },
              application: {
                select: {
                  id: true,
                  applicantName: true,
                  applicantEmail: true,
                  businessName: true,
                  complianceCleared: true
                }
              }
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

      assertApplicationComplianceForDisbursement(
        disbursement.investmentImplementation?.application
      );

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

        if (disbursement.fund?.id) {
          await InvestmentImplementationService.applyPostDisbursementSideEffects(tx, {
            investmentImplementation: {
              id: implementation.id,
              portfolioCompanyId: implementation.portfolioCompanyId,
              applicationId: implementation.applicationId
            },
            fundId: disbursement.fund.id
          });
        }

        return disbursed;
      });

      // Send email notification to applicant
      try {
        const applicantInfo = this.getApplicantInfoFromDisbursement(disbursement);
        if (applicantInfo) {
          await EmailNotificationService.sendDisbursementCompletedEmail({
            applicantName: applicantInfo.name,
            applicantEmail: applicantInfo.email,
            businessName: applicantInfo.businessName,
            applicationId: applicantInfo.applicationId,
            currentStage: 'DISBURSED',
            disbursementAmount: Number(disbursement.amount),
            transactionReference: transactionReference
          });
          console.log(`✅ Disbursement completed email sent to ${applicantInfo.email}`);
        } else {
          console.warn(`⚠️ Could not find applicant info for disbursement ${disbursementId}`);
        }
      } catch (emailError: any) {
        console.error(`❌ Failed to send disbursement completed email: ${emailError.message}`);
        // Don't throw - email failure shouldn't fail the disbursement marking
      }

      return updatedDisbursement;
    } catch (error: any) {
      throw new Error(`Failed to mark disbursement as disbursed: ${error.message}`);
    }
  }

  /**
   * Helper method to get applicant information from disbursement
   */
  private static getApplicantInfoFromDisbursement(disbursement: any): {
    name: string;
    email: string;
    businessName: string;
    applicationId: string;
  } | null {
    try {
      const application = disbursement.investmentImplementation?.application;
      const portfolioCompany = disbursement.investmentImplementation?.portfolioCompany;
      const user = portfolioCompany?.user;

      // Try to get applicant info from application first (most reliable)
      if (application?.applicantEmail && application?.applicantName) {
        return {
          name: application.applicantName,
          email: application.applicantEmail,
          businessName: application.businessName || portfolioCompany?.name || 'Portfolio Company',
          applicationId: application.id
        };
      }

      // Fallback to user email if available
      if (user?.email) {
        const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Applicant';
        return {
          name: fullName,
          email: user.email,
          businessName: portfolioCompany?.name || application?.businessName || 'Portfolio Company',
          applicationId: application?.id || 'N/A'
        };
      }

      return null;
    } catch (error: any) {
      console.error('Error getting applicant info from disbursement:', error);
      return null;
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
