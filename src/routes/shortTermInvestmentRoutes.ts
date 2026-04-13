/**
 * Short-term investments — all routes require a valid JWT only.
 * Intentionally no `authorize` / `requirePermission` (any authenticated user may access).
 */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { ShortTermInvestmentController } from "../controllers/ShortTermInvestmentController";

const router = express.Router();
router.use(authenticate);

router.get("/settings", ShortTermInvestmentController.getSettings);
router.patch("/settings", ShortTermInvestmentController.patchSettings);

router.get("/dashboard", ShortTermInvestmentController.getDashboard);

router.get("/instruments", ShortTermInvestmentController.listInstruments);
router.post("/instruments", ShortTermInvestmentController.createInstrument);
router.get("/instruments/:id", ShortTermInvestmentController.getInstrument);
router.patch("/instruments/:id", ShortTermInvestmentController.updateInstrument);
router.delete("/instruments/:id", ShortTermInvestmentController.deleteInstrument);

router.post("/instruments/:id/apy-rates", ShortTermInvestmentController.appendApy);
router.post("/instruments/:id/catch-up", ShortTermInvestmentController.postCatchUp);
router.post("/instruments/:id/liquidate", ShortTermInvestmentController.postLiquidate);
router.post("/instruments/:id/void", ShortTermInvestmentController.postVoid);
router.post(
  "/instruments/:id/accruals/approve-all",
  ShortTermInvestmentController.postApproveAllAccruals
);

/** Same handler as `/instruments/:id/accruals/approve-all`; path groups with `accruals/{accrualId}/approve` in Swagger. */
router.post(
  "/accruals/:instrumentId/approve-all",
  ShortTermInvestmentController.postApproveAllAccruals
);

router.post("/accruals/:accrualId/approve", ShortTermInvestmentController.postApproveAccrual);

router.post("/fx/month-end-revaluation", ShortTermInvestmentController.postMonthEndFx);

export default router;
