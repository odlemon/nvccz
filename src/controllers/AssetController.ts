// @ts-nocheck
import { Request, Response } from 'express';
import { AssetService } from '../services/AssetService';
import { PrismaClient } from '@prisma/client';

import { prisma } from '../utils/database';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export class AssetController {
  /**
   * Create a new asset
   */
  static async createAsset(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const {
        assetName,
        assetCode,
        description,
        purchaseDate,
        cost,
        usefulLifeYears,
        depreciationMethod,
        salvageValue,
        assetAccountId,
        accumulatedDepreciationAccountId,
        depreciationExpenseAccountId,
        location,
        serialNumber,
        warrantyExpiry
      } = req.body;

      // Validation
      if (!assetName || !assetCode || !cost || !usefulLifeYears || !depreciationMethod || !assetAccountId || !accumulatedDepreciationAccountId || !depreciationExpenseAccountId) {
        res.status(400).json({
          error: 'Missing required fields: assetName, assetCode, cost, usefulLifeYears, depreciationMethod, assetAccountId, accumulatedDepreciationAccountId, depreciationExpenseAccountId'
        });
        return;
      }

      if (!['STRAIGHT_LINE', 'DIMINISHING_BALANCE'].includes(depreciationMethod)) {
        res.status(400).json({
          error: 'Invalid depreciationMethod. Must be STRAIGHT_LINE or DIMINISHING_BALANCE'
        });
        return;
      }

      const asset = await AssetService.createAsset({
        assetName,
        assetCode,
        description,
        purchaseDate: new Date(purchaseDate),
        cost: parseFloat(cost),
        usefulLifeYears: parseInt(usefulLifeYears),
        depreciationMethod,
        salvageValue: parseFloat(salvageValue || 0),
        assetAccountId,
        accumulatedDepreciationAccountId,
        depreciationExpenseAccountId,
        location,
        serialNumber,
        warrantyExpiry: warrantyExpiry ? new Date(warrantyExpiry) : undefined,
        createdById: userId
      });

      res.status(201).json({
        success: true,
        message: 'Asset created successfully',
        data: asset
      });
    } catch (error: any) {
      console.error('Error creating asset:', error);
      res.status(500).json({
        error: 'Failed to create asset',
        details: error.message
      });
    }
  }

  /**
   * Get assets with filtering
   */
  static async getAssets(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        search,
        status,
        isActive,
        page = 1,
        limit = 10
      } = req.query;

      const result = await AssetService.getAssets({
        search: search as string,
        status: status as string,
        isActive: isActive ? isActive === 'true' : undefined,
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error: any) {
      console.error('Error getting assets:', error);
      res.status(500).json({
        error: 'Failed to get assets',
        details: error.message
      });
    }
  }

  /**
   * Get single asset
   */
  static async getAsset(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const asset = await prisma.asset.findUnique({
        where: { id },
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
            take: 24
          },
          disposalRecords: {
            orderBy: { disposalDate: 'desc' }
          }
        }
      });

      if (!asset) {
        res.status(404).json({
          error: 'Asset not found'
        });
        return;
      }

      res.json({
        success: true,
        data: asset
      });
    } catch (error: any) {
      console.error('Error getting asset:', error);
      res.status(500).json({
        error: 'Failed to get asset',
        details: error.message
      });
    }
  }

  /**
   * Update asset
   */
  static async updateAsset(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      const updates = req.body;

      const updatedAsset = await AssetService.updateAsset(id, updates, userId);

      res.json({
        success: true,
        message: 'Asset updated successfully',
        data: updatedAsset
      });
    } catch (error: any) {
      console.error('Error updating asset:', error);
      res.status(500).json({
        error: 'Failed to update asset',
        details: error.message
      });
    }
  }

  /**
   * Delete asset (soft delete)
   */
  static async deleteAsset(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;

      await AssetService.deleteAsset(id, userId);

      res.json({
        success: true,
        message: 'Asset deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting asset:', error);
      res.status(500).json({
        error: 'Failed to delete asset',
        details: error.message
      });
    }
  }

  /**
   * Calculate depreciation for an asset
   */
  static async calculateDepreciation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { assetId } = req.params;
      const { period } = req.body;

      if (!period) {
        res.status(400).json({
          error: 'Missing required field: period (YYYY-MM format)'
        });
        return;
      }

      const depreciationRecord = await AssetService.calculateDepreciation({
        assetId,
        period,
        createdById: userId
      });

      res.status(201).json({
        success: true,
        message: 'Depreciation calculated successfully',
        data: depreciationRecord
      });
    } catch (error: any) {
      console.error('Error calculating depreciation:', error);
      res.status(500).json({
        error: 'Failed to calculate depreciation',
        details: error.message
      });
    }
  }

  /**
   * Post depreciation journal entry
   */
  static async postDepreciation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { depreciationId } = req.params;

      await AssetService.postDepreciation(depreciationId, userId);

      res.json({
        success: true,
        message: 'Depreciation posted successfully'
      });
    } catch (error: any) {
      console.error('Error posting depreciation:', error);
      res.status(500).json({
        error: 'Failed to post depreciation',
        details: error.message
      });
    }
  }

  /**
   * Dispose of an asset
   */
  static async disposeAsset(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { assetId } = req.params;
      const {
        disposalDate,
        disposalValue,
        disposalMethod,
        description
      } = req.body;

      // Validation
      if (!disposalDate || !disposalValue || !disposalMethod) {
        res.status(400).json({
          error: 'Missing required fields: disposalDate, disposalValue, disposalMethod'
        });
        return;
      }

      if (!['SALE', 'SCRAP', 'DONATION', 'TRADE_IN'].includes(disposalMethod)) {
        res.status(400).json({
          error: 'Invalid disposalMethod. Must be SALE, SCRAP, DONATION, or TRADE_IN'
        });
        return;
      }

      await AssetService.disposeAsset({
        assetId,
        disposalDate: new Date(disposalDate),
        disposalValue: parseFloat(disposalValue),
        disposalMethod,
        description,
        createdById: userId
      });

      res.json({
        success: true,
        message: 'Asset disposed successfully'
      });
    } catch (error: any) {
      console.error('Error disposing asset:', error);
      res.status(500).json({
        error: 'Failed to dispose asset',
        details: error.message
      });
    }
  }

  /**
   * Get asset register
   */
  static async getAssetRegister(req: AuthRequest, res: Response): Promise<void> {
    try {
      const assetRegister = await AssetService.getAssetRegister();

      res.json({
        success: true,
        data: assetRegister
      });
    } catch (error: any) {
      console.error('Error getting asset register:', error);
      res.status(500).json({
        error: 'Failed to get asset register',
        details: error.message
      });
    }
  }

  /**
   * Get depreciation schedule for an asset
   */
  static async getDepreciationSchedule(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { assetId } = req.params;

      const depreciationSchedule = await AssetService.getDepreciationSchedule(assetId);

      res.json({
        success: true,
        data: depreciationSchedule
      });
    } catch (error: any) {
      console.error('Error getting depreciation schedule:', error);
      res.status(500).json({
        error: 'Failed to get depreciation schedule',
        details: error.message
      });
    }
  }

  /**
   * Get asset dashboard data
   */
  static async getAssetDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const [
        totalAssets,
        activeAssets,
        disposedAssets,
        totalCost,
        totalDepreciation,
        recentDepreciation
      ] = await Promise.all([
        prisma.asset.count(),
        prisma.asset.count({ where: { status: 'IN_USE', isActive: true } }),
        prisma.asset.count({ where: { status: 'DISPOSED' } }),
        prisma.asset.aggregate({
          where: { isActive: true },
          _sum: { cost: true }
        }),
        prisma.depreciationRecord.aggregate({
          where: { isPosted: true },
          _sum: { depreciationAmount: true }
        }),
        prisma.depreciationRecord.findMany({
          where: { isPosted: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            asset: {
              select: {
                assetName: true,
                assetCode: true
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
          totalAssets,
          activeAssets,
          disposedAssets,
          totalCost: Number(totalCost._sum.cost || 0),
          totalDepreciation: Number(totalDepreciation._sum.depreciationAmount || 0),
          recentDepreciation
        }
      });
    } catch (error: any) {
      console.error('Error getting asset dashboard:', error);
      res.status(500).json({
        error: 'Failed to get asset dashboard',
        details: error.message
      });
    }
  }

  /**
   * Post monthly depreciation for all assets
   */
  static async postMonthlyDepreciation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const result = await AssetService.postMonthlyDepreciation(userId);

      res.json({
        success: true,
        message: 'Monthly depreciation posted successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error posting monthly depreciation:', error);
      res.status(500).json({
        error: 'Failed to post monthly depreciation',
        details: error.message
      });
    }
  }

  /**
   * Post annual depreciation for all assets
   */
  static async postAnnualDepreciation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { year } = req.body;

      if (!year) {
        res.status(400).json({
          error: 'Missing required field: year'
        });
        return;
      }

      const result = await AssetService.postAnnualDepreciation(year, userId);

      res.json({
        success: true,
        message: 'Annual depreciation posted successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error posting annual depreciation:', error);
      res.status(500).json({
        error: 'Failed to post annual depreciation',
        details: error.message
      });
    }
  }

  /**
   * Revalue asset
   */
  static async revalueAsset(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { id } = req.params;
      const { newValue } = req.body;

      if (!newValue) {
        res.status(400).json({
          error: 'Missing required field: newValue'
        });
        return;
      }

      const updatedAsset = await AssetService.revalueAsset(id, newValue, userId);

      res.json({
        success: true,
        message: 'Asset revalued successfully',
        data: updatedAsset
      });
    } catch (error: any) {
      console.error('Error revaluing asset:', error);
      res.status(500).json({
        error: 'Failed to revalue asset',
        details: error.message
      });
    }
  }

  /**
   * Generate asset register
   */
  static async generateAssetRegister(req: AuthRequest, res: Response): Promise<void> {
    try {
      const register = await AssetService.generateAssetRegister();

      res.json({
        success: true,
        data: register
      });
    } catch (error: any) {
      console.error('Error generating asset register:', error);
      res.status(500).json({
        error: 'Failed to generate asset register',
        details: error.message
      });
    }
  }

  /**
   * Generate depreciation schedule
   */
  static async generateDepreciationSchedule(req: AuthRequest, res: Response): Promise<void> {
    try {
      const schedule = await AssetService.generateDepreciationSchedule();

      res.json({
        success: true,
        data: schedule
      });
    } catch (error: any) {
      console.error('Error generating depreciation schedule:', error);
      res.status(500).json({
        error: 'Failed to generate depreciation schedule',
        details: error.message
      });
    }
  }
}
