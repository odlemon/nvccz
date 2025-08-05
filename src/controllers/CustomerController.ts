// @ts-nocheck
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { dbConnection } from "../utils/database";
import { responseHelper } from "../utils/responseHelper";
import { logger } from "../utils/logger";

const prisma = dbConnection.getPrismaClient();

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
        responseHelper.sendError(res, 400, "Customer name is required");
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

      responseHelper.sendSuccess(res, 201, "Customer created successfully", customer);
    } catch (error: any) {
      logger.error("Error creating customer", { error: error.message });
      responseHelper.sendError(res, 500, `Failed to create customer: ${error.message}`);
    }
  }

  /**
   * Get customer by ID
   */
  static async getCustomerById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        responseHelper.sendError(res, 400, "Customer ID is required");
        return;
      }

      const customer = await prisma.customer.findUnique({
        where: { id }
      });

      if (!customer) {
        responseHelper.sendError(res, 404, "Customer not found");
        return;
      }

      responseHelper.sendSuccess(res, 200, "Customer retrieved successfully", customer);
    } catch (error: any) {
      logger.error("Error getting customer", { error: error.message });
      responseHelper.sendError(res, 500, `Failed to get customer: ${error.message}`);
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

      responseHelper.sendSuccess(res, 200, "Customers retrieved successfully", result);
    } catch (error: any) {
      logger.error("Error getting customers", { error: error.message });
      responseHelper.sendError(res, 500, `Failed to get customers: ${error.message}`);
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
        responseHelper.sendError(res, 400, "Customer ID is required");
        return;
      }

      const updatedCustomer = await prisma.customer.update({
        where: { id },
        data: updateData
      });

      logger.info("Customer updated successfully", {
        customerId: id
      });

      responseHelper.sendSuccess(res, 200, "Customer updated successfully", updatedCustomer);
    } catch (error: any) {
      logger.error("Error updating customer", { error: error.message });
      responseHelper.sendError(res, 500, `Failed to update customer: ${error.message}`);
    }
  }

  /**
   * Delete a customer (soft delete)
   */
  static async deleteCustomer(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        responseHelper.sendError(res, 400, "Customer ID is required");
        return;
      }

      await prisma.customer.update({
        where: { id },
        data: { isActive: false }
      });

      logger.info("Customer deleted successfully", {
        customerId: id
      });

      responseHelper.sendSuccess(res, 200, "Customer deleted successfully");
    } catch (error: any) {
      logger.error("Error deleting customer", { error: error.message });
      responseHelper.sendError(res, 500, `Failed to delete customer: ${error.message}`);
    }
  }
} 