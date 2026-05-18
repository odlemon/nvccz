import { prisma } from "../utils/database";
import { CompanyProfileAddressService } from "../services/CompanyProfileAddressService";
import {
  buildNewsletterFooterTr,
  buildNewsletterHeaderTr,
  buildNewsletterTitleTr,
  escapeAttrForEmail,
  escapeHtmlForEmail,
} from "./newsletterEmailLayout";

export type EmailBranding = {
  companyName: string;
  logoUrl: string | null;
  // Address lines for display; may be empty if not configured.
  addressLines: string[];
  // Optional contact lines for footer.
  contactEmail?: string | null;
  contactPhone?: string | null;
  website?: string | null;
};

const BRANDING_CACHE_TTL_MS = 300_000;
let _cache: { branding: EmailBranding; ts: number } | null = null;

function clean(v?: string | null) {
  const t = String(v ?? "").trim();
  return t ? t : null;
}

function resolveCompanyName(profileLegalName?: string | null) {
  return (
    clean(profileLegalName) ||
    clean(process.env.COMPANY_NAME_LONG) ||
    clean(process.env.COMPANY_NAME_SHORT) ||
    "NVCCZ"
  );
}

/** Prefer active letterhead `label` (Company Profile → Addresses); else profile legal name / env. */
function resolveDisplayCompanyName(
  activeAddr: { label?: string | null } | null,
  profileLegalName?: string | null
) {
  const fromLetterhead = clean(activeAddr?.label ?? null);
  if (fromLetterhead) return fromLetterhead;
  return resolveCompanyName(profileLegalName);
}

function joinAddressLines(parts: Array<string | null | undefined>) {
  const out: string[] = [];
  for (const p of parts) {
    const t = clean(p);
    if (t) out.push(t);
  }
  return out;
}

/** Load branding from DB (active letterhead address + company profile). Does not read/write cache. */
export async function loadEmailBrandingFromDb(): Promise<EmailBranding> {
  const [profile, activeAddr] = await Promise.all([
    prisma.companyProfile.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { legalName: true, logoUrl: true, email: true, phone: true, website: true },
    }),
    CompanyProfileAddressService.getActive(),
  ]);

  const companyName = resolveDisplayCompanyName(activeAddr, profile?.legalName ?? null);
  const logoUrl =
    clean(activeAddr?.logoUrl ?? null) ||
    clean(profile?.logoUrl ?? null) ||
    clean(process.env.COMPANY_LOGO_URL) ||
    null;

  const addressLines = activeAddr
    ? joinAddressLines([
        activeAddr.line1,
        activeAddr.line2,
        [clean(activeAddr.city), clean(activeAddr.state)].filter(Boolean).join(", ") || null,
        [clean(activeAddr.postalCode), clean(activeAddr.country)].filter(Boolean).join(" ") || null,
      ])
    : [];

  return {
    companyName,
    logoUrl,
    addressLines,
    contactEmail: clean(profile?.email ?? null) || clean(process.env.EMAIL_SUPPORT) || null,
    contactPhone: clean(profile?.phone ?? null) || null,
    website: clean(profile?.website ?? null) || clean(process.env.FRONTEND_URL) || null,
  };
}

export async function getEmailBrandingCached(): Promise<EmailBranding> {
  if (_cache && Date.now() - _cache.ts < BRANDING_CACHE_TTL_MS) {
    return _cache.branding;
  }

  const branding = await loadEmailBrandingFromDb();

  _cache = { branding, ts: Date.now() };
  return branding;
}

/**
 * Newsletter-style header + Georgia title rows (matches internal newsletter card).
 * Logo uses public URL (transactional sends); internal newsletters may CID-embed separately.
 */
export function renderTransactionalEmailHeaderRows(
  branding: EmailBranding,
  opts: { emailHeading: string; headerTagline?: string | null }
): string {
  const tagline = clean(opts.headerTagline) || "Notification";
  const heading = clean(opts.emailHeading) || "Update";
  const logoTag = branding.logoUrl
    ? `<img src="${escapeAttrForEmail(branding.logoUrl)}" alt="${escapeHtmlForEmail(branding.companyName)}" width="64" height="64" style="width:64px;height:64px;border-radius:999px;object-fit:cover;display:inline-block;border:2px solid rgba(255,255,255,0.6);" />`
    : "";
  return (
    buildNewsletterHeaderTr(branding, {
      taglineEscaped: escapeHtmlForEmail(tagline),
      logoImgTagOrEmpty: logoTag,
    }) + buildNewsletterTitleTr(escapeHtmlForEmail(heading))
  );
}

/** @param opts.tagline Small-caps line under company name (e.g. Procurement, Events). */
export function renderEmailHeader(
  branding: EmailBranding,
  opts?: { title?: string | null; tagline?: string | null }
) {
  const heading = clean(opts?.title) || "Update";
  const tagline = clean(opts?.tagline) || "Notification";
  return renderTransactionalEmailHeaderRows(branding, { emailHeading: heading, headerTagline: tagline });
}

export function renderEmailSignature(teamLabel: string, branding: EmailBranding) {
  const team = clean(teamLabel) || "Team";
  return `
    <p style="margin-top:22px;">Best regards,<br/>
    <strong>${team}</strong><br/>
    <span style="color:#555;">${branding.companyName}</span></p>
  `;
}

export function renderEmailFooter(branding: EmailBranding) {
  return buildNewsletterFooterTr(branding);
}

