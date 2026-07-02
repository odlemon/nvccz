// @ts-nocheck
import { prisma } from "../../utils/database";
import { PortfolioDashboardService } from "../PortfolioDashboardService";
import { QuarterlyStatementFxService } from "./QuarterlyStatementFxService";
import { QuarterlyStatementMetricsEngine } from "./QuarterlyStatementMetricsEngine";
import type { XirrCashflow } from "../../utils/xirr";

export interface QuarterlyLpMetrics {
  clientId: string;
  lpLegalName: string;
  periodStart: string;
  periodEnd: string;
  fundName: string;
  totalCommitmentUsd: number;
  totalCommitmentZig: number;
  totalPaidInUsd: number;
  totalPaidInZig: number;
  totalDistributionsUsd: number;
  totalDistributionsZig: number;
  navUsd: number;
  navZig: number;
  dpi: number;
  tvpi: number;
  rvpi: number;
  netIrr: number | null;
}

export class QuarterlyStatementMetricsService {
  static async computeForRecipient(args: {
    fundId: string;
    clientId: string;
    lpLegalName: string;
    periodStart: Date;
    periodEnd: Date;
    runId: string;
  }): Promise<QuarterlyLpMetrics> {
    const { fundId, clientId, lpLegalName, periodStart, periodEnd, runId } = args;

    const fund = await prisma.fund.findUnique({ where: { id: fundId }, select: { name: true } });
    if (!fund) throw new Error("Fund not found");

    const snapshots = await prisma.quarterlyStatementLedgerSnapshot.findMany({
      where: { runId, clientId },
    });

    let paidInUsd = 0;
    let paidInZig = 0;
    let distUsd = 0;
    let distZig = 0;
    const cashflows: XirrCashflow[] = [];

    for (const s of snapshots) {
      const usd = Number(s.amountUsd ?? 0);
      const zig = Number(s.amountZig ?? 0);
      const txDate = new Date(s.transactionDate);
      if (s.sourceType === "CAPITAL_CALL") {
        paidInUsd += usd;
        paidInZig += zig;
        cashflows.push({ amount: -usd, date: txDate });
      } else if (s.sourceType === "DISTRIBUTION") {
        distUsd += usd;
        distZig += zig;
        cashflows.push({ amount: usd, date: txDate });
      }
    }

    const commitments = await prisma.investmentCommitment.findMany({
      where: { fundId, clientId, status: { in: ["ACTIVE", "PENDING"] } },
      select: { amount: true, currency: true },
    });
    let totalCommitmentUsd = 0;
    let totalCommitmentZig = 0;
    for (const c of commitments) {
      const amt = Number(c.amount);
      totalCommitmentUsd += await QuarterlyStatementFxService.convert(amt, c.currency, "USD", periodEnd);
      totalCommitmentZig += await QuarterlyStatementFxService.convert(amt, c.currency, "ZIG", periodEnd);
    }

    const fundDashboard = await PortfolioDashboardService.getDashboardData({ fundId, asOfDate: periodEnd });
    const fundPaidIn = fundDashboard.performanceOverview?.paidIn ?? 0;
    const totalInvested = fundDashboard.metrics?.totalInvested ?? 0;
    const portfolioRoi = fundDashboard.metrics?.portfolioRoi;
    const fundNav =
      portfolioRoi != null && totalInvested > 0 ? totalInvested * (1 + portfolioRoi) : totalInvested;
    const lpShare = fundPaidIn > 0 ? paidInUsd / fundPaidIn : 0;
    const navUsd = fundNav * lpShare;
    const navZig = await QuarterlyStatementFxService.convert(navUsd, "USD", "ZIG", periodEnd);

    const ratios = QuarterlyStatementMetricsEngine.ratios(paidInUsd, distUsd, navUsd);
    const netIrr = QuarterlyStatementMetricsEngine.netIrr(cashflows, navUsd, periodEnd);

    return {
      clientId,
      lpLegalName,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      fundName: fund.name,
      totalCommitmentUsd,
      totalCommitmentZig,
      totalPaidInUsd: paidInUsd,
      totalPaidInZig: paidInZig,
      totalDistributionsUsd: distUsd,
      totalDistributionsZig: distZig,
      navUsd,
      navZig,
      ...ratios,
      netIrr,
    };
  }
}
