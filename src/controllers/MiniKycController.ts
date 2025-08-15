// @ts-nocheck
import { Request, Response } from 'express';
import { MiniKycService, CreateMiniKycRequest, UpdateMiniKycRequest } from '../services/MiniKycService';
import { logger } from '../utils/logger';

export class MiniKycController {
  /**
   * Create or update mini-KYC for a user
   * POST /api/mini-kyc
   */
  static async createOrUpdateMiniKyc(req: Request, res: Response) {
    try {
      const { ID, Preferences }: CreateMiniKycRequest = req.body;

      if (!ID || typeof ID !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'ID field is required and must be a string'
        });
      }

      if (!Preferences || !Array.isArray(Preferences)) {
        return res.status(400).json({
          success: false,
          message: 'Preferences field is required and must be an array of strings'
        });
      }

      const kyc = await MiniKycService.createOrUpdateMiniKyc({
        ID,
        Preferences
      });

      logger.info(`Mini-KYC created/updated for user ${ID}`);
      return res.status(200).json({
        success: true,
        message: 'Mini-KYC created/updated successfully',
        data: kyc
      });
    } catch (error) {
      logger.error('Error in createOrUpdateMiniKyc:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get mini-KYC for a user
   * GET /api/mini-kyc
   */
  static async getMiniKyc(req: Request, res: Response) {
    try {
      const { userId } = req.query;

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'userId query parameter is required and must be a string'
        });
      }

      const kyc = await MiniKycService.getMiniKyc(userId);

      if (!kyc) {
        return res.status(200).json({
          success: true,
          message: 'No mini-KYC found for this user',
          data: null
        });
      }

      logger.info(`Mini-KYC retrieved for user ${userId}`);
      return res.status(200).json({
        success: true,
        message: 'Mini-KYC retrieved successfully',
        data: kyc
      });
    } catch (error) {
      logger.error('Error in getMiniKyc:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update mini-KYC for a user
   * PUT /api/mini-kyc
   */
  static async updateMiniKyc(req: Request, res: Response) {
    try {
      const { ID, Preferences }: UpdateMiniKycRequest = req.body;

      if (!ID || typeof ID !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'ID field is required and must be a string'
        });
      }

      if (!Preferences || !Array.isArray(Preferences)) {
        return res.status(400).json({
          success: false,
          message: 'Preferences field is required and must be an array of strings'
        });
      }

      const kyc = await MiniKycService.updateMiniKyc({
        ID,
        Preferences
      });

      logger.info(`Mini-KYC updated for user ${ID}`);
      return res.status(200).json({
        success: true,
        message: 'Mini-KYC updated successfully',
        data: kyc
      });
    } catch (error) {
      logger.error('Error in updateMiniKyc:', error);
      
      if (error instanceof Error && error.message === 'Mini-KYC not found for this user') {
        return res.status(404).json({
          success: false,
          message: 'Mini-KYC not found for this user'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Delete mini-KYC for a user
   * DELETE /api/mini-kyc
   */
  static async deleteMiniKyc(req: Request, res: Response) {
    try {
      const { userId } = req.query;

      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'userId query parameter is required and must be a string'
        });
      }

      const result = await MiniKycService.deleteMiniKyc(userId);

      logger.info(`Mini-KYC deleted for user ${userId}`);
      return res.status(200).json({
        success: true,
        message: 'Mini-KYC deleted successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in deleteMiniKyc:', error);
      
      if (error instanceof Error && error.message === 'Mini-KYC not found for this user') {
        return res.status(404).json({
          success: false,
          message: 'Mini-KYC not found for this user'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get all mini-KYC records (admin only)
   * GET /api/mini-kyc/all
   */
  static async getAllMiniKyc(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      
      // Check if user has admin role (you may need to adjust this based on your role system)
      if (user.role?.name !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin role required.'
        });
      }

      const allKyc = await MiniKycService.getAllMiniKyc();

      logger.info(`All mini-KYC records retrieved by admin ${user.id}`);
      return res.status(200).json({
        success: true,
        message: 'All mini-KYC records retrieved successfully',
        data: allKyc
      });
    } catch (error) {
      logger.error('Error in getAllMiniKyc:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }


} 