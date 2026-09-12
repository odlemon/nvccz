// @ts-nocheck
import { prisma } from "../../utils/database";
import { FundraisingIrError } from "./FundraisingIrError";

const SIGNED_COMMITMENT_STATUSES = [
  "SIGNED",
  "ACCEPTED",
  "ADMITTED_AT_CLOSE",
  "PARTIALLY_FUNDED",
  "FUNDED",
];

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

async function findDuplicateInvestor(legalName: string, registrationNumber?: string | null) {
  const reg = String(registrationNumber || "").trim();
  if (reg) {
    const byReg = await prisma.investorOrganisation.findFirst({
      where: { registrationNumber: reg },
      select: { id: true, legalName: true, registrationNumber: true },
    });
    if (byReg) return { field: "registrationNumber", existingId: byReg.id };
  }

  const byName = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM investor_organisations WHERE LOWER(legal_name) = LOWER(?) LIMIT 1`,
    legalName
  );
  if (byName[0]?.id) return { field: "legalName", existingId: byName[0].id };
  return null;
}

function throwDuplicateInvestor(field: string, existingId: string) {
  const err = FundraisingIrError.conflict(
    "Investor organisation already exists",
    "DUPLICATE_INVESTOR"
  );
  err.field = field;
  err.existingId = existingId;
  throw err;
}

async function enrichInvestorListItems(items: any[]) {
  if (!items.length) return [];

  const investorIds = items.map((i) => i.id);
  const ownerIds = [...new Set(items.map((i) => i.relationshipOwnerId).filter(Boolean))];

  const placeholders = investorIds.map(() => "?").join(", ");
  const signedStatusPlaceholders = SIGNED_COMMITMENT_STATUSES.map(() => "?").join(", ");

  const [commitmentRows, openOppRows, lastCommRows, owners] = await Promise.all([
    prisma.$queryRawUnsafe<
      Array<{ investor_id: string; cnt: bigint; total_signed: unknown; currency: string | null }>
    >(
      `SELECT investor_id,
              COUNT(*) AS cnt,
              COALESCE(SUM(commitment_amount), 0) AS total_signed,
              MAX(currency) AS currency
       FROM fundraising_commitments
       WHERE investor_id IN (${placeholders})
         AND (signed_at IS NOT NULL OR status IN (${signedStatusPlaceholders}))
       GROUP BY investor_id`,
      ...investorIds,
      ...SIGNED_COMMITMENT_STATUSES
    ),
    prisma.fundraisingOpportunity.groupBy({
      by: ["investorId"],
      where: { investorId: { in: investorIds }, status: "OPEN" },
      _count: { _all: true },
    }),
    prisma.$queryRawUnsafe<Array<{ investor_id: string; last_contact_at: Date | null }>>(
      `SELECT investor_id, MAX(occurred_at) AS last_contact_at
       FROM fundraising_communications
       WHERE investor_id IN (${placeholders})
       GROUP BY investor_id`,
      ...investorIds
    ),
    ownerIds.length
      ? prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [],
  ]);

  const commitmentByInvestor = new Map(
    commitmentRows.map((r) => [
      r.investor_id,
      {
        count: Number(r.cnt ?? 0),
        totalSigned: Number(r.total_signed ?? 0),
        currency: r.currency || null,
      },
    ])
  );
  const openOppByInvestor = new Map(openOppRows.map((r) => [r.investorId, r._count._all]));
  const lastCommByInvestor = new Map(
    lastCommRows.map((r) => [r.investor_id, r.last_contact_at ? new Date(r.last_contact_at) : null])
  );
  const ownerById = new Map(owners.map((u) => [u.id, ownerDisplayName(u)]));

  return items.map((item) => {
    const commitmentsSummary = commitmentByInvestor.get(item.id) || {
      count: 0,
      totalSigned: 0,
      currency: item.baseCurrency || "USD",
    };
    if (!commitmentsSummary.currency) {
      commitmentsSummary.currency = item.baseCurrency || "USD";
    }

    const commLast = lastCommByInvestor.get(item.id);
    const investorLast = item.lastInteractionAt ? new Date(item.lastInteractionAt) : null;
    let lastContactAt: Date | null = null;
    if (commLast && investorLast) lastContactAt = commLast > investorLast ? commLast : investorLast;
    else lastContactAt = commLast || investorLast;

    return {
      ...item,
      estimatedAum: item.estimatedAum,
      commitmentsSummary,
      openOpportunities: openOppByInvestor.get(item.id) ?? 0,
      lastContactAt,
      relationshipOwnerName: item.relationshipOwnerId
        ? ownerById.get(item.relationshipOwnerId) ?? null
        : null,
    };
  });
}

export class FundraisingIrInvestorService {
  static async list({
    q,
    status,
    investorType,
    country,
    countryCode,
    jurisdiction,
    kycStatus,
    sanctionsStatus,
    riskRating,
    investorClassification,
    campaignId,
    relationshipOwnerId,
    ownerId,
    minAum,
    maxAum,
    page = 1,
    pageSize = 25,
  }: {
    q?: string;
    status?: string;
    investorType?: string;
    country?: string;
    countryCode?: string;
    jurisdiction?: string;
    kycStatus?: string;
    sanctionsStatus?: string;
    riskRating?: string;
    investorClassification?: string;
    campaignId?: string;
    relationshipOwnerId?: string;
    ownerId?: string;
    minAum?: number | string;
    maxAum?: number | string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const take = Math.min(Math.max(Number(pageSize) || 25, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where: any = {};

    if (status) where.status = status;
    if (investorType) where.investorType = investorType;
    if (jurisdiction) where.jurisdiction = jurisdiction;
    if (kycStatus) where.kycStatus = kycStatus;
    if (sanctionsStatus) where.sanctionsStatus = sanctionsStatus;
    if (riskRating) where.riskRating = riskRating;
    if (investorClassification) where.investorClassification = investorClassification;

    const resolvedCountry = countryCode || country;
    if (resolvedCountry) where.countryCode = resolvedCountry;

    const resolvedOwner = relationshipOwnerId || ownerId;
    if (resolvedOwner) where.relationshipOwnerId = resolvedOwner;

    const minAumNum = toNum(minAum);
    const maxAumNum = toNum(maxAum);
    if (minAumNum != null || maxAumNum != null) {
      where.estimatedAum = {};
      if (minAumNum != null) where.estimatedAum.gte = minAumNum;
      if (maxAumNum != null) where.estimatedAum.lte = maxAumNum;
    }

    if (campaignId) {
      where.opportunities = { some: { campaignId } };
    }

    if (q) {
      where.OR = [
        { legalName: { contains: q } },
        { tradingName: { contains: q } },
        { registrationNumber: { contains: q } },
      ];
    }

    const [rawItems, total] = await Promise.all([
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

    const items = await enrichInvestorListItems(rawItems);

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

    const registrationNumber =
      body.registrationNumber != null ? String(body.registrationNumber).trim() : null;
    const duplicate = await findDuplicateInvestor(legalName, registrationNumber);
    if (duplicate) throwDuplicateInvestor(duplicate.field, duplicate.existingId);

    const created = await prisma.investorOrganisation.create({
      data: {
        legalName,
        tradingName: body.tradingName ?? null,
        investorType,
        registrationNumber: registrationNumber || null,
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

  static async patchContact(investorId: string, contactId: string, body: any) {
    await FundraisingIrInvestorService.get(investorId);
    const existing = await prisma.investorContact.findFirst({
      where: { id: contactId, investorId },
    });
    if (!existing) throw FundraisingIrError.notFound("Contact not found", "CONTACT_NOT_FOUND");

    if (body.isPrimary) {
      await prisma.investorContact.updateMany({
        where: { investorId, isPrimary: true, id: { not: contactId } },
        data: { isPrimary: false },
      });
    }

    const data: any = {};
    const fields = [
      "fullName",
      "roleTitle",
      "department",
      "email",
      "phone",
      "decisionInfluence",
      "communicationConsent",
      "isPrimary",
      "nextAction",
      "status",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.nextActionDate !== undefined) {
      data.nextActionDate = body.nextActionDate ? new Date(body.nextActionDate) : null;
    }
    if (body.lastInteractionAt !== undefined) {
      data.lastInteractionAt = body.lastInteractionAt ? new Date(body.lastInteractionAt) : null;
    }

    return prisma.investorContact.update({ where: { id: contactId }, data });
  }

  static async archiveContact(investorId: string, contactId: string) {
    await FundraisingIrInvestorService.get(investorId);
    const existing = await prisma.investorContact.findFirst({
      where: { id: contactId, investorId },
    });
    if (!existing) throw FundraisingIrError.notFound("Contact not found", "CONTACT_NOT_FOUND");

    return prisma.investorContact.update({
      where: { id: contactId },
      data: {
        status: "ARCHIVED",
        isPrimary: false,
      },
    });
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
