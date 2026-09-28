// @ts-nocheck
import { PrismaClient, InventoryItem, StockMovement, SalesInvoiceItem } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../utils/database';
import { createJournalEntryWithAuditSequence } from './AuditTrailSequenceService';
import { JournalEntryService } from './JournalEntryService';
import AuditService from './AuditService';
import {
  NegativeStockConfirmationRequiredError,
  StockShortageDetail,
} from '../errors/InventoryErrors';

export interface CreateInventoryItemParams {
  itemName: string;
  skuNumber: string;
  description?: string;
  costOfPurchase: number;
  quantityOnHand: number;
  reorderLevel?: number;
  unitOfMeasure?: string;
  vendorId?: string; // Link to vendor (supplier)
  inventoryAssetAccountId?: string; // Optional - will auto-select "Inventory" account if not provided
  /** Where an opening quantity came from (opening balances, a payable): required when quantityOnHand > 0. */
  openingContraAccountId?: string;
  createdById: string;
}

export interface StockMovementParams {
  itemId: string;
  movementType: 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER';
  quantity: number;
  unitCost: number;
  reference?: string;
  description?: string;
  createdById: string;
  /** When policy allows negative stock, must be true to record an OUT that drives on-hand below zero. */
  acknowledgeNegativeStock?: boolean;
  /** The other side of the movement's journal (see InventoryLedgerService). */
  contraAccountId?: string | null;
  /** The caller posts its own journal (a sales invoice's cost of sales). */
  skipJournal?: boolean;
}

export interface InventoryValuationParams {
  method: 'FIFO' | 'LIFO' | 'AVERAGE';
  asOfDate?: Date;
}

export interface InventoryItemWithRelations extends InventoryItem {
  supplier?: {
    id: string;
    name: string;
  };
  inventoryAssetAccount: {
    id: string;
    accountNo: string;
    accountName: string;
  };
  stockMovements: StockMovement[];
}

export class InventoryService {
  /**
   * Singleton perpetual-inventory policy (row id `default`).
   */
  static async getInventorySettings(): Promise<{
    id: string;
    allowNegativeStock: boolean;
    updatedAt: Date;
  }> {
    let row = await prisma.inventorySettings.findUnique({ where: { id: 'default' } });
    if (!row) {
      row = await prisma.inventorySettings.create({
        data: { id: 'default', allowNegativeStock: false },
      });
    }
    return row;
  }

  static async updateInventorySettings(params: {
    allowNegativeStock: boolean;
  }): Promise<{ id: string; allowNegativeStock: boolean; updatedAt: Date }> {
    return prisma.inventorySettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', allowNegativeStock: params.allowNegativeStock },
      update: { allowNegativeStock: params.allowNegativeStock },
    });
  }

  /**
   * Aggregate requested quantities per inventory line (sales invoice / preview).
   */
  private static aggregateDemandByItemId(
    lines: Array<{ itemId: string; quantity: number }>
  ): Map<string, number> {
    const m = new Map<string, number>();
    for (const line of lines) {
      const q = Number(line.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        throw new Error(`Invalid quantity for item ${line.itemId}`);
      }
      m.set(line.itemId, (m.get(line.itemId) || 0) + q);
    }
    return m;
  }

  /**
   * Compute lines that would sell more than current on-hand (perpetual).
   */
  static async computeStockShortagesForDemand(
    lines: Array<{ itemId: string; quantity: number }>
  ): Promise<StockShortageDetail[]> {
    const demand = this.aggregateDemandByItemId(lines);
    const shortages: StockShortageDetail[] = [];
    for (const [itemId, totalRequested] of demand) {
      const inv = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
      if (!inv) {
        throw new Error(`Inventory item ${itemId} not found`);
      }
      const onHand = Number(inv.quantityOnHand);
      if (totalRequested > onHand) {
        const shortfall = totalRequested - onHand;
        shortages.push({
          itemId: inv.id,
          itemName: inv.itemName,
          skuNumber: inv.skuNumber,
          quantityOnHand: onHand,
          quantityRequested: totalRequested,
          shortfall,
          projectedQuantityAfterSale: onHand - totalRequested,
        });
      }
    }
    return shortages;
  }

  /**
   * Create a new inventory item
   */
  static async createInventoryItem(params: CreateInventoryItemParams): Promise<InventoryItemWithRelations> {
    try {
      const {
        itemName,
        skuNumber,
        description,
        costOfPurchase,
        quantityOnHand,
        reorderLevel = 0,
        unitOfMeasure = 'pieces',
        vendorId,
        inventoryAssetAccountId,
        createdById
      } = params;

      // Auto-select Inventory account if not provided
      let finalInventoryAccountId = inventoryAssetAccountId;
      
      console.log('📦 Creating inventory item...');
      console.log('   Received inventoryAssetAccountId:', inventoryAssetAccountId);
      console.log('   Type:', typeof inventoryAssetAccountId);
      
      // Treat empty string as not provided
      if (!finalInventoryAccountId || (typeof finalInventoryAccountId === 'string' && finalInventoryAccountId.trim() === '')) {
        finalInventoryAccountId = null;
      }
      
      if (!finalInventoryAccountId) {
        // Find the Inventory account (Current Asset account for inventory)
        const inventoryAccount = await prisma.chartOfAccounts.findFirst({
          where: {
            OR: [
              { accountName: { contains: 'Inventory' } },
              { accountName: { contains: 'Stock' } },
              { accountName: { contains: 'inventory' } },
              { accountName: { contains: 'stock' } }
            ],
            accountType: 'Current Asset',
            isActive: true
          },
          orderBy: { accountNo: 'asc' } // Get the first inventory account
        });

        if (!inventoryAccount) {
          throw new Error('No Inventory account found. Please create an Inventory account in Chart of Accounts first.');
        }

        finalInventoryAccountId = inventoryAccount.id;
        console.log(`✓ Auto-selected Inventory account: ${inventoryAccount.accountNo} ${inventoryAccount.accountName}`);
      } else {
        // Validate that the provided inventory asset account exists
        const assetAccount = await prisma.chartOfAccounts.findUnique({
          where: { id: finalInventoryAccountId }
        });

        if (!assetAccount) {
          throw new Error(`Inventory asset account not found for ID: ${finalInventoryAccountId}. Please provide a valid inventoryAssetAccountId or omit it to auto-select.`);
        }
        console.log(`✓ Using provided Inventory account: ${assetAccount.accountNo} ${assetAccount.accountName}`);
      }

      if (quantityOnHand > 0 && !params.openingContraAccountId) {
        throw Object.assign(new Error('An opening quantity needs the account it came from (opening balances or a payable).'), { statusCode: 400 });
      }

      // Check if SKU already exists
      const existingItem = await prisma.inventoryItem.findUnique({
        where: { skuNumber }
      });

      if (existingItem) {
        throw new Error(`Inventory item with SKU '${skuNumber}' already exists. SKU numbers must be unique.`);
      }

      // Create the inventory item
      const inventoryItem = await prisma.inventoryItem.create({
        data: {
          itemName,
          skuNumber,
          description,
          costOfPurchase: new Decimal(costOfPurchase),
          // the opening quantity is received below: setting it here as well counted it twice
          quantityOnHand: new Decimal(0),
          reorderLevel: new Decimal(reorderLevel),
          unitOfMeasure,
          supplierId: vendorId, // Map vendorId to supplierId for database
          inventoryAssetAccountId: finalInventoryAccountId,
        },
        include: {
          supplier: {
            select: {
              id: true,
              name: true
            }
          },
          inventoryAssetAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          },
          stockMovements: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      // If initial quantity > 0, create initial stock movement
      if (quantityOnHand > 0) {
        await this.recordStockMovement({
          itemId: inventoryItem.id,
          movementType: 'IN',
          quantity: quantityOnHand,
          unitCost: costOfPurchase,
          reference: 'INITIAL_STOCK',
          description: 'Opening stock',
          createdById,
          contraAccountId: params.openingContraAccountId,
        });
        Object.assign(inventoryItem, await prisma.inventoryItem.findUnique({ where: { id: inventoryItem.id }, select: { quantityOnHand: true, costOfPurchase: true } }));
      }

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: 'CREATE',
        entityType: 'InventoryItem',
        entityId: inventoryItem.id,
        newValues: inventoryItem,
      });

      return inventoryItem;
    } catch (error) {
      console.error('Error creating inventory item:', error);
      throw error;
    }
  }

  /**
   * Record stock movement and update quantity
   */
  static async recordStockMovement(params: StockMovementParams): Promise<StockMovement> {
    // quantity, moving average cost and the ledger move together (InventoryLedgerService)
    if (params.movementType === 'TRANSFER') {
      throw Object.assign(new Error('Transfers between locations are not kept: stock has one location.'), { statusCode: 400 });
    }
    const { InventoryLedgerService } = await import('./InventoryLedgerService');
    const r = await InventoryLedgerService.moveStock({
      itemId: params.itemId,
      movementType: params.movementType,
      quantity: params.quantity,
      unitCost: params.unitCost,
      contraAccountId: params.contraAccountId,
      reference: params.reference,
      description: params.description,
      createdById: params.createdById,
      acknowledgeNegativeStock: params.acknowledgeNegativeStock,
      skipJournal: params.skipJournal,
    });
    return Object.assign(r.movement, { journalReference: r.journal ? r.journal.referenceNumber : null, onHandAfter: r.onHand, averageCostAfter: r.averageCost });
  }

  /**
   * Process sales invoice with inventory items (perpetual inventory).
   * When total demand exceeds on-hand: blocked if allowNegativeStock is false; otherwise 409-style
   * {@link NegativeStockConfirmationRequiredError} until client sends acknowledgeNegativeStock: true.
   */
  static async processSalesInvoice(
    invoiceId: string,
    items: Array<{
      itemId: string;
      quantity: number;
      unitPrice: number;
    }>,
    createdById: string,
    options?: { acknowledgeNegativeStock?: boolean }
  ): Promise<{ negativeStockApplied: boolean; shortages: StockShortageDetail[] }> {
    try {
      const settings = await this.getInventorySettings();
      const shortages = await this.computeStockShortagesForDemand(items);

      if (shortages.length > 0) {
        if (!settings.allowNegativeStock) {
          const detail = shortages
            .map(
              (s) =>
                `${s.itemName} (SKU ${s.skuNumber}): on hand ${s.quantityOnHand}, requested ${s.quantityRequested}, shortfall ${s.shortfall}`
            )
            .join('; ');
          throw new Error(`Insufficient stock for perpetual inventory. ${detail}`);
        }
        if (!options?.acknowledgeNegativeStock) {
          throw new NegativeStockConfirmationRequiredError(shortages);
        }
      }

      const negativeStockApplied = shortages.length > 0 && settings.allowNegativeStock;

      for (const item of items) {
        const inventoryItem = await prisma.inventoryItem.findUnique({
          where: { id: item.itemId },
        });

        if (!inventoryItem) {
          throw new Error(`Inventory item ${item.itemId} not found`);
        }

        const salesInvoiceItem = await prisma.salesInvoiceItem.create({
          data: {
            invoiceId,
            itemId: item.itemId,
            quantity: new Decimal(item.quantity),
            unitPrice: new Decimal(item.unitPrice),
            totalPrice: new Decimal(item.quantity * item.unitPrice),
            unitCost: inventoryItem.costOfPurchase,
            totalCost: new Decimal(item.quantity * Number(inventoryItem.costOfPurchase)),
          },
        });

        await this.recordStockMovement({
          itemId: item.itemId,
          movementType: 'OUT',
          quantity: item.quantity,
          unitCost: Number(inventoryItem.costOfPurchase),
          reference: invoiceId,
          description: `Sales invoice ${invoiceId}`,
          createdById,
          acknowledgeNegativeStock: negativeStockApplied,
          skipJournal: true,
        });

        await this.createCOGSJournalEntry(salesInvoiceItem, createdById);
      }

      return {
        negativeStockApplied,
        shortages: negativeStockApplied ? shortages : [],
      };
    } catch (error) {
      console.error('Error processing sales invoice:', error);
      throw error;
    }
  }

  /**
   * Create COGS journal entry
   */
  private static async createCOGSJournalEntry(salesInvoiceItem: SalesInvoiceItem, createdById: string): Promise<void> {
    try {
      // Get COGS account
      const cogsAccount = await prisma.chartOfAccounts.findFirst({
        where: {
          OR: [{ accountName: { contains: 'Cost of Sales' } }, { accountName: { contains: 'Cost of Goods Sold' } }],
          accountType: 'Expense',
          isActive: true
        },
        orderBy: { accountNo: 'asc' }
      });

      if (!cogsAccount) {
        throw new Error('Cost of Goods Sold account not found');
      }

      // Get inventory asset account
      const inventoryItem = await prisma.inventoryItem.findUnique({
        where: { id: salesInvoiceItem.itemId },
        include: { inventoryAssetAccount: true }
      });

      if (!inventoryItem) {
        throw new Error('Inventory item not found');
      }

      if (!(Number(salesInvoiceItem.totalCost) > 0)) return;
      // the base currency and the tenant's day (it named a currency "default" that does not exist)
      const { InventoryLedgerService } = await import('./InventoryLedgerService');
      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate: await InventoryLedgerService.tenantToday(),
        referenceNumber: `COGS-${salesInvoiceItem.id}`,
        description: `COGS for ${inventoryItem.itemName}`,
        totalAmount: salesInvoiceItem.totalCost,
        currencyId: await InventoryLedgerService.baseCurrencyId(),
        status: 'POSTED',
        createdById,
      });

      // Create journal entry lines
      // Dr Cost of Goods Sold
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: cogsAccount.id,
          debitAmount: salesInvoiceItem.totalCost,
          creditAmount: new Decimal(0),
          description: `COGS: ${inventoryItem.itemName}`,
          vatAmount: new Decimal(0)
        }
      });

      // Cr Inventory Asset
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: inventoryItem.inventoryAssetAccountId,
          debitAmount: new Decimal(0),
          creditAmount: salesInvoiceItem.totalCost,
          description: `Inventory reduction: ${inventoryItem.itemName}`,
          vatAmount: new Decimal(0)
        }
      });
    } catch (error) {
      console.error('Error creating COGS journal entry:', error);
      throw error;
    }
  }

  /**
   * Get inventory valuation
   */
  static async getInventoryValuation(params: InventoryValuationParams): Promise<{
    totalValue: number;
    itemCount: number;
    valuation: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      unitCost: number;
      totalValue: number;
    }>;
  }> {
    try {
      const { method = 'AVERAGE', asOfDate = new Date() } = params;

      const items = await prisma.inventoryItem.findMany({
        where: {
          isActive: true,
          quantityOnHand: { gt: 0 }
        },
        include: {
          stockMovements: {
            where: {
              createdAt: { lte: asOfDate }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      let totalValue = 0;
      const valuation = [];

      for (const item of items) {
        let unitCost = Number(item.costOfPurchase);
        
        if (method === 'AVERAGE' && item.stockMovements.length > 0) {
          // Calculate average cost
          const totalCost = item.stockMovements.reduce((sum, movement) => {
            return sum + Number(movement.totalCost);
          }, 0);
          const totalQuantity = item.stockMovements.reduce((sum, movement) => {
            return sum + Number(movement.quantity);
          }, 0);
          unitCost = totalQuantity > 0 ? totalCost / totalQuantity : Number(item.costOfPurchase);
        }

        const itemValue = Number(item.quantityOnHand) * unitCost;
        totalValue += itemValue;

        valuation.push({
          itemId: item.id,
          itemName: item.itemName,
          quantity: Number(item.quantityOnHand),
          unitCost,
          totalValue: itemValue
        });
      }

      return {
        totalValue,
        itemCount: items.length,
        valuation
      };
    } catch (error) {
      console.error('Error getting inventory valuation:', error);
      throw error;
    }
  }

  /**
   * Get items below reorder level
   */
  static async getReorderLevelAlerts(): Promise<Array<{
    itemId: string;
    itemName: string;
    currentQuantity: number;
    reorderLevel: number;
    supplierName?: string;
  }>> {
    try {
      const items = await prisma.inventoryItem.findMany({
        where: {
          isActive: true,
          quantityOnHand: { lte: prisma.inventoryItem.fields.reorderLevel }
        },
        include: {
          supplier: {
            select: {
              name: true
            }
          }
        }
      });

      return items.map(item => ({
        itemId: item.id,
        itemName: item.itemName,
        currentQuantity: Number(item.quantityOnHand),
        reorderLevel: Number(item.reorderLevel),
        supplierName: item.supplier?.name
      }));
    } catch (error) {
      console.error('Error getting reorder level alerts:', error);
      throw error;
    }
  }

  /**
   * Get inventory items with filtering
   */
  static async getInventoryItems(filters: {
    search?: string;
    supplierId?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    items: InventoryItemWithRelations[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const {
        search,
        supplierId,
        isActive = true,
        page = 1,
        limit = 10
      } = filters;

      const where: any = {};

      if (search) {
        where.OR = [
          { itemName: { contains: search } },
          { skuNumber: { contains: search } },
          { description: { contains: search } }
        ];
      }

      if (supplierId) {
        where.supplierId = supplierId;
      }

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const [items, total] = await Promise.all([
        prisma.inventoryItem.findMany({
          where,
          include: {
            supplier: {
              select: {
                id: true,
                name: true
              }
            },
            inventoryAssetAccount: {
              select: {
                id: true,
                accountNo: true,
                accountName: true
              }
            },
            stockMovements: {
              orderBy: { createdAt: 'desc' },
              take: 5
            }
          },
          orderBy: { itemName: 'asc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.inventoryItem.count({ where })
      ]);

      return {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error getting inventory items:', error);
      throw error;
    }
  }

  /**
   * Update inventory item
   */
  static async updateInventoryItem(
    itemId: string,
    updates: Partial<CreateInventoryItemParams>,
    updatedById: string
  ): Promise<InventoryItemWithRelations> {
    try {
      const item = await prisma.inventoryItem.findUnique({
        where: { id: itemId }
      });

      if (!item) {
        throw new Error('Inventory item not found');
      }
      const moved = await prisma.stockMovement.count({ where: { itemId } });
      if (moved > 0 && updates.costOfPurchase != null && Number(updates.costOfPurchase) !== Number(item.costOfPurchase)) {
        throw Object.assign(new Error('The cost follows the stock received (weighted average); it is not changed by hand.'), { statusCode: 409 });
      }
      if (moved > 0 && updates.inventoryAssetAccountId && updates.inventoryAssetAccountId !== item.inventoryAssetAccountId) {
        throw Object.assign(new Error('Stock has moved through this item, so its inventory account stays.'), { statusCode: 409 });
      }
      if (updates.isActive === false && Number(item.quantityOnHand) !== 0) {
        throw Object.assign(new Error('Switch an item off only when none is on hand.'), { statusCode: 409 });
      }
      const updatedItem = await prisma.inventoryItem.update({
        where: { id: itemId },
        data: {
          ...(updates.itemName && { itemName: updates.itemName }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.costOfPurchase && { costOfPurchase: new Decimal(updates.costOfPurchase) }),
          ...(updates.reorderLevel !== undefined && { reorderLevel: new Decimal(updates.reorderLevel) }),
          ...(updates.unitOfMeasure && { unitOfMeasure: updates.unitOfMeasure }),
          ...(updates.supplierId !== undefined && { supplierId: updates.supplierId }),
          ...(updates.inventoryAssetAccountId && { inventoryAssetAccountId: updates.inventoryAssetAccountId }),
          ...(updates.isActive !== undefined && { isActive: updates.isActive })
        },
        include: {
          supplier: {
            select: {
              id: true,
              name: true
            }
          },
          inventoryAssetAccount: {
            select: {
              id: true,
              accountNo: true,
              accountName: true
            }
          },
          stockMovements: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      // Audit log
      await AuditService.log({
        userId: updatedById,
        action: 'UPDATE',
        entityType: 'InventoryItem',
        entityId: itemId,
        oldValues: item,
        newValues: updatedItem,
      });

      return updatedItem;
    } catch (error) {
      console.error('Error updating inventory item:', error);
      throw error;
    }
  }

  /**
   * Delete inventory item (soft delete)
   */
  static async deleteInventoryItem(itemId: string, deletedById: string): Promise<void> {
    try {
      const item = await prisma.inventoryItem.findUnique({
        where: { id: itemId }
      });

      if (!item) {
        throw new Error('Inventory item not found');
      }

      // Check if item has stock
      if (Number(item.quantityOnHand) !== 0) {
        throw Object.assign(new Error('Cannot delete an item with stock on hand (or below zero)'), { statusCode: 409 });
      }

      await prisma.inventoryItem.update({
        where: { id: itemId },
        data: { isActive: false }
      });

      // Audit log
      await AuditService.log({
        userId: deletedById,
        action: 'DELETE',
        entityType: 'InventoryItem',
        entityId: itemId,
        oldValues: item,
      });
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      throw error;
    }
  }

  /**
   * Update stock quantity (simplified method)
   */
  static async updateStockQuantity(itemId: string, quantity: number, movementType: 'IN' | 'OUT', createdById: string, contraAccountId?: string, unitCost?: number): Promise<void> {
    try {
      await this.recordStockMovement({
        itemId,
        movementType,
        quantity,
        unitCost: unitCost ?? 0,
        reference: 'MANUAL_ADJUSTMENT',
        description: `Manual stock ${movementType.toLowerCase()} adjustment`,
        createdById,
        contraAccountId,
      });
    } catch (error) {
      console.error('Error updating stock quantity:', error);
      throw error;
    }
  }

  /**
   * Calculate COGS for specific item and quantity
   */
  static async calculateCOGS(itemId: string, quantity: number, method: 'FIFO' | 'LIFO' | 'AVERAGE'): Promise<number> {
    try {
      const item = await prisma.inventoryItem.findUnique({
        where: { id: itemId }
      });

      if (!item) {
        throw new Error('Inventory item not found');
      }

      // For now, use average cost method
      // In a full implementation, you would implement FIFO/LIFO logic
      const averageCost = Number(item.costOfPurchase);
      return averageCost * quantity;
    } catch (error) {
      console.error('Error calculating COGS:', error);
      throw error;
    }
  }

  /**
   * Check reorder levels (alias for getReorderLevelAlerts)
   */
  static async checkReorderLevels(): Promise<Array<{
    itemId: string;
    itemName: string;
    currentQuantity: number;
    reorderLevel: number;
    supplierName?: string;
  }>> {
    try {
      return await this.getReorderLevelAlerts();
    } catch (error) {
      console.error('Error checking reorder levels:', error);
      throw error;
    }
  }

  /**
   * Get inventory value (alias for getInventoryValuation)
   */
  static async getInventoryValue(method: 'FIFO' | 'LIFO' | 'AVERAGE'): Promise<{
    totalValue: number;
    itemCount: number;
    valuation: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      unitCost: number;
      totalValue: number;
    }>;
  }> {
    try {
      return await this.getInventoryValuation({ method });
    } catch (error) {
      console.error('Error getting inventory value:', error);
      throw error;
    }
  }

  /**
   * Create inventory adjustment
   */
  static async createInventoryAdjustment(
    itemId: string, 
    quantity: number, 
    reason: string,
    createdById: string,
    contraAccountId?: string
  ): Promise<StockMovement> {
    try {
      // the signed count difference: a shortfall reduces stock (it was always added before)
      return await this.recordStockMovement({
        itemId,
        movementType: 'ADJUSTMENT',
        quantity: Number(quantity),
        unitCost: 0,
        reference: `ADJUSTMENT-${Date.now()}`,
        description: `Inventory adjustment: ${reason}`,
        createdById,
        contraAccountId,
      });
    } catch (error) {
      console.error('Error creating inventory adjustment:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive inventory report
   */
  static async generateInventoryReport(): Promise<{
    totalItems: number;
    totalValue: number;
    lowStockItems: number;
    reorderItems: number;
    items: Array<{
      id: string;
      itemName: string;
      skuNumber: string;
      quantityOnHand: number;
      costOfPurchase: number;
      totalValue: number;
      reorderLevel: number;
      status: string;
    }>;
  }> {
    try {
      const items = await prisma.inventoryItem.findMany({
        where: { isActive: true },
        include: {
          supplier: {
            select: { name: true }
          }
        }
      });

      const totalValue = items.reduce((sum, item) => {
        return sum + (Number(item.quantityOnHand) * Number(item.costOfPurchase));
      }, 0);

      const lowStockItems = items.filter(item => 
        Number(item.quantityOnHand) <= Number(item.reorderLevel)
      ).length;

      const reorderItems = items.filter(item => 
        Number(item.quantityOnHand) <= Number(item.reorderLevel) * 1.5
      ).length;

      return {
        totalItems: items.length,
        totalValue,
        lowStockItems,
        reorderItems,
        items: items.map(item => ({
          id: item.id,
          itemName: item.itemName,
          skuNumber: item.skuNumber,
          quantityOnHand: Number(item.quantityOnHand),
          costOfPurchase: Number(item.costOfPurchase),
          totalValue: Number(item.quantityOnHand) * Number(item.costOfPurchase),
          reorderLevel: Number(item.reorderLevel),
          status: Number(item.quantityOnHand) <= Number(item.reorderLevel) ? 'LOW_STOCK' : 'OK'
        }))
      };
    } catch (error) {
      console.error('Error generating inventory report:', error);
      throw error;
    }
  }
}
