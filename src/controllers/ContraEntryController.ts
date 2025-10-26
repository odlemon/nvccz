// @ts-nocheck
// Contra Entry Controller
// Handles contra entry configuration endpoints

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import ContraEntryService from "../services/ContraEntryService";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export default class ContraEntryController {
  
  /**
   * Configure contra entry settings
   * POST /api/cashbook/contra/configure
   */
  static async configureContraEntry(req: AuthRequest, res: Response) {
    try {
      const {
        entryType,
        glAccountId,
        contraType,
        isEnabled
      } = req.body;

      if (!entryType || !glAccountId || !contraType) {
        return res.status(400).json(
          ResponseHelper.error('Missing required fields: entryType, glAccountId, contraType')
        );
      }

      if (!req.user?.id) {
        return res.status(401).json(
          ResponseHelper.error('User authentication required')
        );
      }

      const result = await ContraEntryService.configureContraEntry({
        entryType,
        glAccountId,
        contraType,
        isEnabled: isEnabled ?? true,
        createdById: req.user.id
      });

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in configureContraEntry:', error);
      return res.status(500).json(
        ResponseHelper.error('Internal server error')
      );
    }
  }

  /**
   * Get contra entry configurations
   * GET /api/cashbook/contra/configs
   */
  static async getContraEntryConfigs(req: AuthRequest, res: Response) {
    try {
      const { entryType, glAccountId, isEnabled } = req.query;

      const filters: any = {};
      if (entryType) filters.entryType = entryType as string;
      if (glAccountId) filters.glAccountId = glAccountId as string;
      if (isEnabled !== undefined) filters.isEnabled = isEnabled === 'true';

      const result = await ContraEntryService.getContraEntryConfigs(filters);

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in getContraEntryConfigs:', error);
      return res.status(500).json(
        ResponseHelper.error('Internal server error')
      );
    }
  }

  /**
   * Generate contra entry for cashbook transaction
   * POST /api/cashbook/contra/generate
   */
  static async generateContraEntry(req: AuthRequest, res: Response) {
    try {
      const { cashbookEntryId } = req.body;

      if (!cashbookEntryId) {
        return res.status(400).json(
          ResponseHelper.error('Missing required field: cashbookEntryId')
        );
      }

      if (!req.user?.id) {
        return res.status(401).json(
          ResponseHelper.error('User authentication required')
        );
      }

      const result = await ContraEntryService.generateContraEntry(
        cashbookEntryId,
        req.user.id
      );

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in generateContraEntry:', error);
      return res.status(500).json(
        ResponseHelper.error('Internal server error')
      );
    }
  }

  /**
   * Get contra entries for a cashbook entry
   * GET /api/cashbook/contra/entries/:cashbookEntryId
   */
  static async getContraEntries(req: AuthRequest, res: Response) {
    try {
      const { cashbookEntryId } = req.params;

      if (!cashbookEntryId) {
        return res.status(400).json(
          ResponseHelper.error('Missing required parameter: cashbookEntryId')
        );
      }

      const result = await ContraEntryService.getContraEntries(cashbookEntryId);

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in getContraEntries:', error);
      return res.status(500).json(
        ResponseHelper.error('Internal server error')
      );
    }
  }
}
