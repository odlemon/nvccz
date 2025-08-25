//@ts-nocheck
import { Request, Response } from 'express';
import { TermSheetService, CreateTermSheetRequest, UpdateTermSheetRequest } from '../services/TermSheetService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class TermSheetController {
  /**
   * Create a new term sheet
   */
  static async createTermSheet(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const userId = (req as any).user.id;

      const termSheetData: CreateTermSheetRequest = {
        applicationId,
        createdById: userId,
        title: req.body.title,
        investmentAmount: req.body.investmentAmount,
        equityPercentage: req.body.equityPercentage,
        valuation: req.body.valuation,
        keyTerms: req.body.keyTerms,
        conditions: req.body.conditions,
        timeline: req.body.timeline,
        documentUrl: req.body.documentUrl,
        documentFileName: req.body.documentFileName,
        documentSize: req.body.documentSize
      };

      const termSheet = await TermSheetService.createTermSheet(termSheetData);

      res.status(201).json({
        success: true,
        message: 'Term sheet created successfully',
        data: termSheet
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to create term sheet: ${error.message}`
      });
    }
  }

  /**
   * Get term sheet by application ID
   */
  static async getTermSheetByApplicationId(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;

      const termSheet = await TermSheetService.getTermSheetByApplicationId(applicationId);

      if (!termSheet) {
        res.status(404).json({
          success: false,
          message: 'Term sheet not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Term sheet retrieved successfully',
        data: termSheet
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to get term sheet: ${error.message}`
      });
    }
  }

  /**
   * Update term sheet
   */
  static async updateTermSheet(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;

      const updateData: UpdateTermSheetRequest = {
        title: req.body.title,
        investmentAmount: req.body.investmentAmount,
        equityPercentage: req.body.equityPercentage,
        valuation: req.body.valuation,
        keyTerms: req.body.keyTerms,
        conditions: req.body.conditions,
        timeline: req.body.timeline,
        documentUrl: req.body.documentUrl,
        documentFileName: req.body.documentFileName,
        documentSize: req.body.documentSize,
        status: req.body.status,
        isDraft: req.body.isDraft,
        isFinal: req.body.isFinal
      };

      const termSheet = await TermSheetService.updateTermSheet(applicationId, updateData);

      res.status(200).json({
        success: true,
        message: 'Term sheet updated successfully',
        data: termSheet
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to update term sheet: ${error.message}`
      });
    }
  }

  /**
   * Mark term sheet as final
   */
  static async markAsFinal(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;

      const termSheet = await TermSheetService.markAsFinal(applicationId);

      res.status(200).json({
        success: true,
        message: 'Term sheet marked as final successfully',
        data: termSheet
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to mark term sheet as final: ${error.message}`
      });
    }
  }

  /**
   * Sign term sheet
   */
  static async signTermSheet(req: Request, res: Response): Promise<void> {
    try {
      const { applicationId } = req.params;
      const userId = (req as any).user.id;

      // Validate that the user is the applicant for this application
      const application = await prisma.application.findUnique({
        where: { id: applicationId }
      });

      if (!application) {
        res.status(404).json({
          success: false,
          message: 'Application not found'
        });
        return;
      }

      // Check if the user is the applicant for this application
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || user.email !== application.applicantEmail) {
        res.status(403).json({
          success: false,
          message: 'You are not authorized to sign this term sheet'
        });
        return;
      }

      const termSheet = await TermSheetService.signTermSheet(applicationId);

      res.status(200).json({
        success: true,
        message: 'Term sheet signed successfully',
        data: termSheet
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to sign term sheet: ${error.message}`
      });
    }
  }

  /**
   * Get all term sheets
   */
  static async getAllTermSheets(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;

      const result = await TermSheetService.getAllTermSheets(page, limit, status);

      res.status(200).json({
        success: true,
        message: 'Term sheets retrieved successfully',
        data: result
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to get term sheets: ${error.message}`
      });
    }
  }

  /**
   * Get my term sheets
   */
  static async getMyTermSheets(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await TermSheetService.getMyTermSheets(userId, page, limit);

      res.status(200).json({
        success: true,
        message: 'My term sheets retrieved successfully',
        data: result
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: `Failed to get my term sheets: ${error.message}`
      });
    }
  }
}
