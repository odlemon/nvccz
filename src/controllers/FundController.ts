//@ts-nocheck
import { Request, Response } from 'express';
import { FundService } from '../services/FundService';
import { FirebaseStorageService } from '../services/FirebaseStorageService';

export class FundController {
  /**
   * Create a new fund
   */
  static async createFund(req: Request, res: Response) {
    try {
      const {
        name,
        description,
        totalAmount,
        minInvestment,
        maxInvestment,
        focusIndustries,
        applicationStart,
        applicationEnd,
        status,
        managementFeeRate,
        carryRate,
        hurdleRate
      } = req.body;

      const createdById = (req as any).user.id; // Get user ID from authenticated request

      const fund = await FundService.createFund({
        name,
        description,
        totalAmount,
        minInvestment,
        maxInvestment,
        focusIndustries,
        applicationStart: new Date(applicationStart),
        applicationEnd: new Date(applicationEnd),
        status,
        createdById,
        managementFeeRate,
        carryRate,
        hurdleRate
      });

      res.status(201).json({
        success: true,
        data: fund,
        message: "Fund created successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Update fund details
   */
  static async updateFund(req: Request, res: Response) {
    try {
      const { fundId } = req.params;
      const updateData = req.body;

      const fund = await FundService.updateFund(fundId, updateData);

      res.status(200).json({
        success: true,
        data: fund,
        message: "Fund updated successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Close a fund
   */
  static async closeFund(req: Request, res: Response) {
    try {
      const { fundId } = req.params;

      const fund = await FundService.closeFund(fundId);

      res.status(200).json({
        success: true,
        data: fund,
        message: "Fund closed successfully"
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * List a fund's recorded performance snapshots (NAV/called/distributed over time)
   */
  static async getPerformanceSnapshots(req: Request, res: Response) {
    try {
      const { fundId } = req.params;
      const snapshots = await FundService.listPerformanceSnapshots(fundId);
      res.status(200).json({ success: true, data: snapshots });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * List a fund's documents (Portfolio Funds detail — Documents tab)
   */
  static async listDocuments(req: Request, res: Response) {
    try {
      const { fundId } = req.params;
      const documents = await FundService.listFundDocuments(fundId);
      res.status(200).json({ success: true, data: documents });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Upload a document to a fund
   */
  static async uploadDocument(req: Request, res: Response) {
    try {
      const { fundId } = req.params;
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      const category = req.body.category || 'General';
      const { filePath, downloadURL } = await FirebaseStorageService.uploadFundDocument(
        file.buffer,
        file.originalname,
        fundId,
        category
      );
      const uploadedById = (req as any).user?.id;
      const document = await FundService.createFundDocument({
        fundId,
        name: file.originalname,
        category,
        fileUrl: downloadURL,
        storagePath: filePath,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        uploadedById,
      });
      res.status(201).json({ success: true, data: document, message: 'Document uploaded successfully' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Get fund by ID
   */
  static async getFundById(req: Request, res: Response) {
    try {
      const { fundId } = req.params;

      const fund = await FundService.getFundById(fundId);

      if (!fund) {
        return res.status(404).json({
          success: false,
          message: "Fund not found"
        });
      }

      res.status(200).json({
        success: true,
        data: fund
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get all funds with filtering
   */
  static async getAllFunds(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;
      const industry = req.query.industry as string;
      const minAvailableBalance = req.query.minAvailableBalance ? parseFloat(req.query.minAvailableBalance as string) : undefined;
      const maxAvailableBalance = req.query.maxAvailableBalance ? parseFloat(req.query.maxAvailableBalance as string) : undefined;

      const filters = {
        status,
        industry,
        minAvailableBalance,
        maxAvailableBalance
      };

      const result = await FundService.getAllFunds(page, limit, filters);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get funds by industry
   */
  static async getFundsByIndustry(req: Request, res: Response) {
    try {
      const { industry } = req.params;

      const funds = await FundService.getFundsByIndustry(industry);

      res.status(200).json({
        success: true,
        data: funds
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get funds by status
   */
  static async getFundsByStatus(req: Request, res: Response) {
    try {
      const { status } = req.params;

      const funds = await FundService.getFundsByStatus(status);

      res.status(200).json({
        success: true,
        data: funds
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get funds by available balance range
   */
  static async getFundsByAvailableBalance(req: Request, res: Response) {
    try {
      const { minBalance, maxBalance } = req.params;

      const funds = await FundService.getFundsByAvailableBalance(
        parseFloat(minBalance),
        parseFloat(maxBalance)
      );

      res.status(200).json({
        success: true,
        data: funds
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * Get fund statistics
   */
  static async getFundStatistics(req: Request, res: Response) {
    try {
      const statistics = await FundService.getFundStatistics();

      res.status(200).json({
        success: true,
        data: statistics
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}
