//@ts-nocheck
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '../utils/database';

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
          applicantEmail: params.applicantEmail,
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
      const validTransitions: { [key: string]: string[] } = {
        "SHORTLISTED": ["UNDER_DUE_DILIGENCE", "REJECTED"],
        "UNDER_DUE_DILIGENCE": ["DUE_DILIGENCE_COMPLETED", "REJECTED"],
        "DUE_DILIGENCE_COMPLETED": ["UNDER_BOARD_REVIEW", "REJECTED"],
        "UNDER_BOARD_REVIEW": ["BOARD_APPROVED", "BOARD_REJECTED", "BOARD_CONDITIONAL"],
        "BOARD_APPROVED": ["TERM_SHEET_NEGOTIATION"],
        "BOARD_CONDITIONAL": ["UNDER_DUE_DILIGENCE", "BOARD_REJECTED"],
        "TERM_SHEET_NEGOTIATION": ["IMPLEMENTATION"],
        "IMPLEMENTATION": ["FUNDED"],
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
              isRequired: true,
              isSubmitted: true
            }
          }
        }
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

  /**
   * Get all applications (admin/fund manager access)
   */
  static async getAllApplications(
    page: number = 1,
    limit: number = 10,
    stage?: string,
    fundId?: string
  ): Promise<{ applications: ApplicationWithRelations[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const where: any = {};
      if (stage) where.currentStage = stage;
      if (fundId) where.fundId = fundId;

      const [applications, total] = await Promise.all([
        prisma.application.findMany({
          where,
          skip,
          take: limit,
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
                }
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
        prisma.application.count({ where })
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

      return {
        applications: applicationsWithPortfolioCompanies,
        total,
        page,
        totalPages: Math.ceil(total / limit)
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

      // Only allow deletion if application is in SHORTLISTED stage
      if (application.currentStage !== "SHORTLISTED") {
        throw new Error("Cannot delete application that is not in SHORTLISTED stage");
      }

      await prisma.application.delete({
        where: { id }
      });
    } catch (error: any) {
      throw new Error(`Failed to delete application: ${error.message}`);
    }
  }
}
