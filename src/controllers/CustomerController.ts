// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { ResponseHelper } from "../utils/responseHelper";
import { logger } from "../utils/logger";

export class CustomerController {
  /**
   * Create a new customer
   */
  static async createCustomer(req: Request, res: Response): Promise<void> {
    try {
      const {
        name,
        taxNumber,
        contactPerson,
        email,
        phone,
        address,
        paymentTerms
      } = req.body;

      // Validate required fields
      if (!name) {
        ResponseHelper.error(res, "Customer name is required", undefined, 400);
        return;
      }

      const customer = await prisma.customer.create({
        data: {
          name,
          taxNumber,
          contactPerson,
          email,
          phone,
          address,
          paymentTerms
        }
      });

      logger.info("Customer created successfully", {
        customerId: customer.id,
        name: customer.name
      });

      ResponseHelper.success(res, "Customer created successfully", customer, 201);
    } catch (error: any) {
      logger.error("Error creating customer", { error: error.message });
      ResponseHelper.error(res, `Failed to create customer: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get customer by ID
   */
  static async getCustomerById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Customer ID is required", undefined, 400);
        return;
      }

      const customer = await prisma.customer.findUnique({
        where: { id }
      });

      if (!customer) {
        ResponseHelper.error(res, "Customer not found", undefined, 404);
        return;
      }

      ResponseHelper.success(res, "Customer retrieved successfully", customer);
    } catch (error: any) {
      logger.error("Error getting customer", { error: error.message });
      ResponseHelper.error(res, `Failed to get customer: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Get customers with filtering and pagination
   */
  static async getCustomers(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        search
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      // Build where clause
      const where: any = { isActive: true };
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: "insensitive" } },
          { contactPerson: { contains: search as string, mode: "insensitive" } },
          { email: { contains: search as string, mode: "insensitive" } }
        ];
      }

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { name: 'asc' }
        }),
        prisma.customer.count({ where })
      ]);

      const result = {
        customers,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      };

      ResponseHelper.success(res, "Customers retrieved successfully", result);
    } catch (error: any) {
      logger.error("Error getting customers", { error: error.message });
      ResponseHelper.error(res, `Failed to get customers: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Update a customer
   */
  static async updateCustomer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updateData = req.body;

      if (!id) {
        ResponseHelper.error(res, "Customer ID is required", undefined, 400);
        return;
      }

      const updatedCustomer = await prisma.customer.update({
        where: { id },
        data: updateData
      });

      logger.info("Customer updated successfully", {
        customerId: id
      });

      ResponseHelper.success(res, "Customer updated successfully", updatedCustomer);
    } catch (error: any) {
      logger.error("Error updating customer", { error: error.message });
      ResponseHelper.error(res, `Failed to update customer: ${error.message}`, undefined, 500);
    }
  }

  /**
   * Delete a customer (soft delete)
   */
  static async deleteCustomer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        ResponseHelper.error(res, "Customer ID is required", undefined, 400);
        return;
      }

      await prisma.customer.update({
        where: { id },
        data: { isActive: false }
      });

      logger.info("Customer deleted successfully", {
        customerId: id
      });

      ResponseHelper.success(res, "Customer deleted successfully");
    } catch (error: any) {
      logger.error("Error deleting customer", { error: error.message });
      ResponseHelper.error(res, `Failed to delete customer: ${error.message}`, undefined, 500);
    }
  }
} 