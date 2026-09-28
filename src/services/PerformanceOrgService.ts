// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";

const num = (v) => (v == null ? null : Number(v));
const fullName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null);

export class PerformanceOrgService {
  /**
   * One round trip for the Departments directory: leader, headcount, KPI coverage, open work, latest scorecard,
   * capacity used (hours logged in the last 28 days against 8h x 20 working days per person) and open exceptions.
   */
  static async listDepartments(opts: { includeInactive?: boolean } = {}) {
    const departments = await prisma.department.findMany({
      where: opts.includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" }
    });
    if (!departments.length) return [];
    const ids = departments.map((d) => d.id);
    const names = departments.map((d) => d.name);
    const since = new Date(Date.now() - 28 * 86400000);

    const [users, kpis, tasks, scorecards, corrective, alerts] = await Promise.all([
      prisma.user.findMany({
        where: { departmentId: { in: ids }, status: "ACTIVE" },
        select: { id: true, firstName: true, lastName: true, email: true, departmentId: true, departmentRole: true }
      }),
      prisma.kPI.findMany({ where: { isActive: true, catalogDepartmentName: { in: names } }, select: { catalogDepartmentName: true } }),
      prisma.task.findMany({ where: { department: { in: names }, stage: { not: "completed" } }, select: { department: true, stage: true } }),
      prisma.performanceScorecard.findMany({
        where: { departmentName: { in: names }, archivedAt: null },
        orderBy: { periodEnd: "desc" },
        select: { departmentName: true, status: true, finalScore: true, periodEnd: true, periodLabel: true }
      }),
      prisma.performanceCorrectiveAction.groupBy({ by: ["departmentId"], where: { departmentId: { in: ids }, status: { notIn: ["closed", "CLOSED", "resolved", "RESOLVED"] } }, _count: { _all: true } }),
      prisma.performanceAlert.groupBy({ by: ["departmentId"], where: { departmentId: { in: ids }, status: { notIn: ["resolved", "RESOLVED", "closed", "CLOSED"] } }, _count: { _all: true } })
    ]);
    const userIds = users.map((u) => u.id);
    const hours = userIds.length
      ? await prisma.timesheetEntry.findMany({ where: { date: { gte: since }, timesheet: { userId: { in: userIds } } }, select: { hours: true, timesheet: { select: { userId: true } } } })
      : [];
    const hoursByUser = new Map();
    for (const h of hours) hoursByUser.set(h.timesheet.userId, (hoursByUser.get(h.timesheet.userId) || 0) + Number(h.hours));

    return departments.map((d) => {
      const mine = users.filter((u) => u.departmentId === d.id);
      const head = mine.find((u) => String(u.departmentRole || "").toUpperCase() === "HEAD") || mine.find((u) => /HEAD|HOD/.test(String(u.departmentRole || "").toUpperCase()));
      const cards = scorecards.filter((s) => s.departmentName === d.name);
      const latest = cards.find((s) => s.finalScore != null) || null;
      const capacityHours = mine.length * 160;
      const logged = mine.reduce((n, u) => n + (hoursByUser.get(u.id) || 0), 0);
      return {
        id: d.id,
        name: d.name,
        description: d.description,
        branch: d.branch,
        isActive: d.isActive,
        leaderId: head ? head.id : null,
        leaderName: fullName(head),
        employeeCount: mine.length,
        kpiCount: kpis.filter((k) => k.catalogDepartmentName === d.name).length,
        openTasks: tasks.filter((t) => t.department === d.name).length,
        latestScore: latest ? num(latest.finalScore) : null,
        latestScorePeriod: latest ? latest.periodLabel : null,
        scorecardSubmitted: cards.some((s) => String(s.status).toUpperCase() !== "DRAFT"),
        capacityUsedPct: capacityHours ? Math.round((logged / capacityHours) * 1000) / 10 : null,
        openCorrectiveActions: corrective.find((c) => c.departmentId === d.id)?._count._all || 0,
        openAlerts: alerts.find((c) => c.departmentId === d.id)?._count._all || 0
      };
    });
  }

  private static clean(input: any, requireName: boolean) {
    const out: any = {};
    if (input.name !== undefined || requireName) {
      const name = String(input.name ?? "").trim();
      if (!name) throw new Error("Department name is required.");
      if (name.length > 120) throw new Error("Department name must be 120 characters or fewer.");
      out.name = name;
    }
    if (input.description !== undefined) out.description = String(input.description ?? "").trim() || null;
    if (input.branch !== undefined) out.branch = String(input.branch ?? "").trim() || null;
    if (input.isActive !== undefined) out.isActive = !!input.isActive;
    return out;
  }

  static async createDepartment(input: any, actor: any) {
    const data = PerformanceOrgService.clean(input || {}, true);
    if (await prisma.department.findUnique({ where: { name: data.name } })) throw new Error("A department with this name already exists.");
    const row = await prisma.department.create({ data });
    await AuditService.log({ userId: actor.id, action: "CREATE", entityType: "Department", entityId: row.id, newValues: row });
    return row;
  }

  static async updateDepartment(id: string, input: any, actor: any) {
    const current = await prisma.department.findUnique({ where: { id } });
    if (!current) throw new Error("Department not found.");
    const data = PerformanceOrgService.clean(input || {}, false);
    if (!Object.keys(data).length) throw new Error("Nothing to update.");
    if (data.name && data.name !== current.name && (await prisma.department.findUnique({ where: { name: data.name } }))) {
      throw new Error("A department with this name already exists.");
    }
    if (data.isActive === false && current.isActive) {
      const n = await prisma.user.count({ where: { departmentId: id, status: "ACTIVE" } });
      if (n > 0) throw new Error(`Move the ${n} active employee${n === 1 ? "" : "s"} out of ${current.name} before deactivating it.`);
    }
    // Users carry the department name as a denormalised label too; keep it in step with a rename.
    const row = await prisma.department.update({ where: { id }, data });
    if (data.name && data.name !== current.name) {
      await prisma.user.updateMany({ where: { departmentId: id }, data: { userDepartment: data.name } });
    }
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "Department", entityId: id, oldValues: current, newValues: row });
    return row;
  }
}
