// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceFpaMappingService } from "../services/PerformanceFpaMappingService";
import { PerformanceForecastReviewTriggerService } from "../services/PerformanceForecastReviewTriggerService";

function userOf(req: any) {
  return req.user || {};
}

function handleError(res: Response, e: any) {
  const status = e?.statusCode || 500;
  res.status(status).json({ success: false, code: e?.code, message: e?.message || "Unexpected error" });
}

export class PerformanceFpaIntegrationController {
  static async listTargetMappings(req: Request, res: Response) {
    try {
      const data = await PerformanceFpaMappingService.listTargetMappings(req.query || {});
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async createTargetMapping(req: Request, res: Response) {
    try {
      const data = await PerformanceFpaMappingService.createTargetMapping(req.body || {}, userOf(req).id);
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async setTargetMappingActive(req: Request, res: Response) {
    try {
      const data = await PerformanceFpaMappingService.setTargetMappingActive(req.params.id, req.body?.isActive);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async deleteTargetMapping(req: Request, res: Response) {
    try {
      const data = await PerformanceFpaMappingService.deleteTargetMapping(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listDriverMappings(req: Request, res: Response) {
    try {
      const data = await PerformanceFpaMappingService.listDriverMappings(req.query || {});
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async createDriverMapping(req: Request, res: Response) {
    try {
      const data = await PerformanceFpaMappingService.createDriverMapping(req.body || {}, userOf(req).id);
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async setDriverMappingActive(req: Request, res: Response) {
    try {
      const data = await PerformanceFpaMappingService.setDriverMappingActive(req.params.id, req.body?.isActive);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async deleteDriverMapping(req: Request, res: Response) {
    try {
      const data = await PerformanceFpaMappingService.deleteDriverMapping(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listReviewTriggers(req: Request, res: Response) {
    try {
      const data = await PerformanceForecastReviewTriggerService.list(req.query || {});
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async getReviewTrigger(req: Request, res: Response) {
    try {
      const data = await PerformanceForecastReviewTriggerService.get(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async claimReviewTrigger(req: Request, res: Response) {
    try {
      const data = await PerformanceForecastReviewTriggerService.claim(req.params.id, userOf(req).id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async decideReviewTrigger(req: Request, res: Response) {
    try {
      const data = await PerformanceForecastReviewTriggerService.decide(req.params.id, req.body || {}, userOf(req).id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }
}
