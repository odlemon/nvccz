// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../../utils/database";
import { remoteUploadService } from "../RemoteUploadService";
import { FundraisingIrError } from "./FundraisingIrError";
import { FundraisingSrdService } from "./FundraisingSrdService";

const REPORT_CATALOG = [
  { reportKey: "pipeline-summary", label: "Pipeline summary", requiresCampaignId: true },
  { reportKey: "campaign-metrics", label: "Campaign metrics", requiresCampaignId: true },
  { reportKey: "funnel", label: "Pipeline funnel", requiresCampaignId: false },
  { reportKey: "pipeline-funnel", label: "Pipeline funnel (alias)", requiresCampaignId: false },
  { reportKey: "source", label: "Source analysis", requiresCampaignId: false },
  { reportKey: "source-analysis", label: "Source analysis (alias)", requiresCampaignId: false },
  { reportKey: "owner-performance", label: "Owner performance", requiresCampaignId: false },
  { reportKey: "stage-ageing", label: "Stage ageing", requiresCampaignId: false },
  { reportKey: "ddq-export", label: "DDQ case export", requiresCampaignId: false },
  { reportKey: "documents-export", label: "Documents index export", requiresCampaignId: false },
  { reportKey: "audit-export", label: "Audit log export", requiresCampaignId: false },
];

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sha256Hex(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function reqMeta(req?: any) {
  return {
    ipAddress: req?.ip || req?.headers?.["x-forwarded-for"] || null,
    device: req?.headers?.["user-agent"] || null,
    sessionId: req?.sessionID || req?.headers?.["x-session-id"] || null,
  };
}

function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\n");
}

function generateLinearMonthlyProjection(
  projectedSigned: number,
  closeDate?: Date | null
): Array<{ month: string; cumulativeSigned: number }> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  let end: Date;
  if (closeDate && closeDate > start) {
    end = new Date(closeDate);
  } else {
    end = new Date(start);
    end.setMonth(end.getMonth() + 12);
  }
  end.setDate(1);

  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (months.length === 0) months.push(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`);

  const step = projectedSigned / months.length;
  return months.map((month, i) => ({
    month,
    cumulativeSigned: Math.round(step * (i + 1) * 100) / 100,
  }));
}

function multerFileFromBuffer(buffer: Buffer, originalname: string, mimetype: string): Express.Multer.File {
  return {
    buffer,
    originalname,
    mimetype,
    size: buffer.length,
    fieldname: "file",
    encoding: "7bit",
    stream: undefined as any,
    destination: "",
    filename: originalname,
    path: "",
  } as Express.Multer.File;
}

async function executeReportSync(reportKey: string, filters: any = {}, format = "JSON") {
  if (reportKey === "ddq-export") {
    if (!filters?.caseId) throw FundraisingIrError.badRequest("caseId required", "VALIDATION_ERROR");
    return FundraisingRequirementsService.exportDdqCaseData(filters.caseId);
  }
  if (reportKey === "documents-export") {
    return FundraisingRequirementsService.buildDocumentsCsvRows(filters);
  }
  if (reportKey === "audit-export") {
    return FundraisingRequirementsService.exportAuditLogData(filters);
  }
  return FundraisingSrdService.runReport(reportKey, filters);
}

function extractJobStoredPayload(filtersJson: unknown) {
  const stored = (filtersJson as Record<string, unknown>) || {};
  const { _resultPayload, _artifactMeta, ...filters } = stored;
  return {
    filters,
    resultPayload: _resultPayload ?? null,
    artifactMeta: _artifactMeta ?? null,
  };
}

async function persistReportJobArtifact(
  jobId: string,
  reportKey: string,
  format: string,
  filters: any,
  result: any
) {
  const fmt = String(format || "JSON").toUpperCase();
  let artifactUrl: string | null = null;
  let artifactStoragePath: string | null = null;
  let resultPayload: unknown = result;
  let artifactMeta: Record<string, unknown> = {
    format: fmt,
    reportKey,
    generatedAt: new Date().toISOString(),
  };

  if (result?.csv && (fmt === "CSV" || reportKey.endsWith("-export"))) {
    const csvBuffer = Buffer.from(String(result.csv), "utf8");
    const uploaded = await remoteUploadService.uploadSingleFile(
      multerFileFromBuffer(csvBuffer, `${reportKey}-${jobId}.csv`, "text/csv"),
      "fundraising-reports"
    );
    artifactUrl = uploaded.downloadURL;
    artifactStoragePath = uploaded.filePath;
    artifactMeta = {
      ...artifactMeta,
      contentType: "text/csv",
      byteLength: csvBuffer.length,
      rowCount: Array.isArray(result.rows) ? result.rows.length : null,
      fileName: `${reportKey}-${jobId}.csv`,
    };
    resultPayload = {
      headers: result.headers ?? null,
      rowCount: Array.isArray(result.rows) ? result.rows.length : 0,
    };
  } else if (Array.isArray(result?.rows)) {
    artifactMeta.rowCount = result.rows.length;
    if (result.headers) artifactMeta.headers = result.headers;
  } else if (result && typeof result === "object") {
    artifactMeta.keys = Object.keys(result);
  }

  const completed = await prisma.fundraisingReportJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      artifactUrl,
      artifactStoragePath,
      errorMessage: null,
      filtersJson: {
        ...filters,
        _resultPayload: resultPayload,
        _artifactMeta: artifactMeta,
      },
    },
  });

  return { completed, resultPayload, artifactMeta, artifactUrl, artifactStoragePath };
}

function computeNextReportRunAt(cadence: string, from = new Date()): Date {
  const next = new Date(from);
  next.setHours(8, 0, 0, 0);
  switch (String(cadence || "MONTHLY").toUpperCase()) {
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "QUARTERLY":
      next.setMonth(next.getMonth() + 3);
      break;
    case "ANNUAL":
      next.setFullYear(next.getFullYear() + 1);
      break;
    case "MONTHLY":
    default:
      next.setMonth(next.getMonth() + 1);
      break;
  }
  return next;
}

async function ensureCampaign(campaignId: string) {
  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw FundraisingIrError.notFound("Campaign not found", "CAMPAIGN_NOT_FOUND");
  return campaign;
}

async function ensureRfp(rfpId: string) {
  const row = await prisma.fundraisingRfp.findUnique({ where: { id: rfpId } });
  if (!row) throw FundraisingIrError.notFound("RFP not found", "RFP_NOT_FOUND");
  return row;
}

async function ensureDdqCase(caseId: string) {
  const row = await prisma.fundraisingDdqCase.findUnique({ where: { id: caseId } });
  if (!row) throw FundraisingIrError.notFound("DDQ case not found", "DDQ_CASE_NOT_FOUND");
  return row;
}

async function ensureDataRoom(dataRoomId: string) {
  const row = await prisma.fundraisingDataRoom.findUnique({ where: { id: dataRoomId } });
  if (!row) throw FundraisingIrError.notFound("Data room not found", "DATA_ROOM_NOT_FOUND");
  return row;
}

async function ensureAgreement(agreementId: string) {
  const row = await prisma.fundraisingAgreement.findUnique({
    where: { id: agreementId },
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
      signatories: { orderBy: { sequenceOrder: "asc" } },
    },
  });
  if (!row) throw FundraisingIrError.notFound("Agreement not found", "AGREEMENT_NOT_FOUND");
  return row;
}

async function ensurePlacementAgent(agentId: string) {
  const row = await prisma.fundraisingPlacementAgent.findUnique({ where: { id: agentId } });
  if (!row) throw FundraisingIrError.notFound("Placement agent not found", "PLACEMENT_AGENT_NOT_FOUND");
  return row;
}

async function appendApprovalEvent(
  approvalId: string,
  eventType: string,
  actorId: string,
  notes?: string | null,
  payload?: unknown
) {
  if (!prisma.fundraisingApprovalEvent) return null;
  return prisma.fundraisingApprovalEvent.create({
    data: {
      approvalId,
      eventType,
      actorId,
      notes: notes ?? null,
      payloadJson: payload != null ? (payload as object) : undefined,
    },
  });
}

export class FundraisingRequirementsService {
  // ── Gap 10: global contacts index ─────────────────────────────

  static async listGlobalContacts(filters: {
    q?: string;
    investorId?: string;
    status?: string;
    decisionInfluence?: string;
    campaignId?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const take = Math.min(Math.max(Number(filters.pageSize) || 25, 1), 100);
    const page = Math.max(Number(filters.page) || 1, 1);
    const skip = (page - 1) * take;
    const where: any = {};

    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.status) where.status = filters.status;
    if (filters.decisionInfluence) where.decisionInfluence = filters.decisionInfluence;
    if (filters.q) {
      where.OR = [
        { fullName: { contains: filters.q } },
        { email: { contains: filters.q } },
        { phone: { contains: filters.q } },
        { roleTitle: { contains: filters.q } },
        { investor: { legalName: { contains: filters.q } } },
      ];
    }
    if (filters.campaignId) {
      where.investor = {
        opportunities: { some: { campaignId: filters.campaignId } },
      };
    }

    const [items, total] = await Promise.all([
      prisma.investorContact.findMany({
        where,
        include: {
          investor: {
            select: {
              id: true,
              legalName: true,
              investorType: true,
              status: true,
              relationshipOwnerId: true,
            },
          },
        },
        orderBy: [{ lastInteractionAt: "desc" }, { fullName: "asc" }],
        skip,
        take,
      }),
      prisma.investorContact.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize: take,
      total,
      totalPages: Math.ceil(total / take) || 1,
    };
  }

  // ── Gap 11: campaign templates / lists / events / materials ───

  static async listCampaignTemplates(campaignId: string) {
    await ensureCampaign(campaignId);
    return prisma.fundraisingCampaignTemplate.findMany({
      where: { campaignId },
      orderBy: { createdAt: "desc" },
    });
  }

  static async createCampaignTemplate(userId: string, campaignId: string, body: any, req?: any) {
    await ensureCampaign(campaignId);
    const name = String(body?.name || "").trim();
    if (!name) throw FundraisingIrError.badRequest("name is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingCampaignTemplate.create({
      data: {
        campaignId,
        name,
        templateType: body.templateType || "EMAIL",
        subject: body.subject ?? null,
        bodyHtml: body.bodyHtml ?? body.body ?? null,
        status: body.status || "DRAFT",
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_CAMPAIGN_TEMPLATE",
      "FundraisingCampaignTemplate",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async listCampaignDistributionLists(campaignId: string) {
    await ensureCampaign(campaignId);
    return prisma.fundraisingCampaignDistributionList.findMany({
      where: { campaignId },
      include: {
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async createCampaignDistributionList(userId: string, campaignId: string, body: any, req?: any) {
    await ensureCampaign(campaignId);
    const name = String(body?.name || "").trim();
    if (!name) throw FundraisingIrError.badRequest("name is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingCampaignDistributionList.create({
      data: {
        campaignId,
        name,
        segmentJson: body.segmentJson ?? body.segment ?? undefined,
        createdById: userId,
        members: body.members?.length
          ? {
              create: body.members.map((m: any) => ({
                investorId: m.investorId ?? null,
                contactId: m.contactId ?? null,
              })),
            }
          : undefined,
      },
      include: { members: true },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_CAMPAIGN_DISTRIBUTION_LIST",
      "FundraisingCampaignDistributionList",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async listCampaignEvents(campaignId: string) {
    await ensureCampaign(campaignId);
    return prisma.fundraisingCampaignEvent.findMany({
      where: { campaignId },
      orderBy: { startsAt: "asc" },
    });
  }

  static async createCampaignEvent(userId: string, campaignId: string, body: any, req?: any) {
    await ensureCampaign(campaignId);
    const title = String(body?.title || "").trim();
    if (!title) throw FundraisingIrError.badRequest("title is required", "VALIDATION_ERROR");
    if (!body?.startsAt) throw FundraisingIrError.badRequest("startsAt is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingCampaignEvent.create({
      data: {
        campaignId,
        title,
        eventType: body.eventType || "ROADSHOW",
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        location: body.location ?? null,
        status: body.status || "SCHEDULED",
        notes: body.notes ?? null,
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_CAMPAIGN_EVENT",
      "FundraisingCampaignEvent",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async listCampaignMaterials(campaignId: string) {
    await ensureCampaign(campaignId);
    return prisma.fundraisingCampaignMaterial.findMany({
      where: { campaignId },
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        _count: { select: { versions: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  static async createCampaignMaterial(userId: string, campaignId: string, body: any, file?: Express.Multer.File, req?: any) {
    await ensureCampaign(campaignId);
    const name = String(body?.name || "").trim();
    if (!name) throw FundraisingIrError.badRequest("name is required", "VALIDATION_ERROR");

    let versionData: any = undefined;
    if (file?.buffer) {
      const hash = sha256Hex(file.buffer);
      const uploaded = await remoteUploadService.uploadSingleFile(file, "fundraising-campaign-materials");
      versionData = {
        create: {
          versionNumber: 1,
          fileUrl: uploaded.downloadURL,
          storagePath: uploaded.filePath,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sha256: hash,
          uploadedById: userId,
        },
      };
    }

    const created = await prisma.fundraisingCampaignMaterial.create({
      data: {
        campaignId,
        name,
        category: body.category || "MARKETING",
        confidential: Boolean(body.confidential),
        createdById: userId,
        versions: versionData,
      },
      include: { versions: true },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_CAMPAIGN_MATERIAL",
      "FundraisingCampaignMaterial",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async submitCampaignForApproval(userId: string, campaignId: string, body: any, req?: any) {
    const campaign = await ensureCampaign(campaignId);
    if (String(campaign.status).toUpperCase() === "ACTIVE") {
      throw FundraisingIrError.conflict("Campaign is already active", "CAMPAIGN_ALREADY_ACTIVE");
    }

    const approval = await prisma.fundraisingApprovalRequest.create({
      data: {
        objectType: "CAMPAIGN",
        objectId: campaignId,
        requestType: body.requestType || "CAMPAIGN_ACTIVATION",
        status: "PENDING",
        requestedById: userId,
        reason: body.reason ?? null,
        amount: toNum(body.amount ?? campaign.targetCapital),
        currency: body.currency ?? campaign.primaryCurrency ?? "USD",
        payload: {
          campaignId,
          campaignName: campaign.name,
          campaignType: campaign.campaignType,
        },
      },
    });

    await appendApprovalEvent(approval.id, "SUBMITTED", userId, body.reason, { campaignId });

    const updated = await prisma.fundraisingCampaign.update({
      where: { id: campaignId },
      data: {
        approvalStatus: "PENDING",
        submittedForApprovalAt: new Date(),
        activationApprovalId: approval.id,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "SUBMIT_CAMPAIGN_FOR_APPROVAL",
      "FundraisingCampaign",
      campaignId,
      campaign,
      updated,
      body.reason,
      reqMeta(req)
    );

    return { campaign: updated, approval };
  }

  static async pauseCampaign(userId: string, campaignId: string, body: any, req?: any) {
    const campaign = await ensureCampaign(campaignId);
    if (String(campaign.status).toUpperCase() !== "ACTIVE") {
      throw FundraisingIrError.badRequest("Only ACTIVE campaigns can be paused", "VALIDATION_ERROR");
    }

    const updated = await prisma.fundraisingCampaign.update({
      where: { id: campaignId },
      data: {
        status: "PAUSED",
        pausedAt: new Date(),
        pausedById: userId,
        pauseReason: body.reason ?? body.pauseReason ?? null,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "PAUSE_CAMPAIGN",
      "FundraisingCampaign",
      campaignId,
      campaign,
      updated,
      body.reason,
      reqMeta(req)
    );
    return updated;
  }

  // ── Gap 12: RFP proposal versions + auto KYC on WON ─────────

  static async listRfpProposalVersions(rfpId: string) {
    await ensureRfp(rfpId);
    return prisma.fundraisingRfpProposalVersion.findMany({
      where: { rfpId },
      orderBy: { versionNumber: "desc" },
    });
  }

  static async createRfpProposalVersion(
    userId: string,
    rfpId: string,
    body: any,
    file?: Express.Multer.File,
    req?: any
  ) {
    await ensureRfp(rfpId);
    if (!file?.buffer) throw FundraisingIrError.badRequest("file required", "VALIDATION_ERROR");

    const latest = await prisma.fundraisingRfpProposalVersion.findFirst({
      where: { rfpId },
      orderBy: { versionNumber: "desc" },
    });
    const nextVersion = (latest?.versionNumber ?? 0) + 1;
    const hash = sha256Hex(file.buffer);
    const uploaded = await remoteUploadService.uploadSingleFile(file, "fundraising-rfp-proposals");

    const created = await prisma.fundraisingRfpProposalVersion.create({
      data: {
        rfpId,
        versionNumber: nextVersion,
        fileUrl: uploaded.downloadURL,
        storagePath: uploaded.filePath,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sha256: hash,
        status: body.status || "DRAFT",
        approvalRequestId: body.approvalRequestId ?? null,
        uploadedById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_RFP_PROPOSAL_VERSION",
      "FundraisingRfpProposalVersion",
      created.id,
      latest ?? null,
      created,
      body.reason,
      reqMeta(req)
    );
    return created;
  }

  static async ensureAutoKycOnRfpWon(userId: string, rfpId: string, body: any = {}, req?: any) {
    const rfp = await ensureRfp(rfpId);
    const outcome = String(body.outcome ?? rfp.outcome ?? "").toUpperCase();
    if (outcome !== "WON") {
      throw FundraisingIrError.badRequest("RFP outcome must be WON for auto KYC", "VALIDATION_ERROR");
    }

    let kycCase = null;
    if (rfp.onboardingKycCaseId) {
      kycCase = await prisma.fundraisingKycCase.findUnique({ where: { id: rfp.onboardingKycCaseId } });
    }
    if (!kycCase) {
      const open = await prisma.fundraisingKycCase.findFirst({
        where: { investorId: rfp.investorId, status: { in: ["OPEN", "IN_REVIEW", "PENDING_DOCS"] } },
        orderBy: { createdAt: "desc" },
      });
      kycCase =
        open ??
        (await prisma.fundraisingKycCase.create({
          data: {
            investorId: rfp.investorId,
            status: "OPEN",
            detailsJson: {
              source: "RFP_WON",
              rfpId,
              autoCreated: true,
            },
            ownerId: body.ownerId ?? userId,
            createdById: userId,
          },
        }));
    }

    const updatedRfp = await prisma.fundraisingRfp.update({
      where: { id: rfpId },
      data: {
        outcome: "WON",
        status: body.status ?? rfp.status,
        onboardingKycCaseId: kycCase.id,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "AUTO_KYC_ON_RFP_WON",
      "FundraisingRfp",
      rfpId,
      rfp,
      { ...updatedRfp, kycCaseId: kycCase.id },
      body.reason,
      reqMeta(req)
    );

    return { rfp: updatedRfp, kycCase };
  }

  // ── Gap 13: DDQ item patch / Q&A / answer library / comments ─

  static async patchDdqItem(userId: string, caseId: string, itemId: string, body: any, req?: any) {
    await ensureDdqCase(caseId);
    const existing = await prisma.fundraisingDdqItem.findFirst({ where: { id: itemId, caseId } });
    if (!existing) throw FundraisingIrError.notFound("DDQ item not found", "DDQ_ITEM_NOT_FOUND");

    const data: any = {};
    for (const f of ["category", "requirement", "status", "ownerId", "reviewerComments"]) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (Object.keys(data).length === 0) {
      throw FundraisingIrError.badRequest("No patch fields provided", "VALIDATION_ERROR");
    }

    const updated = await prisma.fundraisingDdqItem.update({ where: { id: itemId }, data });

    const items = await prisma.fundraisingDdqItem.findMany({ where: { caseId } });
    const complete = items.filter((i) => ["APPROVED", "SUBMITTED", "COMPLETE"].includes(String(i.status).toUpperCase())).length;
    const progressPct = items.length ? Math.round((complete / items.length) * 10000) / 100 : 0;
    await prisma.fundraisingDdqCase.update({ where: { id: caseId }, data: { progressPct } });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "PATCH_DDQ_ITEM",
      "FundraisingDdqItem",
      itemId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return updated;
  }

  static async listDdqQuestions(caseId: string, filters: { status?: string } = {}) {
    await ensureDdqCase(caseId);
    const where: any = { caseId };
    if (filters.status) where.status = filters.status;
    return prisma.fundraisingDdqQuestion.findMany({
      where,
      include: { replies: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
  }

  static async createDdqQuestion(userId: string, caseId: string, body: any, req?: any) {
    await ensureDdqCase(caseId);
    const questionText = String(body?.questionText || body?.question || "").trim();
    if (!questionText) throw FundraisingIrError.badRequest("questionText is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingDdqQuestion.create({
      data: {
        caseId,
        question: questionText,
        askedById: body.askedById ?? userId,
        status: body.status || "OPEN",
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_DDQ_QUESTION",
      "FundraisingDdqQuestion",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async listDdqAnswerLibrary(filters: { category?: string; q?: string; status?: string } = {}) {
    const where: any = {};
    if (filters.category) where.category = filters.category;
    if (filters.status) where.status = filters.status;
    if (filters.q) {
      where.OR = [
        { questionKey: { contains: filters.q } },
        { approvedAnswer: { contains: filters.q } },
      ];
    }
    return prisma.fundraisingDdqAnswerLibraryEntry.findMany({
      where,
      orderBy: [{ category: "asc" }, { questionKey: "asc" }],
    });
  }

  static async createDdqAnswerLibraryEntry(userId: string, body: any, req?: any) {
    const questionKey = String(body?.questionKey || "").trim();
    const approvedAnswer = String(body?.approvedAnswer || body?.answer || "").trim();
    if (!questionKey || !approvedAnswer) {
      throw FundraisingIrError.badRequest("questionKey and approvedAnswer are required", "VALIDATION_ERROR");
    }

    const created = await prisma.fundraisingDdqAnswerLibraryEntry.create({
      data: {
        questionKey,
        category: body.category ?? null,
        approvedAnswer,
        version: toNum(body.version) ?? 1,
        status: body.status || "APPROVED",
        approvedById: userId,
        approvedAt: new Date(),
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_DDQ_ANSWER_LIBRARY_ENTRY",
      "FundraisingDdqAnswerLibraryEntry",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async listDdqItemComments(caseId: string, itemId: string) {
    await ensureDdqCase(caseId);
    const item = await prisma.fundraisingDdqItem.findFirst({ where: { id: itemId, caseId } });
    if (!item) throw FundraisingIrError.notFound("DDQ item not found", "DDQ_ITEM_NOT_FOUND");

    return prisma.fundraisingDdqItemComment.findMany({
      where: { itemId },
      orderBy: { createdAt: "asc" },
    });
  }

  static async createDdqItemComment(userId: string, caseId: string, itemId: string, body: any, req?: any) {
    await FundraisingRequirementsService.listDdqItemComments(caseId, itemId);
    const commentText = String(body?.commentText || body?.comment || "").trim();
    if (!commentText) throw FundraisingIrError.badRequest("commentText is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingDdqItemComment.create({
      data: {
        itemId,
        authorId: userId,
        body: commentText,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_DDQ_ITEM_COMMENT",
      "FundraisingDdqItemComment",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async downloadDdqEvidence(caseId: string, itemId: string, evidenceId: string) {
    await ensureDdqCase(caseId);
    const item = await prisma.fundraisingDdqItem.findFirst({ where: { id: itemId, caseId } });
    if (!item) throw FundraisingIrError.notFound("DDQ item not found", "DDQ_ITEM_NOT_FOUND");

    const evidence = await prisma.fundraisingDdqItemEvidence.findFirst({
      where: { id: evidenceId, itemId },
    });
    const storagePath = evidence?.storagePath ?? (evidenceId === itemId ? item.evidenceStoragePath : null);
    const fileUrl = evidence?.fileUrl ?? (evidenceId === itemId ? item.evidenceUrl : null);
    if (!storagePath && !fileUrl) {
      throw FundraisingIrError.notFound("DDQ evidence not found", "DDQ_EVIDENCE_NOT_FOUND");
    }
    const buffer = await remoteUploadService.downloadFile(storagePath || fileUrl!);
    return {
      buffer,
      fileName: evidence?.fileName ?? `ddq-evidence-${evidenceId}`,
      mimeType: evidence?.mimeType ?? "application/octet-stream",
    };
  }

  static async exportDdqCaseData(caseId: string) {
    const ddqCase = await prisma.fundraisingDdqCase.findUnique({
      where: { id: caseId },
      include: {
        investor: { select: { legalName: true } },
        items: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!ddqCase) throw FundraisingIrError.notFound("DDQ case not found", "DDQ_CASE_NOT_FOUND");

    const headers = [
      "caseId",
      "caseTitle",
      "investor",
      "itemId",
      "category",
      "requirement",
      "status",
      "ownerId",
      "dueDate",
      "version",
      "evidenceUrl",
    ];
    const rows = ddqCase.items.map((item) => [
      ddqCase.id,
      ddqCase.title,
      ddqCase.investor?.legalName ?? "",
      item.id,
      item.category ?? "",
      item.requirement,
      item.status,
      item.ownerId ?? "",
      item.dueDate ? item.dueDate.toISOString().slice(0, 10) : "",
      item.version,
      item.evidenceUrl ?? "",
    ]);

    return { headers, rows, csv: buildCsv(headers, rows) };
  }

  // ── Gap 14: data room patch / revoke access ───────────────────

  static async patchDataRoom(userId: string, dataRoomId: string, body: any, req?: any) {
    const existing = await ensureDataRoom(dataRoomId);
    const data: any = {};
    for (const f of ["name", "status", "requiresMfa"]) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.expiresAt !== undefined) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (body.defaultWatermarkEnabled !== undefined) data.defaultWatermarkEnabled = Boolean(body.defaultWatermarkEnabled);
    if (body.defaultDownloadLimit !== undefined) data.defaultDownloadLimit = toNum(body.defaultDownloadLimit);

    if (Object.keys(data).length === 0) {
      throw FundraisingIrError.badRequest("No patch fields provided", "VALIDATION_ERROR");
    }

    const updated = await prisma.fundraisingDataRoom.update({ where: { id: dataRoomId }, data });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "PATCH_DATA_ROOM",
      "FundraisingDataRoom",
      dataRoomId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return updated;
  }

  static async revokeDataRoomAccess(userId: string, dataRoomId: string, accessId: string, body: any, req?: any) {
    await ensureDataRoom(dataRoomId);
    const access = await prisma.fundraisingDataRoomAccess.findFirst({
      where: { id: accessId, dataRoomId, revokedAt: null },
    });
    if (!access) throw FundraisingIrError.notFound("Active access grant not found", "ACCESS_NOT_FOUND");

    const updated = await prisma.fundraisingDataRoomAccess.update({
      where: { id: accessId },
      data: {
        revokedAt: new Date(),
        revokedById: userId,
        revokeReason: body.reason ?? body.revokeReason ?? null,
      },
    });

    await prisma.fundraisingDataRoomAccessLog.create({
      data: {
        dataRoomId,
        userId,
        action: "REVOKE_ACCESS",
        ipAddress: reqMeta(req).ipAddress,
        device: reqMeta(req).device,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "REVOKE_DATA_ROOM_ACCESS",
      "FundraisingDataRoomAccess",
      accessId,
      access,
      updated,
      body.reason,
      reqMeta(req)
    );
    return updated;
  }

  // ── Gap 15: document CSV helper + version metadata ───────────

  static async buildDocumentsCsvRows(filters: {
    campaignId?: string;
    investorId?: string;
    category?: string;
    sourceType?: string;
    q?: string;
  } = {}) {
    const where: any = { status: { not: "ARCHIVED" } };
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.category) where.category = filters.category;
    if (filters.sourceType) where.sourceType = filters.sourceType;
    if (filters.q) where.name = { contains: filters.q };

    const docs = await prisma.fundraisingDocument.findMany({
      where,
      include: {
        campaign: { select: { name: true } },
        investor: { select: { legalName: true } },
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    });

    const headers = [
      "documentId",
      "name",
      "category",
      "sourceType",
      "campaign",
      "investor",
      "status",
      "confidential",
      "currentVersion",
      "fileName",
      "updatedAt",
    ];
    const rows = docs.map((d) => {
      const v = d.versions[0];
      return [
        d.id,
        d.name,
        d.category,
        d.sourceType,
        d.campaign?.name ?? "",
        d.investor?.legalName ?? "",
        d.status,
        d.confidential ? "yes" : "no",
        v?.versionNumber ?? d.currentVersionNumber ?? 1,
        v?.fileName ?? d.fileName ?? "",
        d.updatedAt.toISOString(),
      ];
    });

    return { headers, rows, csv: buildCsv(headers, rows) };
  }

  static async getDocumentVersionMetadata(documentId: string) {
    const doc = await prisma.fundraisingDocument.findUnique({
      where: { id: documentId },
      include: {
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });
    if (!doc) throw FundraisingIrError.notFound("Document not found", "DOCUMENT_NOT_FOUND");

    return {
      documentId: doc.id,
      name: doc.name,
      currentVersionNumber: doc.currentVersionNumber ?? doc.versions[0]?.versionNumber ?? null,
      versionCount: doc.versions.length,
      versions: doc.versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        fileName: v.fileName,
        mimeType: v.mimeType,
        sha256: v.sha256,
        status: v.status ?? "ACTIVE",
        changeNotes: v.changeNotes ?? null,
        uploadedById: v.uploadedById,
        uploadedAt: v.createdAt,
        downloadPath: `/api/fundraising/documents/${documentId}/download?version=${v.versionNumber}`,
      })),
    };
  }

  static async uploadDocumentVersion(
    userId: string,
    documentId: string,
    body: any,
    file: Express.Multer.File,
    req?: any
  ) {
    if (documentId.startsWith("dr-") || documentId.startsWith("agr-")) {
      throw FundraisingIrError.badRequest(
        "Virtual document — register via POST /documents before versioning",
        "VALIDATION_ERROR"
      );
    }
    if (!file?.buffer) throw FundraisingIrError.badRequest("file required", "VALIDATION_ERROR");

    const doc = await prisma.fundraisingDocument.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (!doc) throw FundraisingIrError.notFound("Document not found", "DOCUMENT_NOT_FOUND");

    const latest = doc.versions[0];
    const nextVersion = (latest?.versionNumber ?? doc.currentVersionNumber ?? 0) + 1;
    const hash = sha256Hex(file.buffer);
    const uploaded = await remoteUploadService.uploadSingleFile(file, "fundraising-documents");
    const fileName = file.originalname || body.fileName || doc.fileName || doc.name;
    const mimeType = file.mimetype ?? body.mimeType ?? null;

    const { version, document } = await prisma.$transaction(async (tx) => {
      const createdVersion = await tx.fundraisingDocumentVersion.create({
        data: {
          documentId,
          versionNumber: nextVersion,
          fileUrl: uploaded.downloadURL,
          storagePath: uploaded.filePath,
          fileName,
          mimeType,
          sha256: hash,
          changeNotes: body.changeNotes ?? body.notes ?? null,
          status: body.status || "ACTIVE",
          uploadedById: userId,
        },
      });

      const updatedDoc = await tx.fundraisingDocument.update({
        where: { id: documentId },
        data: {
          fileUrl: uploaded.downloadURL,
          storagePath: uploaded.filePath,
          fileName,
          mimeType,
          sha256: hash,
          currentVersionNumber: nextVersion,
        },
        include: {
          versions: { orderBy: { versionNumber: "desc" } },
        },
      });

      return { version: createdVersion, document: updatedDoc };
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "UPLOAD_DOCUMENT_VERSION",
      "FundraisingDocumentVersion",
      version.id,
      latest ?? null,
      version,
      body.reason,
      reqMeta(req)
    );

    return {
      ...version,
      document,
      download: await FundraisingRequirementsService.getDocumentVersionDownload(documentId, nextVersion),
    };
  }

  static async getDocumentVersionDownload(documentId: string, versionNumber?: number) {
    if (documentId.startsWith("dr-") || documentId.startsWith("agr-")) {
      throw FundraisingIrError.badRequest(
        "Virtual document — use source API or register via POST /documents",
        "VALIDATION_ERROR"
      );
    }

    const doc = await prisma.fundraisingDocument.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });
    if (!doc) throw FundraisingIrError.notFound("Document not found", "DOCUMENT_NOT_FOUND");

    const resolvedVersionNumber =
      versionNumber != null
        ? Number(versionNumber)
        : doc.currentVersionNumber ?? doc.versions[0]?.versionNumber ?? null;

    if (resolvedVersionNumber == null) {
      throw FundraisingIrError.badRequest("Document has no version to download", "VALIDATION_ERROR");
    }

    const version =
      doc.versions.find((v) => v.versionNumber === resolvedVersionNumber) ??
      (resolvedVersionNumber === 1 && !doc.versions.length
        ? {
            versionNumber: 1,
            fileName: doc.fileName,
            mimeType: doc.mimeType,
            sha256: doc.sha256,
            fileUrl: doc.fileUrl,
            storagePath: doc.storagePath,
            status: "ACTIVE",
          }
        : null);

    if (!version) {
      throw FundraisingIrError.notFound("Document version not found", "DOCUMENT_VERSION_NOT_FOUND");
    }

    const fileUrl = version.fileUrl ?? doc.fileUrl;
    const storagePath = version.storagePath ?? doc.storagePath;
    if (!fileUrl && !storagePath) {
      throw FundraisingIrError.badRequest("Document version has no file attached", "VALIDATION_ERROR");
    }

    return {
      documentId: doc.id,
      documentName: doc.name,
      versionNumber: resolvedVersionNumber,
      fileName: version.fileName ?? doc.fileName ?? doc.name,
      mimeType: version.mimeType ?? doc.mimeType ?? "application/octet-stream",
      sha256: version.sha256 ?? doc.sha256 ?? null,
      status: version.status ?? "ACTIVE",
      fileUrl,
      storagePath,
      downloadPath: `/api/fundraising/documents/${documentId}/download?version=${resolvedVersionNumber}`,
    };
  }

  // ── Gap 16: agreement send / decline / provider artifacts ─────

  static async sendAgreement(userId: string, agreementId: string, body: any, req?: any) {
    const agreement = await ensureAgreement(agreementId);
    const versionId = body.versionId || agreement.versions[0]?.id;
    if (!versionId) throw FundraisingIrError.badRequest("No agreement version to send", "VALIDATION_ERROR");

    const pendingSignatories = agreement.signatories.filter(
      (s) => s.versionId === versionId && String(s.status).toUpperCase() === "PENDING"
    );
    if (pendingSignatories.length === 0) {
      throw FundraisingIrError.badRequest("No pending signatories on selected version", "VALIDATION_ERROR");
    }

    const updated = await prisma.fundraisingAgreement.update({
      where: { id: agreementId },
      data: {
        status: "OUT_FOR_SIGNATURE",
        provider: body.provider ?? agreement.provider ?? "MANUAL",
        providerEnvelopeId: body.providerEnvelopeId ?? agreement.providerEnvelopeId ?? null,
        providerStatus: body.providerStatus ?? "SENT",
        sentAt: new Date(),
      },
    });

    await prisma.fundraisingAgreementSignatory.updateMany({
      where: { agreementId, versionId, status: "PENDING" },
      data: {
        invitedAt: new Date(),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "SEND_AGREEMENT",
      "FundraisingAgreement",
      agreementId,
      agreement,
      updated,
      body.reason,
      reqMeta(req)
    );
    return FundraisingRequirementsService.getAgreementProviderArtifact(agreementId);
  }

  static async declineAgreementSignatory(
    userId: string,
    agreementId: string,
    signatoryId: string,
    body: any,
    req?: any
  ) {
    const signatory = await prisma.fundraisingAgreementSignatory.findFirst({
      where: { id: signatoryId, agreementId },
    });
    if (!signatory) throw FundraisingIrError.notFound("Signatory not found", "SIGNATORY_NOT_FOUND");

    const updated = await prisma.fundraisingAgreementSignatory.update({
      where: { id: signatoryId },
      data: {
        status: "DECLINED",
        declinedAt: new Date(),
        declineReason: body.reason ?? body.declineReason ?? null,
      },
    });

    await prisma.fundraisingAgreement.update({
      where: { id: agreementId },
      data: { status: "DECLINED", providerStatus: "DECLINED" },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "DECLINE_AGREEMENT_SIGNATORY",
      "FundraisingAgreementSignatory",
      signatoryId,
      signatory,
      updated,
      body.reason,
      reqMeta(req)
    );
    return updated;
  }

  static async getAgreementProviderArtifact(agreementId: string, artifactId?: string) {
    const agreement = await ensureAgreement(agreementId);

    if (artifactId) {
      const artifact = await prisma.fundraisingAgreementProviderArtifact.findFirst({
        where: { id: artifactId, agreementId },
      });
      if (!artifact) throw FundraisingIrError.notFound("Provider artifact not found", "ARTIFACT_NOT_FOUND");
      return { agreement, artifact };
    }

    const artifacts = await prisma.fundraisingAgreementProviderArtifact.findMany({
      where: { agreementId },
      orderBy: { createdAt: "desc" },
    });

    const latestVersion = agreement.versions[0] ?? null;
    return {
      agreement: {
        id: agreement.id,
        title: agreement.title,
        status: agreement.status,
        provider: agreement.provider ?? "MANUAL",
        providerEnvelopeId: agreement.providerEnvelopeId ?? null,
        providerStatus: agreement.providerStatus ?? null,
        sentAt: agreement.sentAt ?? null,
      },
      latestVersion,
      signatories: agreement.signatories,
      artifacts,
    };
  }

  // ── Gap 17: compliance hold / release ─────────────────────────

  static async placeComplianceHold(userId: string, investorId: string, body: any, req?: any) {
    const investor = await prisma.investorOrganisation.findUnique({ where: { id: investorId } });
    if (!investor) throw FundraisingIrError.notFound("Investor organisation not found", "INVESTOR_NOT_FOUND");

    const active = await prisma.fundraisingComplianceHold.findFirst({
      where: { investorId, status: "ACTIVE" },
    });
    if (active) throw FundraisingIrError.conflict("Investor already has an active compliance hold", "HOLD_ALREADY_ACTIVE");

    const reason = String(body?.reason || "").trim();
    if (!reason) throw FundraisingIrError.badRequest("reason is required", "VALIDATION_ERROR");

    const hold = await prisma.$transaction(async (tx) => {
      const created = await tx.fundraisingComplianceHold.create({
        data: {
          investorId,
          status: "ACTIVE",
          reason,
          placedById: userId,
          placedAt: new Date(),
        },
      });
      await tx.investorOrganisation.update({
        where: { id: investorId },
        data: {
          complianceHoldActive: true,
          complianceHoldId: created.id,
        },
      });
      return created;
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "PLACE_COMPLIANCE_HOLD",
      "FundraisingComplianceHold",
      hold.id,
      null,
      hold,
      reason,
      reqMeta(req)
    );
    return hold;
  }

  static async releaseComplianceHold(userId: string, holdId: string, body: any, req?: any) {
    const hold = await prisma.fundraisingComplianceHold.findUnique({ where: { id: holdId } });
    if (!hold) throw FundraisingIrError.notFound("Compliance hold not found", "HOLD_NOT_FOUND");
    if (hold.status !== "ACTIVE") {
      throw FundraisingIrError.conflict("Hold is not active", "HOLD_NOT_ACTIVE");
    }

    const releaseReason = String(body?.releaseReason || body?.reason || "").trim();
    if (!releaseReason) throw FundraisingIrError.badRequest("releaseReason is required", "VALIDATION_ERROR");

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.fundraisingComplianceHold.update({
        where: { id: holdId },
        data: {
          status: "RELEASED",
          releasedById: userId,
          releasedAt: new Date(),
          releaseReason,
        },
      });
      await tx.investorOrganisation.update({
        where: { id: hold.investorId },
        data: {
          complianceHoldActive: false,
          complianceHoldId: null,
        },
      });
      return row;
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "RELEASE_COMPLIANCE_HOLD",
      "FundraisingComplianceHold",
      holdId,
      hold,
      updated,
      releaseReason,
      reqMeta(req)
    );
    return updated;
  }

  static async getActiveComplianceHold(investorId: string) {
    return prisma.fundraisingComplianceHold.findFirst({
      where: { investorId, status: "ACTIVE" },
      orderBy: { placedAt: "desc" },
    });
  }

  static async isInvestorComplianceBlocked(investorId: string) {
    const investor = await prisma.investorOrganisation.findUnique({
      where: { id: investorId },
      select: { complianceHoldActive: true, kycStatus: true, sanctionsStatus: true },
    });
    if (!investor) throw FundraisingIrError.notFound("Investor organisation not found", "INVESTOR_NOT_FOUND");

    const hold = investor.complianceHoldActive
      ? await FundraisingRequirementsService.getActiveComplianceHold(investorId)
      : null;

    const blocked =
      Boolean(investor.complianceHoldActive) ||
      ["BLOCKED", "REJECTED", "FAILED"].includes(String(investor.kycStatus || "").toUpperCase()) ||
      ["BLOCKED", "MATCH", "FAILED"].includes(String(investor.sanctionsStatus || "").toUpperCase());

    return { blocked, hold, kycStatus: investor.kycStatus, sanctionsStatus: investor.sanctionsStatus };
  }

  // ── Gap 18: placement exclusions + commission ledger ──────────

  static async listPlacementExclusions(filters: { agentId?: string; investorId?: string; status?: string } = {}) {
    const where: any = {};
    if (filters.agentId) where.agentId = filters.agentId;
    if (filters.investorId) where.investorId = filters.investorId;
    return prisma.fundraisingPlacementExclusion.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  static async createPlacementExclusion(userId: string, body: any, req?: any) {
    if (!body?.agentId) throw FundraisingIrError.badRequest("agentId is required", "VALIDATION_ERROR");
    await ensurePlacementAgent(body.agentId);

    const created = await prisma.fundraisingPlacementExclusion.create({
      data: {
        agentId: body.agentId,
        exclusionType:
          body.exclusionType ||
          (body.investorId ? "INVESTOR" : body.countryCode ? "COUNTRY" : "GEOGRAPHY"),
        investorId: body.investorId ?? null,
        countryCode: body.countryCode ?? null,
        geographyJson:
          body.geographyJson ??
          (body.geography != null ? [body.geography] : undefined),
        reason: body.reason ?? null,
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_PLACEMENT_EXCLUSION",
      "FundraisingPlacementExclusion",
      created.id,
      null,
      created,
      body.reason,
      reqMeta(req)
    );
    return created;
  }

  static async patchPlacementExclusion(userId: string, exclusionId: string, body: any, req?: any) {
    const existing = await prisma.fundraisingPlacementExclusion.findUnique({ where: { id: exclusionId } });
    if (!existing) throw FundraisingIrError.notFound("Placement exclusion not found", "EXCLUSION_NOT_FOUND");

    const data: any = {};
    for (const f of ["exclusionType", "investorId", "countryCode", "reason"]) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.geographyJson !== undefined || body.geography !== undefined) {
      data.geographyJson =
        body.geographyJson ?? (body.geography != null ? [body.geography] : null);
    }
    const updated = await prisma.fundraisingPlacementExclusion.update({ where: { id: exclusionId }, data });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "PATCH_PLACEMENT_EXCLUSION",
      "FundraisingPlacementExclusion",
      exclusionId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return updated;
  }

  static async deletePlacementExclusion(userId: string, exclusionId: string, req?: any) {
    const existing = await prisma.fundraisingPlacementExclusion.findUnique({ where: { id: exclusionId } });
    if (!existing) throw FundraisingIrError.notFound("Placement exclusion not found", "EXCLUSION_NOT_FOUND");

    await prisma.fundraisingPlacementExclusion.delete({ where: { id: exclusionId } });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "DELETE_PLACEMENT_EXCLUSION",
      "FundraisingPlacementExclusion",
      exclusionId,
      existing,
      null,
      null,
      reqMeta(req)
    );
    return { id: exclusionId, deleted: true };
  }

  static async unassignPlacementOpportunity(userId: string, assignmentId: string, body: any, req?: any) {
    const assignment = await prisma.fundraisingPlacementAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw FundraisingIrError.notFound("Placement assignment not found", "ASSIGNMENT_NOT_FOUND");
    if (assignment.unassignedAt) {
      throw FundraisingIrError.conflict("Assignment already unassigned", "ALREADY_UNASSIGNED");
    }

    const updated = await prisma.fundraisingPlacementAssignment.update({
      where: { id: assignmentId },
      data: {
        unassignedAt: new Date(),
        unassignedById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "UNASSIGN_PLACEMENT_OPPORTUNITY",
      "FundraisingPlacementAssignment",
      assignmentId,
      assignment,
      updated,
      body.reason,
      reqMeta(req)
    );
    return updated;
  }

  static async unassignPlacementOpportunityByAgent(
    userId: string,
    agentId: string,
    opportunityId: string,
    body: any,
    req?: any
  ) {
    const assignment = await prisma.fundraisingPlacementAssignment.findFirst({
      where: { agentId, opportunityId, unassignedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!assignment) {
      throw FundraisingIrError.notFound("Active placement assignment not found", "ASSIGNMENT_NOT_FOUND");
    }
    return FundraisingRequirementsService.unassignPlacementOpportunity(
      userId,
      assignment.id,
      body,
      req
    );
  }

  static async payOrHoldPlacementCommission(userId: string, agentId: string, body: any, req?: any) {
    const agent = await ensurePlacementAgent(agentId);
    const eventType = String(body?.eventType || body?.action || "").toUpperCase();
    if (!["PAY", "HOLD", "ACCRUE", "RELEASE_HOLD"].includes(eventType)) {
      throw FundraisingIrError.badRequest("eventType must be PAY, HOLD, ACCRUE, or RELEASE_HOLD", "VALIDATION_ERROR");
    }

    const amount = toNum(body.amount);
    if (amount == null || amount <= 0) {
      throw FundraisingIrError.badRequest("amount must be positive", "VALIDATION_ERROR");
    }

    const ledgerEntry = await prisma.fundraisingPlacementCommissionLedgerEntry.create({
      data: {
        agentId,
        opportunityId: body.opportunityId ?? null,
        commitmentId: body.commitmentId ?? null,
        eventType,
        amount,
        currency: body.currency || "USD",
        status: eventType === "PAY" ? "PAID" : eventType === "HOLD" ? "ON_HOLD" : "ACCRUED",
        paidAt: eventType === "PAY" ? new Date() : null,
        notes: body.notes ?? null,
        createdById: userId,
      },
    });

    const accruedDelta = eventType === "ACCRUE" || eventType === "RELEASE_HOLD" ? amount : 0;
    const paidDelta = eventType === "PAY" ? amount : 0;
    const commissionStatus =
      eventType === "HOLD" ? "ON_HOLD" : eventType === "PAY" ? "PAID" : agent.commissionStatus || "ACCRUING";

    const updatedAgent = await prisma.fundraisingPlacementAgent.update({
      where: { id: agentId },
      data: {
        accruedCommission: { increment: accruedDelta },
        paidCommission: { increment: paidDelta },
        commissionStatus,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "PLACEMENT_COMMISSION_LEDGER",
      "FundraisingPlacementCommissionLedgerEntry",
      ledgerEntry.id,
      agent,
      { ledgerEntry, agent: updatedAgent },
      body.notes,
      reqMeta(req)
    );

    return { ledgerEntry, agent: updatedAgent };
  }

  static async payPlacementCommissionEntry(
    userId: string,
    agentId: string,
    commissionId: string,
    body: any,
    req?: any
  ) {
    const existing = await prisma.fundraisingPlacementCommissionLedgerEntry.findFirst({
      where: { id: commissionId, agentId },
    });
    if (!existing) {
      throw FundraisingIrError.notFound("Commission entry not found", "COMMISSION_NOT_FOUND");
    }
    return FundraisingRequirementsService.payOrHoldPlacementCommission(
      userId,
      agentId,
      {
        ...body,
        eventType: body.eventType ?? body.action ?? "PAY",
        amount: body.amount ?? existing.amount,
        currency: body.currency ?? existing.currency,
        opportunityId: body.opportunityId ?? existing.opportunityId,
        commitmentId: body.commitmentId ?? existing.commitmentId,
      },
      req
    );
  }

  // ── Gap 20: report catalog / jobs / schedules / history ───────

  static getReportCatalog() {
    return REPORT_CATALOG;
  }

  static async listReportJobs(filters: { reportKey?: string; status?: string; limit?: number } = {}) {
    const where: any = {};
    if (filters.reportKey) where.reportKey = filters.reportKey;
    if (filters.status) where.status = filters.status;
    const jobs = await prisma.fundraisingReportJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(filters.limit) || 100, 500),
    });

    return jobs.map((job) => {
      const { filters: cleanFilters, artifactMeta } = extractJobStoredPayload(job.filtersJson);
      return {
        ...job,
        filtersJson: cleanFilters,
        artifactMeta,
      };
    });
  }

  static async getReportJob(jobId: string) {
    const job = await prisma.fundraisingReportJob.findUnique({ where: { id: jobId } });
    if (!job) throw FundraisingIrError.notFound("Report job not found", "REPORT_JOB_NOT_FOUND");

    const { filters, resultPayload, artifactMeta } = extractJobStoredPayload(job.filtersJson);
    return {
      job: {
        ...job,
        filtersJson: filters,
      },
      resultPayload,
      artifactMeta,
      artifactUrl: job.artifactUrl ?? null,
      artifactStoragePath: job.artifactStoragePath ?? null,
    };
  }

  static async createReportJob(userId: string, body: any, req?: any) {
    const reportKey = String(body?.reportKey || "").trim();
    if (!reportKey) throw FundraisingIrError.badRequest("reportKey is required", "VALIDATION_ERROR");

    const catalogEntry = REPORT_CATALOG.find((r) => r.reportKey === reportKey);
    if (!catalogEntry) throw FundraisingIrError.notFound(`Unknown report: ${reportKey}`, "REPORT_NOT_FOUND");
    if (catalogEntry.requiresCampaignId && !body.filters?.campaignId) {
      throw FundraisingIrError.badRequest("campaignId required for this report", "VALIDATION_ERROR");
    }

    const format = body.format || (reportKey.endsWith("-export") ? "CSV" : "JSON");
    const filters = body.filters ?? {};

    const job = await prisma.fundraisingReportJob.create({
      data: {
        reportKey,
        status: "RUNNING",
        filtersJson: filters,
        format,
        triggeredById: userId,
        startedAt: new Date(),
        scheduleId: body.scheduleId ?? null,
      },
    });

    try {
      const result = await executeReportSync(reportKey, filters, format);
      const persisted = await persistReportJobArtifact(job.id, reportKey, format, filters, result);

      if (body.scheduleId) {
        await prisma.fundraisingReportRun.create({
          data: {
            scheduleId: body.scheduleId,
            jobId: job.id,
            reportKey,
            status: "COMPLETED",
            runAt: persisted.completed.completedAt ?? new Date(),
            artifactUrl: persisted.artifactUrl,
          },
        });
      }

      await FundraisingSrdService.logAudit(
        { id: userId },
        "CREATE_REPORT_JOB",
        "FundraisingReportJob",
        job.id,
        null,
        persisted.completed,
        null,
        reqMeta(req)
      );

      return {
        job: {
          ...persisted.completed,
          filtersJson: filters,
        },
        resultPayload: persisted.resultPayload,
        artifactMeta: persisted.artifactMeta,
        result,
      };
    } catch (err: any) {
      await prisma.fundraisingReportJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: err?.message || "Report job failed",
        },
      });
      throw err;
    }
  }

  static async listReportSchedules(filters: { reportKey?: string; isActive?: boolean } = {}) {
    const where: any = {};
    if (filters.reportKey) where.reportKey = filters.reportKey;
    if (filters.isActive != null) where.isActive = Boolean(filters.isActive);
    return prisma.fundraisingReportSchedule.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  static async createReportSchedule(userId: string, body: any, req?: any) {
    const reportKey = String(body?.reportKey || "").trim();
    const name = String(body?.name || "").trim();
    if (!reportKey || !name) {
      throw FundraisingIrError.badRequest("reportKey and name are required", "VALIDATION_ERROR");
    }

    const cadence = String(body.cadence || "MONTHLY").toUpperCase();
    const created = await prisma.fundraisingReportSchedule.create({
      data: {
        reportKey,
        name,
        cadence,
        recipientsJson: body.recipientsJson ?? body.recipients ?? undefined,
        format: body.format || "CSV",
        filtersJson: body.filtersJson ?? body.filters ?? undefined,
        isActive: body.isActive !== false,
        nextRunAt: body.nextRunAt ? new Date(body.nextRunAt) : computeNextReportRunAt(cadence),
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_REPORT_SCHEDULE",
      "FundraisingReportSchedule",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async patchReportSchedule(userId: string, scheduleId: string, body: any, req?: any) {
    const existing = await prisma.fundraisingReportSchedule.findUnique({ where: { id: scheduleId } });
    if (!existing) throw FundraisingIrError.notFound("Report schedule not found", "SCHEDULE_NOT_FOUND");

    const data: any = {};
    for (const f of ["name", "cadence", "format", "isActive"]) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.recipientsJson !== undefined || body.recipients !== undefined) {
      data.recipientsJson = body.recipientsJson ?? body.recipients;
    }
    if (body.filtersJson !== undefined || body.filters !== undefined) {
      data.filtersJson = body.filtersJson ?? body.filters;
    }
    if (body.cadence !== undefined || body.nextRunAt !== undefined) {
      data.nextRunAt = body.nextRunAt
        ? new Date(body.nextRunAt)
        : computeNextReportRunAt(body.cadence ?? existing.cadence);
    }

    const updated = await prisma.fundraisingReportSchedule.update({ where: { id: scheduleId }, data });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "PATCH_REPORT_SCHEDULE",
      "FundraisingReportSchedule",
      scheduleId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return updated;
  }

  static async deleteReportSchedule(userId: string, scheduleId: string, req?: any) {
    const existing = await prisma.fundraisingReportSchedule.findUnique({ where: { id: scheduleId } });
    if (!existing) throw FundraisingIrError.notFound("Report schedule not found", "SCHEDULE_NOT_FOUND");

    const updated = await prisma.fundraisingReportSchedule.update({
      where: { id: scheduleId },
      data: { isActive: false },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "DELETE_REPORT_SCHEDULE",
      "FundraisingReportSchedule",
      scheduleId,
      existing,
      updated,
      null,
      reqMeta(req)
    );
    return updated;
  }

  static async listReportRunHistory(filters: { scheduleId?: string; reportKey?: string; limit?: number } = {}) {
    if (prisma.fundraisingReportRun) {
      const where: any = {};
      if (filters.scheduleId) where.scheduleId = filters.scheduleId;
      if (filters.reportKey) where.schedule = { reportKey: filters.reportKey };
      return prisma.fundraisingReportRun.findMany({
        where,
        include: {
          job: true,
          schedule: { select: { id: true, name: true, reportKey: true } },
        },
        orderBy: { runAt: "desc" },
        take: Math.min(Number(filters.limit) || 100, 500),
      });
    }

    const where: any = {};
    if (filters.scheduleId) where.scheduleId = filters.scheduleId;
    if (filters.reportKey) where.reportKey = filters.reportKey;
    return prisma.fundraisingReportJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(filters.limit) || 100, 500),
    });
  }

  // ── Gap 21: forecast recalculate + concentration / geography ──

  static async recalculateForecastScenario(userId: string, scenarioId: string, body: any, req?: any) {
    const scenario = await prisma.fundraisingForecastScenario.findUnique({
      where: { id: scenarioId },
      include: { campaign: { select: { closeDate: true } } },
    });
    if (!scenario) throw FundraisingIrError.notFound("Forecast scenario not found", "SCENARIO_NOT_FOUND");

    const assumptions = body.assumptionsJson ?? body.assumptions ?? scenario.assumptionsJson ?? {};
    const winRate = toNum((assumptions as any).winRate) ?? 0.35;

    const oppWhere: any = { campaignId: scenario.campaignId, status: "OPEN" };
    const opps = await prisma.fundraisingOpportunity.findMany({
      where: oppWhere,
      include: { currentStage: true },
    });

    let projectedSigned = 0;
    let projectedAum = 0;
    for (const o of opps) {
      const base =
        Number(o.proposedAmount ?? 0) ||
        Number(o.softCircleAmount ?? 0) ||
        Number(o.qualifiedAmount ?? 0) ||
        Number(o.indicativeAmount ?? 0);
      const prob = Number(o.stageProbability ?? o.currentStage?.winProbabilityPct ?? 0) / 100;
      projectedSigned += base * prob * winRate;
      projectedAum += Number(o.expectedAum ?? 0) * prob * winRate;
    }

    const projectedFees = toNum(body.projectedFees) ?? Number(scenario.projectedFees ?? projectedSigned * 0.02);
    const monthlyProjection =
      body.monthlyProjection ??
      generateLinearMonthlyProjection(projectedSigned, scenario.campaign?.closeDate ?? null);

    const assumptionHash = sha256Hex(Buffer.from(JSON.stringify({ assumptions, projectedSigned, projectedAum })));

    const updated = await prisma.fundraisingForecastScenario.update({
      where: { id: scenarioId },
      data: {
        assumptionsJson: assumptions,
        projectedSigned,
        projectedAum,
        projectedFees,
        monthlyProjection,
        recalculatedAt: new Date(),
        assumptionHash,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "RECALCULATE_FORECAST_SCENARIO",
      "FundraisingForecastScenario",
      scenarioId,
      scenario,
      updated,
      body.reason,
      reqMeta(req)
    );
    return updated;
  }

  static async analyticsConcentration(filters: { campaignId?: string; groupBy?: string } = {}) {
    const where: any = { status: { in: ["OPEN", "WON"] } };
    if (filters.campaignId) where.campaignId = filters.campaignId;

    const opps = await prisma.fundraisingOpportunity.findMany({
      where,
      include: {
        investor: {
          select: {
            id: true,
            legalName: true,
            investorType: true,
            estimatedAum: true,
            countryCode: true,
          },
        },
      },
    });

    const groupKey = String(filters.groupBy || "investorType").toLowerCase();
    const buckets: Record<string, { count: number; signedAmount: number; proposedAmount: number; investors: Set<string> }> =
      {};

    for (const o of opps) {
      let key = "UNKNOWN";
      if (groupKey === "investor") key = o.investor?.legalName || o.investorId;
      else if (groupKey === "country") key = o.investor?.countryCode || "UNKNOWN";
      else key = o.investor?.investorType || "UNKNOWN";

      if (!buckets[key]) buckets[key] = { count: 0, signedAmount: 0, proposedAmount: 0, investors: new Set() };
      buckets[key].count += 1;
      buckets[key].signedAmount += Number(o.signedAmount ?? 0);
      buckets[key].proposedAmount +=
        Number(o.proposedAmount ?? 0) ||
        Number(o.softCircleAmount ?? 0) ||
        Number(o.qualifiedAmount ?? 0) ||
        Number(o.indicativeAmount ?? 0);
      buckets[key].investors.add(o.investorId);
    }

    const totalSigned = Object.values(buckets).reduce((s, b) => s + b.signedAmount, 0);
    const rows = Object.entries(buckets)
      .map(([label, b]) => ({
        label,
        opportunityCount: b.count,
        investorCount: b.investors.size,
        signedAmount: Math.round(b.signedAmount * 100) / 100,
        proposedAmount: Math.round(b.proposedAmount * 100) / 100,
        signedPct: totalSigned > 0 ? Math.round((b.signedAmount / totalSigned) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.signedAmount - a.signedAmount);

    return { campaignId: filters.campaignId ?? null, groupBy: groupKey, totalSigned, rows };
  }

  static async analyticsGeography(filters: { campaignId?: string } = {}) {
    const where: any = { status: { in: ["OPEN", "WON"] } };
    if (filters.campaignId) where.campaignId = filters.campaignId;

    const opps = await prisma.fundraisingOpportunity.findMany({
      where,
      include: {
        investor: { select: { countryCode: true, geographicInterests: true, legalName: true } },
        campaign: { select: { regionTags: true } },
      },
    });

    const byCountry: Record<string, { count: number; amount: number }> = {};
    const interestHits: Record<string, number> = {};

    for (const o of opps) {
      const cc = o.investor?.countryCode || "UNKNOWN";
      if (!byCountry[cc]) byCountry[cc] = { count: 0, amount: 0 };
      byCountry[cc].count += 1;
      byCountry[cc].amount +=
        Number(o.signedAmount ?? 0) ||
        Number(o.proposedAmount ?? 0) ||
        Number(o.softCircleAmount ?? 0);

      const interests = Array.isArray(o.investor?.geographicInterests)
        ? o.investor.geographicInterests
        : [];
      for (const tag of interests) {
        const t = String(tag);
        interestHits[t] = (interestHits[t] || 0) + 1;
      }
    }

    return {
      campaignId: filters.campaignId ?? null,
      byCountry,
      byInvestorCountry: Object.entries(byCountry)
        .map(([countryCode, v]) => ({ countryCode, ...v }))
        .sort((a, b) => b.amount - a.amount),
      investorInterestTags: Object.entries(interestHits)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  // ── Gap 23: approval create + history ─────────────────────────

  static async createApprovalRequest(userId: string, body: any, req?: any) {
    if (!body?.objectType) throw FundraisingIrError.badRequest("objectType is required", "VALIDATION_ERROR");
    if (!body?.objectId) throw FundraisingIrError.badRequest("objectId is required", "VALIDATION_ERROR");
    if (!body?.requestType) throw FundraisingIrError.badRequest("requestType is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingApprovalRequest.create({
      data: {
        objectType: body.objectType,
        objectId: body.objectId,
        requestType: body.requestType,
        status: "PENDING",
        requestedById: userId,
        reason: body.reason ?? null,
        amount: toNum(body.amount),
        currency: body.currency ?? null,
        payload: body.payload ?? undefined,
      },
    });

    await appendApprovalEvent(created.id, "CREATED", userId, body.reason, body.payload);

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_APPROVAL_REQUEST",
      "FundraisingApprovalRequest",
      created.id,
      null,
      created,
      body.reason,
      reqMeta(req)
    );
    return created;
  }

  static async getApprovalHistory(approvalId: string) {
    const approval = await prisma.fundraisingApprovalRequest.findUnique({ where: { id: approvalId } });
    if (!approval) throw FundraisingIrError.notFound("Approval not found", "APPROVAL_NOT_FOUND");

    const events = prisma.fundraisingApprovalEvent
      ? await prisma.fundraisingApprovalEvent.findMany({
          where: { approvalId },
          orderBy: { createdAt: "asc" },
        })
      : [];

    return { approval, events };
  }

  // ── Gap 24: audit filter + export data ────────────────────────

  static async filterAuditLogs(filters: {
    objectType?: string;
    objectId?: string;
    userId?: string;
    action?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
    limit?: number;
  } = {}) {
    const where: any = {};
    if (filters.objectType) where.objectType = filters.objectType;
    if (filters.objectId) where.objectId = filters.objectId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.from || filters.to) {
      where.timestamp = {};
      if (filters.from) where.timestamp.gte = new Date(filters.from);
      if (filters.to) where.timestamp.lte = new Date(filters.to);
    }

    const take = Math.min(
      Math.max(Number(filters.pageSize ?? filters.limit) || 100, 1),
      500
    );
    const page = Math.max(Number(filters.page) || 1, 1);
    const skip = (page - 1) * take;

    const [items, total] = await Promise.all([
      prisma.fundraisingAuditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip,
        take,
      }),
      prisma.fundraisingAuditLog.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize: take,
      total,
      totalPages: Math.ceil(total / take) || 1,
    };
  }

  static async exportAuditLogData(filters: {
    objectType?: string;
    objectId?: string;
    userId?: string;
    action?: string;
    from?: string;
    to?: string;
    limit?: number;
  } = {}) {
    const result = await FundraisingRequirementsService.filterAuditLogs({
      ...filters,
      page: 1,
      pageSize: Math.min(Number(filters.limit) || 5000, 5000),
    });

    const headers = [
      "timestamp",
      "userId",
      "role",
      "action",
      "objectType",
      "objectId",
      "reason",
      "ipAddress",
      "device",
    ];
    const rows = result.items.map((log) => [
      log.timestamp.toISOString(),
      log.userId,
      log.role ?? "",
      log.action,
      log.objectType,
      log.objectId,
      log.reason ?? "",
      log.ipAddress ?? "",
      log.device ?? "",
    ]);

    return { headers, rows, csv: buildCsv(headers, rows), total: result.total };
  }
}
