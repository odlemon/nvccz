// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface CreateMiniKycRequest {
  ID: string;
  Preferences: string[];
}

export interface UpdateMiniKycRequest {
  ID: string;
  Preferences: string[];
}

export class MiniKycService {
  /**
   * Create or update mini-KYC for a user
   */
  static async createOrUpdateMiniKyc(request: CreateMiniKycRequest) {
    try {
      const existingKyc = await prisma.miniKyc.findUnique({
        where: { userId: request.ID }
      });

      if (existingKyc) {
        // Update existing KYC
        const updatedKyc = await prisma.miniKyc.update({
          where: { userId: request.ID },
          data: {
            preferences: request.Preferences,
            updatedAt: new Date()
          }
        });

        logger.info(`Mini-KYC updated for user ${request.ID}`);
        return updatedKyc;
      } else {
        // Create new KYC
        const newKyc = await prisma.miniKyc.create({
          data: {
            userId: request.ID,
            preferences: request.Preferences
          }
        });

        logger.info(`Mini-KYC created for user ${request.ID}`);
        return newKyc;
      }
    } catch (error) {
      logger.error('Error creating/updating mini-KYC:', error);
      throw error;
    }
  }

  /**
   * Get mini-KYC for a user
   */
  static async getMiniKyc(userId: string) {
    try {
      const kyc = await prisma.miniKyc.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

      if (!kyc) {
        return null;
      }

      logger.info(`Mini-KYC retrieved for user ${userId}`);
      return kyc;
    } catch (error) {
      logger.error('Error retrieving mini-KYC:', error);
      throw error;
    }
  }

  /**
   * Update mini-KYC for a user
   */
  static async updateMiniKyc(request: UpdateMiniKycRequest) {
    try {
      const existingKyc = await prisma.miniKyc.findUnique({
        where: { userId: request.ID }
      });

      if (!existingKyc) {
        throw new Error('Mini-KYC not found for this user');
      }

      const updatedKyc = await prisma.miniKyc.update({
        where: { userId: request.ID },
        data: {
          preferences: request.Preferences,
          updatedAt: new Date()
        }
      });

      logger.info(`Mini-KYC updated for user ${request.ID}`);
      return updatedKyc;
    } catch (error) {
      logger.error('Error updating mini-KYC:', error);
      throw error;
    }
  }

  /**
   * Delete mini-KYC for a user
   */
  static async deleteMiniKyc(userId: string) {
    try {
      const existingKyc = await prisma.miniKyc.findUnique({
        where: { userId }
      });

      if (!existingKyc) {
        throw new Error('Mini-KYC not found for this user');
      }

      await prisma.miniKyc.delete({
        where: { userId }
      });

      logger.info(`Mini-KYC deleted for user ${userId}`);
      return { message: 'Mini-KYC deleted successfully' };
    } catch (error) {
      logger.error('Error deleting mini-KYC:', error);
      throw error;
    }
  }

  /**
   * Get all mini-KYC records (for admin purposes)
   */
  static async getAllMiniKyc() {
    try {
      const allKyc = await prisma.miniKyc.findMany({
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      logger.info(`Retrieved ${allKyc.length} mini-KYC records`);
      return allKyc;
    } catch (error) {
      logger.error('Error retrieving all mini-KYC:', error);
      throw error;
    }
  }


} 