// @ts-nocheck
/**
 * Database-backed KPI catalog (kpis table) — create / update.
 * Mounted at `/api/performance/kpis` alongside hardcoded KPI listing routes (different HTTP methods).
 */
import express from "express";
import { KPIController } from "../controllers/KPIController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

/** Catalog CRUD for `kpis` — OpenAPI: **`/kpis`** / **`/kpis/{id}`** in `updated-performance-swagger-paths.ts` (tag **performance-kpis**). */
router.post("/", authenticate, KPIController.createKPI);

router.patch("/:id", authenticate, KPIController.updateKPI);

router.put("/:id", authenticate, KPIController.updateKPI);

router.delete("/:id", authenticate, KPIController.deleteKPI);

export default router;
