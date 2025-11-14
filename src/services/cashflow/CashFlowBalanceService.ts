// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../utils/database";
import { CashFlowAccount } from "./types";

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
            cashFlowCategory: ""
          });
        }

        const account = accountBalances.get(accountId)!;
        account.totalDebits += parseFloat(line.debitAmount.toString());
        account.totalCredits += parseFloat(line.creditAmount.toString());
      }
    }

    // Calculate net amounts based on account type
    for (const account of accountBalances.values()) {
      if (account.accountType === "Asset") {
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
    }

    return Array.from(accountBalances.values());
  }

  /**
   * Get cash balances for beginning and end of period
   * 
   * According to accounting standards (IFRS/GAAP), Cash and Cash Equivalents includes:
   * - Physical cash (petty cash)
   * - Bank accounts (checking, savings, money market accounts)
   * - Short-term, highly liquid investments (3 months or less)
   * 
   * This method includes:
   * 1. All bank accounts (via Bank.glAccountId)
   * 2. Accounts with "Cash" in the name
   * 3. Accounts with "Bank" in the name
   * 4. Current Asset accounts that are cash-related (typically 10xx range)
   */
  static async getCashBalances(startDate: Date, endDate: Date, currencyId: string): Promise<{ beginning: number; ending: number }> {
    // Get all cash and cash equivalent accounts
    const cashAccountIds = new Set<string>();

    // 1. Get all bank accounts and their GL accounts
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

    for (const bank of banks) {
      if (bank.glAccount) {
        cashAccountIds.add(bank.glAccount.id);
      }
    }

    // 2. Get accounts with "Cash" in the name (includes "Cash and Cash Equivalents", "Petty Cash", etc.)
    const cashNamedAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        accountName: {
          contains: "Cash"
        },
        isActive: true
      },
      select: { id: true }
    });

    for (const account of cashNamedAccounts) {
      cashAccountIds.add(account.id);
    }

    // 3. Get accounts with "Bank" in the name (in case some bank accounts aren't linked via Bank model)
    const bankNamedAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        accountName: {
          contains: "Bank"
        },
        isActive: true
      },
      select: { id: true }
    });

    for (const account of bankNamedAccounts) {
      cashAccountIds.add(account.id);
    }

    // 4. Get Current Asset accounts that are cash-related (typically account numbers 1000-1099)
    // These are cash, bank accounts, and cash equivalents
    const cashRelatedAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        accountType: "Current Asset",
        accountNo: {
          gte: "1000",
          lt: "1100" // Account numbers 1000-1099 are typically cash/bank accounts
        },
        isActive: true
      },
      select: { id: true }
    });

    for (const account of cashRelatedAccounts) {
      cashAccountIds.add(account.id);
    }

    // Convert Set to Array for processing
    const cashAccountIdsArray = Array.from(cashAccountIds);

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
      const beginningTransactions = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: accountId,
          journalEntry: {
            transactionDate: {
              lt: startDate
            },
            status: "POSTED",
            currencyId,
            // Exclude journal entries linked to voided/reversed cashbook entries
            cashbookEntries: {
              none: {
                OR: [
                  { status: 'VOIDED' },
                  { reversedAt: { not: null } }
                ]
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
          }
        }
      });

      // Get ending balance (all transactions up to end date)
      // Exclude journal entries linked to voided/reversed cashbook entries
      const endingTransactions = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: accountId,
          journalEntry: {
            transactionDate: {
              lte: endDate
            },
            status: "POSTED",
            currencyId,
            // Exclude journal entries linked to voided/reversed cashbook entries
            cashbookEntries: {
              none: {
                OR: [
                  { status: 'VOIDED' },
                  { reversedAt: { not: null } }
                ]
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
          }
        }
      });

      // Calculate balances (for Asset accounts: Debits increase, Credits decrease)
      const beginningDebits = beginningTransactions.reduce((sum, t) => sum + parseFloat(t.debitAmount.toString()), 0);
      const beginningCredits = beginningTransactions.reduce((sum, t) => sum + parseFloat(t.creditAmount.toString()), 0);
      beginningBalance += beginningDebits - beginningCredits;

      const endingDebits = endingTransactions.reduce((sum, t) => sum + parseFloat(t.debitAmount.toString()), 0);
      const endingCredits = endingTransactions.reduce((sum, t) => sum + parseFloat(t.creditAmount.toString()), 0);
      endingBalance += endingDebits - endingCredits;
    }

    return { beginning: beginningBalance, ending: endingBalance };
  }
} 