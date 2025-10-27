// @ts-nocheck
import { PrismaClient, CreditNote } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../utils/database';
import { JournalEntryService } from './JournalEntryService';
import AuditService from './AuditService';

export interface CreateCreditNoteParams {
  customerId?: string;
  invoiceId?: string;
  amount: number;
  vatAmount?: number;
  totalAmount: number;
  currencyId?: string;
  reason?: string;
  createdById: string;
}

export interface ApplyCreditNoteParams {
  creditNoteId: string;
  invoiceId: string;
  amount: number;
  appliedById: string;
}

export interface CreditNoteWithRelations extends CreditNote {
  customer: {
    id: string;
    name: string;
    email?: string;
  };
  originalInvoice?: {
    id: string;
    invoiceNumber?: string;
    totalAmount: Decimal;
  };
  currency: {
    id: string;
    code: string;
    symbol: string;
  };
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export class CreditNoteService {
  /**
   * Create a new credit note
   */
  static async createCreditNote(params: CreateCreditNoteParams): Promise<CreditNoteWithRelations> {
    try {
      const {
        customerId,
        invoiceId,
        amount,
        vatAmount = 0,
        totalAmount,
        currencyId,
        reason,
        createdById
      } = params;

      // Validate original invoice and get customer/currency from it
      let finalCustomerId = customerId;
      let finalCurrencyId = currencyId;

      if (invoiceId) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          include: {
            customer: true,
            currency: true
          }
        });

        if (!invoice) {
          throw new Error('Original invoice not found');
        }

        // Use invoice's customer and currency if not provided
        finalCustomerId = customerId || invoice.customerId;
        finalCurrencyId = currencyId || invoice.currencyId;

        // Validate customer matches invoice customer if both provided
        if (customerId && invoice.customerId !== customerId) {
          throw new Error('Invoice does not belong to the specified customer');
        }
      } else {
        // If no invoice provided, customerId and currencyId are required
        if (!customerId) {
          throw new Error('Customer ID is required when no invoice is provided');
        }
        if (!currencyId) {
          throw new Error('Currency ID is required when no invoice is provided');
        }

        // Validate customer exists
        const customer = await prisma.customer.findUnique({
          where: { id: finalCustomerId }
        });

        if (!customer) {
          throw new Error('Customer not found');
        }
      }

      // Generate credit note number
      const creditNoteNumber = await this.generateCreditNoteNumber();

      // Wrap credit note and journal entry creation in a transaction
      // This ensures atomicity - either both succeed or both fail
      const creditNote = await prisma.$transaction(async (tx) => {
        // Create the credit note
        const newCreditNote = await tx.creditNote.create({
          data: {
            customerId: finalCustomerId,
            invoiceId,
            amount: new Decimal(amount),
            vatAmount: new Decimal(vatAmount),
            totalAmount: new Decimal(totalAmount),
            currencyId: finalCurrencyId,
            creditNoteNumber,
            reason,
            remainingAmount: new Decimal(totalAmount),
            createdById
          },
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            originalInvoice: {
              select: {
                id: true,
                invoiceNumber: true,
                totalAmount: true
              }
            },
            currency: {
              select: {
                id: true,
                code: true,
                symbol: true
              }
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        });

        // Create credit note journal entry within the same transaction
        await this.createCreditNoteJournalEntryInTransaction(tx, newCreditNote, createdById);

        return newCreditNote;
      });

      // Audit log (outside transaction as it's not critical)
      await AuditService.log({
        userId: createdById,
        action: 'CREATE',
        entityType: 'CreditNote',
        entityId: creditNote.id,
        newValues: creditNote,
      });

      return creditNote;
    } catch (error) {
      console.error('Error creating credit note:', error);
      throw error;
    }
  }

  /**
   * Generate unique credit note number
   */
  private static async generateCreditNoteNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `CN-${year}`;
    
    const lastCreditNote = await prisma.creditNote.findFirst({
      where: {
        creditNoteNumber: {
          startsWith: prefix
        }
      },
      orderBy: { creditNoteNumber: 'desc' }
    });

    let nextNumber = 1;
    if (lastCreditNote) {
      const lastNumber = parseInt(lastCreditNote.creditNoteNumber.split('-')[2]);
      nextNumber = lastNumber + 1;
    }

    return `${prefix}-${nextNumber.toString().padStart(4, '0')}`;
  }

  /**
   * Create credit note journal entry (legacy method - kept for backward compatibility)
   * @deprecated Use createCreditNoteJournalEntryInTransaction for new code
   */
  private static async createCreditNoteJournalEntry(creditNote: CreditNote, createdById: string): Promise<void> {
    try {
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: new Date(),
          referenceNumber: creditNote.creditNoteNumber,
          description: `Credit note: ${creditNote.creditNoteNumber}`,
          totalAmount: creditNote.totalAmount,
          currencyId: creditNote.currencyId,
          status: 'POSTED',
          createdById
        }
      });

      // Get accounts receivable account
      const accountsReceivableAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          accountName: { contains: 'Accounts Receivable' },
          isActive: true
        }
      });

      if (!accountsReceivableAccount) {
        throw new Error('Accounts Receivable account not found');
      }

      // Get sales/revenue account (use first available revenue account)
      const salesAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          accountType: 'Revenue',
          isActive: true
        }
      });

      if (!salesAccount) {
        throw new Error('Revenue account not found');
      }

      // Create journal entry lines
      // Dr Accounts Receivable (reduce receivable)
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: accountsReceivableAccount.id,
          debitAmount: new Decimal(0),
          creditAmount: creditNote.totalAmount,
          description: `Credit note: ${creditNote.creditNoteNumber}`,
          vatAmount: new Decimal(0)
        }
      });

      // Cr Sales (reduce sales)
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: salesAccount.id,
          debitAmount: creditNote.totalAmount,
          creditAmount: new Decimal(0),
          description: `Credit note: ${creditNote.creditNoteNumber}`,
          vatAmount: new Decimal(0)
        }
      });

      // Update credit note with journal entry reference
      await prisma.creditNote.update({
        where: { id: creditNote.id },
        data: { journalEntryId: journalEntry.id }
      });
    } catch (error) {
      console.error('Error creating credit note journal entry:', error);
      throw error;
    }
  }

  /**
   * Create credit note journal entry within a transaction
   * This ensures atomicity with the credit note creation
   */
  private static async createCreditNoteJournalEntryInTransaction(
    tx: any, 
    creditNote: CreditNote, 
    createdById: string
  ): Promise<void> {
    try {
      // Get accounts receivable account
      const accountsReceivableAccount = await tx.chartOfAccounts.findFirst({
        where: {
          accountName: { contains: 'Accounts Receivable' },
          isActive: true
        }
      });

      if (!accountsReceivableAccount) {
        throw new Error('Accounts Receivable account not found. Please ensure chart of accounts is properly configured.');
      }

      // Get sales/revenue account (use first available revenue account)
      const salesAccount = await tx.chartOfAccounts.findFirst({
        where: {
          accountType: 'Revenue',
          isActive: true
        }
      });

      if (!salesAccount) {
        throw new Error('Revenue account not found. Please ensure chart of accounts is properly configured.');
      }

      // Create journal entry
      const journalEntry = await tx.journalEntry.create({
        data: {
          transactionDate: new Date(),
          referenceNumber: creditNote.creditNoteNumber,
          description: `Credit note: ${creditNote.creditNoteNumber}`,
          totalAmount: creditNote.totalAmount,
          currencyId: creditNote.currencyId,
          status: 'POSTED',
          createdById
        }
      });

      // Create journal entry lines
      // Cr Accounts Receivable (reduce receivable)
      await tx.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: accountsReceivableAccount.id,
          debitAmount: new Decimal(0),
          creditAmount: creditNote.totalAmount,
          description: `Credit note: ${creditNote.creditNoteNumber}`,
          vatAmount: new Decimal(0)
        }
      });

      // Dr Sales/Revenue (reduce revenue)
      await tx.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: salesAccount.id,
          debitAmount: creditNote.totalAmount,
          creditAmount: new Decimal(0),
          description: `Credit note: ${creditNote.creditNoteNumber}`,
          vatAmount: new Decimal(0)
        }
      });

      // Update credit note with journal entry reference
      await tx.creditNote.update({
        where: { id: creditNote.id },
        data: { journalEntryId: journalEntry.id }
      });
    } catch (error) {
      console.error('Error creating credit note journal entry in transaction:', error);
      throw error;
    }
  }

  /**
   * Apply credit note to invoice
   */
  static async applyCreditNote(params: ApplyCreditNoteParams): Promise<void> {
    try {
      const { creditNoteId, invoiceId, amount, appliedById } = params;

      // Wrap in transaction for atomicity
      await prisma.$transaction(async (tx) => {
        // Get credit note
        const creditNote = await tx.creditNote.findUnique({
          where: { id: creditNoteId }
        });

        if (!creditNote) {
          throw new Error('Credit note not found');
        }

        if (creditNote.status !== 'SENT') {
          throw new Error('Only sent credit notes can be applied');
        }

        if (Number(creditNote.remainingAmount) < amount) {
          throw new Error('Insufficient credit note balance');
        }

        // Get invoice
        const invoice = await tx.invoice.findUnique({
          where: { id: invoiceId }
        });

        if (!invoice) {
          throw new Error('Invoice not found');
        }

        if (invoice.customerId !== creditNote.customerId) {
          throw new Error('Credit note and invoice must belong to the same customer');
        }

        // Calculate new amounts
        const newAppliedAmount = Number(creditNote.appliedAmount) + amount;
        const newRemainingAmount = Number(creditNote.remainingAmount) - amount;
        const newStatus = newRemainingAmount <= 0 ? 'APPLIED' : 'PARTIALLY_APPLIED';

        // Update credit note status
        await tx.creditNote.update({
          where: { id: creditNoteId },
          data: {
            appliedAmount: new Decimal(newAppliedAmount),
            remainingAmount: new Decimal(newRemainingAmount),
            status: newStatus
          }
        });

        // Update invoice to reduce outstanding amount
        const newInvoiceOutstanding = Number(invoice.outstandingAmount || invoice.totalAmount) - amount;
        const newInvoiceStatus = newInvoiceOutstanding <= 0 ? 'PAID' : 'PARTIALLY_PAID';

        await tx.invoice.update({
          where: { id: invoiceId },
          data: {
            outstandingAmount: new Decimal(Math.max(0, newInvoiceOutstanding)),
            status: newInvoiceStatus
          }
        });

        // Create credit note application record for tracking
        await tx.creditNoteApplication.create({
          data: {
            creditNoteId,
            invoiceId,
            amount: new Decimal(amount),
            appliedById,
            appliedAt: new Date()
          }
        }).catch(() => {
          // Ignore if table doesn't exist yet - this is for future tracking
          console.log('CreditNoteApplication table not available yet');
        });
      });

      // Audit log (outside transaction)
      await AuditService.log({
        userId: appliedById,
        action: 'APPLY',
        entityType: 'CreditNote',
        entityId: creditNoteId,
        newValues: {
          invoiceId,
          amount,
          action: 'Applied to invoice'
        },
      });
    } catch (error) {
      console.error('Error applying credit note:', error);
      throw error;
    }
  }

  /**
   * Create credit note application journal entry
   * @deprecated This method is deprecated and should not be used.
   * 
   * ACCOUNTING ISSUE: This method creates a meaningless journal entry that debits 
   * and credits the SAME account (Accounts Receivable), resulting in a net-zero effect.
   * 
   * WHY THIS IS WRONG:
   * - When a credit note is issued: Dr Revenue, Cr AR (already recorded)
   * - When an invoice is created: Dr AR, Cr Revenue (already recorded)
   * - Applying a credit note is just linking them together - NO journal entry needed
   * 
   * The new applyCreditNote method correctly updates statuses without creating
   * meaningless journal entries. This method is kept only for reference and should
   * NOT be called by any code.
   */
  private static async createCreditNoteApplicationJournalEntry(
    creditNote: CreditNote,
    invoice: any,
    amount: number,
    appliedById: string
  ): Promise<void> {
    console.warn('DEPRECATED: createCreditNoteApplicationJournalEntry should not be used. ' +
                 'Credit note application does not require a journal entry.');
    
    // This method intentionally does nothing now
    // The accounting for credit notes happens at:
    // 1. Credit note creation (Dr Revenue, Cr AR)
    // 2. Invoice creation (Dr AR, Cr Revenue)
    // Application is just status tracking, no additional journal entry needed
    
    return;
  }

  /**
   * Get credit notes with filtering
   */
  static async getCreditNotes(filters: {
    customerId?: string;
    status?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    creditNotes: CreditNoteWithRelations[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        customerId,
        status,
        isActive = true,
        page = 1,
        limit = 10
      } = filters;

      const where: any = {};

      if (customerId) {
        where.customerId = customerId;
      }

      if (status) {
        where.status = status;
      }

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const [creditNotes, total] = await Promise.all([
        prisma.creditNote.findMany({
          where,
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            originalInvoice: {
              select: {
                id: true,
                invoiceNumber: true,
                totalAmount: true
              }
            },
            currency: {
              select: {
                id: true,
                code: true,
                symbol: true
              }
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.creditNote.count({ where })
      ]);

      return {
        creditNotes,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error getting credit notes:', error);
      throw error;
    }
  }

  /**
   * Get single credit note
   */
  static async getCreditNote(creditNoteId: string): Promise<CreditNoteWithRelations> {
    try {
      const creditNote = await prisma.creditNote.findUnique({
        where: { id: creditNoteId },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          originalInvoice: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              symbol: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!creditNote) {
        throw new Error('Credit note not found');
      }

      return creditNote;
    } catch (error) {
      console.error('Error getting credit note:', error);
      throw error;
    }
  }

  /**
   * Update credit note
   */
  static async updateCreditNote(
    creditNoteId: string,
    updates: Partial<CreateCreditNoteParams>,
    updatedById: string
  ): Promise<CreditNoteWithRelations> {
    try {
      const creditNote = await prisma.creditNote.findUnique({
        where: { id: creditNoteId }
      });

      if (!creditNote) {
        throw new Error('Credit note not found');
      }

      if (creditNote.status !== 'DRAFT') {
        throw new Error('Only draft credit notes can be updated');
      }

      const updatedCreditNote = await prisma.creditNote.update({
        where: { id: creditNoteId },
        data: {
          ...(updates.amount && { amount: new Decimal(updates.amount) }),
          ...(updates.vatAmount !== undefined && { vatAmount: new Decimal(updates.vatAmount) }),
          ...(updates.totalAmount && { totalAmount: new Decimal(updates.totalAmount) }),
          ...(updates.reason !== undefined && { reason: updates.reason })
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          originalInvoice: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              symbol: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Audit log
      await AuditService.log({
        userId: updatedById,
        action: 'UPDATE',
        entityType: 'CreditNote',
        entityId: creditNoteId,
        oldValues: creditNote,
        newValues: updatedCreditNote,
      });

      return updatedCreditNote;
    } catch (error) {
      console.error('Error updating credit note:', error);
      throw error;
    }
  }

  /**
   * Send credit note
   */
  static async sendCreditNote(creditNoteId: string, sentById: string): Promise<CreditNoteWithRelations> {
    try {
      const creditNote = await prisma.creditNote.findUnique({
        where: { id: creditNoteId }
      });

      if (!creditNote) {
        throw new Error('Credit note not found');
      }

      if (creditNote.status !== 'DRAFT') {
        throw new Error('Only draft credit notes can be sent');
      }

      const updatedCreditNote = await prisma.creditNote.update({
        where: { id: creditNoteId },
        data: { status: 'SENT' },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          originalInvoice: {
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              symbol: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Audit log
      await AuditService.log({
        userId: sentById,
        action: 'UPDATE',
        entityType: 'CreditNote',
        entityId: creditNoteId,
        oldValues: { status: 'DRAFT' },
        newValues: { status: 'SENT' },
      });

      return updatedCreditNote;
    } catch (error) {
      console.error('Error sending credit note:', error);
      throw error;
    }
  }

  /**
   * Delete credit note (soft delete)
   */
  static async deleteCreditNote(creditNoteId: string, deletedById: string): Promise<void> {
    try {
      const creditNote = await prisma.creditNote.findUnique({
        where: { id: creditNoteId }
      });

      if (!creditNote) {
        throw new Error('Credit note not found');
      }

      if (creditNote.status !== 'DRAFT') {
        throw new Error('Only draft credit notes can be deleted');
      }

      await prisma.creditNote.update({
        where: { id: creditNoteId },
        data: { isActive: false }
      });

      // Audit log
      await AuditService.log({
        userId: deletedById,
        action: 'DELETE',
        entityType: 'CreditNote',
        entityId: creditNoteId,
        oldValues: creditNote,
      });
    } catch (error) {
      console.error('Error deleting credit note:', error);
      throw error;
    }
  }

  /**
   * Generate credit note report
   */
  static async generateCreditNoteReport(): Promise<{
    totalCreditNotes: number;
    totalAmount: number;
    appliedAmount: number;
    remainingAmount: number;
    statusBreakdown: {
      draft: number;
      sent: number;
      applied: number;
    };
    creditNotes: Array<{
      id: string;
      creditNoteNumber: string;
      customerName: string;
      amount: number;
      appliedAmount: number;
      remainingAmount: number;
      status: string;
      createdAt: Date;
    }>;
  }> {
    try {
      const creditNotes = await prisma.creditNote.findMany({
        where: { isActive: true },
        include: {
          customer: {
            select: {
              name: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      const totalCreditNotes = creditNotes.length;
      const totalAmount = creditNotes.reduce((sum, cn) => sum + Number(cn.totalAmount), 0);
      const appliedAmount = creditNotes.reduce((sum, cn) => sum + Number(cn.appliedAmount), 0);
      const remainingAmount = totalAmount - appliedAmount;

      const statusBreakdown = {
        draft: creditNotes.filter(cn => cn.status === 'DRAFT').length,
        sent: creditNotes.filter(cn => cn.status === 'SENT').length,
        applied: creditNotes.filter(cn => cn.status === 'APPLIED').length
      };

      return {
        totalCreditNotes,
        totalAmount,
        appliedAmount,
        remainingAmount,
        statusBreakdown,
        creditNotes: creditNotes.map(cn => ({
          id: cn.id,
          creditNoteNumber: cn.creditNoteNumber,
          customerName: cn.customer.name,
          amount: Number(cn.totalAmount),
          appliedAmount: Number(cn.appliedAmount),
          remainingAmount: Number(cn.remainingAmount),
          status: cn.status,
          createdAt: cn.createdAt
        }))
      };
    } catch (error) {
      console.error('Error generating credit note report:', error);
      throw error;
    }
  }
}
