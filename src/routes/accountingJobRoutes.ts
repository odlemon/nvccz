// @ts-nocheck
/** Accounting scheduled jobs: GET / (the jobs, their switch and last runs), POST /:key/run (run now), PATCH /:key (on/off).
 *  Mounted at /api/accounting/jobs behind the Accounting access guard (reading: accounting readers; running and switching:
 *  people who may post to the ledger). */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { AccountingJobService } from "../services/AccountingJobService";

const router = express.Router();
const run = (fn) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(e?.statusCode || 500).json({ success: false, message: e?.message || "Error" });
  }
};
router.use(authenticate);
router.get("/", run(() => AccountingJobService.list()));
router.post("/:key/run", run((req) => AccountingJobService.runNow(String(req.params.key), req.user.id)));
router.patch("/:key", run((req) => AccountingJobService.setEnabled(String(req.params.key), !!req.body?.enabled, req.user.id)));
export default router;
