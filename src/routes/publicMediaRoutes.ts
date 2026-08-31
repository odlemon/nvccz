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
  // Explicit cross-origin embedding (SPA on another host than the API).
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  // Lets COEP/credentialed contexts load the resource when needed; <img> is often no-cors.
  res.setHeader("Access-Control-Allow-Origin", "*");
  // no-store: shared caches (e.g. Cloudflare) must not keep a stale CORP header on this response.
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");

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
  const localBase = "http://127.0.0.1:3050/uploads";

  const tryFetch = async (upstreamUrl: string) =>
    axios.get(upstreamUrl, {
      responseType: "stream",
      timeout: 60000,
      validateStatus: (s) => s < 500,
    });

  try {
    let upstream;
    try {
      upstream = await tryFetch(url);
      if (upstream.status >= 400 && base !== localBase) {
        upstream = await tryFetch(`${localBase}/${relativePath}`);
      }
    } catch (primaryErr: any) {
      if (base === localBase) throw primaryErr;
      logger.warn("public media primary failed; retrying local upload mock", {
        url,
        error: primaryErr?.message,
      });
      upstream = await tryFetch(`${localBase}/${relativePath}`);
    }

    if (upstream.status >= 400) {
      return res.status(404).end();
    }

    const ct = upstream.headers["content-type"];
    if (ct) res.setHeader("Content-Type", ct);
    upstream.data.pipe(res);
  } catch (e: any) {
    logger.warn("public media proxy failed", { url, error: e.message });
    res.status(502).end();
  }
});

export default router;
