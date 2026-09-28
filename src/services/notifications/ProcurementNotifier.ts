// @ts-nocheck
import crypto from "node:crypto";
import { prisma } from "../../utils/database";
import { userHasEffectivePermission } from "../../config/cfoModulePermissions";
import { dispatchProcurementNotification } from "../ProcurementNotificationService";

/**
 * SRD §34: one shared notification path for every procurement event.
 *
 * An event is raised with `notify(EVENT, { recipients, entity, vars })`. From there everything is the same for every event:
 *   1. the event's RULE is read (procurement_settings.notification_rules_json over the built-in defaults). A rule that is switched
 *      off stops the notification, and the decision is logged;
 *   2. the recipients are the people the caller named, checked to be active staff, with the person who caused the event left out
 *      unless the event is a receipt for that very person (the requester's own "submitted");
 *   3. ONE template renders the message (title, sentence, a table of facts, a link) into the in-app notification and into the
 *      branded email (the header, footer and signature come from the shared email layout);
 *   4. each recipient and channel is recorded in procurement_notification_log with what happened: SENT, BLOCKED (the mail guard held
 *      it: outbound mail is blocked unless MAIL_REDIRECT_TO is set), FAILED, SKIPPED (no address / no account) or DISABLED (the rule
 *      is off). An email that cannot be delivered never stops the in-app notification, and the reverse.
 */
export type EventKey =
  | "REQUISITION_SUBMITTED" | "APPROVAL_REQUIRED" | "REQUISITION_RETURNED" | "REQUISITION_REJECTED" | "RFQ_INVITATION" | "SOURCING_DEADLINE"
  | "EVALUATION_ASSIGNED" | "EVALUATION_OVERDUE" | "APPROVAL_ASSIGNED" | "PO_ISSUED" | "VENDOR_DOCUMENT_EXPIRING" | "INVOICE_EXCEPTION"
  | "INTEGRATION_FAILURE" | "TASK_ESCALATION";

export type Rule = { enabled: boolean; inApp: boolean; email: boolean; params?: Record<string, number> };

type EventDef = {
  key: EventKey;
  label: string;
  /** who receives it, in words (shown on the settings screen) */
  audience: string;
  /** does the person who caused the event receive it too? (a submitter's own receipt: yes) */
  notifyActor?: boolean;
  defaults: Rule;
  /** the configurable thresholds and what they mean */
  paramLabels?: Record<string, string>;
  page: string;
  template: (v: Record<string, any>) => { title: string; sentence: string; facts: Array<[string, any]> };
};

const on = (email = true, inApp = true, params?: Record<string, number>): Rule => ({ enabled: true, inApp, email, params });

export const NOTIFICATION_EVENTS: Record<EventKey, EventDef> = {
  REQUISITION_SUBMITTED: {
    key: "REQUISITION_SUBMITTED", label: "Requisition submitted", audience: "The requester (a receipt for their submission)", notifyActor: true, defaults: on(), page: "requisitions",
    template: (v) => ({ title: `Requisition ${v.ref} submitted`, sentence: `Your requisition ${v.ref} has been submitted and is on its way to its approvers.`, facts: [["Requisition", v.ref], ["Title", v.title], ["Department", v.department], ["Amount", v.amount], ["Approval steps", v.steps]] }),
  },
  APPROVAL_REQUIRED: {
    key: "APPROVAL_REQUIRED", label: "Approval required", audience: "The approver(s) of the step now waiting", defaults: on(), page: "approvals",
    template: (v) => ({ title: `Approval required: ${v.ref}`, sentence: `${v.ref} is waiting for your decision.`, facts: [["Record", v.ref], ["Title", v.title], ["Amount", v.amount], ["Department", v.department], ["Requested by", v.requester], ["Step", v.step]] }),
  },
  REQUISITION_RETURNED: {
    key: "REQUISITION_RETURNED", label: "Requisition returned", audience: "The requester", defaults: on(), page: "requisitions",
    template: (v) => ({ title: `Requisition ${v.ref} returned`, sentence: `${v.ref} was returned for amendment. Review the comment, amend it and resubmit.`, facts: [["Requisition", v.ref], ["Returned by", v.actor], ["Reason", v.reason]] }),
  },
  REQUISITION_REJECTED: {
    key: "REQUISITION_REJECTED", label: "Requisition rejected", audience: "The requester", defaults: on(), page: "requisitions",
    template: (v) => ({ title: `Requisition ${v.ref} rejected`, sentence: `${v.ref} was rejected.`, facts: [["Requisition", v.ref], ["Rejected by", v.actor], ["Reason", v.reason]] }),
  },
  RFQ_INVITATION: {
    key: "RFQ_INVITATION", label: "RFQ invitation", audience: "Each invited vendor (by email; vendors have no in-app account)", defaults: on(true, false), page: "tenders",
    template: (v) => ({ title: `Invitation to quote: ${v.ref}`, sentence: `You are invited to submit a quotation for ${v.title || v.ref}.`, facts: [["Reference", v.ref], ["Title", v.title], ["Requirements", v.items], ["Deliver to", v.delivery], ["Closing", v.closing], ["Special requirements", v.special], ["Contact", v.contact]] }),
  },
  SOURCING_DEADLINE: {
    key: "SOURCING_DEADLINE", label: "Sourcing deadline approaching", audience: "The officer who owns the RFQ", defaults: on(true, true, { daysBefore: 2 }), paramLabels: { daysBefore: "Days before the closing date" }, page: "tenders",
    template: (v) => ({ title: `${v.ref} closes ${v.closing}`, sentence: `${v.ref} closes on ${v.closing}. ${v.bids} quotation(s) received so far.`, facts: [["RFQ", v.ref], ["Title", v.title], ["Closing", v.closing], ["Quotations received", v.bids]] }),
  },
  EVALUATION_ASSIGNED: {
    key: "EVALUATION_ASSIGNED", label: "Evaluation assigned", audience: "The committee member appointed", defaults: on(), page: "evaluation",
    template: (v) => ({ title: `You are on the evaluation of ${v.ref}`, sentence: `You have been appointed to the evaluation committee for ${v.ref}${v.role ? ` as ${v.role}` : ""}.`, facts: [["RFQ", v.ref], ["Title", v.title], ["Role", v.role]] }),
  },
  EVALUATION_OVERDUE: {
    key: "EVALUATION_OVERDUE", label: "Evaluation overdue", audience: "The committee members who have not yet submitted their scorecard, and the RFQ owner", defaults: on(true, true, { daysAfterClose: 3 }), paramLabels: { daysAfterClose: "Days after closing before an unsubmitted scorecard is overdue" }, page: "evaluation",
    template: (v) => ({ title: `Evaluation overdue: ${v.ref}`, sentence: `The scorecard for ${v.ref} was due ${v.days} day(s) after the RFQ closed and has not been submitted.`, facts: [["RFQ", v.ref], ["Closed", v.closed], ["Scorecards pending", v.pending]] }),
  },
  APPROVAL_ASSIGNED: {
    key: "APPROVAL_ASSIGNED", label: "Approval assigned", audience: "The person an approval is delegated or assigned to", defaults: on(), page: "approvals",
    template: (v) => ({ title: `An approval was assigned to you: ${v.ref}`, sentence: `${v.actor} assigned the approval of ${v.ref} to you.`, facts: [["Record", v.ref], ["Assigned by", v.actor], ["Reason", v.reason]] }),
  },
  PO_ISSUED: {
    key: "PO_ISSUED", label: "Purchase order issued", audience: "The officer who raised the order and the requester of its requisition", defaults: on(), page: "orders",
    template: (v) => ({ title: `Purchase order ${v.ref} issued`, sentence: `${v.ref} has been issued to ${v.vendor}.`, facts: [["Purchase order", v.ref], ["Vendor", v.vendor], ["Amount", v.amount], ["Delivery", v.delivery]] }),
  },
  VENDOR_DOCUMENT_EXPIRING: {
    key: "VENDOR_DOCUMENT_EXPIRING", label: "Vendor document expiring", audience: "Officers who manage vendors", defaults: on(true, true, { daysBefore: 30 }), paramLabels: { daysBefore: "Days before expiry" }, page: "vendors",
    template: (v) => (v.expired ? { title: `${v.document} for ${v.vendor} has expired`, sentence: `${v.vendor}'s ${v.document} expired on ${v.expiry}. The vendor cannot be invited, awarded, issued a PO or paid until it is renewed.`, facts: [["Vendor", v.vendor], ["Document", v.document], ["Expired", v.expiry]] } : { title: `${v.document} for ${v.vendor} expires ${v.expiry}`, sentence: `${v.vendor}'s ${v.document} expires on ${v.expiry}. Ask the vendor for a renewed document.`, facts: [["Vendor", v.vendor], ["Document", v.document], ["Expires", v.expiry], ["Days left", v.daysLeft]] }),
  },
  INVOICE_EXCEPTION: {
    key: "INVOICE_EXCEPTION", label: "Invoice exception", audience: "Officers who approve invoices", defaults: on(), page: "invoices",
    template: (v) => ({ title: `Invoice ${v.ref} has a match exception`, sentence: `Invoice ${v.ref} from ${v.vendor} cannot be approved as it stands: ${v.summary}`, facts: [["Invoice", v.ref], ["Vendor", v.vendor], ["Purchase order", v.po], ["Amount", v.amount], ["Exceptions", v.summary]] }),
  },
  INTEGRATION_FAILURE: {
    key: "INTEGRATION_FAILURE", label: "Integration failure", audience: "Administrators and finance managers", defaults: on(), page: "accounts",
    template: (v) => ({ title: `Integration failure: ${v.system}`, sentence: `${v.system} did not accept ${v.ref}: ${v.error}`, facts: [["System", v.system], ["Record", v.ref], ["Error", v.error]] }),
  },
  TASK_ESCALATION: {
    key: "TASK_ESCALATION", label: "Task escalation", audience: "Procurement managers, when an approval has waited too long", defaults: on(true, true, { afterHours: 48 }), paramLabels: { afterHours: "Hours an approval may wait before it is escalated" }, page: "approvals",
    template: (v) => ({ title: `Escalation: ${v.ref} has waited ${v.hours} hours`, sentence: `${v.ref} has been waiting for ${v.approver} for ${v.hours} hours.`, facts: [["Record", v.ref], ["Waiting on", v.approver], ["Hours waiting", v.hours]] }),
  },
};

export const EVENT_KEYS = Object.keys(NOTIFICATION_EVENTS) as EventKey[];

// ------------------------------------------------------------------------------------------------ the rules

let rulesCache: { at: number; value: Record<EventKey, Rule> } | null = null;

export async function getRules(): Promise<Record<EventKey, Rule>> {
  // read once every few seconds: a rule change made through this server applies at once (saveRules clears it)
  if (rulesCache && Date.now() - rulesCache.at < 3000) return rulesCache.value;
  const row: any = await prisma.procurementSettings.findUnique({ where: { id: "default" }, select: { notificationRulesJson: true } }).catch(() => null);
  const stored = (row?.notificationRulesJson && typeof row.notificationRulesJson === "object" ? row.notificationRulesJson : {}) as Record<string, Partial<Rule>>;
  const out: any = {};
  for (const k of EVENT_KEYS) {
    const d = NOTIFICATION_EVENTS[k].defaults;
    const s = stored[k] ?? {};
    out[k] = { enabled: s.enabled ?? d.enabled, inApp: s.inApp ?? d.inApp, email: s.email ?? d.email, params: { ...(d.params ?? {}), ...(s.params ?? {}) } };
  }
  rulesCache = { at: Date.now(), value: out };
  return out;
}

export class RuleError extends Error { status = 400; }

export async function saveRules(patch: Record<string, Partial<Rule>>) {
  const current = await getRules();
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!(k in NOTIFICATION_EVENTS)) throw new RuleError(`"${k}" is not a notification event.`);
    const def = NOTIFICATION_EVENTS[k as EventKey];
    const next: Rule = { ...current[k as EventKey] };
    for (const f of ["enabled", "inApp", "email"] as const) if (v?.[f] !== undefined) next[f] = Boolean(v[f]);
    if (v?.params) {
      for (const [p, n] of Object.entries(v.params)) {
        if (!def.paramLabels || !(p in def.paramLabels)) throw new RuleError(`${def.label} has no setting "${p}".`);
        const num = Number(n);
        if (!Number.isFinite(num) || num < 0 || num > 3650) throw new RuleError(`${def.paramLabels[p]} must be a number between 0 and 3650.`);
        next.params = { ...(next.params ?? {}), [p]: num };
      }
    }
    current[k as EventKey] = next;
  }
  await prisma.procurementSettings.upsert({ where: { id: "default" }, update: { notificationRulesJson: current as any }, create: { id: "default", notificationRulesJson: current as any } });
  rulesCache = null;
  return current;
}

export async function describeRules() {
  const rules = await getRules();
  return EVENT_KEYS.map((k) => ({ key: k, label: NOTIFICATION_EVENTS[k].label, audience: NOTIFICATION_EVENTS[k].audience, paramLabels: NOTIFICATION_EVENTS[k].paramLabels ?? {}, ...rules[k] }));
}

// ------------------------------------------------------------------------------------------------ recipients

/** Active staff who hold a procurement permission (resolved with the same check the API uses). Cached briefly. */
let permCache: { at: number; users: any[] } | null = null;
export async function usersWithPermission(...permissions: string[]): Promise<string[]> {
  if (!permCache || Date.now() - permCache.at > 60_000) {
    permCache = { at: Date.now(), users: await prisma.user.findMany({ where: { status: "ACTIVE" as any }, include: { role: true } }).catch(() => []) };
  }
  return permCache.users.filter((u) => permissions.some((p) => userHasEffectivePermission(u, p))).map((u) => u.id);
}
export const clearRecipientCache = () => { permCache = null; };

// ------------------------------------------------------------------------------------------------ the one template

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const clean = (facts: Array<[string, any]>) => facts.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");

/** The single email body every procurement notification uses (the branded header, footer and signature wrap it). */
export function renderEmailBody(def: EventDef, sentence: string, facts: Array<[string, any]>, link?: string, linkLabel = "Open in Procurement") {
  const rows = clean(facts).map(([k, v]) => `<tr><td style="padding:6px 12px;color:#64748b;font-size:13px;white-space:nowrap">${esc(k)}</td><td style="padding:6px 12px;font-size:14px;color:#0f172a">${esc(v)}</td></tr>`).join("");
  return `<p style="font-size:15px;line-height:1.5;color:#0f172a;margin:0 0 14px">${esc(sentence)}</p>`
    + (rows ? `<table role="presentation" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;margin:0 0 16px">${rows}</table>` : "")
    + (link ? `<p style="margin:0 0 6px"><a href="${esc(link)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px">${esc(linkLabel)}</a></p>` : "");
}

/** More email recipients than this are mailed in the background. */
const BULK_EMAILS = 25;

const baseUrl = () => String(process.env.FRONTEND_URL || process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

// ------------------------------------------------------------------------------------------------ dispatch

async function log(rows: Array<{ eventKey: string; recipientId?: string | null; recipientEmail?: string | null; channel: string; status: string; reason?: string | null; entityType?: string | null; entityId?: string | null; title?: string | null }>) {
  if (!rows.length) return;
  try {
    const marks = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))").join(", ");
    const args: any[] = [];
    for (const r of rows) args.push(crypto.randomUUID().replace(/-/g, "").slice(0, 25), r.eventKey, r.recipientId ?? null, r.recipientEmail ?? null, r.channel, r.status, (r.reason ?? null)?.slice(0, 250) ?? null, r.entityType ?? null, r.entityId ?? null, (r.title ?? null)?.slice(0, 250) ?? null);
    await prisma.$executeRawUnsafe(`INSERT INTO procurement_notification_log (id, event_key, recipient_id, recipient_email, channel, status, reason, entity_type, entity_id, title, created_at) VALUES ${marks}`, ...args);
  } catch (_e) { /* the log must never fail the event */ }
}

export type NotifyInput = {
  /** staff to notify (in-app and email) */
  userIds?: string[];
  /** addresses with no staff account (vendors): email only */
  emails?: string[];
  entityType?: string;
  entityId?: string;
  vars: Record<string, any>;
  /** extra data stored on the in-app notification (a link path, ids the caller uses to avoid repeats) */
  data?: Record<string, any>;
  /** the in-app notification type, when an existing consumer already knows this event by another name (default PROCUREMENT_<EVENT>) */
  type?: string;
  /** the email button's words (default: Open in Procurement) */
  linkLabel?: string;
  /** an absolute link for the email button, when the page is not a staff page (a vendor's own quotation link) */
  link?: string;
  /** the person who caused the event; not notified unless the event is their own receipt */
  actorId?: string | null;
};

export async function notify(key: EventKey, input: NotifyInput) {
  const def = NOTIFICATION_EVENTS[key];
  const rules = await getRules();
  const rule = rules[key];
  const msg = def.template(input.vars);
  const base = { eventKey: key, entityType: input.entityType ?? null, entityId: input.entityId ?? null, title: msg.title };
  const wanted = Array.from(new Set((input.userIds ?? []).filter(Boolean)));

  if (!rule.enabled) {
    await log([{ ...base, channel: "ALL", status: "DISABLED", reason: "The rule for this event is switched off" }]);
    return { key, enabled: false, inApp: 0, emailSent: 0, emailBlocked: 0, emailFailed: 0, skipped: 0 };
  }

  // staff: active accounts only; the person who caused the event is left out unless it is their own receipt
  const users: any[] = wanted.length ? await prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true, email: true, status: true, firstName: true, lastName: true } }) : [];
  const staff = users.filter((u) => String(u.status ?? "ACTIVE").toUpperCase() === "ACTIVE" && (def.notifyActor || !input.actorId || u.id !== input.actorId));
  const link = `${baseUrl()}/procurement/${PAGE_PATH[def.page] ?? ""}`.replace(/\/$/, "");
  const body = renderEmailBody(def, msg.sentence, msg.facts, input.link ?? (baseUrl() ? link : undefined), input.linkLabel);
  const type = input.type ?? `PROCUREMENT_${key}`;
  let inApp = 0, emailSent = 0, emailBlocked = 0, emailFailed = 0, skipped = 0;

  // in-app
  if (rule.inApp && staff.length) {
    const r = await dispatchProcurementNotification({
      userIds: staff.map((u) => u.id), title: msg.title, message: msg.sentence, type, relatedEntity: input.entityType, relatedEntityId: input.entityId,
      quiet: !!def.notifyActor, data: { event: key, page: def.page, path: `/procurement/${PAGE_PATH[def.page] ?? ""}`.replace(/\/$/, ""), facts: clean(msg.facts), ...(input.data ?? {}) },
    });
    inApp = r.inAppCount;
    await log(staff.map((u) => ({ ...base, recipientId: u.id, recipientEmail: u.email, channel: "IN_APP", status: r.inAppCount ? "SENT" : "FAILED" })));
  } else if (rule.inApp && !staff.length) {
    await log([{ ...base, channel: "IN_APP", status: "SKIPPED", reason: "No staff recipient" }]);
    skipped += 1;
  } else if (!rule.inApp) {
    await log([{ ...base, channel: "IN_APP", status: "DISABLED", reason: "In-app is switched off for this event" }]);
  }

  // email: one message per person, so nobody sees another's address
  if (rule.email) {
    const targets: Array<{ id?: string; email: string }> = [
      ...staff.filter((u) => u.email).map((u) => ({ id: u.id, email: String(u.email) })),
      ...(input.emails ?? []).filter(Boolean).map((e) => ({ email: e })),
    ];
    const noEmail = staff.filter((x) => !x.email);
    await log(noEmail.map((u) => ({ ...base, recipientId: u.id, channel: "EMAIL", status: "SKIPPED", reason: "No email address on the account" })));
    skipped += noEmail.length;
    const seen = new Set<string>();
    const unique = targets.filter((t) => { const k = t.email.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    // a few at a time: one message per person, and one slow address does not hold up the rest
    const sendAll = async () => {
      const emailLogs: any[] = [];
      let sent = 0, blocked = 0, failed = 0;
      for (let i = 0; i < unique.length; i += 8) {
        await Promise.all(unique.slice(i, i + 8).map(async (t) => {
          const r = await dispatchProcurementNotification({ title: msg.title, message: msg.sentence, type, email: { to: [t.email], subject: msg.title, bodyInnerHtml: body, preheader: msg.sentence } });
          const status = r.emailSent ? (r.emailBlocked ? "BLOCKED" : "SENT") : "FAILED";
          if (status === "SENT") sent += 1; else if (status === "BLOCKED") blocked += 1; else failed += 1;
          emailLogs.push({ ...base, recipientId: t.id ?? null, recipientEmail: t.email, channel: "EMAIL", status, reason: r.emailError ?? (r.emailBlocked ? "Held by the mail guard (outbound mail is blocked unless MAIL_REDIRECT_TO is set)" : null) });
        }));
      }
      await log(emailLogs);
      return { sent, blocked, failed };
    };
    if (unique.length > BULK_EMAILS) {
      // a very large audience is mailed in the background: the action that raised the event (an invoice, an order) never waits on it
      void sendAll().catch((e) => console.error(`[notify ${key}] bulk email`, e?.message || e));
    } else {
      const r = await sendAll();
      emailSent += r.sent; emailBlocked += r.blocked; emailFailed += r.failed;
    }
  } else {
    await log([{ ...base, channel: "EMAIL", status: "DISABLED", reason: "Email is switched off for this event" }]);
  }
  return { key, enabled: true, inApp, emailSent, emailBlocked, emailFailed, skipped };
}

const PAGE_PATH: Record<string, string> = { requisitions: "requisitions", approvals: "approvals", tenders: "tenders", evaluation: "evaluation", orders: "purchase-orders", vendors: "vendors", invoices: "invoices", accounts: "accounts" };

/** Fire-and-forget wrapper for call sites in the middle of a business action: a notification problem must never fail the action. */
export function notifySafe(key: EventKey, input: NotifyInput) {
  return notify(key, input).catch((e) => console.error(`[notify ${key}]`, e?.message || e));
}

/** SRD §34: an integration (the ledger, the cashbook) refused a record: administrators and finance managers are told. Never throws. */
export async function notifyIntegrationFailure(system: string, ref: string, error: unknown, entityType?: string, entityId?: string) {
  try {
    const { PROCUREMENT_PERMISSIONS: P } = await import("../../config/procurementPermissions");
    const userIds = await usersWithPermission(P.invoicesApprove);
    await notify("INTEGRATION_FAILURE", { userIds, entityType, entityId, vars: { system, ref, error: String((error as any)?.message || error).slice(0, 400) } });
  } catch (e: any) { console.error("[notify INTEGRATION_FAILURE]", e?.message || e); }
}
