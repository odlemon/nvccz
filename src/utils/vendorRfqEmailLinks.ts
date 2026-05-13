/**
 * Builds the vendor-facing URL for RFQ quotation submission (e.g. SPA deep link).
 * Base URL is taken only from environment variables (no hardcoded production host).
 *
 * Resolution order for the origin/base:
 * 1. VENDOR_PORTAL_BASE_URL — preferred when the vendor UI lives on a dedicated host/path
 * 2. FRONTEND_URL
 * 3. NEXT_PUBLIC_APP_URL
 * 4. PUBLIC_APP_URL
 *
 * Path defaults to VENDOR_RFQ_RESPONSE_PATH or `/vendor-quotations/rfq-respond`.
 * Query: `token` (signed vendor portal token, see `src/utils/vendorPortalToken.ts`) and optional `rfqNumber`.
 */
function trimBase(s: string | undefined): string | null {
  const t = s?.trim();
  if (!t) return null;
  return t.replace(/\/+$/, "");
}

export function buildVendorRfqResponsePageUrl(args: {
  invitationToken: string;
  rfqNumber: string;
}): string | null {
  const base =
    trimBase(process.env.VENDOR_PORTAL_BASE_URL) ||
    trimBase(process.env.FRONTEND_URL) ||
    trimBase(process.env.NEXT_PUBLIC_APP_URL) ||
    trimBase(process.env.PUBLIC_APP_URL);
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
