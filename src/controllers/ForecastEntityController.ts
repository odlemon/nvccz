// @ts-nocheck
import { Request, Response } from "express";
import { ForecastEntityService } from "../services/ForecastEntityService";

function handleError(res: Response, e: any) {
  const status = e?.statusCode || 500;
  res.status(status).json({
    success: false,
    message: e?.message || "Internal error",
  });
}

export class ForecastEntityController {
  static async list(req: Request, res: Response) {
    try {
      const data = await ForecastEntityService.list();
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const data = await ForecastEntityService.create(
        {
          name: req.body.name,
          type: req.body.type,
          base_currency: req.body.base_currency,
          registration_number: req.body.registration_number,
          portfolio_company_id: req.body.portfolio_company_id,
          clone_from_entity_id: req.body.clone_from_entity_id,
        },
        userId
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const data = await ForecastEntityService.get(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listAccounts(req: Request, res: Response) {
    try {
      const data = await ForecastEntityService.listAccounts(req.params.id, {
        accountType: req.query.account_type as string | undefined,
        isActive: req.query.is_active !== undefined ? req.query.is_active !== "false" : true,
        forPosting: req.query.for_posting === "true",
      });
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async resyncCoa(req: Request, res: Response) {
    try {
      const data = await ForecastEntityService.resyncFromGlobalCoa(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }
}
