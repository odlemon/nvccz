// @ts-nocheck
import express from "express";
import multer from "multer";
import { newsletterController } from "../controllers/NewsletterController";
import { authenticate } from "../middleware/authenticate";

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

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /newsletters:
 *   post:
 *     summary: Create a new newsletter
 *     description: Create a company newsletter, notify internal staff (in-app), and email users who can access the platform — excludes investees (portfolio company users), Limited Partners, and applicant-role users. Response includes `distribution` counts.
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
 *                 description: Newsletter content
 *                 example: "This month we achieved great milestones..."
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Newsletter image (optional)
 *     responses:
 *       201:
 *         description: Newsletter created successfully
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
router.post("/", upload.single('image'), newsletterController.createNewsletter);

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
 *                 description: Newsletter image (optional)
 *     responses:
 *       200:
 *         description: Newsletter updated successfully
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
router.put("/:id", upload.single('image'), newsletterController.updateNewsletter);

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