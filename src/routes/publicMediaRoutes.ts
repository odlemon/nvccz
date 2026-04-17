// @ts-nocheck
/**
 * Proxies uploaded files from the internal HTTP file server so browsers can load them over HTTPS
 * (same origin as the API). Proxies from REMOTE_MEDIA_INTERNAL_BASE (env).
 */
import { Router, Request, Response } from "express";
import axios from "axios";
import { logger } from "../utils/logger";
import {
  normalizeMalformedSignaturePath,
  resolveInternalMediaBaseUrl,
} from "../services/RemoteUploadService";

const router = Router();

router.use(async (req: Request, res: Response) => {
  // Ensure embedding from the SPA (different origin than the API) is allowed even if a proxy or older
  // middleware sends CORP: same-origin — Chrome reports ERR_BLOCKED_BY_RESPONSE.NotSameOrigin otherwise.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  // req.path is the full URL path (/api/public-media/...), not stripped by mount — strip prefix or upstream 404s.
  const pathname = (req.originalUrl || req.url || "").split("?")[0];
  const prefix = "/api/public-media";
  let relativePath = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname;
  relativePath = relativePath.replace(/^\/+/, "");
  relativePath = normalizeMalformedSignaturePath(relativePath);
  if (!relativePath || relativePath.includes("..")) {
    return res.status(400).send("Invalid path");
  }

  const base = resolveInternalMediaBaseUrl();
  const url = `${base}/${relativePath}`;

  try {
    const upstream = await axios.get(url, {
      responseType: "stream",
      timeout: 60000,
      validateStatus: (s) => s < 500,
    });

    if (upstream.status >= 400) {
      return res.status(404).end();
    }

    const ct = upstream.headers["content-type"];
    if (ct) res.setHeader("Content-Type", ct);
    // `private` (not `public`) so shared caches like Cloudflare do not store the response. Edge caches
    // were serving stale CORP: same-origin with Cf-Cache-Status: HIT even after app redeploy; browsers
    // may still cache privately per RFC 7234.
    res.setHeader("Cache-Control", "private, max-age=86400");
    upstream.data.pipe(res);
  } catch (e: any) {
    logger.warn("public media proxy failed", { url, error: e.message });
    res.status(502).end();
  }
});

export default router;
