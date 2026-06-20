// @ts-nocheck
import express from "express";
import { ListedEquityMarketDataController } from "../controllers/ListedEquityMarketDataController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

const auth = [authenticate, authorize(["admin", "fund_manager", "ceo", "cfo"])];

router.get("/securities", ...auth, ListedEquityMarketDataController.listSecurities);
router.post("/securities", ...auth, ListedEquityMarketDataController.createSecurity);
router.put("/securities/:id", ...auth, ListedEquityMarketDataController.updateSecurity);
router.get("/securities/:id/prices", ...auth, ListedEquityMarketDataController.getSecurityPrices);
router.get("/prices/latest", ...auth, ListedEquityMarketDataController.latestPrices);

router.post("/ingest/run", ...auth, ListedEquityMarketDataController.runIngest);
router.get("/ingest/batches", ...auth, ListedEquityMarketDataController.listBatches);
router.get("/ingest/batches/:id", ...auth, ListedEquityMarketDataController.getBatch);

router.get("/validation-queue", ...auth, ListedEquityMarketDataController.validationQueue);
router.post("/validation-queue/:tickId/approve", ...auth, ListedEquityMarketDataController.approveTick);
router.post("/validation-queue/:tickId/reject", ...auth, ListedEquityMarketDataController.rejectTick);

router.post("/webhooks/:providerCode", ListedEquityMarketDataController.webhookIngress);

router.post("/cron/scrape-domestic", ListedEquityMarketDataController.cronScrapeDomestic);
router.post("/cron/retry-failed-ingest", ListedEquityMarketDataController.cronRetryFailedIngest);

export default router;
