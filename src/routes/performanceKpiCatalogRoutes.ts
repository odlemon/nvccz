// @ts-nocheck
/**
 * Database-backed KPI catalog (kpis table) — create / update.
 * Mounted at `/api/performance/kpis` alongside hardcoded KPI listing routes (different HTTP methods).
 */
import express from "express";
import { KPIController } from "../controllers/KPIController";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"

const router = express.Router();
const READ_KEYS = ["performance.kpi.view", "performance.kpi.manage"]
const WRITE_KEYS = ["performance.kpi.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)

/** Catalog CRUD for `kpis` — OpenAPI: **`/kpis`** / **`/kpis/{id}`** in `updated-performance-swagger-paths.ts` (tag **performance-kpis**). */
router.post("/", authenticate, guard, KPIController.createKPI);

router.patch("/:id", authenticate, guard, KPIController.updateKPI);

router.put("/:id", authenticate, guard, KPIController.updateKPI);

router.delete("/:id", authenticate, guard, KPIController.deleteKPI);

export default router;
