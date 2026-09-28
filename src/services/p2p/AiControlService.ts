//@ts-nocheck
/**
 * §29-§31 The optional AI layer: whether it may be used at all, by whom, on what, and how much; and the record of every use.
 *
 *  - The SWITCH (`ai_enabled`): off means no AI call is made anywhere in procurement, and every screen and endpoint says so.
 *  - APPROVED USER GROUPS (`ai_allowed_role_codes`): when set, only those roles may use it (administrators, who set this, always may).
 *  - PERMITTED DOCUMENT TYPES (`ai_allowed_document_types`): when set, only those types are read.
 *  - MONTHLY LIMITS (`ai_monthly_document_limit`, `ai_monthly_call_limit`): when a limit is reached, processing stops and the
 *    attempt is recorded as BLOCKED.
 *  - USAGE: documents processed, model calls, failures, when, and who asked (`procurement_ai_usage`), for the administrator.
 *
 * AI assists a person reading a document. It never decides: nothing here awards, rejects, approves, pays or changes payment details.
 */
import { randomBytes } from "crypto";
import { prisma } from "../../utils/database";
import { isModulePrivilegedUser } from "../../config/cfoModulePermissions";
import { getP2pConfig } from "./P2pSettings";

export const AI_DOCUMENT_TYPES = [
  "QUOTATION",
  "INVOICE",
  "COMPANY_PROFILE",
  "TAX_CLEARANCE",
  "SUPPLIER_REGISTRATION",
  "TECHNICAL_SUBMISSION",
  "DELIVERY_NOTE",
  "PRICE_SCHEDULE",
  "OTHER",
] as const;

const aiError = (message: string, status: number, code: string) => Object.assign(new Error(message), { status, statusCode: status, code });

const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

export class AiControlService {
  /** What this user (or, with no user, a background task) may do with AI right now, with the reason when it is not allowed. */
  static async status(user?: any) {
    const cfg = await getP2pConfig();
    const usage = await this.monthUsage();
    const types = cfg.aiAllowedDocumentTypes.length ? cfg.aiAllowedDocumentTypes : [...AI_DOCUMENT_TYPES];
    let canUse = true;
    let reason: string | null = null;
    if (!cfg.aiEnabled) {
      canUse = false;
      reason = "AI assistance is switched off for this organisation. Everything else in procurement works as normal.";
    } else if (user && !this.roleAllowed(user, cfg)) {
      canUse = false;
      reason = "AI assistance is limited to approved user groups, and your role is not one of them.";
    } else if (cfg.aiMonthlyDocumentLimit != null && usage.documents >= cfg.aiMonthlyDocumentLimit) {
      canUse = false;
      reason = `This month's limit of ${cfg.aiMonthlyDocumentLimit} AI-processed documents has been reached.`;
    } else if (cfg.aiMonthlyCallLimit != null && usage.calls >= cfg.aiMonthlyCallLimit) {
      canUse = false;
      reason = `This month's limit of ${cfg.aiMonthlyCallLimit} AI model calls has been reached.`;
    }
    return {
      enabled: cfg.aiEnabled,
      canUse,
      reason,
      supportedDocumentTypes: [...AI_DOCUMENT_TYPES],
      allowedDocumentTypes: types,
      restrictedToRoles: cfg.aiAllowedRoleCodes,
      limits: { monthlyDocuments: cfg.aiMonthlyDocumentLimit, monthlyCalls: cfg.aiMonthlyCallLimit },
      month: usage,
    };
  }

  private static roleAllowed(user: any, cfg: { aiAllowedRoleCodes: string[] }) {
    if (!cfg.aiAllowedRoleCodes.length) return true;
    if (isModulePrivilegedUser(user)) return true;
    const code = String(user?.roleCode ?? user?.role?.code ?? "").toUpperCase();
    return cfg.aiAllowedRoleCodes.map((c) => c.toUpperCase()).includes(code);
  }

  /** Refuses (with the reason) unless AI may be used now for this document type. A blocked attempt is recorded. */
  static async gate(user: any | null, documentType: string, meta: { feature?: string; documentName?: string; entityType?: string; entityId?: string } = {}) {
    const cfg = await getP2pConfig();
    const type = String(documentType || "OTHER").toUpperCase();
    const block = async (message: string, status: number, code: string) => {
      await this.record({ userId: user?.id ?? null, feature: meta.feature || "document", documentType: type, status: "BLOCKED", units: 0, errorMessage: message, ...meta }).catch(() => undefined);
      throw aiError(message, status, code);
    };
    if (!cfg.aiEnabled) return block("AI assistance is switched off. Enter the information by hand, or ask an administrator to switch it on.", 403, "AI_DISABLED");
    if (user && !this.roleAllowed(user, cfg)) return block("AI assistance is limited to approved user groups, and your role is not one of them.", 403, "AI_GROUP_NOT_ALLOWED");
    if (!(AI_DOCUMENT_TYPES as readonly string[]).includes(type)) return block(`AI cannot read a document of type ${type}.`, 400, "AI_DOCUMENT_TYPE_UNSUPPORTED");
    if (cfg.aiAllowedDocumentTypes.length && !cfg.aiAllowedDocumentTypes.map((t) => t.toUpperCase()).includes(type)) {
      return block(`AI reading of ${type.toLowerCase().replace(/_/g, " ")} documents is not permitted by the organisation's settings.`, 403, "AI_DOCUMENT_TYPE_NOT_PERMITTED");
    }
    const usage = await this.monthUsage();
    if (cfg.aiMonthlyDocumentLimit != null && usage.documents >= cfg.aiMonthlyDocumentLimit) {
      return block(`The monthly limit of ${cfg.aiMonthlyDocumentLimit} AI-processed documents has been reached. Processing resumes next month, or an administrator can raise the limit.`, 429, "AI_LIMIT_REACHED");
    }
    if (cfg.aiMonthlyCallLimit != null && usage.calls >= cfg.aiMonthlyCallLimit) {
      return block(`The monthly limit of ${cfg.aiMonthlyCallLimit} AI model calls has been reached. Processing resumes next month, or an administrator can raise the limit.`, 429, "AI_LIMIT_REACHED");
    }
  }

  static async record(row: {
    userId?: string | null;
    feature: string;
    documentType?: string | null;
    status: "SUCCESS" | "FAILED" | "BLOCKED";
    units?: number;
    model?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    documentName?: string | null;
    durationMs?: number | null;
    errorMessage?: string | null;
  }) {
    return prisma.procurementAiUsage.create({
      data: {
        id: `aiu_${randomBytes(12).toString("hex")}`,
        userId: row.userId ?? null,
        feature: String(row.feature).slice(0, 64),
        units: row.units ?? 1,
        documentType: row.documentType ? String(row.documentType).slice(0, 48) : null,
        status: row.status,
        model: row.model ? String(row.model).slice(0, 96) : null,
        entityType: row.entityType ?? null,
        entityId: row.entityId ?? null,
        documentName: row.documentName ? String(row.documentName).slice(0, 255) : null,
        durationMs: row.durationMs ?? null,
        errorMessage: row.errorMessage ? String(row.errorMessage).slice(0, 500) : null,
      },
    });
  }

  /**
   * Gate, run the AI work, and record it (success or failure, how long, who asked). `fn` returns `{ result, model?, calls? }` or
   * just the result. A failure is recorded and rethrown.
   */
  static async track<T>(
    user: any | null,
    meta: { feature: string; documentType: string; documentName?: string; entityType?: string; entityId?: string; skipGate?: boolean },
    fn: () => Promise<T | { result: T; model?: string; calls?: number }>
  ): Promise<T> {
    if (!meta.skipGate) await this.gate(user, meta.documentType, meta);
    const started = Date.now();
    try {
      const out: any = await fn();
      const wrapped = out && typeof out === "object" && "result" in out && ("model" in out || "calls" in out);
      await this.record({
        userId: user?.id ?? null,
        feature: meta.feature,
        documentType: meta.documentType,
        status: "SUCCESS",
        units: wrapped ? out.calls ?? 1 : 1,
        model: wrapped ? out.model ?? null : null,
        entityType: meta.entityType,
        entityId: meta.entityId,
        documentName: meta.documentName,
        durationMs: Date.now() - started,
      });
      return wrapped ? out.result : out;
    } catch (e: any) {
      await this.record({
        userId: user?.id ?? null,
        feature: meta.feature,
        documentType: meta.documentType,
        status: "FAILED",
        units: 1,
        entityType: meta.entityType,
        entityId: meta.entityId,
        documentName: meta.documentName,
        durationMs: Date.now() - started,
        errorMessage: String(e?.message || e),
      }).catch(() => undefined);
      throw e;
    }
  }

  /** Documents processed and model calls so far this calendar month. */
  static async monthUsage() {
    const since = monthStart();
    const [docs, calls] = await Promise.all([
      prisma.procurementAiUsage.count({ where: { createdAt: { gte: since }, status: "SUCCESS" } }),
      prisma.procurementAiUsage.aggregate({ where: { createdAt: { gte: since }, status: { in: ["SUCCESS", "FAILED"] } }, _sum: { units: true } }),
    ]);
    return { since: since.toISOString(), documents: docs, calls: Number(calls._sum.units ?? 0) };
  }

  /** What an administrator monitors: totals, failures, blocked attempts, by user and document type, and recent activity. */
  static async summary(opts: { days?: number } = {}) {
    const days = Math.min(Math.max(Number(opts.days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86400000);
    const [rows, month, cfg] = await Promise.all([
      prisma.procurementAiUsage.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 1000 }),
      this.monthUsage(),
      getP2pConfig(),
    ]);
    const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean) as string[])];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true } }) : [];
    const name = (id: string | null) => {
      if (!id) return "System (a supplier submission)";
      const u = users.find((x) => x.id === id);
      return u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : id;
    };
    const count = (f: (r: any) => boolean) => rows.filter(f).length;
    const byKey = (key: (r: any) => string) => {
      const m = new Map<string, { key: string; documents: number; calls: number; failures: number; blocked: number }>();
      for (const r of rows) {
        const k = key(r);
        const cur = m.get(k) ?? { key: k, documents: 0, calls: 0, failures: 0, blocked: 0 };
        if (r.status === "SUCCESS") cur.documents += 1;
        if (r.status !== "BLOCKED") cur.calls += r.units;
        if (r.status === "FAILED") cur.failures += 1;
        if (r.status === "BLOCKED") cur.blocked += 1;
        m.set(k, cur);
      }
      return [...m.values()].sort((a, b) => b.documents - a.documents);
    };
    return {
      since: since.toISOString(),
      days,
      enabled: cfg.aiEnabled,
      limits: { monthlyDocuments: cfg.aiMonthlyDocumentLimit, monthlyCalls: cfg.aiMonthlyCallLimit },
      thisMonth: month,
      totals: { documentsProcessed: count((r) => r.status === "SUCCESS"), modelCalls: rows.filter((r) => r.status !== "BLOCKED").reduce((s, r) => s + r.units, 0), failures: count((r) => r.status === "FAILED"), blocked: count((r) => r.status === "BLOCKED") },
      byUser: byKey((r) => name(r.userId)),
      byDocumentType: byKey((r) => r.documentType || "—"),
      byFeature: byKey((r) => r.feature),
      recent: rows.slice(0, 100).map((r) => ({
        at: r.createdAt,
        user: name(r.userId),
        feature: r.feature,
        documentType: r.documentType,
        documentName: r.documentName,
        status: r.status,
        modelCalls: r.units,
        model: r.model,
        durationMs: r.durationMs,
        error: r.errorMessage,
      })),
    };
  }
}
