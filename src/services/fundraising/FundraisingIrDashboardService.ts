// @ts-nocheck
import { prisma } from "../../utils/database";
import { FundraisingIrError } from "./FundraisingIrError";

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function bestOpenAmount(opp: any): number {
  const soft = n(opp.softCircleAmount);
  if (soft > 0) return soft;
  const qual = n(opp.qualifiedAmount);
  if (qual > 0) return qual;
  const ind = n(opp.indicativeAmount);
  if (ind > 0) return ind;
  const prop = n(opp.proposedAmount);
  if (prop > 0) return prop;
  const exp = n(opp.expectedAum);
  if (exp > 0) return exp;
  return 0;
}

function weightedAmount(opp: any): number {
  const base = bestOpenAmount(opp);
  const stageProb = n(opp.stageProbability ?? opp.currentStage?.winProbabilityPct);
  const confidence = n(opp.confidenceAdjustment) || 1;
  return base * (stageProb / 100) * confidence;
}

function isOpenTaskStatus(status: unknown): boolean {
  const s = String(status || "").toLowerCase();
  return s !== "" && !["done", "completed", "cancelled", "archived", "closed"].includes(s);
}

function signedHistoryDelta(row: { newValue: unknown; oldValue: unknown }): number {
  const newVal = n(row.newValue);
  const oldVal = row.oldValue == null ? null : n(row.oldValue);
  if (oldVal == null) return newVal;
  return newVal - oldVal;
}

function revenueFromCommercialTerms(termsJson: unknown, opp: any): number {
  const terms = (termsJson || {}) as Record<string, unknown>;
  const projected = n(terms.projectedFees ?? terms.projectedFee ?? terms.expectedRevenue);
  if (projected > 0) return projected;

  const base =
    n(opp?.signedAmount) ||
    n(opp?.expectedAum) ||
    n(opp?.proposedAmount) ||
    n(opp?.softCircleAmount) ||
    n(opp?.qualifiedAmount) ||
    n(opp?.indicativeAmount);
  if (base <= 0) return 0;

  const feePct =
    n(terms.managementFee) ||
    n(terms.managementFeeRate) ||
    n(terms.managementFeePct) ||
    n(terms.feeRate);
  if (feePct <= 0) return 0;
  const rate = feePct > 1 ? feePct / 100 : feePct;
  return base * rate;
}

async function computeExpectedRevenue(campaignIds: string[], opportunities: any[], signedTotal: number) {
  if (campaignIds.length > 0) {
    const scenarios = await prisma.fundraisingForecastScenario.findMany({
      where: { campaignId: { in: campaignIds } },
      select: {
        campaignId: true,
        scenarioType: true,
        projectedFees: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const feesByCampaign = new Map<string, number>();
    for (const scenario of scenarios) {
      if (feesByCampaign.has(scenario.campaignId)) continue;
      const fees = n(scenario.projectedFees);
      if (fees > 0) feesByCampaign.set(scenario.campaignId, fees);
    }
    if (feesByCampaign.size > 0) {
      return [...feesByCampaign.values()].reduce((s, v) => s + v, 0);
    }
  }

  const oppIds = opportunities.map((o) => o.id);
  if (oppIds.length > 0) {
    const commercialTerms = await prisma.fundraisingCommercialTerms.findMany({
      where: { opportunityId: { in: oppIds } },
      select: { opportunityId: true, termsJson: true },
    });
    if (commercialTerms.length > 0) {
      const oppById = new Map(opportunities.map((o) => [o.id, o]));
      let total = 0;
      for (const row of commercialTerms) {
        total += revenueFromCommercialTerms(row.termsJson, oppById.get(row.opportunityId));
      }
      if (total > 0) return total;
    }
  }

  return signedTotal > 0 ? signedTotal * 0.02 : 0;
}

async function computeSignedTrend(opportunityIds: string[]) {
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setDate(currentStart.getDate() - 30);
  const previousStart = new Date(now);
  previousStart.setDate(previousStart.getDate() - 60);

  let currentPeriod = 0;
  let previousPeriod = 0;

  if (opportunityIds.length > 0) {
    const historyRows = await prisma.opportunityAmountHistory.findMany({
      where: {
        opportunityId: { in: opportunityIds },
        amountType: "SIGNED",
        changedAt: { gte: previousStart },
      },
      select: { newValue: true, oldValue: true, changedAt: true },
    });

    for (const row of historyRows) {
      const delta = signedHistoryDelta(row);
      if (row.changedAt >= currentStart) currentPeriod += delta;
      else previousPeriod += delta;
    }

    if (currentPeriod === 0 && previousPeriod === 0) {
      const auditRows = await prisma.fundraisingAuditLog.findMany({
        where: {
          objectType: "FundraisingOpportunity",
          objectId: { in: opportunityIds },
          timestamp: { gte: previousStart },
        },
        select: { previousValue: true, newValue: true, timestamp: true },
        take: 5000,
      });

      for (const row of auditRows) {
        const prevSigned = n((row.previousValue as any)?.signedAmount);
        const nextSigned = n((row.newValue as any)?.signedAmount);
        if (nextSigned === prevSigned) continue;
        const delta = nextSigned - prevSigned;
        if (row.timestamp >= currentStart) currentPeriod += delta;
        else previousPeriod += delta;
      }
    }
  }

  const value = currentPeriod - previousPeriod;
  let direction: "UP" | "DOWN" | "FLAT" = "FLAT";
  if (value > 0) direction = "UP";
  else if (value < 0) direction = "DOWN";

  return {
    direction,
    value,
    currentPeriod,
    previousPeriod,
  };
}

async function countOpenTasks(campaignIds: string[], scopedCampaignId?: string | null) {
  const tasks = await prisma.task.findMany({
    where: {
      isTrashed: false,
      taskMetadata: { path: "$.sourceModule", equals: "fundraising" },
    },
    select: { id: true, status: true, stage: true, taskMetadata: true },
  });

  const scopedIds = scopedCampaignId ? [scopedCampaignId] : campaignIds;
  const openPerformanceTasks = tasks.filter((task) => {
    const meta = (task.taskMetadata || {}) as Record<string, unknown>;
    if (scopedIds.length > 0) {
      const taskCampaignId = meta.campaignId as string | undefined;
      if (taskCampaignId && !scopedIds.includes(taskCampaignId)) return false;
    }
    return isOpenTaskStatus(task.status || task.stage);
  }).length;

  const commWhere: any = { interactionType: "INTERNAL_TASK" };
  if (scopedCampaignId) commWhere.campaignId = scopedCampaignId;
  else if (campaignIds.length > 0) commWhere.campaignId = { in: campaignIds };

  const commTasks = await prisma.fundraisingCommunication.findMany({
    where: commWhere,
    select: { outcome: true },
  });
  const openCommTasks = commTasks.filter((row) => isOpenTaskStatus(row.outcome)).length;

  return openPerformanceTasks + openCommTasks;
}

async function countUpcomingClosings(campaignIds: string[]) {
  if (campaignIds.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.fundraisingClosing.count({
    where: {
      campaignId: { in: campaignIds },
      status: { in: ["PLANNED", "IN_PROGRESS", "SCHEDULED"] },
      closingDate: { gte: today },
    },
  });
}

function aggregateOpportunityMetrics(campaigns: any[], opportunities: any[]) {
  const targetTotal = campaigns.reduce((s, c) => s + n(c.targetCapital), 0);
  let signedTotal = 0;
  let admittedTotal = 0;
  let fundedTotal = 0;
  let expectedAumTotal = 0;
  let activatedAumTotal = 0;
  let grossPipeline = 0;
  let weightedPipeline = 0;

  const opportunityCountsByStatus: Record<string, number> = {};
  const opportunityCountsByStage: Record<string, number> = {};

  for (const opp of opportunities) {
    signedTotal += n(opp.signedAmount);
    admittedTotal += n(opp.admittedAmount);
    fundedTotal += n(opp.fundedAmount);
    expectedAumTotal += n(opp.expectedAum);
    activatedAumTotal += n(opp.activatedAum);

    opportunityCountsByStatus[opp.status] = (opportunityCountsByStatus[opp.status] || 0) + 1;
    const code = opp.currentStage?.stageCode || "UNKNOWN";
    opportunityCountsByStage[code] = (opportunityCountsByStage[code] || 0) + 1;

    if (String(opp.status).toUpperCase() === "OPEN") {
      grossPipeline += bestOpenAmount(opp);
      weightedPipeline += weightedAmount(opp);
    }
  }

  const remainingTarget = Math.max(targetTotal - signedTotal, 1);
  const coverageRatio = weightedPipeline / remainingTarget;

  return {
    targetTotal,
    signedTotal,
    admittedTotal,
    fundedTotal,
    expectedAumTotal,
    activatedAumTotal,
    grossPipeline,
    weightedPipeline,
    coverageRatio,
    opportunityCounts: {
      byStatus: opportunityCountsByStatus,
      byStageCode: opportunityCountsByStage,
    },
  };
}

async function buildDashboardMetrics(
  campaigns: any[],
  opportunities: any[],
  scopedCampaignId?: string | null
) {
  const campaignIds = campaigns.map((c) => c.id);
  const opportunityIds = opportunities.map((o) => o.id);
  const base = aggregateOpportunityMetrics(campaigns, opportunities);

  const [expectedRevenue, trendsSigned, openTasksCount, upcomingClosingsCount] = await Promise.all([
    computeExpectedRevenue(campaignIds, opportunities, base.signedTotal),
    computeSignedTrend(opportunityIds),
    countOpenTasks(campaignIds, scopedCampaignId),
    countUpcomingClosings(campaignIds),
  ]);

  return {
    ...base,
    expectedRevenue,
    trends: {
      signed: trendsSigned,
    },
    openTasks: [] as any[],
    openTasksCount,
    upcomingClosingsCount,
  };
}

export class FundraisingIrDashboardService {
  static async executiveDashboard({
    campaignId,
    campaignType,
  }: {
    campaignId?: string;
    campaignType?: string;
  } = {}) {
    const where: any = {};
    if (campaignId) where.id = campaignId;
    if (campaignType) where.campaignType = campaignType;

    const campaigns = await prisma.fundraisingCampaign.findMany({
      where,
      select: {
        id: true,
        name: true,
        campaignType: true,
        status: true,
        targetCapital: true,
        primaryCurrency: true,
      },
    });

    const campaignIds = campaigns.map((c) => c.id);
    const opportunities =
      campaignIds.length === 0
        ? []
        : await prisma.fundraisingOpportunity.findMany({
            where: { campaignId: { in: campaignIds } },
            include: { currentStage: true },
          });

    const metrics = await buildDashboardMetrics(campaigns, opportunities, campaignId || null);
    return {
      scope: { campaignId: campaignId || null, campaignType: campaignType || null },
      campaignCount: campaigns.length,
      ...metrics,
    };
  }

  static async campaignDashboard(campaignId: string) {
    const campaign = await prisma.fundraisingCampaign.findUnique({
      where: { id: campaignId },
      include: {
        stages: { orderBy: { sortOrder: "asc" } },
        fund: { select: { id: true, name: true } },
      },
    });
    if (!campaign) throw FundraisingIrError.notFound("Campaign not found", "CAMPAIGN_NOT_FOUND");

    const opportunities = await prisma.fundraisingOpportunity.findMany({
      where: { campaignId },
      include: { currentStage: true, investor: { select: { id: true, legalName: true } } },
    });

    const metrics = await buildDashboardMetrics([campaign], opportunities, campaignId);

    const stages = campaign.stages.map((stage) => {
      const stageOpps = opportunities.filter((o) => o.currentStageId === stage.id);
      const open = stageOpps.filter((o) => String(o.status).toUpperCase() === "OPEN");
      return {
        id: stage.id,
        stageCode: stage.stageCode,
        stageName: stage.stageName,
        sortOrder: stage.sortOrder,
        winProbabilityPct: stage.winProbabilityPct,
        opportunityCount: stageOpps.length,
        openCount: open.length,
        grossPipeline: open.reduce((s, o) => s + bestOpenAmount(o), 0),
        weightedPipeline: open.reduce((s, o) => s + weightedAmount(o), 0),
        signedTotal: stageOpps.reduce((s, o) => s + n(o.signedAmount), 0),
        fundedTotal: stageOpps.reduce((s, o) => s + n(o.fundedAmount), 0),
        expectedAumTotal: stageOpps.reduce((s, o) => s + n(o.expectedAum), 0),
        activatedAumTotal: stageOpps.reduce((s, o) => s + n(o.activatedAum), 0),
      };
    });

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        campaignType: campaign.campaignType,
        status: campaign.status,
        approvalStatus: campaign.approvalStatus,
        targetCapital: campaign.targetCapital,
        primaryCurrency: campaign.primaryCurrency,
        fund: campaign.fund,
      },
      ...metrics,
      stages,
    };
  }
}
