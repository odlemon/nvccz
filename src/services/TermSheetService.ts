//@ts-nocheck
import { PrismaClient, TermSheet, Application } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { dbConnection } from '../utils/database';
const prisma = dbConnection.getPrismaClient();

export interface CreateTermSheetRequest {
  applicationId: string;
  createdById: string;
  title: string;
  investmentAmount: number;
  equityPercentage?: number;
  valuation?: number;
  keyTerms?: string;
  conditions?: string;
  timeline?: string;
  documentUrl?: string;
  documentFileName?: string;
  documentSize?: number;
}

export interface UpdateTermSheetRequest {
  title?: string;
  investmentAmount?: number;
  equityPercentage?: number;
  valuation?: number;
  keyTerms?: string;
  conditions?: string;
  timeline?: string;
  documentUrl?: string;
  documentFileName?: string;
  documentSize?: number;
  status?: string;
  isDraft?: boolean;
  isFinal?: boolean;
}

export interface TermSheetWithRelations extends TermSheet {
  application: {
    id: string;
    businessName: string;
    applicantName: string;
    applicantEmail: string;
    currentStage: string;
    requestedAmount: any;
  };
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export class TermSheetService {
  /**
   * Create a new term sheet
   */
  static async createTermSheet(params: CreateTermSheetRequest): Promise<TermSheetWithRelations> {
    try {
      // Validate that application exists and is in TERM_SHEET stage
      const application = await prisma.application.findUnique({
        where: { id: params.applicationId }
      });

      if (!application) {
        throw new Error("Application not found");
      }

      if (application.currentStage !== "BOARD_APPROVED" && application.currentStage !== "TERM_SHEET") {
        throw new Error("Application must be in BOARD_APPROVED stage to create term sheet. Current stage: " + application.currentStage);
      }

      // Check if term sheet already exists - prevent multiple term sheets
      const existingTermSheet = await prisma.termSheet.findUnique({
        where: { applicationId: params.applicationId }
      });

      if (existingTermSheet) {
        throw new Error("A term sheet already exists for this application. Only one term sheet is allowed per application.");
      }

      // Create the term sheet
      const termSheet = await prisma.termSheet.create({
        data: {
          applicationId: params.applicationId,
          createdById: params.createdById,
          title: params.title,
          investmentAmount: new Decimal(params.investmentAmount),
          equityPercentage: params.equityPercentage ? new Decimal(params.equityPercentage) : null,
          valuation: params.valuation ? new Decimal(params.valuation) : null,
          keyTerms: params.keyTerms,
          conditions: params.conditions,
          timeline: params.timeline,
          documentUrl: params.documentUrl,
          documentFileName: params.documentFileName,
          documentSize: params.documentSize,
          status: "DRAFT",
          isDraft: true,
          isFinal: false
        },
        include: {
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true,
              requestedAmount: true
            }
          },
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

      // Update application stage to TERM_SHEET if it's currently BOARD_APPROVED
      if (application.currentStage === "BOARD_APPROVED") {
        await prisma.application.update({
          where: { id: params.applicationId },
          data: {
            currentStage: "TERM_SHEET",
            updatedAt: new Date()
          }
        });
        console.log(`Application ${params.applicationId} stage updated from BOARD_APPROVED to TERM_SHEET`);
      }

      // Create notification for applicant
      await prisma.applicationNotification.create({
        data: {
          applicationId: params.applicationId,
          recipientEmail: application.applicantEmail,
          recipientPhone: application.applicantPhone,
          notificationType: "TERM_SHEET_CREATED",
          title: "Term Sheet Created",
          message: `A term sheet has been created for your application (${application.businessName}). You can now review the investment terms and conditions.`
        }
      });

      return termSheet;
    } catch (error: any) {
      throw new Error(`Failed to create term sheet: ${error.message}`);
    }
  }

  /**
   * Get term sheet by application ID
   */
  static async getTermSheetByApplicationId(applicationId: string): Promise<TermSheetWithRelations | null> {
    try {
      const termSheet = await prisma.termSheet.findUnique({
        where: { applicationId },
        include: {
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true,
              requestedAmount: true
            }
          },
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

      return termSheet;
    } catch (error: any) {
      throw new Error(`Failed to get term sheet: ${error.message}`);
    }
  }

  /**
   * Update term sheet
   */
  static async updateTermSheet(applicationId: string, params: UpdateTermSheetRequest): Promise<TermSheetWithRelations> {
    try {
      const termSheet = await prisma.termSheet.findUnique({
        where: { applicationId }
      });

      if (!termSheet) {
        throw new Error("Term sheet not found");
      }

      if (termSheet.isSigned) {
        throw new Error("Cannot update signed term sheet. Term sheet has already been signed and cannot be modified.");
      }

      // Update the term sheet
      const updatedTermSheet = await prisma.termSheet.update({
        where: { applicationId },
        data: {
          title: params.title,
          investmentAmount: params.investmentAmount ? new Decimal(params.investmentAmount) : undefined,
          equityPercentage: params.equityPercentage ? new Decimal(params.equityPercentage) : undefined,
          valuation: params.valuation ? new Decimal(params.valuation) : undefined,
          keyTerms: params.keyTerms,
          conditions: params.conditions,
          timeline: params.timeline,
          documentUrl: params.documentUrl,
          documentFileName: params.documentFileName,
          documentSize: params.documentSize,
          status: params.status,
          isDraft: params.isDraft,
          isFinal: params.isFinal,
          updatedAt: new Date()
        },
        include: {
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true,
              requestedAmount: true
            }
          },
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

      return updatedTermSheet;
    } catch (error: any) {
      throw new Error(`Failed to update term sheet: ${error.message}`);
    }
  }

  /**
   * Mark term sheet as final
   */
  static async markAsFinal(applicationId: string): Promise<TermSheetWithRelations> {
    try {
      const termSheet = await prisma.termSheet.findUnique({
        where: { applicationId },
        include: {
          application: true
        }
      });

      if (!termSheet) {
        throw new Error("Term sheet not found");
      }

      if (termSheet.isSigned) {
        throw new Error("Cannot modify signed term sheet. Term sheet has already been signed and cannot be modified.");
      }

      // Update term sheet to final
      const updatedTermSheet = await prisma.termSheet.update({
        where: { applicationId },
        data: {
          status: "FINAL",
          isDraft: false,
          isFinal: true,
          updatedAt: new Date()
        },
        include: {
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true,
              requestedAmount: true
            }
          },
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

      // Create notification for applicant
      await prisma.applicationNotification.create({
        data: {
          applicationId,
          recipientEmail: termSheet.application.applicantEmail,
          recipientPhone: termSheet.application.applicantPhone,
          notificationType: "TERM_SHEET_FINALIZED",
          title: "Term Sheet Finalized",
          message: `The term sheet for your application (${termSheet.application.businessName}) has been finalized. Please review and sign the agreement.`
        }
      });

      return updatedTermSheet;
    } catch (error: any) {
      throw new Error(`Failed to mark term sheet as final: ${error.message}`);
    }
  }

  /**
   * Sign term sheet
   */
  static async signTermSheet(applicationId: string): Promise<TermSheetWithRelations> {
    try {
      const termSheet = await prisma.termSheet.findUnique({
        where: { applicationId },
        include: {
          application: true
        }
      });

      if (!termSheet) {
        throw new Error("Term sheet not found");
      }

      if (termSheet.isSigned) {
        throw new Error("Term sheet is already signed. Cannot sign the same term sheet multiple times.");
      }

      if (!termSheet.isFinal) {
        throw new Error("Cannot sign draft term sheet. Term sheet must be finalized before signing.");
      }

      // Update term sheet to signed
      const updatedTermSheet = await prisma.termSheet.update({
        where: { applicationId },
        data: {
          status: "SIGNED",
          isSigned: true,
          signedAt: new Date(),
          updatedAt: new Date()
        },
        include: {
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true,
              requestedAmount: true
            }
          },
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

      // Update application stage to INVESTMENT_IMPLEMENTATION
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          currentStage: "INVESTMENT_IMPLEMENTATION",
          updatedAt: new Date()
        }
      });

      // Create notification for applicant
      await prisma.applicationNotification.create({
        data: {
          applicationId,
          recipientEmail: termSheet.application.applicantEmail,
          recipientPhone: termSheet.application.applicantPhone,
          notificationType: "TERM_SHEET_SIGNED",
          title: "Term Sheet Signed",
          message: `The term sheet for your application (${termSheet.application.businessName}) has been signed. Your application will now proceed to investment implementation.`
        }
      });

      return updatedTermSheet;
    } catch (error: any) {
      throw new Error(`Failed to sign term sheet: ${error.message}`);
    }
  }

  /**
   * Get all term sheets (for admin/fund manager access)
   */
  static async getAllTermSheets(
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<{ termSheets: TermSheetWithRelations[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const where: any = {};
      if (status) where.status = status;

      const [termSheets, total] = await Promise.all([
        prisma.termSheet.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            application: {
              select: {
                id: true,
                businessName: true,
                applicantName: true,
                applicantEmail: true,
                currentStage: true,
                requestedAmount: true
              }
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }),
        prisma.termSheet.count({ where })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        termSheets,
        total,
        page,
        totalPages
      };
    } catch (error: any) {
      throw new Error(`Failed to get term sheets: ${error.message}`);
    }
  }

  /**
   * Get my term sheets (for the logged-in user)
   */
  static async getMyTermSheets(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ termSheets: TermSheetWithRelations[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;

      const [termSheets, total] = await Promise.all([
        prisma.termSheet.findMany({
          where: { createdById: userId },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            application: {
              select: {
                id: true,
                businessName: true,
                applicantName: true,
                applicantEmail: true,
                currentStage: true,
                requestedAmount: true
              }
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }),
        prisma.termSheet.count({ where: { createdById: userId } })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        termSheets,
        total,
        page,
        totalPages
      };
    } catch (error: any) {
      throw new Error(`Failed to get my term sheets: ${error.message}`);
    }
  }
}
