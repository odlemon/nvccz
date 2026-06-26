// @ts-nocheck
import { Router } from "express";
import { ExchangeRateDisplayCronService } from "../services/exchangeRateDisplay/ExchangeRateDisplayCronService";

const router = Router();

router.post("/snapshot-refresh", async (_req, res) => {
  try {
    const result = await ExchangeRateDisplayCronService.refreshSnapshots();
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Snapshot refresh failed" });
  }
});

export default router;
