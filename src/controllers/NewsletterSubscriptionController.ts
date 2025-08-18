// @ts-nocheck
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";
import emailService from "../services/EmailService";

const prisma = dbConnection.getPrismaClient();

// Available newsletter topics
const AVAILABLE_TOPICS = [
  'Company Updates',
  'Industry News',
  'Product Announcements',
  'Events & Webinars',
  'Tips & Insights',
  'Team Highlights'
];

export const newsletterSubscriptionController = {
  /**
   * Subscribe to newsletter (double opt-in)
   * POST /api/newsletter/subscribe
   */
  async subscribe(req: Request, res: Response) {
    try {
      const { email, firstName, lastName, topics = [] } = req.body;

      // Validate required fields
      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required"
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email format"
        });
      }

      // Validate topics
      if (topics && Array.isArray(topics)) {
        const invalidTopics = topics.filter(topic => !AVAILABLE_TOPICS.includes(topic));
        if (invalidTopics.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Invalid topics: ${invalidTopics.join(', ')}`,
            availableTopics: AVAILABLE_TOPICS
          });
        }
      }

      // Check if subscription already exists
      const existingSubscription = await prisma.newsletterSubscription.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (existingSubscription) {
        if (existingSubscription.isConfirmed) {
          return res.status(409).json({
            success: false,
            message: "Email is already subscribed to our newsletter"
          });
        } else {
          // Resend confirmation email for unconfirmed subscriptions
          const confirmationToken = emailService.generateConfirmationToken();
          
          await prisma.newsletterSubscription.update({
            where: { email: email.toLowerCase() },
            data: {
              firstName: firstName || existingSubscription.firstName,
              lastName: lastName || existingSubscription.lastName,
              topics: topics.length > 0 ? topics : existingSubscription.topics,
              confirmationToken,
              updatedAt: new Date()
            }
          });

          // Send confirmation email
          await emailService.sendConfirmationEmail(
            email.toLowerCase(),
            firstName || existingSubscription.firstName,
            confirmationToken
          );

          return res.status(202).json({
            success: true,
            message: "Confirmation email sent. Please check your inbox to complete your subscription."
          });
        }
      }

      // Create new subscription
      const confirmationToken = emailService.generateConfirmationToken();
      
      const subscription = await prisma.newsletterSubscription.create({
        data: {
          email: email.toLowerCase(),
          firstName: firstName || null,
          lastName: lastName || null,
          topics: topics.length > 0 ? topics : ['Company Updates'],
          confirmationToken,
          isConfirmed: false
        }
      });

      // Send confirmation email
      const emailSent = await emailService.sendConfirmationEmail(
        email.toLowerCase(),
        firstName,
        confirmationToken
      );

      if (!emailSent) {
        // If email fails, delete the subscription
        await prisma.newsletterSubscription.delete({
          where: { id: subscription.id }
        });

        return res.status(500).json({
          success: false,
          message: "Failed to send confirmation email. Please try again."
        });
      }

      // Return 202 Accepted - request accepted for processing
      res.status(202).json({
        success: true,
        message: "Subscription request received. Please check your email to confirm your subscription.",
        data: {
          email: subscription.email,
          topics: subscription.topics
        }
      });

    } catch (error: any) {
      console.error("Error in newsletter subscription:", error);
      
      if (error.code === 'P2002') {
        return res.status(409).json({
          success: false,
          message: "Email is already subscribed to our newsletter"
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  /**
   * Confirm newsletter subscription
   * GET /api/newsletter/confirm
   */
  async confirmSubscription(req: Request, res: Response) {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Confirmation token is required"
        });
      }

      // Find subscription by token
      const subscription = await prisma.newsletterSubscription.findUnique({
        where: { confirmationToken: token }
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: "Invalid or expired confirmation token"
        });
      }

      if (subscription.isConfirmed) {
        return res.status(200).json({
          success: true,
          message: "Subscription is already confirmed"
        });
      }

      // Check if token is expired (24 hours)
      const tokenAge = Date.now() - subscription.createdAt.getTime();
      const tokenExpiry = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

      if (tokenAge > tokenExpiry) {
        // Delete expired subscription
        await prisma.newsletterSubscription.delete({
          where: { id: subscription.id }
        });

        return res.status(400).json({
          success: false,
          message: "Confirmation token has expired. Please subscribe again."
        });
      }

      // Confirm subscription
      await prisma.newsletterSubscription.update({
        where: { id: subscription.id },
        data: {
          isConfirmed: true,
          confirmedAt: new Date(),
          confirmationToken: null // Clear the token after confirmation
        }
      });

      // Send welcome email
      await emailService.sendWelcomeEmail(
        subscription.email,
        subscription.firstName,
        subscription.topics as string[]
      );

      res.status(200).json({
        success: true,
        message: "Newsletter subscription confirmed successfully!",
        data: {
          email: subscription.email,
          topics: subscription.topics
        }
      });

    } catch (error: any) {
      console.error("Error confirming newsletter subscription:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  /**
   * Unsubscribe from newsletter
   * POST /api/newsletter/unsubscribe
   */
  async unsubscribe(req: Request, res: Response) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required"
        });
      }

      const subscription = await prisma.newsletterSubscription.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: "Email not found in our subscription list"
        });
      }

      if (subscription.unsubscribedAt) {
        return res.status(200).json({
          success: true,
          message: "Email is already unsubscribed"
        });
      }

      // Mark as unsubscribed
      await prisma.newsletterSubscription.update({
        where: { id: subscription.id },
        data: {
          unsubscribedAt: new Date(),
          isActive: false
        }
      });

      res.status(200).json({
        success: true,
        message: "Successfully unsubscribed from newsletter"
      });

    } catch (error: any) {
      console.error("Error unsubscribing from newsletter:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  /**
   * Get available topics
   * GET /api/newsletter/topics
   */
  async getTopics(req: Request, res: Response) {
    try {
      res.status(200).json({
        success: true,
        data: {
          topics: AVAILABLE_TOPICS
        }
      });
    } catch (error: any) {
      console.error("Error fetching newsletter topics:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  },

  /**
   * Get subscription status
   * GET /api/newsletter/status
   */
  async getSubscriptionStatus(req: Request, res: Response) {
    try {
      const { email } = req.query;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Email parameter is required"
        });
      }

      const subscription = await prisma.newsletterSubscription.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!subscription) {
        return res.status(200).json({
          success: true,
          data: {
            subscribed: false,
            status: "not_subscribed"
          }
        });
      }

      let status = "subscribed";
      if (!subscription.isConfirmed) {
        status = "pending_confirmation";
      } else if (subscription.unsubscribedAt) {
        status = "unsubscribed";
      }

      res.status(200).json({
        success: true,
        data: {
          subscribed: subscription.isConfirmed && !subscription.unsubscribedAt,
          status,
          topics: subscription.topics,
          confirmedAt: subscription.confirmedAt,
          unsubscribedAt: subscription.unsubscribedAt
        }
      });

    } catch (error: any) {
      console.error("Error fetching subscription status:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }
};

