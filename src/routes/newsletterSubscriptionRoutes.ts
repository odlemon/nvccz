// @ts-nocheck
import express from "express";
import rateLimit from "express-rate-limit";
import { newsletterSubscriptionController } from "../controllers/NewsletterSubscriptionController";

const router = express.Router();

// Rate limiting for newsletter subscription endpoints
const subscriptionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs for subscription endpoints
  message: {
    success: false,
    message: "Too many subscription requests from this IP, please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * /newsletter/subscribe:
 *   post:
 *     summary: Subscribe to newsletter (double opt-in)
 *     description: Subscribe to newsletter with email validation and double opt-in confirmation
 *     tags: [Newsletter Subscription]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address for subscription
 *                 example: "user@example.com"
 *               firstName:
 *                 type: string
 *                 description: First name (optional)
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 description: Last name (optional)
 *                 example: "Doe"
 *               topics:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of newsletter topics to subscribe to
 *                 example: ["Company Updates", "Industry News"]
 *     responses:
 *       202:
 *         description: Subscription request accepted, confirmation email sent
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
 *                   example: "Subscription request received. Please check your email to confirm your subscription."
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       example: "user@example.com"
 *                     topics:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Company Updates"]
 *       400:
 *         description: Bad request - validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Email already subscribed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many requests
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/subscribe", subscriptionRateLimit, newsletterSubscriptionController.subscribe);

/**
 * @swagger
 * /newsletter/confirm:
 *   get:
 *     summary: Confirm newsletter subscription
 *     description: Confirm newsletter subscription using the token from confirmation email
 *     tags: [Newsletter Subscription]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Confirmation token from email
 *         example: "abc123def456..."
 *     responses:
 *       200:
 *         description: Subscription confirmed successfully
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
 *                   example: "Newsletter subscription confirmed successfully!"
 *                 data:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       example: "user@example.com"
 *                     topics:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Company Updates"]
 *       400:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Token not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/confirm", newsletterSubscriptionController.confirmSubscription);

/**
 * @swagger
 * /newsletter/unsubscribe:
 *   post:
 *     summary: Unsubscribe from newsletter
 *     description: Unsubscribe an email from the newsletter
 *     tags: [Newsletter Subscription]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address to unsubscribe
 *                 example: "user@example.com"
 *     responses:
 *       200:
 *         description: Successfully unsubscribed
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
 *                   example: "Successfully unsubscribed from newsletter"
 *       400:
 *         description: Email is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Email not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/unsubscribe", newsletterSubscriptionController.unsubscribe);

/**
 * @swagger
 * /newsletter/topics:
 *   get:
 *     summary: Get available newsletter topics
 *     description: Get list of available newsletter topics for subscription
 *     tags: [Newsletter Subscription]
 *     responses:
 *       200:
 *         description: Available topics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     topics:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Company Updates", "Industry News", "Product Announcements"]
 */
router.get("/topics", newsletterSubscriptionController.getTopics);

/**
 * @swagger
 * /newsletter/status:
 *   get:
 *     summary: Get subscription status
 *     description: Check subscription status for a specific email
 *     tags: [Newsletter Subscription]
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         description: Email address to check status for
 *         example: "user@example.com"
 *     responses:
 *       200:
 *         description: Subscription status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscribed:
 *                       type: boolean
 *                       example: true
 *                     status:
 *                       type: string
 *                       enum: [not_subscribed, pending_confirmation, subscribed, unsubscribed]
 *                       example: "subscribed"
 *                     topics:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["Company Updates"]
 *                     confirmedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00.000Z"
 *                     unsubscribedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       400:
 *         description: Email parameter is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/status", newsletterSubscriptionController.getSubscriptionStatus);

export default router;

