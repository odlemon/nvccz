// @ts-nocheck
import { Response, NextFunction } from "express";
import { FundraisingRequest } from "../middleware/fundraisingAuth";
import { FundraisingCampaignService } from "../services/fundraising/FundraisingCampaignService";
import { FundraisingPipelineService } from "../services/fundraising/FundraisingPipelineService";
import { FundraisingDealService } from "../services/fundraising/FundraisingDealService";
import { FundraisingChecklistService } from "../services/fundraising/FundraisingChecklistService";
import { FundraisingInteractionService } from "../services/fundraising/FundraisingInteractionService";
import { FundraisingMailerService } from "../services/fundraising/FundraisingMailerService";
import { FundraisingAgreementService } from "../services/fundraising/FundraisingAgreementService";
import { FundraisingCloseService } from "../services/fundraising/FundraisingCloseService";

export class FundraisingController {
  static async listCampaigns(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const fundId = req.query.fundId as string | undefined;
      const status = req.query.status as string | undefined;
      const data = await FundraisingCampaignService.list({ fundId, status });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createCampaign(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingCampaignService.create(req.user!.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getCampaign(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingCampaignService.get(req.params.campaignId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async patchCampaign(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingCampaignService.update(req.params.campaignId, req.body);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getBoard(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const presentationCurrency = req.query.presentationCurrency as string | undefined;
      const data = await FundraisingPipelineService.getBoard(req.params.campaignId, presentationCurrency);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getDashboard(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const presentationCurrency = req.query.presentationCurrency as string | undefined;
      const data = await FundraisingPipelineService.getDashboard(req.params.campaignId, presentationCurrency);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getMetrics(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const presentationCurrency = req.query.presentationCurrency as string | undefined;
      const data = await FundraisingPipelineService.getMetrics(req.params.campaignId, presentationCurrency);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createDeal(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingDealService.create(req.params.campaignId, req.user!.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getDeal(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingDealService.get(req.params.dealId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async patchDeal(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingDealService.update(req.params.dealId, req.body);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async moveDealStage(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const { stageId } = req.body;
      if (!stageId) return res.status(400).json({ success: false, message: "stageId required" });
      const data = await FundraisingDealService.moveStage(req.params.dealId, stageId, req.user!.id);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getChecklist(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingChecklistService.list(req.params.dealId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async patchChecklist(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const { itemKey, isComplete } = req.body;
      if (!itemKey) return res.status(400).json({ success: false, message: "itemKey required" });
      const data = await FundraisingChecklistService.toggle(
        req.params.dealId,
        itemKey,
        Boolean(isComplete),
        req.user!.id
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listInteractions(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingInteractionService.list(req.params.dealId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createInteraction(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingInteractionService.log(req.params.dealId, req.user!.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async sendMailer(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingMailerService.sendBatch(req.params.campaignId, req.user!.id, req.body);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getAgreement(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingAgreementService.get(req.params.dealId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async uploadAgreement(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const file = req.file;
      if (!file?.buffer) {
        return res.status(400).json({ success: false, message: "file required" });
      }
      const data = await FundraisingAgreementService.uploadSigned(req.params.dealId, req.user!.id, {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async closeDeal(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingCloseService.closeDeal(req.params.dealId, req.user!.id);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
}
