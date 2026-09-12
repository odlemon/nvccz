// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";
import { computeAchievementPercent } from "./performanceGoalRollupUtils";
import { PerformanceGoalService } from "./PerformanceGoalService";

export interface GoalTrackingResult {
  goalId: string;
  currentValue: number;
  targetValue: number;
  isSuccess: boolean;
  progressPercentage: number;
  status: string;
  lastCheckDate: Date;
  nextCheckDate: Date;
}

export class EnhancedGoalTrackingService {
  /**
   * Check goal status based on data source module and field
   */
  static async checkGoalStatus(goalId: string): Promise<GoalTrackingResult> {
    try {
      console.log(`🔍 Checking goal status for goal: ${goalId}`);

      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        include: { kpi: true }
      });

      if (!goal) {
        throw new Error("Goal not found");
      }

      if (!goal.dataSourceModule || !goal.dataSourceField) {
        console.log(`⚠️ Goal ${goalId} has no data source configuration`);
        return {
          goalId,
          currentValue: goal.currentValue || 0,
          targetValue: goal.targetValue || 0,
          isSuccess: false,
          progressPercentage: 0,
          status: "no_data_source",
          lastCheckDate: new Date(),
          nextCheckDate: new Date()
        };
      }

      // Fetch current value from data source module
      const currentValue = await this.fetchFromSourceModule(
        goal.dataSourceModule,
        goal.dataSourceField
      );

      // Compare using target operator
      const isSuccess = this.evaluateTarget(
        currentValue,
        goal.targetOperator || ">=",
        goal.targetValue || 0
      );

      const progressPercentage = computeAchievementPercent({
        currentValue,
        targetValue: goal.targetValue,
        targetOperator: goal.targetOperator || ">=",
        isReverseKpi: goal.isReverseKpi,
        progressPercentage: goal.progressPercentage
      });

      // Determine status
      let status = "active";
      if (isSuccess) {
        status = "achieved";
      } else if (progressPercentage < 50) {
        status = "behind";
      } else if (progressPercentage >= 80) {
        status = "ahead";
      }

      // Calculate next check date based on tracking frequency
      const nextCheckDate = this.calculateNextCheckDate(
        goal.trackingFrequency || "Weekly"
      );

      // Update goal with new data
      const updatedGoal = await prisma.performanceGoal.update({
        where: { id: goalId },
        data: {
          currentValue,
          progressPercentage,
          status: isSuccess ? "completed" : status,
          lastCheckDate: new Date(),
          nextCheckDate,
          updatedAt: new Date()
        }
      });
      await PerformanceGoalService.refreshPerformanceRiskZoneOnGoal(goalId).catch(() => undefined);

      console.log(`✅ Goal ${goalId} status updated: ${currentValue}/${goal.targetValue} (${progressPercentage.toFixed(1)}%)`);

      return {
        goalId,
        currentValue,
        targetValue: goal.targetValue || 0,
        isSuccess,
        progressPercentage,
        status,
        lastCheckDate: new Date(),
        nextCheckDate
      };

    } catch (error) {
      console.error(`❌ Error checking goal status for ${goalId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch data from source module based on field path
   */
  static async fetchFromSourceModule(module: string, field: string): Promise<number> {
    try {
      console.log(`📊 Fetching data from ${module}: ${field}`);

      switch (module.toLowerCase()) {
        case 'accounting':
          return await this.fetchFromAccounting(field);
        case 'procurement':
          return await this.fetchFromProcurement(field);
        case 'taskmanagement':
          return await this.fetchFromTasks(field);
        case 'events':
          return await this.fetchFromEvents(field);
        case 'manual':
          return 0; // Manual goals require manual input
        default:
          throw new Error(`Unknown source module: ${module}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching from ${module}:`, error);
      throw error;
    }
  }

  /**
   * Fetch data from Accounting module
   */
  static async fetchFromAccounting(field: string): Promise<number> {
    try {
      console.log(`💰 Fetching accounting data for field: ${field}`);
      
      // Parse field path (e.g., "IncomeStatement.TotalRevenue", "BalanceSheet.TotalAssets")
      const fieldParts = field.split('.');
      
      if (fieldParts.length < 2) {
        throw new Error(`Invalid accounting field path: ${field}`);
      }

      const [statement, metric] = fieldParts;

      switch (statement.toLowerCase()) {
        case 'incomestatement':
          return await this.getIncomeStatementMetric(metric);
        case 'balancesheet':
          return await this.getBalanceSheetMetric(metric);
        case 'cashflow':
          return await this.getCashFlowMetric(metric);
        case 'chartofaccounts':
          return await this.getChartOfAccountsMetric(metric);
        default:
          throw new Error(`Unknown accounting statement: ${statement}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching accounting data:`, error);
      return 0;
    }
  }

  /**
   * Get Income Statement metric
   */
  static async getIncomeStatementMetric(metric: string): Promise<number> {
    try {
      switch (metric.toLowerCase()) {
        case 'totalrevenue':
          // Sum all revenue entries from journal entries
          const revenueEntries = await prisma.journalEntryLine.findMany({
            where: {
              journalEntry: {
                status: 'POSTED'
              },
              glAccount: {
                accountType: 'Revenue'
              }
            },
            include: {
              glAccount: true
            }
          });

          return revenueEntries.reduce((sum, line) => {
            return sum + (line.creditAmount || 0);
          }, 0);

        case 'totalexpenses':
          // Sum all expense entries from journal entries
          const expenseEntries = await prisma.journalEntryLine.findMany({
            where: {
              journalEntry: {
                status: 'POSTED'
              },
              glAccount: {
                accountType: 'Expense'
              }
            },
            include: {
              glAccount: true
            }
          });

          return expenseEntries.reduce((sum, line) => {
            return sum + (line.debitAmount || 0);
          }, 0);

        case 'netincome':
          // Calculate net income (revenue - expenses)
          const totalRevenue = await this.getIncomeStatementMetric('totalrevenue');
          const totalExpenses = await this.getIncomeStatementMetric('totalexpenses');
          return totalRevenue - totalExpenses;

        case 'managementfees':
          // Get management fees specifically (account 4000)
          const managementFeeEntries = await prisma.journalEntryLine.findMany({
            where: {
              journalEntry: {
                status: 'POSTED'
              },
              glAccount: {
                accountNo: '4000' // Sales Revenue account
              }
            }
          });

          return managementFeeEntries.reduce((sum, line) => {
            return sum + (line.creditAmount || 0);
          }, 0);

        case 'operatingcosts':
          // Get operating costs (account 5090)
          const operatingCostEntries = await prisma.journalEntryLine.findMany({
            where: {
              journalEntry: {
                status: 'POSTED'
              },
              glAccount: {
                accountNo: '5090' // Other Operating Expenses
              }
            }
          });

          return operatingCostEntries.reduce((sum, line) => {
            return sum + (line.debitAmount || 0);
          }, 0);

        default:
          console.log(`⚠️ Unknown income statement metric: ${metric}`);
          return 0;
      }
    } catch (error) {
      console.error(`❌ Error getting income statement metric:`, error);
      return 0;
    }
  }

  /**
   * Get Balance Sheet metric
   */
  static async getBalanceSheetMetric(metric: string): Promise<number> {
    try {
      switch (metric.toLowerCase()) {
        case 'totalassets':
          // Sum all asset accounts
          const assetAccounts = await prisma.chartOfAccounts.findMany({
            where: {
              accountType: 'Current Asset'
            }
          });

          let totalAssets = 0;
          for (const account of assetAccounts) {
            const balance = await this.getAccountBalance(account.id);
            totalAssets += balance;
          }
          return totalAssets;

        case 'totalliabilities':
          // Sum all liability accounts
          const liabilityAccounts = await prisma.chartOfAccounts.findMany({
            where: {
              accountType: 'Current Liability'
            }
          });

          let totalLiabilities = 0;
          for (const account of liabilityAccounts) {
            const balance = await this.getAccountBalance(account.id);
            totalLiabilities += balance;
          }
          return totalLiabilities;

        case 'shareholdersequity':
          // Calculate shareholders' equity
          const totalAssetsValue = await this.getBalanceSheetMetric('totalassets');
          const totalLiabilitiesValue = await this.getBalanceSheetMetric('totalliabilities');
          return totalAssetsValue - totalLiabilitiesValue;

        default:
          console.log(`⚠️ Unknown balance sheet metric: ${metric}`);
          return 0;
      }
    } catch (error) {
      console.error(`❌ Error getting balance sheet metric:`, error);
      return 0;
    }
  }

  /**
   * Get Cash Flow metric
   */
  static async getCashFlowMetric(metric: string): Promise<number> {
    try {
      switch (metric.toLowerCase()) {
        case 'netcashflow':
          // Calculate net cash flow from operations
          const cashAccounts = await prisma.chartOfAccounts.findMany({
            where: {
              accountName: {
                contains: 'Cash'
              }
            }
          });

          let netCashFlow = 0;
          for (const account of cashAccounts) {
            const balance = await this.getAccountBalance(account.id);
            netCashFlow += balance;
          }
          return netCashFlow;

        default:
          console.log(`⚠️ Unknown cash flow metric: ${metric}`);
          return 0;
      }
    } catch (error) {
      console.error(`❌ Error getting cash flow metric:`, error);
      return 0;
    }
  }

  /**
   * Get Chart of Accounts metric by account number
   */
  static async getChartOfAccountsMetric(metric: string): Promise<number> {
    try {
      console.log(`📊 Fetching chart of accounts data for account: ${metric}`);
      
      // Parse metric (e.g., "1000", "4000", "5030")
      const accountNumber = metric;
      
      // Get all journal entry lines for this specific account
      const accountEntries = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            status: 'POSTED'
          },
          glAccount: {
            accountNo: accountNumber
          }
        },
        include: {
          glAccount: true
        }
      });

      if (accountEntries.length === 0) {
        console.log(`⚠️ No entries found for account ${accountNumber}`);
        return 0;
      }

      // Calculate balance based on account type
      const account = accountEntries[0].glAccount;
      
      // For asset and expense accounts: debit - credit
      // For liability, equity, and revenue accounts: credit - debit
      const isDebitAccount = ['Current Asset', 'Fixed Asset', 'Expense'].includes(account.accountType);
      
      const balance = accountEntries.reduce((sum, line) => {
        if (isDebitAccount) {
          return sum + (line.debitAmount || 0) - (line.creditAmount || 0);
        } else {
          return sum + (line.creditAmount || 0) - (line.debitAmount || 0);
        }
      }, 0);

      console.log(`✅ Account ${accountNumber} balance: ${balance}`);
      return balance;

    } catch (error) {
      console.error(`❌ Error getting chart of accounts metric:`, error);
      return 0;
    }
  }

  /**
   * Get account balance
   */
  static async getAccountBalance(accountId: string): Promise<number> {
    try {
      const entries = await prisma.journalEntryLine.findMany({
        where: {
          glAccountId: accountId,
          journalEntry: {
            status: 'POSTED'
          }
        }
      });

      let balance = 0;
      for (const entry of entries) {
        balance += (entry.debitAmount || 0) - (entry.creditAmount || 0);
      }

      return balance;
    } catch (error) {
      console.error(`❌ Error getting account balance:`, error);
      return 0;
    }
  }

  /**
   * Fetch data from Procurement module
   */
  static async fetchFromProcurement(field: string): Promise<number> {
    try {
      switch (field.toLowerCase()) {
        case 'invoiceprocessingtime':
          // Calculate average invoice processing time
          const invoices = await prisma.invoice.findMany({
            where: {
              status: 'PAID'
            },
            select: {
              createdAt: true,
              updatedAt: true
            }
          });

          if (invoices.length === 0) return 0;

          const totalProcessingTime = invoices.reduce((sum, invoice) => {
            const processingTime = invoice.updatedAt.getTime() - invoice.createdAt.getTime();
            return sum + processingTime;
          }, 0);

          const averageProcessingTimeMs = totalProcessingTime / invoices.length;
          const averageProcessingTimeDays = averageProcessingTimeMs / (1000 * 60 * 60 * 24);
          
          return Math.round(averageProcessingTimeDays * 100) / 100; // Round to 2 decimal places

        case 'contractapprovaltime':
          // Calculate average contract approval time
          const contracts = await prisma.procurementApprovalStage.findMany({
            where: {
              status: 'APPROVED'
            },
            select: {
              createdAt: true,
              updatedAt: true
            }
          });

          if (contracts.length === 0) return 0;

          const totalApprovalTime = contracts.reduce((sum, contract) => {
            const approvalTime = contract.updatedAt.getTime() - contract.createdAt.getTime();
            return sum + approvalTime;
          }, 0);

          const averageApprovalTimeMs = totalApprovalTime / contracts.length;
          const averageApprovalTimeHours = averageApprovalTimeMs / (1000 * 60 * 60);
          
          return Math.round(averageApprovalTimeHours * 100) / 100; // Round to 2 decimal places

        default:
          console.log(`⚠️ Unknown procurement field: ${field}`);
          return 0;
      }
    } catch (error) {
      console.error(`❌ Error fetching procurement data:`, error);
      return 0;
    }
  }

  /**
   * Fetch data from Task Management module
   */
  static async fetchFromTasks(field: string): Promise<number> {
    try {
      switch (field.toLowerCase()) {
        case 'taskcompletionrate':
          // Calculate task completion rate
          const totalTasks = await prisma.task.count();
          const completedTasks = await prisma.task.count({
            where: {
              stage: 'completed'
            }
          });

          if (totalTasks === 0) return 0;
          return Math.round((completedTasks / totalTasks) * 100 * 100) / 100; // Round to 2 decimal places

        case 'timetohire':
          // Calculate average time to hire
          const hiringTasks = await prisma.task.findMany({
            where: {
              title: {
                contains: 'hire'
              },
              stage: 'completed'
            },
            select: {
              createdAt: true,
              updatedAt: true
            }
          });

          if (hiringTasks.length === 0) return 0;

          const totalHiringTime = hiringTasks.reduce((sum, task) => {
            const hiringTime = task.updatedAt.getTime() - task.createdAt.getTime();
            return sum + hiringTime;
          }, 0);

          const averageHiringTimeMs = totalHiringTime / hiringTasks.length;
          const averageHiringTimeDays = averageHiringTimeMs / (1000 * 60 * 60 * 24);
          
          return Math.round(averageHiringTimeDays * 100) / 100; // Round to 2 decimal places

        case 'trainingcompletionrate':
          // Calculate training completion rate
          const trainingTasks = await prisma.task.count({
            where: {
              title: {
                contains: 'training'
              }
            }
          });

          const completedTrainingTasks = await prisma.task.count({
            where: {
              title: {
                contains: 'training'
              },
              stage: 'completed'
            }
          });

          if (trainingTasks === 0) return 0;
          return Math.round((completedTrainingTasks / trainingTasks) * 100 * 100) / 100; // Round to 2 decimal places

        case 'useronboardingcomplete':
          // Calculate user onboarding completion rate
          const onboardingTasks = await prisma.task.count({
            where: {
              title: {
                contains: 'onboarding'
              }
            }
          });

          const completedOnboardingTasks = await prisma.task.count({
            where: {
              title: {
                contains: 'onboarding'
              },
              stage: 'completed'
            }
          });

          if (onboardingTasks === 0) return 0;
          return Math.round((completedOnboardingTasks / onboardingTasks) * 100 * 100) / 100; // Round to 2 decimal places

        default:
          console.log(`⚠️ Unknown task management field: ${field}`);
          return 0;
      }
    } catch (error) {
      console.error(`❌ Error fetching task data:`, error);
      return 0;
    }
  }

  /**
   * Fetch data from Events module
   */
  static async fetchFromEvents(field: string): Promise<number> {
    try {
      switch (field.toLowerCase()) {
        case 'eventrsvprate':
          // Calculate event RSVP rate
          const events = await prisma.event.findMany({
            include: {
              guests: true
            }
          });

          if (events.length === 0) return 0;

          let totalInvited = 0;
          let totalRSVP = 0;

          for (const event of events) {
            totalInvited += event.guests.length;
            totalRSVP += event.guests.filter(guest => guest.rsvpStatus === 'CONFIRMED').length;
          }

          if (totalInvited === 0) return 0;
          return Math.round((totalRSVP / totalInvited) * 100 * 100) / 100; // Round to 2 decimal places

        default:
          console.log(`⚠️ Unknown events field: ${field}`);
          return 0;
      }
    } catch (error) {
      console.error(`❌ Error fetching events data:`, error);
      return 0;
    }
  }

  /**
   * Evaluate target using operator
   */
  static evaluateTarget(currentValue: number, operator: string, targetValue: number): boolean {
    switch (operator) {
      case '>=':
        return currentValue >= targetValue;
      case '<=':
        return currentValue <= targetValue;
      case '=':
        return Math.abs(currentValue - targetValue) < 0.01; // Allow small floating point differences
      default:
        console.log(`⚠️ Unknown operator: ${operator}, defaulting to >=`);
        return currentValue >= targetValue;
    }
  }

  /**
   * Calculate next check date based on tracking frequency
   */
  static calculateNextCheckDate(frequency: string): Date {
    const now = new Date();
    
    switch (frequency.toLowerCase()) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      default:
        console.log(`⚠️ Unknown frequency: ${frequency}, defaulting to weekly`);
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Check all goals that are due for tracking
   */
  static async checkAllDueGoals(): Promise<GoalTrackingResult[]> {
    try {
      console.log('🔍 Checking all goals due for tracking...');

      const dueGoals = await prisma.performanceGoal.findMany({
        where: {
          status: 'active',
          nextCheckDate: {
            lte: new Date()
          }
        }
      });

      console.log(`📊 Found ${dueGoals.length} goals due for tracking`);

      const results: GoalTrackingResult[] = [];

      for (const goal of dueGoals) {
        try {
          const result = await this.checkGoalStatus(goal.id);
          results.push(result);
        } catch (error) {
          console.error(`❌ Error checking goal ${goal.id}:`, error);
        }
      }

      console.log(`✅ Completed checking ${results.length} goals`);
      return results;

    } catch (error) {
      console.error('❌ Error checking all due goals:', error);
      throw error;
    }
  }

  /**
   * Schedule goal tracking (to be called by cron job)
   */
  static async scheduleGoalTracking(): Promise<void> {
    try {
      console.log('⏰ Starting scheduled goal tracking...');
      
      const results = await this.checkAllDueGoals();
      
      console.log(`✅ Scheduled goal tracking completed. Checked ${results.length} goals.`);
      
      // Send notifications for goals that need attention
      await this.sendGoalNotifications(results);
      
    } catch (error) {
      console.error('❌ Error in scheduled goal tracking:', error);
      throw error;
    }
  }

  /**
   * Send notifications for goals that need attention
   */
  static async sendGoalNotifications(results: GoalTrackingResult[]): Promise<void> {
    try {
      const behindGoals = results.filter(r => r.status === 'behind');
      const achievedGoals = results.filter(r => r.isSuccess);

      if (behindGoals.length > 0) {
        console.log(`⚠️ ${behindGoals.length} goals are behind schedule`);
        const goals = await prisma.performanceGoal.findMany({
          where: {
            id: {
              in: behindGoals.map((goal) => goal.goalId)
            }
          },
          select: {
            id: true,
            title: true,
            assignedToId: true,
            createdById: true
          }
        });

        const entries = goals.flatMap((goal) =>
          Array.from(new Set([goal.assignedToId, goal.createdById].filter(Boolean))).map((userId) => ({
            title: "Goal Attention Required",
            message: `Goal "${goal.title}" is behind schedule and needs attention.`,
            type: "GOAL_BEHIND",
            userId,
            data: {
              goalId: goal.id,
              path: `/performance/goals/${goal.id}`
            },
            relatedEntity: "PerformanceGoal",
            relatedEntityId: goal.id
          }))
        );

        if (entries.length > 0) {
          await prisma.notification.createMany({
            data: entries
          });
        }
      }

      if (achievedGoals.length > 0) {
        console.log(`🎉 ${achievedGoals.length} goals have been achieved`);
        const goals = await prisma.performanceGoal.findMany({
          where: {
            id: {
              in: achievedGoals.map((goal) => goal.goalId)
            }
          },
          select: {
            id: true,
            title: true,
            assignedToId: true
          }
        });

        const entries = goals
          .filter((goal) => Boolean(goal.assignedToId))
          .map((goal) => ({
            title: "Goal Achieved",
            message: `Congratulations. Goal "${goal.title}" has been achieved.`,
            type: "GOAL_ACHIEVED",
            userId: goal.assignedToId,
            data: {
              goalId: goal.id,
              path: `/performance/goals/${goal.id}`
            },
            relatedEntity: "PerformanceGoal",
            relatedEntityId: goal.id
          }));

        if (entries.length > 0) {
          await prisma.notification.createMany({
            data: entries
          });
        }
      }

    } catch (error) {
      console.error('❌ Error sending goal notifications:', error);
    }
  }
}
