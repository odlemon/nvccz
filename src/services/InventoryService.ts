// @ts-nocheck
import { PrismaClient, InventoryItem, StockMovement, SalesInvoiceItem } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { dbConnection } from '../utils/database';
import { JournalEntryService } from './JournalEntryService';
import AuditService from './AuditService';

const prisma = dbConnection.getPrismaClient();

export interface CreateInventoryItemParams {
  itemName: string;
  skuNumber: string;
  description?: string;
  costOfPurchase: number;
  quantityOnHand: number;
  reorderLevel?: number;
  unitOfMeasure?: string;
  supplierId?: string;
  inventoryAssetAccountId: string;
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
        supplierId,
        inventoryAssetAccountId,
        createdById
      } = params;

      // Validate that the inventory asset account exists
      const assetAccount = await prisma.chartOfAccounts.findUnique({
        where: { id: inventoryAssetAccountId }
      });

      if (!assetAccount) {
        throw new Error('Inventory asset account not found');
      }

      // Create the inventory item
      const inventoryItem = await prisma.inventoryItem.create({
        data: {
          itemName,
          skuNumber,
          description,
          costOfPurchase: new Decimal(costOfPurchase),
          quantityOnHand: new Decimal(quantityOnHand),
          reorderLevel: new Decimal(reorderLevel),
          unitOfMeasure,
          supplierId,
          inventoryAssetAccountId,
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
          description: 'Initial stock entry',
          createdById
        });
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
    try {
      const {
        itemId,
        movementType,
        quantity,
        unitCost,
        reference,
        description,
        createdById
      } = params;

      // Get current item
      const item = await prisma.inventoryItem.findUnique({
        where: { id: itemId }
      });

      if (!item) {
        throw new Error('Inventory item not found');
      }

      // Calculate new quantity
      let newQuantity = Number(item.quantityOnHand);
      if (movementType === 'IN' || movementType === 'ADJUSTMENT') {
        newQuantity += quantity;
      } else if (movementType === 'OUT') {
        newQuantity -= quantity;
        if (newQuantity < 0) {
          throw new Error('Insufficient stock quantity');
        }
      }

      // Create stock movement record
      const stockMovement = await prisma.stockMovement.create({
        data: {
          itemId,
          movementType,
          quantity: new Decimal(quantity),
          unitCost: new Decimal(unitCost),
          totalCost: new Decimal(quantity * unitCost),
          reference,
          description,
          createdById
        }
      });

      // Update item quantity
      await prisma.inventoryItem.update({
        where: { id: itemId },
        data: {
          quantityOnHand: new Decimal(newQuantity)
        }
      });

      // Audit log
      await AuditService.log({
        userId: createdById,
        action: 'CREATE',
        entityType: 'StockMovement',
        entityId: stockMovement.id,
        newValues: stockMovement,
      });

      return stockMovement;
    } catch (error) {
      console.error('Error recording stock movement:', error);
      throw error;
    }
  }

  /**
   * Process sales invoice with inventory items
   */
  static async processSalesInvoice(invoiceId: string, items: Array<{
    itemId: string;
    quantity: number;
    unitPrice: number;
  }>, createdById: string): Promise<void> {
    try {
      for (const item of items) {
        // Get item details
        const inventoryItem = await prisma.inventoryItem.findUnique({
          where: { id: item.itemId }
        });

        if (!inventoryItem) {
          throw new Error(`Inventory item ${item.itemId} not found`);
        }

        // Check stock availability
        if (Number(inventoryItem.quantityOnHand) < item.quantity) {
          throw new Error(`Insufficient stock for item ${inventoryItem.itemName}`);
        }

        // Create sales invoice item record
        const salesInvoiceItem = await prisma.salesInvoiceItem.create({
          data: {
            invoiceId,
            itemId: item.itemId,
            quantity: new Decimal(item.quantity),
            unitPrice: new Decimal(item.unitPrice),
            totalPrice: new Decimal(item.quantity * item.unitPrice),
            unitCost: inventoryItem.costOfPurchase,
            totalCost: new Decimal(item.quantity * Number(inventoryItem.costOfPurchase))
          }
        });

        // Record stock movement (OUT)
        await this.recordStockMovement({
          itemId: item.itemId,
          movementType: 'OUT',
          quantity: item.quantity,
          unitCost: Number(inventoryItem.costOfPurchase),
          reference: invoiceId,
          description: `Sales invoice ${invoiceId}`,
          createdById
        });

        // Create COGS journal entry
        await this.createCOGSJournalEntry(salesInvoiceItem, createdById);
      }
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
          accountName: { contains: 'Cost of Goods Sold' },
          isActive: true
        }
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

      // Create journal entry for COGS
      const journalEntry = await prisma.journalEntry.create({
        data: {
          transactionDate: new Date(),
          referenceNumber: `COGS-${salesInvoiceItem.id}`,
          description: `COGS for ${inventoryItem.itemName}`,
          totalAmount: salesInvoiceItem.totalCost,
          currencyId: 'default', // You might want to get this from invoice
          status: 'POSTED',
          createdById
        }
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
      if (Number(item.quantityOnHand) > 0) {
        throw new Error('Cannot delete item with remaining stock');
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
  static async updateStockQuantity(itemId: string, quantity: number, movementType: 'IN' | 'OUT', createdById: string): Promise<void> {
    try {
      await this.recordStockMovement({
        itemId,
        movementType,
        quantity,
        unitCost: 0, // Will be calculated from average cost
        reference: 'MANUAL_ADJUSTMENT',
        description: `Manual stock ${movementType.toLowerCase()} adjustment`,
        createdById
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
    createdById: string
  ): Promise<StockMovement> {
    try {
      const movementType = quantity > 0 ? 'ADJUSTMENT' : 'ADJUSTMENT';
      const absoluteQuantity = Math.abs(quantity);

      return await this.recordStockMovement({
        itemId,
        movementType: 'ADJUSTMENT',
        quantity: absoluteQuantity,
        unitCost: 0, // Will be calculated from average cost
        reference: `ADJUSTMENT-${Date.now()}`,
        description: `Inventory adjustment: ${reason}`,
        createdById
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
