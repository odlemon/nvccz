// @ts-nocheck
/** People performance command centre. Mounted at /api/performance/command-centre. */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard";
import { PerformanceCommandCentreService } from "../services/PerformanceCommandCentreService";
import { perfActor } from "../services/PerformanceScope";

const router = express.Router();
const guard = methodGuard(["performance.dashboard.view", "performance.dashboard.manage"], ["performance.dashboard.manage"]);
router.use(authenticate, guard);
router.get("/", async (req: any, res: any) => {
  try {
    // Organisation-wide roles choose any department; everyone else sees their own department's figures (PerformanceScope),
    // and a personal (self) scope does not get the rating distribution, which in a small department names people's ratings.
    const a = await perfActor(req.user);
    const dept = a.org ? (req.query.department as string) : a.departmentName || "(no department)";
    const data: any = await PerformanceCommandCentreService.overview(req.query.period as string, dept, req.query.population as string);
    if (!a.org) {
      data.departments = a.departmentName ? [a.departmentName] : [];
      data.units = (data.units || []).filter((u: any) => u.department === a.departmentName);
      if (a.scope === "self") data.dist = [];
    }
    res.json({ success: true, data });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Error" });
  }
});
export default router;
