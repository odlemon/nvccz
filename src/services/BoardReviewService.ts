//@ts-nocheck
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

import { prisma } from '../utils/database';
import { UserService } from './UserService';
import { EmailNotificationService } from './EmailNotificationService';

const BOARD_VOTING_ROLE_CODES = ["BOARD_CHAIR", "BOARD_MEMBER"];

type BoardVoteChoice = "APPROVE" | "REJECT";

interface InternalBoardVoteSummary {
  boardReview: any;
  votes: Array<{
    id: string;
    userId: string;
    userName: string;
    vote: BoardVoteChoice;
    comment?: string | null;
    votingPower: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  approvePower: number;
  rejectPower: number;
  totalConfiguredPower: number;
  totalCastPower: number;
  remainingPower: number;
  majorityDecision: BoardVoteChoice | "TIE" | null;
  isVotingComplete: boolean;
}

interface PublicBoardVoteSummary {
  approvePower: number;
  rejectPower: number;
  remainingPower: number;
  totalConfiguredPower: number;
  totalCastPower: number;
  majorityDecision: BoardVoteChoice | "TIE" | null;
  isVotingComplete: boolean;
  votesVisible: boolean;
  votes: Array<{
    id: string;
    userId: string;
    userName: string;
    vote: BoardVoteChoice;
    comment?: string | null;
    votingPower: number;
    createdAt: Date;
  }>;
  userVote?: {
    vote: BoardVoteChoice;
    comment?: string | null;
    votingPower: number;
    createdAt: Date;
  } | null;
}

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
  private static isBoardVotingRole(roleCode?: string | null): boolean {
    return !!roleCode && BOARD_VOTING_ROLE_CODES.includes(roleCode);
  }

  private static normalizeVoteInput(vote: string): BoardVoteChoice {
    const normalized = (vote || "").toUpperCase();
    if (normalized !== "APPROVE" && normalized !== "REJECT") {
      throw new Error("Invalid vote. Vote must be either APPROVE or REJECT");
    }
    return normalized as BoardVoteChoice;
  }

  private static async calculateVoteSummary(boardReviewId: string): Promise<InternalBoardVoteSummary> {
    const boardReview = await prisma.boardReview.findUnique({
      where: { id: boardReviewId }
    });

    if (!boardReview) {
      throw new Error("Board review not found");
    }

    const boardReviewVoteDelegate = (prisma as any).boardReviewVote;

    const votesPromise = boardReviewVoteDelegate
      ? boardReviewVoteDelegate.findMany({
          where: { boardReviewId },
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                roleCode: true
              }
            }
          }
        })
      : prisma.$queryRaw`
          SELECT v.id,
                 v.userId,
                 v.vote,
                 v.comment,
                 v.votingPower,
                 v.createdAt,
                 v.updatedAt,
                 u.firstName,
                 u.lastName,
                 u.roleCode
            FROM board_review_votes v
            LEFT JOIN users u ON u.id = v.userId
           WHERE v.boardReviewId = ${boardReviewId}
           ORDER BY v.createdAt ASC
        `;

    const [rawVotes, members] = await Promise.all([
      votesPromise,
      UserService.getBoardVotingMembers()
    ]);

    const votes = Array.isArray(rawVotes)
      ? rawVotes.map((vote: any) => ({
          id: vote.id,
          userId: vote.userId,
          userName: `${vote.user?.firstName ?? vote.firstName ?? ''} ${vote.user?.lastName ?? vote.lastName ?? ''}`.trim(),
          vote: vote.vote as BoardVoteChoice,
          comment: vote.comment ?? null,
          votingPower: Number(vote.votingPower),
          createdAt: vote.createdAt,
          updatedAt: vote.updatedAt,
          roleCode: vote.user?.roleCode ?? vote.roleCode ?? null
        }))
      : [];

    const totalConfiguredPower = members.reduce((sum, member) => {
      const power = member.votingPower ? Number(member.votingPower) : 0;
      return sum + power;
    }, 0);

    let approvePower = 0;
    let rejectPower = 0;
    let totalCastPower = 0;

    votes.forEach(vote => {
      totalCastPower += vote.votingPower;
      if (vote.vote === "APPROVE") {
        approvePower += vote.votingPower;
      } else {
        rejectPower += vote.votingPower;
      }
    });

    const remainingPower = Math.max(0, totalConfiguredPower - totalCastPower);

    let majorityDecision: BoardVoteChoice | "TIE" | null = null;
    if (approvePower > rejectPower) {
      majorityDecision = "APPROVE";
    } else if (rejectPower > approvePower) {
      majorityDecision = "REJECT";
    } else if (totalCastPower > 0 && approvePower === rejectPower) {
      majorityDecision = "TIE";
    }

    const isVotingComplete = remainingPower <= 0.0001 || totalCastPower >= totalConfiguredPower;

    return {
      boardReview,
      votes,
      approvePower,
      rejectPower,
      totalConfiguredPower,
      totalCastPower,
      remainingPower,
      majorityDecision,
      isVotingComplete
    };
  }

  static async submitVote(
    applicationId: string,
    voterId: string,
    vote: string,
    comment?: string
  ): Promise<PublicBoardVoteSummary> {
    const normalizedVote = this.normalizeVoteInput(vote);

    const boardReview = await prisma.boardReview.findUnique({
      where: { applicationId },
      select: {
        id: true,
        status: true
      }
    });

    if (!boardReview) {
      throw new Error("Board review not found");
    }

    if (boardReview.status !== "IN_PROGRESS") {
      throw new Error("Voting is closed for this board review");
    }

    const voter = await prisma.user.findUnique({
      where: { id: voterId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userDepartment: true,
        roleCode: true,
        votingPower: true
      }
    });

    if (!voter) {
      throw new Error("Voter not found");
    }

    if (voter.userDepartment !== "Investments" || !this.isBoardVotingRole(voter.roleCode)) {
      throw new Error("You are not authorized to vote on this board review");
    }

    if (!voter.votingPower || Number(voter.votingPower) <= 0) {
      throw new Error("Voting power is not configured for this user. Please contact an administrator.");
    }

    const boardReviewVoteDelegate = (prisma as any).boardReviewVote;

    let existingVote = null;
    if (boardReviewVoteDelegate) {
      existingVote = await boardReviewVoteDelegate.findUnique({
        where: {
          boardReviewId_userId: {
            boardReviewId: boardReview.id,
            userId: voterId
          }
        }
      });
    } else {
      const rawExisting = await prisma.$queryRaw`
        SELECT id
          FROM board_review_votes
         WHERE boardReviewId = ${boardReview.id}
           AND userId = ${voterId}
         LIMIT 1
      `;
      existingVote = Array.isArray(rawExisting) && rawExisting.length > 0 ? rawExisting[0] : null;
    }

    if (existingVote) {
      throw new Error("You have already voted on this board review");
    }

    if (boardReviewVoteDelegate) {
      await boardReviewVoteDelegate.create({
        data: {
          boardReviewId: boardReview.id,
          userId: voterId,
          vote: normalizedVote,
          comment,
          votingPower: Number(voter.votingPower)
        }
      });
    } else {
      const id = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO board_review_votes (id, boardReviewId, userId, vote, comment, votingPower, createdAt, updatedAt)
        VALUES (${id}, ${boardReview.id}, ${voterId}, ${normalizedVote}, ${comment ?? null}, ${Number(voter.votingPower)}, NOW(), NOW())
      `;
    }

    const summary = await this.calculateVoteSummary(boardReview.id);
    return this.buildPublicVoteSummary(summary, voterId);
  }

  static async getVoteSummary(
    applicationId: string,
    requestingUserId?: string
  ): Promise<PublicBoardVoteSummary> {
    const boardReview = await prisma.boardReview.findUnique({
      where: { applicationId },
      select: {
        id: true,
        status: true
      }
    });

    if (!boardReview) {
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { currentStage: true }
      });

      if (!application) {
        throw new Error("Application not found");
      }

      if (application.currentStage === "UNDER_BOARD_REVIEW") {
        const members = await UserService.getBoardVotingMembers();
        const totalConfiguredPower = members.reduce((sum, member) => {
          const value = member.votingPower ? Number(member.votingPower) : 0;
          return sum + value;
        }, 0);

        const placeholderSummary: InternalBoardVoteSummary = {
          boardReview: {
            status: "IN_PROGRESS"
          },
          votes: [],
          approvePower: 0,
          rejectPower: 0,
          totalConfiguredPower,
          totalCastPower: 0,
          remainingPower: totalConfiguredPower,
          majorityDecision: null,
          isVotingComplete: totalConfiguredPower <= 0
        };

        return this.buildPublicVoteSummary(placeholderSummary, requestingUserId);
      }

      throw new Error("Board review not found");
    }

    const summary = await this.calculateVoteSummary(boardReview.id);
    return this.buildPublicVoteSummary(summary, requestingUserId);
  }

  private static buildPublicVoteSummary(
    summary: InternalBoardVoteSummary,
    requestingUserId?: string | null
  ): PublicBoardVoteSummary {
    const boardStatus = summary.boardReview.status;
    const votesVisible = boardStatus === "COMPLETED";

    let visibleVotes = summary.votes;
    if (!votesVisible) {
      visibleVotes = summary.votes.filter(vote => vote.userId === requestingUserId);
    }

    const userVote = summary.votes.find(vote => vote.userId === requestingUserId);

    return {
      approvePower: summary.approvePower,
      rejectPower: summary.rejectPower,
      remainingPower: summary.remainingPower,
      totalConfiguredPower: summary.totalConfiguredPower,
      totalCastPower: summary.totalCastPower,
      majorityDecision: summary.majorityDecision,
      isVotingComplete: summary.isVotingComplete,
      votesVisible,
      votes: visibleVotes.map(vote => ({
        id: vote.id,
        userId: vote.userId,
        userName: vote.userName,
        vote: vote.vote,
        comment: vote.comment,
        votingPower: vote.votingPower,
        createdAt: vote.createdAt
      })),
      userVote: userVote
        ? {
            vote: userVote.vote,
            comment: userVote.comment,
            votingPower: userVote.votingPower,
            createdAt: userVote.createdAt
          }
        : null
    };
  }

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
      if (selectedOptions.length > 1) {
        throw new Error("Only one decision option can be selected: Investment Approved, Investment Rejected, or Conditional Approval");
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

      try {
        const boardMembers = await UserService.getBoardVotingMembers();
        const voteUrlBase = process.env.FRONTEND_URL || 'https://nvccz-frontend.vercel.app';

        await Promise.all(
          boardMembers.map(member =>
            EmailNotificationService.sendBoardVoteRequestEmail({
              recipientName: `${member.firstName} ${member.lastName}`.trim(),
              recipientEmail: member.email,
              businessName: boardReviewWithRelations?.application?.businessName || 'Application',
              applicationId: boardReviewWithRelations?.applicationId || boardReview.applicationId,
              voteUrl: `${voteUrlBase}/board-review/${boardReview.applicationId}`
            })
          )
        );
      } catch (notificationError) {
        console.error("Failed to send board vote request emails:", notificationError);
      }

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

      // Handle decision flags update - ensure only one is true at a time
      let investmentApproved = boardReview.investmentApproved;
      let investmentRejected = boardReview.investmentRejected;
      let conditionalApproval = boardReview.conditionalApproval;

      // Check if any decision flags are being updated
      if (params.investmentApproved !== undefined || params.investmentRejected !== undefined || params.conditionalApproval !== undefined) {
        // If any decision flag is provided, update them
        // When setting one to true, automatically set others to false
        if (params.investmentApproved === true) {
          investmentApproved = true;
          investmentRejected = false;
          conditionalApproval = false;
        } else if (params.investmentRejected === true) {
          investmentApproved = false;
          investmentRejected = true;
          conditionalApproval = false;
        } else if (params.conditionalApproval === true) {
          investmentApproved = false;
          investmentRejected = false;
          conditionalApproval = true;
        } else {
          // If setting to false without providing another decision, keep existing values
          // Only update the specific flag that was provided
          if (params.investmentApproved !== undefined) {
            investmentApproved = Boolean(params.investmentApproved);
          }
          if (params.investmentRejected !== undefined) {
            investmentRejected = Boolean(params.investmentRejected);
          }
          if (params.conditionalApproval !== undefined) {
            conditionalApproval = Boolean(params.conditionalApproval);
          }
        }

        // Validate that exactly one decision option is selected
        const decisionOptions = [investmentApproved, investmentRejected, conditionalApproval];
        const selectedOptions = decisionOptions.filter(option => option);
        if (selectedOptions.length !== 1) {
          throw new Error("Exactly one decision option must be selected: Investment Approved, Investment Rejected, or Conditional Approval");
        }
      } else {
        // No decision flags provided in update - check if all are false and default to approved
        const allDecisionsFalse = !investmentApproved && !investmentRejected && !conditionalApproval;
        if (allDecisionsFalse) {
          console.log("No decision flags provided and all are false, defaulting to APPROVED");
          investmentApproved = true;
          investmentRejected = false;
          conditionalApproval = false;
        }
        // Otherwise keep existing values
      }

             // Update the board review
       const updatedBoardReview = await prisma.boardReview.update({
         where: { applicationId },
         data: {
           investmentApproved,
           investmentRejected,
           conditionalApproval,
           recommendationReport: params.recommendationReport !== undefined ? params.recommendationReport : boardReview.recommendationReport,
           additionalInformation: params.additionalInformation !== undefined ? params.additionalInformation : boardReview.additionalInformation,
           decisionReason: params.decisionReason !== undefined ? params.decisionReason : boardReview.decisionReason,
           conditions: params.conditions !== undefined ? params.conditions : boardReview.conditions,
           nextSteps: params.nextSteps !== undefined ? params.nextSteps : boardReview.nextSteps,
           overallScore: params.overallScore !== undefined ? params.overallScore : boardReview.overallScore,
           finalComments: params.finalComments !== undefined ? params.finalComments : boardReview.finalComments,
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

      const voteSummary = await this.calculateVoteSummary(boardReview.id);

      if (!voteSummary.isVotingComplete) {
        throw new Error("Voting is not complete. All board members must submit their votes before finalizing.");
      }

      if (!voteSummary.majorityDecision || voteSummary.majorityDecision === "TIE") {
        throw new Error("Voting did not produce a clear majority. Please resolve tie votes before finalizing.");
      }

      const investmentApproved = voteSummary.majorityDecision === "APPROVE";
      const investmentRejected = voteSummary.majorityDecision === "REJECT";
      const conditionalApproval = false;

      const boardDecision = investmentApproved ? "BOARD_APPROVED" : "BOARD_REJECTED";
      const nextStage = investmentApproved ? "BOARD_APPROVED" : "BOARD_REJECTED";

      // Update board review status
      const updatedBoardReview = await prisma.boardReview.update({
        where: { applicationId },
        data: {
          investmentApproved,
          investmentRejected,
          conditionalApproval,
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
              applicantPhone: true,
              applicantAddress: true,
              currentStage: true,
              requestedAmount: true,
              industry: true,
              foundingDate: true,
              businessDescription: true,
              businessStage: true
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
        // Fetch full application data with all required fields
        const fullApplication = await prisma.application.findUnique({
          where: { id: applicationId },
          select: {
            id: true,
            businessName: true,
            applicantName: true,
            applicantEmail: true,
            applicantPhone: true,
            applicantAddress: true,
            currentStage: true,
            requestedAmount: true,
            industry: true,
            foundingDate: true,
            businessDescription: true,
            businessStage: true
          }
        });

        if (!fullApplication) {
          throw new Error("Application not found when creating user and portfolio company");
        }

        await BoardReviewService.createUserAndPortfolioCompany(fullApplication);
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

      try {
        const boardMembers = await UserService.getBoardVotingMembers();
        const votesForEmail = voteSummary.votes.map(vote => ({
          voterName: vote.userName,
          vote: vote.vote,
          comment: vote.comment,
          votingPower: vote.votingPower
        }));

        await Promise.all(
          boardMembers.map(member =>
            EmailNotificationService.sendBoardVoteResultsEmail({
              recipientName: `${member.firstName} ${member.lastName}`.trim(),
              recipientEmail: member.email,
              businessName: updatedBoardReview.application.businessName,
              applicationId,
              approvePower: voteSummary.approvePower,
              rejectPower: voteSummary.rejectPower,
              majorityDecision: voteSummary.majorityDecision,
              votes: votesForEmail
            })
          )
        );
      } catch (notificationError) {
        console.error("Failed to send board vote results emails:", notificationError);
      }

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
      let tempPassword: string | undefined = undefined;
      let user;
      
      // Check if user already exists
      user = await prisma.user.findUnique({
        where: { email: application.applicantEmail }
      });

      // Check if portfolio company already exists for this user
      if (user) {
        console.log(`User with email ${application.applicantEmail} already exists (ID: ${user.id})`);
        const existingCompany = await prisma.portfolioCompany.findFirst({
          where: { 
            userId: user.id,
            contactEmail: application.applicantEmail
          }
        });
        
        if (existingCompany) {
          console.log(`Portfolio company already exists for user ${user.id}, skipping company creation`);
          return;
        }
        
        // User exists but no portfolio company - we'll create it below
        console.log(`User exists but no portfolio company found, creating portfolio company...`);
      } else {
        // User doesn't exist - create user first
        console.log(`Creating new user account for ${application.applicantEmail}...`);
        
        // Generate a secure temporary password
        tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
        
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
        user = await prisma.user.create({
          data: {
            firstName: application.applicantName.split(' ')[0] || application.applicantName,
            lastName: application.applicantName.split(' ').slice(1).join(' ') || '',
            email: application.applicantEmail,
            password: hashedPassword,
            roleId: applicantRole.id
          }
        });
        
        console.log(`Created user account: ${user.id}`);
        console.log(`Temporary password: ${tempPassword}`);
      }

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
      if (tempPassword) {
        console.log(`Temporary password: ${tempPassword}`);
      }

      // Send investment approved and account created email (only if user was just created)
      if (tempPassword) {
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
      } else {
        console.log(`User ${user.id} already existed, skipping email notification`);
      }

    } catch (error: any) {
      console.error(`Failed to create user and portfolio company: ${error.message}`);
      throw new Error(`Failed to create user and portfolio company: ${error.message}`);
    }
  }
}
