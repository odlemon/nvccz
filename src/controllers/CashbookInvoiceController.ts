// @ts-nocheck
import { Request, Response } from 'express';
import InvoiceController from './InvoiceController';

export class CashbookInvoiceController {
  
  /**
   * Get invoices for cashbook
   * Same response as accounting invoices but with cashbook-specific naming
   */
  static async getInvoices(req: Request, res: Response): Promise<void> {
    // Delegate to the original InvoiceController
    return InvoiceController.getInvoices(req, res);
  }

  /**
   * Get invoice by ID for cashbook
   * Same response as accounting invoices but with cashbook-specific naming
   */
  static async getInvoiceById(req: Request, res: Response): Promise<void> {
    // Delegate to the original InvoiceController
    return InvoiceController.getInvoiceById(req, res);
  }

  /**
   * Create invoice for cashbook
   * Same response as accounting invoices but with cashbook-specific naming
   */
  static async createInvoice(req: Request, res: Response): Promise<void> {
    // Delegate to the original InvoiceController
    return InvoiceController.createInvoice(req, res);
  }

  /**
   * Update invoice for cashbook
   * Same response as accounting invoices but with cashbook-specific naming
   */
  static async updateInvoice(req: Request, res: Response): Promise<void> {
    // Delegate to the original InvoiceController
    return InvoiceController.updateInvoice(req, res);
  }

  /**
   * Delete invoice for cashbook
   * Same response as accounting invoices but with cashbook-specific naming
   */
  static async deleteInvoice(req: Request, res: Response): Promise<void> {
    // Delegate to the original InvoiceController
    return InvoiceController.deleteInvoice(req, res);
  }
}
