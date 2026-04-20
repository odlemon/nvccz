// @ts-nocheck
import { CompanyProfileAddressService } from "../services/CompanyProfileAddressService";
import { CompanyProfileService } from "../services/CompanyProfileService";

/** Letterhead from accounting Company Profile + active letterhead address (not portfolio data). */
export type CapitalCallAccountingLetterhead = {
  displayName: string;
  detailLines: string[];
  /** https URL for optional `<img>` in HTML (same logo as PDF when fetch succeeds). */
  logoUrlForEmail: string | null;
  logoBuffer: Buffer | null;
};

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

async function fetchLogoBuffer(url: string): Promise<Buffer | null> {
  const u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(u, { signal: ac.signal, redirect: "follow" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_LOGO_BYTES) return null;
    return buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loads company identity from accounting settings for capital call notices (PDF + email).
 * Always returns a display name (falls back to COMPANY_NAME_SHORT / "NVCCZ").
 */
export async function loadCapitalCallAccountingLetterhead(): Promise<CapitalCallAccountingLetterhead> {
  const [profile, activeAddr] = await Promise.all([
    CompanyProfileService.getCompanyProfile(),
    CompanyProfileAddressService.getActive(),
  ]);

  const displayName =
    (profile?.legalName && String(profile.legalName).trim()) ||
    process.env.COMPANY_NAME_SHORT?.trim() ||
    "NVCCZ";

  const detailLines: string[] = [];
  if (activeAddr) {
    if (activeAddr.line1) detailLines.push(String(activeAddr.line1).trim());
    if (activeAddr.line2) detailLines.push(String(activeAddr.line2).trim());
    const cityState = [activeAddr.city, activeAddr.state].filter(Boolean).join(", ").trim();
    const zipParts = [cityState || null, activeAddr.postalCode].filter(Boolean);
    const zipLine = zipParts.join(" ").trim();
    if (zipLine) detailLines.push(zipLine);
    if (activeAddr.country) detailLines.push(String(activeAddr.country).trim());
  }

  if (profile?.registrationNumber) {
    detailLines.push(`Registration: ${String(profile.registrationNumber).trim()}`);
  }
  if (profile?.taxNumber) {
    detailLines.push(`Tax: ${String(profile.taxNumber).trim()}`);
  }

  const contactBits: string[] = [];
  if (profile?.email) contactBits.push(String(profile.email).trim());
  if (profile?.phone) contactBits.push(`Tel: ${String(profile.phone).trim()}`);
  if (contactBits.length) detailLines.push(contactBits.join(" · "));

  if (profile?.website) {
    detailLines.push(String(profile.website).trim());
  }

  const logoUrlRaw =
    (activeAddr?.logoUrl && String(activeAddr.logoUrl).trim()) ||
    (profile?.logoUrl && String(profile.logoUrl).trim()) ||
    null;

  let logoUrlForEmail: string | null = null;
  let logoBuffer: Buffer | null = null;
  if (logoUrlRaw && /^https?:\/\//i.test(logoUrlRaw)) {
    logoUrlForEmail = logoUrlRaw;
    logoBuffer = await fetchLogoBuffer(logoUrlRaw);
  }

  return {
    displayName,
    detailLines: detailLines.filter((x) => x.length > 0),
    logoUrlForEmail,
    logoBuffer,
  };
}
