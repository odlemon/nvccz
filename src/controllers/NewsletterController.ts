// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";
import { uploadToS3 } from "../utils/awsS3";

export const newsletterController = {
  // Create a new newsletter
  async createNewsletter(req: AuthRequest, res: Response) {
    try {
      const { title, content } = req.body;
      const authorId = req.user.id;
      let imageUrl: string | undefined;

      // Update user's last seen
      await prisma.user.update({
        where: { id: authorId },
        data: { lastSeen: new Date() }
      });

      // Validation
      if (!title || !content) {
        res.status(400).json({
          success: false,
          message: "Title and content are required"
        });
        return;
      }

      // Handle image upload if present
      if (req.file) {
        try {
          const key = `newsletters/${Date.now()}-${req.file.originalname}`;
          imageUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype);
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          res.status(500).json({
            success: false,
            message: "Error uploading image"
          });
          return;
        }
      }

      const newsletter = await prisma.newsletter.create({
        data: { title, content, authorId, imageUrl },
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
        title: `New Newsletter: ${title}`,
        message: `A new newsletter has been published by ${req.user.firstName} ${req.user.lastName}`,
        type: 'newsletter',
        userId: user.id,
        data: { newsletterId: newsletter.id, authorId }
      }));

      await prisma.notification.createMany({ data: notifications });

      res.status(201).json({
        success: true,
        message: "Newsletter created successfully",
        data: newsletter
      });
    } catch (error: any) {
      console.error("Error creating newsletter:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get all active newsletters
  async getAllNewsletters(req: AuthRequest, res: Response) {
    try {
      const newsletters = await prisma.newsletter.findMany({
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
        orderBy: { createdAt: 'desc' }
      });

      res.status(200).json({
        success: true,
        data: newsletters
      });
    } catch (error: any) {
      console.error("Error fetching newsletters:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get newsletter by ID
  async getNewsletterById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const newsletter = await prisma.newsletter.findUnique({
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

      if (!newsletter) {
        res.status(404).json({
          success: false,
          message: "Newsletter not found"
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: newsletter
      });
    } catch (error: any) {
      console.error("Error fetching newsletter:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Update newsletter
  async updateNewsletter(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { title, content } = req.body;
      const userId = req.user.id;
      let imageUrl: string | undefined;

      const existingNewsletter = await prisma.newsletter.findUnique({
        where: { id }
      });

      if (!existingNewsletter) {
        res.status(404).json({
          success: false,
          message: "Newsletter not found"
        });
        return;
      }

      if (existingNewsletter.authorId !== userId) {
        res.status(403).json({
          success: false,
          message: "You can only edit your own newsletters"
        });
        return;
      }

      if (!title || !content) {
        res.status(400).json({
          success: false,
          message: "Title and content are required"
        });
        return;
      }

      // Handle image upload if present
      if (req.file) {
        try {
          const key = `newsletters/${Date.now()}-${req.file.originalname}`;
          imageUrl = await uploadToS3(req.file.buffer, key, req.file.mimetype);
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          res.status(500).json({
            success: false,
            message: "Error uploading image"
          });
          return;
        }
      }

      const updateData: any = { title, content };
      if (imageUrl) {
        updateData.imageUrl = imageUrl;
      }

      const updatedNewsletter = await prisma.newsletter.update({
        where: { id },
        data: updateData,
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
        message: "Newsletter updated successfully",
        data: updatedNewsletter
      });
    } catch (error: any) {
      console.error("Error updating newsletter:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Delete newsletter
  async deleteNewsletter(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const existingNewsletter = await prisma.newsletter.findUnique({
        where: { id }
      });

      if (!existingNewsletter) {
        res.status(404).json({
          success: false,
          message: "Newsletter not found"
        });
        return;
      }

      if (existingNewsletter.authorId !== userId) {
        res.status(403).json({
          success: false,
          message: "You can only delete your own newsletters"
        });
        return;
      }

      await prisma.newsletter.update({
        where: { id },
        data: { isActive: false }
      });

      res.status(200).json({
        success: true,
        message: "Newsletter deleted successfully"
      });
    } catch (error: any) {
      console.error("Error deleting newsletter:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
}; 