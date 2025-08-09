// @ts-nocheck
import { Request, Response } from 'express';
import { MiniKycService, CreateMiniKycRequest, UpdateMiniKycRequest } from '../services/MiniKycService';
import { logger } from '../utils/logger';

export class MiniKycController {
  /**
   * Create or update mini-KYC for the authenticated user
   * POST /api/mini-kyc
   */
  static async createOrUpdateMiniKyc(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { data, isCompleted }: CreateMiniKycRequest = req.body;

      if (!data || typeof data !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Data field is required and must be an object'
        });
      }

      const kyc = await MiniKycService.createOrUpdateMiniKyc(userId, {
        data,
        isCompleted
      });

      logger.info(`Mini-KYC created/updated for user ${userId}`);
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
   * Get mini-KYC for the authenticated user
   * GET /api/mini-kyc
   */
  static async getMiniKyc(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;

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
   * Update mini-KYC for the authenticated user
   * PUT /api/mini-kyc
   */
  static async updateMiniKyc(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { data, isCompleted }: UpdateMiniKycRequest = req.body;

      const kyc = await MiniKycService.updateMiniKyc(userId, {
        data,
        isCompleted
      });

      logger.info(`Mini-KYC updated for user ${userId}`);
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
   * Delete mini-KYC for the authenticated user
   * DELETE /api/mini-kyc
   */
  static async deleteMiniKyc(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;

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

  /**
   * Check if user has completed mini-KYC
   * GET /api/mini-kyc/status
   */
  static async getKycStatus(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;

      const isCompleted = await MiniKycService.isKycCompleted(userId);

      logger.info(`KYC status checked for user ${userId}: ${isCompleted}`);
      return res.status(200).json({
        success: true,
        message: 'KYC status retrieved successfully',
        data: {
          isCompleted,
          userId
        }
      });
    } catch (error) {
      logger.error('Error in getKycStatus:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
} 