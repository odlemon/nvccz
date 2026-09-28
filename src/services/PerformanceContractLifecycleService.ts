// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { contractWhere, type PerfActor } from "./PerformanceScope";

class ContractError extends Error {
  statusCode: number;
  constructor(m: string, s = 400) {
    super(m);
    this.statusCode = s;
  }
}
export { ContractError };
const USER_SELECT = { id: true, firstName: true, lastName: true, email: true, userDepartment: true } as const;
const nameOf = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null);

/** The people who must sign this contract, in the order they appear on the paper. */
function requiredSigners(c) {
  return [
    c.subjectUserId ? { role: "employee", userId: c.subjectUserId } : null,
    c.reviewerUserId ? { role: "reviewer", userId: c.reviewerUserId } : null,
    c.approverUserId ? { role: "approver", userId: c.approverUserId } : null
  ].filter(Boolean);
}
const weightPct = (goals) => {
  const sum = goals.reduce((a, g) => a + Number(g.scorecardWeight || 0), 0);
  return Math.round((sum <= 1.0001 ? sum * 100 : sum) * 100) / 100;
};

function readiness(c, goals, sigs) {
  if (c.status === "CLOSED") return "closed";
  const w = weightPct(goals);
  if (!goals.length || Math.abs(w - 100) > 0.01) return "draft";
  const need = requiredSigners(c);
  const signed = need.filter((n) => sigs.some((s) => s.role === n.role && s.userId === n.userId && s.versionNo === c.versionNo));
  if (!need.length || signed.length < need.length) return "in_review";
  return "approved";
}

export class PerformanceContractLifecycleService {
  static async registry(actor?: PerfActor) {
    const contracts = await prisma.performanceContract.findMany({ where: actor ? await contractWhere(actor) : {}, orderBy: { createdAt: "desc" } });
    if (!contracts.length) return [];
    const ids = contracts.map((c) => c.id);
    const [goals, sigs] = await Promise.all([
      prisma.performanceGoal.findMany({ where: { performanceContractId: { in: ids } }, select: { id: true, performanceContractId: true, scorecardWeight: true, lastCheckDate: true, status: true } }),
      prisma.performanceContractSignature.findMany({ where: { contractId: { in: ids } } })
    ]);
    const uids = [...new Set(contracts.flatMap((c) => [c.subjectUserId, c.reviewerUserId, c.approverUserId]).filter(Boolean))];
    const users = uids.length ? await prisma.user.findMany({ where: { id: { in: uids } }, select: USER_SELECT }) : [];
    const um = new Map(users.map((u) => [u.id, u]));
    const now = Date.now();
    return contracts.map((c) => {
      const mine = goals.filter((g) => g.performanceContractId === c.id);
      const cs = sigs.filter((s) => s.contractId === c.id);
      const need = requiredSigners(c);
      const withEvidence = mine.filter((g) => g.lastCheckDate).length;
      const state = readiness(c, mine, cs);
      return {
        ...c,
        subjectName: nameOf(um.get(c.subjectUserId)), reviewerName: nameOf(um.get(c.reviewerUserId)), approverName: nameOf(um.get(c.approverUserId)),
        departmentName: c.departmentName || (um.get(c.subjectUserId) || {}).userDepartment || null,
        goalCount: mine.length, weightTotal: weightPct(mine),
        evidenceCoverage: mine.length ? Math.round((withEvidence / mine.length) * 1000) / 10 : null,
        state, signaturesNeeded: need.length, signaturesGiven: need.filter((n) => cs.some((s) => s.role === n.role && s.userId === n.userId && s.versionNo === c.versionNo)).length,
        overdue: c.status !== "CLOSED" && +new Date(c.periodEnd) < now
      };
    });
  }

  static async detail(id: string) {
    const c = await prisma.performanceContract.findUnique({ where: { id } });
    if (!c) throw new ContractError("Contract not found.", 404);
    const [goals, sigs, events] = await Promise.all([
      prisma.performanceGoal.findMany({ where: { performanceContractId: id }, select: { id: true, title: true, type: true, scorecardWeight: true, scorecardSection: true, targetValue: true, targetUnit: true, progressPercentage: true, lastCheckDate: true, status: true, kpi: { select: { name: true } } }, orderBy: { displayOrder: "asc" } }),
      prisma.performanceContractSignature.findMany({ where: { contractId: id }, orderBy: { signedAt: "asc" } }),
      prisma.performanceContractEvent.findMany({ where: { contractId: id }, orderBy: { createdAt: "desc" } })
    ]);
    const uids = [...new Set([c.subjectUserId, c.reviewerUserId, c.approverUserId, ...sigs.map((s) => s.userId), ...events.map((e) => e.actorId)].filter(Boolean))];
    const users = uids.length ? await prisma.user.findMany({ where: { id: { in: uids } }, select: USER_SELECT }) : [];
    const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
    const need = requiredSigners(c).map((n) => ({ ...n, name: nm.get(n.userId) || null, signed: sigs.find((s) => s.role === n.role && s.userId === n.userId && s.versionNo === c.versionNo) || null }));
    return {
      ...c, subjectName: nm.get(c.subjectUserId) || null, reviewerName: nm.get(c.reviewerUserId) || null, approverName: nm.get(c.approverUserId) || null,
      state: readiness(c, goals, sigs), weightTotal: weightPct(goals),
      goals: goals.map((g) => ({ ...g, scorecardWeight: g.scorecardWeight == null ? null : Number(g.scorecardWeight), targetValue: g.targetValue == null ? null : Number(g.targetValue), kpiName: g.kpi ? g.kpi.name : null })),
      signers: need, signatures: sigs.map((s) => ({ ...s, name: nm.get(s.userId) || null, current: s.versionNo === c.versionNo })),
      events: events.map((e) => ({ ...e, actorName: e.actorId ? nm.get(e.actorId) || null : null }))
    };
  }

  private static async event(contractId, event, note, actorId) {
    await prisma.performanceContractEvent.create({ data: { contractId, event, note: note || null, actorId: actorId || null } });
  }

  /** Amend the terms. Every amendment is a new version and needs everyone's signature again. */
  static async amend(id: string, input: any, actor: any) {
    const c = await prisma.performanceContract.findUnique({ where: { id } });
    if (!c) throw new ContractError("Contract not found.", 404);
    if (c.status === "CLOSED") throw new ContractError("A closed contract cannot be amended.");
    const reason = String(input.reason || "").trim();
    if (!reason) throw new ContractError("Say why the contract is being amended.");
    const data: any = {};
    if (input.title !== undefined) { const t = String(input.title).trim(); if (!t) throw new ContractError("Title cannot be empty."); data.title = t.slice(0, 255); }
    if (input.reviewerUserId !== undefined) data.reviewerUserId = input.reviewerUserId || null;
    if (input.approverUserId !== undefined) data.approverUserId = input.approverUserId || null;
    if (input.stretchScoringEnabled !== undefined) data.stretchScoringEnabled = !!input.stretchScoringEnabled;
    for (const k of ["reviewerUserId", "approverUserId"]) if (data[k] && !(await prisma.user.findUnique({ where: { id: data[k] }, select: { id: true } }))) throw new ContractError("A chosen signatory does not exist.");
    if (data.reviewerUserId && data.approverUserId && data.reviewerUserId === data.approverUserId) throw new ContractError("The reviewer and the approver must be different people.");
    if (input.periodEnd !== undefined) { const d = new Date(input.periodEnd); if (Number.isNaN(+d) || d <= new Date(c.periodStart)) throw new ContractError("The period end must be after the start."); data.periodEnd = d; }
    if (!Object.keys(data).length) throw new ContractError("Nothing to amend.");
    const row = await prisma.performanceContract.update({ where: { id }, data: { ...data, versionNo: (c.versionNo || 1) + 1 } });
    await PerformanceContractLifecycleService.event(id, "amended", `v${row.versionNo}: ${reason}`, actor.id);
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "PerformanceContract", entityId: id, oldValues: c, newValues: row });
    return PerformanceContractLifecycleService.detail(id);
  }

  static async sign(id: string, note: any, actor: any) {
    const c = await prisma.performanceContract.findUnique({ where: { id } });
    if (!c) throw new ContractError("Contract not found.", 404);
    if (c.status === "CLOSED") throw new ContractError("A closed contract cannot be signed.");
    const mine = requiredSigners(c).filter((n) => n.userId === actor.id);
    if (!mine.length) throw new ContractError("You are not a signatory of this contract.", 403);
    const goals = await prisma.performanceGoal.findMany({ where: { performanceContractId: id }, select: { scorecardWeight: true } });
    if (!goals.length || Math.abs(weightPct(goals) - 100) > 0.01) throw new ContractError("The objectives must be linked and weighted to 100% before anyone signs.");
    for (const m of mine) {
      const dup = await prisma.performanceContractSignature.findFirst({ where: { contractId: id, role: m.role, userId: actor.id, versionNo: c.versionNo } });
      if (!dup) await prisma.performanceContractSignature.create({ data: { contractId: id, role: m.role, userId: actor.id, versionNo: c.versionNo, note: String(note || "").trim().slice(0, 500) || null } });
    }
    await PerformanceContractLifecycleService.event(id, "signed", `${mine.map((m) => m.role).join(", ")} signed v${c.versionNo}`, actor.id);
    await AuditService.log({ userId: actor.id, action: "SIGN", entityType: "PerformanceContract", entityId: id, newValues: { roles: mine.map((m) => m.role), version: c.versionNo } });
    return PerformanceContractLifecycleService.detail(id);
  }

  static async close(id: string, note: any, actor: any) {
    const c = await prisma.performanceContract.findUnique({ where: { id } });
    if (!c) throw new ContractError("Contract not found.", 404);
    if (c.status === "CLOSED") throw new ContractError("The contract is already closed.");
    const n = String(note || "").trim();
    if (!n) throw new ContractError("Say why the contract is being closed.");
    await prisma.performanceContract.update({ where: { id }, data: { status: "CLOSED" } });
    await PerformanceContractLifecycleService.event(id, "closed", n, actor.id);
    await AuditService.log({ userId: actor.id, action: "STATUS", entityType: "PerformanceContract", entityId: id, oldValues: { status: c.status }, newValues: { status: "CLOSED" } });
    return PerformanceContractLifecycleService.detail(id);
  }

  static async reopen(id: string, note: any, actor: any) {
    const c = await prisma.performanceContract.findUnique({ where: { id } });
    if (!c) throw new ContractError("Contract not found.", 404);
    if (c.status !== "CLOSED") throw new ContractError("Only a closed contract can be reopened.");
    const n = String(note || "").trim();
    if (!n) throw new ContractError("Say why the contract is being reopened.");
    await prisma.performanceContract.update({ where: { id }, data: { status: "ACTIVE" } });
    await PerformanceContractLifecycleService.event(id, "reopened", n, actor.id);
    return PerformanceContractLifecycleService.detail(id);
  }
}
export default PerformanceContractLifecycleService;
