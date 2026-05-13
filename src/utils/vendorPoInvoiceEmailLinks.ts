import { escapeAttrForEmail } from "./newsletterEmailLayout";

function trimBase(s: string | undefined): string | null {
  const t = s?.trim();
  if (!t) return null;
  return t.replace(/\/+$/, "");
}

/**
 * Vendor-facing URL to upload/submit a procurement invoice against a PO (SPA).
 * Query: `token` = signed {@link signVendorPortalToken} with kind `PO_VENDOR_INVOICE`.
 */
export function buildVendorPoInvoiceResponsePageUrl(vendorPortalToken: string): string | null {
  const base =
    trimBase(process.env.VENDOR_PORTAL_BASE_URL) ||
    trimBase(process.env.FRONTEND_URL) ||
    trimBase(process.env.NEXT_PUBLIC_APP_URL) ||
    trimBase(process.env.PUBLIC_APP_URL);
  if (!base) return null;

  const pathRaw = (process.env.VENDOR_PO_INVOICE_RESPONSE_PATH || "/procurement/vendor-invoice").trim();
  const path = pathRaw.startsWith("/") ? pathRaw : `/${pathRaw}`;

  try {
    const u = new URL(`${base}${path}`);
    u.searchParams.set("token", vendorPortalToken);
    return u.toString();
  } catch {
    return null;
  }
}

export function escapeVendorPoInvoiceSubmitUrlForEmailHref(vendorPortalToken: string): string | null {
  const url = buildVendorPoInvoiceResponsePageUrl(vendorPortalToken);
  return url ? escapeAttrForEmail(url) : null;
}
