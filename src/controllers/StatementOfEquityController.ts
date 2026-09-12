// @ts-nocheck
import { Request, Response } from "express";
import { StatementOfEquityService, StatementOfEquityParams } from "../services/StatementOfEquityService";
import { parseDate } from "../utils/dateHelper";

export class StatementOfEquityController {
  /**
   * Generate Statement of Equity for a specific period
   */
  static async generateStatementOfEquity(req: Request, res: Response) {
    try {
      const { startDate, endDate, currencyId } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Start date and end date are required"
        });
      }

      const params: StatementOfEquityParams = {
        startDate: parseDate(startDate),
        endDate: parseDate(endDate),
        currencyId
      };

      const statementOfEquity = await StatementOfEquityService.generateStatementOfEquity(params);

      return res.status(200).json({
        success: true,
        message: "Statement of Equity generated successfully",
        data: statementOfEquity
      });
    } catch (error) {
      console.error("Error in generateStatementOfEquity:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate Statement of Equity",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
}

