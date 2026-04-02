// @ts-nocheck
import { Request, Response } from 'express';
import { AssetService } from '../services/AssetService';
import { Prisma } from '@prisma/client';

import { prisma } from '../utils/database';
import { parseDate } from '../utils/dateHelper';

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
        warrantyExpiry,
        invoiceId, // Optional: Link to creditor bill (procurement invoice)
        cashbookEntryId, // Optional: Link to cashbook payment
        currencyId,
        paymentBankId,
        creditChartOfAccountId,
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
        purchaseDate: parseDate(purchaseDate),
        cost: parseFloat(cost),
        usefulLifeYears: parseInt(usefulLifeYears),
        depreciationMethod,
        salvageValue: parseFloat(salvageValue || 0),
        assetAccountId,
        accumulatedDepreciationAccountId,
        depreciationExpenseAccountId,
        location,
        serialNumber,
        warrantyExpiry: warrantyExpiry ? parseDate(warrantyExpiry) : undefined,
        createdById: userId,
        invoiceId, // Optional: Link to creditor bill
        cashbookEntryId, // Optional: Link to cashbook payment
        currencyId,
        paymentBankId,
        creditChartOfAccountId,
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
   * Backfill monthly depreciation for one asset through a date (creates + posts each due period).
   */
  static async backfillDepreciation(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const assetId = req.params.assetId || req.params.id;
      const { startDate, endDate, autoPost } = req.body || {};

      if (!assetId) {
        res.status(400).json({ error: 'Asset id is required' });
        return;
      }
      if (!endDate) {
        res.status(400).json({ error: 'Missing required field: endDate (ISO date, e.g. 2026-03-31)' });
        return;
      }

      const result = await AssetService.backfillDepreciationToDate({
        assetId,
        fromDate: startDate ? parseDate(startDate) : undefined,
        throughDate: parseDate(endDate),
        createdById: userId,
        autoPost: autoPost !== false,
      });

      res.json({
        success: true,
        message: 'Depreciation backfill completed',
        data: result,
      });
    } catch (error: any) {
      console.error('Error backfilling depreciation:', error);
      res.status(500).json({
        error: 'Failed to backfill depreciation',
        details: error.message,
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

      const assetId = req.params.assetId || req.params.id;
      const {
        disposalDate,
        disposalValue,
        disposalMethod,
        description,
        currencyId,
        paymentBankId,
        proceedsChartOfAccountId,
      } = req.body;

      // Validation
      if (!assetId) {
        res.status(400).json({ error: 'Asset id is required' });
        return;
      }
      if (!disposalDate || disposalValue === undefined || disposalValue === null || !disposalMethod) {
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
        disposalDate: parseDate(disposalDate),
        disposalValue: parseFloat(disposalValue),
        disposalMethod,
        description,
        createdById: userId,
        currencyId,
        paymentBankId,
        proceedsChartOfAccountId,
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
      const assetId =
        req.params.assetId ||
        req.params.id ||
        (typeof req.query.assetId === 'string' ? req.query.assetId : undefined);
      if (!assetId) {
        res.status(400).json({
          error: 'assetId is required (e.g. /accounting/assets/:id/depreciation-schedule or ?assetId=)',
        });
        return;
      }

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

      const { asOfDate, period } = req.body || {};
      const result = await AssetService.postMonthlyDepreciation({
        createdById: userId,
        asOfDate: asOfDate ? parseDate(asOfDate) : undefined,
        period: typeof period === 'string' && period.trim() ? period.trim() : undefined,
      });

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

  /** True when the TCP peer is loopback (direct hit to Node). Used only when DEPRECIATION_CRON_SECRET is unset. */
  private static isLoopbackSocket(req: Request): boolean {
    const a = req.socket?.remoteAddress ?? '';
    return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  }

  /**
   * Depreciation / journal entries need createdById. Cron always uses the user whose firstName is "admin" (case-insensitive).
   */
  private static async findAdminUserIdForDepreciationCron(): Promise<string | null> {
    const rows = await prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM users WHERE LOWER(firstName) = 'admin' ORDER BY createdAt ASC LIMIT 1`
    );
    return rows[0]?.id ?? null;
  }

  /**
   * Monthly depreciation for cron / automation (no JWT).
   * - If DEPRECIATION_CRON_SECRET is set: require matching X-Depreciation-Cron-Secret (stops strangers on the internet from posting JEs).
   * - If secret is not set: only loopback connections allowed (local dev).
   * createdById: user with first name "admin" (any case).
   */
  static async postMonthlyDepreciationCron(req: Request, res: Response): Promise<void> {
    try {
      const secret = process.env.DEPRECIATION_CRON_SECRET?.trim();

      let authMode: 'shared-secret' | 'loopback-local' = 'shared-secret';

      if (secret) {
        const headerSecret = String(
          req.headers['x-depreciation-cron-secret'] ||
            req.headers['X-Depreciation-Cron-Secret'] ||
            ''
        );
        if (headerSecret !== secret) {
          res.status(401).json({ success: false, error: 'Unauthorized' });
          return;
        }
        authMode = 'shared-secret';
      } else {
        if (!AssetController.isLoopbackSocket(req)) {
          res.status(403).json({
            success: false,
            error:
              'Depreciation cron is not allowed from this host without DEPRECIATION_CRON_SECRET. Set the secret for remote/cron calls.',
          });
          return;
        }
        authMode = 'loopback-local';
      }

      const resolvedActorId = await AssetController.findAdminUserIdForDepreciationCron();
      if (!resolvedActorId) {
        res.status(503).json({
          success: false,
          error:
            'No user with first name "admin" found. Add a user whose firstName is admin (any case) for depreciation cron.',
        });
        return;
      }

      const body = req.body || {};
      const asOfDate = body.asOfDate ? parseDate(body.asOfDate) : new Date();
      const period = typeof body.period === 'string' && body.period.trim() ? body.period.trim() : undefined;

      const result = await AssetService.postMonthlyDepreciation({
        createdById: resolvedActorId,
        asOfDate,
        period,
      });

      console.log(
        `[depreciation-cron] authMode=${authMode} period=${result.period} asOf=${result.asOfDate} processed=${result.processedAssets} skippedNotDue=${result.skippedNotDue} skippedErrors=${result.skippedErrors}`
      );

      res.json({
        success: true,
        message: 'Monthly depreciation cron run completed',
        data: result,
        meta: { authMode },
      });
    } catch (error: any) {
      console.error('Error in depreciation cron:', error);
      res.status(500).json({
        success: false,
        error: 'Depreciation cron failed',
        details: error.message,
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
