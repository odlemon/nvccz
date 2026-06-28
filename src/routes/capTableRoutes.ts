// @ts-nocheck
import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import {
  requireCapTableView,
  requireCapTableConfigure,
  requireCapTableEditTx,
  requireCapTableApprove,
  requireCapTableAdmin,
} from "../middleware/capTableAuth";
import { CapTableController } from "../controllers/CapTableController";

const router = Router();

router.use(authenticate);

router.get("/registries", CapTableController.listRegistries);
router.post("/registries", CapTableController.bootstrapRegistry);

router.get("/registries/:portfolioCompanyId", requireCapTableView, CapTableController.getRegistry);
router.get("/registries/:portfolioCompanyId/register", requireCapTableView, CapTableController.getRegister);

router.get("/registries/:portfolioCompanyId/share-classes", requireCapTableView, CapTableController.listShareClasses);
router.post(
  "/registries/:portfolioCompanyId/share-classes",
  requireCapTableConfigure,
  CapTableController.createShareClass
);
router.patch(
  "/registries/:portfolioCompanyId/share-classes/:shareClassId",
  requireCapTableConfigure,
  CapTableController.patchShareClass
);

router.get("/registries/:portfolioCompanyId/stakeholders", requireCapTableView, CapTableController.listStakeholders);
router.post(
  "/registries/:portfolioCompanyId/stakeholders",
  requireCapTableConfigure,
  CapTableController.createStakeholder
);
router.patch(
  "/registries/:portfolioCompanyId/stakeholders/:stakeholderId",
  requireCapTableConfigure,
  CapTableController.patchStakeholder
);

router.get("/registries/:portfolioCompanyId/convertibles", requireCapTableView, CapTableController.listConvertibles);
router.post(
  "/registries/:portfolioCompanyId/convertibles",
  requireCapTableEditTx,
  CapTableController.createConvertible
);

router.get("/registries/:portfolioCompanyId/transactions", requireCapTableView, CapTableController.listTransactions);
router.post(
  "/registries/:portfolioCompanyId/transactions/issuance",
  requireCapTableEditTx,
  CapTableController.createIssuance
);
router.post(
  "/registries/:portfolioCompanyId/transactions/transfer",
  requireCapTableEditTx,
  CapTableController.createTransfer
);
router.post(
  "/registries/:portfolioCompanyId/transactions/:transactionId/submit",
  requireCapTableEditTx,
  CapTableController.submitTransaction
);
router.post(
  "/registries/:portfolioCompanyId/transactions/:transactionId/approve",
  requireCapTableApprove,
  CapTableController.approveTransaction
);
router.post(
  "/registries/:portfolioCompanyId/transactions/:transactionId/reject",
  requireCapTableApprove,
  CapTableController.rejectTransaction
);
router.post(
  "/registries/:portfolioCompanyId/transactions/:transactionId/execute",
  requireCapTableApprove,
  CapTableController.executeTransaction
);

router.post("/registries/:portfolioCompanyId/simulator/run", requireCapTableView, CapTableController.runSimulator);
router.post(
  "/registries/:portfolioCompanyId/waterfall/evaluate",
  requireCapTableView,
  CapTableController.evaluateWaterfall
);

router.get(
  "/registries/:portfolioCompanyId/transactions/:transactionId/certificate",
  requireCapTableView,
  CapTableController.downloadCertificate
);
router.get(
  "/registries/:portfolioCompanyId/transactions/:transactionId/certificate/verify",
  requireCapTableView,
  CapTableController.verifyCertificate
);

/** Placeholder — Deal Execution Pack (Section 3.11) */
router.post(
  "/integrations/deal-execution/closed",
  requireCapTableAdmin,
  CapTableController.dealExecutionClosed
);

export default router;
