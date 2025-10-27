// @ts-nocheck
import { Request, Response } from 'express';
import { VendorController } from './VendorController';

export class CashbookVendorController {
  
  /**
   * Get vendors for cashbook
   * Same response as accounting vendors but with cashbook-specific naming
   */
  static async getVendors(req: Request, res: Response): Promise<void> {
    // Delegate to the original VendorController
    return VendorController.getVendors(req, res);
  }

  /**
   * Get vendor by ID for cashbook
   * Same response as accounting vendors but with cashbook-specific naming
   */
  static async getVendorById(req: Request, res: Response): Promise<void> {
    // Delegate to the original VendorController
    return VendorController.getVendorById(req, res);
  }
}
