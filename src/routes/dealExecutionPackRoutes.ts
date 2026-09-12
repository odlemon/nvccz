// @ts-nocheck
import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";
import {
  requireDealExecutionPackEdit,
  requireDealExecutionPackExecute,
  requireDealExecutionPackView,
} from "../middleware/dealExecutionPackAuth";
import { DealExecutionPackController } from "../controllers/DealExecutionPackController";

const router = Router();
const gpRoles = ["admin", "fund_manager", "cfo", "analyst"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.use(authenticate);
router.use(authorize(gpRoles));

router.get("/", DealExecutionPackController.list);
router.post("/", requireDealExecutionPackEdit, DealExecutionPackController.create);

router.get("/:packId", requireDealExecutionPackView, DealExecutionPackController.get);
router.get("/:packId/dashboard", requireDealExecutionPackView, DealExecutionPackController.dashboard);
router.get("/:packId/documents", requireDealExecutionPackView, DealExecutionPackController.listDocuments);
router.post(
  "/:packId/documents/:slotCode/upload",
  requireDealExecutionPackView,
  requireDealExecutionPackEdit,
  upload.single("document"),
  DealExecutionPackController.uploadDocument
);
router.get(
  "/:packId/documents/:documentId/verify",
  requireDealExecutionPackView,
  DealExecutionPackController.verifyDocument
);
router.get(
  "/:packId/documents/:documentId/download",
  requireDealExecutionPackView,
  DealExecutionPackController.downloadDocument
);

router.get("/:packId/cps", requireDealExecutionPackView, DealExecutionPackController.listCps);
router.post(
  "/:packId/cps",
  requireDealExecutionPackView,
  requireDealExecutionPackEdit,
  DealExecutionPackController.createCp
);
router.patch(
  "/:packId/cps/:cpId",
  requireDealExecutionPackView,
  requireDealExecutionPackEdit,
  DealExecutionPackController.updateCp
);
router.post("/:packId/cps/:cpId/satisfy", requireDealExecutionPackView, DealExecutionPackController.satisfyCp);

router.get("/:packId/signatures", requireDealExecutionPackView, DealExecutionPackController.listSignatures);
router.post("/:packId/signatures/:signatureId/sign", requireDealExecutionPackView, DealExecutionPackController.sign);

router.post(
  "/:packId/execute",
  requireDealExecutionPackView,
  requireDealExecutionPackExecute,
  DealExecutionPackController.execute
);

router.get("/:packId/audit", requireDealExecutionPackView, DealExecutionPackController.audit);

export default router;
