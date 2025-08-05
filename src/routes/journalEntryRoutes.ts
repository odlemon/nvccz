// @ts-nocheck
import express from "express";
import JournalEntryController from "../controllers/JournalEntryController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Get all journal entries
router.get("/", JournalEntryController.getJournalEntries);

// Get journal entries by date range
router.get("/by-date-range", JournalEntryController.getJournalEntriesByDateRange);

// Get a specific journal entry by ID
router.get("/:id", JournalEntryController.getJournalEntry);

// Post a journal entry (change status from PENDING to POSTED)
router.patch("/:id/post", JournalEntryController.postJournalEntry);

// Void a journal entry (change status to VOID)
router.patch("/:id/void", JournalEntryController.voidJournalEntry);

export default router; 