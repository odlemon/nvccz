// @ts-nocheck
import { prisma } from "../../utils/database";
import { FundraisingIrError } from "./FundraisingIrError";
import { FundraisingFeGapsService } from "./FundraisingFeGapsService";
import { FundraisingFxService } from "./FundraisingFxService";

const PE_FUND_REQUIRED = new Set([
  "PE_FUNDRAISE",
  "VC_FUNDRAISE",
  "CO_INVESTMENT",
  "SPV",
  "CONTINUATION_VEHICLE",
]);

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ownerDisplayName(user: { firstName?: string; lastName?: string } | null | undefined): string | null {
  if (!user) return null;
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return name || null;
}

async function withOwnerName<T extends { campaignOwnerId?: string | null }>(campaign: T): Promise<T & { campaignOwnerName: string | null }> {
  if (!campaign.campaignOwnerId) return { ...campaign, campaignOwnerName: null };
  const owner = await prisma.user.findUnique({
    where: { id: campaign.campaignOwnerId },
    select: { firstName: true, lastName: true },
  });
  return { ...campaign, campaignOwnerName: ownerDisplayName(owner) };
}

async function withOwnerNames<T extends { campaignOwnerId?: string | null }>(campaigns: T[]): Promise<Array<T & { campaignOwnerName: string | null }>> {
  const ownerIds = [...new Set(campaigns.map((c) => c.campaignOwnerId).filter(Boolean))] as string[];
  const owners = ownerIds.length
    ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const ownerById = new Map(owners.map((u) => [u.id, ownerDisplayName(u)]));
  return campaigns.map((c) => ({
    ...c,
    campaignOwnerName: c.campaignOwnerId ? ownerById.get(c.campaignOwnerId) ?? null : null,
  }));
}

export class FundraisingIrCampaignService {
  static async list(filters: { campaignType?: string; status?: string; fundId?: string } = {}) {
    const where: any = {};
    if (filters.campaignType) where.campaignType = filters.campaignType;
    if (filters.status) where.status = filters.status;
    if (filters.fundId) where.fundId = filters.fundId;
    const campaigns = await prisma.fundraisingCampaign.findMany({
      where,
      include: {
        fund: { select: { id: true, name: true } },
        _count: { select: { stages: true, opportunities: true, deals: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return withOwnerNames(campaigns);
  }

  static async get(campaignId: string) {
    const campaign = await prisma.fundraisingCampaign.findUnique({
      where: { id: campaignId },
      include: {
        fund: { select: { id: true, name: true, status: true } },
        stages: {
          orderBy: { sortOrder: "asc" },
          include: { checklistTemplates: { orderBy: { sortOrder: "asc" } } },
        },
        glMapping: true,
        _count: { select: { opportunities: true, deals: true } },
      },
    });
    if (!campaign) throw FundraisingIrError.notFound("Campaign not found", "CAMPAIGN_NOT_FOUND");
    return withOwnerName(campaign);
  }

  static async create(userId: string, body: any) {
    const campaignType = String(body?.campaignType || "PE_FUNDRAISE").trim().toUpperCase();
    const name = String(body?.name || "").trim();
    if (!name) throw FundraisingIrError.badRequest("name is required", "VALIDATION_ERROR");

    const targetCapital = toNum(body.targetCapital ?? body.targetAmount);
    if (targetCapital == null || targetCapital <= 0) {
      throw FundraisingIrError.badRequest("targetCapital is required and must be > 0", "VALIDATION_ERROR");
    }

    const fundId = body.fundId ?? null;
    if (PE_FUND_REQUIRED.has(campaignType) && !fundId) {
      throw FundraisingIrError.badRequest("fundId is required for PE/VC campaign types", "FUND_REQUIRED");
    }
    if (fundId) {
      const fund = await prisma.fund.findUnique({ where: { id: fundId } });
      if (!fund) throw FundraisingIrError.notFound("Fund not found", "FUND_NOT_FOUND");
    }

    const startDate = body.startDate;
    const closeDate = body.closeDate;
    if (!startDate || !closeDate) {
      throw FundraisingIrError.badRequest("startDate and closeDate are required", "VALIDATION_ERROR");
    }

    const currency = FundraisingFxService.normalizeCurrency(
      body.primaryCurrency || body.currency || "USD"
    );
    const seed = await FundraisingFeGapsService.getSeedStagesForCampaignType(campaignType);

    const { campaign, stagePairs } = await prisma.$transaction(
      async (tx) => {
        const campaign = await tx.fundraisingCampaign.create({
          data: {
            fundId,
            productId: body.productId ?? null,
            campaignType,
            name,
            description: body.description ?? null,
            targetCapital,
            minimumTargetAmount: toNum(body.minimumTargetAmount),
            hardCapAmount: toNum(body.hardCapAmount),
            primaryCurrency: currency,
            startDate: new Date(startDate),
            closeDate: new Date(closeDate),
            firstCloseTargetDate: body.firstCloseTargetDate ? new Date(body.firstCloseTargetDate) : null,
            finalCloseTargetDate: body.finalCloseTargetDate ? new Date(body.finalCloseTargetDate) : null,
            regionTags: body.regionTags ?? body.segments?.regions ?? [],
            investorSegments: body.investorSegments ?? body.segments ?? undefined,
            status: "DRAFT",
            approvalStatus: "PENDING",
            campaignOwnerId: body.campaignOwnerId ?? body.ownerId ?? userId,
            createdById: userId,
          },
        });

        if (fundId) {
          await tx.fundraisingCampaignGlMapping.create({
            data: { campaignId: campaign.id },
          });
        }

        const stagePairs: Array<{ stageId: string; checklist: typeof seed[number]["checklist"] }> = [];
        for (const stage of seed) {
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
      { timeout: 30000 }
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

    return FundraisingIrCampaignService.get(campaign.id);
  }

  static async update(campaignId: string, body: any) {
    await FundraisingIrCampaignService.get(campaignId);
    const data: any = {};
    if (body.name != null) data.name = body.name;
    if (body.description !== undefined) data.description = body.description;
    if (body.campaignType != null) data.campaignType = String(body.campaignType).toUpperCase();
    if (body.productId !== undefined) data.productId = body.productId;
    if (body.fundId !== undefined) data.fundId = body.fundId;
    if (body.targetCapital != null || body.targetAmount != null) {
      data.targetCapital = toNum(body.targetCapital ?? body.targetAmount);
    }
    if (body.minimumTargetAmount !== undefined) data.minimumTargetAmount = toNum(body.minimumTargetAmount);
    if (body.hardCapAmount !== undefined) data.hardCapAmount = toNum(body.hardCapAmount);
    if (body.primaryCurrency != null || body.currency != null) {
      data.primaryCurrency = FundraisingFxService.normalizeCurrency(body.primaryCurrency || body.currency);
    }
    if (body.startDate != null) data.startDate = new Date(body.startDate);
    if (body.closeDate != null) data.closeDate = new Date(body.closeDate);
    if (body.firstCloseTargetDate !== undefined) {
      data.firstCloseTargetDate = body.firstCloseTargetDate ? new Date(body.firstCloseTargetDate) : null;
    }
    if (body.finalCloseTargetDate !== undefined) {
      data.finalCloseTargetDate = body.finalCloseTargetDate ? new Date(body.finalCloseTargetDate) : null;
    }
    if (body.regionTags != null) data.regionTags = body.regionTags;
    if (body.investorSegments != null || body.segments != null) {
      data.investorSegments = body.investorSegments ?? body.segments;
    }
    if (body.campaignOwnerId != null || body.ownerId != null) {
      data.campaignOwnerId = body.campaignOwnerId ?? body.ownerId;
    }
    if (body.status != null) data.status = body.status;
    if (body.approvalStatus != null) data.approvalStatus = body.approvalStatus;

    await prisma.fundraisingCampaign.update({ where: { id: campaignId }, data });
    return FundraisingIrCampaignService.get(campaignId);
  }

  static async activate(campaignId: string, _userId: string) {
    const campaign = await FundraisingIrCampaignService.get(campaignId);
    const unmet: string[] = [];

    if (!campaign.targetCapital || Number(campaign.targetCapital) <= 0) {
      unmet.push("targetCapital required");
    }
    if (!campaign.startDate) unmet.push("startDate required");
    if (!campaign.closeDate) unmet.push("closeDate required");
    if (!campaign.stages || campaign.stages.length < 1) {
      unmet.push("pipeline configured: at least one stage required");
    }
    if (!campaign.campaignOwnerId) {
      unmet.push("campaign owner / team assigned required");
    }
    if (PE_FUND_REQUIRED.has(String(campaign.campaignType || "").toUpperCase()) && !campaign.fundId) {
      unmet.push("fundId / product link required for PE/VC campaign types");
    }
    if (String(campaign.approvalStatus || "").toUpperCase() === "REJECTED") {
      unmet.push("compliance approval must not be REJECTED");
    }
    if (campaign.activationApprovalId) {
      const approval = await prisma.fundraisingApprovalRequest.findUnique({
        where: { id: campaign.activationApprovalId },
        select: { status: true },
      });
      if (String(approval?.status || "").toUpperCase() !== "APPROVED") {
        unmet.push("campaign activation approval must be APPROVED");
      }
    }

    if (unmet.length) {
      throw FundraisingIrError.badRequest("Campaign cannot be activated", "ACTIVATION_REQUIREMENTS_UNMET", {
        unmet,
      });
    }

    await prisma.fundraisingCampaign.update({
      where: { id: campaignId },
      data: {
        status: "ACTIVE",
        approvalStatus: "APPROVED",
      },
    });
    return FundraisingIrCampaignService.get(campaignId);
  }
}
