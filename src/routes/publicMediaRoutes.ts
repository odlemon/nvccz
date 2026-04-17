// @ts-nocheck
/**
 * Proxies uploaded files from the internal HTTP file server so browsers can load them over HTTPS
 * (same origin as the API). Proxies from REMOTE_MEDIA_INTERNAL_BASE (env).
 */
import { Router, Request, Response } from "express";
import axios from "axios";
import { logger } from "../utils/logger";
import { resolveInternalMediaBaseUrl } from "../services/RemoteUploadService";

const router = Router();

router.use(async (req: Request, res: Response) => {
  // req.path is the full URL path (/api/public-media/...), not stripped by mount — strip prefix or upstream 404s.
  const pathname = (req.originalUrl || req.url || "").split("?")[0];
  const prefix = "/api/public-media";
  let relativePath = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname;
  relativePath = relativePath.replace(/^\/+/, "");
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
    res.setHeader("Cache-Control", "public, max-age=86400");
    upstream.data.pipe(res);
  } catch (e: any) {
    logger.warn("public media proxy failed", { url, error: e.message });
    res.status(502).end();
  }
});

export default router;
