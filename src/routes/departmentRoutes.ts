// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { DepartmentController } from "../controllers/DepartmentController";

const router = express.Router();
router.use(authenticate);

/** List org departments — `{ id, name }` for FP&A budget owners, etc. */
router.get("/", DepartmentController.list);
router.get("/:id", DepartmentController.get);

export default router;
