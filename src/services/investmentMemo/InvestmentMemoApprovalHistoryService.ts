// @ts-nocheck
import { prisma } from "../../utils/database";
import type { ApprovalAction } from "./investmentMemoTypes";

export class InvestmentMemoApprovalHistoryService {
  static async recordEvent(params: {
    memoId: string;
    versionId: string;
    action: ApprovalAction;
    actorId: string;
    comment?: string | null;
  }) {
    return prisma.investmentMemoApprovalEvent.create({
      data: {
        memoId: params.memoId,
        versionId: params.versionId,
        action: params.action,
        actorId: params.actorId,
        comment: params.comment || null,
      },
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  static async listForApplication(applicationId: string) {
    const memo = await prisma.investmentMemo.findUnique({ where: { applicationId } });
    if (!memo) return [];

    return prisma.investmentMemoApprovalEvent.findMany({
      where: { memoId: memo.id },
      orderBy: { createdAt: "asc" },
      include: {
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        version: { select: { id: true, versionNumber: true, versionStatus: true } },
      },
    });
  }
}
