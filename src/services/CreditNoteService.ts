// @ts-nocheck
import { PrismaClient, CreditNote } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { dbConnection } from '../utils/database';
import { JournalEntryService } from './JournalEntryService';
import AuditService from './AuditService';

const prisma = dbConnection.getPrismaClient();

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

      // Create the credit note
      const creditNote = await prisma.creditNote.create({
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

      // Create credit note journal entry
      await this.createCreditNoteJournalEntry(creditNote, createdById);

      // Audit log
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
   * Create credit note journal entry
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
   * Apply credit note to invoice
   */
  static async applyCreditNote(params: ApplyCreditNoteParams): Promise<void> {
    try {
      const { creditNoteId, invoiceId, amount, appliedById } = params;

      // Get credit note
      const creditNote = await prisma.creditNote.findUnique({
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
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId }
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.customerId !== creditNote.customerId) {
        throw new Error('Credit note and invoice must belong to the same customer');
      }

      // Update credit note
      const newAppliedAmount = Number(creditNote.appliedAmount) + amount;
      const newRemainingAmount = Number(creditNote.remainingAmount) - amount;
      const newStatus = newRemainingAmount <= 0 ? 'APPLIED' : 'PARTIALLY_APPLIED';

      await prisma.creditNote.update({
        where: { id: creditNoteId },
        data: {
          appliedAmount: new Decimal(newAppliedAmount),
          remainingAmount: new Decimal(newRemainingAmount),
          status: newStatus
        }
      });

      // Create application journal entry
      await this.createCreditNoteApplicationJournalEntry(creditNote, invoice, amount, appliedById);

      // Audit log
      await AuditService.log({
        userId: appliedById,
        action: 'UPDATE',
        entityType: 'CreditNote',
        entityId: creditNoteId,
        newValues: {
          appliedAmount: newAppliedAmount,
          remainingAmount: newRemainingAmount,
          status: newStatus
        },
      });
    } catch (error) {
      console.error('Error applying credit note:', error);
      throw error;
    }
  }

  /**
   * Create credit note application journal entry
   */
  private static async createCreditNoteApplicationJournalEntry(
    creditNote: CreditNote,
    invoice: any,
    amount: number,
    appliedById: string
  ): Promise<void> {
    try {
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: new Date(),
          referenceNumber: `CN-APPLY-${creditNote.creditNoteNumber}`,
          description: `Credit note application: ${creditNote.creditNoteNumber} to invoice ${invoice.invoiceNumber || invoice.id}`,
          totalAmount: new Decimal(amount),
          currencyId: creditNote.currencyId,
          status: 'POSTED',
          createdById: appliedById
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

      // Create journal entry lines
      // Dr Accounts Receivable (reduce receivable by credit note amount)
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: accountsReceivableAccount.id,
          debitAmount: new Decimal(0),
          creditAmount: new Decimal(amount),
          description: `Credit note application: ${creditNote.creditNoteNumber}`,
          vatAmount: new Decimal(0)
        }
      });

      // Cr Accounts Receivable (increase receivable by same amount - net effect is zero)
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: accountsReceivableAccount.id,
          debitAmount: new Decimal(amount),
          creditAmount: new Decimal(0),
          description: `Credit note application: ${creditNote.creditNoteNumber}`,
          vatAmount: new Decimal(0)
        }
      });
    } catch (error) {
      console.error('Error creating credit note application journal entry:', error);
      throw error;
    }
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
