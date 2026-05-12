//@ts-nocheck
import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '../utils/database';
import { RBZ_EXCHANGE_CONTROL_DOCUMENT_TYPE } from '../config/applicationStatutoryCompliance';
import { ANALYST_SCREENING_MIN_SCORE } from '../config/dealWorkflowStages';
import { ActiveDdPmsTaskPackService } from './ActiveDdPmsTaskPackService';
import { DealReferenceService } from './DealReferenceService';
import { DueDiligenceService } from './DueDiligenceService';
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
  /** Internal: AI/auto screening narrative when rejected at screening (API only; not in applicant email). */
  screeningRejectionReason?: string | null;
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
      const providedDocumentTypes = params.documents.map((doc) => doc.documentType);

      const missingDocuments = requiredDocumentTypes.filter((type) => !providedDocumentTypes.includes(type));
      if (missingDocuments.length > 0) {
        throw new Error(`Missing required documents: ${missingDocuments.join(", ")}`);
      }

      const application = await prisma.$transaction(async (tx) => {
        const dealReference = await DealReferenceService.allocateNext(tx);
        return tx.application.create({
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
            dealReference,
            currentStage: "SCREENING_PENDING",
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
      });

      return application;
    } catch (error: any) {
      throw new Error(`Failed to create application: ${error.message}`);
    }
  }

  /**
   * Get application by ID (admin/fund manager access)
   * @param options.light Faster response: omits heavy disbursement / nested user joins.
   */
  static async getApplicationById(
    id: string,
    options?: { light?: boolean }
  ): Promise<ApplicationWithRelations | null> {
    try {
      if (options?.light) {
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
            assignedAnalyst: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                roleCode: true
              }
            },
            dueDiligenceReview: {
              select: {
                id: true,
                status: true,
                reviewerId: true,
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
              select: {
                id: true,
                status: true,
                reviewerId: true,
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
              select: {
                id: true,
                title: true,
                status: true,
                version: true,
                investmentAmount: true,
                valuation: true,
                equityPercentage: true
              }
            },
            investmentImplementation: {
              select: {
                id: true,
                disbursementMode: true,
                totalCommittedAmount: true
              }
            }
          }
        });
        if (!application) {
          return null;
        }
        return {
          ...application,
          disbursements: {
            disbursementMode: null,
            totalCommittedAmount: null,
            totalDisbursedAmount: 0,
            disbursements: []
          }
        } as any;
      }

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
          },
          investmentImplementation: {
            select: {
              id: true,
              disbursementMode: true,
              totalCommittedAmount: true,
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
                  disbursedAt: true,
                  createdAt: true,
                  updatedAt: true,
                  approvedBy: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true
                    }
                  },
                  disbursedBy: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true
                    }
                  },
                  milestone: {
                    select: {
                      id: true,
                      title: true,
                      description: true
                    }
                  }
                },
                orderBy: {
                  disbursementDate: 'desc'
                }
              }
            }
          }
        }
      });

      if (!application) {
        return null;
      }

      // Build disbursements object
      let disbursementsData: any = {
        disbursementMode: null,
        totalCommittedAmount: null,
        totalDisbursedAmount: 0,
        disbursements: []
      };

      if (application.investmentImplementation) {
        const implementation = application.investmentImplementation;
        disbursementsData.disbursementMode = implementation.disbursementMode || 'ONE_TIME';
        disbursementsData.totalCommittedAmount = implementation.totalCommittedAmount 
          ? Number(implementation.totalCommittedAmount) 
          : null;

        // Calculate total disbursed amount (only from DISBURSED status)
        const totalDisbursed = implementation.fundDisbursements
          .filter(d => d.status === 'DISBURSED')
          .reduce((sum, d) => {
            const amount = typeof d.amount === 'number' ? d.amount : Number(d.amount);
            return sum + amount;
          }, 0);
        
        disbursementsData.totalDisbursedAmount = totalDisbursed;

        // Format disbursements array
        disbursementsData.disbursements = implementation.fundDisbursements.map(d => ({
          id: d.id,
          amount: typeof d.amount === 'number' ? d.amount : Number(d.amount),
          disbursementDate: d.disbursementDate,
          disbursementType: d.disbursementType,
          status: d.status,
          notes: d.notes,
          transactionReference: d.transactionReference,
          approvedAt: d.approvedAt,
          disbursedAt: d.disbursedAt,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt,
          approvedBy: d.approvedBy,
          disbursedBy: d.disbursedBy,
          milestone: d.milestone
        }));
      }

      // Add disbursements object to application
      return {
        ...application,
        disbursements: disbursementsData
      } as any;
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

      // Only allow updates if application is in Screening (qualified) stage
      if (application.currentStage !== "SCREENING") {
        throw new Error("Cannot update application that is not in SCREENING stage");
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

      if (application.currentStage !== "SCREENING") {
        throw new Error("Application is not in SCREENING stage");
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
          currentStage: "ACTIVE_DD",
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

      let seedActorId: string | null = null;
      if (updatedApplication.fundId) {
        const fm = await prisma.fundManager.findFirst({
          where: { fundId: updatedApplication.fundId, isActive: true },
          select: { userId: true }
        });
        const fund = await prisma.fund.findUnique({
          where: { id: updatedApplication.fundId },
          select: { createdById: true }
        });
        seedActorId = fm?.userId ?? fund?.createdById ?? null;
      }
      if (seedActorId) {
        const assignee = updatedApplication.assignedAnalystId || seedActorId;
        await ActiveDdPmsTaskPackService.ensureSeededForActiveDueDiligence({
          applicationId: id,
          assigneeUserId: assignee,
          createdByUserId: seedActorId,
          dealReference: updatedApplication.dealReference ?? null
        }).catch((err: any) => {
          console.error("Active DD PMS task pack seed failed (submitApplication)", {
            applicationId: id,
            error: err?.message
          });
        });
      }

      return updatedApplication;
    } catch (error: any) {
      throw new Error(`Failed to submit application: ${error.message}`);
    }
  }

  /**
   * Change application stage (admin/fund manager access)
   */
  static async changeApplicationStage(
    id: string,
    newStage: string,
    notes?: string,
    actorUserId?: string
  ): Promise<ApplicationWithRelations> {
    try {
      const application = await prisma.application.findUnique({
        where: { id }
      });

      if (!application) {
        throw new Error("Application not found");
      }

      const previousStage = application.currentStage;

      // Validate stage transition
      // New workflow: Due Diligence → Term Sheet → Board Review → Investment Implementation
      const validTransitions: { [key: string]: string[] } = {
        "SCREENING_PENDING": ["SCREENING", "REJECTED_SCREENING", "AUTO_REJECTED", "BELOW_THRESHOLD"],
        "SCREENING": ["ACTIVE_DD", "REJECTED_SCREENING", "BELOW_THRESHOLD"],
        "ACTIVE_DD": ["DUE_DILIGENCE_COMPLETED", "BELOW_THRESHOLD"],
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

      if (previousStage === "SCREENING" && newStage === "ACTIVE_DD" && actorUserId) {
        const assignee = updatedApplication.assignedAnalystId || actorUserId;
        await ActiveDdPmsTaskPackService.ensureSeededForActiveDueDiligence({
          applicationId: id,
          assigneeUserId: assignee,
          createdByUserId: actorUserId,
          dealReference: updatedApplication.dealReference ?? null
        }).catch((err: any) => {
          console.error("Active DD PMS task pack seed failed (changeApplicationStage)", {
            applicationId: id,
            error: err?.message
          });
        });
      }

      return updatedApplication;
    } catch (error: any) {
      throw new Error(`Failed to change application stage: ${error.message}`);
    }
  }

  /**
   * Legal/compliance: KYC verified + existing RBZ Exchange Control document → complianceCleared.
   * Clearing KYC clears complianceCleared (funds disbursement remains blocked).
   */
  static async updateStatutoryCompliance(
    applicationId: string,
    kycVerified: boolean
  ): Promise<ApplicationWithRelations> {
    try {
      const application = await prisma.application.findUnique({ where: { id: applicationId } });
      if (!application) {
        throw new Error("Application not found");
      }

      if (!kycVerified) {
        return await prisma.application.update({
          where: { id: applicationId },
          data: { kycVerified: false, complianceCleared: false, updatedAt: new Date() },
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
      }

      const rbz = await prisma.applicationDocument.findFirst({
        where: { applicationId, documentType: RBZ_EXCHANGE_CONTROL_DOCUMENT_TYPE }
      });
      if (!rbz) {
        throw new Error(
          "RBZ Exchange Control approval document must be uploaded before KYC can be verified."
        );
      }

      return await prisma.application.update({
        where: { id: applicationId },
        data: { kycVerified: true, complianceCleared: true, updatedAt: new Date() },
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
    } catch (error: any) {
      throw new Error(`Failed to update statutory compliance: ${error.message}`);
    }
  }

  /**
   * Replace any existing RBZ Exchange Control document for this application with a new row (single current file).
   */
  static async replaceRbzExchangeControlDocument(
    applicationId: string,
    params: { fileName: string; fileUrl: string; fileSize: number }
  ) {
    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application) {
      throw new Error("Application not found");
    }

    return prisma.$transaction(async (tx) => {
      await tx.applicationDocument.deleteMany({
        where: { applicationId, documentType: RBZ_EXCHANGE_CONTROL_DOCUMENT_TYPE }
      });
      return tx.applicationDocument.create({
        data: {
          applicationId,
          documentType: RBZ_EXCHANGE_CONTROL_DOCUMENT_TYPE,
          fileName: params.fileName,
          fileUrl: params.fileUrl,
          fileSize: params.fileSize,
          isRequired: false,
          isSubmitted: true
        }
      });
    });
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
      case "SCREENING":
        await EmailNotificationService.sendApplicationShortlistedEmail(emailData);
        break;
      case "ACTIVE_DD":
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
      'SCREENING_PENDING': 5,
      'SCREENING': 10,
      'ACTIVE_DD': 20,
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
      'REJECTED_SCREENING': 0,
      'AUTO_REJECTED': 0,
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
        where.currentStage = {
          notIn: [
            'REJECTED',
            'REJECTED_SCREENING',
            'AUTO_REJECTED',
            'BELOW_THRESHOLD',
            'SCREENING_PENDING',
            'PENDING_SHORTLISTING'
          ]
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
          },
          investmentImplementation: {
            select: {
              id: true
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
        const applicationProgress = this.calculateApplicationProgress(
          app.currentStage,
          app.requestedAmount,
          disbursementList
        );
        
        return {
          ...app,
          portfolioCompanyId: portfolioCompany?.id || null,
          portfolioCompany: portfolioCompany || null,
          disbursements: disbursementList,
          applicationProgress: applicationProgress
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

  static async assignLeadAnalyst(
    applicationId: string,
    analystUserId: string,
    actorUserId: string
  ): Promise<ApplicationWithRelations> {
    try {
      const application = await prisma.application.findUnique({
        where: { id: applicationId }
      });
      if (!application) {
        throw new Error("Application not found");
      }
      if (!["SCREENING_PENDING", "SCREENING"].includes(application.currentStage)) {
        throw new Error("Lead analyst can only be assigned during screening stages");
      }

      const actor = await prisma.user.findUnique({
        where: { id: actorUserId },
        include: { role: true }
      });
      if (!actor) {
        throw new Error("Actor not found");
      }

      if (process.env.NVCCZ_STRICT_DEAL_ACCESS === "true") {
        const rn = String(actor.role?.name || "").toLowerCase();
        const privileged = rn === "admin" || rn === "ceo" || rn === "cio";
        let isFundStaff = privileged;
        if (!isFundStaff && application.fundId) {
          const fm = await prisma.fundManager.findFirst({
            where: { fundId: application.fundId, userId: actorUserId, isActive: true }
          });
          isFundStaff = Boolean(fm);
        }
        if (!isFundStaff) {
          throw new Error("Only fund managers or executives can assign the lead analyst");
        }
      }

      const analyst = await prisma.user.findUnique({
        where: { id: analystUserId },
        include: { role: true }
      });
      if (!analyst) {
        throw new Error("Analyst user not found");
      }
      if (analyst.userDepartment !== "Investments") {
        throw new Error("Lead analyst must be a user in the Investments department");
      }
      const arc = String(analyst.roleCode || "").toUpperCase();
      const arn = String(analyst.role?.name || "").toLowerCase();
      const isAnalyst = arc === "INV_ANALYST" || arn.includes("investment analyst");
      if (!isAnalyst) {
        throw new Error("Assigned user must be an investment analyst");
      }

      return await prisma.application.update({
        where: { id: applicationId },
        data: { assignedAnalystId: analystUserId, updatedAt: new Date() },
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
          assignedAnalyst: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              roleCode: true
            }
          }
        }
      });
    } catch (error: any) {
      throw new Error(`Failed to assign lead analyst: ${error.message}`);
    }
  }

  static async recordAnalystScreeningScore(
    applicationId: string,
    actorUserId: string,
    score: number
  ): Promise<ApplicationWithRelations> {
    try {
      if (typeof score !== "number" || Number.isNaN(score) || score < 0 || score > 100) {
        throw new Error("score must be a number between 0 and 100");
      }

      const application = await prisma.application.findUnique({
        where: { id: applicationId }
      });
      if (!application) {
        throw new Error("Application not found");
      }
      if (application.currentStage !== "SCREENING") {
        throw new Error("Analyst screening score can only be recorded in SCREENING stage");
      }

      if (!application.assignedAnalystId) {
        throw new Error("Assign a lead analyst before recording the screening score");
      }
      if (application.assignedAnalystId !== actorUserId) {
        throw new Error("Only the assigned lead analyst can record the screening score for this application");
      }

      const below = score < ANALYST_SCREENING_MIN_SCORE;

      const fullInclude = {
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
        assignedAnalyst: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            roleCode: true
          }
        }
      };

      if (below) {
        return await prisma.application.update({
          where: { id: applicationId },
          data: {
            screeningScore: new Decimal(score),
            currentStage: "REJECTED_SCREENING",
            screeningOutcome: "REJECTED_SCREENING",
            screeningRejectionReason: `Lead analyst screening score ${score} is below the minimum required (${ANALYST_SCREENING_MIN_SCORE}).`,
            updatedAt: new Date()
          },
          include: fullInclude
        });
      }

      await prisma.application.update({
        where: { id: applicationId },
        data: {
          screeningScore: new Decimal(score),
          screeningOutcome: "PASSED_SCREENING",
          currentStage: "SCREENING",
          updatedAt: new Date()
        }
      });

      await DueDiligenceService.initiateDueDiligence({
        applicationId,
        reviewerId: application.assignedAnalystId
      });

      const refreshed = await prisma.application.findUnique({
        where: { id: applicationId },
        include: fullInclude
      });
      if (!refreshed) {
        throw new Error("Application not found after due diligence initiation");
      }
      return refreshed;
    } catch (error: any) {
      throw new Error(`Failed to record analyst screening score: ${error.message}`);
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
