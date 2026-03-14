// @ts-nocheck
import { PrismaClient, Asset, DepreciationRecord } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../utils/database';
import { JournalEntryService } from './JournalEntryService';
import AuditService from './AuditService';

export interface CreateAssetParams {
  assetName: string;
  assetCode: string;
  description?: string;
  purchaseDate: Date;
  cost: number;
  usefulLifeYears: number;
  depreciationMethod: 'STRAIGHT_LINE' | 'DIMINISHING_BALANCE';
  salvageValue?: number;
  assetAccountId: string;
  accumulatedDepreciationAccountId: string;
  depreciationExpenseAccountId: string;
  location?: string;
  serialNumber?: string;
  warrantyExpiry?: Date;
  createdById: string;
  // Optional: Link to creditor bill or cashbook payment
  invoiceId?: string; // Link to creditor bill (procurement invoice)
  cashbookEntryId?: string; // Link to cashbook payment
}

export interface DepreciationCalculationParams {
  assetId: string;
  period: string; // YYYY-MM format
  createdById: string;
}

export interface AssetDisposalParams {
  assetId: string;
  disposalDate: Date;
  disposalValue: number;
  disposalMethod: 'SALE' | 'SCRAP' | 'DONATION' | 'TRADE_IN';
  description?: string;
  createdById: string;
}

export interface AssetWithRelations extends Asset {
  assetAccount: {
    id: string;
    accountNo: string;
    accountName: string;
  };
  accumulatedDepreciationAccount: {
    id: string;
    accountNo: string;
    accountName: string;
  };
  depreciationExpenseAccount: {
    id: string;
    accountNo: string;
    accountName: string;
  };
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  depreciationRecords: DepreciationRecord[];
}

export class AssetService {
  /**
   * Create a new asset
   */
  static async createAsset(params: CreateAssetParams): Promise<AssetWithRelations> {
    try {
      const {
        assetName,
        assetCode,
        description,
        purchaseDate,
        cost,
        usefulLifeYears,
        depreciationMethod,
        salvageValue = 0,
        assetAccountId,
        accumulatedDepreciationAccountId,
        depreciationExpenseAccountId,
        location,
        serialNumber,
        warrantyExpiry,
        createdById
      } = params;

      // Validate accounts exist
      const [assetAccount, accumulatedDepreciationAccount, depreciationExpenseAccount] = await Promise.all([
        prisma.chartOfAccounts.findUnique({ where: { id: assetAccountId } }),
        prisma.chartOfAccounts.findUnique({ where: { id: accumulatedDepreciationAccountId } }),
        prisma.chartOfAccounts.findUnique({ where: { id: depreciationExpenseAccountId } })
      ]);

      if (!assetAccount || !accumulatedDepreciationAccount || !depreciationExpenseAccount) {
        throw new Error('One or more required accounts not found');
      }

      // Create the asset
      const asset = await prisma.asset.create({
        data: {
          assetName,
          assetCode,
          description,
          purchaseDate,
          cost: new Decimal(cost),
          usefulLifeYears,
          depreciationMethod,
          currentBookValue: new Decimal(cost),
          salvageValue: new Decimal(salvageValue),
          assetAccountId,
          accumulatedDepreciationAccountId,
          depreciationExpenseAccountId,
          location,
          serialNumber,
          warrantyExpiry,
          createdById,
        },
        include: {
          assetAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          },
          accumulatedDepreciationAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          },
          depreciationExpenseAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          depreciationRecords: {
            orderBy: { period: 'desc' },
            take: 12
          }
        }
      });

      // Create initial journal entry for asset acquisition
      await this.createAssetAcquisitionJournalEntry(asset, createdById, params.invoiceId, params.cashbookEntryId);

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: 'CREATE',
        entityType: 'Asset',
        entityId: asset.id,
        newValues: asset,
      });

      return asset;
    } catch (error) {
      console.error('Error creating asset:', error);
      throw error;
    }
  }

  /**
   * Create asset acquisition journal entry
   * Supports linking to creditor bills (Accounts Payable) or cashbook payments (Bank Account)
   */
  private static async createAssetAcquisitionJournalEntry(
    asset: Asset, 
    createdById: string,
    invoiceId?: string,
    cashbookEntryId?: string
  ): Promise<void> {
    try {
      // Get default currency
      const defaultCurrency = await prisma.currency.findFirst({
        where: { code: 'USD' }
      });
      const currencyId = defaultCurrency?.id || 'default';

      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: asset.purchaseDate,
          referenceNumber: `ASSET-${asset.assetCode}`,
          description: `Asset acquisition: ${asset.assetName}`,
          totalAmount: asset.cost,
          currencyId: currencyId,
          status: 'POSTED',
          createdById
        }
      });

      // Create journal entry lines
      // DR Fixed Asset Account (12xx)
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: asset.assetAccountId,
          debitAmount: asset.cost,
          creditAmount: new Decimal(0),
          description: `Asset acquisition: ${asset.assetName}`,
          vatAmount: new Decimal(0)
        }
      });

      // Determine credit account based on payment method
      let creditAccountId: string | null = null;
      let creditDescription = '';

      if (invoiceId) {
        // Linked to Creditor Bill - CR Accounts Payable
        const accountsPayableAccount = await prisma.chartOfAccounts.findFirst({
          where: {
            OR: [
              { accountName: { contains: 'Accounts Payable' } },
              { accountName: { contains: 'Creditors Control' } },
              { accountNo: { startsWith: '2000' } } // Typically in 2000s range
            ],
            isActive: true
          }
        });

        if (!accountsPayableAccount) {
          throw new Error('Accounts Payable account not found. Please configure it in Chart of Accounts.');
        }

        creditAccountId = accountsPayableAccount.id;
        creditDescription = `Creditor bill for asset: ${asset.assetName}`;
      } else if (cashbookEntryId) {
        // Linked to Cashbook Payment - Get bank's GL account from cashbook entry
        const cashbookEntry = await prisma.cashbookEntry.findUnique({
          where: { id: cashbookEntryId },
          include: {
            bank: {
              include: {
                glAccount: true
              }
            }
          }
        });

        if (!cashbookEntry) {
          throw new Error('Cashbook entry not found');
        }

        if (!cashbookEntry.bank.glAccount) {
          throw new Error('Bank GL account not configured');
        }

        creditAccountId = cashbookEntry.bank.glAccount.id;
        creditDescription = `Cashbook payment for asset: ${asset.assetName}`;
      } else {
        // No link - assume cash purchase (CR Cash/Bank)
        const cashAccount = await prisma.chartOfAccounts.findFirst({
          where: {
            OR: [
              { accountName: { contains: 'Cash' } },
              { accountName: { contains: 'Bank' } },
              { accountNo: { startsWith: '1000' } } // Typically in 1000s range
            ],
            isActive: true
          }
        });

        if (!cashAccount) {
          throw new Error('Cash/Bank account not found. Please configure it in Chart of Accounts.');
        }

        creditAccountId = cashAccount.id;
        creditDescription = `Cash payment for asset: ${asset.assetName}`;
      }

      // CR Creditors Control/Bank Account
      if (creditAccountId) {
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: creditAccountId,
            debitAmount: new Decimal(0),
            creditAmount: asset.cost,
            description: creditDescription,
            vatAmount: new Decimal(0)
          }
        });
      }

      console.log(`✅ Asset acquisition journal entry created: ${journalEntry.referenceNumber}`);
      console.log(`   DR Fixed Asset: $${asset.cost}`);
      console.log(`   CR ${invoiceId ? 'Accounts Payable' : cashbookEntryId ? 'Bank Account' : 'Cash/Bank'}: $${asset.cost}`);
    } catch (error) {
      console.error('Error creating asset acquisition journal entry:', error);
      throw error;
    }
  }

  /**
   * Calculate and record depreciation for an asset
   */
  static async calculateDepreciation(params: DepreciationCalculationParams): Promise<DepreciationRecord> {
    try {
      const { assetId, period, createdById } = params;

      // Get asset details
      const asset = await prisma.asset.findUnique({
        where: { id: assetId }
      });

      if (!asset) {
        throw new Error('Asset not found');
      }

      if (asset.status !== 'IN_USE') {
        throw new Error('Cannot calculate depreciation for disposed assets');
      }

      // Check if depreciation already calculated for this period
      const existingDepreciation = await prisma.depreciationRecord.findUnique({
        where: {
          assetId_period: {
            assetId,
            period
          }
        }
      });

      if (existingDepreciation) {
        throw new Error(`Depreciation already calculated for period ${period}`);
      }

      // Calculate depreciation amount
      const depreciationAmount = this.calculateDepreciationAmount(asset, period);

      if (depreciationAmount <= 0) {
        throw new Error('No depreciation to calculate for this period');
      }

      // Get current accumulated depreciation
      const lastDepreciation = await prisma.depreciationRecord.findFirst({
        where: { assetId },
        orderBy: { period: 'desc' }
      });

      const currentAccumulatedDepreciation = lastDepreciation 
        ? Number(lastDepreciation.accumulatedDepreciation)
        : 0;

      const newAccumulatedDepreciation = currentAccumulatedDepreciation + depreciationAmount;
      const newBookValue = Number(asset.cost) - newAccumulatedDepreciation;

      // Create depreciation record
      const depreciationRecord = await prisma.depreciationRecord.create({
        data: {
          assetId,
          period,
          depreciationAmount: new Decimal(depreciationAmount),
          accumulatedDepreciation: new Decimal(newAccumulatedDepreciation),
          bookValue: new Decimal(newBookValue),
          createdById
        }
      });

      // Update asset book value
      await prisma.asset.update({
        where: { id: assetId },
        data: {
          currentBookValue: new Decimal(newBookValue)
        }
      });

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: 'CREATE',
        entityType: 'DepreciationRecord',
        entityId: depreciationRecord.id,
        newValues: depreciationRecord,
      });

      return depreciationRecord;
    } catch (error) {
      console.error('Error calculating depreciation:', error);
      throw error;
    }
  }

  /**
   * Calculate depreciation amount based on method
   */
  private static calculateDepreciationAmount(asset: Asset, period: string): number {
    const cost = Number(asset.cost);
    const salvageValue = Number(asset.salvageValue);
    const usefulLifeYears = asset.usefulLifeYears;
    const depreciationMethod = asset.depreciationMethod;

    if (depreciationMethod === 'STRAIGHT_LINE') {
      return (cost - salvageValue) / usefulLifeYears / 12; // Monthly depreciation
    } else if (depreciationMethod === 'DIMINISHING_BALANCE') {
      // Using double declining balance method
      const rate = 2 / usefulLifeYears;
      const currentBookValue = Number(asset.currentBookValue);
      return currentBookValue * rate / 12; // Monthly depreciation
    }

    return 0;
  }

  /**
   * Post depreciation journal entry
   */
  static async postDepreciation(depreciationId: string, createdById: string): Promise<void> {
    try {
      const depreciation = await prisma.depreciationRecord.findUnique({
        where: { id: depreciationId },
        include: {
          asset: {
            include: {
              depreciationExpenseAccount: true,
              accumulatedDepreciationAccount: true
            }
          }
        }
      });

      if (!depreciation) {
        throw new Error('Depreciation record not found');
      }

      if (depreciation.isPosted) {
        throw new Error('Depreciation already posted');
      }

      // Resolve currency: use default or first active (JournalEntry.currencyId is FK to Currency.id)
      const currency = await prisma.currency.findFirst({
        where: { isActive: true },
        orderBy: [{ isDefault: 'desc' }]
      });
      if (!currency) {
        throw new Error('No active currency found. Create a currency before posting depreciation.');
      }

      // Unique reference (JournalEntry.referenceNumber is unique; multiple assets can share same period)
      const referenceNumber = `DEP-${depreciation.period}-${depreciationId.slice(-8)}`;

      // Use last day of period month so the entry falls in the correct reporting period
      const [year, month] = depreciation.period.split('-').map(Number);
      const lastDay = new Date(year, month, 0);
      const transactionDate = lastDay;

      // Create journal entry
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate,
          referenceNumber,
          description: `Depreciation for ${depreciation.asset.assetName} - ${depreciation.period}`,
          totalAmount: depreciation.depreciationAmount,
          currencyId: currency.id,
          status: 'POSTED',
          createdById
        }
      });

      // Create journal entry lines
      // Dr Depreciation Expense
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: depreciation.asset.depreciationExpenseAccountId,
          debitAmount: depreciation.depreciationAmount,
          creditAmount: new Decimal(0),
          description: `Depreciation expense: ${depreciation.asset.assetName}`,
          vatAmount: new Decimal(0)
        }
      });

      // Cr Accumulated Depreciation
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: depreciation.asset.accumulatedDepreciationAccountId,
          debitAmount: new Decimal(0),
          creditAmount: depreciation.depreciationAmount,
          description: `Accumulated depreciation: ${depreciation.asset.assetName}`,
          vatAmount: new Decimal(0)
        }
      });

      // Update depreciation record as posted
      await prisma.depreciationRecord.update({
        where: { id: depreciationId },
        data: {
          isPosted: true,
          postedAt: new Date()
        }
      });

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: 'UPDATE',
        entityType: 'DepreciationRecord',
        entityId: depreciationId,
        newValues: { isPosted: true, postedAt: new Date() },
      });
    } catch (error) {
      console.error('Error posting depreciation:', error);
      throw error;
    }
  }

  /**
   * Dispose of an asset
   */
  static async disposeAsset(params: AssetDisposalParams): Promise<void> {
    try {
      const { assetId, disposalDate, disposalValue, disposalMethod, description, createdById } = params;

      // Wrap in transaction for atomicity
      await prisma.$transaction(async (tx) => {
        const asset = await tx.asset.findUnique({
          where: { id: assetId }
        });

        if (!asset) {
          throw new Error('Asset not found');
        }

        if (asset.status === 'DISPOSED') {
          throw new Error('Asset already disposed');
        }

        const bookValue = Number(asset.currentBookValue);
        const gainLoss = disposalValue - bookValue;

        // Create disposal record
        const disposalRecord = await tx.assetDisposalRecord.create({
          data: {
            assetId,
            disposalDate,
            disposalValue: new Decimal(disposalValue),
            disposalMethod,
            gainLoss: new Decimal(gainLoss),
            description,
            createdById
          }
        });

        // Update asset status
        await tx.asset.update({
          where: { id: assetId },
          data: {
            status: 'DISPOSED',
            disposalDate,
            disposalValue: new Decimal(disposalValue),
            disposalGainLoss: new Decimal(gainLoss)
          }
        });

        // Create disposal journal entry within transaction
        await this.createAssetDisposalJournalEntryInTransaction(tx, asset, disposalRecord, createdById);
      });

      // Audit log (outside transaction)
      await AuditService.log({
        userId: createdById,
        action: 'UPDATE',
        entityType: 'Asset',
        entityId: assetId,
        newValues: { status: 'DISPOSED', disposalDate, disposalValue },
      });
    } catch (error) {
      console.error('Error disposing asset:', error);
      throw error;
    }
  }

  /**
   * Create asset disposal journal entry (legacy - non-transactional)
   * @deprecated Use createAssetDisposalJournalEntryInTransaction instead
   */
  private static async createAssetDisposalJournalEntry(asset: Asset, disposalRecord: any, createdById: string): Promise<void> {
    console.warn('DEPRECATED: Use createAssetDisposalJournalEntryInTransaction for transaction safety');
    // Legacy method kept for backward compatibility
    // New code should use the transaction-aware version
  }

  /**
   * Create asset disposal journal entry within a transaction
   * This ensures proper balancing and atomicity
   */
  private static async createAssetDisposalJournalEntryInTransaction(
    tx: any,
    asset: Asset,
    disposalRecord: any,
    createdById: string
  ): Promise<void> {
    try {
      // Get accumulated depreciation
      const totalDepreciation = await tx.depreciationRecord.aggregate({
        where: { assetId: asset.id, isPosted: true },
        _sum: { depreciationAmount: true }
      });

      const accumulatedDepreciation = Number(totalDepreciation._sum.depreciationAmount || 0);
      const assetCost = Number(asset.cost);
      const disposalValue = Number(disposalRecord.disposalValue);
      const bookValue = assetCost - accumulatedDepreciation;
      const gainLoss = disposalValue - bookValue;

      // Validate: Total Debits = Disposal Value + Accumulated Depreciation + Loss (if any)
      // Validate: Total Credits = Asset Cost + Gain (if any)
      const expectedDebits = disposalValue + accumulatedDepreciation + (gainLoss < 0 ? Math.abs(gainLoss) : 0);
      const expectedCredits = assetCost + (gainLoss > 0 ? gainLoss : 0);
      
      if (Math.abs(expectedDebits - expectedCredits) > 0.01) {
        throw new Error(
          `Asset disposal entry would be unbalanced! ` +
          `Debits: ${expectedDebits.toFixed(2)}, Credits: ${expectedCredits.toFixed(2)}. ` +
          `Asset Cost: ${assetCost}, Accum Depr: ${accumulatedDepreciation}, ` +
          `Disposal Value: ${disposalValue}, Gain/Loss: ${gainLoss.toFixed(2)}`
        );
      }

      // Get required accounts
      const cashAccount = await tx.chartOfAccounts.findFirst({
        where: {
          accountName: { contains: 'Cash' },
          isActive: true
        }
      });

      if (!cashAccount) {
        throw new Error('Cash account not found. Please ensure chart of accounts is properly configured.');
      }

      // Get or create gain/loss account (REQUIRED for balanced entry)
      let gainLossAccount = null;
      if (Math.abs(gainLoss) > 0.01) {
        const accountType = gainLoss > 0 ? 'Gain' : 'Loss';
        gainLossAccount = await tx.chartOfAccounts.findFirst({
          where: {
            accountName: { contains: accountType },
            accountType: gainLoss > 0 ? 'Revenue' : 'Expense',
            isActive: true
          }
        });

        if (!gainLossAccount) {
          throw new Error(
            `${accountType} on Disposal account not found. ` +
            `A ${accountType.toLowerCase()} account is required to balance the disposal entry. ` +
            `Please create a "${accountType} on Asset Disposal" account in your chart of accounts.`
          );
        }
      }

      // Create journal entry
      const journalEntry = await tx.journalEntry.create({
        data: {
          transactionDate: disposalRecord.disposalDate,
          referenceNumber: `DISPOSAL-${asset.assetCode}`,
          description: `Asset disposal: ${asset.assetName}`,
          totalAmount: new Decimal(assetCost), // Total should be asset cost
          currencyId: 'default',
          status: 'POSTED',
          createdById
        }
      });

      // Create journal entry lines
      // 1. Dr Cash/Bank (disposal proceeds)
      await tx.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: cashAccount.id,
          debitAmount: new Decimal(disposalValue),
          creditAmount: new Decimal(0),
          description: `Proceeds from disposal: ${asset.assetName}`,
          vatAmount: new Decimal(0)
        }
      });

      // 2. Dr Accumulated Depreciation (clear it) - only if there is accumulated depreciation
      if (accumulatedDepreciation > 0.01) {
        await tx.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: asset.accumulatedDepreciationAccountId,
            debitAmount: new Decimal(accumulatedDepreciation),
            creditAmount: new Decimal(0),
            description: `Clear accumulated depreciation: ${asset.assetName}`,
            vatAmount: new Decimal(0)
          }
        });
      }

      // 3. Dr Loss on Disposal OR Cr Gain on Disposal (balancing entry - REQUIRED)
      if (gainLossAccount && Math.abs(gainLoss) > 0.01) {
        await tx.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: gainLossAccount.id,
            debitAmount: gainLoss < 0 ? new Decimal(Math.abs(gainLoss)) : new Decimal(0),
            creditAmount: gainLoss > 0 ? new Decimal(gainLoss) : new Decimal(0),
            description: `${gainLoss > 0 ? 'Gain' : 'Loss'} on disposal: ${asset.assetName}`,
            vatAmount: new Decimal(0)
          }
        });
      }

      // 4. Cr Asset Account (remove original cost)
      await tx.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: asset.assetAccountId,
          debitAmount: new Decimal(0),
          creditAmount: new Decimal(assetCost),
          description: `Remove asset: ${asset.assetName}`,
          vatAmount: new Decimal(0)
        }
      });

      // Verify the entry balances
      const lines = await tx.journalEntryLine.findMany({
        where: { journalEntryId: journalEntry.id }
      });

      const totalDebits = lines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
      const totalCredits = lines.reduce((sum, line) => sum + Number(line.creditAmount), 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error(
          `CRITICAL: Asset disposal entry is unbalanced! ` +
          `Debits: ${totalDebits.toFixed(2)}, Credits: ${totalCredits.toFixed(2)}`
        );
      }

    } catch (error) {
      console.error('Error creating asset disposal journal entry in transaction:', error);
      throw error;
    }
  }

  /**
   * Get assets with filtering
   */
  static async getAssets(filters: {
    search?: string;
    status?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    assets: AssetWithRelations[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        search,
        status,
        isActive = true,
        page = 1,
        limit = 10
      } = filters;

      const where: any = {};

      if (search) {
        where.OR = [
          { assetName: { contains: search } },
          { assetCode: { contains: search } },
          { description: { contains: search } }
        ];
      }

      if (status) {
        where.status = status;
      }

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const [assets, total] = await Promise.all([
        prisma.asset.findMany({
          where,
          include: {
            assetAccount: {
              select: {
                id: true,
                accountNo: true,
                accountName: true
              }
            },
            accumulatedDepreciationAccount: {
              select: {
                id: true,
                accountNo: true,
                accountName: true
              }
            },
            depreciationExpenseAccount: {
              select: {
                id: true,
                accountNo: true,
                accountName: true
              }
            },
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            },
            depreciationRecords: {
              orderBy: { period: 'desc' },
              take: 12
            }
          },
          orderBy: { assetName: 'asc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.asset.count({ where })
      ]);

      return {
        assets,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error getting assets:', error);
      throw error;
    }
  }

  /**
   * Get asset register
   */
  static async getAssetRegister(): Promise<Array<{
    assetId: string;
    assetName: string;
    assetCode: string;
    cost: number;
    accumulatedDepreciation: number;
    bookValue: number;
    status: string;
    purchaseDate: Date;
  }>> {
    try {
      const assets = await prisma.asset.findMany({
        where: { isActive: true },
        include: {
          depreciationRecords: {
            where: { isPosted: true }
          }
        }
      });

      return assets.map(asset => {
        const accumulatedDepreciation = asset.depreciationRecords.reduce((sum, record) => {
          return sum + Number(record.depreciationAmount);
        }, 0);

        return {
          assetId: asset.id,
          assetName: asset.assetName,
          assetCode: asset.assetCode,
          cost: Number(asset.cost),
          accumulatedDepreciation,
          bookValue: Number(asset.currentBookValue),
          status: asset.status,
          purchaseDate: asset.purchaseDate
        };
      });
    } catch (error) {
      console.error('Error getting asset register:', error);
      throw error;
    }
  }

  /**
   * Get depreciation schedule
   */
  static async getDepreciationSchedule(assetId: string): Promise<Array<{
    period: string;
    depreciationAmount: number;
    accumulatedDepreciation: number;
    bookValue: number;
    isPosted: boolean;
  }>> {
    try {
      const depreciationRecords = await prisma.depreciationRecord.findMany({
        where: { assetId },
        orderBy: { period: 'asc' }
      });

      return depreciationRecords.map(record => ({
        period: record.period,
        depreciationAmount: Number(record.depreciationAmount),
        accumulatedDepreciation: Number(record.accumulatedDepreciation),
        bookValue: Number(record.bookValue),
        isPosted: record.isPosted
      }));
    } catch (error) {
      console.error('Error getting depreciation schedule:', error);
      throw error;
    }
  }

  /**
   * Update asset
   */
  static async updateAsset(
    assetId: string,
    updates: Partial<CreateAssetParams>,
    updatedById: string
  ): Promise<AssetWithRelations> {
    try {
      const asset = await prisma.asset.findUnique({
        where: { id: assetId }
      });

      if (!asset) {
        throw new Error('Asset not found');
      }

      const updatedAsset = await prisma.asset.update({
        where: { id: assetId },
        data: {
          ...(updates.assetName && { assetName: updates.assetName }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.location && { location: updates.location }),
          ...(updates.serialNumber && { serialNumber: updates.serialNumber }),
          ...(updates.warrantyExpiry && { warrantyExpiry: updates.warrantyExpiry }),
          ...(updates.isActive !== undefined && { isActive: updates.isActive })
        },
        include: {
          assetAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          },
          accumulatedDepreciationAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          },
          depreciationExpenseAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          },
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          depreciationRecords: {
            orderBy: { period: 'desc' },
            take: 12
          }
        }
      });

      // Audit log
      await AuditService.log({
        userId: updatedById,
        action: 'UPDATE',
        entityType: 'Asset',
        entityId: assetId,
        oldValues: asset,
        newValues: updatedAsset,
      });

      return updatedAsset;
    } catch (error) {
      console.error('Error updating asset:', error);
      throw error;
    }
  }

  /**
   * Delete asset (soft delete)
   */
  static async deleteAsset(assetId: string, deletedById: string): Promise<void> {
    try {
      const asset = await prisma.asset.findUnique({
        where: { id: assetId }
      });

      if (!asset) {
        throw new Error('Asset not found');
      }

      if (asset.status === 'IN_USE') {
        throw new Error('Cannot delete asset that is still in use');
      }

      await prisma.asset.update({
        where: { id: assetId },
        data: { isActive: false }
      });

      // Audit log
      await AuditService.log({
        userId: deletedById,
        action: 'DELETE',
        entityType: 'Asset',
        entityId: assetId,
        oldValues: asset,
      });
    } catch (error) {
      console.error('Error deleting asset:', error);
      throw error;
    }
  }

  /**
   * Post monthly depreciation for all assets
   */
  static async postMonthlyDepreciation(createdById: string): Promise<{
    processedAssets: number;
    totalDepreciation: number;
    depreciationRecords: Array<{
      assetId: string;
      assetName: string;
      depreciationAmount: number;
    }>;
  }> {
    try {
      const currentDate = new Date();
      const period = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      
      const assets = await prisma.asset.findMany({
        where: { 
          isActive: true,
          status: 'IN_USE'
        }
      });

      const depreciationRecords = [];
      let totalDepreciation = 0;

      for (const asset of assets) {
        try {
          const depreciationRecord = await this.calculateDepreciation({
            assetId: asset.id,
            period,
            createdById
          });

          await this.postDepreciation(depreciationRecord.id, createdById);
          
          depreciationRecords.push({
            assetId: asset.id,
            assetName: asset.assetName,
            depreciationAmount: Number(depreciationRecord.depreciationAmount)
          });

          totalDepreciation += Number(depreciationRecord.depreciationAmount);
        } catch (error) {
          console.error(`Error processing depreciation for asset ${asset.id}:`, error);
          // Continue with other assets
        }
      }

      return {
        processedAssets: depreciationRecords.length,
        totalDepreciation,
        depreciationRecords
      };
    } catch (error) {
      console.error('Error posting monthly depreciation:', error);
      throw error;
    }
  }

  /**
   * Post annual depreciation for all assets
   */
  static async postAnnualDepreciation(year: number, createdById: string): Promise<{
    processedAssets: number;
    totalDepreciation: number;
    depreciationRecords: Array<{
      assetId: string;
      assetName: string;
      depreciationAmount: number;
    }>;
  }> {
    try {
      const assets = await prisma.asset.findMany({
        where: { 
          isActive: true,
          status: 'IN_USE'
        }
      });

      const depreciationRecords = [];
      let totalDepreciation = 0;

      for (const asset of assets) {
        try {
          // Calculate annual depreciation
          const annualDepreciation = this.calculateAnnualDepreciation(asset);
          
          const depreciationRecord = await prisma.depreciationRecord.create({
            data: {
              assetId: asset.id,
              period: `${year}-12`,
              depreciationAmount: new Decimal(annualDepreciation),
              accumulatedDepreciation: new Decimal(annualDepreciation),
              bookValue: new Decimal(Number(asset.currentBookValue) - annualDepreciation),
              isPosted: true,
              postedAt: new Date(),
              createdById
            }
          });

          // Update asset book value
          await prisma.asset.update({
            where: { id: asset.id },
            data: {
              currentBookValue: new Decimal(Number(asset.currentBookValue) - annualDepreciation)
            }
          });

          depreciationRecords.push({
            assetId: asset.id,
            assetName: asset.assetName,
            depreciationAmount: annualDepreciation
          });

          totalDepreciation += annualDepreciation;
        } catch (error) {
          console.error(`Error processing annual depreciation for asset ${asset.id}:`, error);
          // Continue with other assets
        }
      }

      return {
        processedAssets: depreciationRecords.length,
        totalDepreciation,
        depreciationRecords
      };
    } catch (error) {
      console.error('Error posting annual depreciation:', error);
      throw error;
    }
  }

  /**
   * Revalue asset to new value
   */
  static async revalueAsset(assetId: string, newValue: number, createdById: string): Promise<AssetWithRelations> {
    try {
      const asset = await prisma.asset.findUnique({
        where: { id: assetId }
      });

      if (!asset) {
        throw new Error('Asset not found');
      }

      const oldValue = Number(asset.currentBookValue);
      const revaluationGainLoss = newValue - oldValue;

      // Update asset
      const updatedAsset = await prisma.asset.update({
        where: { id: assetId },
        data: {
          currentBookValue: new Decimal(newValue)
        },
        include: {
          assetAccount: true,
          accumulatedDepreciationAccount: true,
          depreciationExpenseAccount: true,
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      // Create revaluation journal entry
      await this.createRevaluationJournalEntry(asset, newValue, revaluationGainLoss, createdById);

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: 'UPDATE',
        entityType: 'Asset',
        entityId: assetId,
        oldValues: { currentBookValue: oldValue },
        newValues: { currentBookValue: newValue }
      });

      return updatedAsset;
    } catch (error) {
      console.error('Error revaluing asset:', error);
      throw error;
    }
  }

  /**
   * Generate asset register report
   */
  static async generateAssetRegister(): Promise<Array<{
    id: string;
    assetName: string;
    assetCode: string;
    purchaseDate: Date;
    cost: number;
    currentBookValue: number;
    accumulatedDepreciation: number;
    status: string;
    location?: string;
  }>> {
    try {
      const assets = await prisma.asset.findMany({
        where: { isActive: true },
        include: {
          depreciationRecords: {
            orderBy: { period: 'desc' },
            take: 1
          }
        }
      });

      return assets.map(asset => {
        const latestDepreciation = asset.depreciationRecords[0];
        const accumulatedDepreciation = latestDepreciation 
          ? Number(latestDepreciation.accumulatedDepreciation)
          : 0;

        return {
          id: asset.id,
          assetName: asset.assetName,
          assetCode: asset.assetCode,
          purchaseDate: asset.purchaseDate,
          cost: Number(asset.cost),
          currentBookValue: Number(asset.currentBookValue),
          accumulatedDepreciation,
          status: asset.status,
          location: asset.location || undefined
        };
      });
    } catch (error) {
      console.error('Error generating asset register:', error);
      throw error;
    }
  }

  /**
   * Generate depreciation schedule for all assets
   */
  static async generateDepreciationSchedule(): Promise<Array<{
    assetId: string;
    assetName: string;
    assetCode: string;
    cost: number;
    usefulLifeYears: number;
    depreciationMethod: string;
    annualDepreciation: number;
    monthlyDepreciation: number;
    totalDepreciation: number;
    remainingValue: number;
  }>> {
    try {
      const assets = await prisma.asset.findMany({
        where: { 
          isActive: true,
          status: 'IN_USE'
        }
      });

      return assets.map(asset => {
        const annualDepreciation = this.calculateAnnualDepreciation(asset);
        const monthlyDepreciation = annualDepreciation / 12;
        
        // Get total depreciation from records
        return prisma.depreciationRecord.aggregate({
          where: { assetId: asset.id },
          _sum: { depreciationAmount: true }
        }).then(result => {
          const totalDepreciation = result._sum.depreciationAmount || 0;
          const remainingValue = Number(asset.cost) - Number(totalDepreciation);

          return {
            assetId: asset.id,
            assetName: asset.assetName,
            assetCode: asset.assetCode,
            cost: Number(asset.cost),
            usefulLifeYears: asset.usefulLifeYears,
            depreciationMethod: asset.depreciationMethod,
            annualDepreciation,
            monthlyDepreciation,
            totalDepreciation: Number(totalDepreciation),
            remainingValue
          };
        });
      });
    } catch (error) {
      console.error('Error generating depreciation schedule:', error);
      throw error;
    }
  }

  /**
   * Calculate annual depreciation for an asset
   */
  private static calculateAnnualDepreciation(asset: any): number {
    const cost = Number(asset.cost);
    const salvageValue = Number(asset.salvageValue);
    const usefulLife = asset.usefulLifeYears;

    if (asset.depreciationMethod === 'STRAIGHT_LINE') {
      return (cost - salvageValue) / usefulLife;
    } else if (asset.depreciationMethod === 'DIMINISHING_BALANCE') {
      // Using double declining balance method
      const rate = 2 / usefulLife;
      return Number(asset.currentBookValue) * rate;
    }

    return 0;
  }

  /**
   * Create revaluation journal entry
   */
  private static async createRevaluationJournalEntry(
    asset: any, 
    newValue: number, 
    revaluationGainLoss: number, 
    createdById: string
  ): Promise<void> {
    try {
      const journalEntry = await prisma.journalEntry.create({
        data: {
          entryNumber: `REV-${Date.now()}`,
          description: `Asset revaluation - ${asset.assetName}`,
          entryDate: new Date(),
          status: 'POSTED',
          createdById
        }
      });

      if (revaluationGainLoss > 0) {
        // Revaluation gain
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            accountId: asset.assetAccountId,
            debitAmount: new Decimal(revaluationGainLoss),
            creditAmount: new Decimal(0),
            description: 'Asset revaluation gain'
          }
        });

        // Credit revaluation reserve
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            accountId: asset.assetAccountId, // This should be a revaluation reserve account
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(revaluationGainLoss),
            description: 'Revaluation reserve'
          }
        });
      } else if (revaluationGainLoss < 0) {
        // Revaluation loss
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            accountId: asset.assetAccountId, // This should be a revaluation loss account
            debitAmount: new Decimal(Math.abs(revaluationGainLoss)),
            creditAmount: new Decimal(0),
            description: 'Asset revaluation loss'
          }
        });

        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            accountId: asset.assetAccountId,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(Math.abs(revaluationGainLoss)),
            description: 'Asset revaluation'
          }
        });
      }
    } catch (error) {
      console.error('Error creating revaluation journal entry:', error);
      throw error;
    }
  }
}
