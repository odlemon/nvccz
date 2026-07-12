// @ts-nocheck
import { Router, Response, NextFunction } from "express";
import { authenticate } from "../middleware/authenticate";
import {
  FundraisingRequest,
  requireFundraisingView,
  requireFundraisingEdit,
} from "../middleware/fundraisingAuth";
import { FundraisingAccessService } from "../services/fundraising/FundraisingAccessService";
import { FundraisingIrController } from "../controllers/FundraisingIrController";
import { prisma } from "../utils/database";

const router = Router();

router.use(authenticate);

/** Opportunity-scoped view: resolve campaign from opportunity then assertCanView. */
async function requireIrOpportunityView(req: FundraisingRequest, res: Response, next: NextFunction) {
  try {
    const opportunityId = req.params.opportunityId;
    if (!opportunityId) return res.status(400).json({ success: false, message: "opportunityId required" });
    const opp = await prisma.fundraisingOpportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, campaignId: true },
    });
    if (!opp) return res.status(404).json({ success: false, error: { code: "OPPORTUNITY_NOT_FOUND", message: "Opportunity not found" } });
    await FundraisingAccessService.assertCanView(req.user, opp.campaignId);
    req.campaignId = opp.campaignId;
    next();
  } catch (e: any) {
    next(e);
  }
}

/** Create opportunity: if body.campaignId present, assert view on that campaign. */
async function requireCreateOpportunityAccess(req: FundraisingRequest, res: Response, next: NextFunction) {
  try {
    FundraisingAccessService.assertCanEdit(req.user);
    const campaignId = req.body?.campaignId;
    if (campaignId) {
      await FundraisingAccessService.assertCanView(req.user, campaignId);
      req.campaignId = campaignId;
    }
    next();
  } catch (e: any) {
    next(e);
  }
}

router.get("/dashboard", FundraisingIrController.executiveDashboard);

router.get("/campaigns", FundraisingIrController.listCampaigns);
router.post("/campaigns", requireFundraisingEdit, FundraisingIrController.createCampaign);
router.get("/campaigns/:campaignId", requireFundraisingView, FundraisingIrController.getCampaign);
router.patch(
  "/campaigns/:campaignId",
  requireFundraisingView,
  requireFundraisingEdit,
  FundraisingIrController.patchCampaign
);
router.post(
  "/campaigns/:campaignId/activate",
  requireFundraisingView,
  requireFundraisingEdit,
  FundraisingIrController.activateCampaign
);
router.get(
  "/campaigns/:campaignId/dashboard",
  requireFundraisingView,
  FundraisingIrController.campaignDashboard
);

router.get("/opportunities", FundraisingIrController.listOpportunities);
router.post("/opportunities", requireCreateOpportunityAccess, FundraisingIrController.createOpportunity);
router.get(
  "/opportunities/:opportunityId",
  requireIrOpportunityView,
  FundraisingIrController.getOpportunity
);
router.patch(
  "/opportunities/:opportunityId",
  requireIrOpportunityView,
  requireFundraisingEdit,
  FundraisingIrController.patchOpportunity
);
router.post(
  "/opportunities/:opportunityId/transition",
  requireIrOpportunityView,
  requireFundraisingEdit,
  FundraisingIrController.transitionOpportunity
);
router.post(
  "/opportunities/:opportunityId/assign",
  requireIrOpportunityView,
  requireFundraisingEdit,
  FundraisingIrController.assignOpportunity
);
router.post(
  "/opportunities/:opportunityId/mark-lost",
  requireIrOpportunityView,
  requireFundraisingEdit,
  FundraisingIrController.markLostOpportunity
);
router.get(
  "/opportunities/:opportunityId/timeline",
  requireIrOpportunityView,
  FundraisingIrController.opportunityTimeline
);

export default router;
