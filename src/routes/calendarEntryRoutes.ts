// @ts-nocheck
import express from "express";
import { calendarEntryController } from "../controllers/CalendarEntryController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * /calendar-entries:
 *   get:
 *     summary: List the signed-in user's own personal calendar entries in a date range
 *     description: Defaults to 30 days back through 60 days ahead if start/end are omitted. Range capped at 92 days.
 *     tags: [CalendarEntries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: end
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Entries retrieved successfully
 *       400:
 *         description: Invalid date range
 *   post:
 *     summary: Create a personal calendar entry (meeting, focus block, reminder)
 *     tags: [CalendarEntries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, startDate, endDate]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               location:
 *                 type: string
 *               entryType:
 *                 type: string
 *                 enum: [meeting, focus, reminder, other]
 *     responses:
 *       201:
 *         description: Entry created successfully
 *       400:
 *         description: Missing/invalid title or date range
 * /calendar-entries/{id}:
 *   delete:
 *     summary: Remove one of the signed-in user's own calendar entries
 *     tags: [CalendarEntries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Entry removed
 *       404:
 *         description: Entry not found (or not owned by the signed-in user)
 */
router.get("/", calendarEntryController.listMine);
router.post("/", calendarEntryController.create);
router.delete("/:id", calendarEntryController.remove);

export default router;
