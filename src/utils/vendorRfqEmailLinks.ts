/**
 * Builds the vendor-facing URL for RFQ quotation submission (e.g. SPA deep link).
 * Base URL is taken only from environment variables (no hardcoded production host).
 *
 * Resolution order for the origin/base:
 * 1. VENDOR_PORTAL_BASE_URL — preferred when the vendor UI lives on a dedicated host/path
 * 2. FRONTEND_URL
 * 3. WEB_APP_URL / CLIENT_URL
 * 4. NEXT_PUBLIC_APP_URL / PUBLIC_APP_URL
 * 5. First suitable origin from CORS_ORIGINS (often the SPA URL on API-only deployments)
 * 6. API_PUBLIC_BASE_URL / APP_BASE_URL
 * 7. `fallbackBaseUrl` (e.g. company profile website from transactional branding)
 *
 * Path defaults to VENDOR_RFQ_RESPONSE_PATH or `/vendor-quotations/rfq-respond`.
 * Query: `token` (signed vendor portal token, see `src/utils/vendorPortalToken.ts`) and optional `rfqNumber`.
 */
function trimBase(s: string | undefined): string | null {
  const t = s?.trim();
  if (!t) return null;
  return t.replace(/\/+$/, "");
}

/** Prefer first https origin from CORS_ORIGINS (comma-separated). Ignores http-only entries so vendor emails are not linked to localhost. */
function trimBaseFromCorsOrigins(): string | null {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const httpsFirst = parts.find((p) => /^https:\/\//i.test(p));
  return httpsFirst ? trimBase(httpsFirst) : null;
}

export function buildVendorRfqResponsePageUrl(args: {
  invitationToken: string;
  rfqNumber: string;
  /** When env vars are unset on the API host, e.g. Company Profile website */
  fallbackBaseUrl?: string | null;
}): string | null {
  const base =
    trimBase(process.env.VENDOR_PORTAL_BASE_URL) ||
    trimBase(process.env.FRONTEND_URL) ||
    trimBase(process.env.WEB_APP_URL) ||
    trimBase(process.env.CLIENT_URL) ||
    trimBase(process.env.NEXT_PUBLIC_APP_URL) ||
    trimBase(process.env.PUBLIC_APP_URL) ||
    trimBaseFromCorsOrigins() ||
    trimBase(process.env.API_PUBLIC_BASE_URL) ||
    trimBase(process.env.APP_BASE_URL) ||
    trimBase(args.fallbackBaseUrl ?? undefined);
  if (!base) return null;

  const pathRaw = (process.env.VENDOR_RFQ_RESPONSE_PATH || "/vendor-quotations/rfq-respond").trim();
  const path = pathRaw.startsWith("/") ? pathRaw : `/${pathRaw}`;

  try {
    const u = new URL(`${base}${path}`);
    u.searchParams.set("token", args.invitationToken);
    u.searchParams.set("rfqNumber", args.rfqNumber);
    return u.toString();
  } catch {
    return null;
  }
}
