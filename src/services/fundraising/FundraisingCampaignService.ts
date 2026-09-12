// @ts-nocheck
import { prisma } from "../../utils/database";
import { DEFAULT_STAGE_SEED } from "./FundraisingMetricsEngine";
import { FundraisingFxService } from "./FundraisingFxService";

export class FundraisingCampaignService {
  static async list(filters: { fundId?: string; status?: string } = {}) {
    const where: any = {};
    if (filters.fundId) where.fundId = filters.fundId;
    if (filters.status) where.status = filters.status;
    return prisma.fundraisingCampaign.findMany({
      where,
      include: { fund: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  static async get(campaignId: string) {
    const campaign = await prisma.fundraisingCampaign.findUnique({
      where: { id: campaignId },
      include: {
        fund: { select: { id: true, name: true, status: true } },
        stages: { orderBy: { sortOrder: "asc" } },
        glMapping: true,
      },
    });
    if (!campaign) {
      throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });
    }
    return campaign;
  }

  static async create(
    userId: string,
    body: {
      fundId: string;
      name: string;
      targetCapital: number;
      primaryCurrency?: string;
      startDate: string;
      closeDate: string;
      regionTags?: string[];
    }
  ) {
    const fund = await prisma.fund.findUnique({ where: { id: body.fundId } });
    if (!fund) throw Object.assign(new Error("Fund not found"), { statusCode: 404 });

    const currency = FundraisingFxService.normalizeCurrency(body.primaryCurrency || "USD");

    const { campaign, stagePairs } = await prisma.$transaction(
      async (tx) => {
        const campaign = await tx.fundraisingCampaign.create({
          data: {
            fundId: body.fundId,
            campaignType: "PE_FUNDRAISE",
            name: body.name,
            targetCapital: body.targetCapital,
            primaryCurrency: currency,
            startDate: new Date(body.startDate),
            closeDate: new Date(body.closeDate),
            regionTags: body.regionTags ?? [],
            status: "ACTIVE",
            approvalStatus: "APPROVED",
            campaignOwnerId: userId,
            createdById: userId,
          },
        });

        await tx.fundraisingCampaignGlMapping.create({
          data: { campaignId: campaign.id },
        });

        const stagePairs: Array<{ stageId: string; checklist: typeof DEFAULT_STAGE_SEED[number]["checklist"] }> = [];
        for (const stage of DEFAULT_STAGE_SEED) {
          const createdStage = await tx.fundraisingPipelineStage.create({
            data: {
              campaignId: campaign.id,
              stageCode: stage.stageCode,
              stageName: stage.stageName,
              sortOrder: stage.sortOrder,
              winProbabilityPct: stage.winProbabilityPct,
              gateRules: stage.gateRules ?? undefined,
            },
          });
          stagePairs.push({ stageId: createdStage.id, checklist: stage.checklist });
        }

        return { campaign, stagePairs };
      },
      { timeout: 15000 }
    );

    for (const { stageId, checklist } of stagePairs) {
      for (let i = 0; i < checklist.length; i++) {
        const item = checklist[i];
        await prisma.fundraisingStageChecklistTemplate.create({
          data: {
            stageId,
            itemKey: item.itemKey,
            label: item.label,
            sortOrder: i,
            isRequired: item.isRequired,
          },
        });
      }
    }

    return FundraisingCampaignService.get(campaign.id);
  }

  static async update(
    campaignId: string,
    body: Partial<{
      name: string;
      targetCapital: number;
      primaryCurrency: string;
      startDate: string;
      closeDate: string;
      regionTags: string[];
      status: string;
    }>
  ) {
    await FundraisingCampaignService.get(campaignId);
    const data: any = {};
    if (body.name != null) data.name = body.name;
    if (body.targetCapital != null) data.targetCapital = body.targetCapital;
    if (body.primaryCurrency != null) {
      data.primaryCurrency = FundraisingFxService.normalizeCurrency(body.primaryCurrency);
    }
    if (body.startDate != null) data.startDate = new Date(body.startDate);
    if (body.closeDate != null) data.closeDate = new Date(body.closeDate);
    if (body.regionTags != null) data.regionTags = body.regionTags;
    if (body.status != null) data.status = body.status;

    await prisma.fundraisingCampaign.update({ where: { id: campaignId }, data });
    return FundraisingCampaignService.get(campaignId);
  }
}
