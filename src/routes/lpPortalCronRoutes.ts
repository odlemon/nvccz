// @ts-nocheck
import { Router } from "express";
import { requireCronCaller } from "../middleware/cronCaller";
import { LpPortalSnapshotCronService } from "../services/lpPortal/LpPortalSnapshotCronService";

const router = Router();

// scheduler only: shared secret, or the server itself (it had no check at all)
router.post("/snapshot-refresh", requireCronCaller(["LP_PORTAL_CRON_SECRET", "CRON_SECRET"]), async (_req, res) => {
  try {
    const result = await LpPortalSnapshotCronService.refreshAll();
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Snapshot refresh failed" });
  }
});

export default router;
