// @ts-nocheck
import { Request, Response } from 'express';
import { InventoryService } from '../services/InventoryService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export class InventoryController {
  /**
   * Create a new inventory item
   */
  static async createInventoryItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        itemName,
        skuNumber,
        description,
        costOfPurchase,
        quantityOnHand,
        reorderLevel,
        unitOfMeasure,
        supplierId,
        inventoryAssetAccountId
      } = req.body;

      // Validation
      if (!itemName || !skuNumber || !costOfPurchase || !inventoryAssetAccountId) {
        res.status(400).json({
          error: 'Missing required fields: itemName, skuNumber, costOfPurchase, inventoryAssetAccountId'
        });
        return;
      }

      const inventoryItem = await InventoryService.createInventoryItem({
        itemName,
        skuNumber,
        description,
        costOfPurchase: parseFloat(costOfPurchase),
        quantityOnHand: parseFloat(quantityOnHand || 0),
        reorderLevel: parseFloat(reorderLevel || 0),
        unitOfMeasure,
        supplierId,
        inventoryAssetAccountId,
        createdById: userId
      });

      res.status(201).json({
        success: true,
        message: 'Inventory item created successfully',
        data: inventoryItem
      });
    } catch (error: any) {
      console.error('Error creating inventory item:', error);
      res.status(500).json({
        error: 'Failed to create inventory item',
        details: error.message
      });
    }
  }

  /**
   * Get inventory items with filtering
   */
  static async getInventoryItems(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        search,
        supplierId,
        isActive,
        page = 1,
        limit = 10
      } = req.query;

      const result = await InventoryService.getInventoryItems({
        search: search as string,
        supplierId: supplierId as string,
        isActive: isActive ? isActive === 'true' : undefined,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting inventory items:', error);
      res.status(500).json({
        error: 'Failed to get inventory items',
        details: error.message
      });
    }
  }

  /**
   * Get single inventory item
   */
  static async getInventoryItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const item = await prisma.inventoryItem.findUnique({
        where: { id },
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
            take: 20
          }
        }
      });

      if (!item) {
        res.status(404).json({
          error: 'Inventory item not found'
        });
        return;
      }

      res.json({
        success: true,
        data: item
      });
    } catch (error: any) {
      console.error('Error getting inventory item:', error);
      res.status(500).json({
        error: 'Failed to get inventory item',
        details: error.message
      });
    }
  }

  /**
   * Update inventory item
   */
  static async updateInventoryItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      const updates = req.body;

      const updatedItem = await InventoryService.updateInventoryItem(id, updates, userId);

      res.json({
        success: true,
        message: 'Inventory item updated successfully',
        data: updatedItem
      });
    } catch (error: any) {
      console.error('Error updating inventory item:', error);
      res.status(500).json({
        error: 'Failed to update inventory item',
        details: error.message
      });
    }
  }

  /**
   * Delete inventory item (soft delete)
   */
  static async deleteInventoryItem(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;

      await InventoryService.deleteInventoryItem(id, userId);

      res.json({
        success: true,
        message: 'Inventory item deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting inventory item:', error);
      res.status(500).json({
        error: 'Failed to delete inventory item',
        details: error.message
      });
    }
  }

  /**
   * Record stock movement
   */
  static async recordStockMovement(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        itemId,
        movementType,
        quantity,
        unitCost,
        reference,
        description
      } = req.body;

      // Validation
      if (!itemId || !movementType || !quantity || !unitCost) {
        res.status(400).json({
          error: 'Missing required fields: itemId, movementType, quantity, unitCost'
        });
        return;
      }

      if (!['IN', 'OUT', 'ADJUSTMENT', 'TRANSFER'].includes(movementType)) {
        res.status(400).json({
          error: 'Invalid movementType. Must be IN, OUT, ADJUSTMENT, or TRANSFER'
        });
        return;
      }

      const stockMovement = await InventoryService.recordStockMovement({
        itemId,
        movementType,
        quantity: parseFloat(quantity),
        unitCost: parseFloat(unitCost),
        reference,
        description,
        createdById: userId
      });

      res.status(201).json({
        success: true,
        message: 'Stock movement recorded successfully',
        data: stockMovement
      });
    } catch (error: any) {
      console.error('Error recording stock movement:', error);
      res.status(500).json({
        error: 'Failed to record stock movement',
        details: error.message
      });
    }
  }

  /**
   * Get inventory valuation
   */
  static async getInventoryValuation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { method = 'AVERAGE', asOfDate } = req.query;

      const valuation = await InventoryService.getInventoryValuation({
        method: method as 'FIFO' | 'LIFO' | 'AVERAGE',
        asOfDate: asOfDate ? new Date(asOfDate as string) : undefined
      });

      res.json({
        success: true,
        data: valuation
      });
    } catch (error: any) {
      console.error('Error getting inventory valuation:', error);
      res.status(500).json({
        error: 'Failed to get inventory valuation',
        details: error.message
      });
    }
  }

  /**
   * Get reorder level alerts
   */
  static async getReorderLevelAlerts(req: AuthRequest, res: Response): Promise<void> {
    try {
      const alerts = await InventoryService.getReorderLevelAlerts();

      res.json({
        success: true,
        data: alerts
      });
    } catch (error: any) {
      console.error('Error getting reorder level alerts:', error);
      res.status(500).json({
        error: 'Failed to get reorder level alerts',
        details: error.message
      });
    }
  }

  /**
   * Process sales invoice with inventory items
   */
  static async processSalesInvoice(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { invoiceId, items } = req.body;

      // Validation
      if (!invoiceId || !items || !Array.isArray(items)) {
        res.status(400).json({
          error: 'Missing required fields: invoiceId, items (array)'
        });
        return;
      }

      // Validate each item
      for (const item of items) {
        if (!item.itemId || !item.quantity || !item.unitPrice) {
          res.status(400).json({
            error: 'Each item must have itemId, quantity, and unitPrice'
          });
          return;
        }
      }

      await InventoryService.processSalesInvoice(invoiceId, items, userId);

      res.json({
        success: true,
        message: 'Sales invoice processed successfully with inventory items'
      });
    } catch (error: any) {
      console.error('Error processing sales invoice:', error);
      res.status(500).json({
        error: 'Failed to process sales invoice',
        details: error.message
      });
    }
  }

  /**
   * Get stock movements for an item
   */
  static async getStockMovements(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { itemId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const [movements, total] = await Promise.all([
        prisma.stockMovement.findMany({
          where: { itemId },
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: (parseInt(page as string) - 1) * parseInt(limit as string),
          take: parseInt(limit as string)
        }),
        prisma.stockMovement.count({ where: { itemId } })
      ]);

      res.json({
        success: true,
        data: {
          movements,
          total,
          page: parseInt(page as string),
          totalPages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error: any) {
      console.error('Error getting stock movements:', error);
      res.status(500).json({
        error: 'Failed to get stock movements',
        details: error.message
      });
    }
  }

  /**
   * Get inventory dashboard data
   */
  static async getInventoryDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const [
        totalItems,
        activeItems,
        lowStockItems,
        totalValue,
        recentMovements
      ] = await Promise.all([
        prisma.inventoryItem.count(),
        prisma.inventoryItem.count({ where: { isActive: true } }),
        prisma.inventoryItem.count({
          where: {
            isActive: true,
            quantityOnHand: { lte: prisma.inventoryItem.fields.reorderLevel }
          }
        }),
        InventoryService.getInventoryValuation({ method: 'AVERAGE' }),
        prisma.stockMovement.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            item: {
              select: {
                itemName: true,
                skuNumber: true
              }
            },
            createdBy: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          totalItems,
          activeItems,
          lowStockItems,
          totalValue: totalValue.totalValue,
          recentMovements
        }
      });
    } catch (error: any) {
      console.error('Error getting inventory dashboard:', error);
      res.status(500).json({
        error: 'Failed to get inventory dashboard',
        details: error.message
      });
    }
  }

  /**
   * Update stock quantity
   */
  static async updateStockQuantity(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { itemId, quantity, movementType } = req.body;

      // Validation
      if (!itemId || !quantity || !movementType) {
        res.status(400).json({
          error: 'Missing required fields: itemId, quantity, movementType'
        });
        return;
      }

      if (!['IN', 'OUT'].includes(movementType)) {
        res.status(400).json({
          error: 'Invalid movementType. Must be IN or OUT'
        });
        return;
      }

      await InventoryService.updateStockQuantity(itemId, quantity, movementType, userId);

      res.json({
        success: true,
        message: 'Stock quantity updated successfully'
      });
    } catch (error: any) {
      console.error('Error updating stock quantity:', error);
      res.status(500).json({
        error: 'Failed to update stock quantity',
        details: error.message
      });
    }
  }

  /**
   * Calculate COGS
   */
  static async calculateCOGS(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { itemId, quantity, method } = req.body;

      // Validation
      if (!itemId || !quantity || !method) {
        res.status(400).json({
          error: 'Missing required fields: itemId, quantity, method'
        });
        return;
      }

      if (!['FIFO', 'LIFO', 'AVERAGE'].includes(method)) {
        res.status(400).json({
          error: 'Invalid method. Must be FIFO, LIFO, or AVERAGE'
        });
        return;
      }

      const cogs = await InventoryService.calculateCOGS(itemId, quantity, method);

      res.json({
        success: true,
        data: {
          itemId,
          quantity,
          method,
          cogs
        }
      });
    } catch (error: any) {
      console.error('Error calculating COGS:', error);
      res.status(500).json({
        error: 'Failed to calculate COGS',
        details: error.message
      });
    }
  }

  /**
   * Generate inventory report
   */
  static async generateInventoryReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const report = await InventoryService.generateInventoryReport();

      res.json({
        success: true,
        data: report
      });
    } catch (error: any) {
      console.error('Error generating inventory report:', error);
      res.status(500).json({
        error: 'Failed to generate inventory report',
        details: error.message
      });
    }
  }

  /**
   * Check reorder levels
   */
  static async checkReorderLevels(req: AuthRequest, res: Response): Promise<void> {
    try {
      const alerts = await InventoryService.checkReorderLevels();

      res.json({
        success: true,
        data: alerts
      });
    } catch (error: any) {
      console.error('Error checking reorder levels:', error);
      res.status(500).json({
        error: 'Failed to check reorder levels',
        details: error.message
      });
    }
  }

  /**
   * Get inventory value
   */
  static async getInventoryValue(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { method } = req.query;

      if (!method || !['FIFO', 'LIFO', 'AVERAGE'].includes(method as string)) {
        res.status(400).json({
          error: 'Missing or invalid method. Must be FIFO, LIFO, or AVERAGE'
        });
        return;
      }

      const valuation = await InventoryService.getInventoryValue(method as 'FIFO' | 'LIFO' | 'AVERAGE');

      res.json({
        success: true,
        data: valuation
      });
    } catch (error: any) {
      console.error('Error getting inventory value:', error);
      res.status(500).json({
        error: 'Failed to get inventory value',
        details: error.message
      });
    }
  }

  /**
   * Create inventory adjustment
   */
  static async createInventoryAdjustment(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { itemId, quantity, reason } = req.body;

      // Validation
      if (!itemId || !quantity || !reason) {
        res.status(400).json({
          error: 'Missing required fields: itemId, quantity, reason'
        });
        return;
      }

      const adjustment = await InventoryService.createInventoryAdjustment(
        itemId, 
        quantity, 
        reason, 
        userId
      );

      res.json({
        success: true,
        message: 'Inventory adjustment created successfully',
        data: adjustment
      });
    } catch (error: any) {
      console.error('Error creating inventory adjustment:', error);
      res.status(500).json({
        error: 'Failed to create inventory adjustment',
        details: error.message
      });
    }
  }
}
