// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { nextReference } from "./PerformanceNumbering";
import { REPORT_TYPES } from "./PerformanceReportGenerators";
import { loadCapitalCallAccountingLetterhead } from "../utils/capitalCallAccountingLetterhead";
import { brandLogoBuffer, brandName } from "./p2p/BrandService";
import { dispatchProcurementNotification } from "./ProcurementNotificationService";

class ReportError extends Error {
  statusCode: number;
  constructor(m: string, s = 400) {
    super(m);
    this.statusCode = s;
  }
}
export { ReportError };
export const CATEGORIES = ["Executive", "Board", "KPI", "Risk", "Governance", "People", "Compliance"];
export const FORMATS = ["HTML", "CSV"];
export const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly"];
const USER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const nameOf = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const txt = (v, max, label, required = false) => {
  const s = v == null ? "" : String(v).trim();
  if (!s) {
    if (required) throw new ReportError(`${label} is required.`);
    return null;
  }
  if (s.length > max) throw new ReportError(`${label} must be ${max} characters or fewer.`);
  return s;
};

/** One renderer for both the preview and the stored document, so what was previewed is what is generated. */
export async function renderDocument(title: string, out, meta: { generatedAt: Date; generatedBy: string; params: any; category: string; reference?: string }) {
  const lh = await loadCapitalCallAccountingLetterhead().catch(() => ({ displayName: "", detailLines: [], logoUrlForEmail: null }));
  // the environment's approved brand (Matanho on dev, NVCCZ on production), not a logo address held in a database
  const logo = brandLogoBuffer();
  lh.displayName = brandName();
  lh.logoUrlForEmail = logo ? `data:image/png;base64,${logo.toString("base64")}` : null;
  const p = meta.params || {};
  const scope = [p.department ? `Department: ${p.department}` : "", p.from || p.to ? `Period: ${p.from || "start"} to ${p.to || "today"}` : ""].filter(Boolean).join(" · ") || "All records";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:13px/1.5 system-ui,Segoe UI,Arial;color:#111;margin:32px}h1{font-size:22px;margin:14px 0 2px}h2{font-size:14px;margin:18px 0 6px}.muted{color:#555}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:10px}.head img{max-height:56px}table{border-collapse:collapse;width:100%;font-size:12px}th{background:#f2f3f6;text-align:left}td,th{border:1px solid #d5d8e0;padding:5px 7px;vertical-align:top}.kv{display:flex;gap:24px;margin:10px 0}.kv div span{display:block;color:#555;font-size:11px}.kv div strong{font-size:16px}.foot{margin-top:22px;font-size:11px;color:#555;border-top:1px solid #ccc;padding-top:8px}</style></head><body>
<div class="head"><div>${lh.logoUrlForEmail ? `<img src="${esc(lh.logoUrlForEmail)}" alt="${esc(lh.displayName)}">` : ""}<div><strong>${esc(lh.displayName)}</strong></div>${(lh.detailLines || []).slice(0, 3).map((l) => `<div class="muted">${esc(l)}</div>`).join("")}</div><div style="text-align:right"><div class="muted">${esc(meta.category)} report${meta.reference ? " · " + esc(meta.reference) : ""}</div><div class="muted">Generated ${esc(meta.generatedAt.toISOString().slice(0, 16).replace("T", " "))} UTC</div></div></div>
<h1>${esc(title)}</h1><div class="muted">${esc(scope)}</div>
<div class="kv">${out.summary.map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join("")}</div>
<table><thead><tr>${out.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${out.rows.length ? out.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${out.columns.length}">No records match this report's scope.</td></tr>`}</tbody></table>
<div class="foot">Prepared by ${esc(meta.generatedBy)}. ${out.rows.length} row${out.rows.length === 1 ? "" : "s"}.</div></body></html>`;
  const csvCell = (v) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "﻿" + [out.columns.map(csvCell).join(","), ...out.rows.map((r) => r.map(csvCell).join(","))].join("\r\n") + "\r\n";
  return { html, csv };
}

export class PerformanceReportService {
  static catalog() {
    return Object.entries(REPORT_TYPES).map(([key, t]) => ({ key, label: t.label, category: t.category, description: t.description, usesPeriod: t.usesPeriod, usesDepartment: t.usesDepartment }));
  }

  private static clean(input: any, creating: boolean) {
    const d: any = {};
    if (creating || input.name !== undefined) d.name = txt(input.name, 200, "Report name", true);
    if (creating || input.type !== undefined) {
      if (!REPORT_TYPES[input.type]) throw new ReportError("Choose what the report is about.");
      d.type = input.type;
    }
    if (input.category !== undefined || creating) {
      const c = input.category || (REPORT_TYPES[input.type] || {}).category;
      if (!CATEGORIES.includes(c)) throw new ReportError(`Category must be one of: ${CATEGORIES.join(", ")}.`);
      d.category = c;
    }
    if (input.description !== undefined) d.description = txt(input.description, 1000, "Description");
    if (input.format !== undefined || creating) {
      const f = input.format || "HTML";
      if (!FORMATS.includes(f)) throw new ReportError(`Format must be one of: ${FORMATS.join(", ")}.`);
      d.format = f;
    }
    if (input.ownerId !== undefined) d.ownerId = input.ownerId ? String(input.ownerId) : null;
    if (input.filters !== undefined) {
      const f = input.filters || {};
      const out: any = {};
      if (f.department) out.department = String(f.department).slice(0, 120);
      for (const k of ["from", "to"]) if (f[k]) { if (Number.isNaN(+new Date(f[k]))) throw new ReportError(`${k === "from" ? "The start" : "The end"} date is not valid.`); out[k] = String(f[k]).slice(0, 10); }
      if (out.from && out.to && out.to < out.from) throw new ReportError("The period must end after it starts.");
      d.filters = out;
    }
    return d;
  }

  static async list() {
    const [defs, runs, schedules] = await Promise.all([
      prisma.performanceReportDefinition.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.performanceReportRun.findMany({ orderBy: { generatedAt: "desc" }, select: { id: true, definitionId: true, status: true, generatedAt: true, rowCount: true, format: true, trigger: true } }),
      prisma.performanceReportSchedule.findMany()
    ]);
    const uids = [...new Set(defs.map((d) => d.ownerId).filter(Boolean))];
    const users = uids.length ? await prisma.user.findMany({ where: { id: { in: uids } }, select: USER_SELECT }) : [];
    const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
    return defs.map((d) => {
      const mine = runs.filter((r) => r.definitionId === d.id);
      const sc = schedules.find((s) => s.definitionId === d.id && s.isActive);
      return { ...d, typeLabel: (REPORT_TYPES[d.type] || {}).label || d.type, ownerName: d.ownerId ? nm.get(d.ownerId) || null : null, lastRun: mine[0] || null, runCount: mine.length, schedule: sc ? { id: sc.id, frequency: sc.frequency, nextRunAt: sc.nextRunAt } : null };
    });
  }

  static async create(input: any, actor: any) {
    const d = PerformanceReportService.clean(input, true);
    if (d.ownerId && !(await prisma.user.findUnique({ where: { id: d.ownerId }, select: { id: true } }))) throw new ReportError("The chosen owner does not exist.");
    let last;
    for (let i = 0; i < 5; i++) {
      const existing = await prisma.performanceReportDefinition.findMany({ select: { reference: true } });
      const reference = await nextReference("report", existing.map((r) => r.reference));
      try {
        const row = await prisma.performanceReportDefinition.create({ data: { ...d, ownerId: d.ownerId || actor.id, reference, status: "active", createdById: actor.id } });
        await AuditService.log({ userId: actor.id, action: "CREATE", entityType: "PerformanceReport", entityId: row.id, newValues: row });
        return row;
      } catch (e) { if (e?.code !== "P2002") throw e; last = e; }
    }
    throw last;
  }

  static async update(id: string, input: any, actor: any) {
    const cur = await prisma.performanceReportDefinition.findUnique({ where: { id } });
    if (!cur) throw new ReportError("Report not found.", 404);
    if (cur.status === "retired") throw new ReportError("A retired report cannot be edited. Reinstate it first.");
    const d = PerformanceReportService.clean(input, false);
    if (!Object.keys(d).length) throw new ReportError("Nothing to update.");
    const row = await prisma.performanceReportDefinition.update({ where: { id }, data: d });
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "PerformanceReport", entityId: id, oldValues: cur, newValues: row });
    return row;
  }

  static async setStatus(id: string, status: string, note: any, actor: any) {
    const cur = await prisma.performanceReportDefinition.findUnique({ where: { id } });
    if (!cur) throw new ReportError("Report not found.", 404);
    if (!["active", "retired"].includes(status)) throw new ReportError("Status must be active or retired.");
    if (cur.status === status) throw new ReportError(`The report is already ${status}.`);
    if (status === "retired") {
      if (!String(note || "").trim()) throw new ReportError("Say why the report is being retired.");
      await prisma.performanceReportSchedule.updateMany({ where: { definitionId: id }, data: { isActive: false } });
    }
    const row = await prisma.performanceReportDefinition.update({ where: { id }, data: { status } });
    await AuditService.log({ userId: actor.id, action: "STATUS", entityType: "PerformanceReport", entityId: id, oldValues: { status: cur.status }, newValues: { status, note } });
    return row;
  }

  /** Runs the report without keeping anything. */
  static async preview(input: any, actor: any) {
    let type = input.type, params = input.filters || {}, title = input.name || "", category = input.category || "";
    if (input.definitionId) {
      const d = await prisma.performanceReportDefinition.findUnique({ where: { id: input.definitionId } });
      if (!d) throw new ReportError("Report not found.", 404);
      type = d.type; params = d.filters || {}; title = d.name; category = d.category;
    }
    const t = REPORT_TYPES[type];
    if (!t) throw new ReportError("Choose what the report is about.");
    if (params.from && params.to && params.to < params.from) throw new ReportError("The period must end after it starts.");
    const out = await t.run(params);
    const doc = await renderDocument(title || t.label, out, { generatedAt: new Date(), generatedBy: nameOf(actor) || "System", params, category: category || t.category });
    return { title: title || t.label, html: doc.html, rows: out.rows.length, summary: out.summary };
  }

  static async generate(definitionId: string, actor: any | null, trigger = "manual") {
    const d = await prisma.performanceReportDefinition.findUnique({ where: { id: definitionId } });
    if (!d) throw new ReportError("Report not found.", 404);
    if (d.status !== "active") throw new ReportError("Only an active report can be generated.");
    const t = REPORT_TYPES[d.type];
    if (!t) throw new ReportError("This report's type is no longer available.");
    let status = d.category === "Compliance" ? "pending_publication" : "generated";
    let out, html = null, csv = null, error = null;
    try {
      out = await t.run(d.filters || {});
      const doc = await renderDocument(d.name, out, { generatedAt: new Date(), generatedBy: actor ? nameOf(actor) : "Scheduled run", params: d.filters || {}, category: d.category, reference: d.reference });
      html = doc.html; csv = doc.csv;
    } catch (e) { status = "failed"; error = String(e?.message || e).slice(0, 500); }
    const run = await prisma.performanceReportRun.create({ data: { definitionId, status, format: d.format, trigger, generatedById: actor ? actor.id : null, rowCount: out ? out.rows.length : 0, contentHtml: html, contentCsv: csv, checksum: html ? crypto.createHash("sha256").update(html).digest("hex").slice(0, 16) : null, error } });
    await AuditService.log({ userId: actor ? actor.id : null, action: "GENERATE", entityType: "PerformanceReportRun", entityId: run.id, newValues: { definitionId, status, rows: run.rowCount, trigger } });
    if (status === "failed") throw new ReportError(`The report could not be generated: ${error}`, 500);
    return { id: run.id, status, rowCount: run.rowCount };
  }

  static async runs(definitionId?: string) {
    const rows = await prisma.performanceReportRun.findMany({ where: definitionId ? { definitionId } : {}, orderBy: { generatedAt: "desc" }, take: 300, select: { id: true, definitionId: true, status: true, generatedAt: true, generatedById: true, rowCount: true, format: true, trigger: true, checksum: true, publishedById: true, publishedAt: true, error: true } });
    const defs = await prisma.performanceReportDefinition.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.definitionId))] } }, select: { id: true, name: true, reference: true, category: true } });
    const dm = new Map(defs.map((d) => [d.id, d]));
    const uids = [...new Set(rows.flatMap((r) => [r.generatedById, r.publishedById]).filter(Boolean))];
    const users = uids.length ? await prisma.user.findMany({ where: { id: { in: uids } }, select: USER_SELECT }) : [];
    const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
    return rows.map((r) => ({ ...r, report: dm.get(r.definitionId) || null, generatedByName: r.generatedById ? nm.get(r.generatedById) || null : "Schedule", publishedByName: r.publishedById ? nm.get(r.publishedById) || null : null }));
  }

  static async runContent(runId: string, kind: "html" | "csv") {
    const r = await prisma.performanceReportRun.findUnique({ where: { id: runId } });
    if (!r) throw new ReportError("Run not found.", 404);
    const d = await prisma.performanceReportDefinition.findUnique({ where: { id: r.definitionId }, select: { name: true } });
    return { name: d ? d.name : "report", html: r.contentHtml, csv: r.contentCsv, status: r.status };
  }

  /** A compliance report is prepared by one person and published by another. */
  static async publish(runId: string, actor: any, isAdmin: boolean) {
    const r = await prisma.performanceReportRun.findUnique({ where: { id: runId } });
    if (!r) throw new ReportError("Run not found.", 404);
    if (r.status !== "pending_publication") throw new ReportError(`Only a report awaiting publication can be published (this one is ${String(r.status).replace("_", " ")}).`);
    if (!isAdmin && r.generatedById === actor.id) throw new ReportError("You prepared this report, so someone else has to publish it.");
    const row = await prisma.performanceReportRun.update({ where: { id: runId }, data: { status: "published", publishedById: actor.id, publishedAt: new Date() } });
    await AuditService.log({ userId: actor.id, action: "PUBLISH", entityType: "PerformanceReportRun", entityId: runId });
    return row;
  }

  // ---- schedules
  static nextRun(frequency: string, from = new Date()) {
    const d = new Date(from);
    if (frequency === "daily") d.setUTCDate(d.getUTCDate() + 1);
    else if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
    else if (frequency === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCMonth(d.getUTCMonth() + 3);
    d.setUTCHours(6, 0, 0, 0);
    return d;
  }
  static async schedules() {
    const rows = await prisma.performanceReportSchedule.findMany({ orderBy: { createdAt: "desc" } });
    const defs = await prisma.performanceReportDefinition.findMany({ where: { id: { in: rows.map((r) => r.definitionId) } }, select: { id: true, name: true, reference: true, status: true } });
    const dm = new Map(defs.map((d) => [d.id, d]));
    const uids = [...new Set(rows.flatMap((r) => (Array.isArray(r.recipientIds) ? r.recipientIds : [])))];
    const users = uids.length ? await prisma.user.findMany({ where: { id: { in: uids } }, select: USER_SELECT }) : [];
    const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
    return rows.map((r) => ({ ...r, report: dm.get(r.definitionId) || null, recipientNames: (Array.isArray(r.recipientIds) ? r.recipientIds : []).map((id) => nm.get(id)).filter(Boolean) }));
  }
  static async saveSchedule(input: any, actor: any) {
    const def = await prisma.performanceReportDefinition.findUnique({ where: { id: String(input.definitionId || "") } });
    if (!def) throw new ReportError("Choose the report to schedule.");
    if (def.status !== "active") throw new ReportError("Only an active report can be scheduled.");
    const frequency = String(input.frequency || "");
    if (!FREQUENCIES.includes(frequency)) throw new ReportError(`Frequency must be one of: ${FREQUENCIES.join(", ")}.`);
    const recipients = Array.isArray(input.recipientIds) ? [...new Set(input.recipientIds.map(String))] : [];
    if (!recipients.length) throw new ReportError("Choose at least one recipient.");
    if (recipients.length > 50) throw new ReportError("A schedule has at most 50 recipients.");
    const found = await prisma.user.count({ where: { id: { in: recipients } } });
    if (found !== recipients.length) throw new ReportError("A chosen recipient does not exist.");
    const existing = await prisma.performanceReportSchedule.findFirst({ where: { definitionId: def.id, isActive: true } });
    if (existing && (!input.id || input.id !== existing.id)) throw new ReportError("This report already has an active schedule. Edit or stop it.", 409);
    const data = { definitionId: def.id, frequency, recipientIds: recipients, nextRunAt: input.startAt ? new Date(input.startAt) : PerformanceReportService.nextRun(frequency), isActive: true };
    if (Number.isNaN(+data.nextRunAt)) throw new ReportError("The first run date is not valid.");
    const row = input.id ? await prisma.performanceReportSchedule.update({ where: { id: input.id }, data }) : await prisma.performanceReportSchedule.create({ data: { ...data, createdById: actor.id } });
    await AuditService.log({ userId: actor.id, action: input.id ? "UPDATE" : "CREATE", entityType: "PerformanceReportSchedule", entityId: row.id, newValues: row });
    return row;
  }
  static async stopSchedule(id: string, actor: any) {
    const s = await prisma.performanceReportSchedule.findUnique({ where: { id } });
    if (!s) throw new ReportError("Schedule not found.", 404);
    await prisma.performanceReportSchedule.update({ where: { id }, data: { isActive: false } });
    await AuditService.log({ userId: actor.id, action: "STOP", entityType: "PerformanceReportSchedule", entityId: id });
    return { id };
  }
  /** Generates every schedule that is due and tells its recipients. */
  static async runDue(now = new Date()) {
    const due = await prisma.performanceReportSchedule.findMany({ where: { isActive: true, nextRunAt: { lte: now } } });
    let ran = 0, failed = 0;
    for (const s of due) {
      try {
        const r = await PerformanceReportService.generate(s.definitionId, null, "schedule");
        const d = await prisma.performanceReportDefinition.findUnique({ where: { id: s.definitionId }, select: { name: true } });
        const ids = Array.isArray(s.recipientIds) ? s.recipientIds : [];
        if (ids.length) await dispatchProcurementNotification({ userIds: ids, title: `Report ready: ${d ? d.name : "Performance report"}`, message: `The scheduled report was generated with ${r.rowCount} row${r.rowCount === 1 ? "" : "s"}. Open Reports to read it.`, type: "PERFORMANCE_REPORT", relatedEntity: "PerformanceReportRun", relatedEntityId: r.id, data: { path: "/performance/performance-reports" } }).catch(() => undefined);
        ran++;
      } catch (e) { failed++; console.error("[performance-reports] scheduled run failed", e?.message || e); }
      await prisma.performanceReportSchedule.update({ where: { id: s.id }, data: { lastRunAt: now, nextRunAt: PerformanceReportService.nextRun(s.frequency, now) } });
    }
    return { due: due.length, ran, failed };
  }
}

export function startPerformanceReportScheduler() {
  if (String(process.env.PERFORMANCE_REPORT_JOB || "").toLowerCase() === "off") return;
  setTimeout(() => setInterval(() => PerformanceReportService.runDue().then((s) => s.due && console.log("[performance-reports]", JSON.stringify(s))).catch((e) => console.error("[performance-reports] failed:", e?.message || e)), 5 * 60_000).unref?.(), 200_000).unref?.();
}
