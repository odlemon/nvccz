// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";
import { EventService } from "../services/EventService";
import { GoogleCalendarService } from "../services/GoogleCalendarService";
import { Decimal } from "@prisma/client/runtime/library";
import { parseDate } from "../utils/dateHelper";
import * as XLSX from "xlsx";
import csvParser from "csv-parser";
import { Readable } from "stream";
const googleCalendarService = new GoogleCalendarService();

export const eventController = {
  // Create a new event with enhanced features
  async createEvent(req: AuthRequest, res: Response) {
    try {
      const eventData = {
        ...req.body,
        authorId: req.user.id
      };

      // Update user's last seen
      await prisma.user.update({
        where: { id: req.user.id },
        data: { lastSeen: new Date() }
      });

      // Validation
      if (!eventData.title || !eventData.description || !eventData.startDate || !eventData.endDate) {
        res.status(400).json({
          success: false,
          message: "Title, description, start date, and end date are required"
        });
        return;
      }

      if (new Date(eventData.startDate) >= new Date(eventData.endDate)) {
        res.status(400).json({
          success: false,
          message: "End date must be after start date"
        });
        return;
      }

      // Create event using EventService
      const event = await EventService.createEvent(eventData);

      // Create notifications for all users
      const allUsers = await prisma.user.findMany({
        where: { id: { not: req.user.id } }
      });

      const notifications = allUsers.map(user => ({
        title: `New Event: ${eventData.title}`,
        message: `A new event has been created by ${req.user.firstName} ${req.user.lastName}`,
        type: 'event',
        userId: user.id,
        data: { eventId: event.id, authorId: req.user.id }
      }));

      await prisma.notification.createMany({ data: notifications });

      res.status(201).json({
        success: true,
        message: "Event created successfully",
        data: event
      });
    } catch (error: any) {
      console.error("Error creating event:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get all active events (works for both authenticated and public)
  async getAllEvents(req: AuthRequest | Request, res: Response) {
    try {
      const events = await prisma.event.findMany({
        where: { isActive: true },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { startDate: 'asc' }
      });

      res.status(200).json({
        success: true,
        data: events
      });
    } catch (error: any) {
      console.error("Error fetching events:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get upcoming events (works for both authenticated and public)
  async getUpcomingEvents(req: AuthRequest | Request, res: Response) {
    try {
      const events = await prisma.event.findMany({
        where: {
          isActive: true,
          startDate: { gte: new Date() }
        },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: { startDate: 'asc' }
      });

      res.status(200).json({
        success: true,
        data: events
      });
    } catch (error: any) {
      console.error("Error fetching upcoming events:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get event by ID (works for both authenticated and public)
  async getEventById(req: AuthRequest | Request, res: Response) {
    try {
      const { id } = req.params;

      const event = await prisma.event.findUnique({
        where: { id },
        include: {
          author: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!event) {
        res.status(404).json({
          success: false,
          message: "Event not found"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: event
      });
    } catch (error: any) {
      console.error("Error fetching event:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Update event
  async updateEvent(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { title, description, startDate, endDate, location, rsvpDeadline, eventType, maxAttendees, isPublic, requiresRSVP, estimatedBudget, checkInRequired, feedbackRequired } = req.body;
      const userId = req.user.id;

      // Check if event exists and user is author
      const existingEvent = await prisma.event.findUnique({
        where: { id }
      });

      if (!existingEvent) {
        res.status(404).json({
          success: false,
          message: "Event not found"
        });
        return;
      }

      if (existingEvent.authorId !== userId) {
        res.status(403).json({
          success: false,
          message: "You can only edit your own events"
        });
        return;
      }

      // Validation
      if (!title || !description || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          message: "Title, description, start date, and end date are required"
        });
        return;
      }

      if (parseDate(startDate) >= parseDate(endDate)) {
        res.status(400).json({
          success: false,
          message: "End date must be after start date"
        });
        return;
      }

      // Validate RSVP deadline if provided
      if (rsvpDeadline && parseDate(rsvpDeadline) > parseDate(endDate)) {
        res.status(400).json({
          success: false,
          message: "RSVP deadline cannot be after event end date"
        });
        return;
      }

      // Build update data object (only include fields that are provided)
      const updateData: any = {
        title,
        description,
        startDate: parseDate(startDate),
        endDate: parseDate(endDate),
        location: location !== undefined ? location : null
      };

      // Add optional fields if provided
      if (rsvpDeadline !== undefined) {
        updateData.rsvpDeadline = rsvpDeadline ? parseDate(rsvpDeadline) : null;
      }
      if (eventType !== undefined) updateData.eventType = eventType;
      if (maxAttendees !== undefined) updateData.maxAttendees = maxAttendees;
      if (isPublic !== undefined) updateData.isPublic = isPublic;
      if (requiresRSVP !== undefined) updateData.requiresRSVP = requiresRSVP;
      if (estimatedBudget !== undefined) updateData.estimatedBudget = estimatedBudget ? new Decimal(estimatedBudget) : null;
      if (checkInRequired !== undefined) updateData.checkInRequired = checkInRequired;
      if (feedbackRequired !== undefined) updateData.feedbackRequired = feedbackRequired;

      // Update event
      const updatedEvent = await EventService.updateEvent(id, updateData);

      res.status(200).json({
        success: true,
        message: "Event updated successfully",
        data: updatedEvent
      });
    } catch (error: any) {
      console.error("Error updating event:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Delete event
  async deleteEvent(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Check if event exists and user is author
      const existingEvent = await prisma.event.findUnique({
        where: { id }
      });

      if (!existingEvent) {
        res.status(404).json({
          success: false,
          message: "Event not found"
        });
        return;
      }

      if (existingEvent.authorId !== userId) {
        res.status(403).json({
          success: false,
          message: "You can only delete your own events"
        });
        return;
      }

      // Soft delete by setting isActive to false
      await EventService.deleteEvent(id);

      res.status(200).json({
        success: true,
        message: "Event deleted successfully"
      });
    } catch (error: any) {
      console.error("Error deleting event:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Add guests to an event
  async addGuests(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;
      const { guests } = req.body;

      if (!guests || !Array.isArray(guests) || guests.length === 0) {
        res.status(400).json({
          success: false,
          message: "Guests array is required and must not be empty"
        });
        return;
      }

      const guestRecords = await EventService.addGuests(eventId, guests);

      res.status(201).json({
        success: true,
        message: "Guests added successfully",
        data: guestRecords
      });
    } catch (error: any) {
      console.error("Error adding guests:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  },

  // Remove guests by email (and resync Google attendees)
  async removeGuests(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;
      const emails = (req.body as any)?.emails;
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        res.status(400).json({ success: false, message: "emails[] is required" });
        return;
      }
      const result = await EventService.removeGuests(eventId, emails);
      res.status(200).json({ success: true, message: "Guests removed", data: result });
    } catch (error: any) {
      console.error("Error removing guests:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  },

  // Bulk guest upload (CSV/XLSX) + invite send
  async bulkUploadGuests(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;
      const file = req.file as Express.Multer.File | undefined;
      const text = String((req.body as any)?.text || "").trim();

      if (!file && !text) {
        res.status(400).json({
          success: false,
          message: "Provide either a file upload (`file`) or multi-line text (`text`).",
        });
        return;
      }

      const rows: any[] = [];

      const normalizeHeader = (h: string) =>
        String(h || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ")
          .replace(/[_-]+/g, " ");

      const asString = (v: any) => String(v ?? "").trim();

      const mapRowToGuest = (r: any) => {
        const email =
          asString(r.email || r["e-mail"] || r["email address"] || r["emailaddress"]).toLowerCase();
        const phone = asString(r.phone || r["phone number"] || r.mobile || r.msisdn);
        const name =
          asString(r.name) ||
          [asString(r.firstName || r.firstname || r["first name"]), asString(r.lastName || r.lastname || r["last name"])]
            .filter(Boolean)
            .join(" ")
            .trim();
        return {
          email,
          phone,
          name,
          company: asString(r.company || r.organization || r.org),
          title: asString(r.title || r.role || r.position),
        };
      };

      const parseCsvBuffer = async (buf: Buffer) => {
        await new Promise<void>((resolve, reject) => {
          const stream = Readable.from(buf);
          stream
            .pipe(
              csvParser({
                mapHeaders: ({ header }) => normalizeHeader(header),
              })
            )
            .on("data", (data) => rows.push(data))
            .on("end", () => resolve())
            .on("error", (err) => reject(err));
        });
      };

      const parseXlsxBuffer = (buf: Buffer) => {
        const workbook = XLSX.read(buf, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[];
        for (const r of json) {
          const normalized: any = {};
          for (const [k, v] of Object.entries(r || {})) {
            normalized[normalizeHeader(k)] = v;
          }
          rows.push(normalized);
        }
      };

      if (file) {
        const original = String(file.originalname || "").toLowerCase();
        const mime = String(file.mimetype || "").toLowerCase();
        if (original.endsWith(".csv") || mime.includes("csv")) {
          await parseCsvBuffer(file.buffer);
        } else if (original.endsWith(".xlsx") || original.endsWith(".xls") || mime.includes("spreadsheet")) {
          parseXlsxBuffer(file.buffer);
        } else {
          res.status(400).json({
            success: false,
            message: "Unsupported file type. Upload a .csv or .xlsx file.",
          });
          return;
        }
      } else if (text) {
        // Multi-line text: supports "name, email, phone" or "email, phone, name"
        const lines = text
          .split(/\r?\n/g)
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          const parts = line.split(",").map((p) => p.trim());
          if (parts.length === 1) {
            rows.push({ email: parts[0] });
          } else if (parts.length === 2) {
            rows.push({ email: parts[0], phone: parts[1] });
          } else {
            rows.push({ name: parts[0], email: parts[1], phone: parts[2] });
          }
        }
      }

      const guestsRaw = rows.map(mapRowToGuest);

      // Validate + dedupe within payload
      const createdCandidates: any[] = [];
      const errors: Array<{ row: number; message: string; raw?: any }> = [];
      const seenEmails = new Set<string>();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

      guestsRaw.forEach((g, idx) => {
        const rowNo = idx + 1;
        if (!g.email || !emailRegex.test(g.email)) {
          errors.push({ row: rowNo, message: "Missing/invalid email", raw: g });
          return;
        }
        if (!g.phone) {
          errors.push({ row: rowNo, message: "Missing phone number", raw: g });
          return;
        }
        if (!g.name) {
          errors.push({ row: rowNo, message: "Missing name", raw: g });
          return;
        }
        if (seenEmails.has(g.email)) return;
        seenEmails.add(g.email);
        createdCandidates.push(g);
      });

      if (createdCandidates.length === 0) {
        res.status(400).json({
          success: false,
          message: "No valid guest rows found to upload.",
          errors,
        });
        return;
      }

      // Filter out guests already on event (unique eventId+email)
      const existing = await prisma.eventGuest.findMany({
        where: { eventId, email: { in: createdCandidates.map((g) => g.email) } },
        select: { email: true },
      });
      const existingEmails = new Set(existing.map((e) => String(e.email).toLowerCase()));
      const guestsToCreate = createdCandidates.filter((g) => !existingEmails.has(g.email));

      const created = await EventService.addGuests(eventId, guestsToCreate);

      res.status(201).json({
        success: true,
        message: "Bulk guests uploaded successfully",
        data: {
          requested: createdCandidates.length,
          skippedExisting: createdCandidates.length - guestsToCreate.length,
          created: created.length,
          errors,
          guests: created,
        },
      });
    } catch (error: any) {
      console.error("Error bulk uploading guests:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  },

  // Download example guest upload template (CSV/XLSX)
  async downloadGuestUploadTemplate(req: AuthRequest, res: Response) {
    try {
      const format = String((req.query as any)?.format || "xlsx").toLowerCase();

      const headers = ["name", "email", "phone", "company", "title"];
      const exampleRows = [
        {
          name: "Jane Doe",
          email: "jane.doe@example.com",
          phone: "+263771234567",
          company: "Arcus AI Pvt Ltd",
          title: "CFO",
        },
        {
          name: "John Smith",
          email: "john.smith@example.com",
          phone: "+263774567890",
          company: "Example Co",
          title: "CEO",
        },
      ];

      if (format === "csv") {
        const escapeCsv = (v: any) => {
          const s = String(v ?? "");
          if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };
        const lines = [
          headers.join(","),
          ...exampleRows.map((r) => headers.map((h) => escapeCsv((r as any)[h])).join(",")),
        ];
        const buf = Buffer.from(lines.join("\n"), "utf8");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="event-guests-template.csv"');
        res.status(200).send(buf);
        return;
      }

      // default: xlsx
      const worksheet = XLSX.utils.json_to_sheet(exampleRows, { header: headers });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Guests");
      const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", 'attachment; filename="event-guests-template.xlsx"');
      res.status(200).send(buf);
    } catch (error: any) {
      console.error("Error generating guest upload template:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error",
      });
    }
  },

  // Handle RSVP response
  async handleRSVP(req: Request, res: Response) {
    try {
      const { invitationToken } = req.params;
      const { rsvpStatus, notes } = req.body;

      if (!['ACCEPTED', 'DECLINED', 'MAYBE'].includes(rsvpStatus)) {
        res.status(400).json({
          success: false,
          message: "Invalid RSVP status. Must be ACCEPTED, DECLINED, or MAYBE"
        });
        return;
      }

      const guest = await EventService.handleRSVP(invitationToken, rsvpStatus, notes);

      res.status(200).json({
        success: true,
        message: "RSVP response recorded successfully",
        data: guest
      });
    } catch (error: any) {
      console.error("Error handling RSVP:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  },

  // Add budget items to an event
  async addBudgetItems(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;
      const { budgetItems } = req.body;

      if (!budgetItems || !Array.isArray(budgetItems) || budgetItems.length === 0) {
        res.status(400).json({
          success: false,
          message: "Budget items array is required and must not be empty"
        });
        return;
      }

      const budgetItemRecords = await EventService.addBudgetItems(eventId, budgetItems);

      res.status(201).json({
        success: true,
        message: "Budget items added successfully",
        data: budgetItemRecords
      });
    } catch (error: any) {
      console.error("Error adding budget items:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  },

  // Approve event budget
  async approveBudget(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;
      const { approvedBudget, notes } = req.body;

      if (!approvedBudget || approvedBudget <= 0) {
        res.status(400).json({
          success: false,
          message: "Approved budget is required and must be greater than 0"
        });
        return;
      }

      const event = await EventService.approveBudget(eventId, req.user.id, approvedBudget, notes);

      res.status(200).json({
        success: true,
        message: "Budget approved successfully",
        data: event
      });
    } catch (error: any) {
      console.error("Error approving budget:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  },

  // Record event expense
  async recordExpense(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;
      const expenseData = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "Authentication required"
        });
        return;
      }

      if (!expenseData.description || !expenseData.amount || !expenseData.category) {
        res.status(400).json({
          success: false,
          message: "Description, amount, and category are required"
        });
        return;
      }

      const expense = await EventService.recordExpense(eventId, expenseData, userId);

      res.status(201).json({
        success: true,
        message: "Expense recorded successfully with journal entry created",
        data: expense
      });
    } catch (error: any) {
      console.error("Error recording expense:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  },

  // Check in guest to event
  async checkInGuest(req: AuthRequest, res: Response) {
    try {
      const { eventId, guestId } = req.params;
      const { notes } = req.body;

      const checkIn = await EventService.checkInGuest(eventId, guestId, req.user.id, notes);

      res.status(201).json({
        success: true,
        message: "Guest checked in successfully",
        data: checkIn
      });
    } catch (error: any) {
      console.error("Error checking in guest:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  },

  // Submit event feedback
  async submitFeedback(req: Request, res: Response) {
    try {
      const { eventId } = req.params;
      const feedbackData = req.body;

      if (!feedbackData.rating || !feedbackData.overallSatisfaction) {
        res.status(400).json({
          success: false,
          message: "Rating and overall satisfaction are required"
        });
        return;
      }

      const feedback = await EventService.submitFeedback(eventId, feedbackData);

      res.status(201).json({
        success: true,
        message: "Feedback submitted successfully",
        data: feedback
      });
    } catch (error: any) {
      console.error("Error submitting feedback:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  },

  // Generate event report
  async generateEventReport(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;
      const { reportType } = req.body;

      if (!reportType) {
        res.status(400).json({
          success: false,
          message: "Report type is required"
        });
        return;
      }

      const report = await EventService.generateEventReport(eventId, reportType, req.user.id);

      res.status(201).json({
        success: true,
        message: "Event report generated successfully",
        data: report
      });
    } catch (error: any) {
      console.error("Error generating event report:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  },

  // Get event analytics
  async getEventAnalytics(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;

      const analytics = await EventService.getEventAnalytics(eventId);

      res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error: any) {
      console.error("Error getting event analytics:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Internal server error"
      });
    }
  },

  // Get event guests
  async getEventGuests(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;
      const { page = 1, limit = 10, rsvpStatus } = req.query;

      const whereClause: any = { eventId };
      if (rsvpStatus) {
        whereClause.rsvpStatus = rsvpStatus;
      }

      const guests = await prisma.eventGuest.findMany({
        where: whereClause,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' }
      });

      const total = await prisma.eventGuest.count({ where: whereClause });

      res.status(200).json({
        success: true,
        data: guests,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error: any) {
      console.error("Error getting event guests:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get event budget items
  async getEventBudgetItems(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;

      const budgetItems = await prisma.eventBudgetItem.findMany({
        where: { eventId },
        orderBy: { createdAt: 'desc' }
      });

      res.status(200).json({
        success: true,
        data: budgetItems
      });
    } catch (error: any) {
      console.error("Error getting event budget items:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get event expenses
  async getEventExpenses(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;

      const expenses = await prisma.eventExpense.findMany({
        where: { eventId },
        orderBy: { createdAt: 'desc' }
      });

      res.status(200).json({
        success: true,
        data: expenses
      });
    } catch (error: any) {
      console.error("Error getting event expenses:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get event feedback
  async getEventFeedback(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;

      const feedback = await prisma.eventFeedback.findMany({
        where: { eventId },
        select: {
          id: true,
          eventId: true,
          rating: true,
          overallSatisfaction: true,
          contentQuality: true,
          venueQuality: true,
          foodQuality: true,
          organization: true,
          positiveAspects: true,
          areasForImprovement: true,
          suggestions: true,
          wouldAttendAgain: true,
          wouldRecommend: true,
          additionalComments: true,
          anonymous: true,
          createdAt: true,
          updatedAt: true
          // guestId and guest are excluded
        },
        orderBy: { createdAt: 'desc' }
      });

      res.status(200).json({
        success: true,
        data: feedback
      });
    } catch (error: any) {
      console.error("Error getting event feedback:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}; 