// @ts-nocheck
import express from "express";
import { PortfolioValuationController } from "../controllers/PortfolioValuationController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

// Portfolio Valuation Routes
router.post("/", authenticate, authorize(["admin", "ceo", "cfo"]), PortfolioValuationController.createPortfolioValuation);
router.get("/", authenticate, PortfolioValuationController.getAllPortfolioValuations);
router.get("/:id", authenticate, PortfolioValuationController.getPortfolioValuationById);
router.put("/:id", authenticate, PortfolioValuationController.updatePortfolioValuation);
router.delete("/:id", authenticate, authorize(["admin", "ceo", "cfo"]), PortfolioValuationController.deletePortfolioValuation);

// Portfolio Valuation Activity Routes
router.post("/:id/activities", authenticate, PortfolioValuationController.createPortfolioValuationActivity);
router.get("/:id/activities", authenticate, PortfolioValuationController.getPortfolioValuationActivities);

// Portfolio Valuation Summary Routes
router.get("/summary/quarterly", authenticate, PortfolioValuationController.getQuarterlyValuationSummary);

// Portfolio Valuation Analytics Routes
router.get("/analytics/summary", authenticate, PortfolioValuationController.getValuationAnalytics);

export default router;
