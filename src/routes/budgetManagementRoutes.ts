// @ts-nocheck
import express from "express";
import { BudgetManagementController } from "../controllers/BudgetManagementController";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

// Budget Routes
router.post("/", authenticate, authorize(["admin", "ceo", "cfo"]), BudgetManagementController.createBudget);
router.get("/", authenticate, BudgetManagementController.getAllBudgets);
router.get("/:id", authenticate, BudgetManagementController.getBudgetById);
router.put("/:id", authenticate, authorize(["admin", "ceo", "cfo"]), BudgetManagementController.updateBudget);
router.delete("/:id", authenticate, authorize(["admin", "ceo", "cfo"]), BudgetManagementController.deleteBudget);

// Budget Item Routes
router.post("/:budgetId/items", authenticate, authorize(["admin", "ceo", "cfo"]), BudgetManagementController.createBudgetItem);
router.get("/:budgetId/items", authenticate, BudgetManagementController.getBudgetItems);
router.put("/items/:id", authenticate, BudgetManagementController.updateBudgetItem);
router.delete("/items/:id", authenticate, authorize(["admin", "ceo", "cfo"]), BudgetManagementController.deleteBudgetItem);

// Variance Report Routes
router.post("/variance-reports", authenticate, authorize(["admin", "ceo", "cfo"]), BudgetManagementController.createVarianceReport);
router.get("/variance-reports", authenticate, BudgetManagementController.getVarianceReports);

// Analytics Routes
router.get("/analytics/summary", authenticate, BudgetManagementController.getBudgetAnalytics);

export default router;
