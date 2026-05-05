// @ts-nocheck
import express from "express";
import multer from "multer";
import { newsletterController } from "../controllers/NewsletterController";
import { authenticate, authorize } from "../middleware/authenticate";

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

/** Multipart fields: `title`, `content` (text), optional `image` OR `coverImage` (binary). */
const newsletterFormUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "coverImage", maxCount: 1 }
]);

function newsletterMultipartMw(req: express.Request, res: express.Response, next: express.NextFunction) {
  return newsletterFormUpload(req, res, (err: unknown) => {
    if (err) {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Multipart upload failed";
      return res.status(400).json({ success: false, message });
    }
    next();
  });
}

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /newsletters:
 *   post:
 *     summary: Create a new newsletter
 *     description: |
 *       **`multipart/form-data` only.** Fields: **`title`** (string), **`content`** (string; HTML or plain text),
 *       optional **`image`** or **`coverImage`** (binary, one cover photo).
 *
 *       The server saves the cover under `/api/uploads/newsletters/` and returns the full **`imageUrl`**
 *       on **`data`** (use this in the UI). Omit `multipart` file fields if there is no cover image.
 *
 *       Notifies internal staff (in-app) and queues promotional emails (background); see `distribution.emailDispatch`.
 *     tags: [Newsletters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 description: Newsletter title
 *                 example: "Monthly Company Update"
 *               content:
 *                 type: string
 *                 description: Newsletter body (HTML from rich editor, or plain text)
 *                 example: "<p>This month we achieved great milestones...</p>"
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Optional cover image (field name **`image`**)
 *               coverImage:
 *                 type: string
 *                 format: binary
 *                 description: Same as **`image`** — use whichever your client prefers (only one needed)
 *     responses:
 *       201:
 *         description: Newsletter created successfully; **`data.imageUrl`** is the public URL of the uploaded cover when a file was sent
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
 *                   example: Newsletter created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Newsletter'
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
router.post("/", newsletterMultipartMw, newsletterController.createNewsletter);

/**
 * @swagger
 * /newsletters/recipients/config:
 *   get:
 *     summary: Get newsletter audience config
 *     description: Returns default eligible internal users (non-investee, non-LP, non-applicant) plus saved include/exclude overrides.
 *     tags: [Newsletters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Newsletter audience config loaded
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
router.get("/recipients/config", authorize(["admin"]), newsletterController.getRecipientConfig);

/**
 * @swagger
 * /newsletters/recipients/config:
 *   put:
 *     summary: Save newsletter audience config
 *     description: Save include/exclude user IDs and extra include/exclude email addresses for newsletter delivery.
 *     tags: [Newsletters]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               includeUserIds:
 *                 type: array
 *                 items: { type: string }
 *               excludeUserIds:
 *                 type: array
 *                 items: { type: string }
 *               includeEmails:
 *                 type: array
 *                 items: { type: string, format: email }
 *               excludeEmails:
 *                 type: array
 *                 items: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Newsletter audience config saved
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin only
 */
router.put("/recipients/config", authorize(["admin"]), newsletterController.saveRecipientConfig);

/**
 * @swagger
 * /newsletters:
 *   get:
 *     summary: Get all active newsletters
 *     description: Retrieve all active newsletters ordered by creation date
 *     tags: [Newsletters]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Newsletters retrieved successfully
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
 *                     $ref: '#/components/schemas/Newsletter'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", newsletterController.getAllNewsletters);

/**
 * @swagger
 * /newsletters/{id}:
 *   get:
 *     summary: Get newsletter by ID
 *     description: Retrieve a specific newsletter by ID
 *     tags: [Newsletters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Newsletter ID
 *         example: clx1234567890abcdef
 *     responses:
 *       200:
 *         description: Newsletter retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Newsletter'
 *       404:
 *         description: Newsletter not found
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
router.get("/:id", newsletterController.getNewsletterById);

/**
 * @swagger
 * /newsletters/{id}:
 *   put:
 *     summary: Update a newsletter
 *     description: Update a newsletter (author only)
 *     tags: [Newsletters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Newsletter ID
 *         example: clx1234567890abcdef
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *                 description: Newsletter title
 *                 example: "Updated Monthly Company Update"
 *               content:
 *                 type: string
 *                 description: Newsletter content
 *                 example: "This month we achieved great milestones..."
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Optional new cover (**`image`**)
 *               coverImage:
 *                 type: string
 *                 format: binary
 *                 description: Optional new cover (alias of **`image`**)
 *     responses:
 *       200:
 *         description: Newsletter updated successfully — **`data.imageUrl`** refreshed when a new file is uploaded
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
 *                   example: Newsletter updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Newsletter'
 *       400:
 *         description: Bad request - validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - can only edit your own newsletters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Newsletter not found
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
router.put("/:id", newsletterMultipartMw, newsletterController.updateNewsletter);

/**
 * @swagger
 * /newsletters/{id}:
 *   delete:
 *     summary: Delete a newsletter
 *     description: Delete a newsletter (author only)
 *     tags: [Newsletters]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Newsletter ID
 *         example: clx1234567890abcdef
 *     responses:
 *       200:
 *         description: Newsletter deleted successfully
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
 *                   example: Newsletter deleted successfully
 *       403:
 *         description: Forbidden - can only delete your own newsletters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Newsletter not found
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
router.delete("/:id", newsletterController.deleteNewsletter);

export default router; 