// @ts-nocheck
import { Request, Response } from 'express';
import { CustomerController } from './CustomerController';

export class CashbookCustomerController {
  
  /**
   * Get customers for cashbook
   * Same response as accounting customers but with cashbook-specific naming
   */
  static async getCustomers(req: Request, res: Response): Promise<void> {
    // Delegate to the original CustomerController
    return CustomerController.getCustomers(req, res);
  }

  /**
   * Get customer by ID for cashbook
   * Same response as accounting customers but with cashbook-specific naming
   */
  static async getCustomerById(req: Request, res: Response): Promise<void> {
    // Delegate to the original CustomerController
    return CustomerController.getCustomerById(req, res);
  }
}
