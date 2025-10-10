// @ts-nocheck
import express from 'express';
import { CreditNoteController } from '../controllers/CreditNoteController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Credit Notes
 *   description: Credit note management endpoints
 */

/**
 * @swagger
 * /accounting/credit-notes:
 *   post:
 *     summary: Create a new credit note
 *     tags: [Credit Notes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - invoiceId
 *               - amount
 *               - reason
 *             properties:
 *               invoiceId:
 *                 type: string
 *               amount:
 *                 type: number
 *               reason:
 *                 type: string
 *               description:
 *                 type: string
 *               creditNoteDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Credit note created successfully
 *       401:
 *         description: Unauthorized
 */
router.post('/', CreditNoteController.createCreditNote);

/**
 * @swagger
 * /accounting/credit-notes:
 *   get:
 *     summary: Get all credit notes
 *     tags: [Credit Notes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of credit notes
 *       401:
 *         description: Unauthorized
 */
router.get('/', CreditNoteController.getCreditNotes);

/**
 * @swagger
 * /accounting/credit-notes/report:
 *   get:
 *     summary: Generate credit note report
 *     tags: [Credit Notes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Credit note report generated
 *       401:
 *         description: Unauthorized
 */
router.get('/report', CreditNoteController.generateCreditNoteReport);

/**
 * @swagger
 * /accounting/credit-notes/dashboard:
 *   get:
 *     summary: Get credit note dashboard
 *     tags: [Credit Notes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Credit note dashboard data
 *       401:
 *         description: Unauthorized
 */
router.get('/dashboard/credit-note-dashboard', CreditNoteController.getCreditNoteDashboard);

/**
 * @swagger
 * /accounting/credit-notes/customer/{customerId}:
 *   get:
 *     summary: Get credit notes for a customer
 *     tags: [Credit Notes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Customer credit notes
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Unauthorized
 */
router.get('/customer/:customerId', CreditNoteController.getCustomerCreditNotes);

/**
 * @swagger
 * /accounting/credit-notes/{id}/send:
 *   post:
 *     summary: Send credit note to customer
 *     tags: [Credit Notes]
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
 *         description: Credit note sent successfully
 *       404:
 *         description: Credit note not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/send', CreditNoteController.sendCreditNote);

/**
 * @swagger
 * /accounting/credit-notes/{id}/apply:
 *   post:
 *     summary: Apply credit note to invoice
 *     tags: [Credit Notes]
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
 *             required:
 *               - invoiceId
 *               - amount
 *             properties:
 *               invoiceId:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Credit note applied successfully
 *       404:
 *         description: Credit note or invoice not found
 *       401:
 *         description: Unauthorized
 */
router.post('/:id/apply', CreditNoteController.applyCreditNote);

/**
 * @swagger
 * /accounting/credit-notes/{id}:
 *   get:
 *     summary: Get credit note by ID
 *     tags: [Credit Notes]
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
 *         description: Credit note details
 *       404:
 *         description: Credit note not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', CreditNoteController.getCreditNote);

/**
 * @swagger
 * /accounting/credit-notes/{id}:
 *   put:
 *     summary: Update credit note
 *     tags: [Credit Notes]
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
 *             properties:
 *               amount:
 *                 type: number
 *               reason:
 *                 type: string
 *               description:
 *                 type: string
 *               creditNoteDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Credit note updated successfully
 *       404:
 *         description: Credit note not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', CreditNoteController.updateCreditNote);

/**
 * @swagger
 * /accounting/credit-notes/{id}:
 *   delete:
 *     summary: Delete credit note
 *     tags: [Credit Notes]
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
 *         description: Credit note deleted successfully
 *       404:
 *         description: Credit note not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', CreditNoteController.deleteCreditNote);

export default router;
