// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import { prisma } from "../../utils/database";
import { buildJournalEntryWhereForGlReporting } from "../../utils/journalEntryReportingFilter";
import { BalanceSheetService } from "../BalanceSheetService";
import { CashFlowAccount, CashFlowTransaction } from "./types";
import { baseContext, isBaseReport, toBaseAmounts } from "../../utils/baseCurrencyAmounts";

export class CashFlowBalanceService {
  /**
   * Calculate account balances from journal entries
   */
  static async calculateAccountBalances(journalEntries: any[]): Promise<CashFlowAccount[]> {
    const accountBalances = new Map<string, CashFlowAccount>();

    // Process all journal entry lines
    for (const journalEntry of journalEntries) {
      for (const line of journalEntry.journalEntryLines) {
        const accountId = line.chartOfAccount.id;
        
        if (!accountBalances.has(accountId)) {
          accountBalances.set(accountId, {
            accountId: line.chartOfAccount.id,
            accountNo: line.chartOfAccount.accountNo,
            accountName: line.chartOfAccount.accountName,
            accountType: line.chartOfAccount.accountType,
            financialStatement: line.chartOfAccount.financialStatement,
            totalDebits: 0,
            totalCredits: 0,
            netAmount: 0,
            cashFlowCategory: "",
            transactions: []
          });
        }

        const account = accountBalances.get(accountId)!;
        // Use Decimal arithmetic - NO ROUNDING during calculations
        const debitAmt = new Decimal(line.debitAmount || 0).toNumber();
        const creditAmt = new Decimal(line.creditAmount || 0).toNumber();
        
        account.totalDebits = new Decimal(account.totalDebits).plus(debitAmt).toNumber();
        account.totalCredits = new Decimal(account.totalCredits).plus(creditAmt).toNumber();

        // Determine source and get actual transaction details
        let source = "MANUAL_ENTRY";
        let sourceTransaction: any = null;

        if (journalEntry.cashbookEntries && journalEntry.cashbookEntries.length > 0) {
          source = "CASHBOOK";
          const cashbookEntry = journalEntry.cashbookEntries[0];
          sourceTransaction = {
            id: cashbookEntry.id,
            type: cashbookEntry.type,
            amount: cashbookEntry.amount ? new Decimal(cashbookEntry.amount).toNumber() : 0,
            description: cashbookEntry.description,
            reference: cashbookEntry.reference,
            transactionDate: cashbookEntry.transactionDate,
            status: cashbookEntry.status,
            bank: cashbookEntry.bank ? {
              id: cashbookEntry.bank.id,
              name: cashbookEntry.bank.name,
              accountNumber: cashbookEntry.bank.accountNumber
            } : null,
            customer: cashbookEntry.customer ? {
              id: cashbookEntry.customer.id,
              name: cashbookEntry.customer.name,
              email: cashbookEntry.customer.email
            } : null,
            vendor: cashbookEntry.vendor ? {
              id: cashbookEntry.vendor.id,
              name: cashbookEntry.vendor.name,
              email: cashbookEntry.vendor.email
            } : null
          };
        } else if (journalEntry.invoices && journalEntry.invoices.length > 0) {
          source = "INVOICE";
          const invoice = journalEntry.invoices[0];
          sourceTransaction = {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount ? new Decimal(invoice.amount).toNumber() : 0,
            vatAmount: invoice.vatAmount ? new Decimal(invoice.vatAmount).toNumber() : 0,
            totalAmount: invoice.totalAmount ? new Decimal(invoice.totalAmount).toNumber() : 0,
            description: invoice.description,
            transactionDate: invoice.transactionDate,
            status: invoice.status,
            isTaxable: invoice.isTaxable,
            customer: invoice.customer ? {
              id: invoice.customer.id,
              name: invoice.customer.name,
              email: invoice.customer.email
            } : null
          };
        } else if (journalEntry.expenses && journalEntry.expenses.length > 0) {
          source = "EXPENSE";
          const expense = journalEntry.expenses[0];
          sourceTransaction = {
            id: expense.id,
            receiptNumber: expense.receiptNumber,
            amount: expense.amount ? new Decimal(expense.amount).toNumber() : 0,
            vatAmount: expense.vatAmount ? new Decimal(expense.vatAmount).toNumber() : 0,
            totalAmount: expense.totalAmount ? new Decimal(expense.totalAmount).toNumber() : 0,
            description: expense.description,
            transactionDate: expense.transactionDate,
            status: expense.status,
            paymentMethod: expense.paymentMethod,
            isTaxable: expense.isTaxable,
            vendor: expense.vendor ? {
              id: expense.vendor.id,
              name: expense.vendor.name,
              email: expense.vendor.email
            } : null,
            category: expense.category ? {
              id: expense.category.id,
              name: expense.category.name
            } : null
          };
        } else if (journalEntry.revenues && journalEntry.revenues.length > 0) {
          source = "REVENUE";
          const revenue = journalEntry.revenues[0];
          sourceTransaction = {
            id: revenue.id,
            amount: revenue.amount ? new Decimal(revenue.amount).toNumber() : 0,
            vatAmount: revenue.vatAmount ? new Decimal(revenue.vatAmount).toNumber() : 0,
            totalAmount: revenue.totalAmount ? new Decimal(revenue.totalAmount).toNumber() : 0,
            description: revenue.description,
            transactionDate: revenue.transactionDate,
            status: revenue.status,
            paymentMethod: revenue.paymentMethod,
            isTaxable: revenue.isTaxable,
            source: revenue.source ? {
              id: revenue.source.id,
              name: revenue.source.name
            } : null,
            category: revenue.category ? {
              id: revenue.category.id,
              name: revenue.category.name
            } : null
          };
        } else {
          // Manual entry - use journal entry details
          sourceTransaction = {
            id: journalEntry.id,
            referenceNumber: journalEntry.referenceNumber,
            description: journalEntry.description,
            transactionDate: journalEntry.transactionDate,
            status: journalEntry.status
          };
        }

        // Add transaction to breakdown
        account.transactions.push({
          id: line.id,
          date: journalEntry.transactionDate.toISOString().split('T')[0],
          reference: journalEntry.referenceNumber || "",
          description: journalEntry.description || "",
          debitAmount: debitAmt,
          creditAmount: creditAmt,
          source: source,
          journalEntry: {
            id: journalEntry.id,
            referenceNumber: journalEntry.referenceNumber,
            description: journalEntry.description,
            transactionDate: journalEntry.transactionDate,
            status: journalEntry.status,
            currencyId: journalEntry.currencyId || null
          },
          sourceTransaction: sourceTransaction,
          journalEntryId: journalEntry.id,
          journalEntryStatus: journalEntry.status
        });
      }
    }

    // Calculate net amounts based on account type and sort transactions
    for (const account of accountBalances.values()) {
      if (account.accountType === "Asset" || 
          account.accountType === "Fixed Asset" || 
          account.accountType === "Long-Term Asset" || 
          account.accountType === "Non-Current Asset" ||
          account.accountType === "Current Asset") {
        // Asset accounts: Debits increase, Credits decrease
        account.netAmount = account.totalDebits - account.totalCredits;
      } else if (account.accountType === "Liability" || account.accountType === "Equity") {
        // Liability/Equity accounts: Credits increase, Debits decrease
        account.netAmount = account.totalCredits - account.totalDebits;
      } else if (account.accountType === "Revenue") {
        // Revenue accounts: Credits increase, Debits decrease
        account.netAmount = account.totalCredits - account.totalDebits;
      } else if (account.accountType === "Expense") {
        // Expense accounts: Debits increase, Credits decrease
        account.netAmount = account.totalDebits - account.totalCredits;
      }
      
      // Sort transactions by date
      account.transactions.sort((a, b) => a.date.localeCompare(b.date));
    }

    return Array.from(accountBalances.values());
  }

  /**
   * Beginning / ending cash for the statement — same GL accounts and rules as
   * BalanceSheetService cash & equivalents (active Balance Sheet COA rows only).
   */
  static async getCashBalances(startDate: Date, endDate: Date, currencyId: string): Promise<{ beginning: number; ending: number }> {
    // Same universe + rules as BalanceSheetService "Cash and Cash Equivalents" (Balance Sheet COA rows only).
    const banks = await prisma.bank.findMany({
      where: {
        isActive: true,
        glAccount: {
          isActive: true
        }
      },
      include: {
        glAccount: true
      }
    });

    const bankGLAccountIds = new Set<string>();
    for (const bank of banks) {
      if (bank.glAccount) {
        bankGLAccountIds.add(bank.glAccount.id);
      }
    }

    const bsAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        financialStatement: { in: ["Balance Sheet", "Balance sheet"] },
        isActive: true
      },
      select: {
        id: true,
        accountNo: true,
        accountName: true,
        accountType: true
      }
    });

    const cashAccountIdsArray = bsAccounts
      .filter((a) => BalanceSheetService.isCashOrBankEquivalentForReporting(a, bankGLAccountIds))
      .map((a) => a.id);

    if (cashAccountIdsArray.length === 0) {
      console.warn("⚠️  No cash and cash equivalent accounts found. Cash flow statement may be inaccurate.");
      return { beginning: 0, ending: 0 };
    }

    console.log(`💰 Found ${cashAccountIdsArray.length} cash and cash equivalent account(s) for cash flow calculation`);

    let beginningBalance = 0;
    let endingBalance = 0;

    // Calculate balances for all cash accounts
    for (const accountId of cashAccountIdsArray) {
      // Get beginning balance (all transactions before start date)
      // Exclude journal entries linked to voided/reversed cashbook entries
      // the base currency (or none) covers every currency at base amounts (FX-01)
      const baseCtx = await baseContext();
      const baseMode = await isBaseReport(currencyId, baseCtx);
      const rateSel = { include: { journalEntry: { select: { currencyId: true, usdZwgRateSnapshot: true, transactionDate: true } } } };
      let beginningTransactions: any[] = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: accountId,
          journalEntry: {
            is: buildJournalEntryWhereForGlReporting({ lt: startDate }, baseMode ? undefined : currencyId)
          }
        },
        ...rateSel
      });

      let endingTransactions: any[] = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: accountId,
          journalEntry: {
            is: buildJournalEntryWhereForGlReporting({ lte: endDate }, baseMode ? undefined : currencyId)
          }
        },
        ...rateSel
      });
      if (baseMode) {
        beginningTransactions = (await toBaseAmounts(beginningTransactions, baseCtx)).lines;
        endingTransactions = (await toBaseAmounts(endingTransactions, baseCtx)).lines;
      }

      // Calculate balances using Decimal arithmetic - NO ROUNDING (for Asset accounts: Debits increase, Credits decrease)
      let beginningDebitsDecimal = new Decimal(0);
      let beginningCreditsDecimal = new Decimal(0);
      let endingDebitsDecimal = new Decimal(0);
      let endingCreditsDecimal = new Decimal(0);
      
      for (const t of beginningTransactions) {
        beginningDebitsDecimal = beginningDebitsDecimal.plus(t.debitAmount);
        beginningCreditsDecimal = beginningCreditsDecimal.plus(t.creditAmount);
      }
      
      for (const t of endingTransactions) {
        endingDebitsDecimal = endingDebitsDecimal.plus(t.debitAmount);
        endingCreditsDecimal = endingCreditsDecimal.plus(t.creditAmount);
      }
      
      const beginningDebits = beginningDebitsDecimal.toNumber();
      const beginningCredits = beginningCreditsDecimal.toNumber();
      beginningBalance = new Decimal(beginningBalance).plus(beginningDebits).minus(beginningCredits).toNumber();

      const endingDebits = endingDebitsDecimal.toNumber();
      const endingCredits = endingCreditsDecimal.toNumber();
      endingBalance = new Decimal(endingBalance).plus(endingDebits).minus(endingCredits).toNumber();
    }

    return { beginning: beginningBalance, ending: endingBalance };
  }
} 