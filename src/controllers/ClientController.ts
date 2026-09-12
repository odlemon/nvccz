// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { ClientService, CreateClientRequest, UpdateClientRequest } from "../services/ClientService";
import { parseDate } from "../utils/dateHelper";

export class ClientController {
  // Create a new client with optional investment commitment
  static async createClient(req: Request, res: Response, next: NextFunction) {
    try {
      const request: CreateClientRequest = {
        investorId: req.body.investorId || req.body.investor_id,
        type: req.body.type,
        legalName: req.body.legalName || req.body.legal_name,
        email: req.body.email,
        country: req.body.country,
        phone: req.body.phone,
        address: req.body.address,
        taxId: req.body.taxId || req.body.tax_id,
        status: req.body.status,
        // Investment commitment fields
        fundId: (req.body.fundId || req.body.fund_id) && (req.body.fundId || req.body.fund_id).trim() !== "" ? (req.body.fundId || req.body.fund_id) : undefined,
        amount: req.body.amount,
        currency: req.body.currency,
        effectiveDate: (req.body.effectiveDate || req.body.effective_date) ? parseDate(req.body.effectiveDate || req.body.effective_date) : undefined,
        eSign: req.body.eSign || req.body.e_sign,
        notes: req.body.notes
      };

      const client = await ClientService.createClient(request);

      res.status(201).json({
        success: true,
        message: "Client created successfully",
        data: client
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Get all clients
  static async getAllClients(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const filters = {
        type: req.query.type as string,
        country: req.query.country as string,
        status: req.query.status as string,
        search: req.query.search as string
      };

      const result = await ClientService.getAllClients(page, limit, filters);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Get client by ID
  static async getClientById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const client = await ClientService.getClientById(id);

      res.status(200).json({
        success: true,
        data: client
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Get client by investor ID
  static async getClientByInvestorId(req: Request, res: Response, next: NextFunction) {
    try {
      const { investorId } = req.params;
      const client = await ClientService.getClientByInvestorId(investorId);

      res.status(200).json({
        success: true,
        data: client
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Update client with optional investment commitment
  static async updateClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const request: UpdateClientRequest = {
        investorId: req.body.investorId || req.body.investor_id,
        type: req.body.type,
        legalName: req.body.legalName || req.body.legal_name,
        email: req.body.email,
        country: req.body.country,
        phone: req.body.phone,
        address: req.body.address,
        taxId: req.body.taxId || req.body.tax_id,
        status: req.body.status,
        // Investment commitment fields
        fundId: (req.body.fundId || req.body.fund_id) && (req.body.fundId || req.body.fund_id).trim() !== "" ? (req.body.fundId || req.body.fund_id) : undefined,
        amount: req.body.amount,
        currency: req.body.currency,
        effectiveDate: (req.body.effectiveDate || req.body.effective_date) ? parseDate(req.body.effectiveDate || req.body.effective_date) : undefined,
        eSign: req.body.eSign || req.body.e_sign,
        notes: req.body.notes
      };

      const client = await ClientService.updateClient(id, request);

      res.status(200).json({
        success: true,
        message: "Client updated successfully",
        data: client
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Delete client
  static async deleteClient(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await ClientService.deleteClient(id);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      next(error);
    }
  }

  /** Link portal User to LP Client record (fund performance reporting). */
  static async linkUser(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = req.body.userId || req.body.user_id;
      if (!userId) {
        return res.status(400).json({ success: false, message: "userId is required" });
      }
      const client = await ClientService.linkPortalUser(id, userId);
      res.status(200).json({
        success: true,
        message: "Client linked to portal user",
        data: client,
      });
    } catch (error: any) {
      next(error);
    }
  }

  // Get client statistics
  static async getClientStatistics(req: Request, res: Response, next: NextFunction) {
    try {
      const statistics = await ClientService.getClientStatistics();

      res.status(200).json({
        success: true,
        data: statistics
      });
    } catch (error: any) {
      next(error);
    }
  }
}
