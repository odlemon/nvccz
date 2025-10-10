// @ts-nocheck
import { PrismaClient, StatementOfAccount, StatementItem } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { dbConnection } from '../utils/database';
import AuditService from './AuditService';

const prisma = dbConnection.getPrismaClient();

export interface GenerateStatementParams {
  customerId?: string;
  vendorId?: string;
  statementDate: Date;
  currencyId: string;
  generatedById: string;
}

export interface StatementWithItems extends StatementOfAccount {
  customer?: {
    id: string;
    name: string;
    email?: string;
  };
  vendor?: {
    id: string;
    name: string;
    email?: string;
  };
  currency: {
    id: string;
    code: string;
    symbol: string;
  };
  generatedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  statementItems: StatementItem[];
}

export class StatementOfAccountService {
  /**
   * Generate all customer statements
   */
  static async generateAllCustomerStatements(params: Omit<GenerateStatementParams, 'customerId' | 'vendorId' | 'currencyId'>): Promise<StatementWithItems[]> {
    try {
      const { statementDate, generatedById } = params;

      // Get all active currencies
      const currencies = await prisma.currency.findMany({
        where: { isActive: true }
      });

      if (currencies.length === 0) {
        throw new Error('No active currencies found');
      }

      // Get all customers
      const customers = await prisma.customer.findMany({
        where: { isActive: true }
      });

      const statements: StatementWithItems[] = [];

      // Generate statement for each customer and each currency
      for (const customer of customers) {
        for (const currency of currencies) {
          const statement = await this.generateCustomerStatement({
            customerId: customer.id,
            statementDate,
            currencyId: currency.id,
            generatedById
          });
          statements.push(statement);
        }
      }

      return statements;
    } catch (error: any) {
      console.error('Error generating all customer statements:', error);
      throw new Error(`Failed to generate all customer statements: ${error.message}`);
    }
  }

  /**
   * Generate customer statement of account
   */
  static async generateCustomerStatement(params: GenerateStatementParams): Promise<StatementWithItems> {
    try {
      const { customerId, statementDate, currencyId, generatedById } = params;

      if (!customerId) {
        throw new Error('Customer ID is required for customer statement');
      }

      // Get customer details
      const customer = await prisma.customer.findUnique({
        where: { id: customerId }
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Get all transactions for the customer
      const transactions = await this.getCustomerTransactions(customerId, statementDate);

      // Calculate opening balance (from previous period)
      const openingBalance = await this.calculateOpeningBalance(customerId, statementDate);

      // Calculate statement totals
      const totalDebits = transactions.reduce((sum, t) => sum + Number(t.debitAmount), 0);
      const totalCredits = transactions.reduce((sum, t) => sum + Number(t.creditAmount), 0);
      const closingBalance = openingBalance + totalDebits - totalCredits;

      // Create statement record
      const statement = await prisma.statementOfAccount.create({
        data: {
          customerId,
          statementDate,
          openingBalance: new Decimal(openingBalance),
          closingBalance: new Decimal(closingBalance),
          totalDebits: new Decimal(totalDebits),
          totalCredits: new Decimal(totalCredits),
          currencyId,
          statementType: 'CUSTOMER',
          generatedById
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              symbol: true
            }
          },
          generatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Create statement items
      let runningBalance = openingBalance;
      const statementItems = [];

      for (const transaction of transactions) {
        runningBalance += Number(transaction.debitAmount) - Number(transaction.creditAmount);

        const statementItem = await prisma.statementItem.create({
          data: {
            statementId: statement.id,
            transactionDate: transaction.transactionDate,
            description: transaction.description,
            reference: transaction.reference,
            debitAmount: transaction.debitAmount,
            creditAmount: transaction.creditAmount,
            balance: new Decimal(runningBalance),
            transactionType: transaction.transactionType,
            transactionId: transaction.transactionId
          }
        });

        statementItems.push(statementItem);
      }

      // Audit log
      await AuditService.log({
        userId: generatedById,
        action: 'CREATE',
        entityType: 'StatementOfAccount',
        entityId: statement.id,
        newValues: statement,
      });

      return {
        ...statement,
        statementItems
      };
    } catch (error) {
      console.error('Error generating customer statement:', error);
      throw error;
    }
  }

  /**
   * Generate all vendor statements
   */
  static async generateAllVendorStatements(params: Omit<GenerateStatementParams, 'customerId' | 'vendorId' | 'currencyId'>): Promise<StatementWithItems[]> {
    try {
      const { statementDate, generatedById } = params;

      // Get all active currencies
      const currencies = await prisma.currency.findMany({
        where: { isActive: true }
      });

      if (currencies.length === 0) {
        throw new Error('No active currencies found');
      }

      // Get all vendors
      const vendors = await prisma.vendor.findMany({
        where: { isActive: true }
      });

      const statements: StatementWithItems[] = [];

      // Generate statement for each vendor and each currency
      for (const vendor of vendors) {
        for (const currency of currencies) {
          const statement = await this.generateVendorStatement({
            vendorId: vendor.id,
            statementDate,
            currencyId: currency.id,
            generatedById
          });
          statements.push(statement);
        }
      }

      return statements;
    } catch (error: any) {
      console.error('Error generating all vendor statements:', error);
      throw new Error(`Failed to generate all vendor statements: ${error.message}`);
    }
  }

  /**
   * Generate vendor statement of account
   */
  static async generateVendorStatement(params: GenerateStatementParams): Promise<StatementWithItems> {
    try {
      const { vendorId, statementDate, currencyId, generatedById } = params;

      if (!vendorId) {
        throw new Error('Vendor ID is required for vendor statement');
      }

      // Get vendor details
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId }
      });

      if (!vendor) {
        throw new Error('Vendor not found');
      }

      // Get all transactions for the vendor
      const transactions = await this.getVendorTransactions(vendorId, statementDate);

      // Calculate opening balance
      const openingBalance = await this.calculateVendorOpeningBalance(vendorId, statementDate);

      // Calculate statement totals
      const totalDebits = transactions.reduce((sum, t) => sum + Number(t.debitAmount), 0);
      const totalCredits = transactions.reduce((sum, t) => sum + Number(t.creditAmount), 0);
      const closingBalance = openingBalance + totalDebits - totalCredits;

      // Create statement record
      const statement = await prisma.statementOfAccount.create({
        data: {
          vendorId,
          statementDate,
          openingBalance: new Decimal(openingBalance),
          closingBalance: new Decimal(closingBalance),
          totalDebits: new Decimal(totalDebits),
          totalCredits: new Decimal(totalCredits),
          currencyId,
          statementType: 'VENDOR',
          generatedById
        },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              symbol: true
            }
          },
          generatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Create statement items
      let runningBalance = openingBalance;
      const statementItems = [];

      for (const transaction of transactions) {
        runningBalance += Number(transaction.debitAmount) - Number(transaction.creditAmount);

        const statementItem = await prisma.statementItem.create({
          data: {
            statementId: statement.id,
            transactionDate: transaction.transactionDate,
            description: transaction.description,
            reference: transaction.reference,
            debitAmount: transaction.debitAmount,
            creditAmount: transaction.creditAmount,
            balance: new Decimal(runningBalance),
            transactionType: transaction.transactionType,
            transactionId: transaction.transactionId
          }
        });

        statementItems.push(statementItem);
      }

      // Audit log
      await AuditService.log({
        userId: generatedById,
        action: 'CREATE',
        entityType: 'StatementOfAccount',
        entityId: statement.id,
        newValues: statement,
      });

      return {
        ...statement,
        statementItems
      };
    } catch (error) {
      console.error('Error generating vendor statement:', error);
      throw error;
    }
  }

  /**
   * Get customer transactions for statement
   */
  private static async getCustomerTransactions(customerId: string, statementDate: Date): Promise<Array<{
    transactionDate: Date;
    description: string;
    reference?: string;
    debitAmount: Decimal;
    creditAmount: Decimal;
    transactionType: string;
    transactionId?: string;
  }>> {
    const transactions = [];

    // Get invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        customerId,
        transactionDate: { lte: statementDate }
      },
      orderBy: { transactionDate: 'asc' }
    });

    for (const invoice of invoices) {
      transactions.push({
        transactionDate: invoice.transactionDate,
        description: `Invoice ${invoice.invoiceNumber || invoice.id}`,
        reference: invoice.invoiceNumber,
        debitAmount: invoice.totalAmount,
        creditAmount: new Decimal(0),
        transactionType: 'INVOICE',
        transactionId: invoice.id
      });
    }

    // Get payments (from journal entries)
    const paymentEntries = await prisma.journalEntry.findMany({
      where: {
        invoices: {
          some: { customerId }
        },
        transactionDate: { lte: statementDate },
        description: { contains: 'Payment' }
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      },
      orderBy: { transactionDate: 'asc' }
    });

    for (const entry of paymentEntries) {
      const cashLine = entry.journalEntryLines.find(line => 
        line.chartOfAccount.accountName.includes('Cash') || 
        line.chartOfAccount.accountName.includes('Bank')
      );

      if (cashLine) {
        transactions.push({
          transactionDate: entry.transactionDate,
          description: entry.description,
          reference: entry.referenceNumber,
          debitAmount: new Decimal(0),
          creditAmount: cashLine.debitAmount,
          transactionType: 'PAYMENT',
          transactionId: entry.id
        });
      }
    }

    // Get credit notes
    const creditNotes = await prisma.creditNote.findMany({
      where: {
        customerId,
        createdAt: { lte: statementDate }
      },
      orderBy: { createdAt: 'asc' }
    });

    for (const creditNote of creditNotes) {
      transactions.push({
        transactionDate: creditNote.createdAt,
        description: `Credit Note ${creditNote.creditNoteNumber}`,
        reference: creditNote.creditNoteNumber,
        debitAmount: new Decimal(0),
        creditAmount: creditNote.totalAmount,
        transactionType: 'CREDIT_NOTE',
        transactionId: creditNote.id
      });
    }

    return transactions.sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());
  }

  /**
   * Get vendor transactions for statement
   */
  private static async getVendorTransactions(vendorId: string, statementDate: Date): Promise<Array<{
    transactionDate: Date;
    description: string;
    reference?: string;
    debitAmount: Decimal;
    creditAmount: Decimal;
    transactionType: string;
    transactionId?: string;
  }>> {
    const transactions = [];

    // Get purchase orders
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        vendorId,
        createdAt: { lte: statementDate }
      },
      orderBy: { createdAt: 'asc' }
    });

    for (const po of purchaseOrders) {
      transactions.push({
        transactionDate: po.createdAt,
        description: `Purchase Order ${po.poNumber}`,
        reference: po.poNumber,
        debitAmount: po.totalAmount,
        creditAmount: new Decimal(0),
        transactionType: 'PURCHASE_ORDER',
        transactionId: po.id
      });
    }

    // Get procurement invoices
    const procurementInvoices = await prisma.procurementInvoice.findMany({
      where: {
        vendorId,
        createdAt: { lte: statementDate }
      },
      orderBy: { createdAt: 'asc' }
    });

    for (const invoice of procurementInvoices) {
      transactions.push({
        transactionDate: invoice.createdAt,
        description: `Invoice ${invoice.invoiceNumber}`,
        reference: invoice.invoiceNumber,
        debitAmount: invoice.totalAmount,
        creditAmount: new Decimal(0),
        transactionType: 'INVOICE',
        transactionId: invoice.id
      });
    }

    // Get payments to vendors
    const paymentEntries = await prisma.journalEntry.findMany({
      where: {
        description: { contains: 'Payment' },
        transactionDate: { lte: statementDate }
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      },
      orderBy: { transactionDate: 'asc' }
    });

    for (const entry of paymentEntries) {
      const accountsPayableLine = entry.journalEntryLines.find(line => 
        line.chartOfAccount.accountName.includes('Accounts Payable')
      );

      if (accountsPayableLine) {
        transactions.push({
          transactionDate: entry.transactionDate,
          description: entry.description,
          reference: entry.referenceNumber,
          debitAmount: new Decimal(0),
          creditAmount: accountsPayableLine.creditAmount,
          transactionType: 'PAYMENT',
          transactionId: entry.id
        });
      }
    }

    return transactions.sort((a, b) => a.transactionDate.getTime() - b.transactionDate.getTime());
  }

  /**
   * Calculate opening balance for customer
   */
  private static async calculateOpeningBalance(customerId: string, statementDate: Date): Promise<number> {
    // This is a simplified calculation - in a real system, you'd want to calculate
    // the actual opening balance from previous periods
    return 0;
  }

  /**
   * Calculate opening balance for vendor
   */
  private static async calculateVendorOpeningBalance(vendorId: string, statementDate: Date): Promise<number> {
    // This is a simplified calculation - in a real system, you'd want to calculate
    // the actual opening balance from previous periods
    return 0;
  }

  /**
   * Get statement by ID
   */
  static async getStatement(statementId: string): Promise<StatementWithItems> {
    try {
      const statement = await prisma.statementOfAccount.findUnique({
        where: { id: statementId },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          vendor: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          currency: {
            select: {
              id: true,
              code: true,
              symbol: true
            }
          },
          generatedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          statementItems: {
            orderBy: { transactionDate: 'asc' }
          }
        }
      });

      if (!statement) {
        throw new Error('Statement not found');
      }

      return statement;
    } catch (error) {
      console.error('Error getting statement:', error);
      throw error;
    }
  }

  /**
   * Get statements with filtering
   */
  static async getStatements(filters: {
    customerId?: string;
    vendorId?: string;
    statementType?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    statements: StatementWithItems[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        customerId,
        vendorId,
        statementType,
        page = 1,
        limit = 10
      } = filters;

      const where: any = {};

      if (customerId) {
        where.customerId = customerId;
      }

      if (vendorId) {
        where.vendorId = vendorId;
      }

      if (statementType) {
        where.statementType = statementType;
      }

      const [statements, total] = await Promise.all([
        prisma.statementOfAccount.findMany({
          where,
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            vendor: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            currency: {
              select: {
                id: true,
                code: true,
                symbol: true
              }
            },
            generatedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            statementItems: {
              orderBy: { transactionDate: 'asc' },
              take: 10
            }
          },
          orderBy: { statementDate: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.statementOfAccount.count({ where })
      ]);

      return {
        statements,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error getting statements:', error);
      throw error;
    }
  }

  /**
   * Delete statement
   */
  static async deleteStatement(statementId: string, deletedById: string): Promise<void> {
    try {
      const statement = await prisma.statementOfAccount.findUnique({
        where: { id: statementId }
      });

      if (!statement) {
        throw new Error('Statement not found');
      }

      // Delete statement items first
      await prisma.statementItem.deleteMany({
        where: { statementId }
      });

      // Delete statement
      await prisma.statementOfAccount.delete({
        where: { id: statementId }
      });

      // Audit log
      await AuditService.log({
        userId: deletedById,
        action: 'DELETE',
        entityType: 'StatementOfAccount',
        entityId: statementId,
        oldValues: statement,
      });
    } catch (error) {
      console.error('Error deleting statement:', error);
      throw error;
    }
  }

  /**
   * Format statement for display
   */
  static async formatStatement(statementData: StatementWithItems): Promise<{
    formattedStatement: {
      header: {
        statementId: string;
        statementDate: string;
        customerName?: string;
        vendorName?: string;
        openingBalance: string;
        closingBalance: string;
        currency: string;
      };
      items: Array<{
        date: string;
        description: string;
        reference?: string;
        debitAmount: string;
        creditAmount: string;
        balance: string;
        transactionType: string;
      }>;
      summary: {
        totalDebits: string;
        totalCredits: string;
        netBalance: string;
      };
    };
  }> {
    try {
      const currency = statementData.currency.symbol;
      
      const header = {
        statementId: statementData.id,
        statementDate: statementData.statementDate.toISOString().split('T')[0],
        customerName: statementData.customer?.name,
        vendorName: statementData.vendor?.name,
        openingBalance: `${currency} ${Number(statementData.openingBalance).toFixed(2)}`,
        closingBalance: `${currency} ${Number(statementData.closingBalance).toFixed(2)}`,
        currency: statementData.currency.code
      };

      const items = statementData.statementItems.map(item => ({
        date: item.transactionDate.toISOString().split('T')[0],
        description: item.description,
        reference: item.reference,
        debitAmount: `${currency} ${Number(item.debitAmount).toFixed(2)}`,
        creditAmount: `${currency} ${Number(item.creditAmount).toFixed(2)}`,
        balance: `${currency} ${Number(item.balance).toFixed(2)}`,
        transactionType: item.transactionType
      }));

      const summary = {
        totalDebits: `${currency} ${Number(statementData.totalDebits).toFixed(2)}`,
        totalCredits: `${currency} ${Number(statementData.totalCredits).toFixed(2)}`,
        netBalance: `${currency} ${Number(statementData.closingBalance).toFixed(2)}`
      };

      return {
        formattedStatement: {
          header,
          items,
          summary
        }
      };
    } catch (error) {
      console.error('Error formatting statement:', error);
      throw error;
    }
  }

  /**
   * Email statement to customer/vendor
   */
  static async emailStatement(customerId: string, statementId: string): Promise<void> {
    try {
      // Get statement with customer details
      const statement = await prisma.statementOfAccount.findUnique({
        where: { id: statementId },
        include: {
          customer: {
            select: {
              name: true,
              email: true
            }
          },
          vendor: {
            select: {
              name: true,
              email: true
            }
          },
          currency: true
        }
      });

      if (!statement) {
        throw new Error('Statement not found');
      }

      // Get recipient email
      const recipientEmail = statement.customer?.email || statement.vendor?.email;
      if (!recipientEmail) {
        throw new Error('No email address found for customer/vendor');
      }

      // Format the statement
      const formattedStatement = await this.formatStatement(statement as StatementWithItems);

      // Here you would integrate with your email service
      // For now, we'll just log the email content
      console.log(`Sending statement ${statementId} to ${recipientEmail}`);
      console.log('Statement content:', JSON.stringify(formattedStatement, null, 2));

      // TODO: Integrate with actual email service
      // await EmailService.sendStatementEmail(recipientEmail, formattedStatement);

    } catch (error) {
      console.error('Error emailing statement:', error);
      throw error;
    }
  }
}
