import { prisma } from "../utils/database";
import { CompanyProfileAddressService } from "../services/CompanyProfileAddressService";

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

function joinAddressLines(parts: Array<string | null | undefined>) {
  const out: string[] = [];
  for (const p of parts) {
    const t = clean(p);
    if (t) out.push(t);
  }
  return out;
}

export async function getEmailBrandingCached(): Promise<EmailBranding> {
  if (_cache && Date.now() - _cache.ts < BRANDING_CACHE_TTL_MS) {
    return _cache.branding;
  }

  const [profile, activeAddr] = await Promise.all([
    prisma.companyProfile.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { legalName: true, logoUrl: true, email: true, phone: true, website: true },
    }),
    CompanyProfileAddressService.getActive(),
  ]);

  const companyName = resolveCompanyName(profile?.legalName ?? null);
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

  const branding: EmailBranding = {
    companyName,
    logoUrl,
    addressLines,
    contactEmail: clean(profile?.email ?? null) || clean(process.env.EMAIL_SUPPORT) || null,
    contactPhone: clean(profile?.phone ?? null) || null,
    website: clean(profile?.website ?? null) || clean(process.env.FRONTEND_URL) || null,
  };

  _cache = { branding, ts: Date.now() };
  return branding;
}

export function renderEmailHeader(branding: EmailBranding, opts?: { title?: string | null }) {
  const title = clean(opts?.title ?? null);
  const logo = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${branding.companyName} logo" style="width:64px;height:64px;border-radius:999px;object-fit:cover;display:block;" />`
    : "";

  const addressHtml = branding.addressLines.length
    ? `<div style="margin-top:6px;color:#eef2ff;font-size:12px;line-height:1.4;">${branding.addressLines
        .map((l) => `<div>${l}</div>`)
        .join("")}</div>`
    : "";

  return `
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#ffffff;padding:24px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;">
            <div style="font-size:18px;font-weight:700;line-height:1.2;">${branding.companyName}</div>
            ${title ? `<div style="margin-top:6px;font-size:13px;opacity:0.95;">${title}</div>` : ""}
            ${addressHtml}
          </td>
          <td style="vertical-align:middle;text-align:right;width:80px;">
            ${logo}
          </td>
        </tr>
      </table>
    </div>
  `;
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
  const year = new Date().getFullYear();
  const contactBits = [branding.contactEmail ? `Email: ${branding.contactEmail}` : null, branding.contactPhone ? `Tel: ${branding.contactPhone}` : null]
    .filter(Boolean)
    .join(" · ");
  const website = branding.website ? `<div style="margin-top:4px;"><a href="${branding.website}" style="color:#666;text-decoration:none;">${branding.website}</a></div>` : "";
  return `
    <div style="background-color:#f8f9fa;padding:18px;text-align:center;font-size:12px;color:#666;">
      <div>This is an automated message. Please do not reply to this email.</div>
      ${contactBits ? `<div style="margin-top:6px;">${contactBits}</div>` : ""}
      ${website}
      <div style="margin-top:10px;">© ${year} ${branding.companyName}. All rights reserved.</div>
    </div>
  `;
}

