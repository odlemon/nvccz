// @ts-nocheck
import { prisma } from "../../utils/database";
import { FundraisingFxService } from "./FundraisingFxService";
import { FundraisingMetricsEngine } from "./FundraisingMetricsEngine";

export class FundraisingPipelineService {
  static async getBoard(campaignId: string, presentationCurrency?: string) {
    const campaign = await prisma.fundraisingCampaign.findUnique({
      where: { id: campaignId },
      include: {
        stages: { orderBy: { sortOrder: "asc" } },
        deals: {
          include: {
            stage: true,
            checklistItems: true,
            agreement: { select: { status: true, signedAt: true } },
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    if (!campaign) throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });

    const pres = FundraisingFxService.normalizeCurrency(
      presentationCurrency || campaign.primaryCurrency
    );

    const columns = await Promise.all(
      campaign.stages.map(async (stage) => {
        const stageDeals = campaign.deals.filter((d) => d.stageId === stage.id);
        let aggregatedValue = 0;
        for (const d of stageDeals) {
          const amt = Number(d.proposedAmount);
          const converted = await FundraisingFxService.convertAmount(
            amt,
            d.currencyCode,
            pres,
            d.fxRateAtCreation ? Number(d.fxRateAtCreation) : null
          );
          aggregatedValue += converted;
        }
        return {
          stage,
          dealCount: stageDeals.length,
          aggregatedValue,
          presentationCurrency: pres,
          deals: stageDeals.map((d) => ({
            ...d,
            proposedAmount: Number(d.proposedAmount),
            checklistComplete: d.checklistItems.filter((c) => c.isRequired && !c.isComplete).length,
            checklistTotal: d.checklistItems.filter((c) => c.isRequired).length,
          })),
        };
      })
    );

    return { campaign: { id: campaign.id, name: campaign.name, primaryCurrency: campaign.primaryCurrency }, columns };
  }

  static async getMetrics(campaignId: string, presentationCurrency?: string) {
    const campaign = await prisma.fundraisingCampaign.findUnique({
      where: { id: campaignId },
      include: {
        deals: { include: { stage: true } },
      },
    });
    if (!campaign) throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });

    const pres = FundraisingFxService.normalizeCurrency(
      presentationCurrency || campaign.primaryCurrency
    );
    const target = Number(campaign.targetCapital);

    const dealMetrics: Array<{ amount: number; winProbabilityPct: number; isWon: boolean }> = [];
    let wonTotal = 0;

    for (const d of campaign.deals) {
      const amt = await FundraisingFxService.convertAmount(
        Number(d.proposedAmount),
        d.currencyCode,
        pres,
        d.fxRateAtCreation ? Number(d.fxRateAtCreation) : null
      );
      const isWon = d.stage.stageCode === "WON_SIGNED" || d.closedAt != null;
      dealMetrics.push({
        amount: amt,
        winProbabilityPct: Number(d.stage.winProbabilityPct),
        isWon,
      });
      if (isWon) wonTotal += amt;
    }

    const wpv = FundraisingMetricsEngine.weightedPipelineValue(dealMetrics);
    const completionPct = FundraisingMetricsEngine.completionPct(wonTotal, target);
    const gapRemaining = FundraisingMetricsEngine.gapRemaining(target, wonTotal);
    const daysLeft = FundraisingMetricsEngine.daysLeft(campaign.closeDate);

    return {
      campaignId,
      presentationCurrency: pres,
      targetCapital: target,
      weightedPipelineValue: wpv,
      wonTotal,
      completionPct,
      gapRemaining,
      daysLeft,
      dealCount: campaign.deals.length,
    };
  }

  static async getDashboard(campaignId: string, presentationCurrency?: string) {
    const metrics = await FundraisingPipelineService.getMetrics(campaignId, presentationCurrency);
    const board = await FundraisingPipelineService.getBoard(campaignId, presentationCurrency);
    return { metrics, boardSummary: board.columns.map((c) => ({
      stageCode: c.stage.stageCode,
      stageName: c.stage.stageName,
      dealCount: c.dealCount,
      aggregatedValue: c.aggregatedValue,
    })) };
  }
}
