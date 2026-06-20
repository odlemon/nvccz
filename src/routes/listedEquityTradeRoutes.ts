// @ts-nocheck
import express from "express";
import { ListedEquityTradeController } from "../controllers/ListedEquityTradeController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

const auth = [authenticate, authorize(["admin", "fund_manager", "ceo", "cfo"])];

router.post("/cron/retry-failed-routing", ListedEquityTradeController.cronRetryFailedRouting);

router.post("/", ...auth, ListedEquityTradeController.create);
router.get("/", ...auth, ListedEquityTradeController.list);
router.get("/:id", ...auth, ListedEquityTradeController.get);
router.post("/:id/execute", ...auth, ListedEquityTradeController.execute);
router.post("/:id/cancel", ...auth, ListedEquityTradeController.cancel);
router.get("/:id/routing-hops", ...auth, ListedEquityTradeController.routingHops);
router.post("/:id/routing-hops/:hopId/retry", ...auth, ListedEquityTradeController.retryHop);
router.post("/:id/routing-hops/:hopId/confirm", ...auth, ListedEquityTradeController.confirmHop);
router.get("/:id/settlement-document", ...auth, ListedEquityTradeController.settlementDocument);

export default router;
