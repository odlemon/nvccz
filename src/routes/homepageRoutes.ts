// @ts-nocheck
import express from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { homepageController } from "../controllers/HomepageController";
import { homeWallpaperController } from "../controllers/HomeWallpaperController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Same shape as newsletterRoutes.ts's image upload config (memoryStorage, image-only
// fileFilter) — 8MB per file, up to 6 at once, matching the frontend's own picker limits.
const wallpaperUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// Rate limiting for homepage endpoints
const homepageRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /homepage:
 *   get:
 *     summary: Get homepage data
 *     description: Retrieve all homepage data including posts, newsletters, events (upcoming and all), and online users with cursor pagination
 *     tags: [Homepage]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Number of items to return per page
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: Cursor for pagination (base64 encoded timestamp)
 *       - in: query
 *         name: postsLimit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 50
 *         description: Number of posts to return
 *       - in: query
 *         name: newslettersLimit
 *         schema:
 *           type: integer
 *           default: 5
 *           minimum: 1
 *           maximum: 20
 *         description: Number of newsletters to return
 *       - in: query
 *         name: eventsLimit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 50
 *         description: Number of events to return
 *     responses:
 *       200:
 *         description: Homepage data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HomepageData'
 *       400:
 *         description: Invalid pagination parameters
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
 *       429:
 *         description: Too many requests
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", homepageRateLimit, homepageController.getHomepageData);

/**
 * @swagger
 * /homepage/online-activity:
 *   get:
 *     summary: Get online activity
 *     description: Retrieve online activity for all users with last seen times
 *     tags: [Homepage]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Online activity retrieved successfully
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: clx1234567890abcdef
 *                       firstName:
 *                         type: string
 *                         example: John
 *                       lastName:
 *                         type: string
 *                         example: Doe
 *                       email:
 *                         type: string
 *                         example: john@example.com
 *                       lastSeen:
 *                         type: string
 *                         format: date-time
 *                       isOnline:
 *                         type: boolean
 *                         example: true
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/online-activity", homepageController.getOnlineActivity);

/**
 * @swagger
 * /homepage/notifications:
 *   get:
 *     summary: Get user notifications
 *     description: Retrieve user's notifications with pagination and unread count
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of notifications to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of notifications to skip
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/notifications", homepageController.getUserNotifications);

/**
 * @swagger
 * /homepage/notifications/{id}/read:
 *   put:
 *     summary: Mark notification as read
 *     description: Mark a specific notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Notification ID
 *         example: clx1234567890abcdef
 *     responses:
 *       200:
 *         description: Notification marked as read
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
 *                   example: Notification marked as read
 *       404:
 *         description: Notification not found
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
router.put("/notifications/:id/read", homepageController.markNotificationAsRead);

/**
 * @swagger
 * /homepage/notifications/read-all:
 *   put:
 *     summary: Mark all notifications as read
 *     description: Mark all user's unread notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
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
 *                   example: All notifications marked as read
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/notifications/read-all", homepageController.markAllNotificationsAsRead);

/**
 * @swagger
 * /homepage/notifications/debug:
 *   get:
 *     summary: Get all notifications (Admin only)
 *     description: Debug endpoint to view all notifications in the database (Admin only)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications retrieved successfully
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
 *                     notifications:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Notification'
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           example: 25
 *                         unread:
 *                           type: number
 *                           example: 12
 *       403:
 *         description: Forbidden - Admin access required
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
router.get("/notifications/debug", homepageController.getAllNotificationsDebug);

/**
 * @swagger
 * /homepage/preferences:
 *   get:
 *     summary: Get the signed-in user's home-hub preferences
 *     description: Daily Cover theme/wallpaper, defaulting to Porcelain/auto if never set.
 *     tags: [Homepage]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences retrieved successfully
 *   put:
 *     summary: Update the signed-in user's home-hub preferences
 *     tags: [Homepage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               coverTheme:
 *                 type: string
 *               coverWallpaper:
 *                 type: string
 *               rotationIntervalMinutes:
 *                 type: integer
 *                 description: Only meaningful when coverWallpaper is "auto"
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *       400:
 *         description: None of coverTheme, coverWallpaper or rotationIntervalMinutes was provided
 */
router.get("/preferences", homepageController.getMyHomePreference);
router.put("/preferences", homepageController.updateMyHomePreference);

/**
 * @swagger
 * /homepage/wallpapers:
 *   get:
 *     summary: List the signed-in user's own uploaded Daily Cover wallpapers
 *     tags: [Homepage]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wallpapers retrieved successfully
 *   post:
 *     summary: Upload one or more Daily Cover wallpaper images (max 6 per request, 8MB each)
 *     tags: [Homepage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Wallpaper(s) uploaded successfully
 *       400:
 *         description: No images provided, or the per-user wallpaper limit would be exceeded
 * /homepage/wallpapers/{id}:
 *   delete:
 *     summary: Remove one of the signed-in user's uploaded wallpapers
 *     tags: [Homepage]
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
 *         description: Wallpaper removed
 *       404:
 *         description: Wallpaper not found (or not owned by the signed-in user)
 */
router.get("/wallpapers", homeWallpaperController.listMine);
router.post("/wallpapers", wallpaperUpload.array("images", 6), homeWallpaperController.upload);
router.delete("/wallpapers/:id", homeWallpaperController.remove);

export default router;