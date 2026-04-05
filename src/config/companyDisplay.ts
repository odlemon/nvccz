/**
 * Canonical company labels for APIs, scorecards, payroll, and auth emails.
 * Set in environment (same convention as EmailNotificationService):
 * - COMPANY_NAME_FULL — legal / long name (e.g. National Venture Capital Company of Zimbabwe)
 * - COMPANY_NAME_SHORT — short / brand token (e.g. NVCCZ)
 *
 * Company Profile `legalName` still wins when passed into resolveOrganisationDisplayName.
 */

function trimEnv(key: string): string {
  const v = process.env[key];
  if (v == null || String(v).trim() === "") return "";
  return String(v).trim();
}

/** Long form; default matches EmailNotificationService. */
export function companyNameFullFromEnv(): string {
  return trimEnv("COMPANY_NAME_FULL") || "National Venture Capital Company of Zimbabwe";
}

/** Short form; default matches EmailNotificationService. */
export function companyNameShortFromEnv(): string {
  return trimEnv("COMPANY_NAME_SHORT") || "NVCCZ";
}

/**
 * Header / document organisation name: profile legal name first, then env, then legacy default.
 */
export function resolveOrganisationDisplayName(brandingLegalName?: string | null): string {
  const fromProfile = brandingLegalName != null ? String(brandingLegalName).trim() : "";
  if (fromProfile) return fromProfile;
  const full = trimEnv("COMPANY_NAME_FULL");
  if (full) return full;
  const short = trimEnv("COMPANY_NAME_SHORT");
  if (short) return short;
  return companyNameShortFromEnv();
}

/**
 * CEO scorecard line when no named CEO: "Full legal (SHORT)" if short is not already in full.
 */
export function chiefExecutiveOrganisationLine(): string {
  const full = trimEnv("COMPANY_NAME_FULL") || companyNameFullFromEnv();
  const short = companyNameShortFromEnv();
  if (short && !full.includes(short)) return `${full} (${short})`;
  return full;
}

/** Board party line: "Board of Directors — SHORT" */
export function boardDirectorsWithOrganisationShort(): string {
  return `Board of Directors — ${companyNameShortFromEnv()}`;
}
