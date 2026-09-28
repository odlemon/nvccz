// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";
import { vatInputAccount as resolveVatInput, vatOutputAccount as resolveVatOutput } from "../utils/vatAccounts";
import { buildJournalEntryWhereForGlReporting } from "../utils/journalEntryReportingFilter";

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
      journalEntryLineId?: string;
      journalEntryId?: string;
      id: string;
      date: string;
      reference: string;
      description: string;
      amount: number;
      vatAmount: number;
      type: string;
      invoiceId?: string;
      invoiceNumber?: string;
      creditNoteId?: string;
      creditNoteNumber?: string;
      customerName?: string | null;
    }>;
  };
  outputTax: {
    total: number;
    transactionCount: number;
    transactions: Array<{
      journalEntryLineId?: string;
      journalEntryId?: string;
      id: string;
      date: string;
      reference: string;
      description: string;
      amount: number;
      vatAmount: number;
      type: string;
      invoiceId?: string;
      invoiceNumber?: string;
      creditNoteId?: string;
      creditNoteNumber?: string;
      customerName?: string | null;
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

      // All lines hitting VAT Input / VAT Output in the period (not only lines with vatAmount set).
      // Output liability movement = credit − debit on 2100 (invoice/receipt credit VAT; credit note debits 2100).
      // Input recoverable movement = debit − credit on 2110.
      // Posted journals only, a voided journal and its reversal left out together (as in every report): a draft is not
      // VAT due. One currency at a time — the base currency unless another is asked for; the others are listed apart,
      // never added in (amounts are not translated yet, FX-01).
      const reportFilter = buildJournalEntryWhereForGlReporting({ gte: startDate, lte: endDate });
      const base = await prisma.currency.findFirst({ where: { isDefault: true }, select: { id: true, code: true } });
      const reportCurrencyId = currencyId || base?.id;
      const otherCurrencies: any[] = await prisma.$queryRawUnsafe(
        `SELECT c.code AS code,
                SUM(CASE WHEN l.chartOfAccountId = ? THEN l.creditAmount - l.debitAmount ELSE 0 END) AS output,
                SUM(CASE WHEN l.chartOfAccountId = ? THEN l.debitAmount - l.creditAmount ELSE 0 END) AS input
           FROM journal_entry_lines l JOIN journal_entries j ON j.id = l.journalEntryId JOIN currencies c ON c.id = j.currencyId
          WHERE l.chartOfAccountId IN (?, ?) AND j.status = 'POSTED' AND j.transactionDate BETWEEN ? AND ?
            AND j.referenceNumber NOT LIKE 'VR-%' AND j.referenceNumber NOT LIKE 'REV-%' AND j.currencyId <> ?
          GROUP BY c.code`,
        vatOutputAccount.id, vatInputAccount.id, vatInputAccount.id, vatOutputAccount.id, startDate, endDate, reportCurrencyId || ''
      ).catch(() => []);
      const journalEntryLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: { in: [vatInputAccount.id, vatOutputAccount.id] },
          journalEntry: {
            ...reportFilter,
            ...(reportCurrencyId ? { currencyId: reportCurrencyId } : {})
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
                  description: true,
                  customerId: true,
                  totalAmount: true,
                  customer: { select: { name: true } }
                }
              },
              creditNotes: {
                select: {
                  id: true,
                  creditNoteNumber: true,
                  reason: true,
                  customerId: true,
                  customer: { select: { name: true } }
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
        orderBy: [
          { journalEntry: { transactionDate: 'asc' } },
          { id: 'asc' }
        ]
      });

      console.log(`   Found ${journalEntryLines.length} journal entry lines with VAT`);

      // Separate Input Tax and Output Tax
      const inputTaxTransactions: any[] = [];
      const outputTaxTransactions: any[] = [];

      for (const line of journalEntryLines) {
        const je = line.journalEntry;
        const cr = Number(line.creditAmount ?? 0);
        const dr = Number(line.debitAmount ?? 0);

        let signedVat = 0;
        if (line.chartOfAccountId === vatOutputAccount.id) {
          signedVat = cr - dr;
        } else if (line.chartOfAccountId === vatInputAccount.id) {
          signedVat = dr - cr;
        } else {
          continue;
        }

        if (Math.abs(signedVat) < 0.01) continue;

        // Determine transaction details
        let transactionType = 'Manual Entry';
        let reference = je.referenceNumber;
        let description = je.description;
        let sourceDocumentAmount: number | undefined;

        if (je.creditNotes && je.creditNotes.length > 0) {
          const cn = je.creditNotes[0];
          transactionType = 'Credit Note';
          reference = cn.creditNoteNumber || je.referenceNumber;
          description = cn.reason || je.description;
          sourceDocumentAmount = Number(je.totalAmount);
        } else if (je.cashbookEntries && je.cashbookEntries.length > 0) {
          const cb = je.cashbookEntries[0];
          transactionType = cb.type === 'RECEIPT' ? 'Receipt' : 'Payment';
          reference = cb.reference || je.referenceNumber;
          description = cb.description || je.description;
        } else if (je.invoices && je.invoices.length > 0) {
          const inv = je.invoices[0];
          transactionType = 'Invoice';
          reference = inv.invoiceNumber || je.referenceNumber;
          description = inv.description || je.description;
          sourceDocumentAmount = Number(inv.totalAmount);
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

        const transaction: any = {
          journalEntryLineId: line.id,
          journalEntryId: je.id,
          id: line.id,
          date: je.transactionDate.toISOString().split('T')[0],
          reference,
          description,
          amount: sourceDocumentAmount ?? Number(je.totalAmount),
          /** Signed: output + increases VAT payable, − reduces (e.g. credit note); input + increases claimable VAT */
          vatAmount: signedVat,
          type: transactionType
        };
        if (transactionType === 'Invoice' && je.invoices?.[0]) {
          transaction.invoiceId = je.invoices[0].id;
          transaction.invoiceNumber = je.invoices[0].invoiceNumber;
          transaction.customerName = (je.invoices[0] as any).customer?.name ?? null;
        }
        if (transactionType === 'Credit Note' && je.creditNotes?.[0]) {
          transaction.creditNoteId = je.creditNotes[0].id;
          transaction.creditNoteNumber = je.creditNotes[0].creditNoteNumber;
          transaction.customerName = (je.creditNotes[0] as any).customer?.name ?? null;
        }

        if (line.chartOfAccountId === vatInputAccount.id) {
          inputTaxTransactions.push(transaction);
        } else if (line.chartOfAccountId === vatOutputAccount.id) {
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

      const reportCurrency = reportCurrencyId ? await prisma.currency.findUnique({ where: { id: reportCurrencyId }, select: { code: true } }) : null;
      // drafts carrying VAT in the period: not in the return until they are posted
      const draftVat: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(DISTINCT j.id) AS n,
                SUM(CASE WHEN l.chartOfAccountId = ? THEN l.creditAmount - l.debitAmount ELSE 0 END) AS output,
                SUM(CASE WHEN l.chartOfAccountId = ? THEN l.debitAmount - l.creditAmount ELSE 0 END) AS input
           FROM journal_entry_lines l JOIN journal_entries j ON j.id = l.journalEntryId
          WHERE l.chartOfAccountId IN (?, ?) AND j.status = 'PENDING' AND j.transactionDate BETWEEN ? AND ? AND j.currencyId = ?`,
        vatOutputAccount.id, vatInputAccount.id, vatInputAccount.id, vatOutputAccount.id, startDate, endDate, reportCurrencyId || ''
      ).catch(() => []);
      return {
        currency: reportCurrency?.code || null,
        accounts: { input: `${vatInputAccount.accountNo} ${vatInputAccount.accountName}`, output: `${vatOutputAccount.accountNo} ${vatOutputAccount.accountName}` },
        drafts: { journals: Number(draftVat[0]?.n || 0), outputTax: Math.round(Number(draftVat[0]?.output || 0) * 100) / 100, inputTax: Math.round(Number(draftVat[0]?.input || 0) * 100) / 100 },
        otherCurrencies: otherCurrencies
          .map((r) => ({ currency: r.code, outputTax: Math.round(Number(r.output || 0) * 100) / 100, inputTax: Math.round(Number(r.input || 0) * 100) / 100 }))
          .filter((r) => r.outputTax || r.inputTax),
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
   * Get VAT Input account (typically 2110).
   * Public (not private) so TaxReturnPackVatCompileService can resolve the exact same account
   * this report aggregated against, instead of re-deriving the lookup independently.
   */
  static async getVATInputAccount() {
    // one resolution for postings and reports (utils/vatAccounts, D23)
    const account = await resolveVatInput();

    if (!account) {
      throw new Error('VAT Input account not found in chart of accounts');
    }

    return account;
  }

  /**
   * Get VAT Output account (typically 2100).
   * Public (not private) so TaxReturnPackVatCompileService can resolve the exact same account
   * this report aggregated against, instead of re-deriving the lookup independently.
   */
  static async getVATOutputAccount() {
    const account = await resolveVatOutput();

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
   * VAT Output Audit Trail: line-by-line list of every transaction (especially invoices) that contributed to VAT Output.
   * Used when user clicks on the VAT Output total in the VAT Return report.
   */
  static async getVATOutputAuditTrail(params: VATReportParams): Promise<{
    period: { startDate: string; endDate: string; quarter: string };
    /** Net output VAT for the period (sum of signed line amounts; matches VAT report output total). */
    totalOutputTax: number;
    lines: Array<{
      id: string;
      journalEntryLineId: string;
      journalEntryId: string;
      date: string;
      reference: string;
      description: string;
      amount: number;
      /** Signed: positive increases VAT payable, negative reduces (e.g. credit note to 2100). */
      vatAmount: number;
      type: string;
      invoiceId?: string;
      invoiceNumber?: string;
      creditNoteId?: string;
      creditNoteNumber?: string;
      customerName?: string | null;
    }>;
  }> {
    const report = await this.generateVATReport(params);
    const outputTax = report.outputTax;
    const lines = (outputTax.transactions || []).map((t: any) => ({
      id: t.id,
      journalEntryLineId: t.journalEntryLineId ?? t.id,
      journalEntryId: t.journalEntryId,
      date: t.date,
      reference: t.reference,
      description: t.description,
      amount: t.amount,
      vatAmount: t.vatAmount,
      type: t.type,
      invoiceId: t.invoiceId,
      invoiceNumber: t.invoiceNumber ?? (t.type === 'Invoice' ? t.reference : undefined),
      creditNoteId: t.creditNoteId,
      creditNoteNumber: t.creditNoteNumber,
      customerName: t.customerName ?? null
    }));
    return {
      period: report.period,
      totalOutputTax: outputTax.total,
      lines
    };
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

