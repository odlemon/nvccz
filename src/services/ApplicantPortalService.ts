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
  }) {
    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
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
          }
        }
      });

      if (!portfolioCompany) {
        throw new Error("No portfolio company found for this user");
      }

      return portfolioCompany;
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

      // Get application
      const application = await prisma.application.findFirst({
        where: { applicantEmail: user.email },
        select: {
          id: true,
          currentStage: true,
          submittedAt: true,
          businessName: true,
          requestedAmount: true,
          industry: true,
          businessStage: true
        }
      });

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
        application: application,
        portfolioCompany: portfolioCompany,
        recentActivities: recentActivities,
        summary: {
          hasApplication: !!application,
          hasPortfolioCompany: !!portfolioCompany,
          applicationStage: application?.currentStage || null,
          companyStatus: portfolioCompany?.status || null
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
      const portfolioCompany = await prisma.portfolioCompany.findUnique({
        where: { userId: userId },
        include: {
          fund: {
            select: {
              id: true,
              name: true,
              description: true,
              targetSize: true,
              status: true
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

      return {
        portfolioCompany: portfolioCompany,
        termSheet: termSheet,
        investment: {
          fund: portfolioCompany.fund,
          startDate: portfolioCompany.startDate,
          endDate: portfolioCompany.endDate,
          capTable: portfolioCompany.capTable,
          financialKpis: portfolioCompany.financialKpis
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

      // Get all valuations (this would need to be filtered by company in a real implementation)
      const valuations = await prisma.portfolioValuation.findMany({
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
