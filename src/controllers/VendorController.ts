// @ts-nocheck
import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";

export class VendorController {
  /**
   * Create a new vendor
   */
  static async createVendor(req: AuthRequest, res: Response) {
    try {
      const { name, taxNumber, contactPerson, email, phone, address, paymentTerms } = req.body;

      // Validation
      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Vendor name is required"
        });
      }

      // Check if vendor name already exists
      const existingVendor = await prisma.vendor.findFirst({
        where: { 
          name: { equals: name },
          isActive: true
        }
      });

      if (existingVendor) {
        return res.status(400).json({
          success: false,
          message: "Vendor with this name already exists"
        });
      }

      const vendor = await prisma.vendor.create({
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

      res.status(201).json({
        success: true,
        message: "Vendor created successfully",
        data: vendor
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to create vendor",
        error: error.message
      });
    }
  }

  /**
   * Get all vendors
   */
  static async getVendors(req: AuthRequest, res: Response) {
    try {
      const { isActive, search } = req.query;
      
      const where: any = {};
      
      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      } else {
        where.isActive = true; // Default to active vendors
      }

      if (search) {
        where.OR = [
          { name: { contains: search as string } },
          { contactPerson: { contains: search as string } },
          { email: { contains: search as string } }
        ];
      }

      const vendors = await prisma.vendor.findMany({
        where,
        orderBy: { name: 'asc' }
      });

      res.status(200).json({
        success: true,
        data: vendors
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch vendors",
        error: error.message
      });
    }
  }

  /**
   * Get vendor by ID
   */
  static async getVendorById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const vendor = await prisma.vendor.findUnique({
        where: { id },
        include: {
          expenses: {
            orderBy: { transactionDate: 'desc' },
            take: 10 // Get last 10 expenses
          }
        }
      });

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found"
        });
      }

      res.status(200).json({
        success: true,
        data: vendor
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch vendor",
        error: error.message
      });
    }
  }

  /**
   * Update vendor
   */
  static async updateVendor(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { name, taxNumber, contactPerson, email, phone, address, paymentTerms, isActive } = req.body;

      // Check if vendor exists
      const existingVendor = await prisma.vendor.findUnique({
        where: { id }
      });

      if (!existingVendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found"
        });
      }

      // If updating name, check if new name already exists
      if (name && name !== existingVendor.name) {
        const nameExists = await prisma.vendor.findFirst({
          where: { 
            name: { equals: name },
            id: { not: id },
            isActive: true
          }
        });

        if (nameExists) {
          return res.status(400).json({
            success: false,
            message: "Vendor with this name already exists"
          });
        }
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (taxNumber !== undefined) updateData.taxNumber = taxNumber;
      if (contactPerson !== undefined) updateData.contactPerson = contactPerson;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms;
      if (isActive !== undefined) updateData.isActive = isActive;

      const vendor = await prisma.vendor.update({
        where: { id },
        data: updateData
      });

      res.status(200).json({
        success: true,
        message: "Vendor updated successfully",
        data: vendor
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to update vendor",
        error: error.message
      });
    }
  }

  /**
   * Delete vendor (soft delete)
   */
  static async deleteVendor(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      // Check if vendor exists
      const vendor = await prisma.vendor.findUnique({
        where: { id }
      });

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found"
        });
      }

      // Check if vendor has expenses
      const expenseCount = await prisma.expense.count({
        where: { vendorId: id }
      });

      if (expenseCount > 0) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete vendor that has associated expenses"
        });
      }

      // Soft delete by setting isActive to false
      await prisma.vendor.update({
        where: { id },
        data: { isActive: false }
      });

      res.status(200).json({
        success: true,
        message: "Vendor deleted successfully"
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to delete vendor",
        error: error.message
      });
    }
  }

  /**
   * Get vendor expenses
   */
  static async getVendorExpenses(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      // Check if vendor exists
      const vendor = await prisma.vendor.findUnique({
        where: { id }
      });

      if (!vendor) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found"
        });
      }

      const [expenses, total] = await Promise.all([
        prisma.expense.findMany({
          where: { vendorId: id },
          include: {
            category: true,
            currency: true
          },
          orderBy: { transactionDate: 'desc' },
          skip,
          take: Number(limit)
        }),
        prisma.expense.count({
          where: { vendorId: id }
        })
      ]);

      res.status(200).json({
        success: true,
        data: {
          expenses,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch vendor expenses",
        error: error.message
      });
    }
  }
}
