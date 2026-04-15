// @ts-nocheck
/**
 * Suite 02: investee purchase requisitions vs held investment / commitment (drawdown cap).
 * Remaining tranche = committed amount (implementation) minus PRs that already reserve drawdown.
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";

export const DRAWDOWN_EXCEEDS_TRANCHE_MESSAGE =
  "Drawdown Request Exceeds Available Investment Tranche.";

/** PRs that still tie up drawdown until finished or cancelled (DRAFT/REJECTED excluded). */
const RESERVING_STATUSES = [
  "PENDING_VC_EXECUTIVE_REVIEW",
  "PENDING_APPROVAL",
  "APPROVED",
  "RFQ_SENT",
  "CONVERTED_TO_PO",
];

function toDec(v: unknown): Decimal {
  if (v == null) return new Decimal(0);
  if (v instanceof Decimal) return v;
  return new Decimal(String(v));
}

export class InvesteeDrawdownProcurementService {
  /** Committed tranche: totalCommittedAmount, else sum APPROVED+DISBURSED disbursements. */
  static async getCommittedTrancheAmount(portfolioCompanyId: string): Promise<Decimal> {
    const impl = await prisma.investmentImplementation.findUnique({
      where: { portfolioCompanyId },
      include: {
        fundDisbursements: {
          where: { status: { in: ["APPROVED", "DISBURSED"] } },
          select: { amount: true },
        },
      },
    });
    if (!impl) {
      throw new Error("No investment implementation found for this portfolio company.");
    }
    if (impl.totalCommittedAmount != null && toDec(impl.totalCommittedAmount).gt(0)) {
      return toDec(impl.totalCommittedAmount);
    }
    let sum = new Decimal(0);
    for (const d of impl.fundDisbursements || []) {
      sum = sum.plus(toDec(d.amount));
    }
    return sum;
  }

  /** Sum drawdownRequestAmount for PRs that still reserve capacity (excludes DRAFT, REJECTED, etc.). */
  static async sumReservedDrawdown(
    portfolioCompanyId: string,
    excludeRequisitionId?: string
  ): Promise<Decimal> {
    const rows = await prisma.purchaseRequisition.findMany({
      where: {
        portfolioCompanyId,
        status: { in: RESERVING_STATUSES },
        ...(excludeRequisitionId ? { id: { not: excludeRequisitionId } } : {}),
      },
      select: { drawdownRequestAmount: true },
    });
    let sum = new Decimal(0);
    for (const r of rows) {
      if (r.drawdownRequestAmount != null) {
        sum = sum.plus(toDec(r.drawdownRequestAmount));
      }
    }
    return sum;
  }

  static async getAvailableDrawdownAmount(portfolioCompanyId: string): Promise<{
    committed: Decimal;
    reserved: Decimal;
    available: Decimal;
  }> {
    const committed = await this.getCommittedTrancheAmount(portfolioCompanyId);
    const reserved = await this.sumReservedDrawdown(portfolioCompanyId);
    const raw = committed.minus(reserved);
    return {
      committed,
      reserved,
      available: raw.gte(0) ? raw : new Decimal(0),
    };
  }

  /**
   * Ensures reserved (optionally excluding one requisition) + additionalAmount <= committed.
   */
  static async assertDrawdownWithinTranche(params: {
    portfolioCompanyId: string;
    additionalAmount: Decimal;
    excludeRequisitionId?: string;
  }): Promise<void> {
    const committed = await this.getCommittedTrancheAmount(params.portfolioCompanyId);
    const reserved = await this.sumReservedDrawdown(
      params.portfolioCompanyId,
      params.excludeRequisitionId
    );
    if (reserved.plus(params.additionalAmount).gt(committed)) {
      throw new Error(DRAWDOWN_EXCEEDS_TRANCHE_MESSAGE);
    }
  }

  /** PRs that count as "approved" for investee ledger vs total award (Suite 02 / 2.10). */
  static isApprovedForLedger(status: string, approvedAt: Date | null): boolean {
    if (approvedAt != null) {
      return true;
    }
    return ["APPROVED", "RFQ_SENT", "CONVERTED_TO_PO"].includes(status);
  }

  /** Investee portal: caps + all PR rows + approved-ledger subtotals (Suite 02). */
  static async getDrawdownSummaryForPortfolio(portfolioCompanyId: string) {
    const caps = await this.getAvailableDrawdownAmount(portfolioCompanyId);
    const requisitions = await prisma.purchaseRequisition.findMany({
      where: { portfolioCompanyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        requisitionNumber: true,
        title: true,
        status: true,
        drawdownRequestAmount: true,
        useOfFundsDocumentUrl: true,
        investeeSubmittedAt: true,
        approvedAt: true,
        sourcingCategory: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    let totalApprovedDrawdownAmount = new Decimal(0);
    const ledgerApprovedPrs = [];
    for (const r of requisitions) {
      if (
        this.isApprovedForLedger(r.status, r.approvedAt) &&
        r.drawdownRequestAmount != null
      ) {
        totalApprovedDrawdownAmount = totalApprovedDrawdownAmount.plus(
          toDec(r.drawdownRequestAmount)
        );
        ledgerApprovedPrs.push(r);
      }
    }
    return {
      totalInvestmentAward: caps.committed.toString(),
      committed: caps.committed.toString(),
      reserved: caps.reserved.toString(),
      available: caps.available.toString(),
      totalApprovedDrawdownAmount: totalApprovedDrawdownAmount.toString(),
      ledgerApprovedPrs,
      requisitions,
    };
  }
}
