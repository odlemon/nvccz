// @ts-nocheck
import { Router } from "express";
import { LpPortalSnapshotCronService } from "../services/lpPortal/LpPortalSnapshotCronService";

const router = Router();

router.post("/snapshot-refresh", async (_req, res) => {
  try {
    const result = await LpPortalSnapshotCronService.refreshAll();
    res.json({ success: true, data: result });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Snapshot refresh failed" });
  }
});

export default router;
