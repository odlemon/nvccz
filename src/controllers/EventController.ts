// @ts-nocheck
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";
import { EventService } from "../services/EventService";
import { GoogleCalendarService } from "../services/GoogleCalendarService";
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

  // Get all active events
  async getAllEvents(req: AuthRequest, res: Response) {
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

  // Get upcoming events
  async getUpcomingEvents(req: AuthRequest, res: Response) {
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

  // Get event by ID
  async getEventById(req: AuthRequest, res: Response) {
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
      const { title, description, startDate, endDate, location } = req.body;
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

      if (new Date(startDate) >= new Date(endDate)) {
        res.status(400).json({
          success: false,
          message: "End date must be after start date"
        });
        return;
      }

      // Update event
      const updatedEvent = await prisma.event.update({
        where: { id },
        data: {
          title,
          description,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          location: location || null
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
        }
      });

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
      await prisma.event.update({
        where: { id },
        data: { isActive: false }
      });

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

      const feedback = await EventService.submitFeedback(eventId, feedbackData, feedbackData.guestId);

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
        include: {
          guest: {
            select: {
              name: true,
              email: true
            }
          }
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