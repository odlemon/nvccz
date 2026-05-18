// @ts-nocheck
/**
 * Portfolio monitoring (§2.4): valuations + exit per investment implementation.
 * Mounted at /api/investments — matches spec shape investments/{id}/valuations
 */
import express from "express";
import { InvestmentMonitoringController } from "../controllers/InvestmentMonitoringController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

const monitorAuth = [
  authenticate,
  authorize(["admin", "fund_manager", "ceo", "cfo"]),
];

router.get(
  "/:investmentImplementationId/valuations",
  ...monitorAuth,
  InvestmentMonitoringController.listValuationEvents
);
router.post(
  "/:investmentImplementationId/valuations",
  ...monitorAuth,
  InvestmentMonitoringController.createValuationEvent
);
router.patch(
  "/:investmentImplementationId/valuations/:valuationEventId",
  ...monitorAuth,
  InvestmentMonitoringController.updateValuationEvent
);
router.delete(
  "/:investmentImplementationId/valuations/:valuationEventId",
  ...monitorAuth,
  InvestmentMonitoringController.deleteValuationEvent
);

router.get(
  "/:investmentImplementationId/exit",
  ...monitorAuth,
  InvestmentMonitoringController.getExit
);
router.post(
  "/:investmentImplementationId/exit",
  ...monitorAuth,
  InvestmentMonitoringController.recordExit
);
router.delete(
  "/:investmentImplementationId/exit",
  ...monitorAuth,
  InvestmentMonitoringController.deleteExit
);

export default router;
