//@ts-nocheck
import express from "express";
import { AccountingDocumentController } from "../controllers/AccountingDocumentController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";
import multer from "multer";

// Who may use these routes is decided by the Accounting access guard in front of every accounting router
// (src/middleware/accountingAccessGuard.ts); the role-name lists that stood here refused the Finance Manager and auditors.
const router = express.Router();

const accountingDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/**
 * @swagger
 * /accounting/documents:
 *   get:
 *     summary: List all accounting document vault documents
 *     tags: [Accounting Document Vault]
 *     security:
 *       - bearerAuth: []
 *   post:
 *     summary: Upload a document to the accounting document vault
 *     tags: [Accounting Document Vault]
 *     security:
 *       - bearerAuth: []
 */
router.get("/", authenticate, AccountingDocumentController.list);
router.post(
  "/",
  authenticate,
  accountingDocumentUpload.single("file"),
  AccountingDocumentController.upload
);

export default router;
