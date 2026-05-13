import crypto from "crypto";

/** RFQ quotation submission (email link + POST /vendor-quotations/submit). */
export const VENDOR_PORTAL_KIND_RFQ_SUBMIT = "RFQ_SUBMIT" as const;
/** Vendor procurement invoice after PO (email link + POST /procurement/invoices when unauthenticated). */
export const VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE = "PO_VENDOR_INVOICE" as const;

export type VendorPortalRfqPayload = {
  k: typeof VENDOR_PORTAL_KIND_RFQ_SUBMIT;
  v: string;
  r: string;
  exp: number;
};

export type VendorPortalPoInvoicePayload = {
  k: typeof VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE;
  v: string;
  p: string;
  exp: number;
};

export type VerifiedVendorPortalPayload = VendorPortalRfqPayload | VendorPortalPoInvoicePayload;

function getSigningSecret(): string {
  const s =
    process.env.VENDOR_PORTAL_TOKEN_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim();
  if (!s) {
    throw new Error(
      "Set VENDOR_PORTAL_TOKEN_SECRET or JWT_SECRET to create or verify vendor portal tokens"
    );
  }
  return s;
}

function timingSafeEqualAscii(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Signed opaque token: base64url(JSON).base64url(HMAC-SHA256).
 * Payload always includes `v` (vendorId), `k` (kind), `exp` (unix seconds).
 */
export function signVendorPortalToken(
  payload:
    | (Omit<VendorPortalRfqPayload, "exp"> & { exp: number })
    | (Omit<VendorPortalPoInvoicePayload, "exp"> & { exp: number })
): string {
  const secret = getSigningSecret();
  const bodyB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(bodyB64).digest("base64url");
  return `${bodyB64}.${sig}`;
}

export function verifyVendorPortalToken(token: string): VerifiedVendorPortalPayload {
  const trimmed = String(token || "").trim();
  const dot = trimmed.indexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) {
    throw new Error("Invalid vendor portal token");
  }
  const bodyB64 = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const secret = getSigningSecret();
  const expected = crypto.createHmac("sha256", secret).update(bodyB64).digest("base64url");
  if (!timingSafeEqualAscii(expected, sig)) {
    throw new Error("Invalid vendor portal token signature");
  }
  let obj: unknown;
  try {
    obj = JSON.parse(Buffer.from(bodyB64, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid vendor portal token payload");
  }
  if (!obj || typeof obj !== "object") throw new Error("Invalid vendor portal token payload");
  const rec = obj as Record<string, unknown>;
  const k = rec.k;
  const v = rec.v;
  const exp = rec.exp;
  if (k !== VENDOR_PORTAL_KIND_RFQ_SUBMIT && k !== VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE) {
    throw new Error("Unknown vendor portal token kind");
  }
  if (typeof v !== "string" || !v.trim()) throw new Error("Invalid vendor portal token (vendor)");
  if (typeof exp !== "number" || !Number.isFinite(exp)) throw new Error("Invalid vendor portal token (exp)");
  if (Math.floor(Date.now() / 1000) > exp) {
    throw new Error("Vendor portal token has expired");
  }
  if (k === VENDOR_PORTAL_KIND_RFQ_SUBMIT) {
    const r = rec.r;
    if (typeof r !== "string" || !r.trim()) throw new Error("Invalid RFQ portal token");
    return { k, v: v.trim(), r: r.trim(), exp };
  }
  const p = rec.p;
  if (typeof p !== "string" || !p.trim()) throw new Error("Invalid PO invoice portal token");
  return { k: VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE, v: v.trim(), p: p.trim(), exp };
}

/** Expiry: max(now+24h, closingAt+30d), or now+365d if no closing. */
export function rfqPortalTokenExpiryUnixSeconds(closingAt: Date | null | undefined): number {
  const now = Math.floor(Date.now() / 1000);
  const minExp = now + 24 * 3600;
  if (!closingAt) return Math.max(minExp, now + 365 * 24 * 3600);
  const closingSec = Math.floor(new Date(closingAt).getTime() / 1000);
  const withGrace = closingSec + 30 * 24 * 3600;
  return Math.max(minExp, withGrace);
}

export function poInvoicePortalTokenExpiryUnixSeconds(): number {
  return Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
}
