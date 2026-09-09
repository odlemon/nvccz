// @ts-nocheck

import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";
import { PerformanceDocumentController } from "../controllers/PerformanceDocumentController";

const router = express.Router();

// Mirrors the accounting document vault multer config (memory storage, 50 MB cap).
const performanceDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Every route in the Performance Document Vault requires a valid bearer token.
router.use(authenticate);
/**
 * Permission guards.
 *
 * Before these, every route below was `authenticate`-only: any logged-in user of any portal
 * — an LP, an applicant, an investee — could list, create, edit and delete records in this
 * register. `read` is granted to every internal staff role and `write` to manager/exec roles
 * by `scripts/run-performance-role-permissions-migration.ts`; external roles get neither, so
 * they now receive 403 rather than 200.
 *
 * `admin` retains access through its existing wildcard permission set.
 */
const read = requireAnyPermission(["performance.documents.view", "performance.documents.manage"]);
const write = requireAnyPermission(["performance.documents.manage"]);


/**
 * @swagger
 * components:
 *   schemas:
 *     PerformanceDocument:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *           example: FY25 CEO Performance Contract.pdf
 *         folder:
 *           type: string
 *           example: Contracts
 *         category:
 *           type: string
 *           nullable: true
 *         version:
 *           type: string
 *           example: v1
 *         status:
 *           type: string
 *           enum: [draft, in_review, approved, archived]
 *         fileUrl:
 *           type: string
 *         storagePath:
 *           type: string
 *           nullable: true
 *         mimeType:
 *           type: string
 *           nullable: true
 *         fileSizeBytes:
 *           type: integer
 *           nullable: true
 *         ownerId:
 *           type: string
 *           nullable: true
 *         departmentId:
 *           type: string
 *           nullable: true
 *         retentionUntil:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         uploadedById:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     PerformanceDocumentFolders:
 *       type: object
 *       properties:
 *         folders:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               folder:
 *                 type: string
 *                 example: Contracts
 *               count:
 *                 type: integer
 *                 example: 12
 *         totalDocuments:
 *           type: integer
 */

/**
 * @swagger
 * /performance/documents:
 *   get:
 *     summary: List performance document vault documents
 *     tags: [Performance Document Vault]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: folder
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, in_review, approved, archived] }
 *       - in: query
 *         name: ownerId
 *         schema: { type: string }
 *       - in: query
 *         name: departmentId
 *         schema: { type: string }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive substring match on the document name
 *     responses:
 *       200:
 *         description: Documents retrieved
 */
router.get("/", read, PerformanceDocumentController.list);

/**
 * @swagger
 * /performance/documents/folders:
 *   get:
 *     summary: Distinct vault folders with live document counts
 *     tags: [Performance Document Vault]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Folders retrieved
 */
router.get("/folders", read, PerformanceDocumentController.folders);

/**
 * @swagger
 * /performance/documents/{id}:
 *   get:
 *     summary: Get a single performance document
 *     tags: [Performance Document Vault]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Document retrieved
 *       404:
 *         description: Performance document not found
 */
router.get("/:id", read, PerformanceDocumentController.getById);

/**
 * @swagger
 * /performance/documents:
 *   post:
 *     summary: Upload a document to the performance document vault
 *     tags: [Performance Document Vault]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               name:
 *                 type: string
 *                 description: Defaults to the uploaded file name
 *               folder:
 *                 type: string
 *                 example: Contracts
 *               category:
 *                 type: string
 *               version:
 *                 type: string
 *                 example: v1
 *               status:
 *                 type: string
 *                 enum: [draft, in_review, approved, archived]
 *               ownerId:
 *                 type: string
 *               departmentId:
 *                 type: string
 *               retentionUntil:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Document uploaded
 *       400:
 *         description: No file uploaded or invalid metadata
 */
router.post("/", write, performanceDocumentUpload.single("file"), PerformanceDocumentController.upload);

/**
 * @swagger
 * /performance/documents/{id}:
 *   patch:
 *     summary: Update performance document metadata (folder, version, status, owner, retention)
 *     tags: [Performance Document Vault]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Document updated
 *       404:
 *         description: Performance document not found
 */
router.patch("/:id", write, PerformanceDocumentController.update);

/**
 * @swagger
 * /performance/documents/{id}:
 *   delete:
 *     summary: Delete a performance document vault record
 *     tags: [Performance Document Vault]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Document deleted
 *       404:
 *         description: Performance document not found
 */
router.delete("/:id", write, PerformanceDocumentController.remove);

export default router;
