// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { ScorecardPillarService } from "./ScorecardPillarService";

class PillarError extends Error {
  statusCode: number;
  constructor(m: string, s = 400) {
    super(m);
    this.statusCode = s;
  }
}
export { PillarError };
const USER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const nameOf = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null);
const round2 = (n) => Math.round(n * 100) / 100;

export class PerformancePillarGovernanceService {
  static async overview() {
    const [pillars, kpis, goals, proposals] = await Promise.all([
      prisma.scorecardPillar.findMany({ where: { id: { startsWith: "bsc_" } }, orderBy: { id: "asc" } }),
      prisma.kPI.findMany({ where: { scorecardPillar: { not: null } }, select: { id: true, name: true, code: true, scorecardPillar: true, isActive: true } }),
      prisma.performanceGoal.findMany({ where: { pillarId: { not: null } }, select: { pillarId: true, status: true } }),
      prisma.performancePillarProposal.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
    ]);
    const uids = [...new Set([...pillars.map((p) => p.ownerId), ...proposals.flatMap((p) => [p.proposedById, p.decidedById])].filter(Boolean))];
    const users = uids.length ? await prisma.user.findMany({ where: { id: { in: uids } }, select: USER_SELECT }) : [];
    const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
    const total = round2(pillars.reduce((a, p) => a + Number(p.weight || 0), 0));
    const applied = proposals.filter((p) => p.status === "approved");
    return {
      total,
      balanced: pillars.length === 4 && total === 100,
      version: applied.length ? Math.max(...applied.map((p) => p.versionNo || 0)) : 0,
      pillars: pillars.map((p) => {
        const mine = kpis.filter((k) => k.scorecardPillar === p.canonicalName);
        return {
          id: p.id, name: p.displayName || p.canonicalName, canonicalName: p.canonicalName, shortName: p.shortName || null, description: p.description,
          weight: p.weight == null ? null : Number(p.weight), ownerId: p.ownerId || null, ownerName: p.ownerId ? nm.get(p.ownerId) || null : null,
          kpiCount: mine.length, activeKpiCount: mine.filter((k) => k.isActive).length, families: mine.slice(0, 6).map((k) => k.name),
          objectiveCount: goals.filter((g) => g.pillarId === p.id).length
        };
      }),
      pending: proposals.filter((p) => p.status === "pending").map((p) => ({ ...p, weights: p.weights, proposedByName: nm.get(p.proposedById) || null })),
      history: proposals.filter((p) => p.status !== "pending").map((p) => ({ ...p, proposedByName: nm.get(p.proposedById) || null, decidedByName: p.decidedById ? nm.get(p.decidedById) || null : null }))
    };
  }

  static async setOwnerAndName(id: string, input: any, actor: any) {
    const p = await prisma.scorecardPillar.findUnique({ where: { id } });
    if (!p || !id.startsWith("bsc_")) throw new PillarError("Perspective not found.", 404);
    const data: any = {};
    if (input.ownerId !== undefined) {
      data.ownerId = input.ownerId ? String(input.ownerId) : null;
      if (data.ownerId && !(await prisma.user.findUnique({ where: { id: data.ownerId }, select: { id: true } }))) throw new PillarError("The chosen owner does not exist.");
    }
    if (input.shortName !== undefined) {
      const s = String(input.shortName || "").trim();
      if (s.length > 40) throw new PillarError("Short name must be 40 characters or fewer.");
      data.shortName = s || null;
    }
    if (!Object.keys(data).length) throw new PillarError("Nothing to update.");
    const row = await prisma.scorecardPillar.update({ where: { id }, data });
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "PerformancePillar", entityId: id, oldValues: p, newValues: row });
    return PerformancePillarGovernanceService.overview();
  }

  static async propose(input: any, actor: any) {
    const reason = String(input.reason || "").trim();
    if (!reason) throw new PillarError("Give the reason for the change.");
    if (reason.length > 1000) throw new PillarError("The reason must be 1000 characters or fewer.");
    const w = input.weights || {};
    const ids = ["bsc_financial", "bsc_customer_market", "bsc_internal_operations", "bsc_learning_growth_hr"];
    const out: Record<string, number> = {};
    for (const id of ids) {
      const n = Number(w[id]);
      if (w[id] === undefined || w[id] === "" || !Number.isFinite(n) || n < 0 || n > 100) throw new PillarError(`Give a weight from 0 to 100 for every perspective (${id}).`);
      out[id] = round2(n);
    }
    const total = round2(Object.values(out).reduce((a, b) => a + b, 0));
    if (total !== 100) throw new PillarError(`Weights must total exactly 100% (they total ${total}%).`);
    const cur = await prisma.scorecardPillar.findMany({ where: { id: { in: ids } } });
    if (ids.every((id) => Number(cur.find((c) => c.id === id)?.weight) === out[id])) throw new PillarError("These are the weights already in force.");
    if (await prisma.performancePillarProposal.count({ where: { status: "pending" } })) throw new PillarError("A weight change is already awaiting approval. Decide it first.");
    const row = await prisma.performancePillarProposal.create({ data: { weights: out, reason, status: "pending", proposedById: actor.id, previousWeights: Object.fromEntries(cur.map((c) => [c.id, Number(c.weight || 0)])) } });
    await AuditService.log({ userId: actor.id, action: "PROPOSE", entityType: "PerformancePillarProposal", entityId: row.id, newValues: row });
    return PerformancePillarGovernanceService.overview();
  }

  static async decide(id: string, decision: "approved" | "rejected", note: any, actor: any, isAdmin: boolean) {
    const p = await prisma.performancePillarProposal.findUnique({ where: { id } });
    if (!p) throw new PillarError("Proposal not found.", 404);
    if (p.status !== "pending") throw new PillarError(`This proposal is already ${p.status}.`);
    const n = String(note || "").trim().slice(0, 1000) || null;
    if (decision === "rejected" && !n) throw new PillarError("Say why the change is rejected.");
    if (decision === "approved" && !isAdmin && p.proposedById === actor.id) throw new PillarError("You cannot approve your own proposal. Another approver is needed.");
    const versionNo = decision === "approved" ? ((await prisma.performancePillarProposal.aggregate({ _max: { versionNo: true } }))._max.versionNo || 0) + 1 : null;
    if (decision === "approved") await ScorecardPillarService.setPillarWeightsBsc({ pillarWeights: p.weights });
    const row = await prisma.performancePillarProposal.update({ where: { id }, data: { status: decision, decidedById: actor.id, decidedAt: new Date(), decisionNote: n, versionNo } });
    await AuditService.log({ userId: actor.id, action: decision === "approved" ? "APPROVE" : "REJECT", entityType: "PerformancePillarProposal", entityId: id, newValues: row });
    return PerformancePillarGovernanceService.overview();
  }

  static async withdraw(id: string, actor: any) {
    const p = await prisma.performancePillarProposal.findUnique({ where: { id } });
    if (!p) throw new PillarError("Proposal not found.", 404);
    if (p.status !== "pending") throw new PillarError(`This proposal is already ${p.status}.`);
    if (p.proposedById !== actor.id) throw new PillarError("Only the proposer can withdraw it.", 403);
    await prisma.performancePillarProposal.update({ where: { id }, data: { status: "withdrawn", decidedAt: new Date(), decidedById: actor.id } });
    return PerformancePillarGovernanceService.overview();
  }
}
