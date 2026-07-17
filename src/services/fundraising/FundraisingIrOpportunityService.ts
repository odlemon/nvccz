// @ts-nocheck
import { prisma } from "../../utils/database";
import { FundraisingIrError } from "./FundraisingIrError";

export const AMOUNT_FIELDS: Record<string, string> = {
  indicativeAmount: "INDICATIVE",
  qualifiedAmount: "QUALIFIED",
  softCircleAmount: "SOFT_CIRCLE",
  proposedAmount: "PROPOSED",
  signedAmount: "SIGNED",
  admittedAmount: "ADMITTED",
  fundedAmount: "FUNDED",
  expectedAum: "EXPECTED_AUM",
  activatedAum: "ACTIVATED_AUM",
};

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function decEq(a: unknown, b: unknown): boolean {
  const na = toNum(a);
  const nb = toNum(b);
  if (na == null && nb == null) return true;
  if (na == null || nb == null) return false;
  return Math.abs(na - nb) < 1e-9;
}

function hasPositive(v: unknown): boolean {
  const n = toNum(v);
  return n != null && n > 0;
}

export class FundraisingIrOpportunityService {
  static async list(filters: {
    campaignId?: string;
    investorId?: string;
    status?: string;
    stageCode?: string;
    ownerId?: string;
  } = {}) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.status) where.status = filters.status;
    if (filters.ownerId) where.opportunityOwnerId = filters.ownerId;
    if (filters.stageCode) {
      where.currentStage = { stageCode: filters.stageCode };
    }

    return prisma.fundraisingOpportunity.findMany({
      where,
      include: {
        investor: { select: { id: true, legalName: true, investorType: true, status: true } },
        currentStage: true,
        campaign: { select: { id: true, name: true, campaignType: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async get(id: string) {
    const opp = await prisma.fundraisingOpportunity.findUnique({
      where: { id },
      include: {
        investor: {
          include: { contacts: { where: { status: "ACTIVE" }, take: 20 } },
        },
        currentStage: { include: { checklistTemplates: { orderBy: { sortOrder: "asc" } } } },
        campaign: {
          select: {
            id: true,
            name: true,
            campaignType: true,
            status: true,
            primaryCurrency: true,
            fundId: true,
          },
        },
        amountHistory: { orderBy: { changedAt: "desc" }, take: 25 },
        stageHistory: { orderBy: { changedAt: "desc" }, take: 25 },
      },
    });
    if (!opp) throw FundraisingIrError.notFound("Opportunity not found", "OPPORTUNITY_NOT_FOUND");
    return opp;
  }

  static async create(userId: string, body: any) {
    const campaignId = body?.campaignId;
    const investorId = body?.investorId;
    const opportunityType = String(body?.opportunityType || "").trim();
    if (!campaignId) throw FundraisingIrError.badRequest("campaignId is required", "VALIDATION_ERROR");
    if (!investorId) throw FundraisingIrError.badRequest("investorId is required", "VALIDATION_ERROR");
    if (!opportunityType) throw FundraisingIrError.badRequest("opportunityType is required", "VALIDATION_ERROR");

    const campaign = await prisma.fundraisingCampaign.findUnique({
      where: { id: campaignId },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    if (!campaign) throw FundraisingIrError.notFound("Campaign not found", "CAMPAIGN_NOT_FOUND");
    if (campaign.status !== "ACTIVE") {
      throw FundraisingIrError.badRequest("Campaign must be ACTIVE to create opportunities", "CAMPAIGN_NOT_ACTIVE");
    }

    const investor = await prisma.investorOrganisation.findUnique({ where: { id: investorId } });
    if (!investor) throw FundraisingIrError.notFound("Investor organisation not found", "INVESTOR_NOT_FOUND");

    const firstStage = campaign.stages[0];
    if (!firstStage) {
      throw FundraisingIrError.badRequest("Campaign has no pipeline stages", "NO_STAGES");
    }

    const amountData: any = {};
    const amountHistoryRows: Array<{ amountType: string; newValue: number }> = [];
    for (const [field, amountType] of Object.entries(AMOUNT_FIELDS)) {
      if (body[field] !== undefined && body[field] !== null && body[field] !== "") {
        const n = toNum(body[field]);
        amountData[field] = n;
        if (n != null) amountHistoryRows.push({ amountType, newValue: n });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const opp = await tx.fundraisingOpportunity.create({
        data: {
          campaignId,
          investorId,
          primaryContactId: body.primaryContactId ?? null,
          currentStageId: firstStage.id,
          opportunityType,
          opportunityCurrency: body.opportunityCurrency || campaign.primaryCurrency || "USD",
          ...amountData,
          stageProbability: firstStage.winProbabilityPct,
          confidenceAdjustment: toNum(body.confidenceAdjustment) ?? 1,
          expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null,
          opportunityOwnerId: body.opportunityOwnerId || userId,
          priority: body.priority || "MEDIUM",
          status: "OPEN",
          source: body.source ?? null,
          consultantName: body.consultantName ?? null,
          placementAgentName: body.placementAgentName ?? null,
          notes: body.notes ?? null,
          createdById: userId,
        },
      });

      for (const row of amountHistoryRows) {
        await tx.opportunityAmountHistory.create({
          data: {
            opportunityId: opp.id,
            amountType: row.amountType,
            oldValue: null,
            newValue: row.newValue,
            currency: opp.opportunityCurrency,
            reason: body.amountReason || "Initial amount on create",
            changedById: userId,
          },
        });
      }

      await tx.opportunityStageHistory.create({
        data: {
          opportunityId: opp.id,
          fromStageId: null,
          toStageId: firstStage.id,
          fromStageCode: null,
          toStageCode: firstStage.stageCode,
          reason: body.stageReason || "Opportunity created",
          changedById: userId,
          gateResult: { passed: true, softPass: true },
        },
      });

      return opp;
    }, { timeout: 20000 });

    // Seed outside interactive tx — avoids timeout under concurrent login sync load
    await FundraisingIrOpportunityService.seedChecklistForStage(prisma, created.id, firstStage.id);

    return FundraisingIrOpportunityService.get(created.id);
  }

  static async update(userId: string, id: string, body: any) {
    const existing = await FundraisingIrOpportunityService.get(id);
    const data: any = {};
    const scalarFields = [
      "primaryContactId",
      "opportunityType",
      "opportunityCurrency",
      "priority",
      "source",
      "consultantName",
      "placementAgentName",
      "notes",
      "status",
    ];
    for (const f of scalarFields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.confidenceAdjustment !== undefined) data.confidenceAdjustment = toNum(body.confidenceAdjustment);
    if (body.expectedCloseDate !== undefined) {
      data.expectedCloseDate = body.expectedCloseDate ? new Date(body.expectedCloseDate) : null;
    }
    if (body.opportunityOwnerId !== undefined) data.opportunityOwnerId = body.opportunityOwnerId;

    const amountChanges: Array<{
      field: string;
      amountType: string;
      oldValue: any;
      newValue: number | null;
    }> = [];

    for (const [field, amountType] of Object.entries(AMOUNT_FIELDS)) {
      if (body[field] !== undefined) {
        const newValue = body[field] === null || body[field] === "" ? null : toNum(body[field]);
        if (!decEq(existing[field], newValue)) {
          amountChanges.push({
            field,
            amountType,
            oldValue: existing[field],
            newValue,
          });
          data[field] = newValue;
        }
      }
    }

    if (amountChanges.length && !body.reason && !body.amountReason) {
      throw FundraisingIrError.badRequest(
        "reason (or amountReason) is required when changing opportunity amounts",
        "VALIDATION_ERROR"
      );
    }

    if (!Object.keys(data).length && !amountChanges.length) {
      return existing;
    }

    await prisma.fundraisingOpportunity.update({ where: { id }, data });
    for (const change of amountChanges) {
      await prisma.opportunityAmountHistory.create({
        data: {
          opportunityId: id,
          amountType: change.amountType,
          oldValue: change.oldValue,
          newValue: change.newValue,
          currency: data.opportunityCurrency || existing.opportunityCurrency,
          reason: body.reason || body.amountReason || `Updated ${change.field}`,
          changedById: userId,
        },
      });
    }

    return FundraisingIrOpportunityService.get(id);
  }

  static evaluateGates(toStage: any, opportunity: any, investor: any): string[] {
    const unmet: string[] = [];
    const rules = (toStage?.gateRules || {}) as Record<string, unknown>;
    if (!rules || typeof rules !== "object") return unmet;

    if (rules.requiresIndicativeAmount) {
      if (!hasPositive(opportunity.indicativeAmount) && !hasPositive(opportunity.qualifiedAmount) && !hasPositive(opportunity.expectedAum)) {
        unmet.push("requiresIndicativeAmount: indicativeAmount, qualifiedAmount, or expectedAum required");
      }
    }
    if (rules.requiresSoftCircle) {
      if (!hasPositive(opportunity.softCircleAmount)) {
        unmet.push("requiresSoftCircle: softCircleAmount required");
      }
    }
    if (rules.requiresProposed) {
      if (!hasPositive(opportunity.proposedAmount)) {
        unmet.push("requiresProposed: proposedAmount required");
      }
    }
    if (rules.requiresSigned) {
      if (!hasPositive(opportunity.signedAmount)) {
        unmet.push("requiresSigned: signedAmount required");
      }
    }
    if (rules.requiresKycNotBlocked) {
      const kyc = String(investor?.kycStatus || "").toUpperCase();
      const sanctions = String(investor?.sanctionsStatus || "").toUpperCase();
      if (kyc === "REJECTED" || kyc === "EXPIRED") {
        unmet.push(`requiresKycNotBlocked: investor kycStatus is ${kyc}`);
      }
      if (sanctions === "BLOCKED" || sanctions === "FAILED") {
        unmet.push(`requiresKycNotBlocked: investor sanctionsStatus is ${sanctions}`);
      }
    }
    return unmet;
  }

  static async getIncompleteRequiredChecklist(
    tx: any,
    opportunityId: string,
    stageId: string
  ): Promise<string[]> {
    const incomplete = await tx.fundraisingOpportunityChecklistItem.findMany({
      where: { opportunityId, stageId, isRequired: true, isComplete: false },
      select: { itemKey: true, label: true },
    });
    return incomplete.map(
      (i: any) => `requiresPreviousStageChecklist: ${i.itemKey} (${i.label}) incomplete`
    );
  }

  static async checkComplianceBlocked(investorId: string): Promise<string[]> {
    const unmet: string[] = [];
    const investor = await prisma.investorOrganisation.findUnique({ where: { id: investorId } });
    if (!investor) return ["investor not found"];

    const kyc = String(investor.kycStatus || "").toUpperCase();
    const sanctions = String(investor.sanctionsStatus || "").toUpperCase();
    if (investor.complianceHoldActive) {
      const hold = await prisma.fundraisingComplianceHold.findFirst({
        where: { investorId, status: "ACTIVE" },
        orderBy: { placedAt: "desc" },
      });
      unmet.push(
        hold
          ? `compliance: active hold ${hold.id} — ${hold.reason}`
          : "compliance: investor is on hold"
      );
    }
    if (kyc === "REJECTED" || kyc === "EXPIRED") {
      unmet.push(`compliance: investor kycStatus is ${kyc}`);
    }
    if (sanctions === "BLOCKED" || sanctions === "FAILED") {
      unmet.push(`compliance: investor sanctionsStatus is ${sanctions}`);
    }

    const openKyc = await prisma.fundraisingKycCase.findFirst({
      where: {
        investorId,
        status: { notIn: ["APPROVED", "CLOSED", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (openKyc && !String(openKyc.status).toUpperCase().startsWith("APPROVED")) {
      unmet.push(`compliance: open KYC case ${openKyc.id} status ${openKyc.status}`);
    }

    return unmet;
  }

  static isComplianceSensitiveStage(stageCode: string): boolean {
    const code = String(stageCode || "").toUpperCase();
    return ["ADMITTED", "FUNDED", "ACTIVATED", "ASSETS_IN_TRANSITION"].includes(code);
  }

  static async seedChecklistForStage(db: any, opportunityId: string, stageId: string) {
    const templates = await db.fundraisingStageChecklistTemplate.findMany({
      where: { stageId },
      orderBy: { sortOrder: "asc" },
    });
    if (!templates.length) return;
    for (const tpl of templates) {
      const existing = await db.fundraisingOpportunityChecklistItem.findFirst({
        where: { opportunityId, stageId, itemKey: tpl.itemKey },
        select: { id: true },
      });
      if (existing) continue;
      await db.fundraisingOpportunityChecklistItem.create({
        data: {
          opportunityId,
          stageId,
          itemKey: tpl.itemKey,
          label: tpl.label,
          isRequired: tpl.isRequired,
          isComplete: false,
        },
      });
    }
  }

  static async transition(
    userId: string,
    id: string,
    body: { toStageId?: string; toStageCode?: string; reason?: string }
  ) {
    const opp = await FundraisingIrOpportunityService.get(id);
    if (opp.status !== "OPEN") {
      throw FundraisingIrError.badRequest("Only OPEN opportunities can transition stages", "NOT_OPEN");
    }

    const stages = await prisma.fundraisingPipelineStage.findMany({
      where: { campaignId: opp.campaignId },
      orderBy: { sortOrder: "asc" },
    });

    let toStage = null as any;
    if (body.toStageId) {
      toStage = stages.find((s) => s.id === body.toStageId);
    } else if (body.toStageCode) {
      toStage = stages.find((s) => s.stageCode === String(body.toStageCode).toUpperCase());
    }
    if (!toStage) throw FundraisingIrError.badRequest("Target stage not found", "STAGE_NOT_FOUND");

    const fromStage = stages.find((s) => s.id === opp.currentStageId);
    const movingForward = !fromStage || toStage.sortOrder > fromStage.sortOrder;

    let unmetRequirements: string[] = [];
    if (movingForward) {
      unmetRequirements = FundraisingIrOpportunityService.evaluateGates(toStage, opp, opp.investor);

      if (FundraisingIrOpportunityService.isComplianceSensitiveStage(toStage.stageCode)) {
        const complianceUnmet = await FundraisingIrOpportunityService.checkComplianceBlocked(opp.investorId);
        unmetRequirements.push(...complianceUnmet);
      }

      if (fromStage) {
        const toRules = (toStage.gateRules || {}) as Record<string, unknown>;
        if (toRules.requiresPreviousStageChecklist) {
          const checklistUnmet = await FundraisingIrOpportunityService.getIncompleteRequiredChecklist(
            prisma,
            id,
            fromStage.id
          );
          unmetRequirements.push(...checklistUnmet);
        }
      }
    }

    if (unmetRequirements.length) {
      throw FundraisingIrError.badRequest("Stage gate requirements not met", "STAGE_GATE_FAILED", {
        unmetRequirements,
      });
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.fundraisingOpportunity.update({
          where: { id },
          data: {
            currentStageId: toStage.id,
            stageProbability: toStage.winProbabilityPct,
          },
        });
        await tx.opportunityStageHistory.create({
          data: {
            opportunityId: id,
            fromStageId: fromStage?.id ?? opp.currentStageId,
            toStageId: toStage.id,
            fromStageCode: fromStage?.stageCode ?? opp.currentStage?.stageCode ?? null,
            toStageCode: toStage.stageCode,
            reason: body.reason || null,
            changedById: userId,
            gateResult: { passed: true, movingForward },
          },
        });
      },
      { timeout: 20000 }
    );

    if (movingForward) {
      await FundraisingIrOpportunityService.seedChecklistForStage(prisma, id, toStage.id);
    }

    return FundraisingIrOpportunityService.get(id);
  }

  static async assign(userId: string, id: string, body: { opportunityOwnerId: string }) {
    if (!body?.opportunityOwnerId) {
      throw FundraisingIrError.badRequest("opportunityOwnerId is required", "VALIDATION_ERROR");
    }
    await FundraisingIrOpportunityService.get(id);
    await prisma.fundraisingOpportunity.update({
      where: { id },
      data: { opportunityOwnerId: body.opportunityOwnerId },
    });
    // touch history via notes-less stage history is overkill; amount history not applicable
    void userId;
    return FundraisingIrOpportunityService.get(id);
  }

  static async markLost(userId: string, id: string, body: { lostReason?: string }) {
    await FundraisingIrOpportunityService.get(id);
    await prisma.fundraisingOpportunity.update({
      where: { id },
      data: {
        status: "LOST",
        lostReason: body?.lostReason || null,
      },
    });
    void userId;
    return FundraisingIrOpportunityService.get(id);
  }

  static async timeline(id: string) {
    await FundraisingIrOpportunityService.get(id);
    const [amounts, stages] = await Promise.all([
      prisma.opportunityAmountHistory.findMany({
        where: { opportunityId: id },
        orderBy: { changedAt: "asc" },
      }),
      prisma.opportunityStageHistory.findMany({
        where: { opportunityId: id },
        orderBy: { changedAt: "asc" },
      }),
    ]);

    const events = [
      ...amounts.map((a) => ({
        type: "AMOUNT" as const,
        at: a.changedAt,
        ...a,
      })),
      ...stages.map((s) => ({
        type: "stage" as const,
        at: s.changedAt,
        ...s,
      })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return { opportunityId: id, events };
  }
}
