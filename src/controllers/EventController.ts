import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";

const prisma = dbConnection.getPrismaClient();

export const eventController = {
  // Create a new event
  async createEvent(req: AuthRequest, res: Response) {
    try {
      const { title, description, startDate, endDate, location } = req.body;
      const authorId = req.user.id;

      // Update user's last seen
      await prisma.user.update({
        where: { id: authorId },
        data: { lastSeen: new Date() }
      });

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

      // Create event
      const event = await prisma.event.create({
        data: {
          title,
          description,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          location: location || null,
          authorId
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

      // Create notifications for all users
      const allUsers = await prisma.user.findMany({
        where: { id: { not: authorId } }
      });

      const notifications = allUsers.map(user => ({
        title: `New Event: ${title}`,
        message: `A new event has been created by ${req.user.firstName} ${req.user.lastName}`,
        type: 'event',
        userId: user.id,
        data: { eventId: event.id, authorId }
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
  }
}; 