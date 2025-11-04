// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";

export interface VATReportParams {
  startDate: Date;
  endDate: Date;
  currencyId?: string;
}

export interface VATReportResult {
  period: {
    startDate: string;
    endDate: string;
    quarter: string;
  };
  inputTax: {
    total: number;
    transactionCount: number;
    transactions: Array<{
      id: string;
      date: string;
      reference: string;
      description: string;
      amount: number;
      vatAmount: number;
      type: string;
    }>;
  };
  outputTax: {
    total: number;
    transactionCount: number;
    transactions: Array<{
      id: string;
      date: string;
      reference: string;
      description: string;
      amount: number;
      vatAmount: number;
      type: string;
    }>;
  };
  summary: {
    totalInputTax: number;
    totalOutputTax: number;
    netLiability: number; // Output Tax - Input Tax (positive = payable, negative = refundable)
  };
  breakdown: {
    byVATCode: Array<{
      vatCode?: string;
      inputTax: number;
      outputTax: number;
      netAmount: number;
    }>;
  };
}

export class VATReportService {
  /**
   * Generate VAT/Tax Report for a quarter
   * Aggregates all transactions tagged with VAT, separating Input Tax (Claimable) and Output Tax (Payable)
   */
  static async generateVATReport(params: VATReportParams): Promise<VATReportResult> {
    try {
      const { startDate, endDate, currencyId } = params;

      console.log(`\n📊 Generating VAT Report for ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

      // Get VAT accounts
      const vatInputAccount = await this.getVATInputAccount();
      const vatOutputAccount = await this.getVATOutputAccount();

      console.log(`   VAT Input Account: ${vatInputAccount.accountName} (${vatInputAccount.accountNo})`);
      console.log(`   VAT Output Account: ${vatOutputAccount.accountName} (${vatOutputAccount.accountNo})`);

      // Query journal entry lines with VAT amounts in the date range
      // Input Tax: VAT Input account (debits) - claimable VAT on purchases/payments
      // Output Tax: VAT Output account (credits) - payable VAT on sales/receipts
      // Include both POSTED and PENDING entries (invoices create journal entries as PENDING)
      const journalEntryLines = await prisma.journalEntryLine.findMany({
        where: {
          vatAmount: {
            gt: 0
          },
          journalEntry: {
            transactionDate: {
              gte: startDate,
              lte: endDate
            },
            status: {
              in: ['POSTED', 'PENDING'] // Include both POSTED and PENDING entries
            },
            ...(currencyId ? { currencyId } : {})
          },
          chartOfAccount: {
            OR: [
              { id: vatInputAccount.id },
              { id: vatOutputAccount.id }
            ]
          }
        },
        include: {
          journalEntry: {
            include: {
              currency: true,
              cashbookEntries: {
                select: {
                  id: true,
                  type: true,
                  reference: true,
                  description: true
                }
              },
              invoices: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  description: true
                }
              },
              expenses: {
                select: {
                  id: true,
                  receiptNumber: true,
                  description: true
                }
              },
              revenues: {
                select: {
                  id: true,
                  description: true
                }
              }
            }
          },
          chartOfAccount: true
        },
        orderBy: {
          journalEntry: {
            transactionDate: 'asc'
          }
        }
      });

      console.log(`   Found ${journalEntryLines.length} journal entry lines with VAT`);

      // Separate Input Tax and Output Tax
      const inputTaxTransactions: any[] = [];
      const outputTaxTransactions: any[] = [];

      for (const line of journalEntryLines) {
        const je = line.journalEntry;
        const vatAmount = Number(line.vatAmount || 0);
        
        if (vatAmount <= 0) continue;

        // Determine transaction details
        let transactionType = 'Manual Entry';
        let reference = je.referenceNumber;
        let description = je.description;

        // Try to get more details from linked transactions
        if (je.cashbookEntries && je.cashbookEntries.length > 0) {
          const cb = je.cashbookEntries[0];
          transactionType = cb.type === 'RECEIPT' ? 'Receipt' : 'Payment';
          reference = cb.reference || je.referenceNumber;
          description = cb.description || je.description;
        } else if (je.invoices && je.invoices.length > 0) {
          const inv = je.invoices[0];
          transactionType = 'Invoice';
          reference = inv.invoiceNumber || je.referenceNumber;
          description = inv.description || je.description;
        } else if (je.expenses && je.expenses.length > 0) {
          const exp = je.expenses[0];
          transactionType = 'Expense';
          reference = exp.receiptNumber || je.referenceNumber;
          description = exp.description || je.description;
        } else if (je.revenues && je.revenues.length > 0) {
          const rev = je.revenues[0];
          transactionType = 'Revenue';
          reference = je.referenceNumber;
          description = rev.description || je.description;
        }

        const transaction = {
          id: je.id,
          date: je.transactionDate.toISOString().split('T')[0],
          reference: reference,
          description: description,
          amount: Number(je.totalAmount),
          vatAmount: vatAmount,
          type: transactionType
        };

        // Input Tax: VAT Input account (typically debited on payments/purchases)
        if (line.chartOfAccountId === vatInputAccount.id) {
          inputTaxTransactions.push(transaction);
        }
        // Output Tax: VAT Output account (typically credited on receipts/sales)
        else if (line.chartOfAccountId === vatOutputAccount.id) {
          outputTaxTransactions.push(transaction);
        }
      }

      // Calculate totals
      const totalInputTax = inputTaxTransactions.reduce((sum, t) => sum + t.vatAmount, 0);
      const totalOutputTax = outputTaxTransactions.reduce((sum, t) => sum + t.vatAmount, 0);
      const netLiability = totalOutputTax - totalInputTax;

      console.log(`   Input Tax (Claimable): $${totalInputTax.toFixed(2)} (${inputTaxTransactions.length} transactions)`);
      console.log(`   Output Tax (Payable): $${totalOutputTax.toFixed(2)} (${outputTaxTransactions.length} transactions)`);
      console.log(`   Net Liability: $${netLiability.toFixed(2)} ${netLiability >= 0 ? '(Payable)' : '(Refundable)'}`);

      // Determine quarter
      const quarter = this.getQuarter(startDate);

      // Build breakdown by VAT code (if available in transactions)
      // Note: VAT codes are stored in the transaction description or as a separate field
      // For now, we'll group by transaction type
      const breakdown = this.buildBreakdown(inputTaxTransactions, outputTaxTransactions);

      return {
        period: {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          quarter: quarter
        },
        inputTax: {
          total: totalInputTax,
          transactionCount: inputTaxTransactions.length,
          transactions: inputTaxTransactions
        },
        outputTax: {
          total: totalOutputTax,
          transactionCount: outputTaxTransactions.length,
          transactions: outputTaxTransactions
        },
        summary: {
          totalInputTax: totalInputTax,
          totalOutputTax: totalOutputTax,
          netLiability: netLiability
        },
        breakdown: breakdown
      };
    } catch (error: any) {
      console.error('Error generating VAT report:', error);
      throw new Error(`Failed to generate VAT report: ${error.message}`);
    }
  }

  /**
   * Get VAT Input account (typically 2110)
   */
  private static async getVATInputAccount() {
    const account = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: '2110' },
          { accountName: { contains: 'VAT Input' } }
        ],
        isActive: true
      }
    });

    if (!account) {
      throw new Error('VAT Input account not found in chart of accounts');
    }

    return account;
  }

  /**
   * Get VAT Output account (typically 2100)
   */
  private static async getVATOutputAccount() {
    const account = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: '2100' },
          { accountName: { contains: 'VAT Output' } }
        ],
        isActive: true
      }
    });

    if (!account) {
      throw new Error('VAT Output account not found in chart of accounts');
    }

    return account;
  }

  /**
   * Determine quarter from date
   */
  private static getQuarter(date: Date): string {
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear();
    
    if (month >= 1 && month <= 3) return `Q1 ${year}`;
    if (month >= 4 && month <= 6) return `Q2 ${year}`;
    if (month >= 7 && month <= 9) return `Q3 ${year}`;
    return `Q4 ${year}`;
  }

  /**
   * Build breakdown by transaction type
   */
  private static buildBreakdown(inputTaxTransactions: any[], outputTaxTransactions: any[]) {
    const inputTaxByType = new Map<string, number>();
    const outputTaxByType = new Map<string, number>();

    // Aggregate input tax by type
    for (const t of inputTaxTransactions) {
      const current = inputTaxByType.get(t.type) || 0;
      inputTaxByType.set(t.type, current + t.vatAmount);
    }

    // Aggregate output tax by type
    for (const t of outputTaxTransactions) {
      const current = outputTaxByType.get(t.type) || 0;
      outputTaxByType.set(t.type, current + t.vatAmount);
    }

    // Combine all types
    const allTypes = new Set([...inputTaxByType.keys(), ...outputTaxByType.keys()]);
    
    const breakdown = Array.from(allTypes).map(type => ({
      vatCode: type, // Using transaction type as VAT code identifier
      inputTax: inputTaxByType.get(type) || 0,
      outputTax: outputTaxByType.get(type) || 0,
      netAmount: (outputTaxByType.get(type) || 0) - (inputTaxByType.get(type) || 0)
    }));

    return { byVATCode: breakdown };
  }
}

export default VATReportService;

