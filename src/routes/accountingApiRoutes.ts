// @ts-nocheck
import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { AccountingApiController } from "../controllers/AccountingApiController";

const router = Router();

/**
 * Accounting Integration API (internal/external)
 * POST /accounting/api/post_journal_entry
 */
router.post("/post_journal_entry", authenticate, AccountingApiController.postJournalEntry);

export default router;

