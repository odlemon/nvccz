// @ts-nocheck
import { Request, Response } from 'express';
import { CreditNoteService } from '../services/CreditNoteService';
import { PrismaClient } from '@prisma/client';

import { dbConnection } from '../utils/database';
const prisma = dbConnection.getPrismaClient();

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export class CreditNoteController {
  /**
   * Create a new credit note
   */
  static async createCreditNote(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        customerId,
        invoiceId,
        amount,
        vatAmount,
        totalAmount,
        currencyId,
        reason
      } = req.body;

      // Validation
      if (!amount || !totalAmount) {
        res.status(400).json({
          error: 'Missing required fields: amount, totalAmount'
        });
        return;
      }

      const creditNote = await CreditNoteService.createCreditNote({
        customerId,
        invoiceId,
        amount: parseFloat(amount),
        vatAmount: parseFloat(vatAmount || 0),
        totalAmount: parseFloat(totalAmount),
        currencyId,
        reason,
        createdById: userId
      });

      res.status(201).json({
        success: true,
        message: 'Credit note created successfully',
        data: creditNote
      });
    } catch (error: any) {
      console.error('Error creating credit note:', error);
      res.status(500).json({
        error: 'Failed to create credit note',
        details: error.message
      });
    }
  }

  /**
   * Get credit notes with filtering
   */
  static async getCreditNotes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        customerId,
        status,
        isActive,
        page = 1,
        limit = 10
      } = req.query;

      const result = await CreditNoteService.getCreditNotes({
        customerId: customerId as string,
        status: status as string,
        isActive: isActive ? isActive === 'true' : undefined,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting credit notes:', error);
      res.status(500).json({
        error: 'Failed to get credit notes',
        details: error.message
      });
    }
  }

  /**
   * Get single credit note
   */
  static async getCreditNote(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const creditNote = await CreditNoteService.getCreditNote(id);

      res.json({
        success: true,
        data: creditNote
      });
    } catch (error: any) {
      console.error('Error getting credit note:', error);
      res.status(500).json({
        error: 'Failed to get credit note',
        details: error.message
      });
    }
  }

  /**
   * Update credit note
   */
  static async updateCreditNote(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      const updates = req.body;

      const updatedCreditNote = await CreditNoteService.updateCreditNote(id, updates, userId);

      res.json({
        success: true,
        message: 'Credit note updated successfully',
        data: updatedCreditNote
      });
    } catch (error: any) {
      console.error('Error updating credit note:', error);
      res.status(500).json({
        error: 'Failed to update credit note',
        details: error.message
      });
    }
  }

  /**
   * Send credit note
   */
  static async sendCreditNote(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;

      const creditNote = await CreditNoteService.sendCreditNote(id, userId);

      res.json({
        success: true,
        message: 'Credit note sent successfully',
        data: creditNote
      });
    } catch (error: any) {
      console.error('Error sending credit note:', error);
      res.status(500).json({
        error: 'Failed to send credit note',
        details: error.message
      });
    }
  }

  /**
   * Apply credit note to invoice
   */
  static async applyCreditNote(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      const { invoiceId, amount } = req.body;

      // Validation
      if (!invoiceId || !amount) {
        res.status(400).json({
          error: 'Missing required fields: invoiceId, amount'
        });
        return;
      }

      await CreditNoteService.applyCreditNote({
        creditNoteId: id,
        invoiceId,
        amount: parseFloat(amount),
        appliedById: userId
      });

      res.json({
        success: true,
        message: 'Credit note applied successfully'
      });
    } catch (error: any) {
      console.error('Error applying credit note:', error);
      res.status(500).json({
        error: 'Failed to apply credit note',
        details: error.message
      });
    }
  }

  /**
   * Delete credit note (soft delete)
   */
  static async deleteCreditNote(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;

      await CreditNoteService.deleteCreditNote(id, userId);

      res.json({
        success: true,
        message: 'Credit note deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting credit note:', error);
      res.status(500).json({
        error: 'Failed to delete credit note',
        details: error.message
      });
    }
  }

  /**
   * Get credit notes for a customer
   */
  static async getCustomerCreditNotes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { customerId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const result = await CreditNoteService.getCreditNotes({
        customerId,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting customer credit notes:', error);
      res.status(500).json({
        error: 'Failed to get customer credit notes',
        details: error.message
      });
    }
  }

  /**
   * Get credit note dashboard data
   */
  static async getCreditNoteDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const [
        totalCreditNotes,
        draftCreditNotes,
        sentCreditNotes,
        appliedCreditNotes,
        totalAmount,
        appliedAmount,
        remainingAmount,
        recentCreditNotes
      ] = await Promise.all([
        prisma.creditNote.count({ where: { isActive: true } }),
        prisma.creditNote.count({ where: { status: 'DRAFT', isActive: true } }),
        prisma.creditNote.count({ where: { status: 'SENT', isActive: true } }),
        prisma.creditNote.count({ where: { status: 'APPLIED', isActive: true } }),
        prisma.creditNote.aggregate({
          where: { isActive: true },
          _sum: { totalAmount: true }
        }),
        prisma.creditNote.aggregate({
          where: { isActive: true },
          _sum: { appliedAmount: true }
        }),
        prisma.creditNote.aggregate({
          where: { isActive: true },
          _sum: { remainingAmount: true }
        }),
        prisma.creditNote.findMany({
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            customer: {
              select: {
                name: true,
                email: true
              }
            },
            currency: {
              select: {
                code: true,
                symbol: true
              }
            }
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          totalCreditNotes,
          draftCreditNotes,
          sentCreditNotes,
          appliedCreditNotes,
          totalAmount: Number(totalAmount._sum.totalAmount || 0),
          appliedAmount: Number(appliedAmount._sum.appliedAmount || 0),
          remainingAmount: Number(remainingAmount._sum.remainingAmount || 0),
          recentCreditNotes
        }
      });
    } catch (error: any) {
      console.error('Error getting credit note dashboard:', error);
      res.status(500).json({
        error: 'Failed to get credit note dashboard',
        details: error.message
      });
    }
  }

  /**
   * Generate credit note report
   */
  static async generateCreditNoteReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const report = await CreditNoteService.generateCreditNoteReport();

      res.json({
        success: true,
        data: report
      });
    } catch (error: any) {
      console.error('Error generating credit note report:', error);
      res.status(500).json({
        error: 'Failed to generate credit note report',
        details: error.message
      });
    }
  }
}
