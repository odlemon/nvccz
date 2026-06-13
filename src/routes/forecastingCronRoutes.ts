// @ts-nocheck
import express from "express";
import { Request, Response } from "express";
import { ForecastingGlSyncService } from "../services/ForecastingGlSyncService";
import { isForecastEnabled } from "../constants/forecastingEngine";

function isLoopback(req: Request): boolean {
  const a = req.socket?.remoteAddress ?? "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}

function assertCronAuth(req: Request): { ok: true } | { ok: false; status: number; body: any } {
  const secret = process.env.FORECAST_GL_SYNC_CRON_SECRET?.trim();
  if (secret) {
    const header = String(
      req.headers["x-forecast-gl-sync-cron-secret"] ||
        req.headers["X-Forecast-Gl-Sync-Cron-Secret"] ||
        ""
    );
    if (header !== secret) {
      return { ok: false, status: 401, body: { success: false, error: "Unauthorized" } };
    }
    return { ok: true };
  }
  if (!isLoopback(req)) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: "Forecast GL sync cron requires FORECAST_GL_SYNC_CRON_SECRET from non-loopback hosts"
      }
    };
  }
  return { ok: true };
}

const router = express.Router();

router.post("/gl-sync", async (req: Request, res: Response) => {
  try {
    if (!isForecastEnabled()) {
      return res.status(503).json({ success: false, code: "FEATURE_DISABLED" });
    }
    const auth = assertCronAuth(req);
    if (!auth.ok) return res.status(auth.status).json(auth.body);

    const scenarioId = req.body?.scenario_id;
    const data = scenarioId
      ? await ForecastingGlSyncService.syncScenario(String(scenarioId))
      : await ForecastingGlSyncService.syncAllActive();

    res.json({ success: true, data });
  } catch (error: any) {
    console.error("[forecast-gl-sync-cron]", error);
    res.status(500).json({ success: false, error: error?.message || "Cron failed" });
  }
});

export default router;
