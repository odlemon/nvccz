// @ts-nocheck

import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission } from "../middleware/permissionAuth";
import { PerformanceVaultService, VaultError } from "../services/PerformanceVaultService";
import { PerformanceDocumentController } from "../controllers/PerformanceDocumentController";
import { isPerfAdmin } from "../services/PerformanceScope";
import { prisma } from "../utils/database";
import { perfActor, scoped, registerPlacement, documentWhere, documentVisible, documentWritable } from "../services/PerformanceScope";

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

// ---- vault workflow (versions, review, approval, retention)
const vrun = (fn) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(e instanceof VaultError ? e.statusCode : 500).json({ success: false, message: e?.message || "Error" });
  }
};
const isAdmin = (req: any) => isPerfAdmin(req.user);
// by audience and owner (PerformanceScope.documentVisible / documentWritable)
const docRule = (mode: "view" | "write") => scoped(async (req, a) => {
  const d = await prisma.performanceDocument.findUnique({ where: { id: String(req.params.id) }, select: { ownerId: true, uploadedById: true, departmentId: true, audience: true, status: true } });
  if (!d) return null;
  if (mode === "view") return documentVisible(a, d) ? null : "This document is outside what your role can see.";
  return documentWritable(a, d) ? null : "Your role cannot change this document.";
});
const docPlacement = registerPlacement("document");
router.get("/vault/meta", read, vrun(() => PerformanceVaultService.meta()));
router.get("/vault", read, vrun(async (req) => PerformanceVaultService.list(documentWhere(await perfActor(req.user)))));
router.post("/vault/authored", write, docPlacement, vrun((req) => PerformanceVaultService.createAuthored(req.body || {}, req.user)));
router.post("/vault/upload", write, performanceDocumentUpload.single("file"), docPlacement, vrun((req) => PerformanceVaultService.upload(req.file, req.body || {}, req.user)));
router.get("/vault/:id", read, docRule("view"), vrun((req) => PerformanceVaultService.get(req.params.id)));
router.get("/vault/:id/content", read, docRule("view"), vrun((req) => PerformanceVaultService.content(req.params.id, req.query.version ? Number(req.query.version) : undefined)));
router.put("/vault/:id", write, docRule("write"), docPlacement, vrun((req) => PerformanceVaultService.updateMeta(req.params.id, req.body || {}, req.user)));
router.post("/vault/:id/versions", write, docRule("write"), performanceDocumentUpload.single("file"), vrun((req) => PerformanceVaultService.addVersion(req.params.id, req.file, req.body || {}, req.user)));
router.post("/vault/:id/submit", write, docRule("write"), vrun((req) => PerformanceVaultService.transition(req.params.id, "in_review", req.body?.note, req.user, isAdmin(req))));
router.post("/vault/:id/approve", write, docRule("write"), vrun((req) => PerformanceVaultService.transition(req.params.id, "approved", req.body?.note, req.user, isAdmin(req))));
router.post("/vault/:id/reject", write, docRule("write"), vrun((req) => PerformanceVaultService.transition(req.params.id, "draft", req.body?.note, req.user, isAdmin(req))));
router.post("/vault/:id/archive", write, docRule("write"), vrun((req) => PerformanceVaultService.transition(req.params.id, "archived", req.body?.note, req.user, isAdmin(req))));
router.delete("/vault/:id", write, docRule("write"), vrun((req) => PerformanceVaultService.remove(req.params.id, req.user)));

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
router.get("/:id", read, docRule("view"), PerformanceDocumentController.getById);

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
router.post("/", write, performanceDocumentUpload.single("file"), docPlacement, PerformanceDocumentController.upload);

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
router.patch("/:id", write, docRule("write"), docPlacement, PerformanceDocumentController.update);

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
router.delete("/:id", write, docRule("write"), PerformanceDocumentController.remove);

export default router;
