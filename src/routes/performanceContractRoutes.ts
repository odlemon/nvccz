// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { PerformanceContractController } from "../controllers/PerformanceContractController";

const router = express.Router();

/**
 * Annual performance contract setup (one PC per scorecard type per period).
 * `authenticate` only — no role gates. Optional `createdById` in body overrides JWT user.
 */
router.post("/board", authenticate, PerformanceContractController.createBoard);
router.post("/ceo", authenticate, PerformanceContractController.createCEO);
router.post("/department", authenticate, PerformanceContractController.createDepartment);
router.post("/employee", authenticate, PerformanceContractController.createEmployee);

export default router;
