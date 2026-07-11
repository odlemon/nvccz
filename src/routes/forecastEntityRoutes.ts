// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { ForecastEntityController } from "../controllers/ForecastEntityController";

const router = express.Router();
router.use(authenticate);

router.get("/", ForecastEntityController.list);
router.post("/", ForecastEntityController.create);
router.get("/:id", ForecastEntityController.get);
router.get("/:id/chart-of-accounts", ForecastEntityController.listAccounts);
router.post("/:id/resync-coa", ForecastEntityController.resyncCoa);

export default router;
