// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";
import { PROCUREMENT_PERMISSIONS as P } from "../config/procurementPermissions";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";
import { describeRules, saveRules } from "../services/notifications/ProcurementNotifier";
import { runAllNotificationJobs } from "../services/notifications/ProcurementNotificationJobs";
import { NumberingService, NUMBERING_SPECS, validateNumberFormat } from "../services/numbering/NumberingService";
import { FxService } from "../services/fx/FxService";
import { listReports, runReport } from "../services/reports/ProcurementReportService";
import { toCsv, toXlsx, toPdf } from "../services/reports/ReportExport";
import { procurementDashboard, executiveDashboard, parsePeriod } from "../services/dashboards/ProcurementDashboardService";
import { ProcurementLifecycleService as Life } from "../services/status/ProcurementLifecycleService";
import { STATUS_LABELS, TRANSITIONS, TERMINAL, PO_CONFIRMED_STATUSES, PO_UNCONFIRMED_STATUSES } from "../services/status/StatusTransitions";

const send = (res: Response, e: any) => res.status(e?.status && Number.isInteger(e.status) ? e.status : 400).json({ success: false, message: e?.message || String(e) });
const ok = (res: Response, data: any) => res.json({ success: true, data });
const q = (req: Request, k: string) => (req.query[k] === undefined ? undefined : String(req.query[k]));
const bad = (message: string, status = 400) => Object.assign(new Error(message), { status });
const audit = (req: Request, entityId: string, oldValues: any, newValues: any, action = "SETTINGS_UPDATE") =>
  AuditService.log({ userId: (req as any).user?.id, action, entityType: "ProcurementSettings", entityId, oldValues, newValues, eventType: "OTHER" } as any).catch(() => undefined);

/** SRD §34-§40: notification rules, numbering, currency, reports, dashboards and statuses. */
export class ProcurementInsightsController {
  // ---------------------------------------------------------------- §34 notifications
  static async getRules(_req: Request, res: Response) {
    try { ok(res, await describeRules()); } catch (e) { send(res, e); }
  }

  static async putRules(req: Request, res: Response) {
    try {
      const before = await describeRules();
      await saveRules(req.body?.rules ?? req.body ?? {});
      const after = await describeRules();
      await audit(req, "notification-rules", before, after);
      ok(res, after);
    } catch (e) { send(res, e); }
  }

  static async notificationLog(req: Request, res: Response) {
    try {
      const take = Math.min(200, Math.max(1, Number(q(req, "pageSize") ?? 25)));
      const page = Math.max(1, Number(q(req, "page") ?? 1));
      const where: string[] = [];
      const args: any[] = [];
      for (const [k, col] of [["event", "event_key"], ["status", "status"], ["channel", "channel"], ["recipientId", "recipient_id"], ["entityId", "entity_id"]] as const) {
        const v = q(req, k);
        if (v) { where.push(`${col} = ?`); args.push(v); }
      }
      const w = where.length ? "WHERE " + where.join(" AND ") : "";
      const total = Number((await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS c FROM procurement_notification_log ${w}`, ...args))[0].c);
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, event_key AS eventKey, recipient_id AS recipientId, recipient_email AS recipientEmail, channel, status, reason, entity_type AS entityType, entity_id AS entityId, title, created_at AS createdAt FROM procurement_notification_log ${w} ORDER BY created_at DESC, id DESC LIMIT ${take} OFFSET ${(page - 1) * take}`,
        ...args,
      );
      ok(res, { items: rows, total, page, pageSize: take });
    } catch (e) { send(res, e); }
  }

  static async runJobs(req: Request, res: Response) {
    try { ok(res, await runAllNotificationJobs({ vendorDocuments: String(req.query.include ?? "").split(",").includes("vendorDocuments") })); } catch (e) { send(res, e); }
  }

  // ---------------------------------------------------------------- §39 numbering
  static async getNumbering(_req: Request, res: Response) {
    try { ok(res, await NumberingService.settings()); } catch (e) { send(res, e); }
  }

  static async putNumbering(req: Request, res: Response) {
    try {
      const body = req.body?.formats ?? req.body ?? {};
      const data: Record<string, string> = {};
      for (const [key, fmt] of Object.entries(body)) {
        const spec = NUMBERING_SPECS[key as keyof typeof NUMBERING_SPECS];
        if (!spec) throw bad(`"${key}" is not a numbered reference.`);
        const f = String(fmt ?? "").trim();
        const problem = validateNumberFormat(f);
        if (problem) throw bad(`${spec.label}: ${problem}`);
        data[spec.field] = f;
      }
      if (!Object.keys(data).length) throw bad("No formats were given.");
      const before = await NumberingService.settings();
      await prisma.procurementSettings.upsert({ where: { id: "default" }, update: data as any, create: { id: "default", ...data } as any });
      const after = await NumberingService.settings();
      await audit(req, "numbering-formats", before, after);
      ok(res, after);
    } catch (e) { send(res, e); }
  }

  // ---------------------------------------------------------------- §38 currency
  static async getFx(_req: Request, res: Response) {
    try {
      const [settings, currencies] = await Promise.all([
        FxService.settings(),
        prisma.currency.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, symbol: true, isDefault: true } }),
      ]);
      ok(res, { settings, currencies });
    } catch (e) { send(res, e); }
  }

  static async putFx(req: Request, res: Response) {
    try {
      const b = req.body ?? {};
      const data: any = {};
      if (b.reportingCurrency !== undefined) {
        const code = String(b.reportingCurrency).toUpperCase();
        if (!(await prisma.currency.findUnique({ where: { code } }))) throw bad(`${code} is not a currency in the system.`);
        data.reportingCurrencyCode = code;
      }
      if (b.source !== undefined) {
        const s = String(b.source).toUpperCase();
        if (!["TABLE", "URL"].includes(s)) throw bad("The rate source is TABLE or URL.");
        data.fxSource = s;
      }
      if (b.sourceUrl !== undefined) {
        const u = String(b.sourceUrl || "").trim();
        if (u && !/^https?:\/\//i.test(u)) throw bad("The rate URL must start with http:// or https://.");
        data.fxSourceUrl = u || null;
      }
      if (b.maxAgeDays !== undefined) {
        const n = Number(b.maxAgeDays);
        if (!Number.isInteger(n) || n < 0 || n > 3650) throw bad("The maximum rate age is a whole number of days between 0 and 3650.");
        data.fxMaxAgeDays = n;
      }
      const before = await FxService.settings();
      if ((data.fxSource ?? before.source) === "URL" && !(data.fxSourceUrl !== undefined ? data.fxSourceUrl : before.sourceUrl)) throw bad("Give the URL the rates are read from.");
      await prisma.procurementSettings.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
      const after = await FxService.settings();
      await audit(req, "fx-settings", before, after);
      ok(res, after);
    } catch (e) { send(res, e); }
  }

  static async listRates(req: Request, res: Response) {
    try {
      const rows = await prisma.exchangeRate.findMany({
        where: { isActive: true }, orderBy: [{ date: "desc" }], take: Math.min(500, Number(q(req, "take") ?? 200)),
        include: { fromCurrency: { select: { code: true } }, toCurrency: { select: { code: true } } },
      });
      ok(res, rows.map((r) => ({ id: r.id, date: r.date.toISOString().slice(0, 10), from: r.fromCurrency.code, to: r.toCurrency.code, rate: Number(r.rate), source: r.source ?? "TABLE" })));
    } catch (e) { send(res, e); }
  }

  static async saveRate(req: Request, res: Response) {
    try {
      const b = req.body ?? {};
      const from = String(b.from ?? "").toUpperCase();
      const to = String(b.to ?? "").toUpperCase();
      const rate = Number(b.rate);
      if (!from || !to || from === to) throw bad("Choose two different currencies.");
      if (!Number.isFinite(rate) || rate <= 0) throw bad("The rate must be a number greater than zero.");
      const date = new Date(String(b.date ?? new Date().toISOString().slice(0, 10)).slice(0, 10));
      if (Number.isNaN(date.getTime())) throw bad("The date is not valid.");
      const [f, t] = await Promise.all([prisma.currency.findUnique({ where: { code: from } }), prisma.currency.findUnique({ where: { code: to } })]);
      if (!f || !t) throw bad("A currency is not in the system.");
      const row = await prisma.exchangeRate.upsert({
        where: { date_fromCurrencyId_toCurrencyId: { date, fromCurrencyId: f.id, toCurrencyId: t.id } },
        update: { rate, isActive: true, source: "MANUAL" },
        create: { date, fromCurrencyId: f.id, toCurrencyId: t.id, rate, createdById: (req as any).user.id, source: "MANUAL" },
      });
      await audit(req, `fx:${from}-${to}`, null, { from, to, rate, date: date.toISOString().slice(0, 10) }, "RATE_SET");
      ok(res, { id: row.id, date: date.toISOString().slice(0, 10), from, to, rate, source: "MANUAL" });
    } catch (e) { send(res, e); }
  }

  static async deleteRate(req: Request, res: Response) {
    try {
      const row = await prisma.exchangeRate.findUnique({ where: { id: req.params.id } });
      if (!row) throw bad("Rate not found", 404);
      await prisma.exchangeRate.update({ where: { id: row.id }, data: { isActive: false } });
      ok(res, { id: row.id });
    } catch (e) { send(res, e); }
  }

  static async convertPreview(req: Request, res: Response) {
    try {
      const from = String(q(req, "from") ?? "").toUpperCase();
      const to = String(q(req, "to") ?? "").toUpperCase();
      const at = q(req, "date") ? new Date(String(q(req, "date"))) : new Date();
      ok(res, { from, to, rate: await FxService.rate(from, to, at) });
    } catch (e) { send(res, e); }
  }

  // ---------------------------------------------------------------- §37 reports
  static async reports(_req: Request, res: Response) {
    try { ok(res, listReports()); } catch (e) { send(res, e); }
  }

  private static filtersOf(req: Request) {
    const out: any = {};
    for (const k of ["from", "to", "department", "supplier", "category", "currency", "status", "user", "eventType"]) if (q(req, k)) out[k] = q(req, k);
    return out;
  }

  static async report(req: Request, res: Response) {
    try {
      const r = await runReport(req.params.key, ProcurementInsightsController.filtersOf(req), { convertTo: q(req, "convertTo") });
      const page = Math.max(1, Number(q(req, "page") ?? 1));
      const pageSize = Math.min(500, Math.max(1, Number(q(req, "pageSize") ?? 25)));
      ok(res, { ...r, total: r.rows.length, page, pageSize, rows: r.rows.slice((page - 1) * pageSize, page * pageSize) });
    } catch (e) { send(res, e); }
  }

  static async exportReport(req: Request, res: Response) {
    try {
      const format = String(q(req, "format") ?? "csv").toLowerCase();
      if (!["csv", "xlsx", "pdf"].includes(format)) throw bad("The export format is csv, xlsx or pdf.");
      const r = await runReport(req.params.key, ProcurementInsightsController.filtersOf(req), { convertTo: q(req, "convertTo") });
      const base = `${r.key}-${new Date().toISOString().slice(0, 10)}`;
      let body: Buffer;
      let type: string;
      if (format === "xlsx") { body = toXlsx(r as any); type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; }
      else if (format === "pdf") { body = await toPdf(r as any); type = "application/pdf"; }
      else { body = toCsv(r as any); type = "text/csv; charset=utf-8"; }
      await AuditService.log({ userId: (req as any).user?.id, action: "EXPORT", entityType: "ProcurementReport", entityId: r.key, newValues: { format, filters: r.filters, rows: r.rows.length }, eventType: "FILE_DOWNLOAD" } as any).catch(() => undefined);
      res.setHeader("Content-Type", type);
      res.setHeader("Content-Disposition", `attachment; filename="${base}.${format}"`);
      res.setHeader("Content-Length", String(body.length));
      res.send(body);
    } catch (e) { send(res, e); }
  }

  // ---------------------------------------------------------------- §35 dashboards
  static async dashboard(req: Request, res: Response) {
    try {
      const period = parsePeriod({ from: q(req, "from"), to: q(req, "to"), preset: q(req, "preset") });
      ok(res, await procurementDashboard(period, { convertTo: q(req, "convertTo") }));
    } catch (e) { send(res, e); }
  }

  static async executive(req: Request, res: Response) {
    try {
      const period = parsePeriod({ from: q(req, "from"), to: q(req, "to"), preset: q(req, "preset") });
      ok(res, await executiveDashboard(period, { convertTo: q(req, "convertTo") }));
    } catch (e) { send(res, e); }
  }

  /** Which dashboards this person may open, and what belongs to them personally (their requisitions, approvals, evaluations). */
  static async myDashboard(req: Request, res: Response) {
    try {
      const uid = (req as any).user.id;
      const user: any = await prisma.user.findUnique({ where: { id: uid }, include: { role: true } });
      const can = (p: string) => userHasEffectivePermission(user, p);
      const [mine, approvals, evaluations, myOrders] = await Promise.all([
        prisma.purchaseRequisition.groupBy({ by: ["status"], where: { requestedById: uid }, _count: { _all: true } }),
        prisma.approval.count({ where: { approverId: uid, status: "PENDING", request: { status: "PENDING" } } }),
        prisma.rfqEvaluationMember.count({ where: { userId: uid, recused: false, scorecardSubmittedAt: null } }).catch(() => 0),
        prisma.purchaseOrder.count({ where: { createdById: uid, status: { in: ["DRAFT", "PENDING", "APPROVED"] } } }),
      ]);
      const status: Record<string, number> = Object.fromEntries(mine.map((m: any) => [m.status, m._count._all]));
      const views: string[] = [];
      if (can(P.dashboardExecutive)) views.push("executive");
      if (can(P.dashboardView)) views.push("procurement");
      views.push("mine");
      ok(res, {
        views, defaultView: views[0],
        mine: {
          requisitions: status, requisitionsTotal: Object.values(status).reduce((a, b) => a + b, 0),
          approvalsAwaitingMe: approvals, evaluationsAwaitingMe: evaluations, myOpenOrders: myOrders,
          returned: status.RETURNED ?? 0, drafts: status.DRAFT ?? 0,
        },
      });
    } catch (e) { send(res, e); }
  }

  // ---------------------------------------------------------------- §40 statuses
  static async statuses(_req: Request, res: Response) {
    try {
      ok(res, Object.keys(STATUS_LABELS).map((k) => ({
        kind: k, labels: STATUS_LABELS[k], transitions: TRANSITIONS[k], terminal: TERMINAL[k],
        ...(k === "PURCHASE_ORDER" ? { confirmed: PO_CONFIRMED_STATUSES, unconfirmed: PO_UNCONFIRMED_STATUSES } : {}),
      })));
    } catch (e) { send(res, e); }
  }

  static async statusHistory(req: Request, res: Response) {
    try {
      const type = String(q(req, "entityType") ?? "");
      const id = String(q(req, "entityId") ?? "");
      if (!type || !id) throw bad("entityType and entityId are required.");
      ok(res, await prisma.$queryRawUnsafe<any[]>(
        "SELECT id, entity_type AS entityType, entity_id AS entityId, entity_ref AS entityRef, from_status AS fromStatus, to_status AS toStatus, actor_id AS actorId, created_at AS createdAt FROM procurement_status_history WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC, id ASC",
        type, id,
      ));
    } catch (e) { send(res, e); }
  }

  // ---------------------------------------------------------------- §40 lifecycle actions
  private static async actor(req: Request) {
    const user: any = await prisma.user.findUnique({ where: { id: (req as any).user.id }, include: { role: true } });
    return { user, can: (p: string) => userHasEffectivePermission(user, p) };
  }
  private static run(fn: (req: Request) => Promise<any>) {
    return async (req: Request, res: Response) => {
      try { ok(res, await fn(req)); } catch (e) { send(res, e); }
    };
  }
  static cancelRequisition = ProcurementInsightsController.run(async (req) => {
    const { user, can } = await ProcurementInsightsController.actor(req);
    return Life.cancelRequisition(user, req.params.id, req.body?.reason, can(P.rfqManage) || can(P.ordersManage));
  });
  static closeRequisition = ProcurementInsightsController.run(async (req) => Life.closeRequisition((await ProcurementInsightsController.actor(req)).user, req.params.id, req.body?.reason));
  static approveRfq = ProcurementInsightsController.run(async (req) => {
    const { user } = await ProcurementInsightsController.actor(req);
    return Life.approveRfq({ ...user, isAdmin: ["admin", "System Administrator"].includes(user?.role?.name) }, req.params.id);
  });
  static publishRfq = ProcurementInsightsController.run(async (req) => Life.publishRfq((await ProcurementInsightsController.actor(req)).user, req.params.id));
  static closeRfq = ProcurementInsightsController.run(async (req) => Life.closeRfq((await ProcurementInsightsController.actor(req)).user, req.params.id));
  static cancelRfq = ProcurementInsightsController.run(async (req) => Life.cancelRfq((await ProcurementInsightsController.actor(req)).user, req.params.id, req.body?.reason));
  static cancelPurchaseOrder = ProcurementInsightsController.run(async (req) => Life.cancelPurchaseOrder((await ProcurementInsightsController.actor(req)).user, req.params.id, req.body?.reason));
  static closePurchaseOrder = ProcurementInsightsController.run(async (req) => Life.closePurchaseOrder((await ProcurementInsightsController.actor(req)).user, req.params.id, req.body?.reason));
}
