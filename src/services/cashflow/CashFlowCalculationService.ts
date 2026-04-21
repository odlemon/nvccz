// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import { prisma } from "../../utils/database";
import { CashFlowParams, CashFlowStatement, CashFlowActivity, CashFlowAccount } from "./types";
import { CashFlowCategorizationService } from "./CashFlowCategorizationService";
import { CashFlowBalanceService } from "./CashFlowBalanceService";
import { BalanceSheetService } from "../BalanceSheetService";

export class CashFlowCalculationService {
  /**
   * NVCCZ-specific classification hints derived from a journal entry's reference number
   * and/or description. Returns 'Operating' | 'Investing' | 'Financing' when the JE is
   * clearly one of those (based on posting conventions used in this system), otherwise
   * returns undefined — in which case the per-line chart-of-accounts based category wins.
   *
   * This lets the cash flow statement correctly categorise system-generated JEs even when
   * the non-cash legs land on accounts whose names don't match the generic keyword list
   * (e.g. a short-term-investment settlement JE that happens to credit a budget/clearing
   * account on its non-cash side).
   */
  private inferCashFlowCategoryFromJournalEntry(
    je: { referenceNumber?: string | null; description?: string | null }
  ): 'Operating' | 'Investing' | 'Financing' | undefined {
    const ref = String(je.referenceNumber || '').trim().toUpperCase();
    const desc = String(je.description || '').toLowerCase();

    // ── INVESTING ─────────────────────────────────────────────────────────────
    // Short-term investment lifecycle (placement, settlement, maturity, interest capitalised
    // into principal). Matches refs like STI-PLACE-..., STI-SET-..., STI-MAT-....
    if (/^STI[-_]/.test(ref)) return 'Investing';
    if (
      desc.includes('short-term investment') ||
      desc.includes('short term investment') ||
      desc.includes('investment settlement') ||
      desc.includes('investment maturity') ||
      desc.includes('investment placement')
    ) {
      return 'Investing';
    }
    // Fund disbursement to portfolio company (e.g. ref FD-..., description "fund disbursement").
    if (/^FD[-_]/.test(ref) || desc.includes('fund disbursement') || desc.includes('portfolio disbursement')) {
      return 'Investing';
    }
    // Portfolio investment exits, write-downs, distributions received from investees.
    if (desc.includes('portfolio exit') || desc.includes('investment exit') || desc.includes('investee distribution')) {
      return 'Investing';
    }

    // ── FINANCING ─────────────────────────────────────────────────────────────
    // LP capital calls (CCALLPAY-..., CCALL-...) and capital-contribution receipts.
    if (/^CCALL/.test(ref)) return 'Financing';
    if (
      desc.includes('capital call') ||
      desc.includes('lp capital') ||
      desc.includes('lp contribution') ||
      desc.includes('limited partner contribution')
    ) {
      return 'Financing';
    }
    // LP distributions / drawdowns / returns of capital.
    if (/^(DIST|LPDIST)[-_]/.test(ref)) return 'Financing';
    if (desc.includes('lp distribution') || desc.includes('distribution to lp') || desc.includes('return of capital')) {
      return 'Financing';
    }
    // Loan / debt financing lifecycle.
    if (/^(LOAN|DEBT|BORROW)[-_]/.test(ref)) return 'Financing';
    if (
      desc.includes('loan drawdown') ||
      desc.includes('loan repayment') ||
      desc.includes('bank loan') ||
      desc.includes('debt repayment') ||
      desc.includes('principal repayment')
    ) {
      return 'Financing';
    }
    // Share / equity issuance and dividends.
    if (desc.includes('share issuance') || desc.includes('stock issuance') || desc.includes('dividend payment')) {
      return 'Financing';
    }

    return undefined;
  }

  /**
   * Generate cash flow statement for a specific period (Direct Method).
   *
   * Accounting model:
   *  - Only journal entries that actually debit or credit a GL cash account are treated as
   *    cash flows. Pure accrual entries (e.g. Dr AR / Cr Revenue) are excluded.
   *  - For each qualifying JE, cash impact is attributed to its non-cash legs:
   *       lineCashImpact = creditAmount − debitAmount   (per non-cash leg)
   *    Because the JE balances, the sum of non-cash legs' impacts equals the net cash
   *    movement of that entry (Dr Cash = inflow, Cr Cash = outflow).
   *  - Line items are aggregated by chart-of-account; sections are determined by the
   *    existing CashFlowCategorizationService rules (Operating / Investing / Financing).
   *  - Cash/bank GL accounts themselves never appear as line items.
   *
   * Response shape is intentionally preserved unchanged for the frontend.
   */
  async generateCashFlowStatement(params: CashFlowParams): Promise<CashFlowStatement> {
    const { startDate, endDate, currencyId } = params;

    // Get currency information
    const currency = currencyId 
      ? await prisma.currency.findUnique({ where: { id: currencyId } })
      : await prisma.currency.findFirst({ where: { isActive: true } });

    if (!currency) {
      throw new Error("No active currency found");
    }

    // Resolve the set of cash / cash-equivalent GL accounts using the SAME rule
    // as the balance sheet, so "cash in section totals" ties to "Cash & Equivalents".
    const banks = await prisma.bank.findMany({
      where: { isActive: true, glAccount: { isActive: true } },
      include: { glAccount: true }
    });
    const bankGLAccountIds = new Set<string>();
    for (const bank of banks) {
      if (bank.glAccount) bankGLAccountIds.add(bank.glAccount.id);
    }
    const bsAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        financialStatement: { in: ["Balance Sheet", "Balance sheet"] },
        isActive: true
      },
      select: { id: true, accountNo: true, accountName: true, accountType: true }
    });
    const cashAccountIds = new Set<string>(
      bsAccounts
        .filter((a) => BalanceSheetService.isCashOrBankEquivalentForReporting(a, bankGLAccountIds))
        .map((a) => a.id)
    );

    // Get all posted journal entries for the period
    // Exclude journal entries linked to voided/reversed cashbook entries
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        transactionDate: {
          gte: startDate,
          lte: endDate
        },
        status: "POSTED",
        currencyId: currency.id,
        // Exclude journal entries where ANY linked cashbook entry is voided or reversed
        NOT: {
          cashbookEntries: {
            some: {
              OR: [
                { status: 'VOIDED' },
                { reversedAt: { not: null } } // Reversed entries have reversedAt set
              ]
            }
          }
        },
        // Exclude reversal journal entries
        AND: [
          {
            referenceNumber: {
              not: {
                startsWith: 'VR-'
              }
            }
          },
          {
            referenceNumber: {
              not: {
                startsWith: 'REV-'
              }
            }
          }
        ]
      },
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: true
            }
          },
          cashbookEntries: {
            include: {
              bank: {
                select: {
                  id: true,
                  name: true,
                  accountNumber: true
                }
              },
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
              }
            },
            take: 1
          },
          invoices: {
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            },
            take: 1
          },
          expenses: {
            include: {
              vendor: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              category: {
                select: {
                  id: true,
                  name: true
                }
              }
            },
            take: 1
          },
          revenues: {
            include: {
              source: {
                select: {
                  id: true,
                  name: true
                }
              },
              category: {
                select: {
                  id: true,
                  name: true
                }
              }
            },
            take: 1
          }
        }
      });

    // Calculate account balances from journal entry lines (used for metadata + transaction breakdown)
    const accountBalances = await CashFlowBalanceService.calculateAccountBalances(journalEntries);

    // Seed category info on each account (Operating / Investing / Financing / CASH_ACCOUNT)
    const categorizedAccounts = CashFlowCategorizationService.categorizeAccountsByCashFlow(accountBalances);
    const accountMetaById = new Map<string, CashFlowAccount>(
      categorizedAccounts.map((a) => [a.accountId, a])
    );

    // --- Direct-method aggregation ---
    // For each JE that has at least one cash leg AND at least one non-cash leg,
    // attribute cash impact to non-cash legs: impact = credit − debit.
    // The effective classification for each non-cash leg is:
    //   1. JE-level hint from reference/description (NVCCZ domain patterns) — strongest.
    //   2. Account-name/number categorization from CashFlowCategorizationService.
    // The same chart-of-accounts row can therefore appear in different sections across
    // different JEs, which is the accurate behaviour (e.g. Portfolio Investments debited
    // for a disbursement is Investing; if ever credited in an operating context it would
    // be Operating for that JE).
    type LineAgg = {
      accountId: string;
      accountNo: string;
      accountName: string;
      accountType: string;
      financialStatement: string;
      cashFlowCategory: 'Operating' | 'Investing' | 'Financing';
      amount: Decimal;        // signed cash impact
      totalDebits: Decimal;   // debits on this non-cash account against cash legs
      totalCredits: Decimal;  // credits on this non-cash account against cash legs
      transactionIds: Set<string>;
    };
    const lineAggByKey = new Map<string, LineAgg>();

    for (const je of journalEntries) {
      const lines = Array.isArray(je.journalEntryLines) ? je.journalEntryLines : [];
      if (lines.length === 0) continue;

      let hasCashLeg = false;
      let hasNonCashLeg = false;
      for (const line of lines) {
        if (cashAccountIds.has(line.chartOfAccount.id)) {
          hasCashLeg = true;
        } else {
          hasNonCashLeg = true;
        }
        if (hasCashLeg && hasNonCashLeg) break;
      }
      // Skip pure-accrual JEs (no cash impact) and pure cash-to-cash transfers.
      if (!hasCashLeg || !hasNonCashLeg) continue;

      const jeHint = this.inferCashFlowCategoryFromJournalEntry(je);

      for (const line of lines) {
        if (cashAccountIds.has(line.chartOfAccount.id)) continue; // skip cash legs themselves

        const coa = line.chartOfAccount;
        const dr = new Decimal(line.debitAmount || 0);
        const cr = new Decimal(line.creditAmount || 0);
        const impact = cr.minus(dr); // Cr to non-cash => cash inflow; Dr to non-cash => cash outflow

        // Resolve effective category for this leg.
        const meta = accountMetaById.get(coa.id);
        const accountCategory = meta?.cashFlowCategory && meta.cashFlowCategory !== 'CASH_ACCOUNT'
          ? (meta.cashFlowCategory as 'Operating' | 'Investing' | 'Financing')
          : 'Operating';
        const effectiveCategory: 'Operating' | 'Investing' | 'Financing' = jeHint || accountCategory;

        const aggKey = `${coa.id}|${effectiveCategory}`;
        let agg = lineAggByKey.get(aggKey);
        if (!agg) {
          agg = {
            accountId: coa.id,
            accountNo: coa.accountNo,
            accountName: coa.accountName,
            accountType: coa.accountType,
            financialStatement: coa.financialStatement,
            cashFlowCategory: effectiveCategory,
            amount: new Decimal(0),
            totalDebits: new Decimal(0),
            totalCredits: new Decimal(0),
            transactionIds: new Set<string>()
          };
          lineAggByKey.set(aggKey, agg);
        }
        agg.amount = agg.amount.plus(impact);
        agg.totalDebits = agg.totalDebits.plus(dr);
        agg.totalCredits = agg.totalCredits.plus(cr);
        agg.transactionIds.add(line.id);
      }
    }

    // Helper to materialize a section in the exact legacy shape.
    const sectionDescription = (
      kind: 'operating' | 'investing' | 'financing'
    ) =>
      kind === 'operating'
        ? 'Cash flows from operating activities'
        : kind === 'investing'
        ? 'Cash flows from investing activities'
        : 'Cash flows from financing activities';

    const mapTransactionsForLine = (accountId: string, keepIds: Set<string>) => {
      const meta = accountMetaById.get(accountId);
      if (!meta || !Array.isArray(meta.transactions)) return [];
      return meta.transactions
        .filter((t: any) => keepIds.has(t.id))
        .map((transaction: any) => ({
              id: transaction.id,
              date: transaction.date,
              reference: transaction.reference,
              description: transaction.description,
              debitAmount: transaction.debitAmount,
              creditAmount: transaction.creditAmount,
              source: transaction.source,
              journalEntry: {
                id: transaction.journalEntry?.id,
                referenceNumber: transaction.journalEntry?.referenceNumber,
                description: transaction.journalEntry?.description,
                transactionDate: transaction.journalEntry?.transactionDate,
                status: transaction.journalEntry?.status
              },
              sourceTransaction: transaction.sourceTransaction ? {
                id: transaction.sourceTransaction.id,
                type: transaction.sourceTransaction.type,
                amount: transaction.sourceTransaction.amount,
                description: transaction.sourceTransaction.description,
                reference: transaction.sourceTransaction.reference,
                transactionDate: transaction.sourceTransaction.transactionDate,
                status: transaction.sourceTransaction.status,
                invoiceNumber: transaction.sourceTransaction.invoiceNumber,
                receiptNumber: transaction.sourceTransaction.receiptNumber,
                bank: transaction.sourceTransaction.bank,
                customer: transaction.sourceTransaction.customer,
                vendor: transaction.sourceTransaction.vendor
              } : null
        }));
    };

    const EPSILON = 0.005;

    const buildSection = (kind: 'operating' | 'investing' | 'financing') => {
      const wanted = kind === 'operating' ? 'Operating' : kind === 'investing' ? 'Investing' : 'Financing';
      const picked = Array.from(lineAggByKey.values())
        .filter((agg) => agg.cashFlowCategory === wanted)
        .filter((agg) => agg.amount.abs().greaterThan(EPSILON))
        .sort((a, b) => {
          // numeric sort on accountNo when possible, else lexicographic
          const an = parseInt(a.accountNo, 10);
          const bn = parseInt(b.accountNo, 10);
          if (!Number.isNaN(an) && !Number.isNaN(bn) && an !== bn) return an - bn;
          return (a.accountNo || '').localeCompare(b.accountNo || '');
        });

      let totalDecimal = new Decimal(0);
      const lineItems = picked.map((agg) => {
        totalDecimal = totalDecimal.plus(agg.amount);
        return {
          accountId: agg.accountId,
          accountNo: agg.accountNo,
          accountName: agg.accountName,
          accountType: agg.accountType,
          amount: agg.amount.toNumber(),
          netAmount: agg.amount.toNumber(),
          totalDebits: agg.totalDebits.toNumber(),
          totalCredits: agg.totalCredits.toNumber(),
          transactions: mapTransactionsForLine(agg.accountId, agg.transactionIds)
        };
      });

      return {
        total: totalDecimal.toNumber(),
        accountCount: lineItems.length,
        description: sectionDescription(kind),
        lineItems,
        // Legacy UI compatibility: same data as lineItems (many clients still read `accounts`).
        accounts: lineItems
      };
    };

    const operatingSection = buildSection('operating');
    const investingSection = buildSection('investing');
    const financingSection = buildSection('financing');

    // Cash control totals
    const cashBalances = await CashFlowBalanceService.getCashBalances(startDate, endDate, currency.id);
    const beginningCashBalance = cashBalances.beginning;
    const endingCashBalance = cashBalances.ending;

    // Authoritative net change in cash from the GL cash pool (balance sheet consistent).
    const netCashFlow = new Decimal(endingCashBalance).minus(beginningCashBalance).toNumber();

    // Sum of the three sections' line items. With the direct method this reconciles to
    // netCashFlow up to rounding (any residual is rounding only, not categorization drift).
    const activityBasedNetCashFlow = new Decimal(operatingSection.total)
      .plus(investingSection.total)
      .plus(financingSection.total)
      .toNumber();

    // Presentation rebuilt from direct-method lines so UI totals always tie to lineItems.
    const presentation = this.buildPresentationFromSections({
      operating: operatingSection,
      investing: investingSection,
      financing: financingSection,
      beginningCashBalance,
      endingCashBalance
    });

    return {
      period: { startDate, endDate },
      operatingActivities: operatingSection,
      investingActivities: investingSection,
      financingActivities: financingSection,
      netCashFlow,
      activityBasedNetCashFlow,
      beginningCashBalance,
      endingCashBalance,
      currency: {
        id: currency.id,
        code: currency.code,
        name: currency.name
      },
      generatedAt: new Date(),
      presentation
    };
  }

  /**
   * Rebuild the `presentation` block from already-computed direct-method sections so that
   * the UI's cashReceipts / cashPayments / total values ALWAYS tie to the lineItems.
   * Preserves the existing object shape exactly.
   */
  private buildPresentationFromSections({
    operating,
    investing,
    financing,
    beginningCashBalance,
    endingCashBalance
  }: {
    operating: { total: number; lineItems: Array<{ accountNo: string; accountName: string; amount: number }> };
    investing: { total: number; lineItems: Array<{ accountNo: string; accountName: string; amount: number }> };
    financing: { total: number; lineItems: Array<{ accountNo: string; accountName: string; amount: number }> };
    beginningCashBalance: number;
    endingCashBalance: number;
  }) {
    const split = (lineItems: Array<{ accountName: string; amount: number }>) => {
      const cashReceipts: Array<{ label: string; amount: number }> = [];
      const cashPayments: Array<{ label: string; amount: number }> = [];
      for (const li of lineItems) {
        if (li.amount > 0) {
          cashReceipts.push({ label: li.accountName, amount: li.amount });
        } else if (li.amount < 0) {
          cashPayments.push({ label: li.accountName, amount: li.amount });
        }
      }
      return { cashReceipts, cashPayments };
    };

    const op = split(operating.lineItems);
    const inv = split(investing.lineItems);
    const fin = split(financing.lineItems);

    return {
      operating: {
        label: 'Operating Activities',
        cashReceipts: op.cashReceipts,
        cashPayments: op.cashPayments,
        additions: [],
        adjustments: [],
        total: operating.total
      },
      investing: {
        label: 'Investing Activities',
        cashReceipts: inv.cashReceipts,
        cashPayments: inv.cashPayments,
        total: investing.total
      },
      financing: {
        label: 'Financing Activities',
        cashReceipts: fin.cashReceipts,
        cashPayments: fin.cashPayments,
        total: financing.total
      },
      netChangeInCash: new Decimal(endingCashBalance).minus(beginningCashBalance).toNumber(),
      beginningCashBalance,
      endingCashBalance
    };
  }

  /**
   * Resolve `CashFlowAccount[]` (with accountId) for each section by looking up
   * chart-of-accounts by the accountNo present on the public lineItems. Used by
   * detailed / comprehensive endpoints that need the full transaction drill-down.
   */
  private async resolveSectionAccounts(
    statement: CashFlowStatement,
    _params: CashFlowParams
  ): Promise<{
    operating: CashFlowAccount[];
    investing: CashFlowAccount[];
    financing: CashFlowAccount[];
  }> {
    const collect = (section: any): any[] =>
      Array.isArray(section?.lineItems) ? section.lineItems : [];
    const allLines = [
      ...collect(statement.operatingActivities),
      ...collect(statement.investingActivities),
      ...collect(statement.financingActivities)
    ];
    const accountNos = Array.from(
      new Set(
        allLines
          .map((li: any) => li?.accountNo)
          .filter((n: any) => typeof n === 'string' && n.length > 0)
      )
    );

    let coaByNo = new Map<string, { id: string; accountNo: string; accountName: string; accountType: string; financialStatement: string }>();
    if (accountNos.length > 0) {
      const rows = await prisma.chartOfAccounts.findMany({
        where: { accountNo: { in: accountNos } },
        select: {
          id: true,
          accountNo: true,
          accountName: true,
          accountType: true,
          financialStatement: true
        }
      });
      coaByNo = new Map(rows.map((r) => [r.accountNo, r as any]));
    }

    const toAccounts = (section: any): CashFlowAccount[] => {
      const lineItems: any[] = collect(section);
      const out: CashFlowAccount[] = [];
      for (const li of lineItems) {
        const coa = coaByNo.get(li.accountNo);
        if (!coa) continue; // chart of accounts row missing — skip safely
        out.push({
          accountId: coa.id,
          accountNo: coa.accountNo,
          accountName: coa.accountName,
          accountType: coa.accountType,
          financialStatement: coa.financialStatement,
          totalDebits: Number(li.totalDebits || 0),
          totalCredits: Number(li.totalCredits || 0),
          netAmount: Number(li.netAmount ?? li.amount ?? 0),
          cashFlowCategory: '',
          transactions: Array.isArray(li.transactions) ? li.transactions : []
        });
      }
      return out;
    };

    return {
      operating: toAccounts(statement.operatingActivities),
      investing: toAccounts(statement.investingActivities),
      financing: toAccounts(statement.financingActivities)
    };
  }

  /**
   * Get cash flow statement summary (includes line items with transaction breakdown)
   */
  async getCashFlowStatementSummary(params: CashFlowParams): Promise<any> {
    const cashFlowStatement = await this.generateCashFlowStatement(params);

    // Return the full structure with lineItems and transactions
    return {
      period: cashFlowStatement.period,
      operatingActivities: cashFlowStatement.operatingActivities,
      investingActivities: cashFlowStatement.investingActivities,
      financingActivities: cashFlowStatement.financingActivities,
      netCashFlow: cashFlowStatement.netCashFlow,
      activityBasedNetCashFlow: cashFlowStatement.activityBasedNetCashFlow,
      beginningCashBalance: cashFlowStatement.beginningCashBalance,
      endingCashBalance: cashFlowStatement.endingCashBalance,
      currency: cashFlowStatement.currency,
      generatedAt: cashFlowStatement.generatedAt
    };
  }

  /**
   * Get cash flow statement for multiple periods (comparative)
   */
  async getComparativeCashFlowStatement(periods: CashFlowParams[]): Promise<any> {
    const comparativeData = [];

    for (const period of periods) {
      const cashFlowStatement = await this.generateCashFlowStatement(period);
      comparativeData.push({
        period: cashFlowStatement.period,
        operatingActivities: cashFlowStatement.operatingActivities.total,
        investingActivities: cashFlowStatement.investingActivities.total,
        financingActivities: cashFlowStatement.financingActivities.total,
        netCashFlow: cashFlowStatement.netCashFlow,
        activityBasedNetCashFlow: cashFlowStatement.activityBasedNetCashFlow,
        beginningCashBalance: cashFlowStatement.beginningCashBalance,
        endingCashBalance: cashFlowStatement.endingCashBalance,
        currency: cashFlowStatement.currency
      });
    }

    return {
      periods: comparativeData,
      currency: comparativeData[0]?.currency,
      generatedAt: new Date()
    };
  }

  /**
   * Get detailed cash flow statement with transaction breakdown
   */
  async getDetailedCashFlowStatement(params: CashFlowParams): Promise<any> {
    const cashFlowStatement = await this.generateCashFlowStatement(params);
    const sectionAccounts = await this.resolveSectionAccounts(cashFlowStatement, params);

    // Add additional details for each account
    const detailedOperating = await this.addAccountDetails(sectionAccounts.operating, params);
    const detailedInvesting = await this.addAccountDetails(sectionAccounts.investing, params);
    const detailedFinancing = await this.addAccountDetails(sectionAccounts.financing, params);

    return {
      ...cashFlowStatement,
      operatingActivities: {
        ...cashFlowStatement.operatingActivities,
        accounts: detailedOperating
      },
      investingActivities: {
        ...cashFlowStatement.investingActivities,
        accounts: detailedInvesting
      },
      financingActivities: {
        ...cashFlowStatement.financingActivities,
        accounts: detailedFinancing
      }
    };
  }

  /**
   * Add transaction details for each account
   */
  private async addAccountDetails(accounts: CashFlowAccount[], params: CashFlowParams): Promise<any[]> {
    const detailedAccounts = [];

    // Get currency information for filtering
    const currency = params.currencyId 
      ? await prisma.currency.findUnique({ where: { id: params.currencyId } })
      : await prisma.currency.findFirst({ where: { isActive: true } });

    if (!currency) {
      throw new Error("No active currency found");
    }

    for (const account of accounts) {
      // Get all transactions for this account in the period with complete details
      const transactions = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: account.accountId,
          journalEntry: {
            transactionDate: {
              gte: params.startDate,
              lte: params.endDate
            },
            status: "POSTED",
            currencyId: currency.id
          }
        },
        include: {
          journalEntry: {
            include: {
              currency: true,
              createdBy: true,
              expenses: {
                include: {
                  vendor: true,
                  category: true,
                  currency: true
                }
              },
              invoices: {
                include: {
                  customer: true,
                  currency: true
                }
              },
              journalEntryLines: {
                include: {
                  chartOfAccount: true
                }
              }
            }
          },
          chartOfAccount: true
        },
        orderBy: {
          journalEntry: {
            transactionDate: 'desc'
          }
        }
      });

      // Group transactions by journal entry for better organization
      const journalEntries = new Map();
      
      for (const transaction of transactions) {
        const journalEntryId = transaction.journalEntry.id;
        
        if (!journalEntries.has(journalEntryId)) {
          journalEntries.set(journalEntryId, {
            id: transaction.journalEntry.id,
            transactionDate: transaction.journalEntry.transactionDate,
            referenceNumber: transaction.journalEntry.referenceNumber,
            description: transaction.journalEntry.description,
            status: transaction.journalEntry.status,
            totalAmount: parseFloat(transaction.journalEntry.totalAmount.toString()),
            currency: {
              id: transaction.journalEntry.currency.id,
              code: transaction.journalEntry.currency.code,
              name: transaction.journalEntry.currency.name
            },
            createdBy: {
              id: transaction.journalEntry.createdBy.id,
              firstName: transaction.journalEntry.createdBy.firstName,
              lastName: transaction.journalEntry.createdBy.lastName,
              email: transaction.journalEntry.createdBy.email
            },
            expenses: transaction.journalEntry.expenses.map(expense => ({
              id: expense.id,
              description: expense.description,
              amount: parseFloat(expense.amount.toString()),
              vatAmount: expense.vatAmount ? parseFloat(expense.vatAmount.toString()) : 0,
              totalAmount: parseFloat(expense.totalAmount.toString()),
              receiptNumber: expense.receiptNumber,
              isTaxable: expense.isTaxable,
              paymentMethod: expense.paymentMethod,
              status: expense.status,
              vendor: {
                id: expense.vendor.id,
                name: expense.vendor.name,
                email: expense.vendor.email,
                phone: expense.vendor.phone
              },
              category: {
                id: expense.category.id,
                name: expense.category.name
              }
            })),
            invoices: transaction.journalEntry.invoices.map(invoice => ({
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              description: invoice.description,
              amount: parseFloat(invoice.amount.toString()),
              vatAmount: invoice.vatAmount ? parseFloat(invoice.vatAmount.toString()) : 0,
              totalAmount: parseFloat(invoice.totalAmount.toString()),
              isTaxable: invoice.isTaxable,
              status: invoice.status,
              customer: {
                id: invoice.customer.id,
                name: invoice.customer.name,
                email: invoice.customer.email,
                phone: invoice.customer.phone
              },
              items: invoice.items || []
            })),
            lines: []
          });
        }
        
        // Add this line to the journal entry
        // Use Decimal arithmetic - NO ROUNDING during calculations
        const journalEntry = journalEntries.get(journalEntryId);
        journalEntry.lines.push({
          id: transaction.id,
          description: transaction.description,
          debitAmount: new Decimal(transaction.debitAmount).toNumber(),
          creditAmount: new Decimal(transaction.creditAmount).toNumber(),
          vatAmount: transaction.vatAmount ? new Decimal(transaction.vatAmount).toNumber() : 0,
          account: {
            id: transaction.chartOfAccount.id,
            accountNo: transaction.chartOfAccount.accountNo,
            accountName: transaction.chartOfAccount.accountName,
            accountType: transaction.chartOfAccount.accountType,
            financialStatement: transaction.chartOfAccount.financialStatement
          }
        });
      }

      // Calculate totals using Decimal arithmetic - NO ROUNDING
      let totalDebitDecimal = new Decimal(0);
      let totalCreditDecimal = new Decimal(0);
      let totalVatDecimal = new Decimal(0);
      
      for (const t of transactions) {
        totalDebitDecimal = totalDebitDecimal.plus(t.debitAmount);
        totalCreditDecimal = totalCreditDecimal.plus(t.creditAmount);
        if (t.vatAmount) {
          totalVatDecimal = totalVatDecimal.plus(t.vatAmount);
        }
      }
      
      detailedAccounts.push({
        ...account,
        journalEntries: Array.from(journalEntries.values()),
        transactionCount: transactions.length,
        totalDebitAmount: totalDebitDecimal.toNumber(),
        totalCreditAmount: totalCreditDecimal.toNumber(),
        totalVatAmount: totalVatDecimal.toNumber()
      });
    }

    return detailedAccounts;
  }

  /**
   * Get comprehensive detailed cash flow statement with all transaction details
   */
  async getComprehensiveDetailedCashFlowStatement(params: CashFlowParams): Promise<any> {
    const cashFlowStatement = await this.generateCashFlowStatement(params);
    const sectionAccounts = await this.resolveSectionAccounts(cashFlowStatement, params);

    // Get detailed accounts with all transaction information
    const detailedOperating = await this.addAccountDetails(sectionAccounts.operating, params);
    const detailedInvesting = await this.addAccountDetails(sectionAccounts.investing, params);
    const detailedFinancing = await this.addAccountDetails(sectionAccounts.financing, params);

    // Get currency information for filtering
    const currency = params.currencyId 
      ? await prisma.currency.findUnique({ where: { id: params.currencyId } })
      : await prisma.currency.findFirst({ where: { isActive: true } });

    if (!currency) {
      throw new Error("No active currency found");
    }

    // Get all journal entries for the period for complete overview
    const allJournalEntries = await prisma.journalEntry.findMany({
      where: {
        transactionDate: {
          gte: params.startDate,
          lte: params.endDate
        },
        status: "POSTED",
        currencyId: currency.id
      },
      include: {
        currency: true,
        createdBy: true,
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        },
        expenses: {
          include: {
            vendor: true,
            category: true,
            currency: true
          }
        },
        invoices: {
          include: {
            customer: true,
            currency: true
          }
        }
      },
      orderBy: {
        transactionDate: 'desc'
      }
    });

    // Calculate summary statistics
    const summaryStats = {
      totalJournalEntries: allJournalEntries.length,
      totalTransactions: allJournalEntries.reduce((sum, je) => sum + je.journalEntryLines.length, 0),
      // Calculate totals using Decimal arithmetic - NO ROUNDING
      totalDebitAmount: (() => {
        let total = new Decimal(0);
        for (const je of allJournalEntries) {
          for (const line of je.journalEntryLines) {
            total = total.plus(line.debitAmount);
          }
        }
        return total.toNumber();
      })(),
      totalCreditAmount: (() => {
        let total = new Decimal(0);
        for (const je of allJournalEntries) {
          for (const line of je.journalEntryLines) {
            total = total.plus(line.creditAmount);
          }
        }
        return total.toNumber();
      })(),
      totalVatAmount: (() => {
        let total = new Decimal(0);
        for (const je of allJournalEntries) {
          for (const line of je.journalEntryLines) {
            if (line.vatAmount) {
              total = total.plus(line.vatAmount);
            }
          }
        }
        return total.toNumber();
      })(),
      operatingAccounts: detailedOperating.length,
      investingAccounts: detailedInvesting.length,
      financingAccounts: detailedFinancing.length,
      uniqueVendors: new Set(allJournalEntries.flatMap(je => je.expenses.map(e => e.vendor.id))).size,
      uniqueCustomers: new Set(allJournalEntries.flatMap(je => je.invoices.map(i => i.customer.id))).size
    };

    // Group journal entries by cash flow category for better organization
    const journalEntriesByCategory = {
      operating: allJournalEntries.filter(je => 
        je.journalEntryLines.some(line => 
          CashFlowCategorizationService.categorizeAccountsByCashFlow([{
            accountId: line.chartOfAccount.id,
            accountNo: line.chartOfAccount.accountNo,
            accountName: line.chartOfAccount.accountName,
            accountType: line.chartOfAccount.accountType,
            financialStatement: line.chartOfAccount.financialStatement,
            totalDebits: 0,
            totalCredits: 0,
            netAmount: 0,
            cashFlowCategory: ""
          }])[0].cashFlowCategory === "Operating"
        )
      ),
      investing: allJournalEntries.filter(je => 
        je.journalEntryLines.some(line => 
          CashFlowCategorizationService.categorizeAccountsByCashFlow([{
            accountId: line.chartOfAccount.id,
            accountNo: line.chartOfAccount.accountNo,
            accountName: line.chartOfAccount.accountName,
            accountType: line.chartOfAccount.accountType,
            financialStatement: line.chartOfAccount.financialStatement,
            totalDebits: 0,
            totalCredits: 0,
            netAmount: 0,
            cashFlowCategory: ""
          }])[0].cashFlowCategory === "Investing"
        )
      ),
      financing: allJournalEntries.filter(je => 
        je.journalEntryLines.some(line => 
          CashFlowCategorizationService.categorizeAccountsByCashFlow([{
            accountId: line.chartOfAccount.id,
            accountNo: line.chartOfAccount.accountNo,
            accountName: line.chartOfAccount.accountName,
            accountType: line.chartOfAccount.accountType,
            financialStatement: line.chartOfAccount.financialStatement,
            totalDebits: 0,
            totalCredits: 0,
            netAmount: 0,
            cashFlowCategory: ""
          }])[0].cashFlowCategory === "Financing"
        )
      )
    };

    return {
      period: cashFlowStatement.period,
      currency: cashFlowStatement.currency,
      generatedAt: new Date(),
      summary: {
        operatingActivities: {
          total: cashFlowStatement.operatingActivities?.total || 0,
          accountCount: cashFlowStatement.operatingActivities?.lineItems?.length || cashFlowStatement.operatingActivities?.accountCount || 0,
          accounts: detailedOperating
        },
        investingActivities: {
          total: cashFlowStatement.investingActivities?.total || 0,
          accountCount: cashFlowStatement.investingActivities?.lineItems?.length || cashFlowStatement.investingActivities?.accountCount || 0,
          accounts: detailedInvesting
        },
        financingActivities: {
          total: cashFlowStatement.financingActivities?.total || 0,
          accountCount: cashFlowStatement.financingActivities?.lineItems?.length || cashFlowStatement.financingActivities?.accountCount || 0,
          accounts: detailedFinancing
        },
        netCashFlow: cashFlowStatement.netCashFlow,
        activityBasedNetCashFlow: cashFlowStatement.activityBasedNetCashFlow,
        beginningCashBalance: cashFlowStatement.beginningCashBalance,
        endingCashBalance: cashFlowStatement.endingCashBalance
      },
      statistics: summaryStats,
      detailedTransactions: {
        byCategory: journalEntriesByCategory,
        allEntries: allJournalEntries.map(je => ({
          id: je.id,
          transactionDate: je.transactionDate,
          referenceNumber: je.referenceNumber,
          description: je.description,
          status: je.status,
          totalAmount: parseFloat(je.totalAmount.toString()),
          currency: {
            id: je.currency.id,
            code: je.currency.code,
            name: je.currency.name
          },
          createdBy: {
            id: je.createdBy.id,
            firstName: je.createdBy.firstName,
            lastName: je.createdBy.lastName,
            email: je.createdBy.email
          },
          expenses: je.expenses.map(expense => ({
            id: expense.id,
            description: expense.description,
            amount: new Decimal(expense.amount).toNumber(),
            vatAmount: expense.vatAmount ? new Decimal(expense.vatAmount).toNumber() : 0,
            totalAmount: new Decimal(expense.totalAmount).toNumber(),
            receiptNumber: expense.receiptNumber,
            isTaxable: expense.isTaxable,
            paymentMethod: expense.paymentMethod,
            status: expense.status,
            vendor: {
              id: expense.vendor.id,
              name: expense.vendor.name,
              email: expense.vendor.email,
              phone: expense.vendor.phone
            },
            category: {
              id: expense.category.id,
              name: expense.category.name
            }
          })),
          invoices: je.invoices.map(invoice => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            description: invoice.description,
            amount: parseFloat(invoice.amount.toString()),
            vatAmount: invoice.vatAmount ? parseFloat(invoice.vatAmount.toString()) : 0,
            totalAmount: parseFloat(invoice.totalAmount.toString()),
            isTaxable: invoice.isTaxable,
            status: invoice.status,
            customer: {
              id: invoice.customer.id,
              name: invoice.customer.name,
              email: invoice.customer.email,
              phone: invoice.customer.phone
            },
            items: invoice.items || []
          })),
          lines: je.journalEntryLines.map(line => ({
            id: line.id,
            description: line.description,
            debitAmount: parseFloat(line.debitAmount.toString()),
            creditAmount: parseFloat(line.creditAmount.toString()),
            vatAmount: line.vatAmount ? parseFloat(line.vatAmount.toString()) : 0,
            account: {
              id: line.chartOfAccount.id,
              accountNo: line.chartOfAccount.accountNo,
              accountName: line.chartOfAccount.accountName,
              accountType: line.chartOfAccount.accountType,
              financialStatement: line.chartOfAccount.financialStatement
            }
          }))
        }))
      }
    };
  }

  // NOTE: Legacy heuristic `buildPresentation(accounts, beginning, ending)` was removed.
  // The presentation block is now built by `buildPresentationFromSections` (direct-method lines)
  // so that presentation section totals always match the activity-level `total` and `lineItems`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _unused_buildPresentation_REMOVED({
    accounts,
    beginningCashBalance,
    endingCashBalance
  }: {
    accounts: CashFlowAccount[];
    beginningCashBalance: number;
    endingCashBalance: number;
  }) {
    const accountNoValue = (accountNo: string) => {
      const numeric = parseInt(accountNo, 10);
      return Number.isNaN(numeric) ? 0 : numeric;
    };

    const sumAccounts = (filter: (account: CashFlowAccount) => boolean) =>
      accounts.filter(filter).reduce((sum, account) => sum + account.netAmount, 0);

    const cashReceiptsCustomers = sumAccounts(
      account =>
        account.accountType === "Revenue" &&
        accountNoValue(account.accountNo) >= 4000 &&
        accountNoValue(account.accountNo) <= 4099
    );

    const cashPaidGeneralOperating = sumAccounts(account => {
      const no = account.accountNo;
      return (
        ["5000", "5010", "5020", "5040", "5050", "5060", "5070", "5080", "5090"].includes(no)
      );
    });

    const cashPaidWages = sumAccounts(account => account.accountNo === "5030");

    const cashPaidInterest = sumAccounts(account =>
      account.accountName.toLowerCase().includes("interest")
    );

    const cashPaidIncomeTaxes = sumAccounts(account =>
      account.accountName.toLowerCase().includes("tax") ||
      (accountNoValue(account.accountNo) >= 6100 && accountNoValue(account.accountNo) <= 6199)
    );

    const depreciationAndAmortization = sumAccounts(account =>
      account.accountName.toLowerCase().includes("depreciation") ||
      account.accountName.toLowerCase().includes("amortization")
    );

    const changeInInventory = sumAccounts(account =>
      account.accountName.toLowerCase().includes("inventory")
    );

    const changeInOperatingAssetsRaw = sumAccounts(account => {
      const value = accountNoValue(account.accountNo);
      return (
        (account.accountType === "Asset" || 
         account.accountType === "Current Asset") &&
        !account.accountName.toLowerCase().includes("cash") &&
        value >= 1200 &&
        value < 1500 &&
        !account.accountName.toLowerCase().includes("inventory")
      );
    });
    const changeInOperatingAssets = -changeInOperatingAssetsRaw;

    const changeInOperatingLiabilities = sumAccounts(account => {
      const value = accountNoValue(account.accountNo);
      return account.accountType === "Liability" && value >= 2000 && value < 3000;
    });

    const receiptsTotal = cashReceiptsCustomers;
    const paymentsTotal =
      -cashPaidGeneralOperating - cashPaidWages - cashPaidInterest - cashPaidIncomeTaxes;

    const netIncomeOperating = receiptsTotal + paymentsTotal;
    const additionsTotal = depreciationAndAmortization;
    const adjustmentsTotal =
      -changeInInventory + changeInOperatingAssets + changeInOperatingLiabilities;

    const totalOperating =
      netIncomeOperating + additionsTotal + adjustmentsTotal;

    const propertyAccounts = accounts.filter(account => {
      const value = accountNoValue(account.accountNo);
      return value >= 1100 && value < 1500 && (
        account.accountType === "Asset" || 
        account.accountType === "Fixed Asset" || 
        account.accountType === "Long-Term Asset" || 
        account.accountType === "Non-Current Asset"
      );
    });

    let purchaseProperty = 0;
    let saleProperty = 0;
    for (const account of propertyAccounts) {
      if (account.netAmount > 0) {
        purchaseProperty += account.netAmount;
      } else if (account.netAmount < 0) {
        saleProperty += Math.abs(account.netAmount);
      }
    }

    const investmentAccounts = accounts.filter(account => {
      const value = accountNoValue(account.accountNo);
      return value >= 1500 && value < 1600;
    });

    let purchaseInvestments = 0;
    let saleInvestments = 0;
    for (const account of investmentAccounts) {
      if (account.netAmount > 0) {
        purchaseInvestments += account.netAmount;
      } else if (account.netAmount < 0) {
        saleInvestments += Math.abs(account.netAmount);
      }
    }

    const totalInvesting =
      saleProperty +
      saleInvestments -
      purchaseProperty -
      purchaseInvestments;

    const loanAccounts = accounts.filter(account => account.accountNo === "2200");
    let newBankLoans = 0;
    let repaymentBankLoans = 0;
    for (const account of loanAccounts) {
      if (account.netAmount > 0) {
        newBankLoans += account.netAmount;
      } else if (account.netAmount < 0) {
        repaymentBankLoans += Math.abs(account.netAmount);
      }
    }

    const equityAccounts = accounts.filter(account => account.accountNo === "3000");
    let proceedsCommonStock = 0;
    let dividends = 0;
    for (const account of equityAccounts) {
      if (account.netAmount > 0) {
        proceedsCommonStock += account.netAmount;
      } else if (account.netAmount < 0) {
        dividends += Math.abs(account.netAmount);
      }
    }

    const dividendExpenseAccounts = accounts.filter(account =>
      account.accountName.toLowerCase().includes("dividend")
    );
    for (const account of dividendExpenseAccounts) {
      if (account.netAmount > 0) {
        dividends += account.netAmount;
      }
    }

    const totalFinancing =
      newBankLoans +
      proceedsCommonStock -
      repaymentBankLoans -
      dividends;

    return {
      operating: {
        label: "Operating Activities",
        cashReceipts: [
          { label: "Customers", amount: receiptsTotal }
        ],
        cashPayments: [
          { label: "General operating and admin expenses", amount: -cashPaidGeneralOperating },
          { label: "Wage expenses", amount: -cashPaidWages },
          { label: "Interest", amount: -cashPaidInterest },
          { label: "Income taxes", amount: -cashPaidIncomeTaxes }
        ],
        additions: [
          { label: "Other operations", amount: 0 },
          { label: "Depreciation and amortization", amount: depreciationAndAmortization }
        ],
        adjustments: [
          { label: "Change in inventory", amount: -changeInInventory },
          { label: "Change in operating assets", amount: changeInOperatingAssets },
          { label: "Change in operating liabilities", amount: changeInOperatingLiabilities }
        ],
        total: totalOperating
      },
      investing: {
        label: "Investing Activities",
        cashReceipts: [
          { label: "Sale of property and equipment", amount: saleProperty },
          { label: "Collection of loans", amount: 0 },
          { label: "Proceeds from disposal of investments", amount: saleInvestments }
        ],
        cashPayments: [
          { label: "Purchase of property and equipment", amount: -purchaseProperty },
          { label: "Loans to others", amount: 0 },
          { label: "Purchase of investments", amount: -purchaseInvestments }
        ],
        total: totalInvesting
      },
      financing: {
        label: "Financing Activities",
        cashReceipts: [
          { label: "New bank loans", amount: newBankLoans },
          { label: "Proceeds from issuing common stock", amount: proceedsCommonStock }
        ],
        cashPayments: [
          { label: "Repayment of bank loans", amount: -repaymentBankLoans },
          { label: "Dividends", amount: -dividends }
        ],
        total: totalFinancing
      },
      // Must match GL: endingCashBalance − beginningCashBalance (section totals above are illustrative).
      netChangeInCash: endingCashBalance - beginningCashBalance,
      beginningCashBalance,
      endingCashBalance
    };
  }
} 