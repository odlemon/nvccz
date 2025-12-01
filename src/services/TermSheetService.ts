//@ts-nocheck
import { PrismaClient, TermSheet, Application } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

import { prisma } from '../utils/database';
import { FirebaseStorageService } from './FirebaseStorageService';

export interface CreateTermSheetRequest {
  applicationId: string;
  createdById: string;
  title: string;
  investmentAmount: number;
  equityPercentage: number;
  valuation: number;
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

      if (application.currentStage !== "TERM_SHEET" && application.currentStage !== "TERM_SHEET_NEGOTIATION") {
        throw new Error("Application must be in TERM_SHEET or TERM_SHEET_NEGOTIATION stage to create term sheet. Current stage: " + application.currentStage);
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
          equityPercentage: new Decimal(params.equityPercentage),
          valuation: new Decimal(params.valuation),
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

      // Application should already be in TERM_SHEET or TERM_SHEET_NEGOTIATION stage
      // No need to update stage here

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
   * Supports both applicationId and term sheet ID
   */
  static async updateTermSheet(applicationId: string, params: UpdateTermSheetRequest): Promise<TermSheetWithRelations> {
    try {
      if (!params || typeof params !== 'object') {
        throw new Error("Invalid update parameters provided");
      }

      // Try to find term sheet by applicationId first
      let termSheet = await prisma.termSheet.findUnique({
        where: { applicationId }
      });

      // If not found, try by term sheet ID (in case user passed term sheet ID instead of applicationId)
      if (!termSheet) {
        termSheet = await prisma.termSheet.findUnique({
          where: { id: applicationId }
        });
      }

      if (!termSheet) {
        throw new Error("Term sheet not found");
      }

      if (termSheet.isSigned) {
        throw new Error("Cannot update signed term sheet. Term sheet has already been signed and cannot be modified.");
      }

      // Prevent signature field updates (signatures are immutable once uploaded)
      if (termSheet.applicantSignatureUrl || termSheet.investorSignatureUrl) {
        throw new Error("Cannot update term sheet that has signatures. Signatures cannot be modified once uploaded.");
      }

      // Build update data object - only include fields that are actually provided
      const updateData: any = {
        updatedAt: new Date()
      };

      if (params.title !== undefined) {
        updateData.title = params.title;
      }
      if (params.investmentAmount !== undefined) {
        updateData.investmentAmount = new Decimal(params.investmentAmount);
      }
      if (params.equityPercentage !== undefined) {
        updateData.equityPercentage = new Decimal(params.equityPercentage);
      }
      if (params.valuation !== undefined) {
        updateData.valuation = new Decimal(params.valuation);
      }
      if (params.keyTerms !== undefined) {
        updateData.keyTerms = params.keyTerms;
      }
      if (params.conditions !== undefined) {
        updateData.conditions = params.conditions;
      }
      if (params.timeline !== undefined) {
        updateData.timeline = params.timeline;
      }
      if (params.documentUrl !== undefined) {
        updateData.documentUrl = params.documentUrl;
      }
      if (params.documentFileName !== undefined) {
        updateData.documentFileName = params.documentFileName;
      }
      if (params.documentSize !== undefined) {
        updateData.documentSize = params.documentSize;
      }
      if (params.status !== undefined) {
        updateData.status = params.status;
      }
      if (params.isDraft !== undefined) {
        updateData.isDraft = params.isDraft;
      }
      if (params.isFinal !== undefined) {
        updateData.isFinal = params.isFinal;
      }

      // Update the term sheet
      const updatedTermSheet = await prisma.termSheet.update({
        where: { id: termSheet.id },
        data: updateData,
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
   * Sign term sheet with signature
   */
  static async signTermSheet(
    applicationId: string,
    signedById: string,
    signatureType: 'applicant' | 'investor',
    signatureFile?: { buffer: Buffer; fileName: string; mimetype: string }
  ): Promise<TermSheetWithRelations> {
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

      // Check if signature already exists for this type (cannot update signature)
      if (signatureType === 'applicant' && termSheet.applicantSignatureUrl) {
        throw new Error("Applicant signature already exists. Signatures cannot be updated once uploaded.");
      }
      if (signatureType === 'investor' && termSheet.investorSignatureUrl) {
        throw new Error("Investor signature already exists. Signatures cannot be updated once uploaded.");
      }

      // Validate signature file is provided
      if (!signatureFile) {
        throw new Error("Signature file is required to sign term sheet");
      }

      // Validate file type (should be image)
      const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
      if (!allowedMimeTypes.includes(signatureFile.mimetype.toLowerCase())) {
        throw new Error("Signature must be an image file (PNG, JPEG, JPG, GIF, or WEBP)");
      }

      // Upload signature to Firebase Storage
      const { downloadURL, filePath } = await FirebaseStorageService.uploadTermSheetSignature(
        signatureFile.buffer,
        applicationId,
        termSheet.id,
        signatureType,
        signatureFile.fileName
      );

      // Prepare update data based on signature type
      const updateData: any = {
        updatedAt: new Date()
      };

      if (signatureType === 'applicant') {
        updateData.applicantSignatureUrl = downloadURL;
        updateData.applicantSignatureFileName = signatureFile.fileName;
        updateData.applicantSignedById = signedById;
        updateData.applicantSignedAt = new Date();
        
        // Check if investor has also signed - if so, mark as fully signed
        if (termSheet.investorSignatureUrl) {
          updateData.status = "SIGNED";
          updateData.isSigned = true;
          updateData.signedAt = new Date();
        }
      } else if (signatureType === 'investor') {
        updateData.investorSignatureUrl = downloadURL;
        updateData.investorSignatureFileName = signatureFile.fileName;
        updateData.investorSignedById = signedById;
        updateData.investorSignedAt = new Date();
        
        // Check if applicant has also signed - if so, mark as fully signed
        if (termSheet.applicantSignatureUrl) {
          updateData.status = "SIGNED";
          updateData.isSigned = true;
          updateData.signedAt = new Date();
        }
      }

      // Update term sheet with signature
      const updatedTermSheet = await prisma.termSheet.update({
        where: { applicationId },
        data: updateData,
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

      // Only update application stage if both signatures are present (fully signed)
      if (updatedTermSheet.isSigned && updatedTermSheet.applicantSignatureUrl && updatedTermSheet.investorSignatureUrl) {
        // Update application stage to UNDER_BOARD_REVIEW (new workflow: term sheet → board review → investment implementation)
        await prisma.application.update({
          where: { id: applicationId },
          data: {
            currentStage: "UNDER_BOARD_REVIEW",
            updatedAt: new Date()
          }
        });
      }

      // Create notification based on signature status
      if (updatedTermSheet.isSigned) {
        // Both signatures present - fully signed
        await prisma.applicationNotification.create({
          data: {
            applicationId,
            recipientEmail: termSheet.application.applicantEmail,
            recipientPhone: termSheet.application.applicantPhone,
            notificationType: "TERM_SHEET_SIGNED",
            title: "Term Sheet Fully Signed",
            message: `The term sheet for your application (${termSheet.application.businessName}) has been fully signed by both parties. Your application will now proceed to board review.`
          }
        });
      } else {
        // Partial signature - notify about pending signature
        const pendingParty = signatureType === 'applicant' ? 'investor' : 'applicant';
        await prisma.applicationNotification.create({
          data: {
            applicationId,
            recipientEmail: termSheet.application.applicantEmail,
            recipientPhone: termSheet.application.applicantPhone,
            notificationType: "TERM_SHEET_PARTIALLY_SIGNED",
            title: "Term Sheet Partially Signed",
            message: `The ${signatureType} has signed the term sheet for your application (${termSheet.application.businessName}). Waiting for ${pendingParty} signature to complete.`
          }
        });
      }

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
   * Get my term sheets (for the logged-in user - applicant)
   * Returns term sheets associated with the user's applications
   */
  static async getMyTermSheets(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ termSheets: TermSheetWithRelations[]; total: number; page: number; totalPages: number }> {
    try {
      // Get user's email to find their applications
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true }
      });

      if (!user) {
        // Return empty result instead of throwing error
        return {
          termSheets: [],
          total: 0,
          page,
          totalPages: 0
        };
      }

      const skip = (page - 1) * limit;

      // Find term sheets for applications belonging to this user's email
      const [termSheets, total] = await Promise.all([
        prisma.termSheet.findMany({
          where: {
            application: {
              applicantEmail: user.email
            }
          },
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
        prisma.termSheet.count({
          where: {
            application: {
              applicantEmail: user.email
            }
          }
        })
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        termSheets,
        total,
        page,
        totalPages
      };
    } catch (error: any) {
      // Return empty result instead of throwing error
      return {
        termSheets: [],
        total: 0,
        page,
        totalPages: 0
      };
    }
  }
}
