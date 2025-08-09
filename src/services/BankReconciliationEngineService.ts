// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

export interface MatchResult {
  bankTransactionId: string;
  journalEntryId: string;
  matchType: 'EXACT' | 'FUZZY' | 'MANUAL';
  confidenceScore: number;
  bankTransaction: any;
  journalEntry: any;
}

export interface ReconciliationSummary {
  totalTransactions: number;
  matchedCount: number;
  unmatchedCount: number;
  overallAccuracy: number;
  confidenceThreshold: number;
}

export class BankReconciliationEngineService {
  /**
   * Run reconciliation for a specific reconciliation session
   */
  static async runReconciliation(
    reconciliationId: string,
    userId: string,
    confidenceThreshold: number = 90
  ): Promise<ReconciliationSummary> {
    try {
      // Get bank transactions
      const bankTransactions = await prisma.bankTransaction.findMany({
        where: { 
          reconciliationId,
          isMatched: false 
        },
        orderBy: { transactionDate: 'asc' }
      });

      // Get relevant journal entries (Cash and Cash Equivalents)
      const cashAccount = await prisma.chartOfAccounts.findFirst({
        where: { 
          accountName: { contains: 'Cash and Cash Equivalents' },
          isActive: true 
        }
      });

      if (!cashAccount) {
        throw new Error('Cash and Cash Equivalents account not found');
      }

      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          status: 'POSTED',
          journalEntryLines: {
            some: {
              chartOfAccountId: cashAccount.id
            }
          }
        },
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: true
            }
          },
          currency: true
        },
        orderBy: { transactionDate: 'asc' }
      });

      let matchedCount = 0;
      const matches: MatchResult[] = [];

      // Process each bank transaction
      for (const bankTx of bankTransactions) {
        const match = await this.findBestMatch(bankTx, journalEntries);
        
        if (match && match.confidenceScore >= confidenceThreshold) {
          matches.push(match);
          matchedCount++;
        }
      }

      // Create reconciliation results
      await this.createReconciliationResults(reconciliationId, matches, userId);

      // Update reconciliation summary
      const summary = await this.updateReconciliationSummary(
        reconciliationId,
        bankTransactions.length,
        matchedCount
      );

      // Create audit trail
      await prisma.reconciliationAuditTrail.create({
        data: {
          reconciliationId,
          action: 'PROCESS',
          details: {
            totalTransactions: bankTransactions.length,
            matchedCount,
            unmatchedCount: bankTransactions.length - matchedCount,
            confidenceThreshold
          },
          createdById: userId
        }
      });

      return summary;

    } catch (error) {
      console.error('Error running reconciliation:', error);
      throw new Error('Failed to run reconciliation');
    }
  }

  /**
   * Find the best match for a bank transaction
   */
  private static async findBestMatch(
    bankTransaction: any,
    journalEntries: any[]
  ): Promise<MatchResult | null> {
    const matches: MatchResult[] = [];

    for (const journalEntry of journalEntries) {
      // Get cash-related lines only
      const cashLines = journalEntry.journalEntryLines.filter(
        (line: any) => line.chartOfAccount.accountName.includes('Cash')
      );

      for (const line of cashLines) {
        const match = this.calculateMatch(bankTransaction, journalEntry, line);
        if (match) {
          matches.push(match);
        }
      }
    }

    // Return the best match (highest confidence)
    if (matches.length > 0) {
      matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
      return matches[0];
    }

    return null;
  }

  /**
   * Calculate match between bank transaction and journal entry
   */
  private static calculateMatch(
    bankTransaction: any,
    journalEntry: any,
    journalLine: any
  ): MatchResult | null {
    const bankAmount = parseFloat(bankTransaction.amount.toString());
    const journalAmount = parseFloat(journalLine.debitAmount.toString()) || 
                         parseFloat(journalLine.creditAmount.toString());

    // Amount must match (with tolerance for rounding)
    if (Math.abs(bankAmount - journalAmount) > 0.01) {
      return null;
    }

    // Calculate date difference
    const bankDate = new Date(bankTransaction.transactionDate);
    const journalDate = new Date(journalEntry.transactionDate);
    const dateDiff = Math.abs(bankDate.getTime() - journalDate.getTime()) / (1000 * 60 * 60 * 24);

    // Calculate description similarity
    const descriptionSimilarity = this.calculateSimilarity(
      bankTransaction.description.toLowerCase(),
      journalEntry.description.toLowerCase()
    );

    let confidenceScore = 0;
    let matchType: 'EXACT' | 'FUZZY' | 'MANUAL' = 'FUZZY';

    // Amount match (40% weight)
    confidenceScore += 40;

    // Date match (30% weight)
    if (dateDiff === 0) {
      confidenceScore += 30;
    } else if (dateDiff <= 1) {
      confidenceScore += 25;
    } else if (dateDiff <= 3) {
      confidenceScore += 15;
    } else if (dateDiff <= 7) {
      confidenceScore += 10;
    }

    // Description similarity (30% weight)
    confidenceScore += descriptionSimilarity * 30;

    // Determine match type
    if (dateDiff === 0 && descriptionSimilarity > 0.9) {
      matchType = 'EXACT';
    }

    return {
      bankTransactionId: bankTransaction.id,
      journalEntryId: journalEntry.id,
      matchType,
      confidenceScore: Math.min(100, confidenceScore),
      bankTransaction,
      journalEntry
    };
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   */
  private static calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Create reconciliation results in database
   */
  private static async createReconciliationResults(
    reconciliationId: string,
    matches: MatchResult[],
    userId: string
  ): Promise<void> {
    const results = matches.map(match => ({
      reconciliationId,
      bankTransactionId: match.bankTransactionId,
      journalEntryId: match.journalEntryId,
      matchType: match.matchType,
      confidenceScore: new Decimal(match.confidenceScore),
      status: 'PENDING',
      createdById: userId
    }));

    await prisma.reconciliationResult.createMany({
      data: results
    });

    // Update bank transactions as matched
    const bankTransactionIds = matches.map(m => m.bankTransactionId);
    await prisma.bankTransaction.updateMany({
      where: { id: { in: bankTransactionIds } },
      data: { 
        isMatched: true,
        confidenceScore: new Decimal(matches.find(m => m.bankTransactionId === bankTransactionIds[0])?.confidenceScore || 0)
      }
    });
  }

  /**
   * Update reconciliation summary
   */
  private static async updateReconciliationSummary(
    reconciliationId: string,
    totalTransactions: number,
    matchedCount: number
  ): Promise<ReconciliationSummary> {
    const unmatchedCount = totalTransactions - matchedCount;
    const overallAccuracy = totalTransactions > 0 ? (matchedCount / totalTransactions) * 100 : 0;

    await prisma.bankReconciliation.update({
      where: { id: reconciliationId },
      data: {
        matchedCount,
        unmatchedCount,
        overallAccuracy: new Decimal(overallAccuracy),
        status: 'COMPLETED'
      }
    });

    return {
      totalTransactions,
      matchedCount,
      unmatchedCount,
      overallAccuracy,
      confidenceThreshold: 90
    };
  }

  /**
   * Get unmatched transactions for manual review
   */
  static async getUnmatchedTransactions(
    reconciliationId: string,
    minAmount: number = 5.00
  ): Promise<any[]> {
    return await prisma.bankTransaction.findMany({
      where: {
        reconciliationId,
        isMatched: false,
        amount: { gte: new Decimal(minAmount) }
      },
      orderBy: { transactionDate: 'asc' }
    });
  }

  /**
   * Get potential matches for a specific transaction
   */
  static async getPotentialMatches(
    bankTransactionId: string,
    limit: number = 10
  ): Promise<any[]> {
    const bankTransaction = await prisma.bankTransaction.findUnique({
      where: { id: bankTransactionId }
    });

    if (!bankTransaction) {
      throw new Error('Bank transaction not found');
    }

    const cashAccount = await prisma.chartOfAccounts.findFirst({
      where: { 
        accountName: { contains: 'Cash and Cash Equivalents' },
        isActive: true 
      }
    });

    if (!cashAccount) {
      throw new Error('Cash and Cash Equivalents account not found');
    }

    // Find journal entries with similar amounts
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        status: 'POSTED',
        totalAmount: bankTransaction.amount,
        journalEntryLines: {
          some: {
            chartOfAccountId: cashAccount.id
          }
        }
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        },
        currency: true
      },
      take: limit,
      orderBy: { transactionDate: 'desc' }
    });

    return journalEntries.map(entry => ({
      ...entry,
      similarity: this.calculateSimilarity(
        bankTransaction.description.toLowerCase(),
        entry.description.toLowerCase()
      )
    }));
  }

  /**
   * Approve manual match
   */
  static async approveManualMatch(
    reconciliationId: string,
    bankTransactionId: string,
    journalEntryId: string,
    userId: string
  ): Promise<void> {
    await prisma.reconciliationResult.create({
      data: {
        reconciliationId,
        bankTransactionId,
        journalEntryId,
        matchType: 'MANUAL',
        confidenceScore: new Decimal(100),
        status: 'APPROVED',
        createdById: userId
      }
    });

    await prisma.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { 
        isMatched: true,
        confidenceScore: new Decimal(100),
        matchedJournalEntryId: journalEntryId
      }
    });

    // Update reconciliation summary
    await this.updateReconciliationSummary(
      reconciliationId,
      0, // Will be calculated from actual counts
      0
    );

    // Create audit trail
    await prisma.reconciliationAuditTrail.create({
      data: {
        reconciliationId,
        action: 'MANUAL_MATCH',
        details: {
          bankTransactionId,
          journalEntryId,
          status: 'APPROVED'
        },
        createdById: userId
      }
    });
  }
} 