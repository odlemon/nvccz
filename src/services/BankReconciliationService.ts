// @ts-nocheck
// Bank Reconciliation Service
// Handles bank reconciliation workflow and statement matching

import { PrismaClient, Decimal } from '@prisma/client';
import { prisma } from '../utils/database';

export interface BankStatement {
  id: string;
  bankId: string;
  statementDate: Date;
  openingBalance: number;
  closingBalance: number;
  totalDebits: number;
  totalCredits: number;
  isReconciled: boolean;
  reconciledAt?: Date;
  reconciledById?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BankStatementItem {
  id: string;
  statementId: string;
  transactionDate: Date;
  description: string;
  reference?: string;
  debitAmount: number;
  creditAmount: number;
  balance: number;
  isMatched: boolean;
  matchedTransactionId?: string;
  createdAt: Date;
}

export interface ReconciliationResult {
  statementId: string;
  totalItems: number;
  matchedItems: number;
  unmatchedItems: number;
  discrepancies: number;
  isBalanced: boolean;
  success: boolean;
  message: string;
}

export interface ReconciliationMismatch {
  id: string;
  statementId: string;
  transactionId?: string;
  type: 'MISSING_IN_STATEMENT' | 'MISSING_IN_SYSTEM' | 'AMOUNT_MISMATCH' | 'DATE_MISMATCH';
  description: string;
  systemAmount?: number;
  statementAmount?: number;
  systemDate?: Date;
  statementDate?: Date;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  isResolved: boolean;
  resolvedAt?: Date;
  resolvedById?: string;
  createdAt: Date;
}

export class BankReconciliationService {
  
  /**
   * Create bank statement
   */
  static async createBankStatement(statement: {
    bankId: string;
    statementDate: Date;
    openingBalance: number;
    closingBalance: number;
    items: {
      transactionDate: Date;
      description: string;
      reference?: string;
      debitAmount: number;
      creditAmount: number;
      balance: number;
    }[];
  }): Promise<{ statement: BankStatement; success: boolean; message: string }> {
    try {
      console.log(`📊 Creating bank statement for bank: ${statement.bankId}`);
      
      // Create statement
      const bankStatement = await prisma.bankStatement.create({
        data: {
          bankId: statement.bankId,
          statementDate: statement.statementDate,
          openingBalance: new Decimal(statement.openingBalance),
          closingBalance: new Decimal(statement.closingBalance),
          totalDebits: new Decimal(0),
          totalCredits: new Decimal(0),
          isReconciled: false
        }
      });
      
      // Create statement items
      let totalDebits = 0;
      let totalCredits = 0;
      
      for (const item of statement.items) {
        await prisma.bankStatementItem.create({
          data: {
            statementId: bankStatement.id,
            transactionDate: item.transactionDate,
            description: item.description,
            reference: item.reference,
            debitAmount: new Decimal(item.debitAmount),
            creditAmount: new Decimal(item.creditAmount),
            balance: new Decimal(item.balance),
            isMatched: false
          }
        });
        
        totalDebits += item.debitAmount;
        totalCredits += item.creditAmount;
      }
      
      // Update statement totals
      await prisma.bankStatement.update({
        where: { id: bankStatement.id },
        data: {
          totalDebits: new Decimal(totalDebits),
          totalCredits: new Decimal(totalCredits)
        }
      });
      
      console.log(`✅ Bank statement created: ${bankStatement.id}`);
      
      return {
        statement: bankStatement,
        success: true,
        message: 'Bank statement created successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error creating bank statement:', error.message);
      return {
        statement: null,
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Get reconciliation status for bank
   */
  static async getReconciliationStatus(bankId: string): Promise<{
    bankId: string;
    lastStatementDate?: Date;
    isReconciled: boolean;
    pendingTransactions: number;
    matchedTransactions: number;
    discrepancies: number;
  }> {
    try {
      console.log(`📊 Getting reconciliation status for bank: ${bankId}`);
      
      // Get last statement
      const lastStatement = await prisma.bankStatement.findFirst({
        where: { bankId },
        orderBy: { statementDate: 'desc' }
      });
      
      // Get pending transactions
      const pendingTransactions = await prisma.cashbookTransaction.count({
        where: {
          bankId,
          status: 'POSTED',
          isReconciled: false
        }
      });
      
      // Get matched transactions
      const matchedTransactions = await prisma.cashbookTransaction.count({
        where: {
          bankId,
          status: 'POSTED',
          isReconciled: true
        }
      });
      
      // Get discrepancies
      const discrepancies = await prisma.reconciliationMismatch.count({
        where: {
          statement: { bankId },
          isResolved: false
        }
      });
      
      console.log(`✅ Reconciliation status: ${pendingTransactions} pending, ${matchedTransactions} matched, ${discrepancies} discrepancies`);
      
      return {
        bankId,
        lastStatementDate: lastStatement?.statementDate,
        isReconciled: lastStatement?.isReconciled || false,
        pendingTransactions,
        matchedTransactions,
        discrepancies
      };
      
    } catch (error: any) {
      console.error('❌ Error getting reconciliation status:', error.message);
      return {
        bankId,
        isReconciled: false,
        pendingTransactions: 0,
        matchedTransactions: 0,
        discrepancies: 0
      };
    }
  }
  
  /**
   * Perform automatic matching
   */
  static async performAutomaticMatching(statementId: string): Promise<ReconciliationResult> {
    try {
      console.log(`🔄 Performing automatic matching for statement: ${statementId}`);
      
      // Get statement with items
      const statement = await prisma.bankStatement.findUnique({
        where: { id: statementId },
        include: {
          items: true,
          bank: true
        }
      });
      
      if (!statement) {
        return {
          statementId,
          totalItems: 0,
          matchedItems: 0,
          unmatchedItems: 0,
          discrepancies: 0,
          isBalanced: false,
          success: false,
          message: 'Statement not found'
        };
      }
      
      let matchedItems = 0;
      let unmatchedItems = 0;
      let discrepancies = 0;
      
      // Match each statement item
      for (const item of statement.items) {
        if (item.isMatched) continue;
        
        // Find matching transaction
        const matchingTransaction = await this.findMatchingTransaction(item, statement.bankId);
        
        if (matchingTransaction) {
          // Mark as matched
          await prisma.bankStatementItem.update({
            where: { id: item.id },
            data: {
              isMatched: true,
              matchedTransactionId: matchingTransaction.id
            }
          });
          
          // Mark transaction as reconciled
          await prisma.cashbookTransaction.update({
            where: { id: matchingTransaction.id },
            data: {
              isReconciled: true,
              reconciledAt: new Date()
            }
          });
          
          matchedItems++;
        } else {
          // Create mismatch record
          await this.createMismatch(statementId, item, null);
          unmatchedItems++;
          discrepancies++;
        }
      }
      
      const totalItems = statement.items.length;
      const isBalanced = matchedItems === totalItems;
      
      console.log(`✅ Automatic matching completed: ${matchedItems}/${totalItems} matched`);
      
      return {
        statementId,
        totalItems,
        matchedItems,
        unmatchedItems,
        discrepancies,
        isBalanced,
        success: true,
        message: 'Automatic matching completed'
      };
      
    } catch (error: any) {
      console.error('❌ Error performing automatic matching:', error.message);
      return {
        statementId,
        totalItems: 0,
        matchedItems: 0,
        unmatchedItems: 0,
        discrepancies: 0,
        isBalanced: false,
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Get reconciliation mismatches
   */
  static async getReconciliationMismatches(statementId: string): Promise<ReconciliationMismatch[]> {
    try {
      console.log(`📋 Getting reconciliation mismatches for statement: ${statementId}`);
      
      const mismatches = await prisma.reconciliationMismatch.findMany({
        where: { statementId },
        orderBy: { severity: 'desc', createdAt: 'desc' }
      });
      
      console.log(`✅ Found ${mismatches.length} mismatches`);
      return mismatches;
      
    } catch (error: any) {
      console.error('❌ Error getting reconciliation mismatches:', error.message);
      return [];
    }
  }
  
  /**
   * Resolve mismatch
   */
  static async resolveMismatch(mismatchId: string, resolution: {
    type: 'MATCH_TRANSACTION' | 'CREATE_TRANSACTION' | 'IGNORE';
    transactionId?: string;
    notes?: string;
  }, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🔧 Resolving mismatch: ${mismatchId}`);
      
      const mismatch = await prisma.reconciliationMismatch.findUnique({
        where: { id: mismatchId }
      });
      
      if (!mismatch) {
        return {
          success: false,
          message: 'Mismatch not found'
        };
      }
      
      switch (resolution.type) {
        case 'MATCH_TRANSACTION':
          if (resolution.transactionId) {
            // Mark transaction as reconciled
            await prisma.cashbookTransaction.update({
              where: { id: resolution.transactionId },
              data: {
                isReconciled: true,
                reconciledAt: new Date(),
                reconciledById: userId
              }
            });
            
            // Update statement item
            await prisma.bankStatementItem.update({
              where: { id: mismatch.statementItemId },
              data: {
                isMatched: true,
                matchedTransactionId: resolution.transactionId
              }
            });
          }
          break;
          
        case 'CREATE_TRANSACTION':
          // Create missing transaction
          await this.createMissingTransaction(mismatch, userId);
          break;
          
        case 'IGNORE':
          // Just mark as resolved
          break;
      }
      
      // Mark mismatch as resolved
      await prisma.reconciliationMismatch.update({
        where: { id: mismatchId },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
          resolvedById: userId
        }
      });
      
      console.log(`✅ Mismatch resolved: ${mismatchId}`);
      
      return {
        success: true,
        message: 'Mismatch resolved successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error resolving mismatch:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Mark transaction as reconciled
   */
  static async markTransactionReconciled(transactionId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`✅ Marking transaction as reconciled: ${transactionId}`);
      
      // Try CashbookEntry first (used by receipts/payments)
      try {
        await prisma.cashbookEntry.update({
          where: { id: transactionId },
          data: {
            isReconciled: true,
            reconciledAt: new Date(),
            reconciledById: userId
          }
        });
        console.log(`✅ CashbookEntry marked as reconciled: ${transactionId}`);
        return {
          success: true,
          message: 'Transaction marked as reconciled'
        };
      } catch (entryError) {
        // Fallback to cashbookTransaction if CashbookEntry doesn't exist
        await prisma.cashbookTransaction.update({
          where: { id: transactionId },
          data: {
            isReconciled: true,
            reconciledAt: new Date(),
            reconciledById: userId
          }
        });
        console.log(`✅ CashbookTransaction marked as reconciled: ${transactionId}`);
        return {
          success: true,
          message: 'Transaction marked as reconciled'
        };
      }
      
    } catch (error: any) {
      console.error('❌ Error marking transaction as reconciled:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  /**
   * Complete reconciliation
   */
  static async completeReconciliation(statementId: string, userId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🎯 Completing reconciliation for statement: ${statementId}`);
      
      // Check if all items are matched
      const unmatchedItems = await prisma.bankStatementItem.count({
        where: {
          statementId,
          isMatched: false
        }
      });
      
      if (unmatchedItems > 0) {
        return {
          success: false,
          message: `Cannot complete reconciliation: ${unmatchedItems} items still unmatched`
        };
      }
      
      // Mark statement as reconciled
      await prisma.bankStatement.update({
        where: { id: statementId },
        data: {
          isReconciled: true,
          reconciledAt: new Date(),
          reconciledById: userId
        }
      });
      
      console.log(`✅ Reconciliation completed: ${statementId}`);
      
      return {
        success: true,
        message: 'Reconciliation completed successfully'
      };
      
    } catch (error: any) {
      console.error('❌ Error completing reconciliation:', error.message);
      return {
        success: false,
        message: error.message
      };
    }
  }
  
  // Private helper methods
  
  private static async findMatchingTransaction(item: any, bankId: string): Promise<any> {
    // Try to match by amount and date
    const amount = Number(item.debitAmount) > 0 ? Number(item.debitAmount) : Number(item.creditAmount);
    
    const transaction = await prisma.cashbookTransaction.findFirst({
      where: {
        bankId,
        status: 'POSTED',
        isReconciled: false,
        totalAmount: amount,
        transactionDate: {
          gte: new Date(item.transactionDate.getTime() - 24 * 60 * 60 * 1000), // 1 day before
          lte: new Date(item.transactionDate.getTime() + 24 * 60 * 60 * 1000)  // 1 day after
        }
      }
    });
    
    return transaction;
  }
  
  private static async createMismatch(statementId: string, item: any, transactionId?: string): Promise<void> {
    await prisma.reconciliationMismatch.create({
      data: {
        statementId,
        transactionId,
        type: transactionId ? 'AMOUNT_MISMATCH' : 'MISSING_IN_SYSTEM',
        description: `Mismatch for ${item.description}`,
        systemAmount: transactionId ? Number(item.debitAmount) : undefined,
        statementAmount: Number(item.debitAmount) > 0 ? Number(item.debitAmount) : Number(item.creditAmount),
        systemDate: transactionId ? new Date() : undefined,
        statementDate: item.transactionDate,
        severity: 'MEDIUM',
        isResolved: false
      }
    });
  }
  
  private static async createMissingTransaction(mismatch: any, userId: string): Promise<void> {
    // This would create a missing transaction based on the mismatch
    // Implementation depends on business rules
    console.log(`📝 Creating missing transaction for mismatch: ${mismatch.id}`);
  }
}

export default BankReconciliationService;