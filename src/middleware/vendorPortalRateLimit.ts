// @ts-nocheck
import rateLimit from "express-rate-limit";

/**
 * Supplier-facing routes are reachable by anyone holding a link, with no login. These limits keep a leaked or guessed
 * token, or an anonymous client, from hammering them. Per client IP. Set VENDOR_PORTAL_RATE_LIMIT=off to disable in tests.
 */
const off = () => String(process.env.VENDOR_PORTAL_RATE_LIMIT || "").toLowerCase() === "off";
const json = (message: string) => ({ success: false, code: "RATE_LIMITED", message });

export const vendorPortalReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.VENDOR_PORTAL_READ_LIMIT || 120),
  standardHeaders: true,
  legacyHeaders: false,
  skip: off,
  message: json("Too many requests. Please wait a minute and try again."),
});

export const vendorPortalWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.VENDOR_PORTAL_WRITE_LIMIT || 30),
  standardHeaders: true,
  legacyHeaders: false,
  skip: off,
  message: json("Too many submissions. Please wait a minute and try again."),
});
