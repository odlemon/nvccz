// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../../utils/database";
import { remoteUploadService } from "../RemoteUploadService";
import { FundraisingIrError } from "./FundraisingIrError";
import {
  stageSeedForCampaignType,
  PE_VC_STAGE_SEED,
  AM_MANDATE_STAGE_SEED,
  IrStageSeed,
} from "./FundraisingIrStageSeeds";

const PE_TYPES = new Set([
  "PE_FUNDRAISE",
  "VC_FUNDRAISE",
  "CO_INVESTMENT",
  "SPV",
  "CONTINUATION_VEHICLE",
]);
const AM_TYPES = new Set(["INSTITUTIONAL_MANDATE", "PRODUCT_LAUNCH", "DISTRIBUTOR_CAMPAIGN"]);

const GATE_FLAG_KEYS = [
  "requiresIndicativeAmount",
  "requiresSoftCircle",
  "requiresProposed",
  "requiresSigned",
  "requiresKycNotBlocked",
  "requiresPreviousStageChecklist",
];

const DEFAULT_COMMITMENT_CHECKLIST = [
  { itemKey: "subscription_docs", label: "Subscription documents signed", isRequired: true },
  { itemKey: "wire_instructions", label: "Wire instructions confirmed", isRequired: true },
  { itemKey: "tax_forms", label: "Tax forms submitted", isRequired: true },
  { itemKey: "side_letter_review", label: "Side letter reviewed", isRequired: false },
  { itemKey: "bank_details", label: "Bank details verified", isRequired: true },
];

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sha256Hex(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function pipelineKeyForCampaignType(campaignType: string): string {
  const t = String(campaignType || "").trim().toUpperCase();
  if (AM_TYPES.has(t)) return "AM";
  return "PE_VC";
}

function flattenStageGates(templates: Array<{ stageCode: string; gateRules: unknown }>) {
  const gates: any[] = [];
  for (const t of templates) {
    const rules = (t.gateRules as Record<string, unknown>) || {};
    const gate: any = { stageCode: t.stageCode };
    for (const k of GATE_FLAG_KEYS) {
      gate[k] = Boolean(rules[k]);
    }
    gates.push(gate);
  }
  return gates;
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

export class FundraisingFeGapsService {
  /** Prefer tenant pipeline templates; fall back to static seeds. */
  static async getSeedStagesForCampaignType(campaignType: string): Promise<IrStageSeed[]> {
    const pipelineKey = pipelineKeyForCampaignType(campaignType);
    const templates = await prisma.fundraisingPipelineTemplate.findMany({
      where: { pipelineKey, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    if (templates.length === 0) return stageSeedForCampaignType(campaignType);

    const seedSource = pipelineKey === "AM" ? AM_MANDATE_STAGE_SEED : PE_VC_STAGE_SEED;
    return templates.map((t) => {
      const staticSeed = seedSource.find((s) => s.stageCode === t.stageCode);
      return {
        stageCode: t.stageCode,
        stageName: t.stageName,
        sortOrder: t.sortOrder,
        winProbabilityPct: Number(t.winProbabilityPct),
        gateRules: (t.gateRules as Record<string, unknown>) ?? null,
        checklist: staticSeed?.checklist ?? [],
      };
    });
  }

  static async ensureSettingsRow() {
    let row = await prisma.fundraisingSettings.findUnique({ where: { settingsKey: "DEFAULT" } });
    if (!row) {
      throw FundraisingIrError.notFound("Settings not initialized", "SETTINGS_NOT_FOUND");
    }
    return row;
  }

  static async getSettings() {
    const settings = await FundraisingFeGapsService.ensureSettingsRow();
    const templates = await prisma.fundraisingPipelineTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ pipelineKey: "asc" }, { sortOrder: "asc" }],
    });

    const pipelines: Record<string, { stages: any[] }> = {};
    for (const t of templates) {
      if (!pipelines[t.pipelineKey]) pipelines[t.pipelineKey] = { stages: [] };
      pipelines[t.pipelineKey].stages.push({
        id: t.id,
        stageCode: t.stageCode,
        stageName: t.stageName,
        sortOrder: t.sortOrder,
        winProbabilityPct: Number(t.winProbabilityPct),
        gateRules: t.gateRules,
      });
    }

    return {
      pipelines,
      stageGates: flattenStageGates(templates),
      amountTypes: settings.amountTypesJson ?? [],
      notifications: settings.notificationsJson ?? [],
      roles: settings.rolesJson ?? [],
    };
  }

  static async patchSettings(body: any) {
    const settings = await FundraisingFeGapsService.ensureSettingsRow();
    const data: any = {};
    if (body.amountTypesJson !== undefined || body.amountTypes !== undefined) {
      data.amountTypesJson = body.amountTypesJson ?? body.amountTypes;
    }
    if (body.notificationsJson !== undefined || body.notifications !== undefined) {
      data.notificationsJson = body.notificationsJson ?? body.notifications;
    }
    if (body.rolesJson !== undefined || body.roles !== undefined) {
      data.rolesJson = body.rolesJson ?? body.roles;
    }
    if (body.pipelinesJson !== undefined || body.pipelines !== undefined) {
      data.pipelinesJson = body.pipelinesJson ?? body.pipelines;
    }
    await prisma.fundraisingSettings.update({ where: { id: settings.id }, data });
    return FundraisingFeGapsService.getSettings();
  }

  static async addPipelineStage(pipelineKey: string, body: any) {
    const key = String(pipelineKey || "").trim().toUpperCase();
    if (!["PE_VC", "AM"].includes(key)) {
      throw FundraisingIrError.badRequest("pipelineKey must be PE_VC or AM", "VALIDATION_ERROR");
    }
    const stageCode = String(body?.stageCode || "").trim().toUpperCase();
    const stageName = String(body?.stageName || "").trim();
    if (!stageCode || !stageName) {
      throw FundraisingIrError.badRequest("stageCode and stageName are required", "VALIDATION_ERROR");
    }
    const winProbabilityPct = toNum(body.winProbabilityPct);
    if (winProbabilityPct == null || winProbabilityPct < 0 || winProbabilityPct > 100) {
      throw FundraisingIrError.badRequest("winProbabilityPct must be 0–100", "VALIDATION_ERROR");
    }

    const maxSort = await prisma.fundraisingPipelineTemplate.aggregate({
      where: { pipelineKey: key },
      _max: { sortOrder: true },
    });
    const sortOrder = body.sortOrder != null ? Number(body.sortOrder) : (maxSort._max.sortOrder ?? 0) + 1;

    try {
      await prisma.fundraisingPipelineTemplate.create({
        data: {
          pipelineKey: key,
          stageCode,
          stageName,
          sortOrder,
          winProbabilityPct,
          gateRules: body.gateRules ?? undefined,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw FundraisingIrError.conflict("Stage code already exists for pipeline", "VALIDATION_ERROR");
      }
      throw e;
    }
    return FundraisingFeGapsService.getSettings();
  }

  static async patchPipelineStage(pipelineKey: string, stageId: string, body: any) {
    const key = String(pipelineKey || "").trim().toUpperCase();
    const stage = await prisma.fundraisingPipelineTemplate.findFirst({
      where: { id: stageId, pipelineKey: key },
    });
    if (!stage) throw FundraisingIrError.notFound("Pipeline stage not found", "NOT_FOUND");

    const data: any = {};
    if (body.stageName != null) data.stageName = body.stageName;
    if (body.sortOrder != null) data.sortOrder = Number(body.sortOrder);
    if (body.winProbabilityPct != null) {
      const pct = toNum(body.winProbabilityPct);
      if (pct == null || pct < 0 || pct > 100) {
        throw FundraisingIrError.badRequest("winProbabilityPct must be 0–100", "VALIDATION_ERROR");
      }
      data.winProbabilityPct = pct;
    }
    if (body.gateRules !== undefined) data.gateRules = body.gateRules;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    await prisma.fundraisingPipelineTemplate.update({ where: { id: stageId }, data });
    return FundraisingFeGapsService.getSettings();
  }

  static async deletePipelineStage(pipelineKey: string, stageId: string) {
    const key = String(pipelineKey || "").trim().toUpperCase();
    const stage = await prisma.fundraisingPipelineTemplate.findFirst({
      where: { id: stageId, pipelineKey: key },
    });
    if (!stage) throw FundraisingIrError.notFound("Pipeline stage not found", "NOT_FOUND");

    const campaignTypes = key === "AM" ? [...AM_TYPES] : [...PE_TYPES];
    const campaigns = await prisma.fundraisingCampaign.findMany({
      where: { campaignType: { in: campaignTypes } },
      select: { id: true },
    });
    const campaignIds = campaigns.map((c) => c.id);
    if (campaignIds.length) {
      const stages = await prisma.fundraisingPipelineStage.findMany({
        where: { campaignId: { in: campaignIds }, stageCode: stage.stageCode },
        select: { id: true },
      });
      const stageIds = stages.map((s) => s.id);
      if (stageIds.length) {
        const inUse = await prisma.fundraisingOpportunity.count({
          where: { status: "OPEN", currentStageId: { in: stageIds } },
        });
        if (inUse > 0) {
          throw FundraisingIrError.conflict(
            "Cannot delete stage — open opportunities exist on this stage",
            "STAGE_IN_USE"
          );
        }
      }
    }

    await prisma.fundraisingPipelineTemplate.delete({ where: { id: stageId } });
    return FundraisingFeGapsService.getSettings();
  }

  static async patchStageGates(body: any) {
    const gates = body?.gates;
    if (!Array.isArray(gates) || gates.length === 0) {
      throw FundraisingIrError.badRequest("gates[] is required", "VALIDATION_ERROR");
    }

    for (const g of gates) {
      const stageCode = String(g.stageCode || "").trim().toUpperCase();
      if (!stageCode) continue;

      const templates = await prisma.fundraisingPipelineTemplate.findMany({
        where: { stageCode },
      });
      for (const t of templates) {
        const existing = ((t.gateRules as Record<string, unknown>) || {}) as Record<string, unknown>;
        const merged = { ...existing };
        for (const k of GATE_FLAG_KEYS) {
          if (g[k] !== undefined) merged[k] = Boolean(g[k]);
        }
        await prisma.fundraisingPipelineTemplate.update({
          where: { id: t.id },
          data: { gateRules: merged },
        });
      }
    }
    return FundraisingFeGapsService.getSettings();
  }

  static async patchAmountTypes(body: any) {
    const settings = await FundraisingFeGapsService.ensureSettingsRow();
    const amountTypes = body?.amountTypes ?? body?.amountTypesJson;
    if (!Array.isArray(amountTypes)) {
      throw FundraisingIrError.badRequest("amountTypes[] is required", "VALIDATION_ERROR");
    }
    await prisma.fundraisingSettings.update({
      where: { id: settings.id },
      data: { amountTypesJson: amountTypes },
    });
    return FundraisingFeGapsService.getSettings();
  }

  static async patchNotifications(body: any) {
    const settings = await FundraisingFeGapsService.ensureSettingsRow();
    const notifications = body?.notifications ?? body?.notificationsJson;
    if (!Array.isArray(notifications)) {
      throw FundraisingIrError.badRequest("notifications[] is required", "VALIDATION_ERROR");
    }
    const existing = Array.isArray(settings.notificationsJson)
      ? (settings.notificationsJson as any[])
      : [];
    const byId = new Map(existing.map((item: any) => [item.id ?? item.eventKey, item]));
    for (const patch of notifications) {
      const key = patch?.id ?? patch?.eventKey;
      if (!key) continue;
      byId.set(key, { ...(byId.get(key) ?? {}), ...patch });
    }
    await prisma.fundraisingSettings.update({
      where: { id: settings.id },
      data: { notificationsJson: Array.from(byId.values()) },
    });
    return FundraisingFeGapsService.getSettings();
  }

  // ── Meetings ──────────────────────────────────────────────────

  static mapMeetingListItem(m: any, ownerById?: Map<string, { firstName: string; lastName: string }>) {
    const owner = m.ownerId ? ownerById?.get(m.ownerId) : null;
    return {
      id: m.id,
      title: m.title,
      meetingType: m.meetingType,
      scheduledStart: m.scheduledStart,
      scheduledEnd: m.scheduledEnd,
      timezone: m.timezone,
      status: m.status,
      agenda: m.agenda,
      discussionNotes: m.discussionNotes ?? null,
      outcomeSummary: m.outcomeSummary ?? null,
      decisions: m.decisionsJson ?? [],
      actionItems: m.actionItems ?? [],
      completedAt: m.completedAt ?? null,
      completedBy: m.completedById ? { id: m.completedById } : null,
      campaignId: m.campaignId,
      investor: m.investor ? { id: m.investor.id, legalName: m.investor.legalName } : null,
      owner: m.ownerId ? { id: m.ownerId, firstName: owner?.firstName, lastName: owner?.lastName } : null,
      attendeeCount: m._count?.attendees ?? m.attendees?.length ?? 0,
    };
  }

  static async listMeetings(filters: any = {}) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.opportunityId) where.opportunityId = filters.opportunityId;
    if (filters.ownerId) where.ownerId = filters.ownerId;
    if (filters.meetingType) where.meetingType = filters.meetingType;
    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) {
      where.scheduledStart = {};
      if (filters.from) where.scheduledStart.gte = new Date(filters.from);
      if (filters.to) where.scheduledStart.lte = new Date(filters.to);
    }

    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      prisma.fundraisingMeeting.findMany({
        where,
        include: {
          investor: { select: { id: true, legalName: true } },
          actionItems: { orderBy: { sortOrder: "asc" } },
          _count: { select: { attendees: true } },
        },
        orderBy: { scheduledStart: "asc" },
        skip,
        take: pageSize,
      }),
      prisma.fundraisingMeeting.count({ where }),
    ]);

    const ownerIds = [...new Set(items.map((m: any) => m.ownerId).filter(Boolean))];
    const owners = ownerIds.length
      ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const ownerById = new Map(owners.map((u) => [u.id, u]));

    return {
      items: items.map((m: any) => FundraisingFeGapsService.mapMeetingListItem(m, ownerById)),
      page,
      pageSize,
      total,
    };
  }

  static async createMeeting(userId: string, body: any) {
    if (!body?.title) throw FundraisingIrError.badRequest("title is required", "VALIDATION_ERROR");
    if (!body?.scheduledStart || !body?.scheduledEnd) {
      throw FundraisingIrError.badRequest("scheduledStart and scheduledEnd are required", "VALIDATION_ERROR");
    }
    const start = new Date(body.scheduledStart);
    const end = new Date(body.scheduledEnd);
    if (end <= start) {
      throw FundraisingIrError.badRequest("scheduledEnd must be after scheduledStart", "VALIDATION_ERROR");
    }

    if (body.campaignId) {
      const camp = await prisma.fundraisingCampaign.findUnique({ where: { id: body.campaignId } });
      if (!camp) throw FundraisingIrError.notFound("Campaign not found", "CAMPAIGN_NOT_FOUND");
    }

    const meeting = await prisma.fundraisingMeeting.create({
      data: {
        title: body.title,
        meetingType: body.meetingType || "VIDEO",
        scheduledStart: start,
        scheduledEnd: end,
        timezone: body.timezone || "UTC",
        location: body.location ?? null,
        videoLink: body.videoLink ?? null,
        campaignId: body.campaignId ?? null,
        investorId: body.investorId ?? null,
        opportunityId: body.opportunityId ?? null,
        contactId: body.contactId ?? null,
        ownerId: body.ownerId ?? userId,
        agenda: body.agenda ?? null,
        status: body.status || "SCHEDULED",
        createdById: userId,
        attendees: body.attendees?.length
          ? {
              create: body.attendees.map((a: any) => ({
                email: a.email ?? null,
                fullName: a.fullName ?? null,
                userId: a.userId ?? null,
                role: a.role || "EXTERNAL",
              })),
            }
          : undefined,
      },
      include: {
        attendees: true,
        investor: { select: { id: true, legalName: true } },
      },
    });
    return meeting;
  }

  static async getMeeting(meetingId: string) {
    const meeting = await prisma.fundraisingMeeting.findUnique({
      where: { id: meetingId },
      include: {
        attendees: true,
        investor: { select: { id: true, legalName: true } },
        campaign: { select: { id: true, name: true } },
        opportunity: { select: { id: true, status: true } },
        actionItems: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!meeting) throw FundraisingIrError.notFound("Meeting not found", "MEETING_NOT_FOUND");
    if (!meeting.ownerId) return { ...meeting, owner: null };
    const owner = await prisma.user.findUnique({
      where: { id: meeting.ownerId },
      select: { id: true, firstName: true, lastName: true },
    });
    return { ...meeting, owner };
  }

  static async patchMeeting(meetingId: string, body: any) {
    await FundraisingFeGapsService.getMeeting(meetingId);
    const data: any = {};
    const scalarFields = [
      "title",
      "meetingType",
      "timezone",
      "location",
      "videoLink",
      "campaignId",
      "investorId",
      "opportunityId",
      "contactId",
      "ownerId",
      "agenda",
      "status",
    ];
    for (const f of scalarFields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.scheduledStart != null) data.scheduledStart = new Date(body.scheduledStart);
    if (body.scheduledEnd != null) data.scheduledEnd = new Date(body.scheduledEnd);

    const updated = await prisma.fundraisingMeeting.update({
      where: { id: meetingId },
      data,
      include: { attendees: true, investor: { select: { id: true, legalName: true } } },
    });

    if (Array.isArray(body.attendees)) {
      await prisma.fundraisingMeetingAttendee.deleteMany({ where: { meetingId } });
      if (body.attendees.length) {
        await prisma.fundraisingMeetingAttendee.createMany({
          data: body.attendees.map((a: any) => ({
            meetingId,
            email: a.email ?? null,
            fullName: a.fullName ?? null,
            userId: a.userId ?? null,
            role: a.role || "EXTERNAL",
          })),
        });
      }
      return FundraisingFeGapsService.getMeeting(meetingId);
    }
    return updated;
  }

  static async cancelMeeting(meetingId: string, body: any) {
    await FundraisingFeGapsService.getMeeting(meetingId);
    return prisma.fundraisingMeeting.update({
      where: { id: meetingId },
      data: {
        status: "CANCELLED",
        cancelReason: body?.reason ?? null,
      },
    });
  }

  static async completeMeeting(userId: string, meetingId: string, body: any, req?: any) {
    const meeting = await FundraisingFeGapsService.getMeeting(meetingId);
    const outcomeSummary = String(body?.outcomeSummary ?? body?.outcome ?? "").trim();
    if (!outcomeSummary) {
      throw new FundraisingIrError(
        422,
        "MEETING_OUTCOME_REQUIRED",
        "outcomeSummary is required to complete a meeting"
      );
    }
    if (meeting.status === "COMPLETED") {
      return meeting;
    }
    if (meeting.status === "CANCELLED") {
      throw FundraisingIrError.conflict("Cancelled meeting cannot be completed", "MEETING_CANCELLED");
    }

    const decisions = Array.isArray(body?.decisions) ? body.decisions : [];
    const actions = Array.isArray(body?.actionItems) ? body.actionItems : [];
    const completionNonce =
      String(body?.idempotencyKey || "").trim() ||
      crypto
        .createHash("sha256")
        .update(JSON.stringify({ meetingId, outcomeSummary, decisions, actions }))
        .digest("hex");

    await prisma.$transaction(async (tx) => {
      const current = await tx.fundraisingMeeting.findUnique({ where: { id: meetingId } });
      if (!current || current.status === "COMPLETED") return;

      let communicationId = current.communicationId;
      if (body?.createCommunication !== false && !communicationId) {
        const typeMap: Record<string, string> = {
          VIDEO: "VIDEO_MEETING",
          IN_PERSON: "PHYSICAL_MEETING",
          PHONE: "PHONE_CALL",
        };
        const comm = await tx.fundraisingCommunication.create({
          data: {
            campaignId: current.campaignId,
            opportunityId: current.opportunityId,
            investorId: current.investorId,
            contactId: current.contactId,
            interactionType: typeMap[current.meetingType] || "VIDEO_MEETING",
            subject: current.title,
            summary: body?.discussionNotes ?? body?.summary ?? current.agenda,
            outcome: outcomeSummary,
            confidentiality: "INTERNAL",
            occurredAt: current.scheduledStart,
            ownerId: current.ownerId,
            createdById: userId,
          },
        });
        communicationId = comm.id;
      }

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i] || {};
        const title = String(action.title || "").trim();
        if (!title) continue;
        const actionKey = crypto
          .createHash("sha256")
          .update(`${completionNonce}:${i}:${title}`)
          .digest("hex");
        let linkedTaskId: string | null = null;
        if (action.createTask !== false) {
          const task = await tx.task.create({
            data: {
              title,
              description: action.description ?? `Follow-up from meeting: ${current.title}`,
              stage: "todo",
              status: "todo",
              date: action.dueDate ? new Date(action.dueDate) : new Date(),
              priority: action.priority || "medium",
              isPerformanceTask: false,
              taskMetadata: {
                sourceModule: "fundraising",
                sourceType: "MEETING_ACTION",
                meetingId,
                campaignId: current.campaignId,
                opportunityId: current.opportunityId,
                investorId: current.investorId,
                ownerId: action.ownerId ?? current.ownerId,
              },
              createdBy: userId,
              activities: [],
            },
          });
          linkedTaskId = task.id;
        }
        await tx.fundraisingMeetingActionItem.create({
          data: {
            meetingId,
            title,
            ownerId: action.ownerId ?? current.ownerId,
            dueDate: action.dueDate ? new Date(action.dueDate) : null,
            linkedTaskId,
            sortOrder: i,
            idempotencyKey: actionKey,
          },
        });
      }

      await tx.fundraisingMeeting.update({
        where: { id: meetingId },
        data: {
          status: "COMPLETED",
          communicationId,
          discussionNotes: body?.discussionNotes ?? null,
          outcomeSummary,
          decisionsJson: decisions,
          completedAt: new Date(),
          completedById: userId,
          completionNonce,
        },
      });
    }, { maxWait: 20_000, timeout: 20_000 });

    return FundraisingFeGapsService.getMeeting(meetingId);
  }

  // ── Documents ─────────────────────────────────────────────────

  static mapDocumentListItem(doc: any, campaignName?: string | null) {
    const versions = doc.versions || [];
    const latest = versions[0] || null;
    return {
      id: doc.id,
      name: doc.name,
      category: doc.category,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      campaignId: doc.campaignId,
      campaignName: campaignName ?? doc.campaign?.name ?? null,
      investorId: doc.investorId,
      confidential: doc.confidential,
      status: doc.status,
      currentVersion: latest
        ? {
            versionNumber: latest.versionNumber,
            fileName: latest.fileName,
            uploadedAt: latest.createdAt,
            uploadedBy: { id: latest.uploadedById },
          }
        : doc.fileName
          ? {
              versionNumber: 1,
              fileName: doc.fileName,
              uploadedAt: doc.createdAt ?? doc.updatedAt,
            }
          : null,
      versionCount: versions.length || (doc.fileName ? 1 : 0),
    };
  }

  static async listDocuments(filters: any = {}) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.opportunityId) where.opportunityId = filters.opportunityId;
    if (filters.category) where.category = filters.category;
    if (filters.sourceType) where.sourceType = filters.sourceType;
    if (filters.confidential != null) where.confidential = filters.confidential === "true" || filters.confidential === true;
    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q } },
        { fileName: { contains: filters.q } },
      ];
    }

    const page = Math.max(1, Number(filters.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));

    const registered = await prisma.fundraisingDocument.findMany({
      where,
      include: {
        campaign: { select: { name: true } },
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    });

    const registeredSourceKeys = new Set(
      registered.filter((d) => d.sourceType && d.sourceId).map((d) => `${d.sourceType}:${d.sourceId}`)
    );

    const merged: any[] = registered.map((d) =>
      FundraisingFeGapsService.mapDocumentListItem(d, d.campaign?.name)
    );

    if (!filters.sourceType || filters.sourceType === "DATA_ROOM") {
      const drWhere: any = {};
      if (filters.campaignId) {
        drWhere.dataRoom = { campaignId: filters.campaignId };
      }
      const drDocs = await prisma.fundraisingDataRoomDocument.findMany({
        where: drWhere,
        include: {
          dataRoom: {
            include: { campaign: { select: { id: true, name: true } } },
          },
        },
        take: 200,
      });
      for (const d of drDocs) {
        const key = `DATA_ROOM:${d.id}`;
        if (registeredSourceKeys.has(key)) continue;
        if (filters.q && !d.fileName.toLowerCase().includes(String(filters.q).toLowerCase())) continue;
        merged.push({
          id: `dr-${d.id}`,
          name: d.fileName,
          category: "Due Diligence",
          sourceType: "DATA_ROOM",
          sourceId: d.id,
          campaignId: d.dataRoom?.campaignId ?? null,
          campaignName: d.dataRoom?.campaign?.name ?? null,
          investorId: null,
          confidential: false,
          status: "ACTIVE",
          currentVersion: {
            versionNumber: 1,
            fileName: d.fileName,
            uploadedAt: d.createdAt,
          },
          versionCount: 1,
          _virtual: true,
        });
      }
    }

    if (!filters.sourceType || filters.sourceType === "AGREEMENT") {
      const agrWhere: any = {};
      if (filters.campaignId) agrWhere.campaignId = filters.campaignId;
      if (filters.investorId) agrWhere.investorId = filters.investorId;
      const agreements = await prisma.fundraisingAgreement.findMany({
        where: agrWhere,
        include: {
          campaign: { select: { name: true } },
          versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        },
        take: 200,
      });
      for (const a of agreements) {
        const key = `AGREEMENT:${a.id}`;
        if (registeredSourceKeys.has(key)) continue;
        const v = a.versions[0];
        if (filters.q && !a.title.toLowerCase().includes(String(filters.q).toLowerCase())) continue;
        merged.push({
          id: `agr-${a.id}`,
          name: a.title,
          category: "Legal",
          sourceType: "AGREEMENT",
          sourceId: a.id,
          campaignId: a.campaignId,
          campaignName: a.campaign?.name ?? null,
          investorId: a.investorId,
          confidential: true,
          status: a.status,
          currentVersion: v
            ? {
                versionNumber: v.versionNumber,
                fileName: v.fileName,
                uploadedAt: v.createdAt,
              }
            : null,
          versionCount: a.versions?.length ?? 0,
          _virtual: true,
        });
      }
    }

    merged.sort((a, b) => {
      const ta = a.currentVersion?.uploadedAt ? new Date(a.currentVersion.uploadedAt).getTime() : 0;
      const tb = b.currentVersion?.uploadedAt ? new Date(b.currentVersion.uploadedAt).getTime() : 0;
      return tb - ta;
    });

    const total = merged.length;
    const skip = (page - 1) * pageSize;
    return {
      items: merged.slice(skip, skip + pageSize),
      page,
      pageSize,
      total,
    };
  }

  static async getDocument(documentId: string) {
    if (documentId.startsWith("dr-") || documentId.startsWith("agr-")) {
      throw FundraisingIrError.badRequest(
        "Virtual document — use source API or register via POST /documents",
        "VALIDATION_ERROR"
      );
    }
    const doc = await prisma.fundraisingDocument.findUnique({
      where: { id: documentId },
      include: {
        campaign: { select: { id: true, name: true } },
        versions: { orderBy: { versionNumber: "desc" } },
      },
    });
    if (!doc) throw FundraisingIrError.notFound("Document not found", "DOCUMENT_NOT_FOUND");

    return {
      ...doc,
      versions: doc.versions.map((v) => ({
        versionNumber: v.versionNumber,
        fileName: v.fileName,
        uploadedAt: v.createdAt,
        uploadedBy: { id: v.uploadedById },
        downloadPath: `/api/fundraising/documents/${documentId}/download?version=${v.versionNumber}`,
      })),
    };
  }

  static async createDocument(userId: string, body: any, file?: Express.Multer.File) {
    if (!body?.name) throw FundraisingIrError.badRequest("name is required", "VALIDATION_ERROR");
    if (!body?.category) throw FundraisingIrError.badRequest("category is required", "VALIDATION_ERROR");

    let fileUrl = body.fileUrl ?? null;
    let storagePath = body.storagePath ?? null;
    let fileName = body.fileName ?? null;
    let mimeType = body.mimeType ?? null;
    let sha256 = body.sha256 ?? null;

    if (file?.buffer) {
      sha256 = sha256Hex(file.buffer);
      const uploaded = await remoteUploadService.uploadSingleFile(file, "fundraising-documents");
      fileUrl = uploaded.downloadURL;
      storagePath = uploaded.filePath;
      fileName = file.originalname;
      mimeType = file.mimetype;
    }

    const doc = await prisma.fundraisingDocument.create({
      data: {
        name: body.name,
        category: body.category,
        sourceType: body.sourceType || "UPLOAD",
        sourceId: body.sourceId ?? null,
        campaignId: body.campaignId ?? null,
        investorId: body.investorId ?? null,
        opportunityId: body.opportunityId ?? null,
        confidential: Boolean(body.confidential),
        status: body.status || "ACTIVE",
        fileUrl,
        storagePath,
        fileName,
        mimeType,
        sha256,
        createdById: userId,
        versions: fileUrl
          ? {
              create: {
                versionNumber: 1,
                fileUrl,
                storagePath,
                fileName: fileName || body.name,
                mimeType,
                sha256,
                uploadedById: userId,
              },
            }
          : undefined,
      },
      include: { versions: true },
    });
    return doc;
  }

  static async patchDocument(documentId: string, body: any) {
    await FundraisingFeGapsService.getDocument(documentId);
    const data: any = {};
    for (const f of ["name", "category", "confidential", "status", "campaignId", "investorId", "opportunityId"]) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    return prisma.fundraisingDocument.update({
      where: { id: documentId },
      data,
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });
  }

  static async downloadDocument(userId: string, documentId: string, versionNumber?: number) {
    const doc = await prisma.fundraisingDocument.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
    });
    if (!doc) throw FundraisingIrError.notFound("Document not found", "DOCUMENT_NOT_FOUND");

    let fileUrl = doc.fileUrl;
    let storagePath = doc.storagePath;
    let fileName = doc.fileName || doc.name;
    let mimeType = doc.mimeType;

    if (versionNumber != null) {
      const ver = doc.versions.find((v) => v.versionNumber === Number(versionNumber));
      if (!ver) throw FundraisingIrError.notFound("Document version not found", "DOCUMENT_NOT_FOUND");
      fileUrl = ver.fileUrl;
      storagePath = ver.storagePath;
      fileName = ver.fileName;
      mimeType = ver.mimeType;
    } else if (doc.versions.length) {
      const ver = doc.versions[0];
      fileUrl = ver.fileUrl;
      storagePath = ver.storagePath;
      fileName = ver.fileName;
      mimeType = ver.mimeType;
    }

    if (!fileUrl && !storagePath) {
      throw FundraisingIrError.badRequest("Document has no file attached", "VALIDATION_ERROR");
    }

    const buffer = await remoteUploadService.downloadFile(storagePath || fileUrl!);
    return { buffer, fileName, mimeType: mimeType || "application/octet-stream" };
  }

  // ── Engagement ────────────────────────────────────────────────

  static async getCampaignEngagement(campaignId: string) {
    const campaign = await prisma.fundraisingCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw FundraisingIrError.notFound("Campaign not found", "CAMPAIGN_NOT_FOUND");

    if (campaign.engagementJson && typeof campaign.engagementJson === "object") {
      const cached = campaign.engagementJson as Record<string, unknown>;
      if (cached.sent != null || cached.meetingsBooked != null) {
        return { campaignId, ...cached };
      }
    }

    const [sent, replied, meetingsBooked, materialsDownloaded, signedAgg] = await Promise.all([
      prisma.fundraisingCommunication.count({ where: { campaignId } }),
      prisma.fundraisingCommunication.count({
        where: {
          campaignId,
          outcome: { in: ["REPLIED", "POSITIVE", "FOLLOW_UP", "COMPLETED"] },
        },
      }),
      prisma.fundraisingMeeting.count({
        where: { campaignId, status: { in: ["SCHEDULED", "COMPLETED"] } },
      }),
      prisma.fundraisingDataRoomAccessLog.count({
        where: {
          action: { in: ["DOWNLOAD", "VIEW"] },
          dataRoom: { campaignId },
        },
      }),
      prisma.fundraisingOpportunity.aggregate({
        where: { campaignId },
        _sum: { signedAmount: true },
      }),
    ]);

    const signedTotal = Number(signedAgg._sum.signedAmount ?? 0);
    const targetTotal = Number(campaign.targetCapital ?? 0);
    const progressPct =
      targetTotal > 0 ? Math.min(100, Math.round((signedTotal / targetTotal) * 100)) : 0;

    const opened = Math.round(sent * 0.68);

    return {
      campaignId,
      sent,
      opened,
      replied,
      meetingsBooked,
      materialsDownloaded,
      progressPct,
    };
  }

  // ── Forecast curve ────────────────────────────────────────────

  static async getForecastScenarioCurve(scenarioId: string) {
    const scenario = await prisma.fundraisingForecastScenario.findUnique({
      where: { id: scenarioId },
      include: { campaign: { select: { closeDate: true } } },
    });
    if (!scenario) throw FundraisingIrError.notFound("Forecast scenario not found", "NOT_FOUND");

    let monthlyProjection = scenario.monthlyProjection as any[] | null;
    if (!monthlyProjection?.length && scenario.projectedSigned != null) {
      monthlyProjection = generateLinearMonthlyProjection(
        Number(scenario.projectedSigned),
        scenario.campaign?.closeDate
      );
    }

    return {
      scenarioId: scenario.id,
      campaignId: scenario.campaignId,
      monthlyProjection: monthlyProjection ?? [],
    };
  }

  static buildMonthlyProjection(body: any, campaignCloseDate?: Date | null) {
    if (body.monthlyProjection?.length) return body.monthlyProjection;
    const projectedSigned = toNum(body.projectedSigned);
    if (projectedSigned != null && projectedSigned > 0) {
      return generateLinearMonthlyProjection(projectedSigned, campaignCloseDate);
    }
    return null;
  }

  // ── Placement commissions ─────────────────────────────────────

  static async computeAccruedCommission(agentId: string, agent: any) {
    if (Number(agent.accruedCommission) > 0) {
      return {
        accruedCommission: Number(agent.accruedCommission),
        paidCommission: Number(agent.paidCommission ?? 0),
        commissionStatus: agent.commissionStatus || "ACCRUING",
      };
    }

    const assignments = await prisma.fundraisingPlacementAssignment.findMany({
      where: { agentId },
      include: {
        opportunity: {
          select: { fundedAmount: true, signedAmount: true, proposedAmount: true },
        },
      },
    });
    const pct = Number(agent.commissionPct ?? 0);
    let accrued = 0;
    for (const a of assignments) {
      const base =
        Number(a.opportunity.fundedAmount ?? 0) ||
        Number(a.opportunity.signedAmount ?? 0) ||
        Number(a.opportunity.proposedAmount ?? 0);
      accrued += base * (pct / 100);
    }
    return {
      accruedCommission: Math.round(accrued * 100) / 100,
      paidCommission: Number(agent.paidCommission ?? 0),
      commissionStatus: agent.commissionStatus || "ACCRUING",
    };
  }

  static async getAgentCommissions(agentId: string) {
    const agent = await prisma.fundraisingPlacementAgent.findUnique({
      where: { id: agentId },
      include: {
        assignments: {
          include: {
            opportunity: {
              select: {
                id: true,
                fundedAmount: true,
                signedAmount: true,
                proposedAmount: true,
                investor: { select: { legalName: true } },
              },
            },
          },
        },
      },
    });
    if (!agent) throw FundraisingIrError.notFound("Placement agent not found", "PLACEMENT_AGENT_NOT_FOUND");

    const totals = await FundraisingFeGapsService.computeAccruedCommission(agentId, agent);
    const pct = Number(agent.commissionPct ?? 0);

    const ledger = agent.assignments.map((a) => {
      const base =
        Number(a.opportunity.fundedAmount ?? 0) ||
        Number(a.opportunity.signedAmount ?? 0) ||
        Number(a.opportunity.proposedAmount ?? 0);
      const accrued = Math.round(base * (pct / 100) * 100) / 100;
      return {
        opportunityId: a.opportunityId,
        investorName: a.opportunity.investor?.legalName ?? null,
        baseAmount: base,
        commissionPct: pct,
        accruedCommission: accrued,
        status: totals.commissionStatus,
      };
    });

    return {
      agentId,
      currency: "USD",
      commissionStatus: totals.commissionStatus,
      accruedCommission: totals.accruedCommission,
      paidCommission: totals.paidCommission,
      outstandingCommission: Math.max(0, totals.accruedCommission - totals.paidCommission),
      ledger,
    };
  }

  // ── Commitment checklist ──────────────────────────────────────

  static async seedCommitmentChecklist(commitmentId: string) {
    for (let i = 0; i < DEFAULT_COMMITMENT_CHECKLIST.length; i++) {
      const item = DEFAULT_COMMITMENT_CHECKLIST[i];
      await prisma.fundraisingCommitmentChecklistItem.upsert({
        where: {
          commitmentId_itemKey: { commitmentId, itemKey: item.itemKey },
        },
        create: {
          commitmentId,
          itemKey: item.itemKey,
          label: item.label,
          isRequired: item.isRequired,
          sortOrder: i,
        },
        update: {},
      });
    }
  }

  static async getCommitmentChecklist(commitmentId: string) {
    const commitment = await prisma.fundraisingCommitment.findUnique({ where: { id: commitmentId } });
    if (!commitment) throw FundraisingIrError.notFound("Commitment not found", "NOT_FOUND");

    const count = await prisma.fundraisingCommitmentChecklistItem.count({ where: { commitmentId } });
    if (count === 0) {
      await FundraisingFeGapsService.seedCommitmentChecklist(commitmentId);
    }

    const items = await prisma.fundraisingCommitmentChecklistItem.findMany({
      where: { commitmentId },
      orderBy: { sortOrder: "asc" },
    });
    return { commitmentId, items };
  }

  static async patchCommitmentChecklistItem(
    userId: string,
    commitmentId: string,
    itemId: string,
    body: any
  ) {
    await FundraisingFeGapsService.getCommitmentChecklist(commitmentId);
    const item = await prisma.fundraisingCommitmentChecklistItem.findFirst({
      where: { id: itemId, commitmentId },
    });
    if (!item) throw FundraisingIrError.notFound("Checklist item not found", "NOT_FOUND");

    const isComplete = body.isComplete !== undefined ? Boolean(body.isComplete) : item.isComplete;
    const updated = await prisma.fundraisingCommitmentChecklistItem.update({
      where: { id: itemId },
      data: {
        isComplete,
        completedAt: isComplete ? new Date() : null,
        completedById: isComplete ? userId : null,
      },
    });
    return updated;
  }
}
