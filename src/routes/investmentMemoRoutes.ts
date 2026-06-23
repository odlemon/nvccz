// @ts-nocheck
import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import {
  requireInvestmentMemoView,
  requireInvestmentMemoEdit,
  requireInvestmentMemoCio,
} from "../middleware/investmentMemoAuth";
import { InvestmentMemoController } from "../controllers/InvestmentMemoController";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticate);

router.get("/:applicationId", requireInvestmentMemoView, InvestmentMemoController.getMemo);
router.get("/:applicationId/versions", requireInvestmentMemoView, InvestmentMemoController.listVersions);
router.get(
  "/:applicationId/versions/:versionId",
  requireInvestmentMemoView,
  InvestmentMemoController.getVersion
);
router.get(
  "/:applicationId/versions/:versionId/validate",
  requireInvestmentMemoView,
  InvestmentMemoController.validateVersion
);
router.get(
  "/:applicationId/approval-history",
  requireInvestmentMemoView,
  InvestmentMemoController.approvalHistory
);

router.post(
  "/:applicationId/versions",
  requireInvestmentMemoEdit,
  InvestmentMemoController.createVersion
);
router.put(
  "/:applicationId/versions/:versionId",
  requireInvestmentMemoEdit,
  InvestmentMemoController.saveDraft
);
router.post(
  "/:applicationId/versions/:versionId/submit",
  requireInvestmentMemoEdit,
  InvestmentMemoController.submit
);
router.post(
  "/:applicationId/versions/:versionId/attachment",
  requireInvestmentMemoEdit,
  upload.single("file"),
  InvestmentMemoController.uploadAttachment
);

router.post(
  "/:applicationId/versions/:versionId/approve",
  requireInvestmentMemoCio,
  InvestmentMemoController.approve
);
router.post(
  "/:applicationId/versions/:versionId/reject",
  requireInvestmentMemoCio,
  InvestmentMemoController.reject
);

export default router;
