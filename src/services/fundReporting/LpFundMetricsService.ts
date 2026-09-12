// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../utils/database";
import { PortfolioDashboardService } from "../PortfolioDashboardService";

export interface LpFundMetricsSnapshot {
  clientId: string;
  fundId: string;
  lpLegalName: string;
  periodStart: string;
  periodEnd: string;
  currencyCode: string;
  totalCommitment: number;
  totalPaidIn: number;
  totalCalled: number;
  totalDistributions: number;
  unfundedCommitment: number;
  nav: number;
  tvpi: number;
  dpi: number;
  rvpi: number;
  netIrr: number | null;
  fundName: string;
  holdingsSummary?: string;
  boardExtras?: Record<string, unknown>;
}

async function paidInByClientFund(
  fundId: string,
  clientIds: string[]
): Promise<Map<string, number>> {
  const commitments = await prisma.investmentCommitment.findMany({
    where: { fundId, clientId: { in: clientIds }, status: { in: ["ACTIVE", "PENDING"] } },
    select: { id: true, clientId: true, amount: true },
  });
  const commitmentIds = commitments.map((c) => c.id);
  const paidRows = await prisma.capitalCallAllocation.groupBy({
    by: ["investmentCommitmentId"],
    where: { investmentCommitmentId: { in: commitmentIds } },
    _sum: { amountPaid: true },
  });
  const paidByCommitment = new Map<string, number>();
  for (const r of paidRows) {
    paidByCommitment.set(
      r.investmentCommitmentId,
      Number(r._sum.amountPaid?.toString() ?? "0")
    );
  }
  const out = new Map<string, number>();
  for (const c of commitments) {
    const prev = out.get(c.clientId) ?? 0;
    out.set(c.clientId, prev + (paidByCommitment.get(c.id) ?? 0));
  }
  return out;
}

/** Sum of capital called (allocation amounts), not paid-in. SRD: Unfunded = Commitment − Called. */
async function calledByClientFund(
  fundId: string,
  clientIds: string[]
): Promise<Map<string, number>> {
  const rows = await prisma.capitalCallAllocation.findMany({
    where: {
      clientId: { in: clientIds },
      capitalCall: { fundId, status: { notIn: ["CANCELLED", "DRAFT"] } },
    },
    select: { clientId: true, currentCallAmount: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) {
    const prev = out.get(r.clientId) ?? 0;
    out.set(r.clientId, prev + Number(r.currentCallAmount.toString()));
  }
  return out;
}

async function distributionsByClientFund(
  fundId: string,
  clientIds: string[]
): Promise<Map<string, number>> {
  const rows = await prisma.distributionAllocation.findMany({
    where: {
      clientId: { in: clientIds },
      distribution: { fundId, status: { not: "CANCELLED" } },
    },
    select: { clientId: true, amountPaid: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) {
    const prev = out.get(r.clientId) ?? 0;
    out.set(r.clientId, prev + Number(r.amountPaid.toString()));
  }
  return out;
}

async function commitmentsByClient(
  fundId: string,
  clientIds: string[]
): Promise<Map<string, number>> {
  const rows = await prisma.investmentCommitment.findMany({
    where: { fundId, clientId: { in: clientIds }, status: { in: ["ACTIVE", "PENDING"] } },
    select: { clientId: true, amount: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) {
    const prev = out.get(r.clientId) ?? 0;
    out.set(r.clientId, prev + Number(r.amount.toString()));
  }
  return out;
}

export class LpFundMetricsService {
  static async computeForClient(params: {
    fundId: string;
    clientId: string;
    periodStart: Date;
    periodEnd: Date;
    reportLevel?: "INVESTOR" | "BOARD";
  }): Promise<LpFundMetricsSnapshot> {
    const { fundId, clientId, periodStart, periodEnd, reportLevel = "INVESTOR" } = params;

    const [client, fund, fundDashboard] = await Promise.all([
      prisma.client.findUnique({ where: { id: clientId } }),
      prisma.fund.findUnique({ where: { id: fundId }, select: { id: true, name: true } }),
      PortfolioDashboardService.getDashboardData({ fundId, asOfDate: periodEnd }),
    ]);
    if (!client) throw new Error("Client not found");
    if (!fund) throw new Error("Fund not found");

    const paidInMap = await paidInByClientFund(fundId, [clientId]);
    const calledMap = await calledByClientFund(fundId, [clientId]);
    const distMap = await distributionsByClientFund(fundId, [clientId]);
    const commitMap = await commitmentsByClient(fundId, [clientId]);

    const totalPaidIn = paidInMap.get(clientId) ?? 0;
    const totalCalled = calledMap.get(clientId) ?? 0;
    const totalDistributions = distMap.get(clientId) ?? 0;
    const totalCommitment = commitMap.get(clientId) ?? 0;
    // SRD: Unfunded Commitment = Total Commitment − Called Capital (not paid-in)
    const unfundedCommitment = Math.max(0, totalCommitment - totalCalled);

    const fundPaidIn = fundDashboard.performanceOverview?.paidIn ?? 0;
    const totalInvested = fundDashboard.metrics?.totalInvested ?? 0;
    const portfolioRoi = fundDashboard.metrics?.portfolioRoi;
    const fundNav =
      portfolioRoi != null && totalInvested > 0
        ? totalInvested * (1 + portfolioRoi)
        : totalInvested;

    const lpShare = fundPaidIn > 0 ? totalPaidIn / fundPaidIn : 0;
    const nav = fundNav * lpShare;

    const tvpi = totalPaidIn > 0 ? (totalDistributions + nav) / totalPaidIn : 0;
    const dpi = totalPaidIn > 0 ? totalDistributions / totalPaidIn : 0;
    const rvpi = totalPaidIn > 0 ? nav / totalPaidIn : 0;
    const netIrr = fundDashboard.metrics?.lpNetIRR ?? null;

    const snapshot: LpFundMetricsSnapshot = {
      clientId,
      fundId,
      lpLegalName: client.legalName,
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      currencyCode: "USD",
      totalCommitment,
      totalPaidIn,
      totalCalled,
      totalDistributions,
      unfundedCommitment,
      nav,
      tvpi,
      dpi,
      rvpi,
      netIrr,
      fundName: fund.name,
      holdingsSummary: `Fund TVPI ${(fundDashboard.metrics?.tvpi ?? 0).toFixed(2)} · DPI ${(fundDashboard.metrics?.dpi ?? 0).toFixed(2)}`,
    };

    if (reportLevel === "BOARD") {
      snapshot.boardExtras = {
        forecastVarianceNote: "Board variance sections require FP&A bridge (partial in v1).",
        managementExpenses: fundDashboard.performanceOverview?.managementExpenses ?? 0,
        otherExpenses: fundDashboard.performanceOverview?.otherExpenses ?? 0,
      };
    }

    return snapshot;
  }

  /** Pure helpers for unit tests (Eqs 3–5). */
  static ratios(paidIn: number, distributions: number, nav: number) {
    const tvpi = paidIn > 0 ? (distributions + nav) / paidIn : 0;
    const dpi = paidIn > 0 ? distributions / paidIn : 0;
    const rvpi = paidIn > 0 ? nav / paidIn : 0;
    return { tvpi, dpi, rvpi };
  }

  /** SRD: Unfunded = Commitment − Called (not paid-in). */
  static unfunded(commitment: number, called: number) {
    return Math.max(0, commitment - called);
  }
}
