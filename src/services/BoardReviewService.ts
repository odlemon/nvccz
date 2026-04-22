//@ts-nocheck
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

import { prisma } from '../utils/database';
import { UserService } from './UserService';
import { EmailNotificationService } from './EmailNotificationService';
import { FirebaseStorageService } from './FirebaseStorageService';

const BOARD_VOTING_ROLE_CODES = ["BOARD_CHAIR", "BOARD_MEMBER", "INV_COMM_MEM", "CIO"];

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
  boardStatus: string;
  /** False until vote invites are sent (immediate create notify) or CIO Call to Vote (deferred flow). */
  votingOpen: boolean;
  /** True when this user may POST a vote (open, in progress, and they have not voted). */
  canVote: boolean;
  approvePower: number | null;
  rejectPower: number | null;
  remainingPower: number | null;
  totalConfiguredPower: number | null;
  totalCastPower: number | null;
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

/** Create board review + first IM upload — only IDs and file; narrative/decision fields use `PUT` after. */
export interface CreateBoardReviewRequest {
  applicationId: string;
  reviewerId: string;
  /** Final IM file — required (multipart field `document`). */
  memorandumFile: { buffer: Buffer; originalname: string };
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
  imDocumentUrl?: string | null;
  imDocumentFileName?: string | null;
  imStatus?: string;
  voteInviteSentAt?: Date | null;
  requiresExplicitVoteOpen?: boolean;
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
    dealReference?: string | null;
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

    const strictBoard = process.env.NVCCZ_STRICT_BOARD_VOTE === "true";
    const members = await UserService.getBoardVotingMembers();
    const memberIndex = new Map(members.map(member => [member.id, member]));

    const rawVotes = await votesPromise;
    const votes = Array.isArray(rawVotes)
      ? rawVotes.map((vote: any) => {
          const member = memberIndex.get(vote.userId);
          const firstName = member?.firstName ?? vote.user?.firstName ?? vote.firstName ?? '';
          const lastName = member?.lastName ?? vote.user?.lastName ?? vote.lastName ?? '';
          return {
            id: vote.id,
            userId: vote.userId,
            userName: `${firstName} ${lastName}`.trim(),
            vote: vote.vote as BoardVoteChoice,
            comment: vote.comment ?? null,
            votingPower: Number(vote.votingPower),
            createdAt: vote.createdAt,
            updatedAt: vote.updatedAt,
            roleCode: member?.roleCode ?? vote.user?.roleCode ?? vote.roleCode ?? null
          };
        })
      : [];

    const totalConfiguredPower = members.reduce((sum, member) => {
      const raw = member.votingPower != null ? Number(member.votingPower) : 0;
      const power = raw > 0 ? raw : strictBoard ? 0 : 1;
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
    if (normalizedVote === "APPROVE") {
      const trimmed = String(comment ?? "").trim();
      if (!trimmed) {
        throw new Error("Comment is required when voting to approve");
      }
    }

    const boardReview = await prisma.boardReview.findUnique({
      where: { applicationId },
      select: {
        id: true,
        status: true,
        requiresExplicitVoteOpen: true,
        voteInviteSentAt: true
      }
    });

    if (!boardReview) {
      throw new Error("Board review not found");
    }

    if (boardReview.status !== "IN_PROGRESS") {
      throw new Error("Voting is closed for this board review");
    }

    if (
      boardReview.requiresExplicitVoteOpen &&
      !boardReview.voteInviteSentAt
    ) {
      throw new Error(
        "Voting is not open yet. Upload the final Investment Memorandum, then trigger Call to Vote."
      );
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

    const strictBoard = process.env.NVCCZ_STRICT_BOARD_VOTE === "true";
    if (
      strictBoard &&
      (voter.userDepartment !== "Investments" || !this.isBoardVotingRole(voter.roleCode))
    ) {
      throw new Error("You are not authorized to vote on this board review");
    }

    let effectiveVotingPower = voter.votingPower != null ? Number(voter.votingPower) : 0;
    if (!effectiveVotingPower || effectiveVotingPower <= 0) {
      if (strictBoard) {
        throw new Error("Voting power is not configured for this user. Please contact an administrator.");
      }
      effectiveVotingPower = 1;
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
          votingPower: effectiveVotingPower
        }
      });
    } else {
      const id = randomUUID();
      await prisma.$executeRaw`
        INSERT INTO board_review_votes (id, boardReviewId, userId, vote, comment, votingPower, createdAt, updatedAt)
        VALUES (${id}, ${boardReview.id}, ${voterId}, ${normalizedVote}, ${comment ?? null}, ${effectiveVotingPower}, NOW(), NOW())
      `;
    }

    let summary = await this.calculateVoteSummary(boardReview.id);
    const quorumYes = Number(process.env.BOARD_VOTE_QUORUM_YES_COUNT || 3);
    if (
      quorumYes > 0 &&
      summary.boardReview.status === "IN_PROGRESS" &&
      summary.majorityDecision === "APPROVE"
    ) {
      const yesCount = summary.votes.filter((v) => v.vote === "APPROVE").length;
      if (yesCount >= quorumYes) {
        await this.completeBoardReview(applicationId, { allowQuorumEarlyApproval: true }).catch(
          (e: any) => {
            console.error("Board auto-finalize after quorum failed", e?.message || e);
          }
        );
        summary = await this.calculateVoteSummary(boardReview.id);
      }
    }
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
            status: "IN_PROGRESS",
            requiresExplicitVoteOpen: false,
            voteInviteSentAt: null
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

  private static isVotingOpenForBoardReview(boardReview: {
    requiresExplicitVoteOpen?: boolean | null;
    voteInviteSentAt?: Date | null;
  }): boolean {
    const requiresOpen = Boolean(boardReview.requiresExplicitVoteOpen);
    if (!requiresOpen) {
      return true;
    }
    return boardReview.voteInviteSentAt != null;
  }

  private static buildPublicVoteSummary(
    summary: InternalBoardVoteSummary,
    requestingUserId?: string | null
  ): PublicBoardVoteSummary {
    const boardStatus = summary.boardReview.status;
    const votesVisible = boardStatus === "COMPLETED";
    const votingOpen = BoardReviewService.isVotingOpenForBoardReview(summary.boardReview as any);
    const userVoteRow = requestingUserId
      ? summary.votes.find((vote) => vote.userId === requestingUserId) ?? null
      : null;
    const userVotePayload = userVoteRow
      ? {
          vote: userVoteRow.vote,
          comment: userVoteRow.comment,
          votingPower: userVoteRow.votingPower,
          createdAt: userVoteRow.createdAt
        }
      : null;
    const canVote =
      boardStatus === "IN_PROGRESS" && votingOpen && !userVoteRow;

    if (!votesVisible) {
      return {
        boardStatus,
        votingOpen,
        canVote,
        approvePower: null,
        rejectPower: null,
        remainingPower: null,
        totalConfiguredPower: null,
        totalCastPower: null,
        majorityDecision: null,
        isVotingComplete: summary.isVotingComplete,
        votesVisible: false,
        votes: [],
        userVote: userVotePayload
      };
    }

    const visibleVotes = summary.votes;

    return {
      boardStatus,
      votingOpen,
      canVote: false,
      approvePower: summary.approvePower,
      rejectPower: summary.rejectPower,
      remainingPower: summary.remainingPower,
      totalConfiguredPower: summary.totalConfiguredPower,
      totalCastPower: summary.totalCastPower,
      majorityDecision: summary.majorityDecision,
      isVotingComplete: summary.isVotingComplete,
      votesVisible: true,
      votes: visibleVotes.map((vote) => ({
        id: vote.id,
        userId: vote.userId,
        userName: vote.userName,
        vote: vote.vote,
        comment: vote.comment,
        votingPower: vote.votingPower,
        createdAt: vote.createdAt
      })),
      userVote: userVotePayload
    };
  }

  private static async autoCompleteBoardReview(
    boardReviewId: string,
    applicationId: string,
    summary: InternalBoardVoteSummary
  ) {
    const updatedReview = await prisma.boardReview.update({
      where: { id: boardReviewId },
      data: {
        status: "COMPLETED",
        completedAt: new Date()
      },
      include: {
        application: {
          select: {
            id: true,
            businessName: true,
            applicantName: true,
            applicantEmail: true
          }
        }
      }
    });

    summary.boardReview.status = updatedReview.status;

    const boardMembers = await UserService.getBoardVotingMembers();
    const votePayload = summary.votes.map(vote => ({
      voterName: vote.userName,
      vote: vote.vote,
      comment: vote.comment,
      votingPower: vote.votingPower
    }));

    void Promise.all(
      boardMembers.map((member) =>
        EmailNotificationService.sendBoardVoteResultsEmail({
          recipientName: `${member.firstName} ${member.lastName}`.trim(),
          recipientEmail: member.email,
          businessName: updatedReview.application.businessName,
          applicationId: updatedReview.application.id,
          approvePower: summary.approvePower,
          rejectPower: summary.rejectPower,
          majorityDecision: summary.majorityDecision ?? "TIE",
          votes: votePayload
        }).catch((error) => {
          console.error("Error sending board vote results email", error);
        })
      )
    );
  }

  /**
   * Create board review in one step: persist row, upload final IM, set READY_FOR_VOTE, open voting, email IC members.
   */
  static async createBoardReview(params: CreateBoardReviewRequest): Promise<BoardReviewWithRelations> {
    try {
      if (!params.memorandumFile?.buffer?.length) {
        throw new Error("Investment memorandum file is required (multipart field `document`)");
      }

      const application = await prisma.application.findUnique({
        where: { id: params.applicationId }
      });

      if (!application) {
        throw new Error("Application not found");
      }

      if (application.currentStage !== "UNDER_BOARD_REVIEW") {
        throw new Error(
          "Application must be in UNDER_BOARD_REVIEW stage to create board review. Current stage: " +
            application.currentStage
        );
      }

      const existingReview = await prisma.boardReview.findUnique({
        where: { applicationId: params.applicationId }
      });

      if (existingReview) {
        throw new Error(
          "A board review already exists for this application. Only one board review is allowed per application."
        );
      }

      const reviewInclude = {
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
            requestedAmount: true,
            dealReference: true
          }
        }
      };

      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.boardReview.create({
          data: {
            applicationId: params.applicationId,
            reviewerId: params.reviewerId,
            investmentApproved: false,
            investmentRejected: false,
            conditionalApproval: false,
            status: "IN_PROGRESS",
            requiresExplicitVoteOpen: true,
            voteInviteSentAt: null
          },
          include: reviewInclude
        });

        await tx.application.update({
          where: { id: params.applicationId },
          data: {
            updatedAt: new Date()
          }
        });

        return row;
      });

      let downloadURL: string;
      try {
        const up = await FirebaseStorageService.uploadBoardReviewInvestmentMemorandum(
          params.memorandumFile.buffer,
          params.applicationId,
          created.id,
          params.memorandumFile.originalname
        );
        downloadURL = up.downloadURL;
      } catch (uploadErr: any) {
        await prisma.boardReview.delete({ where: { id: created.id } }).catch(() => {});
        throw new Error(
          `Failed to upload investment memorandum: ${uploadErr?.message || uploadErr}`
        );
      }

      const boardReviewWithRelations = await prisma.$transaction(async (tx) => {
        const updated = await tx.boardReview.update({
          where: { id: created.id },
          data: {
            imDocumentUrl: downloadURL,
            imDocumentFileName: params.memorandumFile.originalname,
            imStatus: "READY_FOR_VOTE",
            voteInviteSentAt: new Date(),
            requiresExplicitVoteOpen: false,
            updatedAt: new Date()
          },
          include: reviewInclude
        });

        await tx.auditLog.create({
          data: {
            userId: params.reviewerId,
            action: "BOARD_IM_UPLOADED",
            entityType: "BoardReview",
            entityId: created.id,
            newValues: {
              applicationId: params.applicationId,
              fileName: params.memorandumFile.originalname,
              source: "create_board_review"
            }
          }
        });

        await tx.auditLog.create({
          data: {
            userId: params.reviewerId,
            action: "BOARD_CALL_TO_VOTE",
            entityType: "BoardReview",
            entityId: created.id,
            newValues: { applicationId: params.applicationId, imStatus: "READY_FOR_VOTE", source: "create_board_review" }
          }
        });

        return updated;
      });

      const snapshot = boardReviewWithRelations;
      const voteUrl = BoardReviewService.boardVoteListingsUrl();
      void UserService.getBoardVotingMembers()
        .then((boardMembers) => {
          return Promise.all(
            boardMembers.map((member) =>
              EmailNotificationService.sendBoardVoteRequestEmail({
                recipientName: `${member.firstName} ${member.lastName}`.trim(),
                recipientEmail: member.email,
                businessName: snapshot?.application?.businessName || "Application",
                dealReference: snapshot?.application?.dealReference ?? null,
                voteUrl
              }).catch((err) =>
                console.error("Board vote request email failed", member.email, err?.message || err)
              )
            )
          );
        })
        .catch((notificationError) => {
          console.error("Failed to load board members or send vote request emails:", notificationError);
        });

      return boardReviewWithRelations as BoardReviewWithRelations;
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

  private static async assertCanViewInvestmentMemorandum(actorUserId: string): Promise<void> {
    const strictBoard = process.env.NVCCZ_STRICT_BOARD_VOTE === "true";
    if (!strictBoard) {
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: actorUserId },
      include: { role: true }
    });
    if (!user) {
      throw new Error("User not found");
    }
    const roleName = (user.role?.name || "").toLowerCase().replace(/\s+/g, "_");
    if (roleName === "admin" || roleName === "fund_manager") {
      return;
    }
    if (user.userDepartment === "Investments" && BoardReviewService.isBoardVotingRole(user.roleCode)) {
      return;
    }
    throw new Error("Not authorized to access the Investment Memorandum.");
  }

  /** Frontend URL for board members to open the applications list (vote CTA in emails). */
  private static boardVoteListingsUrl(): string {
    const base = (process.env.FRONTEND_URL || "http://app.kyntaro.com").replace(/\/$/, "");
    return `${base}/portfolio/applications`;
  }

  private static async writeInvestmentMemorandumToReview(
    br: { id: string },
    applicationId: string,
    file: { buffer: Buffer; originalname: string },
    actorUserId: string
  ): Promise<BoardReviewWithRelations> {
    const { downloadURL } = await FirebaseStorageService.uploadBoardReviewInvestmentMemorandum(
      file.buffer,
      applicationId,
      br.id,
      file.originalname
    );

    const updated = await prisma.boardReview.update({
      where: { applicationId },
      data: {
        imDocumentUrl: downloadURL,
        imDocumentFileName: file.originalname,
        updatedAt: new Date()
      },
      include: {
        reviewer: {
          select: { id: true, firstName: true, lastName: true, email: true }
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

    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        action: "BOARD_IM_UPLOADED",
        entityType: "BoardReview",
        entityId: br.id,
        newValues: { applicationId, fileName: file.originalname }
      }
    });

    return updated as BoardReviewWithRelations;
  }

  /**
   * IM upload + call to vote. **No narrative/decision fields** — use `updateBoardReview` (PUT) after the IM is stored.
   * Optional `resendNotifications` to re-email IC when repeating call-to-vote.
   */
  static async uploadInvestmentMemorandumAndCallToVote(
    applicationId: string,
    file: { buffer: Buffer; originalname: string },
    actorUserId: string,
    options: { resendNotifications?: boolean } = {}
  ): Promise<{ boardReview: BoardReviewWithRelations; createdNew: boolean }> {
    const { resendNotifications } = options;
    const existingBr = await prisma.boardReview.findUnique({ where: { applicationId } });

    if (!existingBr) {
      const boardReview = await BoardReviewService.createBoardReview({
        applicationId,
        reviewerId: actorUserId,
        memorandumFile: file
      });
      return { boardReview, createdNew: true };
    }

    if (existingBr.status !== "IN_PROGRESS") {
      throw new Error("Cannot upload IM — board review is not in progress");
    }

    await BoardReviewService.writeInvestmentMemorandumToReview(
      existingBr,
      applicationId,
      file,
      actorUserId
    );

    const boardReview = await BoardReviewService.callToVote(applicationId, actorUserId, {
      resendNotifications
    });

    return { boardReview, createdNew: false };
  }

  /**
   * Step 3.1 — CIO uploads final IM only (no Call to Vote). Prefer
   * {@link uploadInvestmentMemorandumAndCallToVote} for the normal one-step flow.
   */
  static async uploadInvestmentMemorandum(
    applicationId: string,
    file: { buffer: Buffer; originalname: string },
    actorUserId: string
  ): Promise<BoardReviewWithRelations> {
    const br = await prisma.boardReview.findUnique({ where: { applicationId } });
    if (!br) {
      throw new Error("Board review not found for this application");
    }
    if (br.status !== "IN_PROGRESS") {
      throw new Error("Cannot upload IM — board review is not in progress");
    }

    return BoardReviewService.writeInvestmentMemorandumToReview(br, applicationId, file, actorUserId);
  }

  /**
   * Step 3.1 — Open voting: set IM to Ready for Vote, email IC members, audit.
   * Requires final IM URL. Idempotent unless `resendNotifications` is true.
   */
  static async callToVote(
    applicationId: string,
    actorUserId: string,
    options?: { resendNotifications?: boolean }
  ): Promise<BoardReviewWithRelations> {
    const br = await prisma.boardReview.findUnique({
      where: { applicationId },
      include: {
        application: {
          select: {
            id: true,
            businessName: true,
            applicantName: true,
            applicantEmail: true,
            currentStage: true,
            requestedAmount: true,
            dealReference: true
          }
        }
      }
    });

    if (!br) {
      throw new Error("Board review not found for this application");
    }
    if (br.status !== "IN_PROGRESS") {
      throw new Error("Call to Vote is only available while the board review is in progress");
    }
    if (!String(br.imDocumentUrl || "").trim()) {
      throw new Error("Upload the final Investment Memorandum before Call to Vote.");
    }

    const resend = Boolean(options?.resendNotifications);
    if (br.imStatus === "READY_FOR_VOTE" && !resend) {
      const existing = await prisma.boardReview.findUnique({
        where: { applicationId },
        include: {
          reviewer: {
            select: { id: true, firstName: true, lastName: true, email: true }
          },
          application: {
            select: {
              id: true,
              businessName: true,
              applicantName: true,
              applicantEmail: true,
              currentStage: true,
              requestedAmount: true,
              dealReference: true
            }
          }
        }
      });
      return existing as BoardReviewWithRelations;
    }

    const shouldSendEmails = resend || !br.voteInviteSentAt;

    const updated = await prisma.boardReview.update({
      where: { applicationId },
      data: {
        imStatus: "READY_FOR_VOTE",
        voteInviteSentAt: br.voteInviteSentAt || new Date(),
        requiresExplicitVoteOpen: false,
        updatedAt: new Date()
      },
      include: {
        reviewer: {
          select: { id: true, firstName: true, lastName: true, email: true }
        },
        application: {
          select: {
            id: true,
            businessName: true,
            applicantName: true,
            applicantEmail: true,
            currentStage: true,
            requestedAmount: true,
            dealReference: true
          }
        }
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        action: "BOARD_CALL_TO_VOTE",
        entityType: "BoardReview",
        entityId: br.id,
        newValues: { applicationId, imStatus: "READY_FOR_VOTE" }
      }
    });

    if (shouldSendEmails) {
      const invitePayload = {
        businessName: updated.application?.businessName || "Application",
        dealReference: updated.application?.dealReference ?? null
      };
      const voteUrl = BoardReviewService.boardVoteListingsUrl();
      void UserService.getBoardVotingMembers()
        .then((boardMembers) => {
          return Promise.all(
            boardMembers.map((member) =>
              EmailNotificationService.sendBoardVoteRequestEmail({
                recipientName: `${member.firstName} ${member.lastName}`.trim(),
                recipientEmail: member.email,
                businessName: invitePayload.businessName,
                dealReference: invitePayload.dealReference,
                voteUrl
              }).catch((err) =>
                console.error("Call-to-vote email failed", member.email, err?.message || err)
              )
            )
          );
        })
        .catch((notificationError) => {
          console.error("Failed to send board vote request emails (call to vote):", notificationError);
        });
    }

    return updated as BoardReviewWithRelations;
  }

  /**
   * Audit-logged access to IM URL (for IC / fund office).
   */
  static async getInvestmentMemorandumAccess(
    applicationId: string,
    actorUserId: string
  ): Promise<{
    applicationId: string;
    imDocumentUrl: string | null;
    imDocumentFileName: string | null;
    imStatus: string;
    businessName: string | null;
  }> {
    await BoardReviewService.assertCanViewInvestmentMemorandum(actorUserId);

    const br = await prisma.boardReview.findUnique({
      where: { applicationId },
      include: {
        application: { select: { businessName: true } }
      }
    });
    if (!br) {
      throw new Error("Board review not found for this application");
    }

    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        action: "BOARD_IM_VIEWED",
        entityType: "BoardReview",
        entityId: br.id,
        newValues: { applicationId }
      }
    });

    return {
      applicationId,
      imDocumentUrl: br.imDocumentUrl ?? null,
      imDocumentFileName: br.imDocumentFileName ?? null,
      imStatus: br.imStatus || "NONE",
      businessName: br.application?.businessName ?? null
    };
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

      // Validate that voting is complete before allowing updates
      const voteSummary = await this.calculateVoteSummary(boardReview.id);
      if (!voteSummary.isVotingComplete) {
        throw new Error("Cannot update board review. Voting process must be completed before making updates. All board members must submit their votes first.");
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
  static async completeBoardReview(
    applicationId: string,
    options?: { allowQuorumEarlyApproval?: boolean }
  ): Promise<BoardReviewWithRelations> {
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
      const strictBoard = process.env.NVCCZ_STRICT_BOARD_VOTE === "true";
      const votingCompleteEnough =
        voteSummary.isVotingComplete ||
        (!strictBoard &&
          voteSummary.majorityDecision &&
          voteSummary.majorityDecision !== "TIE");

      if (options?.allowQuorumEarlyApproval) {
        if (voteSummary.majorityDecision !== "APPROVE") {
          throw new Error("Quorum early approval requires an APPROVE majority.");
        }
      } else if (!votingCompleteEnough) {
        throw new Error(
          "Voting is not complete. All board members must submit their votes before finalizing."
        );
      }

      if (!voteSummary.majorityDecision || voteSummary.majorityDecision === "TIE") {
        throw new Error("Voting did not produce a clear majority. Please resolve tie votes before finalizing.");
      }

      const investmentApproved = voteSummary.majorityDecision === "APPROVE";
      const investmentRejected = voteSummary.majorityDecision === "REJECT";
      const conditionalApproval = false;

      const boardDecision = investmentApproved ? "BOARD_APPROVED" : "BOARD_REJECTED";
      // New workflow: board review comes after term sheet, so approved applications go directly to INVESTMENT_IMPLEMENTATION
      // User and portfolio company were already created during due diligence completion
      const nextStage = investmentApproved ? "INVESTMENT_IMPLEMENTATION" : "REJECTED";

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

      // Note: User and portfolio company are NOT created here anymore
      // They are created during due diligence completion (new workflow)

      // Create notification for the applicant
      const notificationMessage = nextStage === 'INVESTMENT_IMPLEMENTATION'
        ? `The board has made a decision on your application. Decision: ${boardDecision}. ${boardReview.decisionReason || ''} Your application has been approved! The investment implementation process will now begin.`
        : `The board has made a decision on your application. Decision: ${boardDecision}. ${boardReview.decisionReason || ''}`;

      await prisma.applicationNotification.create({
        data: {
          applicationId,
          recipientEmail: boardReview.application.applicantEmail,
          recipientPhone: boardReview.application.applicantPhone,
          notificationType: "BOARD_DECISION",
          title: `Board Decision: ${boardDecision}`,
          message: notificationMessage
        }
      });

      const applicant = updatedBoardReview.application;
      if (investmentApproved) {
        void EmailNotificationService.sendInvestmentDecisionEmail({
          applicantName: applicant.applicantName,
          applicantEmail: applicant.applicantEmail,
          businessName: applicant.businessName,
          applicationId: applicationId,
          currentStage: "BOARD_APPROVED"
        })
          .then(() =>
            console.log("Board approval email sent successfully", {
              applicationId: applicationId,
              applicantEmail: applicant.applicantEmail
            })
          )
          .catch((emailError: any) =>
            console.error("Failed to send board decision email to applicant", {
              applicationId,
              error: emailError?.message
            })
          );
      } else {
        void EmailNotificationService.sendApplicationRejectedEmail({
          applicantName: applicant.applicantName,
          applicantEmail: applicant.applicantEmail,
          businessName: applicant.businessName,
          applicationId: applicationId,
          currentStage: "BOARD_REJECTED"
        })
          .then(() =>
            console.log("Board rejection email sent successfully", {
              applicationId: applicationId,
              applicantEmail: applicant.applicantEmail
            })
          )
          .catch((emailError: any) =>
            console.error("Failed to send board decision email to applicant", {
              applicationId,
              error: emailError?.message
            })
          );
      }

      const votesForEmail = voteSummary.votes.map((vote) => ({
        voterName: vote.userName,
        vote: vote.vote,
        comment: vote.comment,
        votingPower: vote.votingPower
      }));
      void UserService.getBoardVotingMembers()
        .then((boardMembers) =>
          Promise.all(
            boardMembers.map((member) =>
              EmailNotificationService.sendBoardVoteResultsEmail({
                recipientName: `${member.firstName} ${member.lastName}`.trim(),
                recipientEmail: member.email,
                businessName: applicant.businessName,
                applicationId,
                approvePower: voteSummary.approvePower,
                rejectPower: voteSummary.rejectPower,
                majorityDecision: voteSummary.majorityDecision,
                votes: votesForEmail
              }).catch((err) =>
                console.error("Board vote results email failed", member.email, err?.message || err)
              )
            )
          )
        )
        .catch((notificationError) => {
          console.error("Failed to send board vote results emails:", notificationError);
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
          status: "APPROVED",
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
            currentStage: 'TERM_SHEET',
            tempPassword: tempPassword
          });
          console.log("Applicant portal credentials email sent successfully", {
            applicationId: application.id,
            applicantEmail: application.applicantEmail
          });
        } catch (emailError) {
          console.error("Failed to send applicant portal credentials email", {
            applicationId: application.id,
            error: emailError.message
          });
          // Don't fail the account creation if email fails
        }

        // Create notification about account creation (credentials are emailed only)
        await prisma.applicationNotification.create({
          data: {
            applicationId: application.id,
            recipientEmail: application.applicantEmail,
            recipientPhone: application.applicantPhone,
            notificationType: "ACCOUNT_CREATED",
            title: "Account Created",
            message:
              "Your portal account has been created. Check your email for your login email and temporary password, then sign in to continue with your term sheet."
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
