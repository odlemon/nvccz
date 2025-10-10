// @ts-nocheck
import express from 'express';
import { CreditNoteController } from '../controllers/CreditNoteController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Credit Note Management
router.post('/', CreditNoteController.createCreditNote);
router.get('/', CreditNoteController.getCreditNotes);

// Reports (must come before /:id routes)
router.get('/report', CreditNoteController.generateCreditNoteReport);

// Dashboard
router.get('/dashboard/credit-note-dashboard', CreditNoteController.getCreditNoteDashboard);

// Customer Credit Notes
router.get('/customer/:customerId', CreditNoteController.getCustomerCreditNotes);

// Credit Note Operations
router.post('/:id/send', CreditNoteController.sendCreditNote);
router.post('/:id/apply', CreditNoteController.applyCreditNote);

// Credit Note Management (specific ID routes - must come last)
router.get('/:id', CreditNoteController.getCreditNote);
router.put('/:id', CreditNoteController.updateCreditNote);
router.delete('/:id', CreditNoteController.deleteCreditNote);

export default router;
