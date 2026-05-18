/**
 * Must match signing logic in `src/utils/vendorPortalToken.ts` (HMAC-SHA256 over base64url JSON).
 * Used by Node workflow scripts; keep in sync if the algorithm changes.
 */
"use strict";

const crypto = require("crypto");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function getSecret() {
  const s = (
    process.env.VENDOR_PORTAL_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    ""
  ).trim();
  if (!s) {
    throw new Error("Set VENDOR_PORTAL_TOKEN_SECRET or JWT_SECRET in .env for vendor portal tokens");
  }
  return s;
}

function signPayload(payload) {
  const secret = getSecret();
  const bodyB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(bodyB64).digest("base64url");
  return `${bodyB64}.${sig}`;
}

function signRfqSubmit(vendorId, procurementRfqId, expUnixSeconds) {
  return signPayload({
    k: "RFQ_SUBMIT",
    v: vendorId,
    r: procurementRfqId,
    exp: expUnixSeconds,
  });
}

function signPoVendorInvoice(vendorId, purchaseOrderId, expUnixSeconds) {
  return signPayload({
    k: "PO_VENDOR_INVOICE",
    v: vendorId,
    p: purchaseOrderId,
    exp: expUnixSeconds,
  });
}

function defaultRfqExpFromClosingOr365d(closingIsoOrNull) {
  const now = Math.floor(Date.now() / 1000);
  const minExp = now + 24 * 3600;
  if (!closingIsoOrNull) {
    return Math.max(minExp, now + 365 * 24 * 3600);
  }
  const closingSec = Math.floor(new Date(closingIsoOrNull).getTime() / 1000);
  return Math.max(minExp, closingSec + 30 * 24 * 3600);
}

module.exports = {
  signRfqSubmit,
  signPoVendorInvoice,
  defaultRfqExpFromClosingOr365d,
};
