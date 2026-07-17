// @ts-nocheck
/**
 * Canonical Fundraising & IR API — `/api/fundraising/*`
 * Legacy deal routes kept under `/deals/*` for migration/compat only (deprecated for new FE).
 */
import { Router, Response, NextFunction } from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import {
  FundraisingRequest,
  requireFundraisingView,
  requireFundraisingDealView,
  requireFundraisingEdit,
  requireFundraisingMail,
  requireFundraisingClose,
} from "../middleware/fundraisingAuth";
import { FundraisingAccessService } from "../services/fundraising/FundraisingAccessService";
import { FundraisingController } from "../controllers/FundraisingController";
import { FundraisingIrController } from "../controllers/FundraisingIrController";
import { FundraisingSrdController } from "../controllers/FundraisingSrdController";
import { prisma } from "../utils/database";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticate);

async function requireIrOpportunityView(req: FundraisingRequest, res: Response, next: NextFunction) {
  try {
    const opportunityId = req.params.opportunityId;
    if (!opportunityId) return res.status(400).json({ success: false, message: "opportunityId required" });
    const opp = await prisma.fundraisingOpportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, campaignId: true },
    });
    if (!opp) {
      return res.status(404).json({
        success: false,
        error: { code: "OPPORTUNITY_NOT_FOUND", message: "Opportunity not found" },
      });
    }
    await FundraisingAccessService.assertCanView(req.user, opp.campaignId);
    req.campaignId = opp.campaignId;
    next();
  } catch (e: any) {
    next(e);
  }
}

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

// ── Dashboard (IR) ──────────────────────────────────────────────
router.get("/dashboard", FundraisingIrController.executiveDashboard);

// ── Campaigns (IR canonical — draft → activate) ─────────────────
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
router.get(
  "/campaigns/:campaignId/board",
  requireFundraisingView,
  FundraisingSrdController.getOpportunityBoard
);
router.get(
  "/campaigns/:campaignId/metrics",
  requireFundraisingView,
  FundraisingSrdController.getCampaignMetrics
);
router.get(
  "/campaigns/:campaignId/templates",
  requireFundraisingView,
  FundraisingSrdController.listCampaignTemplates
);
router.post(
  "/campaigns/:campaignId/templates",
  requireFundraisingView,
  requireFundraisingEdit,
  FundraisingSrdController.createCampaignTemplate
);
router.get(
  "/campaigns/:campaignId/distribution-lists",
  requireFundraisingView,
  FundraisingSrdController.listCampaignDistributionLists
);
router.post(
  "/campaigns/:campaignId/distribution-lists",
  requireFundraisingView,
  requireFundraisingEdit,
  FundraisingSrdController.createCampaignDistributionList
);
router.get(
  "/campaigns/:campaignId/events",
  requireFundraisingView,
  FundraisingSrdController.listCampaignEvents
);
router.post(
  "/campaigns/:campaignId/events",
  requireFundraisingView,
  requireFundraisingEdit,
  FundraisingSrdController.createCampaignEvent
);
router.get(
  "/campaigns/:campaignId/materials",
  requireFundraisingView,
  FundraisingSrdController.listCampaignMaterials
);
router.post(
  "/campaigns/:campaignId/materials",
  requireFundraisingView,
  requireFundraisingEdit,
  upload.single("file"),
  FundraisingSrdController.createCampaignMaterial
);
router.post(
  "/campaigns/:campaignId/submit-for-approval",
  requireFundraisingView,
  requireFundraisingEdit,
  FundraisingSrdController.submitCampaignForApproval
);
router.post(
  "/campaigns/:campaignId/pause",
  requireFundraisingView,
  requireFundraisingEdit,
  FundraisingSrdController.pauseCampaign
);

// ── Opportunities ───────────────────────────────────────────────
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
router.post(
  "/opportunities/:opportunityId/set-status",
  requireIrOpportunityView,
  requireFundraisingEdit,
  FundraisingSrdController.setOpportunityStatus
);
router.get(
  "/opportunities/:opportunityId/timeline",
  requireIrOpportunityView,
  FundraisingIrController.opportunityTimeline
);
router.get(
  "/opportunities/:opportunityId/checklist",
  requireIrOpportunityView,
  FundraisingSrdController.getOpportunityChecklist
);
router.patch(
  "/opportunities/:opportunityId/checklist",
  requireIrOpportunityView,
  requireFundraisingEdit,
  FundraisingSrdController.patchOpportunityChecklist
);

// ── Communications ──────────────────────────────────────────────
router.get("/communications", FundraisingSrdController.listCommunications);
router.post("/communications", requireFundraisingEdit, FundraisingSrdController.createCommunication);
router.get("/communications/:communicationId", FundraisingSrdController.getCommunication);

// ── Tasks (fundraising-scoped Performance Task mirror metadata) ─
router.get("/tasks", FundraisingSrdController.listTasks);
router.post("/tasks", requireFundraisingEdit, FundraisingSrdController.createTask);
router.patch("/tasks/:taskId", requireFundraisingEdit, FundraisingSrdController.patchTask);

// ── Commitments & Closings ──────────────────────────────────────
router.get("/commitments", FundraisingSrdController.listCommitments);
router.post("/commitments", requireFundraisingEdit, FundraisingSrdController.createCommitment);
router.get("/commitments/:commitmentId", FundraisingSrdController.getCommitment);
router.patch("/commitments/:commitmentId", requireFundraisingEdit, FundraisingSrdController.patchCommitment);
router.post(
  "/commitments/:commitmentId/admit",
  requireFundraisingClose,
  FundraisingSrdController.admitCommitment
);
router.post(
  "/commitments/:commitmentId/fund",
  requireFundraisingClose,
  FundraisingSrdController.fundCommitment
);

router.get("/closings", FundraisingSrdController.listClosings);
router.post("/closings", requireFundraisingEdit, FundraisingSrdController.createClosing);
router.get("/closings/:closingId", FundraisingSrdController.getClosing);
router.patch("/closings/:closingId", requireFundraisingEdit, FundraisingSrdController.patchClosing);
router.post(
  "/closings/:closingId/readiness",
  requireFundraisingEdit,
  FundraisingSrdController.updateClosingReadiness
);

// ── Mandates & RFPs ─────────────────────────────────────────────
router.get("/mandates", FundraisingSrdController.listMandates);
router.post("/mandates", requireFundraisingEdit, FundraisingSrdController.createMandate);
router.get("/mandates/:mandateId", FundraisingSrdController.getMandate);
router.patch("/mandates/:mandateId", requireFundraisingEdit, FundraisingSrdController.patchMandate);
router.post(
  "/mandates/:mandateId/activate",
  requireFundraisingEdit,
  FundraisingSrdController.activateMandate
);

router.get("/rfps", FundraisingSrdController.listRfps);
router.post("/rfps", requireFundraisingEdit, FundraisingSrdController.createRfp);
router.get("/rfps/:rfpId", FundraisingSrdController.getRfp);
router.patch("/rfps/:rfpId", requireFundraisingEdit, FundraisingSrdController.patchRfp);
router.post(
  "/rfps/:rfpId/convert-to-mandate",
  requireFundraisingEdit,
  FundraisingSrdController.convertRfpToMandate
);
router.get("/rfps/:rfpId/proposal-versions", FundraisingSrdController.listRfpProposalVersions);
router.post(
  "/rfps/:rfpId/proposal-versions",
  requireFundraisingEdit,
  upload.single("file"),
  FundraisingSrdController.createRfpProposalVersion
);

// ── Commercial terms & approvals ────────────────────────────────
router.get(
  "/opportunities/:opportunityId/commercial-terms",
  requireIrOpportunityView,
  FundraisingSrdController.getCommercialTerms
);
router.put(
  "/opportunities/:opportunityId/commercial-terms",
  requireIrOpportunityView,
  requireFundraisingEdit,
  FundraisingSrdController.upsertCommercialTerms
);
router.get("/approvals", FundraisingSrdController.listApprovals);
router.post("/approvals", requireFundraisingEdit, FundraisingSrdController.createApprovalRequest);
router.get("/approvals/:approvalId/history", FundraisingSrdController.getApprovalHistory);
router.post("/approvals/:approvalId/decide", requireFundraisingEdit, FundraisingSrdController.decideApproval);

// ── DDQ / Due Diligence ─────────────────────────────────────────
router.get("/ddq/templates", FundraisingSrdController.listDdqTemplates);
router.post("/ddq/templates", requireFundraisingEdit, FundraisingSrdController.createDdqTemplate);
router.get("/ddq/cases", FundraisingSrdController.listDdqCases);
router.post("/ddq/cases", requireFundraisingEdit, FundraisingSrdController.createDdqCase);
router.get("/ddq/cases/:caseId", FundraisingSrdController.getDdqCase);
router.patch("/ddq/cases/:caseId", requireFundraisingEdit, FundraisingSrdController.patchDdqCase);
router.patch(
  "/ddq/cases/:caseId/items/:itemId",
  requireFundraisingEdit,
  FundraisingSrdController.patchDdqItem
);
router.get("/ddq/cases/:caseId/questions", FundraisingSrdController.listDdqQuestions);
router.post("/ddq/cases/:caseId/questions", requireFundraisingEdit, FundraisingSrdController.createDdqQuestion);
router.get("/ddq/cases/:caseId/export", FundraisingSrdController.exportDdqCaseCsv);
router.get("/ddq/answer-library", FundraisingSrdController.listDdqAnswerLibrary);
router.post("/ddq/answer-library", requireFundraisingEdit, FundraisingSrdController.createDdqAnswerLibraryEntry);
router.get("/ddq/cases/:caseId/items/:itemId/comments", FundraisingSrdController.listDdqItemComments);
router.post(
  "/ddq/cases/:caseId/items/:itemId/comments",
  requireFundraisingEdit,
  FundraisingSrdController.createDdqItemComment
);
router.post(
  "/ddq/cases/:caseId/items/:itemId/evidence",
  requireFundraisingEdit,
  upload.single("file"),
  FundraisingSrdController.uploadDdqEvidence
);
router.get(
  "/ddq/cases/:caseId/items/:itemId/evidence/:evidenceId/download",
  FundraisingSrdController.downloadDdqEvidence
);

// ── KYC cases ───────────────────────────────────────────────────
router.get("/kyc-cases", FundraisingSrdController.listKycCases);
router.post("/kyc-cases", requireFundraisingEdit, FundraisingSrdController.createKycCase);
router.get("/kyc-cases/:caseId", FundraisingSrdController.getKycCase);
router.patch("/kyc-cases/:caseId", requireFundraisingEdit, FundraisingSrdController.patchKycCase);

// ── Data rooms ──────────────────────────────────────────────────
router.get(
  "/campaigns/:campaignId/data-rooms",
  requireFundraisingView,
  FundraisingSrdController.listDataRooms
);
router.post(
  "/campaigns/:campaignId/data-rooms",
  requireFundraisingView,
  requireFundraisingEdit,
  FundraisingSrdController.createDataRoom
);
router.get("/data-rooms/:dataRoomId", FundraisingSrdController.getDataRoom);
router.patch("/data-rooms/:dataRoomId", requireFundraisingEdit, FundraisingSrdController.patchDataRoom);
router.post(
  "/data-rooms/:dataRoomId/folders",
  requireFundraisingEdit,
  FundraisingSrdController.createDataRoomFolder
);
router.post(
  "/data-rooms/:dataRoomId/documents",
  requireFundraisingEdit,
  upload.single("file"),
  FundraisingSrdController.uploadDataRoomDocument
);
router.get(
  "/data-rooms/:dataRoomId/documents/:documentId/download",
  FundraisingSrdController.downloadDataRoomDocument
);
router.post(
  "/data-rooms/:dataRoomId/access",
  requireFundraisingEdit,
  FundraisingSrdController.grantDataRoomAccess
);
router.delete(
  "/data-rooms/:dataRoomId/access/:accessId",
  requireFundraisingEdit,
  FundraisingSrdController.revokeDataRoomAccess
);

// ── Agreements / e-sign ─────────────────────────────────────────
router.get("/agreements", FundraisingSrdController.listAgreements);
router.post("/agreements", requireFundraisingEdit, FundraisingSrdController.createAgreement);
router.get("/agreements/:agreementId", FundraisingSrdController.getAgreement);
router.post(
  "/agreements/:agreementId/versions",
  requireFundraisingEdit,
  upload.single("file"),
  FundraisingSrdController.uploadAgreementVersion
);
router.post(
  "/agreements/:agreementId/signatories",
  requireFundraisingEdit,
  FundraisingSrdController.addAgreementSignatory
);
router.post(
  "/agreements/:agreementId/signatories/:signatoryId/sign",
  requireFundraisingEdit,
  FundraisingSrdController.signAgreement
);
router.post("/agreements/:agreementId/send", requireFundraisingEdit, FundraisingSrdController.sendAgreement);
router.post(
  "/agreements/:agreementId/signatories/:signatoryId/decline",
  requireFundraisingEdit,
  FundraisingSrdController.declineAgreementSignatory
);
router.get("/agreements/:agreementId/signed-copy", FundraisingSrdController.getAgreementSignedCopy);
router.get("/agreements/:agreementId/certificate", FundraisingSrdController.getAgreementCertificate);

// ── Placement agents ────────────────────────────────────────────
router.get("/placement-agents", FundraisingSrdController.listPlacementAgents);
router.post("/placement-agents", requireFundraisingEdit, FundraisingSrdController.createPlacementAgent);
router.get("/placement-agents/:agentId", FundraisingSrdController.getPlacementAgent);
router.patch("/placement-agents/:agentId", requireFundraisingEdit, FundraisingSrdController.patchPlacementAgent);
router.post(
  "/placement-agents/:agentId/assign-opportunity",
  requireFundraisingEdit,
  FundraisingSrdController.assignPlacementOpportunity
);
router.post(
  "/placement-agents/:agentId/commissions/pay",
  requireFundraisingEdit,
  FundraisingSrdController.payPlacementCommission
);
router.post(
  "/placement-agents/:agentId/commissions/:commissionId/pay",
  requireFundraisingEdit,
  FundraisingSrdController.payPlacementCommissionEntry
);
router.get("/placement-agents/:agentId/commissions", FundraisingSrdController.getAgentCommissions);
router.get(
  "/placement-agents/:agentId/exclusions",
  FundraisingSrdController.listAgentPlacementExclusions
);
router.post(
  "/placement-agents/:agentId/exclusions",
  requireFundraisingEdit,
  FundraisingSrdController.createAgentPlacementExclusion
);
router.delete(
  "/placement-agents/:agentId/exclusions/:exclusionId",
  requireFundraisingEdit,
  FundraisingSrdController.deletePlacementExclusion
);
router.delete(
  "/placement-agents/:agentId/opportunities/:opportunityId",
  requireFundraisingEdit,
  FundraisingSrdController.unassignAgentPlacementOpportunity
);
router.get("/placement-exclusions", FundraisingSrdController.listPlacementExclusions);
router.post("/placement-exclusions", requireFundraisingEdit, FundraisingSrdController.createPlacementExclusion);
router.delete(
  "/placement-exclusions/:exclusionId",
  requireFundraisingEdit,
  FundraisingSrdController.deletePlacementExclusion
);
router.post(
  "/placement-assignments/:assignmentId/unassign",
  requireFundraisingEdit,
  FundraisingSrdController.unassignPlacementOpportunity
);

// ── Forecasts / analytics / reports / audit ─────────────────────
router.get("/forecasts/scenarios", FundraisingSrdController.listForecastScenarios);
router.post("/forecasts/scenarios", requireFundraisingEdit, FundraisingSrdController.createForecastScenario);
router.get(
  "/forecasts/scenarios/:scenarioId/curve",
  FundraisingSrdController.getForecastScenarioCurve
);
router.post(
  "/forecasts/scenarios/:scenarioId/recalculate",
  requireFundraisingEdit,
  FundraisingSrdController.recalculateForecastScenario
);
router.get("/analytics/funnel", FundraisingSrdController.analyticsFunnel);
router.get("/analytics/source", FundraisingSrdController.analyticsSource);
router.get("/analytics/owner-performance", FundraisingSrdController.analyticsOwnerPerformance);
router.get("/analytics/stage-ageing", FundraisingSrdController.analyticsStageAgeing);
router.get("/analytics/concentration", FundraisingSrdController.analyticsConcentration);
router.get("/analytics/geography", FundraisingSrdController.analyticsGeography);
router.get("/reports", FundraisingSrdController.getReportCatalog);
router.get("/reports/jobs", FundraisingSrdController.listReportJobs);
router.post("/reports/jobs", requireFundraisingEdit, FundraisingSrdController.createReportJob);
router.get("/reports/jobs/:jobId", FundraisingSrdController.getReportJob);
router.get("/reports/schedules", FundraisingSrdController.listReportSchedules);
router.post("/reports/schedules", requireFundraisingEdit, FundraisingSrdController.createReportSchedule);
router.patch(
  "/reports/schedules/:scheduleId",
  requireFundraisingEdit,
  FundraisingSrdController.patchReportSchedule
);
router.delete(
  "/reports/schedules/:scheduleId",
  requireFundraisingEdit,
  FundraisingSrdController.deleteReportSchedule
);
router.get("/reports/history", FundraisingSrdController.listReportRunHistory);
router.post("/reports/:reportKey/run", requireFundraisingEdit, FundraisingSrdController.runReportJob);
router.get("/reports/:reportKey/history", FundraisingSrdController.getReportHistory);
router.get("/reports/:reportKey", FundraisingSrdController.runReport);
router.get("/audit-logs", FundraisingSrdController.listAuditLogs);
router.get("/audit-logs/export", FundraisingSrdController.exportAuditLogsCsv);
router.get("/contacts", FundraisingSrdController.listGlobalContacts);
router.post(
  "/investors/:investorId/compliance-hold",
  requireFundraisingEdit,
  FundraisingSrdController.placeInvestorComplianceHold
);
router.post(
  "/compliance-holds/:holdId/release",
  requireFundraisingEdit,
  FundraisingSrdController.releaseComplianceHold
);

// ── Settings (FE gaps) ──────────────────────────────────────────
router.get("/settings", FundraisingSrdController.getSettings);
router.patch("/settings", requireFundraisingEdit, FundraisingSrdController.patchSettings);
router.post(
  "/settings/pipelines/:pipelineKey/stages",
  requireFundraisingEdit,
  FundraisingSrdController.addPipelineStage
);
router.patch(
  "/settings/pipelines/:pipelineKey/stages/:stageId",
  requireFundraisingEdit,
  FundraisingSrdController.patchPipelineStage
);
router.delete(
  "/settings/pipelines/:pipelineKey/stages/:stageId",
  requireFundraisingEdit,
  FundraisingSrdController.deletePipelineStage
);
router.patch("/settings/stage-gates", requireFundraisingEdit, FundraisingSrdController.patchStageGates);
router.patch("/settings/amount-types", requireFundraisingEdit, FundraisingSrdController.patchAmountTypes);
router.patch(
  "/settings/notifications",
  requireFundraisingEdit,
  FundraisingSrdController.patchNotificationSettings
);

// ── Meetings ────────────────────────────────────────────────────
router.get("/meetings", FundraisingSrdController.listMeetings);
router.post("/meetings", requireFundraisingEdit, FundraisingSrdController.createMeeting);
router.get("/meetings/:meetingId", FundraisingSrdController.getMeeting);
router.patch("/meetings/:meetingId", requireFundraisingEdit, FundraisingSrdController.patchMeeting);
router.post(
  "/meetings/:meetingId/cancel",
  requireFundraisingEdit,
  FundraisingSrdController.cancelMeeting
);
router.post(
  "/meetings/:meetingId/complete",
  requireFundraisingEdit,
  FundraisingSrdController.completeMeeting
);

// ── Documents index ───────────────────────────────────────────────
router.get("/documents/export", FundraisingSrdController.exportDocumentsCsv);
router.get("/documents", FundraisingSrdController.listDocuments);
router.post(
  "/documents",
  requireFundraisingEdit,
  upload.single("file"),
  FundraisingSrdController.createDocument
);
router.get("/documents/:documentId/versions", FundraisingSrdController.getDocumentVersions);
router.post(
  "/documents/:documentId/versions",
  requireFundraisingEdit,
  upload.single("file"),
  FundraisingSrdController.uploadDocumentVersion
);
router.get(
  "/documents/:documentId/versions/:versionNumber/download",
  FundraisingSrdController.downloadDocumentVersion
);
router.get("/documents/:documentId", FundraisingSrdController.getDocument);
router.patch("/documents/:documentId", requireFundraisingEdit, FundraisingSrdController.patchDocument);
router.get("/documents/:documentId/download", FundraisingSrdController.downloadDocument);

// ── Campaign engagement ─────────────────────────────────────────
router.get(
  "/campaigns/:campaignId/engagement",
  requireFundraisingView,
  FundraisingSrdController.getCampaignEngagement
);

// ── Commitment closing checklist ────────────────────────────────
router.get("/commitments/:commitmentId/checklist", FundraisingSrdController.getCommitmentChecklist);
router.patch(
  "/commitments/:commitmentId/checklist/:itemId",
  requireFundraisingEdit,
  FundraisingSrdController.patchCommitmentChecklistItem
);

// ── Legacy deals (deprecated — migration/compat only) ───────────
router.post(
  "/campaigns/:campaignId/deals",
  requireFundraisingView,
  requireFundraisingEdit,
  FundraisingController.createDeal
);
router.post(
  "/campaigns/:campaignId/mailer/send",
  requireFundraisingView,
  requireFundraisingMail,
  FundraisingController.sendMailer
);
router.get("/deals/:dealId", requireFundraisingDealView, FundraisingController.getDeal);
router.patch("/deals/:dealId", requireFundraisingDealView, requireFundraisingEdit, FundraisingController.patchDeal);
router.patch(
  "/deals/:dealId/stage",
  requireFundraisingDealView,
  requireFundraisingEdit,
  FundraisingController.moveDealStage
);
router.get("/deals/:dealId/checklist", requireFundraisingDealView, FundraisingController.getChecklist);
router.patch(
  "/deals/:dealId/checklist",
  requireFundraisingDealView,
  requireFundraisingEdit,
  FundraisingController.patchChecklist
);
router.get("/deals/:dealId/interactions", requireFundraisingDealView, FundraisingController.listInteractions);
router.post(
  "/deals/:dealId/interactions",
  requireFundraisingDealView,
  requireFundraisingEdit,
  FundraisingController.createInteraction
);
router.get("/deals/:dealId/agreement", requireFundraisingDealView, FundraisingController.getAgreement);
router.post(
  "/deals/:dealId/agreement/upload",
  requireFundraisingDealView,
  requireFundraisingClose,
  upload.single("file"),
  FundraisingController.uploadAgreement
);
router.post(
  "/deals/:dealId/close",
  requireFundraisingDealView,
  requireFundraisingClose,
  FundraisingController.closeDeal
);

export default router;
