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

function aggregateOpportunities(campaigns: any[], opportunities: any[]) {
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
    openTasks: [] as any[],
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

    const metrics = aggregateOpportunities(campaigns, opportunities);
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

    const metrics = aggregateOpportunities([campaign], opportunities);

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
