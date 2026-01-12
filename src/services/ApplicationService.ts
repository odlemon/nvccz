//@ts-nocheck
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '../utils/database';
import { EmailNotificationService } from './EmailNotificationService';

export interface CreateApplicationRequest {
  // Applicant Information
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  applicantAddress: string;
  
  // Business Information
  businessName: string;
  businessDescription: string;
  industry: string;
  businessStage: string; // IDEA, STARTUP, OPERATIONAL
  foundingDate?: Date;
  
  // Investment Details
  requestedAmount: number;
  fundId?: string;
  
  // Documents
  documents: Array<{
    documentType: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
    isRequired: boolean;
  }>;
}

export interface UpdateApplicationRequest {
  applicantName?: string;
  applicantEmail?: string;
  applicantPhone?: string;
  applicantAddress?: string;
  businessName?: string;
  businessDescription?: string;
  industry?: string;
  businessStage?: string;
  foundingDate?: Date;
  requestedAmount?: number;
  fundId?: string;
}

export interface ApplicationWithRelations {
  id: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  applicantAddress: string;
  businessName: string;
  businessDescription: string;
  industry: string;
  businessStage: string;
  foundingDate?: Date;
  requestedAmount: Decimal;
  fundId?: string;
  currentStage: string;
  submittedAt?: Date;
  initialScreeningScore?: Decimal;
  screeningOutcome?: string;
  dueDiligenceScore?: Decimal;
  boardDecision?: string;
  createdAt: Date;
  updatedAt: Date;
  fund?: {
    id: string;
    name: string;
    status: string;
  };
  documents: Array<{
    id: string;
    documentType: string;
    fileName: string;
    isRequired: boolean;
    isSubmitted: boolean;
  }>;
  dueDiligenceReview?: {
    id: string;
    status: string;
    overallScore?: Decimal;
    recommendation?: string;
    reviewer: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  boardReview?: {
    id: string;
    status: string;
    investmentApproved: boolean;
    investmentRejected: boolean;
    conditionalApproval: boolean;
    reviewer: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
  };
    termSheet?: {
    id: string;
    status: string;
    title: string;
    investmentAmount: Decimal;
    isDraft: boolean;
    isFinal: boolean;
    isSigned: boolean;
    createdBy: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
  };
}

export class ApplicationService {
  /**
   * Create a new application (public endpoint)
   */
  static async createApplication(params: CreateApplicationRequest): Promise<ApplicationWithRelations> {
    try {
      // Validate required fields
      if (!params.applicantName || !params.applicantEmail || !params.businessName || !params.requestedAmount) {
        throw new Error("Missing required fields");
      }

      if (params.requestedAmount <= 0) {
        throw new Error("Requested amount must be greater than zero");
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(params.applicantEmail)) {
        throw new Error("Invalid email format");
      }

      const normalizedEmail = params.applicantEmail.trim().toLowerCase();

      // Check if email already exists in applications
      const existingApplication = await prisma.application.findFirst({
        where: {
          applicantEmail: {
            equals: normalizedEmail
          }
        }
      });

      if (existingApplication) {
        throw new Error("This email already applied for investment");
      }

      // Check if email already exists among internal users
      const existingUser = await prisma.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail
          }
        }
      });

      if (existingUser) {
        throw new Error("This email is already linked to an internal user account");
      }

      // Check if fund exists if provided
      if (params.fundId) {
        const fund = await prisma.fund.findUnique({
          where: { id: params.fundId }
        });
        if (!fund) {
          throw new Error("Fund not found");
        }
        if (fund.status !== "OPEN") {
          throw new Error("Fund is not accepting applications");
        }
      }

      // Validate required documents
      if (!params.documents || params.documents.length === 0) {
        throw new Error("At least one document is required");
      }

      const requiredDocumentTypes = ["BUSINESS_PLAN", "PROOF_OF_CONCEPT", "MARKET_RESEARCH", "PROJECTED_CASH_FLOWS"];
      const providedDocumentTypes = params.documents.map(doc => doc.documentType);
      
      const missingDocuments = requiredDocumentTypes.filter(type => !providedDocumentTypes.includes(type));
      if (missingDocuments.length > 0) {
        throw new Error(`Missing required documents: ${missingDocuments.join(", ")}`);
      }

      // Create the application with documents
      const application = await prisma.application.create({
        data: {
          applicantName: params.applicantName,
          applicantEmail: normalizedEmail,
          applicantPhone: params.applicantPhone,
          applicantAddress: params.applicantAddress,
          businessName: params.businessName,
          businessDescription: params.businessDescription,
          industry: params.industry,
          businessStage: params.businessStage,
          foundingDate: params.foundingDate,
          requestedAmount: new Decimal(params.requestedAmount),
          fundId: params.fundId,
          currentStage: "PENDING_SHORTLISTING", // Start with PENDING_SHORTLISTING - will be evaluated by AI
          submittedAt: new Date(),
          documents: {
            create: params.documents.map(doc => ({
              documentType: doc.documentType,
              fileName: doc.fileName,
              fileUrl: doc.fileUrl,
              fileSize: doc.fileSize,
              isRequired: doc.isRequired,
              isSubmitted: true
            }))
          }
        },
        include: {
          fund: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          documents: {
            select: {
              id: true,
              documentType: true,
              fileName: true,
              fileUrl: true,
              isRequired: true,
              isSubmitted: true
            }
          }
        }
      });

      return application;
    } catch (error: any) {
      throw new Error(`Failed to create application: ${error.message}`);
    }
  }

  /**
   * Get application by ID (admin/fund manager access)
   */
  static async getApplicationById(id: string): Promise<ApplicationWithRelations | null> {
    try {
      const application = await prisma.application.findUnique({
        where: { id },
        include: {
          fund: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          documents: {
            select: {
              id: true,
              documentType: true,
              fileName: true,
              fileUrl: true,
              isRequired: true,
              isSubmitted: true
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
              },
              applicantSignedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              investorSignedBy: {
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

      return application;
    } catch (error: any) {
      throw new Error(`Failed to get application: ${error.message}`);
    }
  }

  /**
   * Get application status (public endpoint)
   */
  static async getApplicationStatus(id: string): Promise<{ currentStage: string; submittedAt?: Date }> {
    try {
      const application = await prisma.application.findUnique({
        where: { id },
        select: {
          currentStage: true,
          submittedAt: true
        }
      });

      if (!application) {
        throw new Error("Application not found");
      }

      return application;
    } catch (error: any) {
      throw new Error(`Failed to get application status: ${error.message}`);
    }
  }

  /**
   * Update application (admin/fund manager access)
   */
  static async updateApplication(id: string, params: UpdateApplicationRequest): Promise<ApplicationWithRelations> {
    try {
      const application = await prisma.application.findUnique({
        where: { id }
      });

      if (!application) {
        throw new Error("Application not found");
      }

      // Only allow updates if application is in SHORTLISTED stage
      if (application.currentStage !== "SHORTLISTED") {
        throw new Error("Cannot update application that is not in SHORTLISTED stage");
      }

      const updateData: any = {};
      
      if (params.applicantName) updateData.applicantName = params.applicantName;
      if (params.applicantEmail) updateData.applicantEmail = params.applicantEmail;
      if (params.applicantPhone) updateData.applicantPhone = params.applicantPhone;
      if (params.applicantAddress) updateData.applicantAddress = params.applicantAddress;
      if (params.businessName) updateData.businessName = params.businessName;
      if (params.businessDescription) updateData.businessDescription = params.businessDescription;
      if (params.industry) updateData.industry = params.industry;
      if (params.businessStage) updateData.businessStage = params.businessStage;
      if (params.foundingDate) updateData.foundingDate = params.foundingDate;
      if (params.requestedAmount) updateData.requestedAmount = new Decimal(params.requestedAmount);
      if (params.fundId) updateData.fundId = params.fundId;

      const updatedApplication = await prisma.application.update({
        where: { id },
        data: updateData,
        include: {
          fund: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          documents: {
            select: {
              id: true,
              documentType: true,
              fileName: true,
              fileUrl: true,
              isRequired: true,
              isSubmitted: true
            }
          }
        }
      });

      return updatedApplication;
    } catch (error: any) {
      throw new Error(`Failed to update application: ${error.message}`);
    }
  }

  /**
   * Submit application (public endpoint)
   */
  static async submitApplication(id: string): Promise<ApplicationWithRelations> {
    try {
      const application = await prisma.application.findUnique({
        where: { id },
        include: {
          documents: {
            where: { isRequired: true }
          }
        }
      });

      if (!application) {
        throw new Error("Application not found");
      }

      if (application.currentStage !== "SHORTLISTED") {
        throw new Error("Application is not in SHORTLISTED stage");
      }

      // Check if all required documents are uploaded
      const requiredDocuments = application.documents.filter(doc => doc.isRequired);
      const submittedDocuments = requiredDocuments.filter(doc => doc.isSubmitted);

      if (submittedDocuments.length < requiredDocuments.length) {
        throw new Error("All required documents must be uploaded before submission");
      }

      // Update application stage
      const updatedApplication = await prisma.application.update({
        where: { id },
        data: {
          currentStage: "UNDER_DUE_DILIGENCE",
          submittedAt: new Date()
        },
        include: {
          fund: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          documents: {
            select: {
              id: true,
              documentType: true,
              fileName: true,
              fileUrl: true,
              isRequired: true,
              isSubmitted: true
            }
          }
        }
      });

      // Create notification for submission
      await prisma.applicationNotification.create({
        data: {
          applicationId: id,
          recipientEmail: application.applicantEmail,
          recipientPhone: application.applicantPhone,
          notificationType: "APPLICATION_SUBMITTED",
          title: "Application Submitted Successfully",
          message: `Your application for ${application.businessName} has been submitted successfully. We will review it and get back to you soon.`
        }
      });

      return updatedApplication;
    } catch (error: any) {
      throw new Error(`Failed to submit application: ${error.message}`);
    }
  }

  /**
   * Change application stage (admin/fund manager access)
   */
  static async changeApplicationStage(id: string, newStage: string, notes?: string): Promise<ApplicationWithRelations> {
    try {
      const application = await prisma.application.findUnique({
        where: { id }
      });

      if (!application) {
        throw new Error("Application not found");
      }

      // Validate stage transition
      // New workflow: Due Diligence → Term Sheet → Board Review → Investment Implementation
      const validTransitions: { [key: string]: string[] } = {
        "SHORTLISTED": ["UNDER_DUE_DILIGENCE", "BELOW_THRESHOLD"],
        "UNDER_DUE_DILIGENCE": ["DUE_DILIGENCE_COMPLETED", "BELOW_THRESHOLD"],
        "DUE_DILIGENCE_COMPLETED": ["TERM_SHEET", "TERM_SHEET_NEGOTIATION", "BELOW_THRESHOLD"],
        "TERM_SHEET": ["TERM_SHEET_NEGOTIATION", "UNDER_BOARD_REVIEW", "BELOW_THRESHOLD"],
        "TERM_SHEET_NEGOTIATION": ["UNDER_BOARD_REVIEW", "BELOW_THRESHOLD"],
        "UNDER_BOARD_REVIEW": ["BOARD_APPROVED", "BOARD_REJECTED", "BOARD_CONDITIONAL"],
        "BOARD_APPROVED": ["INVESTMENT_IMPLEMENTATION", "BELOW_THRESHOLD"],
        "BOARD_CONDITIONAL": ["TERM_SHEET", "TERM_SHEET_NEGOTIATION", "BOARD_REJECTED"],
        "INVESTMENT_IMPLEMENTATION": ["DISBURSED", "FUNDED"],
        "DISBURSED": ["FUNDED"],
        "FUNDED": ["PORTFOLIO_MANAGEMENT"]
      };

      const allowedTransitions = validTransitions[application.currentStage] || [];
      if (!allowedTransitions.includes(newStage)) {
        throw new Error(`Invalid stage transition from ${application.currentStage} to ${newStage}`);
      }

      // Update application stage
      const updatedApplication = await prisma.application.update({
        where: { id },
        data: {
          currentStage: newStage,
          updatedAt: new Date()
        },
        include: {
          fund: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          documents: {
            select: {
              id: true,
              documentType: true,
              fileName: true,
              fileUrl: true,
              isRequired: true,
              isSubmitted: true
            }
          }
        }
      });

      // Attempt to send stage change email (non-blocking)
      await this.sendStageChangeNotification(updatedApplication, newStage).catch(error => {
        console.error("Failed to send stage change email", {
          applicationId: updatedApplication.id,
          newStage,
          error: error.message
        });
      });

      // Create notification for stage change
      await prisma.applicationNotification.create({
        data: {
          applicationId: id,
          recipientEmail: application.applicantEmail,
          recipientPhone: application.applicantPhone,
          notificationType: "STAGE_CHANGE",
          title: `Application Stage Updated: ${newStage}`,
          message: `Your application has moved to the ${newStage} stage. ${notes || ''}`
        }
      });

      return updatedApplication;
    } catch (error: any) {
      throw new Error(`Failed to change application stage: ${error.message}`);
    }
  }

  private static async sendStageChangeNotification(application: any, newStage: string): Promise<void> {
    if (!application?.applicantEmail) {
      console.warn("Skipping stage change email - applicant email missing", {
        applicationId: application?.id,
        newStage
      });
      return;
    }

    const emailData = {
      applicantName: application.applicantName,
      applicantEmail: application.applicantEmail,
      businessName: application.businessName,
      applicationId: application.id,
      currentStage: newStage,
      additionalInfo: undefined
    };

    switch (newStage) {
      case "SHORTLISTED":
        await EmailNotificationService.sendApplicationShortlistedEmail(emailData);
        break;
      case "UNDER_DUE_DILIGENCE":
        await EmailNotificationService.sendDueDiligenceStartedEmail(emailData);
        break;
      case "DUE_DILIGENCE_COMPLETED":
        await EmailNotificationService.sendDueDiligenceCompletedEmail(emailData);
        break;
      case "UNDER_BOARD_REVIEW":
        await EmailNotificationService.sendBoardReviewStartedEmail(emailData);
        break;
      case "BOARD_APPROVED":
        await EmailNotificationService.sendInvestmentDecisionEmail(emailData);
        break;
      case "BOARD_REJECTED":
      case "BOARD_CONDITIONAL":
      case "BELOW_THRESHOLD":
      case "NOT_SELECTED":
        await EmailNotificationService.sendApplicationBelowThresholdEmail(emailData);
        break;
      case "INVESTMENT_IMPLEMENTATION":
        await EmailNotificationService.sendInvestmentImplementationStartedEmail(emailData);
        break;
      default:
        await EmailNotificationService.sendStageUpdateEmail(emailData);
        break;
    }
  }

  /**
   * Get all applications (admin/fund manager access)
   */
  static async getAllApplications(
    page?: number,
    limit?: number,
    stage?: string | string[],
    fundId?: string,
    paginate: boolean = false
  ): Promise<{ applications: ApplicationWithRelations[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = paginate && limit ? (Math.max(page ?? 1, 1) - 1) * limit : undefined;
      const take = paginate && limit ? limit : undefined;
      
      const where: any = {};
      
      if (stage) {
        // Handle both single stage string and array of stages
        if (Array.isArray(stage)) {
          where.currentStage = {
            in: stage
          };
        } else {
          where.currentStage = stage;
        }
      } else {
        // Exclude rejected applications (both REJECTED and BELOW_THRESHOLD)
        where.currentStage = {
          notIn: ['REJECTED', 'BELOW_THRESHOLD', 'PENDING_SHORTLISTING']
        };
      }
      
      if (fundId) where.fundId = fundId;

      const findManyArgs: any = {
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          fund: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          documents: {
            select: {
              id: true,
              documentType: true,
              fileName: true,
              fileUrl: true,
              isRequired: true,
              isSubmitted: true
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
              },
              applicantSignedBy: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              investorSignedBy: {
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
      };

      if (typeof skip === 'number') {
        findManyArgs.skip = skip;
      }
      if (typeof take === 'number') {
        findManyArgs.take = take;
      }

      const [applications, total] = await Promise.all([
        prisma.application.findMany(findManyArgs),
        prisma.application.count({ where })
      ]);

      const investmentImplementationIds = applications
        .map(app => app.investmentImplementation?.id)
        .filter(id => id) as string[];

      const disbursements = investmentImplementationIds.length > 0
        ? await prisma.fundDisbursement.findMany({
            where: {
              investmentImplementationId: {
                in: investmentImplementationIds
              }
            },
            select: {
              id: true,
              investmentImplementationId: true,
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
          })
        : [];

      const disbursementMap = new Map<string, typeof disbursements>();
      disbursements.forEach(disbursement => {
        const implId = disbursement.investmentImplementationId;
        if (!disbursementMap.has(implId)) {
          disbursementMap.set(implId, []);
        }
        disbursementMap.get(implId)!.push(disbursement);
      });

      const applicantEmails = applications.map(app => app.applicantEmail);

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

      const userMap = new Map(users.map(user => [user.email, user.id]));

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

      const portfolioCompanyMap = new Map(
        portfolioCompanies.map(pc => [pc.userId, pc])
      );

      const applicationsWithPortfolioCompanies = applications.map(app => {
        const userId = userMap.get(app.applicantEmail);
        const portfolioCompany = userId ? portfolioCompanyMap.get(userId) : null;
        const implementationId = app.investmentImplementation?.id;
        const disbursementList = implementationId ? disbursementMap.get(implementationId) || [] : [];
        
        return {
          ...app,
          portfolioCompanyId: portfolioCompany?.id || null,
          portfolioCompany: portfolioCompany || null,
          disbursements: disbursementList
        };
      });

      const totalPages = paginate && take ? Math.max(Math.ceil(total / take), 1) : 1;
      const currentPage = paginate && page ? Math.max(page, 1) : 1;

      return {
        applications: applicationsWithPortfolioCompanies,
        total,
        page: currentPage,
        totalPages
      };
    } catch (error: any) {
      throw new Error(`Failed to get applications: ${error.message}`);
    }
  }

  /**
   * Delete application (admin only)
   */
  static async deleteApplication(id: string): Promise<void> {
    try {
      const application = await prisma.application.findUnique({
        where: { id }
      });

    if (!application) {
      throw new Error("Application not found");
    }

    await prisma.application.delete({
      where: { id }
    });
    } catch (error: any) {
      throw new Error(`Failed to delete application: ${error.message}`);
    }
  }
}
