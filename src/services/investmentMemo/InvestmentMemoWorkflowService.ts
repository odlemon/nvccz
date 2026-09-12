// @ts-nocheck
import { prisma } from "../../utils/database";
import { InvestmentMemoApprovalHistoryService } from "./InvestmentMemoApprovalHistoryService";
import { InvestmentMemoValidationService } from "./InvestmentMemoValidationService";
import type { MemoSections } from "./investmentMemoTypes";

export class InvestmentMemoWorkflowService {
  static async submit(applicationId: string, versionId: string, actorUserId: string) {
    const memo = await prisma.investmentMemo.findUnique({ where: { applicationId } });
    if (!memo) throw Object.assign(new Error("Investment memo not found"), { statusCode: 404 });
    if (memo.workflowStatus === "LOCKED") {
      throw Object.assign(new Error("Memo is locked"), { statusCode: 409 });
    }

    const version = await prisma.investmentMemoVersion.findFirst({
      where: { id: versionId, memoId: memo.id },
    });
    if (!version) throw Object.assign(new Error("Memo version not found"), { statusCode: 404 });
    if (version.versionStatus !== "DRAFT") {
      throw Object.assign(new Error("Only draft versions can be submitted"), { statusCode: 409 });
    }

    const sections = version.sections as MemoSections;
    const validation = InvestmentMemoValidationService.validateSections(sections);
    if (!validation.passed) {
      await prisma.investmentMemoVersion.update({
        where: { id: versionId },
        data: { validationPassed: false, validationErrors: validation.errors },
      });
      throw Object.assign(new Error("Validation failed"), { statusCode: 400, validation });
    }

    const [updatedMemo] = await prisma.$transaction([
      prisma.investmentMemo.update({
        where: { id: memo.id },
        data: { workflowStatus: "SUBMITTED", currentVersionId: versionId },
      }),
      prisma.investmentMemoVersion.update({
        where: { id: versionId },
        data: {
          versionStatus: "SUBMITTED",
          submittedAt: new Date(),
          validationPassed: true,
          validationErrors: null,
        },
      }),
    ]);

    await InvestmentMemoApprovalHistoryService.recordEvent({
      memoId: memo.id,
      versionId,
      action: "SUBMITTED",
      actorId: actorUserId,
    });

    return updatedMemo;
  }

  static async approve(applicationId: string, versionId: string, actorUserId: string, comment?: string) {
    const memo = await prisma.investmentMemo.findUnique({ where: { applicationId } });
    if (!memo) throw Object.assign(new Error("Investment memo not found"), { statusCode: 404 });
    if (memo.workflowStatus !== "SUBMITTED") {
      throw Object.assign(new Error("Memo must be SUBMITTED to approve"), { statusCode: 409 });
    }
    if (memo.currentVersionId !== versionId) {
      throw Object.assign(new Error("Version does not match current submission"), { statusCode: 409 });
    }

    const version = await prisma.investmentMemoVersion.findFirst({
      where: { id: versionId, memoId: memo.id },
    });
    if (!version) throw Object.assign(new Error("Memo version not found"), { statusCode: 404 });

    const sections = version.sections as MemoSections;

    const boardReview = await prisma.boardReview.findUnique({ where: { applicationId } });

    const [updatedMemo] = await prisma.$transaction([
      prisma.investmentMemo.update({
        where: { id: memo.id },
        data: {
          workflowStatus: "APPROVED",
          approvedVersionId: versionId,
          approvedById: actorUserId,
          approvedAt: new Date(),
          boardReviewId: boardReview?.id ?? memo.boardReviewId,
        },
      }),
      prisma.investmentMemoVersion.update({
        where: { id: versionId },
        data: { versionStatus: "APPROVED" },
      }),
      ...(boardReview
        ? [
            prisma.boardReview.update({
              where: { id: boardReview.id },
              data: {
                recommendationReport: sections.recommendation || boardReview.recommendationReport,
                overallScore:
                  sections.overallScore != null ? sections.overallScore : boardReview.overallScore,
                additionalInformation:
                  sections.additionalInformation || boardReview.additionalInformation,
                imDocumentUrl: version.attachmentUrl || boardReview.imDocumentUrl,
                imDocumentFileName: version.attachmentFileName || boardReview.imDocumentFileName,
                imStatus: "NONE",
              },
            }),
          ]
        : []),
    ]);

    await InvestmentMemoApprovalHistoryService.recordEvent({
      memoId: memo.id,
      versionId,
      action: "APPROVED",
      actorId: actorUserId,
      comment,
    });

    return updatedMemo;
  }

  static async reject(applicationId: string, versionId: string, actorUserId: string, comment?: string) {
    const memo = await prisma.investmentMemo.findUnique({ where: { applicationId } });
    if (!memo) throw Object.assign(new Error("Investment memo not found"), { statusCode: 404 });
    if (memo.workflowStatus !== "SUBMITTED") {
      throw Object.assign(new Error("Memo must be SUBMITTED to reject"), { statusCode: 409 });
    }

    const version = await prisma.investmentMemoVersion.findFirst({
      where: { id: versionId, memoId: memo.id },
    });
    if (!version) throw Object.assign(new Error("Memo version not found"), { statusCode: 404 });

    const [updatedMemo] = await prisma.$transaction([
      prisma.investmentMemo.update({
        where: { id: memo.id },
        data: { workflowStatus: "DRAFT" },
      }),
      prisma.investmentMemoVersion.update({
        where: { id: versionId },
        data: { versionStatus: "DRAFT", submittedAt: null },
      }),
    ]);

    await InvestmentMemoApprovalHistoryService.recordEvent({
      memoId: memo.id,
      versionId,
      action: "REJECTED",
      actorId: actorUserId,
      comment,
    });

    return updatedMemo;
  }

  static async lockOnCallToVote(applicationId: string, actorUserId: string) {
    const memo = await prisma.investmentMemo.findUnique({ where: { applicationId } });
    if (!memo) return null;
    if (memo.workflowStatus === "LOCKED") return memo;

    const versionId = memo.approvedVersionId || memo.currentVersionId;
    if (!versionId) return memo;

    await prisma.$transaction([
      prisma.investmentMemo.update({
        where: { id: memo.id },
        data: { workflowStatus: "LOCKED" },
      }),
      prisma.investmentMemoVersion.updateMany({
        where: { memoId: memo.id, id: versionId },
        data: { versionStatus: "LOCKED" },
      }),
    ]);

    await InvestmentMemoApprovalHistoryService.recordEvent({
      memoId: memo.id,
      versionId,
      action: "LOCKED",
      actorId: actorUserId,
    });

    return prisma.investmentMemo.findUnique({ where: { applicationId } });
  }

  static async assertApprovedForCallToVote(applicationId: string) {
    const memo = await prisma.investmentMemo.findUnique({ where: { applicationId } });
    if (!memo || memo.workflowStatus !== "APPROVED") {
      throw new Error(
        "Investment memo must be CIO-approved before Call to Vote. Use /api/investment-memos to submit and approve the structured memo."
      );
    }
    return memo;
  }
}
