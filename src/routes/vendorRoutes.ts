// @ts-nocheck
import express from "express";
import multer from "multer";
import { VendorController } from "../controllers/VendorController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

const uploadKyc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /accounting/vendors/for-rfq:
 *   get:
 *     summary: RFQ picker — eligible vendors (Suite 01)
 *     description: Returns active vendors for invite-to-quote; blacklisted / ineligible vendors excluded.
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Optional name filter
 *     responses:
 *       200:
 *         description: OK
 */
router.get("/for-rfq", VendorController.listVendorsForRfq);

/**
 * @swagger
 * /accounting/vendors/pending-review:
 *   get:
 *     summary: Vendors pending staff review (self-registration queue)
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 */
router.get("/pending-review", VendorController.listPendingReviewVendors);

/**
 * @swagger
 * /accounting/vendors/kyc-documents/{documentId}/download:
 *   get:
 *     summary: Download KYC artifact (staff)
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File stream
 */
router.get("/kyc-documents/:documentId/download", VendorController.downloadVendorKyc);

/**
 * @swagger
 * /accounting/vendors/{id}/approve-registration:
 *   put:
 *     summary: Approve vendor self-registration (activates vendor)
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
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
 *         description: OK
 */
router.put("/:id/approve-registration", VendorController.approveVendorRegistration);

/**
 * @swagger
 * /accounting/vendors/{id}/blacklist:
 *   post:
 *     summary: Blacklist vendor (excluded from RFQ picker)
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               blacklistReason:
 *                 type: string
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: OK
 */
router.post("/:id/blacklist", VendorController.blacklistVendor);

/**
 * @swagger
 * /accounting/vendors/{id}/unblacklist:
 *   post:
 *     summary: Remove vendor from blacklist
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
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
 *         description: OK
 */
router.post("/:id/unblacklist", VendorController.unblacklistVendor);

/**
 * @swagger
 * /accounting/vendors/{id}/banks:
 *   post:
 *     summary: Add vendor bank account (branch, SWIFT, currency required for payment readiness)
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Created
 *   get:
 *     summary: List vendor bank accounts
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
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
 *         description: OK
 */
router.post("/:id/banks", VendorController.createVendorBank);
router.get("/:id/banks", VendorController.listVendorBanks);

/**
 * @swagger
 * /accounting/vendors/{id}/banks/{bankId}:
 *   put:
 *     summary: Update vendor bank (IBAN/account changes audited)
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: bankId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: OK
 */
router.put("/:id/banks/:bankId", VendorController.updateVendorBank);

/**
 * @swagger
 * /accounting/vendors/{id}/kyc-documents:
 *   post:
 *     summary: Staff upload KYC document for vendor (on behalf of vendor)
 *     description: |
 *       Authenticated staff uploads one file to the same remote store as portal self-registration.
 *       Response `data` is a single KYC row with absolute `fileUrl` (public-media). Staff may still use
 *       `GET /accounting/vendors/kyc-documents/:documentId/download` for attachment download when needed.
 *       Use multipart field `documentType` (CR14, BANK_LETTER, CERTIFICATE_OF_INCORPORATION, ITF263, OTHER) plus `file`.
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - documentType
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               documentType:
 *                 type: string
 *                 description: KYC slot code
 *                 example: CR14
 *     responses:
 *       201:
 *         description: Created — `data` includes absolute `fileUrl`, `documentType`, verification fields, etc.
 *   get:
 *     summary: List KYC documents for vendor
 *     description: Each item matches POST response shape (absolute `fileUrl` only; no separate storage path fields).
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
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
 *         description: OK
 */
router.post("/:id/kyc-documents", uploadKyc.single("file"), VendorController.uploadVendorKyc);
router.get("/:id/kyc-documents", VendorController.listVendorKyc);

/**
 * @swagger
 * /accounting/vendors:
 *   post:
 *     summary: Create a new vendor
 *     description: Create a new vendor for expense tracking
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Vendor name
 *                 example: "Legal Associates"
 *               taxNumber:
 *                 type: string
 *                 description: Vendor tax number
 *                 example: "123456789"
 *               contactPerson:
 *                 type: string
 *                 description: Contact person name
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 description: Vendor email
 *                 example: "contact@legalassociates.com"
 *               phone:
 *                 type: string
 *                 description: Vendor phone number
 *                 example: "+263 77 123 4567"
 *               address:
 *                 type: string
 *                 description: Vendor address
 *                 example: "123 Main Street, Harare"
 *               paymentTerms:
 *                 type: string
 *                 description: Payment terms
 *                 example: "Net 30"
 *     responses:
 *       201:
 *         description: Vendor created successfully
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
 *                   example: Vendor created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Vendor'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/", VendorController.createVendor);

/**
 * @swagger
 * /accounting/vendors:
 *   get:
 *     summary: Get all vendors
 *     description: Retrieve all vendors with optional filters
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search vendors by name, contact person, or email
 *     responses:
 *       200:
 *         description: Vendors retrieved successfully
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
 *                     $ref: '#/components/schemas/Vendor'
 *       401:
 *         description: Unauthorized
 */
router.get("/", VendorController.getVendors);

/**
 * @swagger
 * /accounting/vendors/{id}:
 *   get:
 *     summary: Get vendor by ID
 *     description: Retrieve a specific vendor by ID with recent expenses
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Vendor retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Vendor'
 *       404:
 *         description: Vendor not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", VendorController.getVendorById);

/**
 * @swagger
 * /accounting/vendors/{id}:
 *   put:
 *     summary: Update vendor
 *     description: Update a vendor
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Vendor name
 *               taxNumber:
 *                 type: string
 *                 description: Vendor tax number
 *               contactPerson:
 *                 type: string
 *                 description: Contact person name
 *               email:
 *                 type: string
 *                 description: Vendor email
 *               phone:
 *                 type: string
 *                 description: Vendor phone number
 *               address:
 *                 type: string
 *                 description: Vendor address
 *               paymentTerms:
 *                 type: string
 *                 description: Payment terms
 *               isActive:
 *                 type: boolean
 *                 description: Whether vendor is active
 *     responses:
 *       200:
 *         description: Vendor updated successfully
 *       404:
 *         description: Vendor not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", VendorController.updateVendor);

/**
 * @swagger
 * /accounting/vendors/{id}:
 *   delete:
 *     summary: Delete vendor
 *     description: Soft delete a vendor (sets isActive to false)
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Vendor deleted successfully
 *       404:
 *         description: Vendor not found
 *       400:
 *         description: Cannot delete vendor with associated expenses
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", VendorController.deleteVendor);

/**
 * @swagger
 * /accounting/vendors/{id}/expenses:
 *   get:
 *     summary: Get vendor expenses
 *     description: Retrieve expenses for a specific vendor
 *     tags: [Vendor Master, Compliance & KYC (Suite 01), Accounting - Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Vendor expenses retrieved successfully
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
 *                     expenses:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Expense'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       404:
 *         description: Vendor not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id/expenses", VendorController.getVendorExpenses);

export default router; 