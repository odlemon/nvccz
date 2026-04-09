/**
 * Investee reporting notification copy — portal link, period labels, mandatory doc list.
 * Base URL aligns with other modules (FRONTEND_URL + application path).
 */

/** Catalog for investor UI multi-select and for `attachmentOptionIds` on open-calendar POST. */
export const REPORTING_MANDATORY_ATTACHMENT_OPTIONS: ReadonlyArray<{
  id: string;
  name: string;
  formats: string;
}> = [
  { id: "INCOME_STATEMENT", name: "Income statement", formats: "Excel (.xlsx)" },
  {
    id: "STATEMENT_OF_FINANCIAL_POSITION",
    name: "Statement of financial position (balance sheet)",
    formats: "Excel (.xlsx)",
  },
  { id: "CASH_FLOW_STATEMENT", name: "Cash flow statement", formats: "Excel (.xlsx)" },
  { id: "BANK_STATEMENTS", name: "Bank statements", formats: "Excel (.xlsx) or PDF" },
  {
    id: "TAX_COMPLIANCE",
    name: "Tax / compliance filings and certificates",
    formats: "PDF (Excel where applicable)",
  },
  { id: "MANAGEMENT_ACCOUNTS", name: "Management accounts", formats: "Excel (.xlsx) or PDF" },
  {
    id: "BUSINESS_PLAN",
    name: "Business plan / investor narrative and projections",
    formats: "PDF (Excel for models)",
  },
];

export const MANDATORY_REPORTING_ATTACHMENTS: ReadonlyArray<{ name: string; formats: string }> =
  REPORTING_MANDATORY_ATTACHMENT_OPTIONS.map(({ name, formats }) => ({ name, formats }));

export function normalizeFrontendBaseUrl(): string {
  return String(process.env.FRONTEND_URL || "http://app.kyntaro.com").replace(/\/+$/, "");
}

/** Deep link shown in reporting emails (matches investee app route). */
export function getInvesteeReportsPortalUrl(): string {
  return `${normalizeFrontendBaseUrl()}/application-portal/reports`;
}

/** e.g. period end 2024-03-31 → "Q1 2024" */
export function reportingPeriodQuarterLabel(reportingPeriodIso: string): string {
  const [ys, ms] = reportingPeriodIso.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return reportingPeriodIso;
  }
  const q = Math.ceil(m / 3);
  return `Q${q} ${y}`;
}

/** e.g. 2026-04-15 → "15 April 2026" */
export function formatDueDateForEmail(dueDateIso: string): string {
  const d = new Date(`${dueDateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dueDateIso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export type ReportingMandatoryAttachment = { name: string; formats: string };

/** HTML `<ul>` for the attachment list (email body). */
export function mandatoryAttachmentsHtmlList(items: ReadonlyArray<ReportingMandatoryAttachment>): string {
  const itemsHtml = items
    .map((a) => `<li><strong>${escapeHtml(a.name)}</strong> — ${escapeHtml(a.formats)}</li>`)
    .join("");
  return `<ul style="margin:8px 0;padding-left:20px;">${itemsHtml}</ul>`;
}

export function mandatoryAttachmentsHtml(): string {
  return mandatoryAttachmentsHtmlList(MANDATORY_REPORTING_ATTACHMENTS);
}

/**
 * Parse `mandatoryAttachments` from API body. When `required`, body must include a non-empty array of `{ name, formats }`.
 */
/** Build `{ name, formats }[]` from catalog ids (order preserved, duplicates dropped). Unknown id → null. */
export function resolveMandatoryAttachmentsFromOptionIds(ids: unknown): ReportingMandatoryAttachment[] | null {
  if (!Array.isArray(ids)) return null;
  const seen = new Set<string>();
  const order: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  if (order.length === 0) return null;
  const byId = new Map(REPORTING_MANDATORY_ATTACHMENT_OPTIONS.map((o) => [o.id, o]));
  const out: ReportingMandatoryAttachment[] = [];
  for (const id of order) {
    const row = byId.get(id);
    if (!row) return null;
    out.push({ name: row.name, formats: row.formats });
  }
  return out;
}

export function parseMandatoryAttachmentsInput(
  raw: unknown,
  opts: { required: boolean }
): ReportingMandatoryAttachment[] | null {
  if (raw === undefined || raw === null) {
    if (opts.required) return null;
    return null;
  }
  if (!Array.isArray(raw)) {
    return null;
  }
  if (raw.length === 0) {
    return null;
  }
  const out: ReportingMandatoryAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const formats = String(o.formats ?? "").trim();
    if (!name || !formats) return null;
    out.push({ name, formats });
  }
  return out;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
