// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";
import { projectController } from "../controllers/ProjectController";

const router = express.Router();

router.use(authenticate);

const VIEW_OR_MANAGE = ["accounting.timesheets.view", "accounting.timesheets.manage", "manage_accounting"];
const MANAGE_ONLY = ["accounting.timesheets.manage", "manage_accounting"];

router.get("/", requireAnyPermission(VIEW_OR_MANAGE), projectController.list);
router.post("/", requireAnyPermission(MANAGE_ONLY), projectController.create);
// Not on the sketched route list — added so ProjectService.updateProject() is reachable.
router.put("/:id", requireAnyPermission(MANAGE_ONLY), projectController.update);

export default router;
