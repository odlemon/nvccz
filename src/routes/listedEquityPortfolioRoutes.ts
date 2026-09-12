// @ts-nocheck
import express from "express";
import { ListedEquityPortfolioController } from "../controllers/ListedEquityPortfolioController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

const auth = [authenticate, authorize(["admin", "fund_manager", "ceo", "cfo"])];

router.get("/funds", ...auth, ListedEquityPortfolioController.listFunds);
router.get("/funds/:fundId/holdings", ...auth, ListedEquityPortfolioController.holdings);
router.get("/funds/:fundId/pnl", ...auth, ListedEquityPortfolioController.pnl);
router.get("/funds/:fundId/valuations", ...auth, ListedEquityPortfolioController.valuations);
router.post("/funds/:fundId/valuations/run", ...auth, ListedEquityPortfolioController.runValuation);

router.get("/watchlist", ...auth, ListedEquityPortfolioController.getWatchlist);
router.put("/watchlist", ...auth, ListedEquityPortfolioController.putWatchlist);

export default router;
