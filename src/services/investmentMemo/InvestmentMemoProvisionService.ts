// @ts-nocheck
import { prisma } from "../../utils/database";
import { emptySections, type MemoSections } from "./investmentMemoTypes";

export class InvestmentMemoProvisionService {
  static buildDealTermsFromTermSheet(ts: {
    investmentAmount: any;
    valuation: any;
    equityPercentage: any;
    keyTerms?: string | null;
    conditions?: string | null;
    timeline?: string | null;
  }): string {
    const lines = [
      ts.investmentAmount != null ? `Investment amount: ${ts.investmentAmount}` : null,
      ts.valuation != null ? `Valuation: ${ts.valuation}` : null,
      ts.equityPercentage != null ? `Equity: ${ts.equityPercentage}%` : null,
      ts.keyTerms?.trim() ? `Key terms: ${ts.keyTerms.trim()}` : null,
      ts.conditions?.trim() ? `Conditions: ${ts.conditions.trim()}` : null,
      ts.timeline?.trim() ? `Timeline: ${ts.timeline.trim()}` : null,
    ].filter(Boolean);
    return lines.join("\n");
  }

  static async buildDefaultSections(applicationId: string): Promise<MemoSections> {
    const sections = emptySections();
    const termSheet = await prisma.termSheet.findUnique({ where: { applicationId } });
    if (termSheet?.isSigned) {
      sections.dealTerms = InvestmentMemoProvisionService.buildDealTermsFromTermSheet(termSheet);
    }

    const dd = await prisma.dueDiligenceReview.findUnique({
      where: { applicationId },
      select: { recommendation: true, finalComments: true, financialComments: true },
    });
    if (dd?.financialComments?.trim()) {
      sections.financialAnalysis = dd.financialComments.trim();
    }
    if (dd?.finalComments?.trim()) {
      sections.executiveSummary = dd.finalComments.trim();
    }
    if (dd?.recommendation?.trim()) {
      sections.recommendation = dd.recommendation.trim();
    }

    return sections;
  }

  static async ensureMemoForApplication(applicationId: string, actorUserId: string) {
    const boardReview = await prisma.boardReview.findUnique({ where: { applicationId } });
    const existing = await prisma.investmentMemo.findUnique({ where: { applicationId } });
    if (existing) {
      if (boardReview && !existing.boardReviewId) {
        return prisma.investmentMemo.update({
          where: { id: existing.id },
          data: { boardReviewId: boardReview.id },
        });
      }
      return existing;
    }
    const sections = await InvestmentMemoProvisionService.buildDefaultSections(applicationId);

    return prisma.$transaction(async (tx) => {
      const memo = await tx.investmentMemo.create({
        data: {
          applicationId,
          boardReviewId: boardReview?.id ?? null,
          workflowStatus: "DRAFT",
        },
      });

      const version = await tx.investmentMemoVersion.create({
        data: {
          memoId: memo.id,
          versionNumber: 1,
          sections,
          versionStatus: "DRAFT",
          createdById: actorUserId,
        },
      });

      return tx.investmentMemo.update({
        where: { id: memo.id },
        data: { currentVersionId: version.id },
      });
    });
  }
}
