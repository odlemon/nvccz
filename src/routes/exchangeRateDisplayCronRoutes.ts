// @ts-nocheck
import { Router } from "express";
import { requireCronCaller } from "../middleware/cronCaller";
import { ExchangeRateDisplayCronService } from "../services/exchangeRateDisplay/ExchangeRateDisplayCronService";

const router = Router();

// scheduler only: shared secret, or the server itself (it had no check at all)
router.post("/snapshot-refresh", requireCronCaller(["EXCHANGE_RATE_DISPLAY_CRON_SECRET", "CRON_SECRET"]), async (_req, res) => {
  try {
    const result = await ExchangeRateDisplayCronService.refreshSnapshots();
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Snapshot refresh failed" });
  }
});

export default router;
