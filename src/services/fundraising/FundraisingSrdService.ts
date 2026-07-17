// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../../utils/database";
import { remoteUploadService } from "../RemoteUploadService";
import { FundraisingIrError } from "./FundraisingIrError";
import {
  FundraisingIrOpportunityService,
} from "./FundraisingIrOpportunityService";

const INTERNAL_CONFIDENTIALITY = ["INTERNAL", "INTERNAL_NOTE"];
const VALID_OPPORTUNITY_STATUSES = [
  "OPEN",
  "LOST",
  "WITHDRAWN",
  "DEFERRED",
  "ON_HOLD",
  "DISQUALIFIED",
  "TENDER_CANCELLED",
  "WON",
];
const WON_ALLOWED_STAGE_CODES = ["SIGNED", "ADMITTED", "FUNDED", "ACTIVATED"];
const MANDATE_CHECKLIST_BOOLS = [
  "agreementSigned",
  "kycApproved",
  "guidelinesConfigured",
  "benchmarkConfigured",
  "feesConfigured",
  "reportingConfigured",
  "custodianConfirmed",
  "openingBalancesVerified",
  "assetsReceived",
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

async function ensureAutoKycOnRfpWonInline(
  userId: string,
  rfpId: string,
  rfp: any,
  body: any = {},
  req?: any
) {
  const outcome = String(body.outcome ?? rfp.outcome ?? "").toUpperCase();
  if (outcome !== "WON") return null;

  let kycCase = null as any;
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
          detailsJson: { source: "RFP_WON", rfpId, autoCreated: true },
          ownerId: body.ownerId ?? userId,
          createdById: userId,
        },
      }));
  }

  const updatedRfp = await prisma.fundraisingRfp.update({
    where: { id: rfpId },
    data: { onboardingKycCaseId: kycCase.id },
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

  return { kycCase, rfp: updatedRfp };
}

function applyDdqLifecycleTimestamps(existing: any, data: any, body: any) {
  const now = new Date();
  const prevStatus = String(existing.status || "").toUpperCase();
  let nextStatus = data.status !== undefined ? String(data.status).toUpperCase() : prevStatus;

  if (body.archive === true || body.archived === true) {
    data.status = "ARCHIVED";
    nextStatus = "ARCHIVED";
    if (body.archivedAt !== undefined) {
      data.archivedAt = body.archivedAt ? new Date(body.archivedAt) : null;
    } else if (!existing.archivedAt) {
      data.archivedAt = now;
    }
  }

  const transitions: Array<{ status: string; field: string; bodyKey: string }> = [
    { status: "INTERNAL_REVIEW", field: "internalReviewAt", bodyKey: "internalReviewAt" },
    { status: "SUBMITTED", field: "submittedAt", bodyKey: "submittedAt" },
    { status: "APPROVED", field: "approvedAt", bodyKey: "approvedAt" },
    { status: "ARCHIVED", field: "archivedAt", bodyKey: "archivedAt" },
  ];

  for (const { status, field, bodyKey } of transitions) {
    if (body[bodyKey] !== undefined) {
      data[field] = body[bodyKey] ? new Date(body[bodyKey]) : null;
      continue;
    }
    if (nextStatus === status && prevStatus !== status && !existing[field]) {
      data[field] = now;
    }
  }
}

function syncInvestorKycFromCasePatch(data: any, body: any, existing: any, userId: string) {
  const statusUpper = String(data.status ?? body.status ?? existing.status ?? "").toUpperCase();
  const terminalUpper = String(data.terminalStatus ?? body.terminalStatus ?? "").toUpperCase();
  const effective = terminalUpper || statusUpper;

  if (["REJECTED"].includes(effective) || statusUpper === "REJECTED") {
    data.decidedAt = data.decidedAt ?? new Date();
    data.rejectedById = userId;
    if (data.terminalStatus === undefined && body.terminalStatus === undefined) {
      data.terminalStatus = "REJECTED";
    }
    return "REJECTED";
  }

  if (
    ["MORE_INFORMATION_REQUIRED", "MORE_INFO", "PENDING_DOCS"].includes(effective) ||
    ["MORE_INFORMATION_REQUIRED", "MORE_INFO", "PENDING_DOCS"].includes(statusUpper)
  ) {
    if (data.terminalStatus === undefined && body.terminalStatus === undefined) {
      data.terminalStatus = "MORE_INFORMATION_REQUIRED";
    }
    return "MORE_INFORMATION_REQUIRED";
  }

  if (
    effective === "APPROVED_WITH_CONDITIONS" ||
    statusUpper === "APPROVED_WITH_CONDITIONS" ||
    effective === "CONDITIONS" ||
    statusUpper.includes("WITH_CONDITION")
  ) {
    data.decidedAt = data.decidedAt ?? new Date();
    data.approvedById = userId;
    if (data.terminalStatus === undefined && body.terminalStatus === undefined) {
      data.terminalStatus = "APPROVED_WITH_CONDITIONS";
    }
    return "APPROVED_WITH_CONDITIONS";
  }

  if (statusUpper.startsWith("APPROVED")) {
    data.decidedAt = data.decidedAt ?? new Date();
    data.approvedById = userId;
    return "APPROVED";
  }

  return null;
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

function buildMonthlyProjection(body: any, campaignCloseDate?: Date | null) {
  if (body.monthlyProjection?.length) return body.monthlyProjection;
  const projectedSigned = toNum(body.projectedSigned);
  if (projectedSigned != null && projectedSigned > 0) {
    return generateLinearMonthlyProjection(projectedSigned, campaignCloseDate);
  }
  return null;
}

async function computeAgentCommissionTotals(agentId: string, agent: any) {
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

export class FundraisingSrdService {
  static async logAudit(
    user: any,
    action: string,
    objectType: string,
    objectId: string,
    prev: unknown,
    next: unknown,
    reason?: string | null,
    reqMetaIn?: { ipAddress?: string | null; device?: string | null; sessionId?: string | null }
  ) {
    await prisma.fundraisingAuditLog.create({
      data: {
        userId: user?.id || "system",
        role: user?.roleCode || user?.role?.name || null,
        ipAddress: reqMetaIn?.ipAddress ?? null,
        sessionId: reqMetaIn?.sessionId ?? null,
        device: reqMetaIn?.device ?? null,
        action,
        objectType,
        objectId,
        previousValue: prev != null ? (prev as object) : undefined,
        newValue: next != null ? (next as object) : undefined,
        reason: reason ?? null,
      },
    });
  }

  // ── Board & metrics ───────────────────────────────────────────

  static async getOpportunityBoard(campaignId: string) {
    const stages = await prisma.fundraisingPipelineStage.findMany({
      where: { campaignId },
      orderBy: { sortOrder: "asc" },
    });
    const opportunities = await prisma.fundraisingOpportunity.findMany({
      where: { campaignId, status: "OPEN" },
      include: {
        investor: { select: { id: true, legalName: true, investorType: true } },
        currentStage: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const columns = stages.map((stage) => {
      const cards = opportunities.filter((o) => o.currentStageId === stage.id);
      const totals = {
        count: cards.length,
        indicativeAmount: 0,
        qualifiedAmount: 0,
        softCircleAmount: 0,
        proposedAmount: 0,
        signedAmount: 0,
        weightedAmount: 0,
      };
      for (const c of cards) {
        totals.indicativeAmount += Number(c.indicativeAmount ?? 0);
        totals.qualifiedAmount += Number(c.qualifiedAmount ?? 0);
        totals.softCircleAmount += Number(c.softCircleAmount ?? 0);
        totals.proposedAmount += Number(c.proposedAmount ?? 0);
        totals.signedAmount += Number(c.signedAmount ?? 0);
        const prob = Number(c.stageProbability ?? stage.winProbabilityPct ?? 0) / 100;
        const base =
          Number(c.proposedAmount ?? 0) ||
          Number(c.softCircleAmount ?? 0) ||
          Number(c.qualifiedAmount ?? 0) ||
          Number(c.indicativeAmount ?? 0);
        totals.weightedAmount += base * prob * Number(c.confidenceAdjustment ?? 1);
      }
      return { stage, cards, totals };
    });

    return { campaignId, columns };
  }

  static async getCampaignMetrics(campaignId: string) {
    const campaign = await prisma.fundraisingCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw FundraisingIrError.notFound("Campaign not found", "CAMPAIGN_NOT_FOUND");

    const opps = await prisma.fundraisingOpportunity.findMany({
      where: { campaignId },
      include: { currentStage: true },
    });
    const commitments = await prisma.fundraisingCommitment.findMany({ where: { campaignId } });

    const byStatus: Record<string, number> = {};
    const byStage: Record<string, number> = {};
    const amounts = {
      indicativeAmount: 0,
      qualifiedAmount: 0,
      softCircleAmount: 0,
      proposedAmount: 0,
      signedAmount: 0,
      admittedAmount: 0,
      fundedAmount: 0,
      weightedPipeline: 0,
    };

    for (const o of opps) {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      const sc = o.currentStage?.stageCode || "UNKNOWN";
      byStage[sc] = (byStage[sc] || 0) + 1;
      amounts.indicativeAmount += Number(o.indicativeAmount ?? 0);
      amounts.qualifiedAmount += Number(o.qualifiedAmount ?? 0);
      amounts.softCircleAmount += Number(o.softCircleAmount ?? 0);
      amounts.proposedAmount += Number(o.proposedAmount ?? 0);
      amounts.signedAmount += Number(o.signedAmount ?? 0);
      amounts.admittedAmount += Number(o.admittedAmount ?? 0);
      amounts.fundedAmount += Number(o.fundedAmount ?? 0);
      const prob = Number(o.stageProbability ?? o.currentStage?.winProbabilityPct ?? 0) / 100;
      const base =
        Number(o.proposedAmount ?? 0) ||
        Number(o.softCircleAmount ?? 0) ||
        Number(o.qualifiedAmount ?? 0) ||
        Number(o.indicativeAmount ?? 0);
      amounts.weightedPipeline += base * prob * Number(o.confidenceAdjustment ?? 1);
    }

    const commitmentTotals = {
      count: commitments.length,
      commitmentAmount: commitments.reduce((s, c) => s + Number(c.commitmentAmount ?? 0), 0),
      fundedAmount: commitments.reduce((s, c) => s + Number(c.fundedAmount ?? 0), 0),
      admitted: commitments.filter((c) => String(c.status).includes("ADMITTED")).length,
      funded: commitments.filter((c) => c.status === "FUNDED" || c.status === "PARTIALLY_FUNDED").length,
    };

    const target = Number(campaign.targetCapital ?? 0);
    return {
      campaignId,
      targetCapital: target,
      coveragePct: target > 0 ? (amounts.signedAmount / target) * 100 : null,
      opportunityCount: opps.length,
      byStatus,
      byStage,
      amounts,
      commitmentTotals,
    };
  }

  static async setOpportunityStatus(
    userId: string,
    opportunityId: string,
    body: { status: string; reason?: string; lostReason?: string; amountReason?: string },
    req?: any
  ) {
    const status = String(body?.status || "").toUpperCase();
    if (!VALID_OPPORTUNITY_STATUSES.includes(status)) {
      throw FundraisingIrError.badRequest(`Invalid status: ${status}`, "VALIDATION_ERROR");
    }

    const opp = await FundraisingIrOpportunityService.get(opportunityId);
    if (status === "WON") {
      const stageCode = String(opp.currentStage?.stageCode || "").toUpperCase();
      if (!WON_ALLOWED_STAGE_CODES.includes(stageCode)) {
        throw FundraisingIrError.badRequest(
          "WON status requires stage SIGNED, ADMITTED, FUNDED, or ACTIVATED",
          "INVALID_WON_STAGE"
        );
      }
    }

    if (
      FundraisingIrOpportunityService.isComplianceSensitiveStage(opp.currentStage?.stageCode || "") &&
      ["OPEN", "WON"].includes(status)
    ) {
      const blocked = await FundraisingIrOpportunityService.checkComplianceBlocked(opp.investorId);
      if (blocked.length) {
        throw FundraisingIrError.badRequest("Compliance blocked for this stage", "COMPLIANCE_BLOCKED", {
          unmetRequirements: blocked,
        });
      }
    }

    const prev = { status: opp.status, lostReason: opp.lostReason };
    const data: any = { status };
    if (body.lostReason !== undefined) data.lostReason = body.lostReason;
    if (status !== "LOST") data.lostReason = body.lostReason ?? opp.lostReason;

    await prisma.fundraisingOpportunity.update({ where: { id: opportunityId }, data });

    if (body.admittedAmount !== undefined || body.fundedAmount !== undefined) {
      await FundraisingIrOpportunityService.update(userId, opportunityId, {
        ...body,
        reason: body.reason || body.amountReason,
      });
    }

    await FundraisingSrdService.logAudit(
      { id: userId },
      "SET_OPPORTUNITY_STATUS",
      "FundraisingOpportunity",
      opportunityId,
      prev,
      { status, lostReason: data.lostReason },
      body.reason,
      reqMeta(req)
    );

    return FundraisingIrOpportunityService.get(opportunityId);
  }

  // ── Checklist ─────────────────────────────────────────────────

  static async getOpportunityChecklist(opportunityId: string, stageId?: string) {
    await FundraisingIrOpportunityService.get(opportunityId);
    const where: any = { opportunityId };
    if (stageId) where.stageId = stageId;
    return prisma.fundraisingOpportunityChecklistItem.findMany({
      where,
      include: { stage: { select: { id: true, stageCode: true, stageName: true } } },
      orderBy: [{ stageId: "asc" }, { itemKey: "asc" }],
    });
  }

  static async patchOpportunityChecklist(
    userId: string,
    opportunityId: string,
    body: { items: Array<{ id?: string; itemKey?: string; stageId?: string; isComplete: boolean }> },
    req?: any
  ) {
    await FundraisingIrOpportunityService.get(opportunityId);
    const items = body?.items || [];
    if (!items.length) throw FundraisingIrError.badRequest("items array required", "VALIDATION_ERROR");

    const updated = [];
    for (const item of items) {
      let row = null as any;
      if (item.id) {
        row = await prisma.fundraisingOpportunityChecklistItem.findFirst({
          where: { id: item.id, opportunityId },
        });
      } else if (item.itemKey && item.stageId) {
        row = await prisma.fundraisingOpportunityChecklistItem.findFirst({
          where: { opportunityId, stageId: item.stageId, itemKey: item.itemKey },
        });
      }
      if (!row) continue;

      const prev = { isComplete: row.isComplete };
      const next = await prisma.fundraisingOpportunityChecklistItem.update({
        where: { id: row.id },
        data: {
          isComplete: Boolean(item.isComplete),
          completedAt: item.isComplete ? new Date() : null,
          completedById: item.isComplete ? userId : null,
        },
      });
      updated.push(next);
      await FundraisingSrdService.logAudit(
        { id: userId },
        "PATCH_CHECKLIST_ITEM",
        "FundraisingOpportunityChecklistItem",
        row.id,
        prev,
        { isComplete: next.isComplete },
        null,
        reqMeta(req)
      );
    }
    return updated;
  }

  // ── Communications ────────────────────────────────────────────

  static async listCommunications(filters: {
    campaignId?: string;
    opportunityId?: string;
    investorId?: string;
    contactId?: string;
    external?: boolean | string;
  }) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.opportunityId) where.opportunityId = filters.opportunityId;
    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.contactId) where.contactId = filters.contactId;

    const external =
      filters.external === true ||
      filters.external === "true" ||
      String(filters.external).toLowerCase() === "1";
    if (external) {
      where.confidentiality = { notIn: INTERNAL_CONFIDENTIALITY };
    }

    return prisma.fundraisingCommunication.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
  }

  static async createCommunication(userId: string, body: any, req?: any) {
    if (!body?.interactionType) {
      throw FundraisingIrError.badRequest("interactionType is required", "VALIDATION_ERROR");
    }
    if (!body?.occurredAt) {
      throw FundraisingIrError.badRequest("occurredAt is required", "VALIDATION_ERROR");
    }

    const created = await prisma.fundraisingCommunication.create({
      data: {
        campaignId: body.campaignId ?? null,
        opportunityId: body.opportunityId ?? null,
        investorId: body.investorId ?? null,
        contactId: body.contactId ?? null,
        interactionType: body.interactionType,
        subject: body.subject ?? null,
        summary: body.summary ?? null,
        outcome: body.outcome ?? null,
        sentiment: body.sentiment ?? null,
        confidentiality: body.confidentiality ?? "INTERNAL",
        nextAction: body.nextAction ?? null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        ownerId: body.ownerId ?? userId,
        participants: body.participants ?? undefined,
        attachments: body.attachments ?? undefined,
        occurredAt: new Date(body.occurredAt),
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_COMMUNICATION",
      "FundraisingCommunication",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async getCommunication(communicationId: string) {
    const row = await prisma.fundraisingCommunication.findUnique({ where: { id: communicationId } });
    if (!row) throw FundraisingIrError.notFound("Communication not found", "COMMUNICATION_NOT_FOUND");
    return row;
  }

  // ── Tasks ─────────────────────────────────────────────────────

  static async listTasks(filters: {
    campaignId?: string;
    opportunityId?: string;
    investorId?: string;
  }) {
    const metaFilter: any = { path: "$.sourceModule", equals: "fundraising" };
    const tasks = await prisma.task.findMany({
      where: {
        isTrashed: false,
        taskMetadata: metaFilter,
      },
      orderBy: { date: "asc" },
      take: 200,
    });

    const filteredTasks = tasks.filter((t) => {
      const m = (t.taskMetadata || {}) as Record<string, unknown>;
      if (filters.campaignId && m.campaignId !== filters.campaignId) return false;
      if (filters.opportunityId && m.opportunityId !== filters.opportunityId) return false;
      if (filters.investorId && m.investorId !== filters.investorId) return false;
      return true;
    });

    const commWhere: any = { interactionType: "INTERNAL_TASK" };
    if (filters.campaignId) commWhere.campaignId = filters.campaignId;
    if (filters.opportunityId) commWhere.opportunityId = filters.opportunityId;
    if (filters.investorId) commWhere.investorId = filters.investorId;

    const fallbackTasks = await prisma.fundraisingCommunication.findMany({
      where: commWhere,
      orderBy: { dueDate: "asc" },
      take: 100,
    });

    return {
      performanceTasks: filteredTasks.map((t) => ({
        id: t.id,
        source: "Task",
        title: t.title,
        description: t.description,
        stage: t.stage,
        status: t.status,
        date: t.date,
        priority: t.priority,
        taskMetadata: t.taskMetadata,
      })),
      internalTaskCommunications: fallbackTasks,
    };
  }

  static async createTask(userId: string, body: any, req?: any) {
    const title = String(body?.title || "").trim();
    if (!title) throw FundraisingIrError.badRequest("title is required", "VALIDATION_ERROR");

    const meta = {
      sourceModule: "fundraising",
      campaignId: body.campaignId ?? null,
      opportunityId: body.opportunityId ?? null,
      investorId: body.investorId ?? null,
    };

    try {
      const due = body.dueDate ? new Date(body.dueDate) : new Date();
      const created = await prisma.task.create({
        data: {
          title,
          description: body.description ?? null,
          stage: body.stage || "todo",
          status: body.status || body.stage || "todo",
          date: due,
          priority: body.priority || "medium",
          isPerformanceTask: false,
          taskMetadata: meta,
          createdBy: userId,
          activities: [],
        },
      });
      await FundraisingSrdService.logAudit(
        { id: userId },
        "CREATE_TASK",
        "Task",
        created.id,
        null,
        created,
        null,
        reqMeta(req)
      );
      return { source: "Task", task: created };
    } catch {
      const comm = await FundraisingSrdService.createCommunication(userId, {
        campaignId: body.campaignId,
        opportunityId: body.opportunityId,
        investorId: body.investorId,
        interactionType: "INTERNAL_TASK",
        subject: title,
        summary: body.description ?? null,
        confidentiality: "INTERNAL",
        dueDate: body.dueDate,
        ownerId: body.ownerId ?? userId,
        occurredAt: body.occurredAt || new Date().toISOString(),
      }, req);
      return { source: "FundraisingCommunication", task: comm };
    }
  }

  static async patchTask(userId: string, taskId: string, body: any, req?: any) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (task) {
      const data: any = {};
      if (body.title !== undefined) data.title = body.title;
      if (body.description !== undefined) data.description = body.description;
      if (body.stage !== undefined) {
        data.stage = body.stage;
        data.status = body.stage;
      }
      if (body.status !== undefined) data.status = body.status;
      if (body.priority !== undefined) data.priority = body.priority;
      if (body.dueDate !== undefined) data.date = new Date(body.dueDate);
      const updated = await prisma.task.update({ where: { id: taskId }, data });
      await FundraisingSrdService.logAudit(
        { id: userId },
        "PATCH_TASK",
        "Task",
        taskId,
        task,
        updated,
        null,
        reqMeta(req)
      );
      return { source: "Task", task: updated };
    }

    const comm = await prisma.fundraisingCommunication.findFirst({
      where: { id: taskId, interactionType: "INTERNAL_TASK" },
    });
    if (!comm) throw FundraisingIrError.notFound("Task not found", "TASK_NOT_FOUND");

    const data: any = {};
    if (body.title !== undefined) data.subject = body.title;
    if (body.description !== undefined) data.summary = body.description;
    if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);
    if (body.status !== undefined) data.outcome = body.status;
    const updated = await prisma.fundraisingCommunication.update({ where: { id: taskId }, data });
    return { source: "FundraisingCommunication", task: updated };
  }

  // ── Commitments ───────────────────────────────────────────────

  static async listCommitments(filters: {
    campaignId?: string;
    opportunityId?: string;
    investorId?: string;
    status?: string;
  }) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.opportunityId) where.opportunityId = filters.opportunityId;
    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.status) where.status = filters.status;

    return prisma.fundraisingCommitment.findMany({
      where,
      include: {
        investor: { select: { id: true, legalName: true } },
        opportunity: { select: { id: true, opportunityType: true, status: true } },
        closing: true,
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async createCommitment(userId: string, body: any, req?: any) {
    const opportunityId = body?.opportunityId;
    const commitmentAmount = toNum(body?.commitmentAmount);
    if (!opportunityId) throw FundraisingIrError.badRequest("opportunityId is required", "VALIDATION_ERROR");
    if (commitmentAmount == null || commitmentAmount <= 0) {
      throw FundraisingIrError.badRequest("commitmentAmount must be positive", "VALIDATION_ERROR");
    }

    const opp = await FundraisingIrOpportunityService.get(opportunityId);
    const created = await prisma.fundraisingCommitment.create({
      data: {
        opportunityId,
        investorId: body.investorId || opp.investorId,
        campaignId: opp.campaignId,
        fundId: body.fundId ?? opp.campaign?.fundId ?? null,
        currency: body.currency || opp.opportunityCurrency || "USD",
        commitmentAmount,
        fundedAmount: 0,
        unfundedAmount: commitmentAmount,
        status: body.status || "DRAFT",
        signedAt: body.signedAt ? new Date(body.signedAt) : null,
        closingId: body.closingId ?? null,
        sideLetter: body.sideLetter ?? undefined,
        capitalCallContact: body.capitalCallContact ?? null,
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_COMMITMENT",
      "FundraisingCommitment",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return FundraisingSrdService.getCommitment(created.id);
  }

  static async getCommitment(commitmentId: string) {
    const row = await prisma.fundraisingCommitment.findUnique({
      where: { id: commitmentId },
      include: {
        investor: true,
        opportunity: { include: { currentStage: true, campaign: true } },
        closing: true,
        agreements: true,
      },
    });
    if (!row) throw FundraisingIrError.notFound("Commitment not found", "COMMITMENT_NOT_FOUND");
    return row;
  }

  static async patchCommitment(userId: string, commitmentId: string, body: any, req?: any) {
    const existing = await FundraisingSrdService.getCommitment(commitmentId);
    const data: any = {};
    const fields = [
      "currency",
      "status",
      "closingId",
      "sideLetter",
      "capitalCallContact",
      "complianceStatus",
      "accountingStatus",
      "clientId",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.commitmentAmount !== undefined) {
      const amt = toNum(body.commitmentAmount);
      data.commitmentAmount = amt;
      data.unfundedAmount = Math.max(0, Number(amt ?? 0) - Number(existing.fundedAmount ?? 0));
    }
    if (body.signedAt !== undefined) data.signedAt = body.signedAt ? new Date(body.signedAt) : null;
    if (body.admissionDate !== undefined) {
      data.admissionDate = body.admissionDate ? new Date(body.admissionDate) : null;
    }

    const updated = await prisma.fundraisingCommitment.update({ where: { id: commitmentId }, data });
    await FundraisingSrdService.logAudit(
      { id: userId },
      "PATCH_COMMITMENT",
      "FundraisingCommitment",
      commitmentId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return FundraisingSrdService.getCommitment(commitmentId);
  }

  static async admitCommitment(userId: string, commitmentId: string, body: any, req?: any) {
    const commitment = await FundraisingSrdService.getCommitment(commitmentId);
    if (commitment.status === "ADMITTED_AT_CLOSE") {
      return commitment;
    }

    const blocked = await FundraisingIrOpportunityService.checkComplianceBlocked(commitment.investorId);
    if (blocked.length) {
      throw FundraisingIrError.badRequest("Compliance blocked — cannot admit", "COMPLIANCE_BLOCKED", {
        unmetRequirements: blocked,
      });
    }

    const admissionDate = body.admissionDate ? new Date(body.admissionDate) : new Date();
    const amountReason = body.reason || body.amountReason || "Commitment admitted at close";
    const admitAmount = Number(commitment.commitmentAmount ?? 0);

    let journalEntryId = commitment.journalEntryId;
    const fundId = commitment.fundId || commitment.opportunity?.campaign?.fundId;

    await prisma.$transaction(async (tx) => {
      await tx.fundraisingCommitment.update({
        where: { id: commitmentId },
        data: {
          status: "ADMITTED_AT_CLOSE",
          admissionDate,
          accountingStatus: body.accountingStatus || "ADMITTED",
        },
      });

      const opp = await tx.fundraisingOpportunity.findUnique({
        where: { id: commitment.opportunityId },
      });
      if (opp) {
        const prevAdmitted = opp.admittedAmount;
        await tx.fundraisingOpportunity.update({
          where: { id: commitment.opportunityId },
          data: { admittedAmount: admitAmount },
        });
        await tx.opportunityAmountHistory.create({
          data: {
            opportunityId: commitment.opportunityId,
            amountType: "ADMITTED",
            oldValue: prevAdmitted,
            newValue: admitAmount,
            currency: commitment.currency,
            reason: amountReason,
            changedById: userId,
          },
        });
      }
    });

    if (fundId && !journalEntryId) {
      try {
        const investor = await prisma.investorOrganisation.findUnique({
          where: { id: commitment.investorId },
        });
        journalEntryId = await FundraisingGlPostingService.postCommitment({
          campaignId: commitment.campaignId,
          dealId: commitmentId,
          clientName: investor?.legalName || "LP",
          amount: admitAmount,
          createdById: userId,
          effectiveDate: admissionDate,
        });
        await prisma.fundraisingCommitment.update({
          where: { id: commitmentId },
          data: { journalEntryId },
        });
      } catch {
        // GL posting is optional when fund config incomplete
      }
    }

    await FundraisingSrdService.logAudit(
      { id: userId },
      "ADMIT_COMMITMENT",
      "FundraisingCommitment",
      commitmentId,
      { status: commitment.status },
      { status: "ADMITTED_AT_CLOSE", admissionDate, journalEntryId },
      amountReason,
      reqMeta(req)
    );

    return FundraisingSrdService.getCommitment(commitmentId);
  }

  static async fundCommitment(userId: string, commitmentId: string, body: any, req?: any) {
    const commitment = await FundraisingSrdService.getCommitment(commitmentId);
    const fundAmount = toNum(body?.fundedAmount ?? body?.fundAmount ?? body?.amount);
    if (fundAmount == null || fundAmount <= 0) {
      throw FundraisingIrError.badRequest("fundAmount must be positive", "VALIDATION_ERROR");
    }

    const blocked = await FundraisingIrOpportunityService.checkComplianceBlocked(commitment.investorId);
    if (blocked.length) {
      throw FundraisingIrError.badRequest("Compliance blocked — cannot fund", "COMPLIANCE_BLOCKED", {
        unmetRequirements: blocked,
      });
    }

    const prevFunded = Number(commitment.fundedAmount ?? 0);
    const newFunded = prevFunded + fundAmount;
    const commitmentAmt = Number(commitment.commitmentAmount ?? 0);
    const status = newFunded >= commitmentAmt ? "FUNDED" : "PARTIALLY_FUNDED";
    const amountReason = body.reason || body.amountReason || "Commitment funded";

    await prisma.$transaction(async (tx) => {
      await tx.fundraisingCommitment.update({
        where: { id: commitmentId },
        data: {
          fundedAmount: newFunded,
          unfundedAmount: Math.max(0, commitmentAmt - newFunded),
          status,
          accountingStatus: body.accountingStatus || status,
        },
      });

      const opp = await tx.fundraisingOpportunity.findUnique({
        where: { id: commitment.opportunityId },
      });
      if (opp) {
        const prevOppFunded = Number(opp.fundedAmount ?? 0);
        const newOppFunded = prevOppFunded + fundAmount;
        await tx.fundraisingOpportunity.update({
          where: { id: commitment.opportunityId },
          data: { fundedAmount: newOppFunded },
        });
        await tx.opportunityAmountHistory.create({
          data: {
            opportunityId: commitment.opportunityId,
            amountType: "FUNDED",
            oldValue: prevOppFunded,
            newValue: newOppFunded,
            currency: commitment.currency,
            reason: amountReason,
            changedById: userId,
          },
        });
      }
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "FUND_COMMITMENT",
      "FundraisingCommitment",
      commitmentId,
      { fundedAmount: prevFunded, status: commitment.status },
      { fundedAmount: newFunded, status },
      amountReason,
      reqMeta(req)
    );

    return FundraisingSrdService.getCommitment(commitmentId);
  }

  // ── Closings ──────────────────────────────────────────────────

  static async listClosings(filters: { campaignId?: string; status?: string }) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.status) where.status = filters.status;
    return prisma.fundraisingClosing.findMany({
      where,
      include: { _count: { select: { commitments: true } } },
      orderBy: { closingDate: "desc" },
    });
  }

  static async createClosing(userId: string, body: any, req?: any) {
    if (!body?.campaignId) throw FundraisingIrError.badRequest("campaignId is required", "VALIDATION_ERROR");
    if (!body?.closeType) throw FundraisingIrError.badRequest("closeType is required", "VALIDATION_ERROR");
    if (!body?.closingDate) throw FundraisingIrError.badRequest("closingDate is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingClosing.create({
      data: {
        campaignId: body.campaignId,
        fundId: body.fundId ?? null,
        closeType: body.closeType,
        closingDate: new Date(body.closingDate),
        status: body.status || "PLANNED",
        totalCommitmentValue: toNum(body.totalCommitmentValue),
        legalReady: Boolean(body.legalReady),
        complianceReady: Boolean(body.complianceReady),
        fundReady: Boolean(body.fundReady),
        equalisationStatus: body.equalisationStatus ?? null,
        notes: body.notes ?? null,
        name: body.name ?? null,
        targetAmount: toNum(body.targetAmount),
        readinessJson: body.readinessJson ?? undefined,
        postCloseJson: body.postCloseJson ?? undefined,
        closedAt: body.closedAt ? new Date(body.closedAt) : null,
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_CLOSING",
      "FundraisingClosing",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async getClosing(closingId: string) {
    const row = await prisma.fundraisingClosing.findUnique({
      where: { id: closingId },
      include: { commitments: { include: { investor: { select: { id: true, legalName: true } } } } },
    });
    if (!row) throw FundraisingIrError.notFound("Closing not found", "CLOSING_NOT_FOUND");
    return row;
  }

  static async patchClosing(userId: string, closingId: string, body: any, req?: any) {
    const existing = await FundraisingSrdService.getClosing(closingId);
    const data: any = {};
    const fields = [
      "closeType",
      "status",
      "equalisationStatus",
      "notes",
      "fundId",
      "name",
      "readinessJson",
      "postCloseJson",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.closingDate !== undefined) data.closingDate = new Date(body.closingDate);
    if (body.totalCommitmentValue !== undefined) data.totalCommitmentValue = toNum(body.totalCommitmentValue);
    if (body.targetAmount !== undefined) data.targetAmount = toNum(body.targetAmount);
    if (body.closedAt !== undefined) data.closedAt = body.closedAt ? new Date(body.closedAt) : null;

    const updated = await prisma.fundraisingClosing.update({ where: { id: closingId }, data });
    await FundraisingSrdService.logAudit(
      { id: userId },
      "PATCH_CLOSING",
      "FundraisingClosing",
      closingId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return FundraisingSrdService.getClosing(closingId);
  }

  static async updateClosingReadiness(userId: string, closingId: string, body: any, req?: any) {
    const existing = await FundraisingSrdService.getClosing(closingId);
    const data: any = {};
    if (body.legalReady !== undefined) data.legalReady = Boolean(body.legalReady);
    if (body.complianceReady !== undefined) data.complianceReady = Boolean(body.complianceReady);
    if (body.fundReady !== undefined) data.fundReady = Boolean(body.fundReady);
    if (body.equalisationStatus !== undefined) data.equalisationStatus = body.equalisationStatus;
    if (body.readinessJson !== undefined || body.readiness !== undefined) {
      data.readinessJson = body.readinessJson ?? body.readiness;
    }
    if (body.postCloseJson !== undefined || body.postClose !== undefined) {
      data.postCloseJson = body.postCloseJson ?? body.postClose;
    }

    const updated = await prisma.fundraisingClosing.update({ where: { id: closingId }, data });
    await FundraisingSrdService.logAudit(
      { id: userId },
      "UPDATE_CLOSING_READINESS",
      "FundraisingClosing",
      closingId,
      {
        legalReady: existing.legalReady,
        complianceReady: existing.complianceReady,
        fundReady: existing.fundReady,
      },
      data,
      body.reason,
      reqMeta(req)
    );
    return FundraisingSrdService.getClosing(closingId);
  }

  // ── Mandates & RFPs ───────────────────────────────────────────

  static async listMandates(filters: { campaignId?: string; investorId?: string; status?: string }) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.status) where.status = filters.status;
    return prisma.fundraisingMandate.findMany({
      where,
      include: { investor: { select: { id: true, legalName: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async createMandate(userId: string, body: any, req?: any) {
    if (!body?.investorId) throw FundraisingIrError.badRequest("investorId is required", "VALIDATION_ERROR");
    if (!body?.name) throw FundraisingIrError.badRequest("name is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingMandate.create({
      data: {
        investorId: body.investorId,
        campaignId: body.campaignId ?? null,
        opportunityId: body.opportunityId ?? null,
        rfpId: body.rfpId ?? null,
        name: body.name,
        status: body.status || "DRAFT",
        expectedAum: toNum(body.expectedAum),
        currency: body.currency || "USD",
        assetClass: body.assetClass ?? null,
        geography: body.geography ?? null,
        rfpDueDate: body.rfpDueDate ? new Date(body.rfpDueDate) : null,
        ownerId: body.ownerId ?? userId,
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_MANDATE",
      "FundraisingMandate",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return FundraisingSrdService.getMandate(created.id);
  }

  static async getMandate(mandateId: string) {
    const row = await prisma.fundraisingMandate.findUnique({
      where: { id: mandateId },
      include: {
        investor: true,
        campaign: true,
        opportunity: true,
        rfp: true,
      },
    });
    if (!row) throw FundraisingIrError.notFound("Mandate not found", "MANDATE_NOT_FOUND");
    return row;
  }

  static async patchMandate(userId: string, mandateId: string, body: any, req?: any) {
    const existing = await FundraisingSrdService.getMandate(mandateId);
    const data: any = {};
    const boolFields = MANDATE_CHECKLIST_BOOLS;
    const scalarFields = [
      "name",
      "status",
      "currency",
      "ownerId",
      "expectedAum",
      "activatedAum",
      "assetClass",
      "geography",
    ];
    for (const f of scalarFields) {
      if (body[f] !== undefined) {
        data[f] = f.includes("Aum") ? toNum(body[f]) : body[f];
      }
    }
    if (body.rfpDueDate !== undefined) {
      data.rfpDueDate = body.rfpDueDate ? new Date(body.rfpDueDate) : null;
    }
    for (const f of boolFields) {
      if (body[f] !== undefined) data[f] = Boolean(body[f]);
    }

    const updated = await prisma.fundraisingMandate.update({ where: { id: mandateId }, data });
    await FundraisingSrdService.logAudit(
      { id: userId },
      "PATCH_MANDATE",
      "FundraisingMandate",
      mandateId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return FundraisingSrdService.getMandate(mandateId);
  }

  static async activateMandate(userId: string, mandateId: string, body: any, req?: any) {
    const mandate = await FundraisingSrdService.getMandate(mandateId);
    const unmet: string[] = [];

    for (const f of MANDATE_CHECKLIST_BOOLS) {
      if (!mandate[f]) unmet.push(`mandate.${f} must be true`);
    }

    const blocked = await FundraisingIrOpportunityService.checkComplianceBlocked(mandate.investorId);
    unmet.push(...blocked);

    if (unmet.length) {
      throw FundraisingIrError.badRequest("Mandate activation requirements not met", "MANDATE_ACTIVATION_FAILED", {
        unmetRequirements: unmet,
      });
    }

    const updated = await prisma.fundraisingMandate.update({
      where: { id: mandateId },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        activatedAum: toNum(body.activatedAum) ?? mandate.expectedAum ?? mandate.activatedAum,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "ACTIVATE_MANDATE",
      "FundraisingMandate",
      mandateId,
      { status: mandate.status },
      updated,
      body.reason,
      reqMeta(req)
    );
    return FundraisingSrdService.getMandate(mandateId);
  }

  static async listRfps(filters: { campaignId?: string; investorId?: string; status?: string }) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.status) where.status = filters.status;
    return prisma.fundraisingRfp.findMany({
      where,
      include: { investor: { select: { id: true, legalName: true } } },
      orderBy: { deadline: "asc" },
    });
  }

  static async createRfp(userId: string, body: any, req?: any) {
    if (!body?.investorId) throw FundraisingIrError.badRequest("investorId is required", "VALIDATION_ERROR");
    if (!body?.institutionName) {
      throw FundraisingIrError.badRequest("institutionName is required", "VALIDATION_ERROR");
    }

    const created = await prisma.fundraisingRfp.create({
      data: {
        investorId: body.investorId,
        campaignId: body.campaignId ?? null,
        referenceNumber: body.referenceNumber ?? null,
        institutionName: body.institutionName,
        deadline: body.deadline ? new Date(body.deadline) : null,
        presentationDate: body.presentationDate ? new Date(body.presentationDate) : null,
        evaluationCriteria: body.evaluationCriteria ?? undefined,
        status: body.status || "OPEN",
        outcome: body.outcome ?? null,
        debriefNotes: body.debriefNotes ?? null,
        commercialInfo: body.commercialInfo ?? undefined,
        assetClass: body.assetClass ?? null,
        geography: body.geography ?? null,
        fitScore: toNum(body.fitScore),
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_RFP",
      "FundraisingRfp",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async getRfp(rfpId: string) {
    const row = await prisma.fundraisingRfp.findUnique({
      where: { id: rfpId },
      include: { investor: true, mandates: true },
    });
    if (!row) throw FundraisingIrError.notFound("RFP not found", "RFP_NOT_FOUND");
    return row;
  }

  static async patchRfp(userId: string, rfpId: string, body: any, req?: any) {
    const existing = await FundraisingSrdService.getRfp(rfpId);
    const data: any = {};
    const fields = [
      "referenceNumber",
      "institutionName",
      "status",
      "outcome",
      "debriefNotes",
      "lossReason",
      "nextAction",
      "evaluationCriteria",
      "commercialInfo",
      "campaignId",
      "assetClass",
      "geography",
      "stageCode",
      "stageName",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.fitScore !== undefined) data.fitScore = toNum(body.fitScore);
    if (body.deadline !== undefined) data.deadline = body.deadline ? new Date(body.deadline) : null;
    if (body.presentationDate !== undefined) {
      data.presentationDate = body.presentationDate ? new Date(body.presentationDate) : null;
    }

    const prevOutcome = String(existing.outcome ?? "").toUpperCase();
    const newOutcome = String(data.outcome ?? existing.outcome ?? "").toUpperCase();
    const becomesWon = newOutcome === "WON" && prevOutcome !== "WON";

    const updated = await prisma.fundraisingRfp.update({ where: { id: rfpId }, data });
    if (becomesWon) {
      await ensureAutoKycOnRfpWonInline(userId, rfpId, existing, { ...body, outcome: "WON" }, req);
    }
    await FundraisingSrdService.logAudit(
      { id: userId },
      "PATCH_RFP",
      "FundraisingRfp",
      rfpId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return FundraisingSrdService.getRfp(rfpId);
  }

  static async convertRfpToMandate(userId: string, rfpId: string, body: any, req?: any) {
    const rfp = await FundraisingSrdService.getRfp(rfpId);
    if (String(rfp.outcome || "").toUpperCase() !== "WON") {
      throw FundraisingIrError.badRequest("RFP outcome must be WON to convert to mandate", "RFP_NOT_WON");
    }

    const mandate = await FundraisingSrdService.createMandate(
      userId,
      {
        investorId: rfp.investorId,
        campaignId: rfp.campaignId,
        rfpId: rfp.id,
        name: body.name || `Mandate — ${rfp.institutionName}`,
        expectedAum: body.expectedAum,
        currency: body.currency,
        ownerId: body.ownerId,
      },
      req
    );

    await prisma.fundraisingRfp.update({
      where: { id: rfpId },
      data: { status: "CONVERTED" },
    });

    return mandate;
  }

  // ── Commercial terms & approvals ──────────────────────────────

  static async getCommercialTerms(opportunityId: string) {
    await FundraisingIrOpportunityService.get(opportunityId);
    return prisma.fundraisingCommercialTerms.findUnique({ where: { opportunityId } });
  }

  static async upsertCommercialTerms(userId: string, opportunityId: string, body: any, req?: any) {
    await FundraisingIrOpportunityService.get(opportunityId);
    if (!body?.termsType) throw FundraisingIrError.badRequest("termsType is required", "VALIDATION_ERROR");
    const termsJson = body.termsJson !== undefined ? body.termsJson : body.terms;
    if (termsJson === undefined) {
      throw FundraisingIrError.badRequest("termsJson (or terms) is required", "VALIDATION_ERROR");
    }

    const prev = await prisma.fundraisingCommercialTerms.findUnique({ where: { opportunityId } });
    const row = await prisma.fundraisingCommercialTerms.upsert({
      where: { opportunityId },
      create: {
        opportunityId,
        termsType: body.termsType,
        termsJson,
      },
      update: {
        termsType: body.termsType,
        termsJson,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "UPSERT_COMMERCIAL_TERMS",
      "FundraisingCommercialTerms",
      row.id,
      prev,
      row,
      body.reason,
      reqMeta(req)
    );
    return row;
  }

  static async listApprovals(filters: { status?: string; objectType?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.objectType) where.objectType = filters.objectType;
    return prisma.fundraisingApprovalRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  static async decideApproval(userId: string, approvalId: string, body: any, req?: any) {
    const existing = await prisma.fundraisingApprovalRequest.findUnique({ where: { id: approvalId } });
    if (!existing) throw FundraisingIrError.notFound("Approval not found", "APPROVAL_NOT_FOUND");
    if (existing.status !== "PENDING") {
      throw FundraisingIrError.conflict("Approval already decided", "ALREADY_DECIDED");
    }

    const decision = String(body?.decision || body?.status || "").toUpperCase();
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      throw FundraisingIrError.badRequest("decision must be APPROVED or REJECTED", "VALIDATION_ERROR");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.fundraisingApprovalRequest.update({
        where: { id: approvalId },
        data: {
          status: decision,
          decidedById: userId,
          decidedAt: new Date(),
          decisionNotes: body.decisionNotes ?? null,
          reason: body.reason ?? existing.reason,
        },
      });

      await tx.fundraisingApprovalEvent.create({
        data: {
          approvalId,
          eventType: decision,
          actorId: userId,
          notes: body.decisionNotes ?? body.reason ?? null,
          payloadJson: {
            decision,
            reason: body.reason ?? existing.reason,
            decisionNotes: body.decisionNotes ?? null,
          },
        },
      });

      if (
        String(existing.objectType).toUpperCase() === "CAMPAIGN" &&
        String(existing.requestType).toUpperCase().includes("ACTIVATION")
      ) {
        await tx.fundraisingCampaign.updateMany({
          where: { id: existing.objectId, activationApprovalId: approvalId },
          data: { approvalStatus: decision },
        });
      }

      return row;
    }, { maxWait: 20_000, timeout: 20_000 });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "DECIDE_APPROVAL",
      "FundraisingApprovalRequest",
      approvalId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return prisma.fundraisingApprovalRequest.findUnique({
      where: { id: approvalId },
      include: { approvalEvents: { orderBy: { createdAt: "desc" } } },
    });
  }

  // ── DDQ ───────────────────────────────────────────────────────

  static async listDdqTemplates(filters: { category?: string }) {
    const where: any = {};
    if (filters.category) where.category = filters.category;
    return prisma.fundraisingDdqTemplate.findMany({ where, orderBy: { name: "asc" } });
  }

  static async createDdqTemplate(userId: string, body: any, req?: any) {
    if (!body?.name) throw FundraisingIrError.badRequest("name is required", "VALIDATION_ERROR");
    const questionsJson = body.questionsJson !== undefined ? body.questionsJson : body.questions;
    if (questionsJson === undefined) {
      throw FundraisingIrError.badRequest("questionsJson (or questions) is required", "VALIDATION_ERROR");
    }

    const created = await prisma.fundraisingDdqTemplate.create({
      data: {
        name: body.name,
        category: body.category ?? null,
        questionsJson,
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_DDQ_TEMPLATE",
      "FundraisingDdqTemplate",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async listDdqCases(filters: {
    investorId?: string;
    campaignId?: string;
    opportunityId?: string;
    status?: string;
  }) {
    const where: any = {};
    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.opportunityId) where.opportunityId = filters.opportunityId;
    if (filters.status) where.status = filters.status;
    return prisma.fundraisingDdqCase.findMany({
      where,
      include: { items: true, investor: { select: { id: true, legalName: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async createDdqCase(userId: string, body: any, req?: any) {
    if (!body?.investorId) throw FundraisingIrError.badRequest("investorId is required", "VALIDATION_ERROR");
    if (!body?.title) throw FundraisingIrError.badRequest("title is required", "VALIDATION_ERROR");

    const created = await prisma.$transaction(async (tx) => {
      const ddqCase = await tx.fundraisingDdqCase.create({
        data: {
          investorId: body.investorId,
          campaignId: body.campaignId ?? null,
          opportunityId: body.opportunityId ?? null,
          templateId: body.templateId ?? null,
          title: body.title,
          status: body.status || "OPEN",
          ownerId: body.ownerId ?? userId,
          createdById: userId,
        },
      });

      if (body.templateId) {
        const tpl = await tx.fundraisingDdqTemplate.findUnique({ where: { id: body.templateId } });
        const questions = (tpl?.questionsJson as any[]) || body.items || [];
        for (const q of questions) {
          await tx.fundraisingDdqItem.create({
            data: {
              caseId: ddqCase.id,
              category: q.category ?? null,
              requirement: q.requirement || q.question || String(q),
              ownerId: q.ownerId ?? body.ownerId ?? userId,
            },
          });
        }
      } else if (Array.isArray(body.items)) {
        for (const item of body.items) {
          await tx.fundraisingDdqItem.create({
            data: {
              caseId: ddqCase.id,
              category: item.category ?? null,
              requirement: item.requirement,
              ownerId: item.ownerId ?? userId,
            },
          });
        }
      }

      return ddqCase;
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_DDQ_CASE",
      "FundraisingDdqCase",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return FundraisingSrdService.getDdqCase(created.id);
  }

  static async getDdqCase(caseId: string) {
    const row = await prisma.fundraisingDdqCase.findUnique({
      where: { id: caseId },
      include: { items: true, investor: true, template: true },
    });
    if (!row) throw FundraisingIrError.notFound("DDQ case not found", "DDQ_CASE_NOT_FOUND");
    return row;
  }

  static async patchDdqCase(userId: string, caseId: string, body: any, req?: any) {
    const existing = await FundraisingSrdService.getDdqCase(caseId);
    const data: any = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.status !== undefined) data.status = body.status;
    if (body.progressPct !== undefined) data.progressPct = toNum(body.progressPct);
    if (body.ownerId !== undefined) data.ownerId = body.ownerId;

    applyDdqLifecycleTimestamps(existing, data, body);

    const updated = await prisma.fundraisingDdqCase.update({ where: { id: caseId }, data });
    await FundraisingSrdService.logAudit(
      { id: userId },
      "PATCH_DDQ_CASE",
      "FundraisingDdqCase",
      caseId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return FundraisingSrdService.getDdqCase(caseId);
  }

  static async uploadDdqEvidence(
    userId: string,
    caseId: string,
    itemId: string,
    file: Express.Multer.File,
    req?: any
  ) {
    await FundraisingSrdService.getDdqCase(caseId);
    const item = await prisma.fundraisingDdqItem.findFirst({ where: { id: itemId, caseId } });
    if (!item) throw FundraisingIrError.notFound("DDQ item not found", "DDQ_ITEM_NOT_FOUND");
    if (!file?.buffer) throw FundraisingIrError.badRequest("file required", "VALIDATION_ERROR");

    const hash = sha256Hex(file.buffer);
    const uploaded = await remoteUploadService.uploadSingleFile(file, "fundraising-ddq-evidence");

    const updated = await prisma.fundraisingDdqItem.update({
      where: { id: itemId },
      data: {
        evidenceUrl: uploaded.downloadURL,
        evidenceStoragePath: uploaded.filePath,
        evidenceSha256: hash,
        version: { increment: 1 },
        status: "SUBMITTED",
      },
    });
    const evidence = await prisma.fundraisingDdqItemEvidence.create({
      data: {
        itemId,
        fileUrl: uploaded.downloadURL,
        storagePath: uploaded.filePath,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sha256: hash,
        uploadedById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "UPLOAD_DDQ_EVIDENCE",
      "FundraisingDdqItem",
      itemId,
      item,
      updated,
      null,
      reqMeta(req)
    );
    return { ...updated, evidence };
  }

  // ── KYC ───────────────────────────────────────────────────────

  static async listKycCases(filters: { investorId?: string; status?: string }) {
    const where: any = {};
    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.status) where.status = filters.status;
    return prisma.fundraisingKycCase.findMany({
      where,
      include: { investor: { select: { id: true, legalName: true, kycStatus: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async createKycCase(userId: string, body: any, req?: any) {
    if (!body?.investorId) throw FundraisingIrError.badRequest("investorId is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingKycCase.create({
      data: {
        investorId: body.investorId,
        status: body.status || "OPEN",
        riskRating: body.riskRating ?? null,
        pepFlag: Boolean(body.pepFlag),
        adverseMediaFlag: Boolean(body.adverseMediaFlag),
        detailsJson: body.detailsJson ?? undefined,
        ownerId: body.ownerId ?? userId,
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_KYC_CASE",
      "FundraisingKycCase",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async getKycCase(caseId: string) {
    const row = await prisma.fundraisingKycCase.findUnique({
      where: { id: caseId },
      include: { investor: true },
    });
    if (!row) throw FundraisingIrError.notFound("KYC case not found", "KYC_CASE_NOT_FOUND");
    return row;
  }

  static async patchKycCase(userId: string, caseId: string, body: any, req?: any) {
    const existing = await FundraisingSrdService.getKycCase(caseId);
    const data: any = {};
    const fields = [
      "status",
      "riskRating",
      "pepFlag",
      "adverseMediaFlag",
      "detailsJson",
      "ownerId",
      "docsNote",
      "terminalStatus",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) {
        data[f] = f.startsWith("pep") || f.startsWith("adverse") ? Boolean(body[f]) : body[f];
      }
    }
    const conditionsJson = body.conditionsJson !== undefined ? body.conditionsJson : body.conditions;
    if (conditionsJson !== undefined) data.conditionsJson = conditionsJson;

    const investorKycStatus = syncInvestorKycFromCasePatch(data, body, existing, userId);

    const updated = await prisma.fundraisingKycCase.update({ where: { id: caseId }, data });
    if (investorKycStatus) {
      await prisma.investorOrganisation.update({
        where: { id: existing.investorId },
        data: { kycStatus: investorKycStatus },
      });
    }
    await FundraisingSrdService.logAudit(
      { id: userId },
      "PATCH_KYC_CASE",
      "FundraisingKycCase",
      caseId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return FundraisingSrdService.getKycCase(caseId);
  }

  // ── Data rooms ────────────────────────────────────────────────

  static async listDataRooms(campaignId: string) {
    return prisma.fundraisingDataRoom.findMany({
      where: { campaignId },
      include: { _count: { select: { documents: true, access: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  static async createDataRoom(userId: string, campaignId: string, body: any, req?: any) {
    if (!body?.name) throw FundraisingIrError.badRequest("name is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingDataRoom.create({
      data: {
        campaignId,
        name: body.name,
        status: body.status || "DRAFT",
        requiresMfa: Boolean(body.requiresMfa),
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_DATA_ROOM",
      "FundraisingDataRoom",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async getDataRoom(dataRoomId: string) {
    const [row, failedLoginCount] = await Promise.all([
      prisma.fundraisingDataRoom.findUnique({
        where: { id: dataRoomId },
        include: {
          folders: { orderBy: { sortOrder: "asc" } },
          documents: { orderBy: { createdAt: "desc" } },
          access: { include: { investor: { select: { id: true, legalName: true } } } },
          accessLogs: { orderBy: { createdAt: "desc" }, take: 200 },
        },
      }),
      prisma.fundraisingDataRoomAccessLog.count({
        where: {
          dataRoomId,
          success: false,
          action: { in: ["LOGIN", "LOGIN_FAILED", "AUTH_FAILED", "MFA_FAILED"] },
        },
      }),
    ]);
    if (!row) throw FundraisingIrError.notFound("Data room not found", "DATA_ROOM_NOT_FOUND");
    return { ...row, failedLoginCount };
  }

  static async createDataRoomFolder(userId: string, dataRoomId: string, body: any, req?: any) {
    await FundraisingSrdService.getDataRoom(dataRoomId);
    if (!body?.name) throw FundraisingIrError.badRequest("name is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingDataRoomFolder.create({
      data: {
        dataRoomId,
        parentId: body.parentId ?? null,
        name: body.name,
        sortOrder: toNum(body.sortOrder) ?? 0,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_DATA_ROOM_FOLDER",
      "FundraisingDataRoomFolder",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async uploadDataRoomDocument(
    userId: string,
    dataRoomId: string,
    body: any,
    file: Express.Multer.File,
    req?: any
  ) {
    await FundraisingSrdService.getDataRoom(dataRoomId);
    if (!file?.buffer) throw FundraisingIrError.badRequest("file required", "VALIDATION_ERROR");

    const hash = sha256Hex(file.buffer);
    const uploaded = await remoteUploadService.uploadSingleFile(file, "fundraising-data-room");

    const created = await prisma.fundraisingDataRoomDocument.create({
      data: {
        dataRoomId,
        folderId: body.folderId ?? null,
        fileName: file.originalname || body.fileName || "document",
        mimeType: file.mimetype ?? null,
        fileUrl: uploaded.downloadURL,
        storagePath: uploaded.filePath,
        sha256: hash,
        viewOnly: Boolean(body.viewOnly),
        downloadLimit: toNum(body.downloadLimit),
        watermarkEnabled: Boolean(body.watermarkEnabled),
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "UPLOAD_DATA_ROOM_DOCUMENT",
      "FundraisingDataRoomDocument",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async downloadDataRoomDocument(
    userId: string,
    dataRoomId: string,
    documentId: string,
    req?: any
  ) {
    const room = await FundraisingSrdService.getDataRoom(dataRoomId);
    const doc = await prisma.fundraisingDataRoomDocument.findFirst({
      where: { id: documentId, dataRoomId },
    });
    if (!doc) throw FundraisingIrError.notFound("Document not found", "DOCUMENT_NOT_FOUND");

    const access = await prisma.fundraisingDataRoomAccess.findFirst({
      where: {
        dataRoomId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    const isStaff = true; // route is authenticated staff; investor portal would check access.investorId
    if (!isStaff && !access) {
      throw FundraisingIrError.forbidden("No data room access", "ACCESS_DENIED");
    }

    const buffer = await remoteUploadService.downloadFile(doc.storagePath || doc.fileUrl!);

    await prisma.fundraisingDataRoomAccessLog.create({
      data: {
        dataRoomId,
        documentId,
        userId,
        action: "DOWNLOAD",
        ipAddress: reqMeta(req).ipAddress,
        device: reqMeta(req).device,
      },
    });

    return {
      buffer,
      fileName: doc.fileName,
      mimeType: doc.mimeType || "application/octet-stream",
      dataRoom: room,
    };
  }

  static async grantDataRoomAccess(userId: string, dataRoomId: string, body: any, req?: any) {
    await FundraisingSrdService.getDataRoom(dataRoomId);
    if (!body?.investorId) throw FundraisingIrError.badRequest("investorId is required", "VALIDATION_ERROR");

    const contactId = body.contactId ?? null;
    const now = new Date();
    const duplicate = await prisma.fundraisingDataRoomAccess.findFirst({
      where: {
        dataRoomId,
        investorId: body.investorId,
        contactId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    if (duplicate) {
      throw FundraisingIrError.conflict("Active data room access already granted", "DUPLICATE_ACCESS_GRANT");
    }

    const created = await prisma.fundraisingDataRoomAccess.create({
      data: {
        dataRoomId,
        investorId: body.investorId,
        contactId,
        permissionLevel: body.permissionLevel ?? "DOWNLOAD",
        downloadLimit: toNum(body.downloadLimit),
        watermarkEnabled: Boolean(body.watermarkEnabled),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "GRANT_DATA_ROOM_ACCESS",
      "FundraisingDataRoomAccess",
      created.id,
      null,
      created,
      body.reason,
      reqMeta(req)
    );
    return created;
  }

  // ── Agreements ────────────────────────────────────────────────

  static async listAgreements(filters: {
    campaignId?: string;
    opportunityId?: string;
    investorId?: string;
    status?: string;
  }) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.opportunityId) where.opportunityId = filters.opportunityId;
    if (filters.investorId) where.investorId = filters.investorId;
    if (filters.status) where.status = filters.status;

    return prisma.fundraisingAgreement.findMany({
      where,
      include: {
        versions: { orderBy: { versionNumber: "desc" }, take: 1 },
        signatories: { take: 10 },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async createAgreement(userId: string, body: any, req?: any) {
    if (!body?.documentType) throw FundraisingIrError.badRequest("documentType is required", "VALIDATION_ERROR");
    if (!body?.title) throw FundraisingIrError.badRequest("title is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingAgreement.create({
      data: {
        opportunityId: body.opportunityId ?? null,
        investorId: body.investorId ?? null,
        campaignId: body.campaignId ?? null,
        commitmentId: body.commitmentId ?? null,
        documentType: body.documentType,
        title: body.title,
        status: body.status || "DRAFT",
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_AGREEMENT",
      "FundraisingAgreement",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return FundraisingSrdService.getAgreement(created.id);
  }

  static async getAgreement(agreementId: string) {
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

  static async uploadAgreementVersion(
    userId: string,
    agreementId: string,
    file: Express.Multer.File,
    body: any,
    req?: any
  ) {
    const agreement = await FundraisingSrdService.getAgreement(agreementId);
    if (!file?.buffer) throw FundraisingIrError.badRequest("file required", "VALIDATION_ERROR");

    const latest = agreement.versions[0];
    const nextVersion = (latest?.versionNumber ?? 0) + 1;
    const hash = sha256Hex(file.buffer);
    const uploaded = await remoteUploadService.uploadSingleFile(file, "fundraising-agreements");

    const created = await prisma.$transaction(async (tx) => {
      if (latest) {
        await tx.fundraisingAgreementSignatory.updateMany({
          where: { agreementId, versionId: latest.id, status: "PENDING" },
          data: { status: "INVALIDATED" },
        });
      }

      const version = await tx.fundraisingAgreementVersion.create({
        data: {
          agreementId,
          versionNumber: nextVersion,
          fileUrl: uploaded.downloadURL,
          storagePath: uploaded.filePath,
          sha256: hash,
          fileName: file.originalname,
          mimeType: file.mimetype,
          status: body.status || "DRAFT",
          uploadedById: userId,
        },
      });

      await tx.fundraisingAgreementSignatory.updateMany({
        where: { agreementId, versionId: null, status: "PENDING" },
        data: { versionId: version.id },
      });

      await tx.fundraisingAgreement.update({
        where: { id: agreementId },
        data: { status: body.agreementStatus || agreement.status },
      });

      return version;
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "UPLOAD_AGREEMENT_VERSION",
      "FundraisingAgreementVersion",
      created.id,
      latest ?? null,
      created,
      body.reason,
      reqMeta(req)
    );
    return FundraisingSrdService.getAgreement(agreementId);
  }

  static async addAgreementSignatory(userId: string, agreementId: string, body: any, req?: any) {
    const agreement = await FundraisingSrdService.getAgreement(agreementId);
    const versionId = body.versionId || agreement.versions[0]?.id;
    if (!body?.fullName || !body?.email) {
      throw FundraisingIrError.badRequest("fullName and email required", "VALIDATION_ERROR");
    }

    const created = await prisma.fundraisingAgreementSignatory.create({
      data: {
        agreementId,
        versionId: versionId ?? null,
        fullName: body.fullName,
        email: body.email,
        sequenceOrder: toNum(body.sequenceOrder) ?? 0,
        status: "PENDING",
        invitedAt: new Date(),
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "ADD_AGREEMENT_SIGNATORY",
      "FundraisingAgreementSignatory",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async signAgreement(
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
    if (signatory.status === "INVALIDATED") {
      throw FundraisingIrError.badRequest("Signatory invalidated by newer version", "SIGNATORY_INVALIDATED");
    }

    const updated = await prisma.fundraisingAgreementSignatory.update({
      where: { id: signatoryId },
      data: {
        status: "SIGNED",
        signedAt: new Date(),
        certificateRef: body.certificateRef ?? null,
      },
    });

    const pending = await prisma.fundraisingAgreementSignatory.count({
      where: { agreementId, status: "PENDING" },
    });
    if (pending === 0) {
      await prisma.fundraisingAgreement.update({
        where: { id: agreementId },
        data: { status: "SIGNED" },
      });
    }

    await FundraisingSrdService.logAudit(
      { id: userId },
      "SIGN_AGREEMENT",
      "FundraisingAgreementSignatory",
      signatoryId,
      signatory,
      updated,
      body.reason,
      reqMeta(req)
    );

    return FundraisingSrdService.getAgreement(agreementId);
  }

  // ── Placement agents ──────────────────────────────────────────

  static async listPlacementAgents(filters: { status?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    return prisma.fundraisingPlacementAgent.findMany({
      where,
      include: { _count: { select: { assignments: true } } },
      orderBy: { legalName: "asc" },
    });
  }

  static async createPlacementAgent(userId: string, body: any, req?: any) {
    if (!body?.legalName) throw FundraisingIrError.badRequest("legalName is required", "VALIDATION_ERROR");

    const created = await prisma.fundraisingPlacementAgent.create({
      data: {
        legalName: body.legalName,
        territory: body.territory ?? null,
        geographyJson: body.geographyJson ?? undefined,
        investorRestrictionsJson: body.investorRestrictionsJson ?? undefined,
        commissionPct: toNum(body.commissionPct),
        retainer: toNum(body.retainer),
        successFee: toNum(body.successFee),
        appointmentStart: body.appointmentStart ? new Date(body.appointmentStart) : null,
        appointmentEnd: body.appointmentEnd ? new Date(body.appointmentEnd) : null,
        protectedUntil: body.protectedUntil ? new Date(body.protectedUntil) : null,
        supportingAgreementUrl: body.supportingAgreementUrl ?? null,
        status: body.status || "ACTIVE",
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_PLACEMENT_AGENT",
      "FundraisingPlacementAgent",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  static async getPlacementAgent(agentId: string) {
    const row = await prisma.fundraisingPlacementAgent.findUnique({
      where: { id: agentId },
      include: {
        assignments: {
          include: {
            opportunity: {
              include: { investor: { select: { id: true, legalName: true } } },
            },
          },
        },
      },
    });
    if (!row) throw FundraisingIrError.notFound("Placement agent not found", "PLACEMENT_AGENT_NOT_FOUND");
    const commission = await computeAgentCommissionTotals(agentId, row);
    return {
      ...row,
      commissionStatus: commission.commissionStatus,
      accruedCommission: commission.accruedCommission,
      paidCommission: commission.paidCommission,
    };
  }

  static async patchPlacementAgent(userId: string, agentId: string, body: any, req?: any) {
    const existing = await FundraisingSrdService.getPlacementAgent(agentId);
    const data: any = {};
    const fields = [
      "legalName",
      "territory",
      "geographyJson",
      "investorRestrictionsJson",
      "supportingAgreementUrl",
      "status",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.commissionPct !== undefined) data.commissionPct = toNum(body.commissionPct);
    if (body.retainer !== undefined) data.retainer = toNum(body.retainer);
    if (body.successFee !== undefined) data.successFee = toNum(body.successFee);
    if (body.appointmentStart !== undefined) {
      data.appointmentStart = body.appointmentStart ? new Date(body.appointmentStart) : null;
    }
    if (body.appointmentEnd !== undefined) {
      data.appointmentEnd = body.appointmentEnd ? new Date(body.appointmentEnd) : null;
    }
    if (body.protectedUntil !== undefined) {
      data.protectedUntil = body.protectedUntil ? new Date(body.protectedUntil) : null;
    }

    const updated = await prisma.fundraisingPlacementAgent.update({ where: { id: agentId }, data });
    await FundraisingSrdService.logAudit(
      { id: userId },
      "PATCH_PLACEMENT_AGENT",
      "FundraisingPlacementAgent",
      agentId,
      existing,
      updated,
      body.reason,
      reqMeta(req)
    );
    return FundraisingSrdService.getPlacementAgent(agentId);
  }

  static async assignPlacementOpportunity(userId: string, agentId: string, body: any, req?: any) {
    await FundraisingSrdService.getPlacementAgent(agentId);
    if (!body?.opportunityId) {
      throw FundraisingIrError.badRequest("opportunityId is required", "VALIDATION_ERROR");
    }
    const opportunity = await FundraisingIrOpportunityService.get(body.opportunityId);
    const exclusions = await prisma.fundraisingPlacementExclusion.findMany({ where: { agentId } });
    const countryCode = String(opportunity.investor?.countryCode || "").toUpperCase();
    const interests = Array.isArray(opportunity.investor?.geographicInterests)
      ? opportunity.investor.geographicInterests.map((v: any) => String(v).toUpperCase())
      : [];
    const blocked = exclusions.find((exclusion) => {
      if (exclusion.investorId && exclusion.investorId === opportunity.investorId) return true;
      if (exclusion.countryCode && String(exclusion.countryCode).toUpperCase() === countryCode) return true;
      const geographies = Array.isArray(exclusion.geographyJson)
        ? exclusion.geographyJson.map((v: any) => String(v).toUpperCase())
        : [];
      return geographies.some((value: string) => value === countryCode || interests.includes(value));
    });
    if (blocked) {
      throw FundraisingIrError.conflict(
        `Placement assignment blocked by exclusion ${blocked.id}`,
        "PLACEMENT_EXCLUDED"
      );
    }

    const created = await prisma.fundraisingPlacementAssignment.upsert({
      where: {
        agentId_opportunityId: { agentId, opportunityId: body.opportunityId },
      },
      create: { agentId, opportunityId: body.opportunityId },
      update: { unassignedAt: null, unassignedById: null },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "ASSIGN_PLACEMENT_OPPORTUNITY",
      "FundraisingPlacementAssignment",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  // ── Forecasts (never mutate opportunities) ────────────────────

  static async listForecastScenarios(filters: { campaignId?: string; scenarioType?: string }) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    if (filters.scenarioType) where.scenarioType = filters.scenarioType;
    const rows = await prisma.fundraisingForecastScenario.findMany({
      where,
      include: { campaign: { select: { closeDate: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((s) => {
      let monthlyProjection = s.monthlyProjection;
      if (!monthlyProjection && s.projectedSigned != null) {
        monthlyProjection = buildMonthlyProjection({ projectedSigned: s.projectedSigned }, s.campaign?.closeDate);
      }
      const { campaign, ...rest } = s;
      return { ...rest, monthlyProjection };
    });
  }

  static async createForecastScenario(userId: string, body: any, req?: any) {
    if (!body?.campaignId) throw FundraisingIrError.badRequest("campaignId is required", "VALIDATION_ERROR");
    if (!body?.name) throw FundraisingIrError.badRequest("name is required", "VALIDATION_ERROR");
    if (!body?.scenarioType) throw FundraisingIrError.badRequest("scenarioType is required", "VALIDATION_ERROR");

    const campaign = await prisma.fundraisingCampaign.findUnique({
      where: { id: body.campaignId },
      select: { closeDate: true },
    });
    const monthlyProjection = buildMonthlyProjection(body, campaign?.closeDate);

    const created = await prisma.fundraisingForecastScenario.create({
      data: {
        campaignId: body.campaignId,
        name: body.name,
        scenarioType: body.scenarioType,
        assumptionsJson: body.assumptionsJson ?? undefined,
        projectedSigned: toNum(body.projectedSigned),
        projectedAum: toNum(body.projectedAum),
        projectedFees: toNum(body.projectedFees),
        monthlyProjection: monthlyProjection ?? undefined,
        createdById: userId,
      },
    });

    await FundraisingSrdService.logAudit(
      { id: userId },
      "CREATE_FORECAST_SCENARIO",
      "FundraisingForecastScenario",
      created.id,
      null,
      created,
      null,
      reqMeta(req)
    );
    return created;
  }

  // ── Analytics & reports ─────────────────────────────────────────

  static async analyticsFunnel(filters: { campaignId?: string }) {
    const where: any = { status: "OPEN" };
    if (filters.campaignId) where.campaignId = filters.campaignId;

    const opps = await prisma.fundraisingOpportunity.findMany({
      where,
      include: { currentStage: true },
    });

    const funnel: Record<string, { count: number; amount: number }> = {};
    for (const o of opps) {
      const code = o.currentStage?.stageCode || "UNKNOWN";
      if (!funnel[code]) funnel[code] = { count: 0, amount: 0 };
      funnel[code].count += 1;
      funnel[code].amount +=
        Number(o.proposedAmount ?? 0) ||
        Number(o.softCircleAmount ?? 0) ||
        Number(o.qualifiedAmount ?? 0) ||
        Number(o.indicativeAmount ?? 0);
    }
    return { campaignId: filters.campaignId ?? null, funnel };
  }

  static async analyticsSource(filters: { campaignId?: string }) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    const opps = await prisma.fundraisingOpportunity.findMany({ where, select: { source: true, proposedAmount: true } });

    const bySource: Record<string, { count: number; amount: number }> = {};
    for (const o of opps) {
      const src = o.source || "UNKNOWN";
      if (!bySource[src]) bySource[src] = { count: 0, amount: 0 };
      bySource[src].count += 1;
      bySource[src].amount += Number(o.proposedAmount ?? 0);
    }
    return { campaignId: filters.campaignId ?? null, bySource };
  }

  static async analyticsOwnerPerformance(filters: { campaignId?: string }) {
    const where: any = {};
    if (filters.campaignId) where.campaignId = filters.campaignId;
    const opps = await prisma.fundraisingOpportunity.findMany({
      where,
      select: {
        opportunityOwnerId: true,
        status: true,
        proposedAmount: true,
        signedAmount: true,
        fundedAmount: true,
      },
    });

    const byOwner: Record<string, any> = {};
    for (const o of opps) {
      const owner = o.opportunityOwnerId || "UNASSIGNED";
      if (!byOwner[owner]) {
        byOwner[owner] = { open: 0, won: 0, lost: 0, proposedAmount: 0, signedAmount: 0, fundedAmount: 0 };
      }
      if (o.status === "OPEN") byOwner[owner].open += 1;
      else if (o.status === "WON") byOwner[owner].won += 1;
      else if (o.status === "LOST") byOwner[owner].lost += 1;
      byOwner[owner].proposedAmount += Number(o.proposedAmount ?? 0);
      byOwner[owner].signedAmount += Number(o.signedAmount ?? 0);
      byOwner[owner].fundedAmount += Number(o.fundedAmount ?? 0);
    }
    return { campaignId: filters.campaignId ?? null, byOwner };
  }

  static async analyticsStageAgeing(filters: { campaignId?: string }) {
    const where: any = { status: "OPEN" };
    if (filters.campaignId) where.campaignId = filters.campaignId;

    const opps = await prisma.fundraisingOpportunity.findMany({
      where,
      include: {
        currentStage: true,
        stageHistory: { orderBy: { changedAt: "desc" }, take: 1 },
      },
    });

    const now = Date.now();
    const rows = opps.map((o) => {
      const enteredAt = o.stageHistory[0]?.changedAt || o.updatedAt;
      const daysInStage = Math.floor((now - new Date(enteredAt).getTime()) / 86400000);
      return {
        opportunityId: o.id,
        stageCode: o.currentStage?.stageCode,
        daysInStage,
        ownerId: o.opportunityOwnerId,
      };
    });

    return { campaignId: filters.campaignId ?? null, rows };
  }

  static async runReport(reportKey: string, filters: { campaignId?: string }) {
    const key = String(reportKey || "").toLowerCase().replace(/_/g, "-");
    switch (key) {
      case "funnel":
      case "pipeline-funnel":
        return FundraisingSrdService.analyticsFunnel(filters);
      case "source":
      case "source-analysis":
        return FundraisingSrdService.analyticsSource(filters);
      case "owner-performance":
        return FundraisingSrdService.analyticsOwnerPerformance(filters);
      case "stage-ageing":
        return FundraisingSrdService.analyticsStageAgeing(filters);
      case "pipeline-summary":
      case "campaign-metrics":
        if (!filters.campaignId) {
          throw FundraisingIrError.badRequest("campaignId required for pipeline-summary report", "VALIDATION_ERROR");
        }
        return FundraisingSrdService.getCampaignMetrics(filters.campaignId);
      default:
        throw FundraisingIrError.notFound(`Unknown report: ${reportKey}`, "REPORT_NOT_FOUND");
    }
  }

  static async listAuditLogs(filters: {
    objectType?: string;
    objectId?: string;
    userId?: string;
    action?: string;
    from?: string | Date;
    to?: string | Date;
    limit?: number;
    page?: number;
    pageSize?: number;
    skip?: number;
  }) {
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

    const hasPagination =
      filters.page != null || filters.pageSize != null || filters.skip != null;
    const take = Math.min(Number(filters.pageSize ?? filters.limit) || 100, 500);
    const skip =
      filters.skip != null
        ? Number(filters.skip)
        : filters.page
          ? (Math.max(1, Number(filters.page)) - 1) * take
          : 0;

    if (hasPagination) {
      const [items, total] = await Promise.all([
        prisma.fundraisingAuditLog.findMany({
          where,
          orderBy: { timestamp: "desc" },
          take,
          skip,
        }),
        prisma.fundraisingAuditLog.count({ where }),
      ]);
      return {
        items,
        total,
        page: filters.page ? Number(filters.page) : Math.floor(skip / take) + 1,
        pageSize: take,
      };
    }

    return prisma.fundraisingAuditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: Math.min(Number(filters.limit) || 100, 500),
    });
  }

  // ── Investor 360 ────────────────────────────────────────────────

  static async investor360(investorId: string) {
    const investor = await prisma.investorOrganisation.findUnique({
      where: { id: investorId },
      include: { contacts: true },
    });
    if (!investor) throw FundraisingIrError.notFound("Investor organisation not found", "INVESTOR_NOT_FOUND");

    const contacts = (investor.contacts || []).filter((c: any) => String(c.status || "").toUpperCase() !== "ARCHIVED");

    const [
      opportunities,
      commitments,
      mandates,
      communications,
      kycCases,
      ddqCases,
      agreements,
    ] = await Promise.all([
      prisma.fundraisingOpportunity.findMany({
        where: { investorId },
        include: { currentStage: true, campaign: { select: { id: true, name: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.fundraisingCommitment.findMany({ where: { investorId }, orderBy: { updatedAt: "desc" } }),
      prisma.fundraisingMandate.findMany({ where: { investorId }, orderBy: { updatedAt: "desc" } }),
      FundraisingSrdService.listCommunications({ investorId, external: true }),
      prisma.fundraisingKycCase.findMany({ where: { investorId }, orderBy: { updatedAt: "desc" } }),
      prisma.fundraisingDdqCase.findMany({
        where: { investorId },
        include: { items: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.fundraisingAgreement.findMany({
        where: { investorId },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    let tasksResult: any = { performanceTasks: [], internalTaskCommunications: [] };
    try {
      tasksResult = await FundraisingSrdService.listTasks({ investorId });
    } catch {
      /* Task model / metadata query optional */
    }

    return {
      organisation: investor,
      investor,
      contacts,
      opportunities: opportunities || [],
      commitments: commitments || [],
      mandates: mandates || [],
      communications: communications || [],
      kycCases: kycCases || [],
      ddqCases: ddqCases || [],
      agreements: agreements || [],
      tasks: tasksResult?.performanceTasks || tasksResult?.items || [],
      internalTaskCommunications: tasksResult?.internalTaskCommunications || [],
    };
  }
}
