// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { recurringJournalController } from "../controllers/RecurringJournalController";

const router = express.Router();

router.get("/", authenticate, recurringJournalController.listTemplates);
router.post("/", authenticate, recurringJournalController.createTemplate);
router.patch("/:id/active", authenticate, recurringJournalController.setActive);
router.post("/:id/run", authenticate, recurringJournalController.runTemplate);
router.post("/run-due", authenticate, recurringJournalController.runDue);

export default router;
