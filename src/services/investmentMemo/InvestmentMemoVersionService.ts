// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import { FirebaseStorageService } from "../FirebaseStorageService";
import { InvestmentMemoProvisionService } from "./InvestmentMemoProvisionService";
import { InvestmentMemoValidationService } from "./InvestmentMemoValidationService";
import type { MemoSections } from "./investmentMemoTypes";

export class InvestmentMemoVersionService {
  static async getMemoHeader(applicationId: string, actorUserId: string) {
    await InvestmentMemoProvisionService.ensureMemoForApplication(applicationId, actorUserId);

    const memo = await prisma.investmentMemo.findUnique({
      where: { applicationId },
      include: {
        approvedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    if (!memo) throw Object.assign(new Error("Investment memo not found"), { statusCode: 404 });

    const latest = memo.versions[0] || null;
    return {
      id: memo.id,
      applicationId: memo.applicationId,
      boardReviewId: memo.boardReviewId,
      workflowStatus: memo.workflowStatus,
      currentVersionId: memo.currentVersionId,
      approvedVersionId: memo.approvedVersionId,
      approvedAt: memo.approvedAt,
      approvedBy: memo.approvedBy,
      latestVersion: latest
        ? {
            id: latest.id,
            versionNumber: latest.versionNumber,
            versionStatus: latest.versionStatus,
            validationPassed: latest.validationPassed,
            submittedAt: latest.submittedAt,
            createdAt: latest.createdAt,
            createdBy: latest.createdBy,
            hasAttachment: Boolean(latest.attachmentUrl),
          }
        : null,
    };
  }

  static async listVersions(applicationId: string) {
    const memo = await prisma.investmentMemo.findUnique({ where: { applicationId } });
    if (!memo) throw Object.assign(new Error("Investment memo not found"), { statusCode: 404 });

    return prisma.investmentMemoVersion.findMany({
      where: { memoId: memo.id },
      orderBy: { versionNumber: "desc" },
      select: {
        id: true,
        versionNumber: true,
        versionStatus: true,
        validationPassed: true,
        changeSummary: true,
        submittedAt: true,
        createdAt: true,
        attachmentUrl: true,
        attachmentFileName: true,
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  static async getVersion(applicationId: string, versionId: string) {
    const memo = await prisma.investmentMemo.findUnique({ where: { applicationId } });
    if (!memo) throw Object.assign(new Error("Investment memo not found"), { statusCode: 404 });

    const version = await prisma.investmentMemoVersion.findFirst({
      where: { id: versionId, memoId: memo.id },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!version) throw Object.assign(new Error("Memo version not found"), { statusCode: 404 });
    return version;
  }

  static async createNewVersion(applicationId: string, actorUserId: string, changeSummary?: string) {
    const memo = await prisma.investmentMemo.findUnique({
      where: { applicationId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (!memo) throw Object.assign(new Error("Investment memo not found"), { statusCode: 404 });
    if (memo.workflowStatus === "LOCKED") {
      throw Object.assign(new Error("Memo is locked — cannot create a new version"), { statusCode: 409 });
    }
    if (memo.workflowStatus === "SUBMITTED") {
      throw Object.assign(new Error("Memo is awaiting CIO approval — cannot create a new version"), {
        statusCode: 409,
      });
    }

    const base =
      memo.versions[0]?.sections ||
      (await InvestmentMemoProvisionService.buildDefaultSections(applicationId));
    const nextNum = (memo.versions[0]?.versionNumber || 0) + 1;

    return prisma.$transaction(async (tx) => {
      const version = await tx.investmentMemoVersion.create({
        data: {
          memoId: memo.id,
          versionNumber: nextNum,
          sections: base,
          versionStatus: "DRAFT",
          createdById: actorUserId,
          changeSummary: changeSummary || null,
        },
      });
      await tx.investmentMemo.update({
        where: { id: memo.id },
        data: { workflowStatus: "DRAFT", currentVersionId: version.id },
      });
      return version;
    });
  }

  static async saveDraft(
    applicationId: string,
    versionId: string,
    sections: MemoSections,
    options: { validate?: boolean; changeSummary?: string } = {}
  ) {
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
      throw Object.assign(new Error("Only draft versions can be edited"), { statusCode: 409 });
    }

    const validation = InvestmentMemoValidationService.validateSections(sections);

    return prisma.investmentMemoVersion.update({
      where: { id: versionId },
      data: {
        sections,
        changeSummary: options.changeSummary ?? version.changeSummary,
        validationPassed: validation.passed,
        validationErrors: validation.errors.length ? validation.errors : null,
      },
    });
  }

  static async attachFile(
    applicationId: string,
    versionId: string,
    file: { buffer: Buffer; originalname: string },
    actorUserId: string
  ) {
    const memo = await prisma.investmentMemo.findUnique({ where: { applicationId } });
    if (!memo) throw Object.assign(new Error("Investment memo not found"), { statusCode: 404 });

    const version = await prisma.investmentMemoVersion.findFirst({
      where: { id: versionId, memoId: memo.id },
    });
    if (!version) throw Object.assign(new Error("Memo version not found"), { statusCode: 404 });
    if (version.versionStatus !== "DRAFT") {
      throw Object.assign(new Error("Attachments can only be added to draft versions"), { statusCode: 409 });
    }

    const boardReviewId =
      memo.boardReviewId ||
      (await prisma.boardReview.findUnique({ where: { applicationId } }))?.id ||
      memo.id;

    const { downloadURL } = await FirebaseStorageService.uploadBoardReviewInvestmentMemorandum(
      file.buffer,
      applicationId,
      boardReviewId,
      file.originalname
    );
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");

    return prisma.investmentMemoVersion.update({
      where: { id: versionId },
      data: {
        attachmentUrl: downloadURL,
        attachmentFileName: file.originalname,
        attachmentSha256: sha256,
      },
    });
  }
}
