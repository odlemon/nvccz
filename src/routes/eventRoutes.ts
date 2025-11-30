// @ts-nocheck
import express from "express";
import { eventController } from "../controllers/EventController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /events:
 *   post:
 *     summary: Create a new event
 *     description: Create a new company event with enhanced features including event type, RSVP requirements, budget planning, and Google Calendar integration. All users are notified when a new event is created.
 *     tags: [Events Management - Core Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateEventRequest'
 *     responses:
 *       201:
 *         description: Event created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Event created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Event'
 *       400:
 *         description: Bad request - validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", eventController.createEvent);

/**
 * @swagger
 * /events:
 *   get:
 *     summary: Get all active events
 *     description: Retrieve all active events ordered by start date. Returns events with author information.
 *     tags: [Events Management - Core Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Events retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", eventController.getAllEvents);

/**
 * @swagger
 * /events/upcoming:
 *   get:
 *     summary: Get upcoming events
 *     description: Retrieve all upcoming events (start date >= current date) ordered by start date
 *     tags: [Events Management - Core Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Upcoming events retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/upcoming", eventController.getUpcomingEvents);

/**
 * @swagger
 * /events/{id}:
 *   get:
 *     summary: Get event by ID
 *     description: Retrieve a specific event by ID with full details including author information
 *     tags: [Events Management - Core Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *         example: clx1234567890abcdef
 *     responses:
 *       200:
 *         description: Event retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Event'
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id", eventController.getEventById);

/**
 * @swagger
 * /events/{id}:
 *   put:
 *     summary: Update an event
 *     description: Update an event. Only the event author can update their events. Updates basic event information.
 *     tags: [Events Management - Core Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *         example: clx1234567890abcdef
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateEventRequest'
 *     responses:
 *       200:
 *         description: Event updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Event updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Event'
 *       400:
 *         description: Bad request - validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - can only edit your own events
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/:id", eventController.updateEvent);

/**
 * @swagger
 * /events/{id}:
 *   delete:
 *     summary: Delete an event
 *     description: Delete an event (soft delete by setting isActive to false). Only the event author can delete their events.
 *     tags: [Events Management - Core Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *         example: clx1234567890abcdef
 *     responses:
 *       200:
 *         description: Event deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Event deleted successfully
 *       403:
 *         description: Forbidden - can only delete your own events
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Event not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:id", eventController.deleteEvent);

// Enhanced Event Management Routes

// Guest Management
/**
 * @swagger
 * /events/{eventId}/guests:
 *   post:
 *     summary: Add guests to an event
 *     description: Add one or more guests to an event. Invitation emails with unique RSVP links are automatically sent to all guests.
 *     tags: [Events Management - Guest Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [guests]
 *             properties:
 *               guests:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [email, name]
 *                   properties:
 *                     email: { type: string, format: email }
 *                     name: { type: string }
 *                     phone: { type: string }
 *                     company: { type: string }
 *                     title: { type: string }
 *                     dietaryRequirements: { type: string }
 *                     accessibilityNeeds: { type: string }
 *                     emergencyContact: { type: string }
 *                     emergencyPhone: { type: string }
 *     responses:
 *       201:
 *         description: Guests added successfully and invitation emails sent
 *       400:
 *         description: Bad request - guests array is required and must not be empty
 *       404:
 *         description: Event not found
 *       401:
 *         description: Unauthorized
 */
router.post("/:eventId/guests", eventController.addGuests);

/**
 * @swagger
 * /events/{eventId}/guests:
 *   get:
 *     summary: Get event guests
 *     description: Retrieve all guests for an event with pagination and optional RSVP status filtering
 *     tags: [Events Management - Guest Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: rsvpStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, ACCEPTED, DECLINED, MAYBE]
 *         description: Filter by RSVP status
 *     responses:
 *       200:
 *         description: Event guests retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/:eventId/guests", eventController.getEventGuests);

// RSVP Management
/**
 * @swagger
 * /events/rsvp/{invitationToken}:
 *   post:
 *     summary: Handle RSVP response (PUBLIC)
 *     description: **PUBLIC ENDPOINT** - No authentication required. Guests use this endpoint to respond to event invitations using their unique invitation token. Organizers receive email notifications when guests respond.
 *     tags: [Events Management - Guest Management]
 *     parameters:
 *       - in: path
 *         name: invitationToken
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique invitation token sent to guest via email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rsvpStatus]
 *             properties:
 *               rsvpStatus:
 *                 type: string
 *                 enum: [ACCEPTED, DECLINED, MAYBE]
 *                 description: RSVP response status
 *               notes:
 *                 type: string
 *                 description: Optional notes from guest
 *     responses:
 *       200:
 *         description: RSVP response recorded successfully
 *       400:
 *         description: Bad request - invalid RSVP status or RSVP deadline has passed
 *       404:
 *         description: Invalid invitation token
 */
router.post("/rsvp/:invitationToken", eventController.handleRSVP);

/**
 * @swagger
 * /events/{eventId}/guests/{guestId}/check-in:
 *   post:
 *     summary: Check in guest to event
 *     description: Check in a guest to an event. Creates a check-in record and updates the guest's check-in status. Used during event day operations.
 *     tags: [Events Management - Guest Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *       - in: path
 *         name: guestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Guest ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Optional check-in notes
 *     responses:
 *       201:
 *         description: Guest checked in successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Event or guest not found
 *       401:
 *         description: Unauthorized
 */
router.post("/:eventId/guests/:guestId/check-in", eventController.checkInGuest);

// Budget Management
/**
 * @swagger
 * /events/{eventId}/budget-items:
 *   post:
 *     summary: Add budget items to an event
 *     description: Add one or more budget items to an event. Budget items are categorized expenses with estimated costs. Adding budget items automatically changes the event budget status from DRAFT to SUBMITTED and event status to BUDGET_PENDING, making it ready for approval.
 *     tags: [Events Management - Budget Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [budgetItems]
 *             properties:
 *               budgetItems:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [category, itemName, estimatedCost]
 *                   properties:
 *                     category:
 *                       type: string
 *                       enum: [VENUE, CATERING, DECORATIONS, ENTERTAINMENT, TRANSPORT, MARKETING, TECHNOLOGY, STAFFING, SECURITY, CLEANING, INSURANCE, UTILITIES, OTHER]
 *                     itemName: { type: string }
 *                     description: { type: string }
 *                     estimatedCost: { type: number }
 *                     quantity: { type: integer, default: 1 }
 *                     unit: { type: string }
 *                     vendor: { type: string }
 *                     vendorContact: { type: string }
 *                     notes: { type: string }
 *     responses:
 *       201:
 *         description: Budget items added successfully
 *       400:
 *         description: Bad request - budget items array is required and must not be empty
 *       404:
 *         description: Event not found
 *       401:
 *         description: Unauthorized
 */
router.post("/:eventId/budget-items", eventController.addBudgetItems);

/**
 * @swagger
 * /events/{eventId}/budget-items:
 *   get:
 *     summary: Get event budget items
 *     description: Retrieve all budget items for an event
 *     tags: [Events Management - Budget Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Budget items retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/:eventId/budget-items", eventController.getEventBudgetItems);

/**
 * @swagger
 * /events/{eventId}/budget/approve:
 *   post:
 *     summary: Approve event budget
 *     description: Approve an event budget. **Required:** Budget must be in SUBMITTED status. Creates a journal entry for budget allocation (Dr. Event Budget Account, Cr. Cash/Bank). Sends email notification to event organizer. Once approved, budget status becomes APPROVED and event status becomes BUDGET_APPROVED, allowing expenses to be recorded.
 *     tags: [Events Management - Budget Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [approvedBudget]
 *             properties:
 *               approvedBudget:
 *                 type: number
 *                 description: Approved budget amount (can be different from estimated budget)
 *               notes:
 *                 type: string
 *                 description: Optional approval notes
 *     responses:
 *       200:
 *         description: Budget approved successfully
 *       400:
 *         description: Bad request - approved budget is required and must be greater than 0
 *       404:
 *         description: Event not found
 *       401:
 *         description: Unauthorized
 */
router.post("/:eventId/budget/approve", eventController.approveBudget);

// Expense Management
/**
 * @swagger
 * /events/{eventId}/expenses:
 *   post:
 *     summary: Record event expense
 *     description: Record an expense for an event. **Requires budget to be approved first.** Automatically creates accounting journal entries (Dr. Expense, Dr. VAT if taxable, Cr. AP). VAT is calculated automatically at 14.5% if expense is taxable. Links expense to budget items if provided.
 *     tags: [Events Management - Expense Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [description, amount, category, vendorId]
 *             properties:
 *               description: { type: string }
 *               amount: { type: number }
 *               category:
 *                 type: string
 *                 enum: [VENUE, CATERING, DECORATIONS, ENTERTAINMENT, TRANSPORT, MARKETING, TECHNOLOGY, STAFFING, SECURITY, CLEANING, INSURANCE, UTILITIES, OTHER]
 *               vendorId: { type: string, description: "Required: Vendor ID from the vendors list" }
 *               budgetItemId: { type: string }
 *               vendor: { type: string, description: "Optional: Vendor name for display purposes" }
 *               paymentMethod: { type: string, enum: [BANK, CASH] }
 *               paymentDate: { type: string, format: date-time }
 *               isTaxable: { type: boolean, default: true }
 *               isReimbursable: { type: boolean, default: true }
 *               receiptNumber: { type: string }
 *               currencyId: { type: string }
 *     responses:
 *       201:
 *         description: Expense recorded successfully with journal entry created
 *       400:
 *         description: Bad request - missing required fields
 *       404:
 *         description: Event not found
 *       401:
 *         description: Unauthorized
 */
router.post("/:eventId/expenses", eventController.recordExpense);

/**
 * @swagger
 * /events/{eventId}/expenses:
 *   get:
 *     summary: Get event expenses
 *     description: Retrieve all expenses for an event
 *     tags: [Events Management - Expense Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event expenses retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/:eventId/expenses", eventController.getEventExpenses);

// Feedback Management
/**
 * @swagger
 * /events/{eventId}/feedback:
 *   post:
 *     summary: Submit event feedback (PUBLIC)
 *     description: **PUBLIC ENDPOINT** - No authentication required. Submit feedback for an event. Supports anonymous feedback. Multi-dimensional rating system for overall satisfaction, content quality, venue quality, food quality, and organization.
 *     tags: [Events Management - Feedback Management]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating, overallSatisfaction]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               overallSatisfaction: { type: integer, minimum: 1, maximum: 5 }
 *               contentQuality: { type: integer, minimum: 1, maximum: 5 }
 *               venueQuality: { type: integer, minimum: 1, maximum: 5 }
 *               foodQuality: { type: integer, minimum: 1, maximum: 5 }
 *               organization: { type: integer, minimum: 1, maximum: 5 }
 *               positiveAspects: { type: string }
 *               areasForImprovement: { type: string }
 *               suggestions: { type: string }
 *               wouldAttendAgain: { type: boolean }
 *               wouldRecommend: { type: boolean }
 *               additionalComments: { type: string }
 *               anonymous: { type: boolean, default: false }
 *               guestId: { type: string }
 *     responses:
 *       201:
 *         description: Feedback submitted successfully
 *       400:
 *         description: Bad request - rating and overall satisfaction are required
 *       404:
 *         description: Event not found
 */
router.post("/:eventId/feedback", eventController.submitFeedback);

/**
 * @swagger
 * /events/{eventId}/feedback:
 *   get:
 *     summary: Get event feedback
 *     description: Retrieve all feedback for an event. Includes guest information unless feedback is anonymous.
 *     tags: [Events Management - Feedback Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event feedback retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/:eventId/feedback", eventController.getEventFeedback);

// Analytics and Reporting
/**
 * @swagger
 * /events/{eventId}/analytics:
 *   get:
 *     summary: Get event analytics
 *     description: Retrieve comprehensive analytics for an event including RSVP rates, check-in rates, feedback rates, average ratings, budget utilization, and cost per attendee.
 *     tags: [Events Management - Analytics & Reporting]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Event analytics retrieved successfully
 *       404:
 *         description: Event not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:eventId/analytics", eventController.getEventAnalytics);

/**
 * @swagger
 * /events/{eventId}/reports:
 *   post:
 *     summary: Generate event report
 *     description: Generate a comprehensive event report with metrics, analytics, and recommendations. Report includes RSVP statistics, check-in data, feedback analysis, budget vs actual expenses, and performance recommendations.
 *     tags: [Events Management - Analytics & Reporting]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reportType]
 *             properties:
 *               reportType:
 *                 type: string
 *                 enum: [FINANCIAL, ATTENDANCE, FEEDBACK, COMPREHENSIVE]
 *                 description: Type of report to generate
 *     responses:
 *       201:
 *         description: Event report generated successfully
 *       400:
 *         description: Bad request - report type is required
 *       404:
 *         description: Event not found
 *       401:
 *         description: Unauthorized
 */
router.post("/:eventId/reports", eventController.generateEventReport);

export default router; 