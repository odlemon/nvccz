//@ts-nocheck
import { PrismaClient } from '@prisma/client';

import { dbConnection } from '../utils/database';
const prisma = dbConnection.getPrismaClient();

export interface CreateBoardReviewRequest {
  applicationId: string;
  reviewerId: string;
  investmentApproved?: boolean;
  investmentRejected?: boolean;
  conditionalApproval?: boolean;
  recommendationReport?: string;
  additionalInformation?: string;
  decisionReason?: string;
  conditions?: string;
  nextSteps?: string;
  overallScore?: number;
  finalComments?: string;
}

export interface UpdateBoardReviewRequest {
  investmentApproved?: boolean;
  investmentRejected?: boolean;
  conditionalApproval?: boolean;
  recommendationReport?: string;
  additionalInformation?: string;
  decisionReason?: string;
  conditions?: string;
  nextSteps?: string;
  overallScore?: number;
  finalComments?: string;
}

export interface BoardReviewWithRelations {
  id: string;
  applicationId: string;
  reviewerId: string;
  investmentApproved: boolean;
  investmentRejected: boolean;
  conditionalApproval: boolean;
  recommendationReport?: string;
  additionalInformation?: string;
  decisionReason?: string;
  conditions?: string;
  nextSteps?: string;
  overallScore?: number;
  finalComments?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  reviewer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  application: {
    id: string;
    businessName: string;
    applicantName: string;
    applicantEmail: string;
    currentStage: string;
    requestedAmount: any;
  };
}

export class BoardReviewService {
  /**
   * Create a new board review
   */
  static async createBoardReview(params: CreateBoardReviewRequest): Promise<BoardReviewWithRelations> {
    try {
      // Validate that application exists and is in the correct stage
      const application = await prisma.application.findUnique({
        where: { id: params.applicationId }
      });

      if (!application) {
        throw new Error("Application not found");
      }

      if (application.currentStage !== "UNDER_BOARD_REVIEW") {
        throw new Error("Application must be in UNDER_BOARD_REVIEW stage to create board review. Current stage: " + application.currentStage);
      }

      // Validate that only one decision option is selected
      const decisionOptions = [
        params.investmentApproved || false,
        params.investmentRejected || false,
        params.conditionalApproval || false
      ];

      const selectedOptions = decisionOptions.filter(option => option);
      if (selectedOptions.length !== 1) {
        throw new Error("Exactly one decision option must be selected: Investment Approved, Investment Rejected, or Conditional Approval");
      }

      // Check if board review already exists - prevent multiple board reviews
      const existingReview = await prisma.boardReview.findUnique({
        where: { applicationId: params.applicationId }
      });

      if (existingReview) {
        throw new Error("A board review already exists for this application. Only one board review is allowed per application.");
      }

             // Create the board review and update application stage in a transaction
      const boardReview = await prisma.$transaction(async (tx) => {
        // Create the board review
        const newBoardReview = await tx.boardReview.create({
          data: {
            applicationId: params.applicationId,
            reviewerId: params.reviewerId,
            investmentApproved: params.investmentApproved || false,
            investmentRejected: params.investmentRejected || false,
            conditionalApproval: params.conditionalApproval || false,
            recommendationReport: params.recommendationReport,
            additionalInformation: params.additionalInformation,
            decisionReason: params.decisionReason,
            conditions: params.conditions,
            nextSteps: params.nextSteps,
            overallScore: params.overallScore,
            finalComments: params.finalComments,
            status: "IN_PROGRESS"
          }
        });

        // Application is already in UNDER_BOARD_REVIEW stage
        await tx.application.update({
          where: { id: params.applicationId },
          data: { 
            updatedAt: new Date()
          }
        });

        return newBoardReview;
      });

      // Get the complete board review with relations
      const boardReviewWithRelations = await prisma.boardReview.findUnique({
        where: { id: boardReview.id },
        include: {
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true,
              requestedAmount: true
            }
          }
        }
      });

      return boardReviewWithRelations;
    } catch (error: any) {
      throw new Error(`Failed to create board review: ${error.message}`);
    }
  }

  /**
   * Get board review by application ID
   */
  static async getBoardReviewByApplicationId(applicationId: string): Promise<BoardReviewWithRelations | null> {
    try {
      const boardReview = await prisma.boardReview.findUnique({
        where: { applicationId },
        include: {
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true,
              requestedAmount: true
            }
          }
        }
      });

      return boardReview;
    } catch (error: any) {
      throw new Error(`Failed to get board review: ${error.message}`);
    }
  }

  /**
   * Update board review
   */
  static async updateBoardReview(applicationId: string, params: UpdateBoardReviewRequest): Promise<BoardReviewWithRelations> {
    try {
      const boardReview = await prisma.boardReview.findUnique({
        where: { applicationId }
      });

      if (!boardReview) {
        throw new Error("Board review not found");
      }

      if (boardReview.status === "COMPLETED") {
        throw new Error("Cannot update completed board review");
      }

      // Validate that only one decision option is selected if being updated
      if (params.investmentApproved !== undefined || params.investmentRejected !== undefined || params.conditionalApproval !== undefined) {
        const decisionOptions = [
          params.investmentApproved ?? boardReview.investmentApproved,
          params.investmentRejected ?? boardReview.investmentRejected,
          params.conditionalApproval ?? boardReview.conditionalApproval
        ];

        const selectedOptions = decisionOptions.filter(option => option);
        if (selectedOptions.length !== 1) {
          throw new Error("Exactly one decision option must be selected: Investment Approved, Investment Rejected, or Conditional Approval");
        }
      }

             // Update the board review
       const updatedBoardReview = await prisma.boardReview.update({
         where: { applicationId },
         data: {
           investmentApproved: params.investmentApproved,
           investmentRejected: params.investmentRejected,
           conditionalApproval: params.conditionalApproval,
           recommendationReport: params.recommendationReport,
           additionalInformation: params.additionalInformation,
           decisionReason: params.decisionReason,
           conditions: params.conditions,
           nextSteps: params.nextSteps,
           overallScore: params.overallScore,
           finalComments: params.finalComments,
           updatedAt: new Date()
         },
        include: {
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true,
              requestedAmount: true
            }
          }
        }
      });

      return updatedBoardReview;
    } catch (error: any) {
      throw new Error(`Failed to update board review: ${error.message}`);
    }
  }

  /**
   * Complete board review and update application stage
   */
  static async completeBoardReview(applicationId: string): Promise<BoardReviewWithRelations> {
    try {
      const boardReview = await prisma.boardReview.findUnique({
        where: { applicationId },
        include: {
          application: true
        }
      });

      if (!boardReview) {
        throw new Error("Board review not found");
      }

      if (boardReview.status === "COMPLETED") {
        throw new Error("Board review is already completed");
      }

      // Determine the board decision and next application stage
      let boardDecision: string;
      if (boardReview.investmentApproved) {
        boardDecision = "BOARD_APPROVED";
      } else if (boardReview.investmentRejected) {
        boardDecision = "BOARD_REJECTED";
      } else if (boardReview.conditionalApproval) {
        boardDecision = "BOARD_CONDITIONAL";
      } else {
        throw new Error("No decision option selected");
      }

      // Set next stage to BOARD_APPROVED for all approved decisions
      let nextStage: string;
      if (boardReview.investmentApproved || boardReview.conditionalApproval) {
        nextStage = "BOARD_APPROVED";
      } else {
        nextStage = boardDecision; // Keep as BOARD_REJECTED for rejected applications
      }

      // Update board review status
      const updatedBoardReview = await prisma.boardReview.update({
        where: { applicationId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          updatedAt: new Date()
        },
        include: {
          reviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true,
              requestedAmount: true
            }
          }
        }
      });

      // Update application stage
      const updatedApplication = await prisma.application.update({
        where: { id: applicationId },
        data: {
          currentStage: nextStage,
          boardDecision: boardDecision,
          updatedAt: new Date()
        }
      });

      console.log(`Application ${applicationId} stage updated from ${boardReview.application.currentStage} to ${nextStage}`);

      // If moving to BOARD_APPROVED stage, create user account and portfolio company
      if (nextStage === 'BOARD_APPROVED') {
        await BoardReviewService.createUserAndPortfolioCompany(boardReview.application);
      }

      // Create notification for the applicant
      await prisma.applicationNotification.create({
        data: {
          applicationId,
          recipientEmail: boardReview.application.applicantEmail,
          recipientPhone: boardReview.application.applicantPhone,
          notificationType: "BOARD_DECISION",
          title: `Board Decision: ${boardDecision}`,
          message: `The board has made a decision on your application. Decision: ${boardDecision}. ${boardReview.decisionReason || ''} ${nextStage === 'BOARD_APPROVED' ? 'Your application has been approved! An account has been created for you to access the term sheet when it becomes available.' : ''}`
        }
      });

      return updatedBoardReview;
    } catch (error: any) {
      throw new Error(`Failed to complete board review: ${error.message}`);
    }
  }

  /**
   * Get all board reviews (for admin/fund manager access)
   */
  static async getAllBoardReviews(
    page: number = 1,
    limit: number = 10,
    status?: string
  ): Promise<{ boardReviews: BoardReviewWithRelations[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const where: any = {};
      if (status) where.status = status;

      const [boardReviews, total] = await Promise.all([
        prisma.boardReview.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            reviewer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            application: {
              select: {
                id: true,
                businessName: true,
                applicantName: true,
                applicantEmail: true,
                currentStage: true,
                requestedAmount: true
              }
            }
          }
        }),
        prisma.boardReview.count({ where })
      ]);

      return {
        boardReviews,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error: any) {
      throw new Error(`Failed to get board reviews: ${error.message}`);
    }
  }

  /**
   * Get board reviews by reviewer ID
   */
  static async getBoardReviewsByReviewer(
    reviewerId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ boardReviews: BoardReviewWithRelations[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;

      const [boardReviews, total] = await Promise.all([
        prisma.boardReview.findMany({
          where: { reviewerId },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            reviewer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            application: {
              select: {
                id: true,
                businessName: true,
                applicantName: true,
                applicantEmail: true,
                currentStage: true,
                requestedAmount: true
              }
            }
          }
        }),
        prisma.boardReview.count({ where: { reviewerId } })
      ]);

      return {
        boardReviews,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error: any) {
      throw new Error(`Failed to get board reviews by reviewer: ${error.message}`);
    }
  }

  /**
   * Create user account and portfolio company from application data
   */
  static async createUserAndPortfolioCompany(application: any): Promise<void> {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: application.applicantEmail }
      });

      if (existingUser) {
        console.log(`User with email ${application.applicantEmail} already exists, skipping user creation`);
        return;
      }

      // Generate a secure temporary password
      const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
      
      // Hash password
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

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
              "applications": ["read", "write"],
              "term_sheets": ["read", "write"]
            }
          }
        });
      }

      // Create user account
      const user = await prisma.user.create({
        data: {
          firstName: application.applicantName.split(' ')[0] || application.applicantName,
          lastName: application.applicantName.split(' ').slice(1).join(' ') || '',
          email: application.applicantEmail,
          password: hashedPassword,
          roleId: applicantRole.id
        }
      });

      // Create portfolio company
      const portfolioCompany = await prisma.portfolioCompany.create({
        data: {
          userId: user.id,
          name: application.businessName,
          registrationNumber: `REG-${Date.now()}`, // Generate a temporary registration number
          industry: application.industry,
          foundingDate: application.foundingDate || new Date(),
          address: application.applicantAddress,
          website: null,
          description: application.businessDescription,
          logoUrl: null,
          status: "PENDING",
          companySize: application.businessStage === 'STARTUP' ? 'SMALL' : 
                      application.businessStage === 'OPERATIONAL' ? 'MEDIUM' : 'SMALL',
          employeeCount: null,
          annualRevenue: null,
          fundingStage: "SEED",
          contactPerson: application.applicantName,
          contactPhone: application.applicantPhone,
          contactEmail: application.applicantEmail,
          socialMedia: {}
        }
      });

      console.log(`Created user account and portfolio company for application ${application.id}`);
      console.log(`User ID: ${user.id}, Portfolio Company ID: ${portfolioCompany.id}`);
      console.log(`Temporary password: ${tempPassword}`);

      // Send investment approved and account created email
      try {
        const { EmailNotificationService } = await import('../services/EmailNotificationService');
        await EmailNotificationService.sendInvestmentApprovedAccountCreatedEmail({
          applicantName: application.applicantName,
          applicantEmail: application.applicantEmail,
          businessName: application.businessName,
          applicationId: application.id,
          currentStage: 'BOARD_APPROVED',
          tempPassword: tempPassword
        });
        console.log("Investment approved account created email sent successfully", {
          applicationId: application.id,
          applicantEmail: application.applicantEmail
        });
      } catch (emailError) {
        console.error("Failed to send investment approved account created email", {
          applicationId: application.id,
          error: emailError.message
        });
        // Don't fail the account creation if email fails
      }

      // Create notification about account creation
      await prisma.applicationNotification.create({
        data: {
          applicationId: application.id,
          recipientEmail: application.applicantEmail,
          recipientPhone: application.applicantPhone,
          notificationType: "ACCOUNT_CREATED",
          title: "Account Created",
          message: `Your account has been created successfully. You can now log in to view and sign the term sheet. Your password is: ${tempPassword}. Please change your password after logging in.`
        }
      });

    } catch (error: any) {
      console.error(`Failed to create user and portfolio company: ${error.message}`);
      throw new Error(`Failed to create user and portfolio company: ${error.message}`);
    }
  }
}
