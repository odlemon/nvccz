// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";

export class ApplicantPortalService {
  /**
   * Get applicant profile information
   */
  static async getApplicantProfile(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          roleCode: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (!user) {
        throw new Error("User not found");
      }

      return user;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update applicant profile information
   */
  static async updateApplicantProfile(userId: string, updateData: {
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string; // Explicitly excluded - will be ignored
  }) {
    try {
      // Explicitly exclude password from update - password should only be changed via change-password endpoint
      const { password, ...safeUpdateData } = updateData;
      
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: safeUpdateData,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          roleCode: true,
          updatedAt: true
        }
      });

      return updatedUser;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get applicant's application details
   */
  static async getApplicantApplication(userId: string) {
    try {
      // First get user's email to find their application
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true }
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Find application by email
      const application = await prisma.application.findFirst({
        where: { applicantEmail: user.email },
        include: {
          fund: {
            select: {
              id: true,
              name: true,
              description: true
            }
          },
          documents: {
            select: {
              id: true,
              documentType: true,
              fileName: true,
              fileUrl: true,
              fileSize: true,
              isRequired: true,
              isSubmitted: true,
              uploadedAt: true
            }
          },
          dueDiligenceReview: {
            include: {
              reviewer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },
          boardReview: {
            include: {
              reviewer: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },
          termSheet: {
            include: {
              createdBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (!application) {
        throw new Error("No application found for this user");
      }

      return application;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get applicant's portfolio company (if approved)
   */
  static async getApplicantCompany(userId: string) {
    try {
      const portfolioCompany = await prisma.portfolioCompany.findUnique({
        where: { userId: userId },
        include: {
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
                  status: true,
                  notes: true,
                  transactionReference: true,
                  approvedAt: true,
                  disbursedAt: true
                },
                orderBy: { disbursementDate: 'desc' }
              }
            }
          }
        }
      });

      if (!portfolioCompany) {
        throw new Error("No portfolio company found for this user");
      }

      // Extract disbursements from investment implementation
      const disbursements = portfolioCompany.investmentImplementation?.fundDisbursements || [];
      
      // Use fund from investmentImplementation if available, otherwise from portfolioCompany
      const fund = portfolioCompany.investmentImplementation?.fund || portfolioCompany.fund;

      return {
        ...portfolioCompany,
        fund: fund,
        disbursements: disbursements
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update applicant's portfolio company
   */
  static async updateApplicantCompany(userId: string, updateData: {
    name?: string;
    industry?: string;
    foundingDate?: Date;
    address?: string;
    website?: string;
    description?: string;
    logoUrl?: string;
    companySize?: string;
    employeeCount?: number;
    annualRevenue?: number;
    fundingStage?: string;
    contactPerson?: string;
    contactPhone?: string;
    contactEmail?: string;
    socialMedia?: Record<string, string>;
  }) {
    try {
      const updatedCompany = await prisma.portfolioCompany.update({
        where: { userId: userId },
        data: updateData,
        include: {
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

  /**
   * Calculate application progress percentage based on current stage
   * For DISBURSED stage, calculates based on disbursed amount vs requested amount
   */
  private static calculateApplicationProgress(
    currentStage: string, 
    requestedAmount?: number | Decimal | null,
    disbursements?: Array<{ status: string; amount: number | Decimal }>
  ): number {
    const stageProgressMap: { [key: string]: number } = {
      'SUBMITTED': 5,
      'PENDING_SHORTLISTING': 5,
      'SHORTLISTED': 10,
      'UNDER_DUE_DILIGENCE': 20,
      'DUE_DILIGENCE_COMPLETED': 30,
      'TERM_SHEET': 40,
      'TERM_SHEET_NEGOTIATION': 45,
      'UNDER_BOARD_REVIEW': 50,
      'BOARD_APPROVED': 60,
      'BOARD_REJECTED': 0,
      'BOARD_CONDITIONAL': 55,
      'INVESTMENT_IMPLEMENTATION': 70,
      'DISBURSED': 85, // Base percentage, will be adjusted based on amount
      'FUNDED': 95,
      'PORTFOLIO_MANAGEMENT': 100,
      'BELOW_THRESHOLD': 0,
      'REJECTED': 0,
      'NOT_SELECTED': 0
    };

    let baseProgress = stageProgressMap[currentStage] ?? 0;

    // Special calculation for DISBURSED stage
    if (currentStage === 'DISBURSED' && requestedAmount && disbursements) {
      // Calculate total disbursed amount (only DISBURSED status)
      const totalDisbursed = disbursements
        .filter(d => d.status === 'DISBURSED')
        .reduce((sum, d) => {
          const amount = typeof d.amount === 'number' ? d.amount : Number(d.amount);
          return sum + amount;
        }, 0);

      const requested = typeof requestedAmount === 'number' ? requestedAmount : Number(requestedAmount);

      if (requested > 0) {
        if (totalDisbursed >= requested) {
          // Full amount disbursed → 100%
          return 100;
        } else {
          // Partial amount disbursed → 85% + (15% * (disbursed/requested))
          const disbursedRatio = totalDisbursed / requested;
          return 85 + (15 * disbursedRatio);
        }
      }
    }

    return baseProgress;
  }

  /**
   * Get applicant dashboard summary
   */
  static async getApplicantDashboard(userId: string) {
    try {
      // Get user's email to find application
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true }
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Get application with investment implementation
      const application = await prisma.application.findFirst({
        where: { applicantEmail: user.email },
        select: {
          id: true,
          currentStage: true,
          submittedAt: true,
          businessName: true,
          requestedAmount: true,
          industry: true,
          businessStage: true,
          investmentImplementation: {
            select: {
              id: true
            }
          }
        }
      });

      // Get disbursements if investment implementation exists
      let disbursements: Array<{ status: string; amount: number | Decimal }> = [];
      if (application?.investmentImplementation?.id) {
        const fundDisbursements = await prisma.fundDisbursement.findMany({
          where: {
            investmentImplementationId: application.investmentImplementation.id
          },
          select: {
            id: true,
            amount: true,
            status: true,
            disbursementDate: true,
            disbursementType: true
          },
          orderBy: { disbursementDate: 'desc' }
        });
        disbursements = fundDisbursements;
      }

      // Calculate application progress
      const applicationProgress = application
        ? this.calculateApplicationProgress(
            application.currentStage,
            application.requestedAmount,
            disbursements
          )
        : 0;

      // Calculate approved amount (sum of APPROVED and DISBURSED disbursements)
      const approvedAmount = disbursements
        .filter(d => d.status === 'APPROVED' || d.status === 'DISBURSED')
        .reduce((sum, d) => {
          const amount = typeof d.amount === 'number' ? d.amount : Number(d.amount);
          return sum + amount;
        }, 0);

      // Get requested amount as number
      const requestedAmount = application?.requestedAmount
        ? (typeof application.requestedAmount === 'number' 
            ? application.requestedAmount 
            : Number(application.requestedAmount))
        : 0;

      // Get portfolio company if exists
      const portfolioCompany = await prisma.portfolioCompany.findUnique({
        where: { userId: userId },
        select: {
          id: true,
          name: true,
          status: true,
          industry: true,
          fundingStage: true
        }
      });

      // Get recent activities (if any)
      const recentActivities = await prisma.applicationNotification.findMany({
        where: { 
          applicationId: application?.id,
          isSent: true
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          notificationType: true,
          title: true,
          message: true,
          createdAt: true
        }
      });

      return {
        application: application ? {
          ...application,
          applicationProgress: applicationProgress,
          requestedAmount: requestedAmount,
          approvedAmount: approvedAmount
        } : null,
        portfolioCompany: portfolioCompany,
        recentActivities: recentActivities,
        summary: {
          hasApplication: !!application,
          hasPortfolioCompany: !!portfolioCompany,
          applicationStage: application?.currentStage || null,
          companyStatus: portfolioCompany?.status || null,
          applicationProgress: applicationProgress,
          requestedAmount: requestedAmount,
          approvedAmount: approvedAmount
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get application timeline
   */
  static async getApplicationTimeline(userId: string) {
    try {
      // Get user's email to find application
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true }
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Get application with all related data
      const application = await prisma.application.findFirst({
        where: { applicantEmail: user.email },
        include: {
          dueDiligenceReview: {
            select: {
              status: true,
              completedAt: true,
              overallScore: true,
              recommendation: true
            }
          },
          boardReview: {
            select: {
              status: true,
              completedAt: true,
              investmentApproved: true,
              investmentRejected: true,
              conditionalApproval: true
            }
          },
          termSheet: {
            select: {
              status: true,
              isSigned: true,
              signedAt: true,
              investmentAmount: true
            }
          }
        }
      });

      if (!application) {
        throw new Error("No application found for this user");
      }

      // Build timeline events
      const timeline = [];

      // Application submission
      if (application.submittedAt) {
        timeline.push({
          event: "Application Submitted",
          date: application.submittedAt,
          status: "completed",
          description: "Your application was successfully submitted for review"
        });
      }

      // Due diligence
      if (application.dueDiligenceReview) {
        timeline.push({
          event: "Due Diligence Review",
          date: application.dueDiligenceReview.completedAt || application.dueDiligenceReview.createdAt,
          status: application.dueDiligenceReview.status === "COMPLETED" ? "completed" : "in_progress",
          description: `Due diligence review ${application.dueDiligenceReview.status === "COMPLETED" ? "completed" : "in progress"}`
        });
      }

      // Board review
      if (application.boardReview) {
        timeline.push({
          event: "Board Review",
          date: application.boardReview.completedAt || application.boardReview.createdAt,
          status: application.boardReview.status === "COMPLETED" ? "completed" : "in_progress",
          description: `Board review ${application.boardReview.status === "COMPLETED" ? "completed" : "in progress"}`
        });
      }

      // Term sheet
      if (application.termSheet) {
        timeline.push({
          event: "Term Sheet",
          date: application.termSheet.signedAt || application.termSheet.createdAt,
          status: application.termSheet.isSigned ? "completed" : "pending",
          description: `Term sheet ${application.termSheet.isSigned ? "signed" : "pending signature"}`
        });
      }

      // Sort timeline by date
      timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      return {
        applicationId: application.id,
        currentStage: application.currentStage,
        timeline: timeline
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get investment details (if approved)
   */
  static async getInvestmentDetails(userId: string) {
    try {
      // Get portfolio company first
      const portfolioCompany = await prisma.portfolioCompany.findFirst({
        where: { userId: userId },
        include: {
          fund: true,
          investmentImplementation: {
            include: {
              fund: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  totalAmount: true,
                  remainingAmount: true
                }
              },
              fundDisbursements: {
                select: {
                  id: true,
                  amount: true,
                  disbursementDate: true,
                  disbursementType: true,
                  status: true,
                  notes: true,
                  transactionReference: true,
                  approvedAt: true,
                  disbursedAt: true
                },
                orderBy: { disbursementDate: 'desc' }
              }
            }
          }
        }
      });

      if (!portfolioCompany) {
        throw new Error("No portfolio company found for this user");
      }

      // Get term sheet if exists
      const termSheet = await prisma.termSheet.findFirst({
        where: {
          application: {
            applicantEmail: (await prisma.user.findUnique({
              where: { id: userId },
              select: { email: true }
            }))?.email
          }
        },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Use fund from investmentImplementation if available, otherwise from portfolioCompany
      const fund = portfolioCompany.investmentImplementation?.fund || portfolioCompany.fund;
      const disbursements = portfolioCompany.investmentImplementation?.fundDisbursements || [];

      return {
        portfolioCompany: portfolioCompany,
        termSheet: termSheet,
        investment: {
          fund: fund,
          startDate: portfolioCompany.startDate,
          endDate: portfolioCompany.endDate,
          capTable: portfolioCompany.capTable,
          financialKpis: portfolioCompany.financialKpis,
          disbursements: disbursements
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get portfolio valuations (if approved)
   */
  static async getPortfolioValuations(userId: string) {
    try {
      // Get portfolio company first
      const portfolioCompany = await prisma.portfolioCompany.findUnique({
        where: { userId: userId }
      });

      if (!portfolioCompany) {
        throw new Error("No portfolio company found for this user");
      }

      // PortfolioValuation is portfolio-wide, not company-specific
      // Return valuations assigned to this user or where user is involved
      const valuations = await prisma.portfolioValuation.findMany({
        where: {
          OR: [
            { assignedToId: userId },
            { createdById: userId }
          ]
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          valuationActivities: {
            select: {
              id: true,
              activityType: true,
              title: true,
              description: true,
              createdAt: true
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return valuations;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get performance reports (if approved)
   */
  static async getPerformanceReports(userId: string) {
    try {
      // Get portfolio company first
      const portfolioCompany = await prisma.portfolioCompany.findUnique({
        where: { userId: userId }
      });

      if (!portfolioCompany) {
        throw new Error("No portfolio company found for this user");
      }

      // This would typically return actual performance reports
      // For now, return a placeholder structure
      return {
        portfolioCompany: {
          id: portfolioCompany.id,
          name: portfolioCompany.name,
          industry: portfolioCompany.industry
        },
        reports: [
          {
            id: "1",
            title: "Q1 2025 Performance Report",
            type: "quarterly",
            period: "Q1 2025",
            status: "completed",
            generatedAt: new Date(),
            downloadUrl: "#"
          },
          {
            id: "2", 
            title: "Annual Financial Summary",
            type: "annual",
            period: "2024",
            status: "completed",
            generatedAt: new Date(),
            downloadUrl: "#"
          }
        ]
      };
    } catch (error) {
      throw error;
    }
  }
}
