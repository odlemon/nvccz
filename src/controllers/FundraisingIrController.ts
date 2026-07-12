// @ts-nocheck
import { Response, NextFunction } from "express";
import { FundraisingRequest } from "../middleware/fundraisingAuth";
import { FundraisingIrError } from "../services/fundraising/FundraisingIrError";
import { FundraisingIrInvestorService } from "../services/fundraising/FundraisingIrInvestorService";
import { FundraisingIrCampaignService } from "../services/fundraising/FundraisingIrCampaignService";
import { FundraisingIrOpportunityService } from "../services/fundraising/FundraisingIrOpportunityService";
import { FundraisingIrDashboardService } from "../services/fundraising/FundraisingIrDashboardService";

function sendError(res: Response, e: any) {
  if (e instanceof FundraisingIrError || e?.name === "FundraisingIrError") {
    const error: any = {
      code: e.code || "ERROR",
      message: e.message,
    };
    if (e.unmetRequirements) error.unmetRequirements = e.unmetRequirements;
    if (e.unmet) error.unmet = e.unmet;
    return res.status(e.statusCode || 400).json({ success: false, error });
  }
  if (e?.statusCode) {
    return res.status(e.statusCode).json({
      success: false,
      error: { code: e.code || "ERROR", message: e.message },
    });
  }
  throw e;
}

export class FundraisingIrController {
  static async executiveDashboard(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrDashboardService.executiveDashboard({
        campaignId: req.query.campaignId as string | undefined,
        campaignType: req.query.campaignType as string | undefined,
      });
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async listCampaigns(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrCampaignService.list({
        campaignType: req.query.campaignType as string | undefined,
        status: req.query.status as string | undefined,
        fundId: req.query.fundId as string | undefined,
      });
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async createCampaign(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrCampaignService.create(req.user!.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async getCampaign(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrCampaignService.get(req.params.campaignId);
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async patchCampaign(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrCampaignService.update(req.params.campaignId, req.body);
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async activateCampaign(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrCampaignService.activate(req.params.campaignId, req.user!.id);
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async campaignDashboard(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrDashboardService.campaignDashboard(req.params.campaignId);
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async listOpportunities(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrOpportunityService.list({
        campaignId: req.query.campaignId as string | undefined,
        investorId: req.query.investorId as string | undefined,
        status: req.query.status as string | undefined,
        stageCode: req.query.stageCode as string | undefined,
        ownerId: req.query.ownerId as string | undefined,
      });
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async createOpportunity(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrOpportunityService.create(req.user!.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async getOpportunity(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrOpportunityService.get(req.params.opportunityId);
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async patchOpportunity(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrOpportunityService.update(
        req.user!.id,
        req.params.opportunityId,
        req.body
      );
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async transitionOpportunity(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrOpportunityService.transition(
        req.user!.id,
        req.params.opportunityId,
        req.body
      );
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async assignOpportunity(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrOpportunityService.assign(
        req.user!.id,
        req.params.opportunityId,
        req.body
      );
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async markLostOpportunity(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrOpportunityService.markLost(
        req.user!.id,
        req.params.opportunityId,
        req.body
      );
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async opportunityTimeline(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrOpportunityService.timeline(req.params.opportunityId);
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  // —— Investors ——
  static async listInvestors(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrInvestorService.list({
        q: req.query.q as string | undefined,
        status: req.query.status as string | undefined,
        investorType: req.query.investorType as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      });
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async createInvestor(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrInvestorService.create(req.user!.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async getInvestor(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrInvestorService.get(req.params.investorId);
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async patchInvestor(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrInvestorService.update(req.params.investorId, req.body);
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async addInvestorContact(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrInvestorService.addContact(
        req.params.investorId,
        req.user!.id,
        req.body
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }

  static async investorRelationshipSummary(req: FundraisingRequest, res: Response, next: NextFunction) {
    try {
      const data = await FundraisingIrInvestorService.relationshipSummary(req.params.investorId);
      res.json({ success: true, data });
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  }
}
