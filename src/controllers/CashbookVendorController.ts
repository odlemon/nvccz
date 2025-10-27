// @ts-nocheck
import { Request, Response } from 'express';
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";
import { ResponseHelper } from "../utils/responseHelper";
import { logger } from "../utils/logger";

export class CashbookVendorController {
  
  /**
   * Get vendors for cashbook
   * Same response as accounting vendors but with cashbook-specific naming
   */
  static async getVendors(req: Request, res: Response): Promise<void> {
    try {
      const vendors = await prisma.vendor.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          taxNumber: true,
          contactPerson: true,
          email: true,
          phone: true,
          address: true,
          paymentTerms: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { name: 'asc' }
      });

      return ResponseHelper.success(res, 'Vendors retrieved successfully', vendors);
    } catch (error: any) {
      logger.error('Error in CashbookVendorController.getVendors:', error);
      return ResponseHelper.error(res, 'Failed to get vendors', error.message);
    }
  }

  /**
   * Get vendor by ID for cashbook
   * Same response as accounting vendors but with cashbook-specific naming
   */
  static async getVendorById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        return ResponseHelper.badRequest(res, 'Vendor ID is required');
      }

      const vendor = await prisma.vendor.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          taxNumber: true,
          contactPerson: true,
          email: true,
          phone: true,
          address: true,
          paymentTerms: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        }
      });

      if (!vendor) {
        return ResponseHelper.notFound(res, 'Vendor not found');
      }

      return ResponseHelper.success(res, 'Vendor details retrieved successfully', vendor);
    } catch (error: any) {
      logger.error('Error in CashbookVendorController.getVendorById:', error);
      return ResponseHelper.error(res, 'Failed to get vendor details', error.message);
    }
  }
}
