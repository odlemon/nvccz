// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";
import { uploadToS3 } from "../utils/awsS3";
import { normalizeNewsletterContent } from "../utils/newsletterContent";
import {
  getNewsletterRecipientConfig,
  listNewsletterBaseAudienceUsers,
  resolveNewsletterRecipients,
  saveNewsletterRecipientConfig,
} from "../utils/newsletterInternalRecipients";
import { EmailNotificationService } from "../services/EmailNotificationService";

export const newsletterController = {
  // Create a new newsletter
  async createNewsletter(req: AuthRequest, res: Response) {
    try {
      const { title, content } = req.body;
      const authorId = req.user.id;
      const normalizedTitle = String(title ?? "").trim();
      let imageUrl: string | undefined;

      // Update user's last seen
      await prisma.user.update({
        where: { id: authorId },
        data: { lastSeen: new Date() }
      });

      // Validation
      if (!normalizedTitle || !content) {
        res.status(400).json({
          success: false,
          message: "Title and content are required"
        });
        return;
      }
      const normalized = normalizeNewsletterContent(content);
      if (!normalized.text) {
        return res.status(400).json({
          success: false,
          message: "Newsletter content cannot be empty"
        });
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
        data: { title: normalizedTitle, content: normalized.html, authorId, imageUrl },
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

      // Staff / internal users only — not investees (portfolio portal) or LPs / applicant role.
      // Apply newsletter include/exclude overrides from saved config.
      const resolved = await resolveNewsletterRecipients(authorId);
      const recipientUsers = resolved.userRecipients;

      const notifications = recipientUsers.map((user) => ({
        title: `New Newsletter: ${title}`,
        message: `A new newsletter has been published by ${req.user.firstName} ${req.user.lastName}`,
        type: "newsletter",
        userId: user.id,
        data: { newsletterId: newsletter.id, authorId },
      }));

      if (notifications.length > 0) {
        await prisma.notification.createMany({ data: notifications });
      }

      const authorDisplayName = `${req.user.firstName ?? ""} ${req.user.lastName ?? ""}`.trim();

      // SMTP per recipient can exceed API SLA (e.g. 5s); send after response returns.
      setImmediate(() => {
        void EmailNotificationService.broadcastInternalNewsletterEmails({
          recipients: [
            ...recipientUsers,
            ...resolved.extraEmailRecipients.map((email) => ({
              email,
              firstName: null,
              lastName: null,
            })),
          ],
          title: normalizedTitle,
          content: normalized.html,
          imageUrl: newsletter.imageUrl ?? undefined,
          coverImageFromUpload: req.file
            ? {
                content: req.file.buffer,
                contentType: req.file.mimetype || "image/jpeg",
                filename: req.file.originalname
              }
            : undefined,
          authorDisplayName: authorDisplayName || "Author",
        })
          .then((emailResult) => {
            console.log(
              `[newsletter ${newsletter.id}] emails: ${emailResult.succeeded}/${emailResult.attempted} sent`
            );
            if (emailResult.failed.length > 0) {
              console.warn(`[newsletter ${newsletter.id}] email failures:`, emailResult.failed);
            }
          })
          .catch((err) => {
            console.error(`[newsletter ${newsletter.id}] broadcastInternalNewsletterEmails:`, err);
          });
      });

      res.status(201).json({
        success: true,
        message: "Newsletter created successfully",
        data: newsletter,
        distribution: {
          recipientUserCount: recipientUsers.length,
          extraEmailRecipientCount: resolved.extraEmailRecipients.length,
          notificationsCreated: notifications.length,
          emailsQueued: recipientUsers.length + resolved.extraEmailRecipients.length,
          emailDispatch: "background",
        },
      });
    } catch (error: any) {
      console.error("Error creating newsletter:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  // Get newsletter audience config (eligible users + include/exclude settings)
  async getRecipientConfig(req: AuthRequest, res: Response) {
    try {
      const [users, config] = await Promise.all([
        listNewsletterBaseAudienceUsers(),
        getNewsletterRecipientConfig(),
      ]);
      const hasWhitelist = config.includeUserIds.length > 0;
      const selectedUserIds = new Set(
        users
          .map((u) => u.id)
          .filter((id) => (hasWhitelist ? config.includeUserIds.includes(id) : true))
          .filter((id) => !config.excludeUserIds.includes(id))
      );

      res.status(200).json({
        success: true,
        data: {
          users: users.map((u) => ({
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            roleName: u.role?.name ?? null,
            selected: selectedUserIds.has(u.id),
            excluded: config.excludeUserIds.includes(u.id),
          })),
          config,
        },
      });
    } catch (error: any) {
      console.error("Error getting newsletter recipient config:", error);
      res.status(500).json({
        success: false,
        message: error?.message || "Internal server error",
      });
    }
  },

  // Save newsletter audience include/exclude settings
  async saveRecipientConfig(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const { includeUserIds, excludeUserIds, includeEmails, excludeEmails } = req.body || {};
      const config = await saveNewsletterRecipientConfig(userId, {
        includeUserIds,
        excludeUserIds,
        includeEmails,
        excludeEmails,
      });
      const users = await listNewsletterBaseAudienceUsers();
      const hasWhitelist = config.includeUserIds.length > 0;
      const selectedInternalUsers = users.filter((u) =>
        (hasWhitelist ? config.includeUserIds.includes(u.id) : true) &&
        !config.excludeUserIds.includes(u.id)
      );
      const totalEmailsSelected = selectedInternalUsers.length + config.includeEmails.length;

      res.status(200).json({
        success: true,
        message: "Newsletter recipient config saved successfully",
        data: {
          config,
          summary: {
            eligibleInternalUsers: users.length,
            selectedInternalUsers: selectedInternalUsers.length,
            excludedUsers: config.excludeUserIds.length,
            extraIncludedEmails: config.includeEmails.length,
            totalEmailsSelected,
          },
        },
      });
    } catch (error: any) {
      console.error("Error saving newsletter recipient config:", error);
      res.status(400).json({
        success: false,
        message: error?.message || "Failed to save newsletter recipient config",
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
      const normalizedTitle = String(title ?? "").trim();
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

      if (!normalizedTitle || !content) {
        res.status(400).json({
          success: false,
          message: "Title and content are required"
        });
        return;
      }
      const normalized = normalizeNewsletterContent(content);
      if (!normalized.text) {
        return res.status(400).json({
          success: false,
          message: "Newsletter content cannot be empty"
        });
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

      const updateData: any = { title: normalizedTitle, content: normalized.html };
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