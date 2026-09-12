// @ts-nocheck
import { Router } from "express";
import { FundReportingCronController } from "../controllers/FundReportingCronController";

const router = Router();
router.post("/schedule-tick", FundReportingCronController.scheduleTick);
export default router;
