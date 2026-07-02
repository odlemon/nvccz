// @ts-nocheck
import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import {
  requireFundraisingView,
  requireFundraisingDealView,
  requireFundraisingEdit,
  requireFundraisingMail,
  requireFundraisingClose,
} from "../middleware/fundraisingAuth";
import { FundraisingController } from "../controllers/FundraisingController";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticate);

router.get("/campaigns", FundraisingController.listCampaigns);
router.post("/campaigns", requireFundraisingEdit, FundraisingController.createCampaign);
router.get("/campaigns/:campaignId", requireFundraisingView, FundraisingController.getCampaign);
router.patch("/campaigns/:campaignId", requireFundraisingView, requireFundraisingEdit, FundraisingController.patchCampaign);
router.get("/campaigns/:campaignId/board", requireFundraisingView, FundraisingController.getBoard);
router.get("/campaigns/:campaignId/dashboard", requireFundraisingView, FundraisingController.getDashboard);
router.get("/campaigns/:campaignId/metrics", requireFundraisingView, FundraisingController.getMetrics);
router.post("/campaigns/:campaignId/deals", requireFundraisingView, requireFundraisingEdit, FundraisingController.createDeal);
router.post(
  "/campaigns/:campaignId/mailer/send",
  requireFundraisingView,
  requireFundraisingMail,
  FundraisingController.sendMailer
);

router.get("/deals/:dealId", requireFundraisingDealView, FundraisingController.getDeal);
router.patch("/deals/:dealId", requireFundraisingDealView, requireFundraisingEdit, FundraisingController.patchDeal);
router.patch("/deals/:dealId/stage", requireFundraisingDealView, requireFundraisingEdit, FundraisingController.moveDealStage);
router.get("/deals/:dealId/checklist", requireFundraisingDealView, FundraisingController.getChecklist);
router.patch("/deals/:dealId/checklist", requireFundraisingDealView, requireFundraisingEdit, FundraisingController.patchChecklist);
router.get("/deals/:dealId/interactions", requireFundraisingDealView, FundraisingController.listInteractions);
router.post("/deals/:dealId/interactions", requireFundraisingDealView, requireFundraisingEdit, FundraisingController.createInteraction);
router.get("/deals/:dealId/agreement", requireFundraisingDealView, FundraisingController.getAgreement);
router.post(
  "/deals/:dealId/agreement/upload",
  requireFundraisingDealView,
  requireFundraisingClose,
  upload.single("file"),
  FundraisingController.uploadAgreement
);
router.post("/deals/:dealId/close", requireFundraisingDealView, requireFundraisingClose, FundraisingController.closeDeal);

export default router;
