// @ts-nocheck
import { PrismaClient, Asset, DepreciationRecord } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../utils/database';
import { JournalEntryService } from './JournalEntryService';
import AuditService from './AuditService';
import {
  assignNextAuditIdAndCreateJournal,
  createJournalEntryWithAuditSequence,
} from './AuditTrailSequenceService';

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
  /** Journal + asset recorded currency (e.g. ZiG bank purchase). Resolved from paymentBank if omitted. */
  currencyId?: string;
  /** Pay from bank: credits this bank’s GL account (use for cash purchase without a cashbook row). */
  paymentBankId?: string;
  /** Explicit credit GL (bank/cash) when not using paymentBankId / cashbook / AP. */
  creditChartOfAccountId?: string;
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
  /** Journal currency (e.g. ZiG); defaults from asset or bank. */
  currencyId?: string;
  /** Cash/bank sale: debit this bank’s GL for proceeds. */
  paymentBankId?: string;
  /** Debit this GL for proceeds when not using paymentBankId. */
  proceedsChartOfAccountId?: string;
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
  /** Currency precision — stop depreciating when book value is within this of scrap value. */
  private static readonly DEPRECIATION_SALVAGE_EPSILON = 0.01;

  /** Max depreciation this period without taking book value below salvage (scrap / residual value). */
  private static maxDepreciationBeforeScrapFloor(asset: Asset): number {
    const book = Number(asset.currentBookValue);
    const salvage = Number(asset.salvageValue ?? 0);
    const room = book - salvage;
    if (room <= AssetService.DEPRECIATION_SALVAGE_EPSILON) return 0;
    return room;
  }

  /** Clamp period depreciation so book value never falls below salvage value. */
  private static capDepreciationBySalvage(asset: Asset, rawDepreciation: number): number {
    if (rawDepreciation <= 0) return 0;
    const maxDep = AssetService.maxDepreciationBeforeScrapFloor(asset);
    if (maxDep <= 0) return 0;
    const capped = Math.min(rawDepreciation, maxDep);
    return Math.round(capped * 100) / 100;
  }

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
        createdById,
        currencyId: paramCurrencyId,
        paymentBankId,
        creditChartOfAccountId,
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

      let resolvedCurrencyId = paramCurrencyId;
      if (!resolvedCurrencyId && paymentBankId) {
        const b = await prisma.bank.findUnique({
          where: { id: paymentBankId },
          select: { currencyId: true },
        });
        if (!b) throw new Error('paymentBankId: bank not found');
        resolvedCurrencyId = b.currencyId;
      }
      if (!resolvedCurrencyId) {
        const zig = await prisma.currency.findFirst({
          where: {
            isActive: true,
            code: { in: ['ZWG', 'ZWL', 'ZIG'] },
          },
          orderBy: { code: 'asc' },
        });
        resolvedCurrencyId = zig?.id;
      }
      if (!resolvedCurrencyId) {
        const usd = await prisma.currency.findFirst({
          where: { code: 'USD', isActive: true },
        });
        resolvedCurrencyId = usd?.id;
      }
      if (!resolvedCurrencyId) {
        const any = await prisma.currency.findFirst({
          where: { isActive: true },
          orderBy: { isDefault: 'desc' },
        });
        resolvedCurrencyId = any?.id;
      }
      if (!resolvedCurrencyId) {
        throw new Error('No currency found; pass currencyId or use paymentBankId with a bank that has a currency.');
      }

      const currencyRow = await prisma.currency.findUnique({
        where: { id: resolvedCurrencyId },
      });
      if (!currencyRow) throw new Error('currencyId not found');

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
          recordedCurrencyId: resolvedCurrencyId,
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
      await this.createAssetAcquisitionJournalEntry(asset, createdById, {
        currencyId: resolvedCurrencyId,
        invoiceId: params.invoiceId,
        cashbookEntryId: params.cashbookEntryId,
        paymentBankId: params.paymentBankId,
        creditChartOfAccountId: params.creditChartOfAccountId,
      });

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
   * Supports AP (invoice), cashbook payment, explicit bank (paymentBankId), explicit credit GL, or generic cash/bank lookup.
   */
  private static async createAssetAcquisitionJournalEntry(
    asset: Asset,
    createdById: string,
    options: {
      currencyId: string;
      invoiceId?: string;
      cashbookEntryId?: string;
      paymentBankId?: string;
      creditChartOfAccountId?: string;
    }
  ): Promise<void> {
    try {
      const {
        currencyId,
        invoiceId,
        cashbookEntryId,
        paymentBankId,
        creditChartOfAccountId,
      } = options;

      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate: asset.purchaseDate,
        referenceNumber: `ASSET-${asset.assetCode}`,
        description: `Asset acquisition: ${asset.assetName}`,
        totalAmount: asset.cost,
        currencyId,
        status: 'POSTED',
        createdById,
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
      } else if (creditChartOfAccountId) {
        const acct = await prisma.chartOfAccounts.findFirst({
          where: { id: creditChartOfAccountId, isActive: true },
        });
        if (!acct) {
          throw new Error('creditChartOfAccountId not found or inactive');
        }
        creditAccountId = acct.id;
        creditDescription = `Bank/cash payment for asset: ${asset.assetName}`;
      } else if (paymentBankId) {
        const bank = await prisma.bank.findUnique({
          where: { id: paymentBankId },
          include: { glAccount: true, currency: true },
        });
        if (!bank) throw new Error('paymentBankId: bank not found');
        if (!bank.glAccount) {
          throw new Error('Bank has no GL account linked; set glAccountId on the bank record.');
        }
        if (bank.currencyId !== currencyId) {
          const jCur = await prisma.currency.findUnique({
            where: { id: currencyId },
            select: { code: true },
          });
          throw new Error(
            `Bank currency does not match journal currency (bank: ${bank.currency?.code ?? '?'}, journal: ${jCur?.code ?? currencyId}). Pass matching currencyId or choose a bank in the same currency.`
          );
        }
        creditAccountId = bank.glAccount.id;
        creditDescription = `Bank payment for asset: ${asset.assetName}`;
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
          throw new Error(
            'Cash/Bank account not found. Pass paymentBankId, creditChartOfAccountId, cashbookEntryId, or invoiceId.'
          );
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
      console.log(`   DR Fixed Asset: ${asset.cost}`);
      console.log(
        `   CR ${invoiceId ? 'Accounts Payable' : cashbookEntryId ? 'Bank (cashbook)' : paymentBankId ? 'Bank GL' : creditChartOfAccountId ? 'Credit GL' : 'Cash/Bank'}: ${asset.cost}`
      );
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

      const rawPeriodAmount = this.computeRawPeriodDepreciation(asset, period);
      const depreciationAmount = this.capDepreciationBySalvage(asset, rawPeriodAmount);

      if (depreciationAmount <= 0) {
        const salvage = Number(asset.salvageValue ?? 0);
        const book = Number(asset.currentBookValue);
        if (book <= salvage + AssetService.DEPRECIATION_SALVAGE_EPSILON) {
          throw new Error(
            'No depreciation to post: book value is at or below scrap value (residual).'
          );
        }
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
   * Raw period depreciation (monthly) from method — not yet capped to scrap/residual floor.
   * `period` is YYYY-MM; used to detect month length if extended later.
   */
  private static computeRawPeriodDepreciation(asset: Asset, period: string): number {
    const cost = Number(asset.cost);
    const salvageValue = Number(asset.salvageValue ?? 0);
    const usefulLifeYears = asset.usefulLifeYears;
    const depreciationMethod = asset.depreciationMethod;

    if (depreciationMethod === 'STRAIGHT_LINE') {
      return (cost - salvageValue) / usefulLifeYears / 12;
    }
    if (depreciationMethod === 'DIMINISHING_BALANCE') {
      const rate = 2 / usefulLifeYears;
      const currentBookValue = Number(asset.currentBookValue);
      return (currentBookValue * rate) / 12;
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

      const salvage = Number(depreciation.asset.salvageValue ?? 0);
      const bookAfter = Number(depreciation.bookValue);
      if (bookAfter < salvage - AssetService.DEPRECIATION_SALVAGE_EPSILON) {
        throw new Error(
          'Cannot post depreciation: book value would be below scrap value (residual).'
        );
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
      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate,
        referenceNumber,
        description: `Depreciation for ${depreciation.asset.assetName} - ${depreciation.period}`,
        totalAmount: depreciation.depreciationAmount,
        currencyId: currency.id,
        status: 'POSTED',
        createdById,
      });

      // Create journal entry lines (accounts come from the asset: typically Dr 5130 expense, Cr 1550 accum. depr.)
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

      // Wrap in transaction for atomicity (disposal JE can be many queries; allow >5s)
      await prisma.$transaction(
        async (tx) => {
        const asset = await tx.asset.findUnique({
          where: { id: assetId }
        });

        if (!asset) {
          throw new Error('Asset not found');
        }

        if (asset.status === 'DISPOSED') {
          throw new Error('Asset already disposed');
        }

        const totalDepreciationAgg = await tx.depreciationRecord.aggregate({
          where: { assetId: asset.id, isPosted: true },
          _sum: { depreciationAmount: true },
        });
        const accumulatedFromPosted = Number(totalDepreciationAgg._sum.depreciationAmount || 0);
        const assetCost = Number(asset.cost);
        const bookValueFromLedger = assetCost - accumulatedFromPosted;
        const gainLoss = disposalValue - bookValueFromLedger;

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

        // Remove from active register: disposed assets are excluded from IN_USE + isActive listings
        await tx.asset.update({
          where: { id: assetId },
          data: {
            status: 'DISPOSED',
            isActive: false,
            disposalDate,
            disposalValue: new Decimal(disposalValue),
            disposalGainLoss: new Decimal(gainLoss)
          }
        });

        // Create disposal journal entry within transaction
        await this.createAssetDisposalJournalEntryInTransaction(tx, asset, disposalRecord, createdById, {
          currencyId: params.currencyId,
          paymentBankId: params.paymentBankId,
          proceedsChartOfAccountId: params.proceedsChartOfAccountId,
        });
        },
        { maxWait: 15000, timeout: 60000 }
      );

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

  private static async findGainOnDisposalAccount(tx: any) {
    const tries = [
      { isActive: true, accountName: { contains: 'Gain on disposal' } },
      { isActive: true, accountName: { contains: 'Gain on Disposal' } },
      {
        isActive: true,
        AND: [
          { accountType: { in: ['Revenue', 'Income'] } },
          { accountName: { contains: 'Disposal' } },
        ],
      },
      {
        isActive: true,
        AND: [
          { accountType: { in: ['Revenue', 'Income'] } },
          { OR: [{ accountName: { contains: 'Gain on sale' } }, { accountName: { contains: 'Asset sale' } }] },
        ],
      },
    ];
    for (const where of tries) {
      const a = await tx.chartOfAccounts.findFirst({ where });
      if (a) return a;
    }
    return await tx.chartOfAccounts.findFirst({
      where: {
        isActive: true,
        accountType: { in: ['Revenue', 'Income'] },
        accountName: { contains: 'Gain' },
      },
    });
  }

  private static async findLossOnDisposalAccount(tx: any) {
    const tries = [
      { isActive: true, accountName: { contains: 'Loss on disposal' } },
      { isActive: true, accountName: { contains: 'Loss on Disposal' } },
      {
        isActive: true,
        AND: [
          { accountType: 'Expense' },
          { accountName: { contains: 'Disposal' } },
        ],
      },
    ];
    for (const where of tries) {
      const a = await tx.chartOfAccounts.findFirst({ where });
      if (a) return a;
    }
    return await tx.chartOfAccounts.findFirst({
      where: {
        isActive: true,
        accountType: 'Expense',
        accountName: { contains: 'Loss' },
      },
    });
  }

  /**
   * Create asset disposal journal entry within a transaction
   * Dr proceeds (cash/bank), Dr accumulated depreciation, Dr loss / Cr gain, Cr asset cost.
   */
  private static async createAssetDisposalJournalEntryInTransaction(
    tx: any,
    asset: Asset,
    disposalRecord: any,
    createdById: string,
    options: {
      currencyId?: string;
      paymentBankId?: string;
      proceedsChartOfAccountId?: string;
    } = {}
  ): Promise<void> {
    try {
      const totalDepreciation = await tx.depreciationRecord.aggregate({
        where: { assetId: asset.id, isPosted: true },
        _sum: { depreciationAmount: true },
      });

      const accumulatedDepreciation = Number(totalDepreciation._sum.depreciationAmount || 0);
      const assetCost = Number(asset.cost);
      const disposalValue = Number(disposalRecord.disposalValue);
      const bookValue = assetCost - accumulatedDepreciation;
      const gainLoss = disposalValue - bookValue;

      const expectedDebits =
        disposalValue + accumulatedDepreciation + (gainLoss < 0 ? Math.abs(gainLoss) : 0);
      const expectedCredits = assetCost + (gainLoss > 0 ? gainLoss : 0);

      if (Math.abs(expectedDebits - expectedCredits) > 0.01) {
        throw new Error(
          `Asset disposal entry would be unbalanced! ` +
            `Debits: ${expectedDebits.toFixed(2)}, Credits: ${expectedCredits.toFixed(2)}. ` +
            `Asset Cost: ${assetCost}, Accum Depr: ${accumulatedDepreciation}, ` +
            `Disposal Value: ${disposalValue}, Gain/Loss: ${gainLoss.toFixed(2)}`
        );
      }

      let resolvedCurrencyId = options.currencyId || asset.recordedCurrencyId;
      if (!resolvedCurrencyId && options.paymentBankId) {
        const b = await tx.bank.findUnique({
          where: { id: options.paymentBankId },
          select: { currencyId: true },
        });
        if (b) resolvedCurrencyId = b.currencyId;
      }
      if (!resolvedCurrencyId) {
        const zig = await tx.currency.findFirst({
          where: { isActive: true, code: { in: ['ZWG', 'ZWL', 'ZIG'] } },
          orderBy: { code: 'asc' },
        });
        resolvedCurrencyId = zig?.id;
      }
      if (!resolvedCurrencyId) {
        const usd = await tx.currency.findFirst({ where: { code: 'USD', isActive: true } });
        resolvedCurrencyId = usd?.id;
      }
      if (!resolvedCurrencyId) {
        const any = await tx.currency.findFirst({
          where: { isActive: true },
          orderBy: { isDefault: 'desc' },
        });
        resolvedCurrencyId = any?.id;
      }
      if (!resolvedCurrencyId) {
        throw new Error('No currency for disposal journal; pass currencyId or paymentBankId.');
      }

      let proceedsGlId: string | null = null;
      if (options.proceedsChartOfAccountId) {
        const acct = await tx.chartOfAccounts.findFirst({
          where: { id: options.proceedsChartOfAccountId, isActive: true },
        });
        if (!acct) throw new Error('proceedsChartOfAccountId not found or inactive');
        proceedsGlId = acct.id;
      } else if (options.paymentBankId) {
        const bank = await tx.bank.findUnique({
          where: { id: options.paymentBankId },
          include: { glAccount: true, currency: true },
        });
        if (!bank?.glAccount) {
          throw new Error('paymentBankId: bank not found or has no GL account');
        }
        if (bank.currencyId !== resolvedCurrencyId) {
          const jCur = await tx.currency.findUnique({
            where: { id: resolvedCurrencyId },
            select: { code: true },
          });
          throw new Error(
            `Bank currency (${bank.currency?.code ?? '?'}) does not match disposal currency (${jCur?.code ?? resolvedCurrencyId}).`
          );
        }
        proceedsGlId = bank.glAccount.id;
      } else {
        const cashOrBank = await tx.chartOfAccounts.findFirst({
          where: {
            isActive: true,
            OR: [
              { accountName: { contains: 'Cash' } },
              { accountName: { contains: 'Bank' } },
              { accountNo: { startsWith: '1000' } },
            ],
          },
        });
        if (!cashOrBank) {
          throw new Error(
            'Proceeds account not found. Pass paymentBankId or proceedsChartOfAccountId for cash/bank sales.'
          );
        }
        proceedsGlId = cashOrBank.id;
      }

      let gainLossAccount = null;
      if (Math.abs(gainLoss) > AssetService.DEPRECIATION_SALVAGE_EPSILON) {
        gainLossAccount =
          gainLoss > 0
            ? await AssetService.findGainOnDisposalAccount(tx)
            : await AssetService.findLossOnDisposalAccount(tx);

        if (!gainLossAccount) {
          const label = gainLoss > 0 ? 'Gain on disposal (Revenue)' : 'Loss on disposal (Expense)';
          throw new Error(
            `${label} GL account not found. Add an account such as "Gain on disposal" or "Loss on disposal".`
          );
        }
      }

      const totalDrSide =
        (disposalValue > AssetService.DEPRECIATION_SALVAGE_EPSILON ? disposalValue : 0) +
        (accumulatedDepreciation > 0.01 ? accumulatedDepreciation : 0) +
        (gainLoss < -AssetService.DEPRECIATION_SALVAGE_EPSILON ? Math.abs(gainLoss) : 0);

      const journalEntry = await assignNextAuditIdAndCreateJournal(tx, {
        transactionDate: disposalRecord.disposalDate,
        referenceNumber: `DISPOSAL-${asset.assetCode}`,
        description: `Asset disposal: ${asset.assetName}`,
        totalAmount: new Decimal(totalDrSide),
        currencyId: resolvedCurrencyId,
        status: 'POSTED',
        createdById,
      });

      if (disposalValue > AssetService.DEPRECIATION_SALVAGE_EPSILON) {
        await tx.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: proceedsGlId,
            debitAmount: new Decimal(disposalValue),
            creditAmount: new Decimal(0),
            description: `Proceeds from disposal: ${asset.assetName}`,
            vatAmount: new Decimal(0),
          },
        });
      }

      if (accumulatedDepreciation > 0.01) {
        await tx.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: asset.accumulatedDepreciationAccountId,
            debitAmount: new Decimal(accumulatedDepreciation),
            creditAmount: new Decimal(0),
            description: `Clear accumulated depreciation: ${asset.assetName}`,
            vatAmount: new Decimal(0),
          },
        });
      }

      if (gainLossAccount && Math.abs(gainLoss) > AssetService.DEPRECIATION_SALVAGE_EPSILON) {
        await tx.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: gainLossAccount.id,
            debitAmount: gainLoss < 0 ? new Decimal(Math.abs(gainLoss)) : new Decimal(0),
            creditAmount: gainLoss > 0 ? new Decimal(gainLoss) : new Decimal(0),
            description: `${gainLoss > 0 ? 'Gain' : 'Loss'} on disposal: ${asset.assetName}`,
            vatAmount: new Decimal(0),
          },
        });
      }

      await tx.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: asset.assetAccountId,
          debitAmount: new Decimal(0),
          creditAmount: new Decimal(assetCost),
          description: `Remove asset: ${asset.assetName}`,
          vatAmount: new Decimal(0),
        },
      });

      const lines = await tx.journalEntryLine.findMany({
        where: { journalEntryId: journalEntry.id },
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
        where: { isActive: true, status: 'IN_USE' },
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
          const period = `${year}-12`;

          const existingPeriod = await prisma.depreciationRecord.findUnique({
            where: {
              assetId_period: { assetId: asset.id, period },
            },
          });
          if (existingPeriod) {
            continue;
          }

          const lastDepreciation = await prisma.depreciationRecord.findFirst({
            where: { assetId: asset.id },
            orderBy: { period: 'desc' },
          });
          const currentAccumulatedDepreciation = lastDepreciation
            ? Number(lastDepreciation.accumulatedDepreciation)
            : 0;

          const rawAnnual = this.calculateAnnualDepreciation(asset);
          const annualDepreciation = this.capDepreciationBySalvage(asset, rawAnnual);

          if (annualDepreciation <= 0) {
            continue;
          }

          const newAccumulatedDepreciation = currentAccumulatedDepreciation + annualDepreciation;
          const bookStart = Number(asset.currentBookValue);
          const newBookValue = bookStart - annualDepreciation;

          const depreciationRecord = await prisma.depreciationRecord.create({
            data: {
              assetId: asset.id,
              period,
              depreciationAmount: new Decimal(annualDepreciation),
              accumulatedDepreciation: new Decimal(newAccumulatedDepreciation),
              bookValue: new Decimal(newBookValue),
              isPosted: false,
              createdById,
            },
          });

          await prisma.asset.update({
            where: { id: asset.id },
            data: {
              currentBookValue: new Decimal(newBookValue),
            },
          });

          await this.postDepreciation(depreciationRecord.id, createdById);

          depreciationRecords.push({
            assetId: asset.id,
            assetName: asset.assetName,
            depreciationAmount: annualDepreciation,
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
