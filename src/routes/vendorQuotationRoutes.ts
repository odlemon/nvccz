// @ts-nocheck
import express from "express";
import { VendorQuotationController } from "../controllers/VendorQuotationController";
import { authenticate } from "../middleware/authenticate";

import { requireInternalStaffUser } from "../middleware/permissionAuth";
const router = express.Router();

/**
 * @swagger
 * /vendor-quotations/submit:
 *   post:
 *     summary: Submit a vendor quotation (PUBLIC - no authentication required)
 *     description: **Required Role:** PUBLIC (Vendors) - No authentication needed. Vendors use this endpoint to submit their quotes in response to an RFQ.
 *     tags: [Procurement - Vendor Quotations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vendorPortalToken
 *               - vendorName
 *               - vendorEmail
 *               - items
 *             properties:
 *               vendorPortalToken:
 *                 type: string
 *                 description: >
 *                   Signed portal token from the RFQ invitation email (`token` query param).
 *                   Embeds vendor id and procurement RFQ id; server verifies HMAC and invitation.
 *               token:
 *                 type: string
 *                 description: Alias of `vendorPortalToken` (same value).
 *               rfqNumber:
 *                 type: string
 *                 description: Optional cross-check; must match the RFQ embedded in the token if supplied.
 *                 example: "RFQ_20260511_0001"
 *               requisitionId:
 *                 type: string
 *                 description: Requisition ID (optional)
 *               vendorName:
 *                 type: string
 *                 description: Vendor contact name
 *                 example: "John Doe"
 *               vendorEmail:
 *                 type: string
 *                 format: email
 *                 description: Vendor email address
 *                 example: "john@vendor.com"
 *               companyName:
 *                 type: string
 *                 description: Company name
 *                 example: "ABC Supplies Ltd"
 *               taxEIN:
 *                 type: string
 *                 description: Tax identification number (EIN/VAT)
 *                 example: "12-3456789"
 *               contactPerson:
 *                 type: string
 *                 description: Primary contact person
 *               phoneNumber:
 *                 type: string
 *                 description: Contact phone number
 *                 example: "+263771234567"
 *               address:
 *                 type: string
 *                 description: Company address
 *               validUntil:
 *                 type: string
 *                 format: date-time
 *                 description: Quote validity date
 *                 example: "2025-11-15T00:00:00Z"
 *               currencyCode:
 *                 type: string
 *                 description: Currency code (USD, ZWL, etc.)
 *                 default: "USD"
 *                 example: "USD"
 *               paymentTerms:
 *                 type: string
 *                 description: Payment terms
 *                 example: "NET 30"
 *               deliveryTerms:
 *                 type: string
 *                 description: Delivery terms
 *                 example: "FOB"
 *               deliveryTime:
 *                 type: string
 *                 description: Estimated delivery time
 *                 example: "3-5 business days"
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *               attachments:
 *                 type: object
 *                 description: Attachment URLs/paths (JSON)
 *               items:
 *                 type: array
 *                 description: Quoted items
 *                 items:
 *                   type: object
 *                   required:
 *                     - itemName
 *                     - quantity
 *                     - unitPrice
 *                   properties:
 *                     itemName:
 *                       type: string
 *                       example: "Office Desk"
 *                     description:
 *                       type: string
 *                       example: "Executive wooden desk, 1.6m x 0.8m"
 *                     quantity:
 *                       type: number
 *                       example: 10
 *                     unit:
 *                       type: string
 *                       example: "pieces"
 *                     unitPrice:
 *                       type: number
 *                       example: 250.00
 *                     specifications:
 *                       type: object
 *                       description: Technical specifications
 *                     brand:
 *                       type: string
 *                       example: "IKEA"
 *                     model:
 *                       type: string
 *                       example: "BEKANT"
 *                     warranty:
 *                       type: string
 *                       example: "2 years"
 *           example:
 *             vendorPortalToken: "<signed token from RFQ email link>"
 *             rfqNumber: "RFQ-1729012345-123"
 *             vendorName: "John Doe"
 *             vendorEmail: "john@abcsupplies.com"
 *             companyName: "ABC Supplies Ltd"
 *             taxEIN: "12-3456789"
 *             phoneNumber: "+263771234567"
 *             validUntil: "2025-11-15T00:00:00Z"
 *             currencyCode: "USD"
 *             paymentTerms: "NET 30"
 *             deliveryTime: "5 business days"
 *             items:
 *               - itemName: "Office Desk"
 *                 description: "Executive wooden desk"
 *                 quantity: 10
 *                 unit: "pieces"
 *                 unitPrice: 250.00
 *                 brand: "IKEA"
 *                 warranty: "2 years"
 *     responses:
 *       201:
 *         description: Quotation submitted successfully
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
 *                   example: "Quotation submitted successfully"
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request (validation error)
 */
router.post("/submit", VendorQuotationController.createVendorQuotation);

// All routes below require authentication
router.use(authenticate);
// Internal staff only. Every route below is staff procurement data or a staff action;
// `authenticate` alone let LP and investee portal accounts read vendor master data and
// create internal requisitions. Vendors never reach these: their flows use signed
// vendorPortalToken links on the public routes declared above this line.
router.use(requireInternalStaffUser());

/**
 * @swagger
 * /vendor-quotations:
 *   get:
 *     summary: Get all vendor quotations
 *     description: **Required Role:** PROC_MGR, PROC_OFF, or BUYER
 *     tags: [Procurement - Vendor Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [SUBMITTED, UNDER_REVIEW, ACCEPTED, REJECTED]
 *         description: Filter by status
 *       - in: query
 *         name: rfqNumber
 *         schema:
 *           type: string
 *         description: Filter by RFQ number
 *       - in: query
 *         name: vendorEmail
 *         schema:
 *           type: string
 *         description: Filter by vendor email
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: List of vendor quotations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 count:
 *                   type: number
 *       401:
 *         description: Unauthorized
 */
router.get("/", VendorQuotationController.getAllQuotations);

/**
 * @swagger
 * /vendor-quotations/rfq/{rfqNumber}:
 *   get:
 *     summary: Get all quotations for a specific RFQ
 *     description: **Required Role:** PROC_MGR, PROC_OFF, or BUYER
 *     tags: [Procurement - Vendor Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rfqNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: RFQ number
 *         example: "RFQ-1729012345-123"
 *     responses:
 *       200:
 *         description: List of quotations for the RFQ; `rfq` carries procurement row + itemsSnapshot when the RFQ exists (even if `data` is empty).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   description: Vendor quotations (empty until vendors submit)
 *                 rfq:
 *                   type: object
 *                   nullable: true
 *                   description: Procurement RFQ header including itemsSnapshot (null if RFQ row was deleted or number unknown)
 *                 count:
 *                   type: number
 */
router.get("/rfq/:rfqNumber", VendorQuotationController.getQuotationsByRFQ);

/**
 * @swagger
 * /vendor-quotations/{id}:
 *   get:
 *     summary: Get quotation by ID
 *     description: **Required Role:** PROC_MGR, PROC_OFF, or BUYER
 *     tags: [Procurement - Vendor Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quotation ID
 *     responses:
 *       200:
 *         description: Quotation details
 *       404:
 *         description: Quotation not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", VendorQuotationController.getQuotationById);

/**
 * @swagger
 * /vendor-quotations/{id}/accept:
 *   post:
 *     summary: Accept a vendor quotation
 *     description: |
 *       **Required Role:** PROC_MGR or PROC_OFF.
 *       Accepts the quotation, notifies the vendor, auto-rejects other bids on the same RFQ number,
 *       builds PO lines from the RFQ item snapshot (priced from the quote), creates the PO, and emails it to the vendor (PDF).
 *     tags: [Procurement - Vendor Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quotation ID
 *       - in: query
 *         name: reviewNotes
 *         schema:
 *           type: string
 *         description: Optional notes about the acceptance
 *     responses:
 *       200:
 *         description: Quotation accepted; purchase order may be included in data
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Quotation not found
 */
router.post("/:id/accept", VendorQuotationController.acceptQuotation);

/**
 * @swagger
 * /vendor-quotations/{id}/reject:
 *   post:
 *     summary: Reject a vendor quotation
 *     description: **Required Role:** PROC_MGR or PROC_OFF. Sets status **REJECTED**, persists `rejectionReason`, and stores `rejectionContentFingerprint` on the quotation row. Response `data` includes those fields.
 *     tags: [Procurement - Vendor Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quotation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rejectionReason
 *             properties:
 *               rejectionReason:
 *                 type: string
 *                 description: Reason for rejection
 *                 example: "Price too high"
 *               reviewNotes:
 *                 type: string
 *                 description: Additional notes
 *           example:
 *             rejectionReason: "Price exceeds budget"
 *             reviewNotes: "Thank you for your submission"
 *     responses:
 *       200:
 *         description: Quotation rejected successfully
 *       400:
 *         description: Bad request (missing rejection reason)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Quotation not found
 */
router.post("/:id/reject", VendorQuotationController.rejectQuotation);

/**
 * @swagger
 * /vendor-quotations/{id}:
 *   delete:
 *     summary: Delete a quotation
 *     description: **Required Role:** PROC_MGR or PROC_OFF. Delete a quotation (only if status is SUBMITTED - cannot delete if ACCEPTED or REJECTED)
 *     tags: [Procurement - Vendor Quotations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Quotation ID
 *     responses:
 *       200:
 *         description: Quotation deleted successfully
 *       400:
 *         description: Cannot delete reviewed quotation
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Quotation not found
 */
router.delete("/:id", VendorQuotationController.deleteQuotation);

export default router;






