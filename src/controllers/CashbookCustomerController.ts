// @ts-nocheck
import { Request, Response } from 'express';
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";
import { ResponseHelper } from "../utils/responseHelper";
import { logger } from "../utils/logger";

const prisma = dbConnection.getPrismaClient();

export class CashbookCustomerController {
  
  /**
   * Get customers for cashbook
   * Same response as accounting customers but with cashbook-specific naming
   */
  static async getCustomers(req: Request, res: Response): Promise<void> {
    try {
      const customers = await prisma.customer.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          taxNumber: true,
          contactPerson: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          country: true,
          postalCode: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { name: 'asc' }
      });

      return ResponseHelper.success(res, 'Customers retrieved successfully', customers);
    } catch (error: any) {
      logger.error('Error in CashbookCustomerController.getCustomers:', error);
      return ResponseHelper.error(res, 'Failed to get customers', error.message);
    }
  }

  /**
   * Get customer by ID for cashbook
   * Same response as accounting customers but with cashbook-specific naming
   */
  static async getCustomerById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        return ResponseHelper.badRequest(res, 'Customer ID is required');
      }

      const customer = await prisma.customer.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          taxNumber: true,
          contactPerson: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          country: true,
          postalCode: true,
          createdAt: true,
          updatedAt: true,
        }
      });

      if (!customer) {
        return ResponseHelper.notFound(res, 'Customer not found');
      }

      return ResponseHelper.success(res, 'Customer details retrieved successfully', customer);
    } catch (error: any) {
      logger.error('Error in CashbookCustomerController.getCustomerById:', error);
      return ResponseHelper.error(res, 'Failed to get customer details', error.message);
    }
  }
}
