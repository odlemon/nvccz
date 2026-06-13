// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { ForecastingController } from "../controllers/ForecastingController";

const router = express.Router();

router.post("/compute", authenticate, ForecastingController.compute);
router.post("/compute/validate", authenticate, ForecastingController.validateFormula);
router.get("/compute/:computeJobId", authenticate, ForecastingController.getComputeJob);

export default router;
