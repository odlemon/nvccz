// @ts-nocheck
import { prisma } from "../../utils/database";
import { FundraisingChecklistService } from "./FundraisingChecklistService";
import { FundraisingFxService } from "./FundraisingFxService";
import { FundraisingStageGateService } from "./FundraisingStageGateService";
import { FundraisingCloseService } from "./FundraisingCloseService";

export class FundraisingDealService {
  static async get(dealId: string) {
    const deal = await prisma.fundraisingPipelineDeal.findUnique({
      where: { id: dealId },
      include: {
        stage: true,
        campaign: { include: { fund: { select: { id: true, name: true } } } },
        checklistItems: true,
        agreement: true,
        client: { select: { id: true, legalName: true, investorId: true, email: true } },
      },
    });
    if (!deal) throw Object.assign(new Error("Deal not found"), { statusCode: 404 });
    return deal;
  }

  static async create(
    campaignId: string,
    userId: string,
    body: {
      prospectName: string;
      prospectEmail?: string;
      prospectPhone?: string;
      prospectCountry?: string;
      prospectType?: string;
      proposedAmount: number;
      currencyCode?: string;
      priority?: string;
      notes?: string;
      stageCode?: string;
    }
  ) {
    const campaign = await prisma.fundraisingCampaign.findUnique({
      where: { id: campaignId },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    if (!campaign) throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });

    const stage =
      campaign.stages.find((s) => s.stageCode === (body.stageCode || "PROSPECT")) ||
      campaign.stages[0];
    if (!stage) throw Object.assign(new Error("No pipeline stages configured"), { statusCode: 400 });

    const currency = FundraisingFxService.normalizeCurrency(body.currencyCode || campaign.primaryCurrency);
    const fxRate = await FundraisingFxService.resolveRate(currency, campaign.primaryCurrency);

    const deal = await prisma.fundraisingPipelineDeal.create({
      data: {
        campaignId,
        stageId: stage.id,
        prospectName: body.prospectName,
        prospectEmail: body.prospectEmail,
        prospectPhone: body.prospectPhone,
        prospectCountry: body.prospectCountry || "ZW",
        prospectType: body.prospectType || "institutional",
        proposedAmount: body.proposedAmount,
        currencyCode: currency,
        fxRateAtCreation: fxRate,
        priority: body.priority || "MEDIUM",
        notes: body.notes,
        createdById: userId,
      },
    });

    await FundraisingChecklistService.seedForDeal(deal.id, stage.id);
    return FundraisingDealService.get(deal.id);
  }

  static async update(
    dealId: string,
    body: Partial<{
      prospectName: string;
      prospectEmail: string;
      prospectPhone: string;
      prospectCountry: string;
      prospectType: string;
      proposedAmount: number;
      currencyCode: string;
      priority: string;
      notes: string;
    }>
  ) {
    await FundraisingDealService.get(dealId);
    const data: any = {};
    if (body.prospectName != null) data.prospectName = body.prospectName;
    if (body.prospectEmail != null) data.prospectEmail = body.prospectEmail;
    if (body.prospectPhone != null) data.prospectPhone = body.prospectPhone;
    if (body.prospectCountry != null) data.prospectCountry = body.prospectCountry;
    if (body.prospectType != null) data.prospectType = body.prospectType;
    if (body.proposedAmount != null) data.proposedAmount = body.proposedAmount;
    if (body.currencyCode != null) data.currencyCode = FundraisingFxService.normalizeCurrency(body.currencyCode);
    if (body.priority != null) data.priority = body.priority;
    if (body.notes != null) data.notes = body.notes;

    await prisma.fundraisingPipelineDeal.update({ where: { id: dealId }, data });
    return FundraisingDealService.get(dealId);
  }

  static async moveStage(dealId: string, stageId: string, userId: string) {
    const { target } = await FundraisingStageGateService.validateMove(dealId, stageId);

    await prisma.fundraisingPipelineDeal.update({
      where: { id: dealId },
      data: { stageId: target.id },
    });

    await FundraisingChecklistService.seedForDeal(dealId, target.id);

    if (target.stageCode === "WON_SIGNED") {
      await FundraisingCloseService.closeDeal(dealId, userId);
    }

    return FundraisingDealService.get(dealId);
  }
}
