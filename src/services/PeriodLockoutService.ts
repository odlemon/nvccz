// @ts-nocheck
// Period Lockout Service
// Handles accounting period lockout functionality

import { prisma } from '../utils/database';

export default class PeriodLockoutService {
  
  /**
   * Lock accounting period
   */
  static async lockPeriod(data: {
    period: string; // Format: YYYY-MM
    isLocked: boolean;
    lockedBy: string;
    reason?: string;
  }) {
    try {
      
      // Check if period already exists
      const existingPeriod = await prisma.accountingPeriod.findFirst({
        where: { period: data.period }
      });

      let period;
      if (existingPeriod) {
        // Update existing period
        period = await prisma.accountingPeriod.update({
          where: { id: existingPeriod.id },
          data: {
            isLocked: data.isLocked,
            lockedBy: data.lockedBy,
            lockedAt: data.isLocked ? new Date() : null,
            reason: data.reason
          }
        });
      } else {
        // Create new period
        period = await prisma.accountingPeriod.create({
          data: {
            period: data.period,
            isLocked: data.isLocked,
            lockedBy: data.lockedBy,
            lockedAt: data.isLocked ? new Date() : null,
            reason: data.reason
          }
        });
      }

      // Log the lockout action
      await prisma.auditLog.create({
        data: {
          action: data.isLocked ? 'LOCK_PERIOD' : 'UNLOCK_PERIOD',
          resourceType: 'ACCOUNTING_PERIOD',
          resourceId: period.id,
          userId: data.lockedBy,
          details: {
            period: data.period,
            reason: data.reason
          }
        }
      });

      return {
        success: true,
        message: `Period ${data.isLocked ? 'locked' : 'unlocked'} successfully`,
        data: period
      };
    } catch (error) {
      console.error('Error locking period:', error);
      return {
        success: false,
        message: 'Failed to lock period',
        error: error.message
      };
    }
  }

  /**
   * Check if period is locked
   */
  static async isPeriodLocked(period: string) {
    try {
      
      const periodRecord = await prisma.accountingPeriod.findFirst({
        where: { period }
      });

      return periodRecord?.isLocked || false;
    } catch (error) {
      console.error('Error checking period lock:', error);
      return false;
    }
  }

  /**
   * Get period lockout status
   */
  static async getPeriodStatus(period: string) {
    try {
      
      const periodRecord = await prisma.accountingPeriod.findFirst({
        where: { period },
        include: {
          lockedByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      if (!periodRecord) {
        return {
          success: true,
          message: 'Period status retrieved successfully',
          data: {
            period,
            isLocked: false,
            lockedAt: null,
            lockedBy: null,
            reason: null
          }
        };
      }

      return {
        success: true,
        message: 'Period status retrieved successfully',
        data: {
          period: periodRecord.period,
          isLocked: periodRecord.isLocked,
          lockedAt: periodRecord.lockedAt,
          lockedBy: periodRecord.lockedByUser,
          reason: periodRecord.reason
        }
      };
    } catch (error) {
      console.error('Error getting period status:', error);
      return {
        success: false,
        message: 'Failed to get period status',
        error: error.message
      };
    }
  }

  /**
   * Get all periods with lockout status
   */
  static async getAllPeriods(filters: {
    year?: number;
    isLocked?: boolean;
  } = {}) {
    try {
      
      const whereClause: any = {};
      
      if (filters.year) {
        whereClause.period = {
          startsWith: filters.year.toString()
        };
      }
      
      if (filters.isLocked !== undefined) {
        whereClause.isLocked = filters.isLocked;
      }

      const periods = await prisma.accountingPeriod.findMany({
        where: whereClause,
        include: {
          lockedByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: {
          period: 'desc'
        }
      });

      return {
        success: true,
        message: 'Periods retrieved successfully',
        data: periods
      };
    } catch (error) {
      console.error('Error getting periods:', error);
      return {
        success: false,
        message: 'Failed to get periods',
        error: error.message
      };
    }
  }

  /**
   * Validate transaction date against period lockout
   */
  static async validateTransactionDate(transactionDate: Date, userId: string) {
    try {
      
      // Extract period from transaction date (YYYY-MM format)
      const year = transactionDate.getFullYear();
      const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
      const period = `${year}-${month}`;

      // Check if period is locked
      const isLocked = await this.isPeriodLocked(period);
      
      if (isLocked) {
        // Log the attempt to create transaction in locked period
        await prisma.auditLog.create({
          data: {
            action: 'ATTEMPT_LOCKED_PERIOD_TRANSACTION',
            resourceType: 'CASHBOOK_ENTRY',
            resourceId: null,
            userId: userId,
            details: {
              transactionDate: transactionDate,
              period: period,
              message: 'Transaction attempted in locked period'
            }
          }
        });

        return {
          success: false,
          message: `Cannot create transaction in locked period: ${period}`
        };
      }

      return {
        success: true,
        message: 'Transaction date is valid',
        data: null
      };
    } catch (error) {
      console.error('Error validating transaction date:', error);
      return {
        success: false,
        message: 'Failed to validate transaction date',
        error: error.message
      };
    }
  }

  /**
   * Get lockout history for a period
   */
  static async getLockoutHistory(period: string) {
    try {
      
      const history = await prisma.auditLog.findMany({
        where: {
          action: {
            in: ['LOCK_PERIOD', 'UNLOCK_PERIOD']
          },
          details: {
            path: ['period'],
            equals: period
          }
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return {
        success: true,
        message: 'Lockout history retrieved successfully',
        data: history
      };
    } catch (error) {
      console.error('Error getting lockout history:', error);
      return {
        success: false,
        message: 'Failed to get lockout history',
        error: error.message
      };
    }
  }
}
