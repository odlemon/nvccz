/**
 * Performance Corrective Actions register.
 * Mounted at `/api/performance/corrective-actions` (see design-refs-handoff/corrective-actions.md).
 * Backend contract: every route requires a bearer token — `authenticate` is applied router-wide.
 */
import express from "express";
import { CorrectiveActionController } from "../controllers/CorrectiveActionController";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";

const router = express.Router();

router.use(authenticate);
/**
 * Permission guards.
 *
 * Before these, every route below was `authenticate`-only: any logged-in user of any portal
 * — an LP, an applicant, an investee — could list, create, edit and delete records in this
 * register. `read` is granted to every internal staff role and `write` to manager/exec roles
 * by `scripts/run-performance-role-permissions-migration.ts`; external roles get neither, so
 * they now receive 403 rather than 200.
 *
 * `admin` retains access through its existing wildcard permission set.
 */
const read = requireAnyPermission(["performance.corrective.view", "performance.corrective.manage"]);
const write = requireAnyPermission(["performance.corrective.manage"]);


/**
 * @swagger
 * /performance/corrective-actions:
 *   get:
 *     summary: List corrective actions (filters: status, severity, ownerId, departmentId)
 *     tags: [Performance Corrective Actions]
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: Create a corrective action
 *     tags: [Performance Corrective Actions]
 *     security:
 *       - bearerAuth: []
 */
router.get("/", read, CorrectiveActionController.list);

/**
 * @swagger
 * /performance/corrective-actions/summary:
 *   get:
 *     summary: Corrective action counters (open, overdue, byStatus, bySeverity)
 *     tags: [Performance Corrective Actions]
 *     security:
 *       - bearerAuth: []
 */
// Declared before "/:id" so "summary" is not swallowed by the id param.
router.get("/summary", read, CorrectiveActionController.summary);

/**
 * @swagger
 * /performance/corrective-actions/{id}:
 *   get:
 *     summary: Get a corrective action by ID
 *     tags: [Performance Corrective Actions]
 *     security:
 *       - bearerAuth: []
 *   patch:
 *     summary: Partially update a corrective action
 *     tags: [Performance Corrective Actions]
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     summary: Delete a corrective action
 *     tags: [Performance Corrective Actions]
 *     security:
 *       - bearerAuth: []
 */
router.get("/:id", read, CorrectiveActionController.getById);

router.post("/", write, CorrectiveActionController.create);

router.patch("/:id", write, CorrectiveActionController.update);

router.delete("/:id", write, CorrectiveActionController.remove);

export default router;
