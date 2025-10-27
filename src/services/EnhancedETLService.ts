// @ts-nocheck
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";

export interface SourceModuleData {
  accounting: AccountingData;
  procurement: ProcurementData;
  tasks: TaskData;
  events: EventData;
}

export interface AccountingData {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  shareholdersEquity: number;
  cashBalance: number;
  accountsReceivable: number;
  accountsPayable: number;
}

export interface ProcurementData {
  averageInvoiceProcessingTime: number;
  averageContractApprovalTime: number;
  totalProcurementSpend: number;
  supplierCount: number;
}

export interface TaskData {
  taskCompletionRate: number;
  averageTimeToHire: number;
  trainingCompletionRate: number;
  onboardingCompletionRate: number;
  totalTasks: number;
  completedTasks: number;
}

export interface EventData {
  eventRSVPRate: number;
  totalEvents: number;
  totalGuests: number;
  confirmedGuests: number;
}

export interface CalculatedKPIs {
  // Financial KPIs
  revenueGrowth: number;
  operatingExpenses: number;
  netProfit: number;
  grossProfitMargin: number;
  netProfitMargin: number;
  ebitda: number;
  budgetVariance: number;
  
  // Asset Management KPIs
  aum: number;
  portfolioIRR: number;
  roi: number;
  
  // Balance Sheet KPIs
  debtToEquityRatio: number;
  returnOnAssets: number;
  returnOnEquity: number;
  cashConversionCycle: number;
  accountsPayableTurnover: number;
  daysPayableOutstanding: number;
  cashFlow: number;
  
  // Operational KPIs
  customerAcquisitionCost: number;
  invoiceProcessingTime: number;
  contractApprovalTime: number;
  taskCompletionRate: number;
  trainingCompletionRate: number;
  eventRSVPRate: number;
  userOnboardingRate: number;
  timeToHire: number;
}

export class EnhancedETLService {
  /**
   * Run complete ETL pipeline
   */
  static async runETLPipeline(): Promise<void> {
    try {
      console.log('🚀 Starting Enhanced ETL Pipeline...');

      // Step 1: Extract data from all source modules
      console.log('📊 Step 1: Extracting data from source modules...');
      const sourceData = await this.extractFromAllModules();

      // Step 2: Transform and calculate KPIs
      console.log('🔄 Step 2: Transforming data and calculating KPIs...');
      const calculatedKPIs = await this.calculateAllKPIs(sourceData);

      // Step 3: Load to external data collection
      console.log('💾 Step 3: Loading data to external collection...');
      await this.loadToExternalData(calculatedKPIs);

      console.log('✅ Enhanced ETL Pipeline completed successfully');

    } catch (error) {
      console.error('❌ Enhanced ETL Pipeline failed:', error);
      throw error;
    }
  }

  /**
   * Extract data from all source modules
   */
  static async extractFromAllModules(): Promise<SourceModuleData> {
    try {
      console.log('📊 Extracting data from all source modules...');

      const [accountingData, procurementData, taskData, eventData] = await Promise.all([
        this.extractFromAccounting(),
        this.extractFromProcurement(),
        this.extractFromTasks(),
        this.extractFromEvents()
      ]);

      return {
        accounting: accountingData,
        procurement: procurementData,
        tasks: taskData,
        events: eventData
      };

    } catch (error) {
      console.error('❌ Error extracting from source modules:', error);
      throw error;
    }
  }

  /**
   * Extract data from Accounting module
   */
  static async extractFromAccounting(): Promise<AccountingData> {
    try {
      console.log('💰 Extracting accounting data...');

      // Get all posted journal entries
      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          status: 'POSTED'
        },
        include: {
          entries: {
            include: {
              glAccount: true
            }
          }
        }
      });

      let totalRevenue = 0;
      let totalExpenses = 0;
      let totalAssets = 0;
      let totalLiabilities = 0;
      let cashBalance = 0;
      let accountsReceivable = 0;
      let accountsPayable = 0;

      // Calculate totals by account type
      for (const entry of journalEntries) {
        for (const line of entry.entries) {
          const amount = (line.debitAmount || 0) + (line.creditAmount || 0);
          
          switch (line.glAccount.accountType) {
            case 'Revenue':
              totalRevenue += amount;
              break;
            case 'Expense':
              totalExpenses += amount;
              break;
            case 'Current Asset':
              totalAssets += amount;
              if (line.glAccount.accountName.includes('Cash')) {
                cashBalance += amount;
              }
              if (line.glAccount.accountName.includes('Receivable')) {
                accountsReceivable += amount;
              }
              break;
            case 'Current Liability':
              totalLiabilities += amount;
              if (line.glAccount.accountName.includes('Payable')) {
                accountsPayable += amount;
              }
              break;
          }
        }
      }

      const netIncome = totalRevenue - totalExpenses;
      const shareholdersEquity = totalAssets - totalLiabilities;

      return {
        totalRevenue,
        totalExpenses,
        netIncome,
        totalAssets,
        totalLiabilities,
        shareholdersEquity,
        cashBalance,
        accountsReceivable,
        accountsPayable
      };

    } catch (error) {
      console.error('❌ Error extracting accounting data:', error);
      throw error;
    }
  }

  /**
   * Extract data from Procurement module
   */
  static async extractFromProcurement(): Promise<ProcurementData> {
    try {
      console.log('📦 Extracting procurement data...');

      // Calculate average invoice processing time
      const paidInvoices = await prisma.invoice.findMany({
        where: {
          status: 'PAID'
        },
        select: {
          createdAt: true,
          updatedAt: true,
          totalAmount: true
        }
      });

      let averageInvoiceProcessingTime = 0;
      let totalProcurementSpend = 0;

      if (paidInvoices.length > 0) {
        const totalProcessingTime = paidInvoices.reduce((sum, invoice) => {
          const processingTime = invoice.updatedAt.getTime() - invoice.createdAt.getTime();
          return sum + processingTime;
        }, 0);

        averageInvoiceProcessingTime = totalProcessingTime / paidInvoices.length / (1000 * 60 * 60 * 24); // Convert to days
        totalProcurementSpend = paidInvoices.reduce((sum, invoice) => sum + (invoice.totalAmount || 0), 0);
      }

      // Calculate average contract approval time
      const approvedContracts = await prisma.procurementApprovalStage.findMany({
        where: {
          status: 'APPROVED'
        },
        select: {
          createdAt: true,
          updatedAt: true
        }
      });

      let averageContractApprovalTime = 0;

      if (approvedContracts.length > 0) {
        const totalApprovalTime = approvedContracts.reduce((sum, contract) => {
          const approvalTime = contract.updatedAt.getTime() - contract.createdAt.getTime();
          return sum + approvalTime;
        }, 0);

        averageContractApprovalTime = totalApprovalTime / approvedContracts.length / (1000 * 60 * 60); // Convert to hours
      }

      // Get supplier count
      const supplierCount = await prisma.supplier.count();

      return {
        averageInvoiceProcessingTime,
        averageContractApprovalTime,
        totalProcurementSpend,
        supplierCount
      };

    } catch (error) {
      console.error('❌ Error extracting procurement data:', error);
      throw error;
    }
  }

  /**
   * Extract data from Task Management module
   */
  static async extractFromTasks(): Promise<TaskData> {
    try {
      console.log('📋 Extracting task data...');

      const totalTasks = await prisma.task.count();
      const completedTasks = await prisma.task.count({
        where: {
          stage: 'completed'
        }
      });

      const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

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

      let averageTimeToHire = 0;
      if (hiringTasks.length > 0) {
        const totalHiringTime = hiringTasks.reduce((sum, task) => {
          const hiringTime = task.updatedAt.getTime() - task.createdAt.getTime();
          return sum + hiringTime;
        }, 0);

        averageTimeToHire = totalHiringTime / hiringTasks.length / (1000 * 60 * 60 * 24); // Convert to days
      }

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

      const trainingCompletionRate = trainingTasks > 0 ? (completedTrainingTasks / trainingTasks) * 100 : 0;

      // Calculate onboarding completion rate
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

      const onboardingCompletionRate = onboardingTasks > 0 ? (completedOnboardingTasks / onboardingTasks) * 100 : 0;

      return {
        taskCompletionRate,
        averageTimeToHire,
        trainingCompletionRate,
        onboardingCompletionRate,
        totalTasks,
        completedTasks
      };

    } catch (error) {
      console.error('❌ Error extracting task data:', error);
      throw error;
    }
  }

  /**
   * Extract data from Events module
   */
  static async extractFromEvents(): Promise<EventData> {
    try {
      console.log('🎉 Extracting event data...');

      const events = await prisma.event.findMany({
        include: {
          guests: true
        }
      });

      const totalEvents = events.length;
      let totalGuests = 0;
      let confirmedGuests = 0;

      for (const event of events) {
        totalGuests += event.guests.length;
        confirmedGuests += event.guests.filter(guest => guest.rsvpStatus === 'CONFIRMED').length;
      }

      const eventRSVPRate = totalGuests > 0 ? (confirmedGuests / totalGuests) * 100 : 0;

      return {
        eventRSVPRate,
        totalEvents,
        totalGuests,
        confirmedGuests
      };

    } catch (error) {
      console.error('❌ Error extracting event data:', error);
      throw error;
    }
  }

  /**
   * Calculate all KPIs from source data
   */
  static async calculateAllKPIs(sourceData: SourceModuleData): Promise<CalculatedKPIs> {
    try {
      console.log('🧮 Calculating KPIs from source data...');

      const { accounting, procurement, tasks, events } = sourceData;

      // Financial KPIs
      const revenueGrowth = await this.calculateRevenueGrowth(accounting.totalRevenue);
      const operatingExpenses = accounting.totalExpenses;
      const netProfit = accounting.netIncome;
      const grossProfitMargin = accounting.totalRevenue > 0 ? (accounting.totalRevenue - accounting.totalExpenses) / accounting.totalRevenue * 100 : 0;
      const netProfitMargin = accounting.totalRevenue > 0 ? accounting.netIncome / accounting.totalRevenue * 100 : 0;
      const ebitda = accounting.netIncome; // Simplified - would need more detailed expense breakdown
      const budgetVariance = 0; // Would need budget data to calculate

      // Asset Management KPIs (simplified - would need portfolio data)
      const aum = 0; // Would need portfolio management data
      const portfolioIRR = 0; // Would need portfolio management data
      const roi = 0; // Would need portfolio management data

      // Balance Sheet KPIs
      const debtToEquityRatio = accounting.shareholdersEquity > 0 ? accounting.totalLiabilities / accounting.shareholdersEquity : 0;
      const returnOnAssets = accounting.totalAssets > 0 ? accounting.netIncome / accounting.totalAssets * 100 : 0;
      const returnOnEquity = accounting.shareholdersEquity > 0 ? accounting.netIncome / accounting.shareholdersEquity * 100 : 0;
      const cashConversionCycle = 0; // Would need more detailed data
      const accountsPayableTurnover = 0; // Would need more detailed data
      const daysPayableOutstanding = 0; // Would need more detailed data
      const cashFlow = accounting.cashBalance;

      // Operational KPIs
      const customerAcquisitionCost = 0; // Would need marketing data
      const invoiceProcessingTime = procurement.averageInvoiceProcessingTime;
      const contractApprovalTime = procurement.averageContractApprovalTime;
      const taskCompletionRate = tasks.taskCompletionRate;
      const trainingCompletionRate = tasks.trainingCompletionRate;
      const eventRSVPRate = events.eventRSVPRate;
      const userOnboardingRate = tasks.onboardingCompletionRate;
      const timeToHire = tasks.averageTimeToHire;

      return {
        // Financial KPIs
        revenueGrowth,
        operatingExpenses,
        netProfit,
        grossProfitMargin,
        netProfitMargin,
        ebitda,
        budgetVariance,
        
        // Asset Management KPIs
        aum,
        portfolioIRR,
        roi,
        
        // Balance Sheet KPIs
        debtToEquityRatio,
        returnOnAssets,
        returnOnEquity,
        cashConversionCycle,
        accountsPayableTurnover,
        daysPayableOutstanding,
        cashFlow,
        
        // Operational KPIs
        customerAcquisitionCost,
        invoiceProcessingTime,
        contractApprovalTime,
        taskCompletionRate,
        trainingCompletionRate,
        eventRSVPRate,
        userOnboardingRate,
        timeToHire
      };

    } catch (error) {
      console.error('❌ Error calculating KPIs:', error);
      throw error;
    }
  }

  /**
   * Calculate revenue growth (simplified - would need historical data)
   */
  static async calculateRevenueGrowth(currentRevenue: number): Promise<number> {
    try {
      // This is simplified - in a real implementation, you would need historical data
      // For now, we'll return 0 as we don't have historical data
      return 0;
    } catch (error) {
      console.error('❌ Error calculating revenue growth:', error);
      return 0;
    }
  }

  /**
   * Load calculated KPIs to external data collection
   */
  static async loadToExternalData(kpis: CalculatedKPIs): Promise<void> {
    try {
      console.log('💾 Loading KPIs to external data collection...');

      // Create or update external data record
      const externalData = {
        module: 'performance',
        entityType: 'kpi_metrics',
        entityId: 'current_metrics',
        data: {
          ...kpis,
          lastSyncTimestamp: new Date().toISOString(),
          syncStatus: 'completed'
        },
        timestamp: new Date(),
        status: 'active',
        sourceModule: 'etl_pipeline',
        sourceField: 'calculated_kpis'
      };

      // Check if record exists
      const existingRecord = await prisma.externalData.findFirst({
        where: {
          module: 'performance',
          entityType: 'kpi_metrics',
          entityId: 'current_metrics'
        }
      });

      if (existingRecord) {
        // Update existing record
        await prisma.externalData.update({
          where: { id: existingRecord.id },
          data: {
            data: externalData.data,
            timestamp: new Date(),
            updatedAt: new Date()
          }
        });
        console.log('✅ Updated existing external data record');
      } else {
        // Create new record
        await prisma.externalData.create({
          data: externalData
        });
        console.log('✅ Created new external data record');
      }

      console.log('✅ KPIs loaded to external data collection successfully');

    } catch (error) {
      console.error('❌ Error loading to external data:', error);
      throw error;
    }
  }

  /**
   * Get current metrics from external data
   */
  static async getCurrentMetrics(): Promise<CalculatedKPIs | null> {
    try {
      const record = await prisma.externalData.findFirst({
        where: {
          module: 'performance',
          entityType: 'kpi_metrics',
          entityId: 'current_metrics'
        }
      });

      if (!record) {
        return null;
      }

      return record.data as CalculatedKPIs;

    } catch (error) {
      console.error('❌ Error getting current metrics:', error);
      return null;
    }
  }

  /**
   * Schedule ETL job (placeholder for cron job integration)
   */
  static async scheduleETLJob(): Promise<void> {
    try {
      console.log('⏰ Scheduling ETL job...');
      
      // This would typically be handled by a cron job or scheduler
      // For now, we'll just run the ETL pipeline
      await this.runETLPipeline();
      
      console.log('✅ ETL job scheduled and completed');
      
    } catch (error) {
      console.error('❌ Error scheduling ETL job:', error);
      throw error;
    }
  }
}
