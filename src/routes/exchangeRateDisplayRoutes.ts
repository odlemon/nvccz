// @ts-nocheck
import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { requireExchangeRateDisplayAdmin } from "../middleware/exchangeRateDisplayAuth";
import { ExchangeRateDisplayController } from "../controllers/ExchangeRateDisplayController";

const router = Router();

router.use(authenticate);

router.get("/widget", ExchangeRateDisplayController.getWidget);
router.get("/rates/compare", ExchangeRateDisplayController.compare);
router.get("/rates/history", ExchangeRateDisplayController.history);

router.get("/configs", requireExchangeRateDisplayAdmin, ExchangeRateDisplayController.listConfigs);
router.post("/configs", requireExchangeRateDisplayAdmin, ExchangeRateDisplayController.createConfig);
router.put("/configs/:id", requireExchangeRateDisplayAdmin, ExchangeRateDisplayController.updateConfig);
router.post("/ingest/run", requireExchangeRateDisplayAdmin, ExchangeRateDisplayController.runIngest);
router.post("/quotes/manual", requireExchangeRateDisplayAdmin, ExchangeRateDisplayController.postManualQuote);

export default router;
