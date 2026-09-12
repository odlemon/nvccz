// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"
import { PerformanceContractController } from "../controllers/PerformanceContractController";

const router = express.Router();
const READ_KEYS = ["performance.contracts.view", "performance.contracts.manage"]
const WRITE_KEYS = ["performance.contracts.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)

/**
 * Annual performance contract setup (one PC per scorecard type per period).
 * `authenticate` only — no role gates. Optional `createdById` in body overrides JWT user.
 */
router.get("/", authenticate, guard, PerformanceContractController.list);
router.post("/board", authenticate, guard, PerformanceContractController.createBoard);
router.post("/ceo", authenticate, guard, PerformanceContractController.createCEO);
router.post("/department", authenticate, guard, PerformanceContractController.createDepartment);
router.post("/employee", authenticate, guard, PerformanceContractController.createEmployee);

export default router;
