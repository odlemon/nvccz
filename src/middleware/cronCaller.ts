// @ts-nocheck
/**
 * For HTTP endpoints meant to be called by a scheduler, not by people: the caller must present the shared secret
 * (header `X-Cron-Secret`, or the endpoint's own legacy header) matching the first configured env var; with none
 * configured, only a direct loopback connection (the server itself, local development) is accepted. Several such
 * endpoints had no check at all, so anyone on the internet could trigger them.
 */
import crypto from "crypto";

const same = (a: string, b: string) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const isLoopback = (req: any) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket?.remoteAddress || "");

export function requireCronCaller(envNames: string[], legacyHeader?: string) {
  return (req: any, res: any, next: any) => {
    const secret = envNames.map((n) => String(process.env[n] || "").trim()).find(Boolean);
    if (secret) {
      const given = String(req.get("X-Cron-Secret") || (legacyHeader ? req.get(legacyHeader) : "") || "");
      if (given && same(given, secret)) return next();
      return res.status(401).json({ success: false, message: "Scheduler secret required." });
    }
    if (isLoopback(req)) return next();
    return res.status(403).json({ success: false, message: "Scheduled endpoints accept only the server itself when no scheduler secret is configured." });
  };
}
