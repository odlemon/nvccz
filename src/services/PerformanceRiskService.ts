// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { nextReference } from "./PerformanceNumbering";

export const RISK_CATEGORIES = ["Strategic", "Financial", "Operational", "Compliance", "Technology", "People", "Reputational", "Market"];
export const RISK_STATUSES = ["identified", "assessed", "treating", "monitoring", "closed"];
export const RISK_TRANSITIONS: Record<string, string[]> = {
  identified: ["assessed", "treating", "closed"],
  assessed: ["treating", "monitoring", "closed"],
  treating: ["monitoring", "closed", "assessed"],
  monitoring: ["treating", "closed", "assessed"],
  closed: ["monitoring"]
};
export const TREATMENT_STATUSES = ["open", "in_progress", "done", "cancelled"];

class RiskError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}
export { RiskError };

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const nameOf = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null);
const score = (l, i) => (Number.isInteger(l) && Number.isInteger(i) ? l * i : null);

function scale(value: any, field: string, required: boolean) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new RiskError(`${field} is required (1 to 5).`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new RiskError(`${field} must be a whole number from 1 to 5.`);
  return n;
}
function date(value: any, field: string, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new RiskError(`${field} is required.`);
    return null;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new RiskError(`${field} is not a valid date.`);
  return d;
}
const text = (v, max, field, required = false) => {
  const s = v === undefined || v === null ? "" : String(v).trim();
  if (!s) {
    if (required) throw new RiskError(`${field} is required.`);
    return null;
  }
  if (s.length > max) throw new RiskError(`${field} must be ${max} characters or fewer.`);
  return s;
};

/** Derived, never stored: severity from residual score, appetite position from the limit, trend from the last two snapshots. */
export function derive(risk, history = []) {
  const inherent = score(risk.inherentLikelihood, risk.inherentImpact);
  const residual = score(risk.residualLikelihood, risk.residualImpact);
  const basis = residual ?? inherent;
  const severity = basis == null ? null : basis >= 15 ? "high" : basis >= 8 ? "medium" : "low";
  let appetite = null;
  if (residual != null && risk.appetiteLimit != null) appetite = residual > risk.appetiteLimit ? "above" : residual >= risk.appetiteLimit * 0.8 ? "watch" : "within";
  let trend = null;
  const snaps = history.filter((h) => h.residualScore != null).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  if (snaps.length >= 2) trend = snaps[0].residualScore < snaps[1].residualScore ? "improving" : snaps[0].residualScore > snaps[1].residualScore ? "worsening" : "stable";
  const dueIn = risk.nextReviewDate ? Math.ceil((+new Date(risk.nextReviewDate) - Date.now()) / 86400000) : null;
  return { inherentScore: inherent, residualScore: residual, severity, appetitePosition: appetite, trend, reviewDueInDays: dueIn };
}

export class PerformanceRiskService {
  static async list() {
    const [risks, treatments, history] = await Promise.all([
      prisma.performanceRisk.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.performanceRiskTreatment.findMany({ select: { id: true, riskId: true, status: true, dueDate: true } }),
      prisma.performanceRiskHistory.findMany({ select: { riskId: true, residualScore: true, createdAt: true } })
    ]);
    const ownerIds = [...new Set(risks.map((r) => r.ownerId).filter(Boolean))];
    const owners = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: USER_SELECT }) : [];
    const ownerName = new Map(owners.map((u) => [u.id, nameOf(u)]));
    const deptIds = [...new Set(risks.map((r) => r.departmentId).filter(Boolean))];
    const depts = deptIds.length ? await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true } }) : [];
    const deptName = new Map(depts.map((d) => [d.id, d.name]));
    const now = Date.now();
    return risks.map((r) => {
      const mine = treatments.filter((t) => t.riskId === r.id);
      return {
        ...r,
        ownerName: r.ownerId ? ownerName.get(r.ownerId) || null : null,
        departmentName: r.departmentId ? deptName.get(r.departmentId) || null : null,
        ...derive(r, history.filter((h) => h.riskId === r.id)),
        treatmentCount: mine.length,
        openTreatmentCount: mine.filter((t) => ["open", "in_progress"].includes(t.status)).length,
        overdueTreatmentCount: mine.filter((t) => ["open", "in_progress"].includes(t.status) && t.dueDate && +new Date(t.dueDate) < now).length
      };
    });
  }

  static async get(id: string) {
    const risk = await prisma.performanceRisk.findUnique({ where: { id } });
    if (!risk) throw new RiskError("Risk not found.", 404);
    const [treatments, history] = await Promise.all([
      prisma.performanceRiskTreatment.findMany({ where: { riskId: id }, orderBy: { createdAt: "asc" } }),
      prisma.performanceRiskHistory.findMany({ where: { riskId: id }, orderBy: { createdAt: "desc" } })
    ]);
    const userIds = [...new Set([risk.ownerId, ...treatments.map((t) => t.ownerId), ...history.map((h) => h.actorId)].filter(Boolean))];
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: USER_SELECT }) : [];
    const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
    return {
      ...risk,
      ownerName: risk.ownerId ? nm.get(risk.ownerId) || null : null,
      ...derive(risk, history),
      treatments: treatments.map((t) => ({ ...t, ownerName: t.ownerId ? nm.get(t.ownerId) || null : null, isOverdue: ["open", "in_progress"].includes(t.status) && !!t.dueDate && +new Date(t.dueDate) < Date.now() })),
      history: history.map((h) => ({ ...h, actorName: h.actorId ? nm.get(h.actorId) || null : null }))
    };
  }

  private static async snapshot(risk, event, note, actorId) {
    await prisma.performanceRiskHistory.create({
      data: { riskId: risk.id, event, note: note || null, inherentScore: score(risk.inherentLikelihood, risk.inherentImpact), residualScore: score(risk.residualLikelihood, risk.residualImpact), status: risk.status, actorId: actorId || null }
    });
  }

  private static async assertUser(id: string | null, label: string) {
    if (!id) return;
    if (!(await prisma.user.findUnique({ where: { id }, select: { id: true } }))) throw new RiskError(`${label} does not exist.`);
  }

  static async create(input: any, actor: any) {
    const data: any = {
      title: text(input.title, 255, "Title", true),
      description: text(input.description, 4000, "Description"),
      category: text(input.category, 64, "Category", true),
      ownerId: input.ownerId ? String(input.ownerId) : null,
      departmentId: input.departmentId ? String(input.departmentId) : null,
      inherentLikelihood: scale(input.inherentLikelihood, "Inherent likelihood", true),
      inherentImpact: scale(input.inherentImpact, "Inherent impact", true),
      residualLikelihood: scale(input.residualLikelihood, "Residual likelihood", false),
      residualImpact: scale(input.residualImpact, "Residual impact", false),
      appetiteLimit: input.appetiteLimit === undefined || input.appetiteLimit === "" || input.appetiteLimit === null ? 10 : Number(input.appetiteLimit),
      controls: text(input.controls, 4000, "Controls"),
      reviewFrequencyDays: input.reviewFrequencyDays ? Number(input.reviewFrequencyDays) : 90,
      nextReviewDate: date(input.nextReviewDate, "Next review date"),
      status: "identified"
    };
    if (!RISK_CATEGORIES.includes(data.category)) throw new RiskError(`Category must be one of: ${RISK_CATEGORIES.join(", ")}.`);
    if ((data.residualLikelihood == null) !== (data.residualImpact == null)) throw new RiskError("Give both residual likelihood and residual impact, or neither.");
    if (!Number.isInteger(data.appetiteLimit) || data.appetiteLimit < 1 || data.appetiteLimit > 25) throw new RiskError("Appetite limit must be a whole number from 1 to 25.");
    if (!Number.isInteger(data.reviewFrequencyDays) || data.reviewFrequencyDays < 7 || data.reviewFrequencyDays > 730) throw new RiskError("Review frequency must be between 7 and 730 days.");
    await PerformanceRiskService.assertUser(data.ownerId, "The chosen owner");
    if (!data.nextReviewDate) data.nextReviewDate = new Date(Date.now() + data.reviewFrequencyDays * 86400000);
    let lastError;
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await prisma.performanceRisk.findMany({ select: { reference: true } });
      const reference = await nextReference("risk", existing.map((r) => r.reference));
      try {
        const risk = await prisma.performanceRisk.create({ data: { ...data, reference, createdById: actor.id } });
        await PerformanceRiskService.snapshot(risk, "created", null, actor.id);
        await AuditService.log({ userId: actor.id, action: "CREATE", entityType: "PerformanceRisk", entityId: risk.id, newValues: risk });
        return PerformanceRiskService.get(risk.id);
      } catch (e) {
        if (e?.code !== "P2002") throw e;
        lastError = e;
      }
    }
    throw lastError;
  }

  static async update(id: string, input: any, actor: any) {
    const current = await prisma.performanceRisk.findUnique({ where: { id } });
    if (!current) throw new RiskError("Risk not found.", 404);
    if (current.status === "closed") throw new RiskError("A closed risk cannot be edited. Reopen it first.");
    const data: any = {};
    if (input.title !== undefined) data.title = text(input.title, 255, "Title", true);
    if (input.description !== undefined) data.description = text(input.description, 4000, "Description");
    if (input.category !== undefined) {
      data.category = text(input.category, 64, "Category", true);
      if (!RISK_CATEGORIES.includes(data.category)) throw new RiskError(`Category must be one of: ${RISK_CATEGORIES.join(", ")}.`);
    }
    if (input.ownerId !== undefined) { data.ownerId = input.ownerId ? String(input.ownerId) : null; await PerformanceRiskService.assertUser(data.ownerId, "The chosen owner"); }
    if (input.departmentId !== undefined) data.departmentId = input.departmentId ? String(input.departmentId) : null;
    for (const [k, label, req] of [["inherentLikelihood", "Inherent likelihood", true], ["inherentImpact", "Inherent impact", true], ["residualLikelihood", "Residual likelihood", false], ["residualImpact", "Residual impact", false]]) {
      if (input[k] !== undefined) data[k] = scale(input[k], label, req);
    }
    const rl = data.residualLikelihood !== undefined ? data.residualLikelihood : current.residualLikelihood;
    const ri = data.residualImpact !== undefined ? data.residualImpact : current.residualImpact;
    if ((rl == null) !== (ri == null)) throw new RiskError("Give both residual likelihood and residual impact, or neither.");
    if (input.appetiteLimit !== undefined) {
      const a = Number(input.appetiteLimit);
      if (!Number.isInteger(a) || a < 1 || a > 25) throw new RiskError("Appetite limit must be a whole number from 1 to 25.");
      data.appetiteLimit = a;
    }
    if (input.controls !== undefined) data.controls = text(input.controls, 4000, "Controls");
    if (input.reviewFrequencyDays !== undefined) {
      const f = Number(input.reviewFrequencyDays);
      if (!Number.isInteger(f) || f < 7 || f > 730) throw new RiskError("Review frequency must be between 7 and 730 days.");
      data.reviewFrequencyDays = f;
    }
    if (input.nextReviewDate !== undefined) data.nextReviewDate = date(input.nextReviewDate, "Next review date");
    if (!Object.keys(data).length) throw new RiskError("Nothing to update.");
    const risk = await prisma.performanceRisk.update({ where: { id }, data });
    const rescored = ["inherentLikelihood", "inherentImpact", "residualLikelihood", "residualImpact"].some((k) => data[k] !== undefined && data[k] !== current[k]);
    if (rescored) await PerformanceRiskService.snapshot(risk, "reassessed", text(input.note, 1000, "Note"), actor.id);
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "PerformanceRisk", entityId: id, oldValues: current, newValues: risk });
    return PerformanceRiskService.get(id);
  }

  static async setStatus(id: string, status: string, note: any, actor: any) {
    const current = await prisma.performanceRisk.findUnique({ where: { id } });
    if (!current) throw new RiskError("Risk not found.", 404);
    if (!RISK_STATUSES.includes(status)) throw new RiskError(`Status must be one of: ${RISK_STATUSES.join(", ")}.`);
    if (status === current.status) throw new RiskError(`The risk is already ${status}.`);
    if (!(RISK_TRANSITIONS[current.status] || []).includes(status)) throw new RiskError(`A risk that is ${current.status} cannot move to ${status}.`);
    const n = text(note, 1000, "Note");
    if (status === "closed") {
      if (!n) throw new RiskError("Say why the risk is being closed.");
      const open = await prisma.performanceRiskTreatment.count({ where: { riskId: id, status: { in: ["open", "in_progress"] } } });
      if (open) throw new RiskError(`Finish or cancel the ${open} open treatment action${open === 1 ? "" : "s"} before closing the risk.`);
    }
    if (status === "treating" && current.residualLikelihood == null && current.status === "identified") {
      // moving straight to treatment is allowed; residual stays unassessed
    }
    if (status === "assessed" && current.status === "identified" && current.residualLikelihood == null) throw new RiskError("Record the residual likelihood and impact before marking the risk assessed.");
    if (current.status === "closed" && !n) throw new RiskError("Say why the risk is being reopened.");
    const risk = await prisma.performanceRisk.update({ where: { id }, data: { status } });
    await PerformanceRiskService.snapshot(risk, current.status === "closed" ? "reopened" : `status:${status}`, n, actor.id);
    await AuditService.log({ userId: actor.id, action: "STATUS", entityType: "PerformanceRisk", entityId: id, oldValues: { status: current.status }, newValues: { status } });
    return PerformanceRiskService.get(id);
  }

  static async review(id: string, note: any, actor: any) {
    const current = await prisma.performanceRisk.findUnique({ where: { id } });
    if (!current) throw new RiskError("Risk not found.", 404);
    if (current.status === "closed") throw new RiskError("A closed risk is not reviewed.");
    const now = new Date();
    const risk = await prisma.performanceRisk.update({ where: { id }, data: { lastReviewedAt: now, nextReviewDate: new Date(now.getTime() + current.reviewFrequencyDays * 86400000) } });
    await PerformanceRiskService.snapshot(risk, "reviewed", text(note, 1000, "Note"), actor.id);
    await AuditService.log({ userId: actor.id, action: "REVIEW", entityType: "PerformanceRisk", entityId: id });
    return PerformanceRiskService.get(id);
  }

  static async remove(id: string, actor: any) {
    const current = await prisma.performanceRisk.findUnique({ where: { id } });
    if (!current) throw new RiskError("Risk not found.", 404);
    if (!["identified", "closed"].includes(current.status)) throw new RiskError("Only a risk that is newly identified or closed can be deleted. Close it first.");
    await prisma.performanceRiskTreatment.deleteMany({ where: { riskId: id } });
    await prisma.performanceRiskHistory.deleteMany({ where: { riskId: id } });
    await prisma.performanceRisk.delete({ where: { id } });
    await AuditService.log({ userId: actor.id, action: "DELETE", entityType: "PerformanceRisk", entityId: id, oldValues: current });
    return { id };
  }

  // ---- treatments
  static async addTreatment(riskId: string, input: any, actor: any) {
    const risk = await prisma.performanceRisk.findUnique({ where: { id: riskId } });
    if (!risk) throw new RiskError("Risk not found.", 404);
    if (risk.status === "closed") throw new RiskError("A closed risk takes no new treatment actions.");
    const data = { riskId, title: text(input.title, 255, "Action", true), description: text(input.description, 2000, "Description"), ownerId: input.ownerId ? String(input.ownerId) : null, dueDate: date(input.dueDate, "Due date", true), status: "open" };
    await PerformanceRiskService.assertUser(data.ownerId, "The chosen owner");
    const t = await prisma.performanceRiskTreatment.create({ data });
    await AuditService.log({ userId: actor.id, action: "CREATE", entityType: "PerformanceRiskTreatment", entityId: t.id, newValues: t });
    return PerformanceRiskService.get(riskId);
  }

  static async updateTreatment(treatmentId: string, input: any, actor: any) {
    const t = await prisma.performanceRiskTreatment.findUnique({ where: { id: treatmentId } });
    if (!t) throw new RiskError("Treatment action not found.", 404);
    const data: any = {};
    if (input.title !== undefined) data.title = text(input.title, 255, "Action", true);
    if (input.description !== undefined) data.description = text(input.description, 2000, "Description");
    if (input.ownerId !== undefined) { data.ownerId = input.ownerId ? String(input.ownerId) : null; await PerformanceRiskService.assertUser(data.ownerId, "The chosen owner"); }
    if (input.dueDate !== undefined) data.dueDate = date(input.dueDate, "Due date", true);
    if (input.status !== undefined) {
      if (!TREATMENT_STATUSES.includes(input.status)) throw new RiskError(`Status must be one of: ${TREATMENT_STATUSES.join(", ")}.`);
      if (["done", "cancelled"].includes(t.status) && input.status !== t.status) throw new RiskError(`A ${t.status} action cannot be changed. Add a new action instead.`);
      data.status = input.status;
      data.completedAt = input.status === "done" ? new Date() : null;
      if (input.status === "cancelled" && !text(input.notes, 1000, "Reason")) throw new RiskError("Say why the action is cancelled.");
    }
    if (input.notes !== undefined) data.notes = text(input.notes, 1000, "Notes");
    if (!Object.keys(data).length) throw new RiskError("Nothing to update.");
    const row = await prisma.performanceRiskTreatment.update({ where: { id: treatmentId }, data });
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "PerformanceRiskTreatment", entityId: treatmentId, oldValues: t, newValues: row });
    return PerformanceRiskService.get(t.riskId);
  }

  static async removeTreatment(treatmentId: string, actor: any) {
    const t = await prisma.performanceRiskTreatment.findUnique({ where: { id: treatmentId } });
    if (!t) throw new RiskError("Treatment action not found.", 404);
    if (t.status === "done") throw new RiskError("A completed action is part of the record and cannot be deleted.");
    await prisma.performanceRiskTreatment.delete({ where: { id: treatmentId } });
    await AuditService.log({ userId: actor.id, action: "DELETE", entityType: "PerformanceRiskTreatment", entityId: treatmentId, oldValues: t });
    return PerformanceRiskService.get(t.riskId);
  }

  /** Every treatment action across the register, for the Treatment Actions tab. */
  static async allTreatments() {
    const rows = await prisma.performanceRiskTreatment.findMany({ orderBy: [{ dueDate: "asc" }] });
    const risks = await prisma.performanceRisk.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.riskId))] } }, select: { id: true, reference: true, title: true, status: true } });
    const rk = new Map(risks.map((r) => [r.id, r]));
    const ownerIds = [...new Set(rows.map((r) => r.ownerId).filter(Boolean))];
    const users = ownerIds.length ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: USER_SELECT }) : [];
    const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
    return rows.map((t) => ({ ...t, ownerName: t.ownerId ? nm.get(t.ownerId) || null : null, riskReference: rk.get(t.riskId)?.reference, riskTitle: rk.get(t.riskId)?.title, riskStatus: rk.get(t.riskId)?.status, isOverdue: ["open", "in_progress"].includes(t.status) && !!t.dueDate && +new Date(t.dueDate) < Date.now() }));
  }
}
