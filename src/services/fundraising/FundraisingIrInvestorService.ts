// @ts-nocheck
import { prisma } from "../../utils/database";
import { FundraisingIrError } from "./FundraisingIrError";

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export class FundraisingIrInvestorService {
  static async list({
    q,
    status,
    investorType,
    page = 1,
    pageSize = 25,
  }: {
    q?: string;
    status?: string;
    investorType?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const take = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where: any = {};
    if (status) where.status = status;
    if (investorType) where.investorType = investorType;
    if (q) {
      where.OR = [
        { legalName: { contains: q } },
        { tradingName: { contains: q } },
        { registrationNumber: { contains: q } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.investorOrganisation.findMany({
        where,
        include: {
          _count: { select: { contacts: true, opportunities: true } },
        },
        orderBy: { legalName: "asc" },
        skip,
        take,
      }),
      prisma.investorOrganisation.count({ where }),
    ]);

    return {
      items,
      page: Math.max(Number(page) || 1, 1),
      pageSize: take,
      total,
      totalPages: Math.ceil(total / take) || 1,
    };
  }

  static async get(id: string) {
    const investor = await prisma.investorOrganisation.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { fullName: "asc" }] },
        _count: { select: { opportunities: true, contacts: true } },
      },
    });
    if (!investor) throw FundraisingIrError.notFound("Investor organisation not found", "INVESTOR_NOT_FOUND");
    return investor;
  }

  static async create(userId: string, body: any) {
    const legalName = String(body?.legalName || "").trim();
    const investorType = String(body?.investorType || "").trim();
    if (!legalName) throw FundraisingIrError.badRequest("legalName is required", "VALIDATION_ERROR");
    if (!investorType) throw FundraisingIrError.badRequest("investorType is required", "VALIDATION_ERROR");

    const created = await prisma.investorOrganisation.create({
      data: {
        legalName,
        tradingName: body.tradingName ?? null,
        investorType,
        registrationNumber: body.registrationNumber ?? null,
        countryCode: body.countryCode ?? null,
        jurisdiction: body.jurisdiction ?? null,
        baseCurrency: body.baseCurrency ?? "USD",
        estimatedAum: toNum(body.estimatedAum),
        typicalMinimumTicket: toNum(body.typicalMinimumTicket),
        typicalMaximumTicket: toNum(body.typicalMaximumTicket),
        assetClassPreferences: body.assetClassPreferences ?? undefined,
        geographicInterests: body.geographicInterests ?? undefined,
        relationshipOwnerId: body.relationshipOwnerId ?? userId,
        source: body.source ?? null,
        status: body.status ?? "ACTIVE",
        kycStatus: body.kycStatus ?? "NOT_STARTED",
        sanctionsStatus: body.sanctionsStatus ?? "NOT_SCREENED",
        riskRating: body.riskRating ?? null,
        investorClassification: body.investorClassification ?? null,
        nextAction: body.nextAction ?? null,
        nextActionDate: body.nextActionDate ? new Date(body.nextActionDate) : null,
        notes: body.notes ?? null,
        createdById: userId,
      },
    });
    return FundraisingIrInvestorService.get(created.id);
  }

  static async update(id: string, body: any) {
    await FundraisingIrInvestorService.get(id);
    const data: any = {};
    const fields = [
      "legalName",
      "tradingName",
      "investorType",
      "registrationNumber",
      "countryCode",
      "jurisdiction",
      "baseCurrency",
      "relationshipOwnerId",
      "source",
      "status",
      "kycStatus",
      "sanctionsStatus",
      "riskRating",
      "investorClassification",
      "nextAction",
      "notes",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.estimatedAum !== undefined) data.estimatedAum = toNum(body.estimatedAum);
    if (body.typicalMinimumTicket !== undefined) data.typicalMinimumTicket = toNum(body.typicalMinimumTicket);
    if (body.typicalMaximumTicket !== undefined) data.typicalMaximumTicket = toNum(body.typicalMaximumTicket);
    if (body.assetClassPreferences !== undefined) data.assetClassPreferences = body.assetClassPreferences;
    if (body.geographicInterests !== undefined) data.geographicInterests = body.geographicInterests;
    if (body.nextActionDate !== undefined) {
      data.nextActionDate = body.nextActionDate ? new Date(body.nextActionDate) : null;
    }
    if (body.lastInteractionAt !== undefined) {
      data.lastInteractionAt = body.lastInteractionAt ? new Date(body.lastInteractionAt) : null;
    }

    await prisma.investorOrganisation.update({ where: { id }, data });
    return FundraisingIrInvestorService.get(id);
  }

  static async addContact(investorId: string, userId: string, body: any) {
    await FundraisingIrInvestorService.get(investorId);
    const fullName = String(body?.fullName || "").trim();
    if (!fullName) throw FundraisingIrError.badRequest("fullName is required", "VALIDATION_ERROR");

    if (body.isPrimary) {
      await prisma.investorContact.updateMany({
        where: { investorId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const contact = await prisma.investorContact.create({
      data: {
        investorId,
        fullName,
        roleTitle: body.roleTitle ?? null,
        department: body.department ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        decisionInfluence: body.decisionInfluence ?? null,
        communicationConsent: body.communicationConsent ?? true,
        isPrimary: Boolean(body.isPrimary),
        nextAction: body.nextAction ?? null,
        nextActionDate: body.nextActionDate ? new Date(body.nextActionDate) : null,
        status: body.status ?? "ACTIVE",
        createdById: userId,
      },
    });
    return contact;
  }

  static async relationshipSummary(investorId: string) {
    const investor = await FundraisingIrInvestorService.get(investorId);
    const opportunities = await prisma.fundraisingOpportunity.findMany({
      where: { investorId },
      include: {
        currentStage: true,
        campaign: { select: { id: true, name: true, campaignType: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const amountTotals = {
      indicativeAmount: 0,
      qualifiedAmount: 0,
      softCircleAmount: 0,
      proposedAmount: 0,
      signedAmount: 0,
      admittedAmount: 0,
      fundedAmount: 0,
      expectedAum: 0,
      activatedAum: 0,
    };
    const stages: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const opp of opportunities) {
      for (const key of Object.keys(amountTotals)) {
        amountTotals[key] += Number(opp[key] ?? 0);
      }
      const code = opp.currentStage?.stageCode || "UNKNOWN";
      stages[code] = (stages[code] || 0) + 1;
      byStatus[opp.status] = (byStatus[opp.status] || 0) + 1;
    }

    return {
      investor: {
        id: investor.id,
        legalName: investor.legalName,
        tradingName: investor.tradingName,
        investorType: investor.investorType,
        status: investor.status,
        kycStatus: investor.kycStatus,
        sanctionsStatus: investor.sanctionsStatus,
        relationshipOwnerId: investor.relationshipOwnerId,
      },
      contacts: investor.contacts,
      opportunityCount: opportunities.length,
      opportunityStatusCounts: byStatus,
      stageCounts: stages,
      amountTotals,
      opportunities: opportunities.map((o) => ({
        id: o.id,
        campaignId: o.campaignId,
        campaignName: o.campaign?.name,
        campaignType: o.campaign?.campaignType,
        opportunityType: o.opportunityType,
        status: o.status,
        stageCode: o.currentStage?.stageCode,
        stageName: o.currentStage?.stageName,
        indicativeAmount: o.indicativeAmount,
        qualifiedAmount: o.qualifiedAmount,
        softCircleAmount: o.softCircleAmount,
        proposedAmount: o.proposedAmount,
        signedAmount: o.signedAmount,
        admittedAmount: o.admittedAmount,
        fundedAmount: o.fundedAmount,
        expectedAum: o.expectedAum,
        activatedAum: o.activatedAum,
      })),
    };
  }
}
