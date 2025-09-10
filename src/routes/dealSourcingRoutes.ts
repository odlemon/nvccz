// @ts-nocheck
import express from "express";
import { DealSourcingController } from "../controllers/DealSourcingController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

// Deal Sourcing Goals Routes
router.post("/goals", authenticate, authorize(["admin", "ceo", "fund_manager"]), DealSourcingController.createDealSourcingGoal);
router.get("/goals", authenticate, DealSourcingController.getAllDealSourcingGoals);
router.get("/goals/:id", authenticate, DealSourcingController.getDealSourcingGoalById);
router.put("/goals/:id", authenticate, authorize(["admin", "ceo", "fund_manager"]), DealSourcingController.updateDealSourcingGoal);
router.delete("/goals/:id", authenticate, authorize(["admin", "ceo"]), DealSourcingController.deleteDealSourcingGoal);

// Deal Progress Routes
router.post("/progress", authenticate, authorize(["admin", "ceo", "fund_manager"]), DealSourcingController.createDealProgress);
router.get("/progress", authenticate, DealSourcingController.getAllDealProgress);
router.get("/progress/:id", authenticate, DealSourcingController.getDealProgressById);
router.put("/progress/:id", authenticate, DealSourcingController.updateDealProgress);
router.post("/progress/:id/update", authenticate, DealSourcingController.postDealProgressUpdate);
router.delete("/progress/:id", authenticate, authorize(["admin", "ceo", "fund_manager"]), DealSourcingController.deleteDealProgress);

export default router;
