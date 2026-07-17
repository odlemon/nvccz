// @ts-nocheck
import { Response, NextFunction } from "express";
import { FundraisingRequest } from "../middleware/fundraisingAuth";
import { FundraisingIrError } from "../services/fundraising/FundraisingIrError";
import { FundraisingSrdService } from "../services/fundraising/FundraisingSrdService";
import { FundraisingIrInvestorService } from "../services/fundraising/FundraisingIrInvestorService";
import { FundraisingFeGapsService } from "../services/fundraising/FundraisingFeGapsService";
import { FundraisingRequirementsService } from "../services/fundraising/FundraisingRequirementsService";
import { remoteUploadService } from "../services/RemoteUploadService";

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

function sendCsv(res: Response, csv: string, filename: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${String(filename).replace(/"/g, "")}"`);
  res.send(csv);
}

function wrap(handler: (req: FundraisingRequest, res: Response) => Promise<any>) {
  return async (req: FundraisingRequest, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (e) {
      try {
        sendError(res, e);
      } catch (err) {
        next(err);
      }
    }
  };
}

export class FundraisingSrdController {
  static getOpportunityBoard = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getOpportunityBoard(req.params.campaignId);
    res.json({ success: true, data });
  });

  static getCampaignMetrics = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getCampaignMetrics(req.params.campaignId);
    res.json({ success: true, data });
  });

  static setOpportunityStatus = wrap(async (req, res) => {
    const data = await FundraisingSrdService.setOpportunityStatus(
      req.user!.id,
      req.params.opportunityId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static getOpportunityChecklist = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getOpportunityChecklist(
      req.params.opportunityId,
      req.query.stageId as string | undefined
    );
    res.json({ success: true, data });
  });

  static patchOpportunityChecklist = wrap(async (req, res) => {
    const data = await FundraisingSrdService.patchOpportunityChecklist(
      req.user!.id,
      req.params.opportunityId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static listCommunications = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listCommunications({
      campaignId: req.query.campaignId as string | undefined,
      opportunityId: req.query.opportunityId as string | undefined,
      investorId: req.query.investorId as string | undefined,
      external: req.query.external as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createCommunication = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createCommunication(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static getCommunication = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getCommunication(req.params.communicationId);
    res.json({ success: true, data });
  });

  static listTasks = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listTasks({
      campaignId: req.query.campaignId as string | undefined,
      opportunityId: req.query.opportunityId as string | undefined,
      investorId: req.query.investorId as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createTask = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createTask(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static patchTask = wrap(async (req, res) => {
    const data = await FundraisingSrdService.patchTask(req.user!.id, req.params.taskId, req.body, req);
    res.json({ success: true, data });
  });

  static listCommitments = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listCommitments({
      campaignId: req.query.campaignId as string | undefined,
      opportunityId: req.query.opportunityId as string | undefined,
      investorId: req.query.investorId as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createCommitment = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createCommitment(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static getCommitment = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getCommitment(req.params.commitmentId);
    res.json({ success: true, data });
  });

  static patchCommitment = wrap(async (req, res) => {
    const data = await FundraisingSrdService.patchCommitment(
      req.user!.id,
      req.params.commitmentId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static admitCommitment = wrap(async (req, res) => {
    const data = await FundraisingSrdService.admitCommitment(
      req.user!.id,
      req.params.commitmentId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static fundCommitment = wrap(async (req, res) => {
    const data = await FundraisingSrdService.fundCommitment(
      req.user!.id,
      req.params.commitmentId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static listClosings = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listClosings({
      campaignId: req.query.campaignId as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createClosing = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createClosing(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static getClosing = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getClosing(req.params.closingId);
    res.json({ success: true, data });
  });

  static patchClosing = wrap(async (req, res) => {
    const data = await FundraisingSrdService.patchClosing(
      req.user!.id,
      req.params.closingId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static updateClosingReadiness = wrap(async (req, res) => {
    const data = await FundraisingSrdService.updateClosingReadiness(
      req.user!.id,
      req.params.closingId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static listMandates = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listMandates({
      campaignId: req.query.campaignId as string | undefined,
      investorId: req.query.investorId as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createMandate = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createMandate(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static getMandate = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getMandate(req.params.mandateId);
    res.json({ success: true, data });
  });

  static patchMandate = wrap(async (req, res) => {
    const data = await FundraisingSrdService.patchMandate(
      req.user!.id,
      req.params.mandateId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static activateMandate = wrap(async (req, res) => {
    const data = await FundraisingSrdService.activateMandate(
      req.user!.id,
      req.params.mandateId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static listRfps = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listRfps({
      campaignId: req.query.campaignId as string | undefined,
      investorId: req.query.investorId as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createRfp = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createRfp(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static getRfp = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getRfp(req.params.rfpId);
    res.json({ success: true, data });
  });

  static patchRfp = wrap(async (req, res) => {
    const data = await FundraisingSrdService.patchRfp(req.user!.id, req.params.rfpId, req.body, req);
    res.json({ success: true, data });
  });

  static convertRfpToMandate = wrap(async (req, res) => {
    const data = await FundraisingSrdService.convertRfpToMandate(
      req.user!.id,
      req.params.rfpId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static getCommercialTerms = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getCommercialTerms(req.params.opportunityId);
    res.json({ success: true, data });
  });

  static upsertCommercialTerms = wrap(async (req, res) => {
    const data = await FundraisingSrdService.upsertCommercialTerms(
      req.user!.id,
      req.params.opportunityId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static listApprovals = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listApprovals({
      status: req.query.status as string | undefined,
      objectType: req.query.objectType as string | undefined,
    });
    res.json({ success: true, data });
  });

  static decideApproval = wrap(async (req, res) => {
    const data = await FundraisingSrdService.decideApproval(
      req.user!.id,
      req.params.approvalId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static listDdqTemplates = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listDdqTemplates({
      category: req.query.category as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createDdqTemplate = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createDdqTemplate(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static listDdqCases = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listDdqCases({
      investorId: req.query.investorId as string | undefined,
      campaignId: req.query.campaignId as string | undefined,
      opportunityId: req.query.opportunityId as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createDdqCase = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createDdqCase(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static getDdqCase = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getDdqCase(req.params.caseId);
    res.json({ success: true, data });
  });

  static patchDdqCase = wrap(async (req, res) => {
    const data = await FundraisingSrdService.patchDdqCase(
      req.user!.id,
      req.params.caseId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static uploadDdqEvidence = wrap(async (req, res) => {
    const data = await FundraisingSrdService.uploadDdqEvidence(
      req.user!.id,
      req.params.caseId,
      req.params.itemId,
      (req as any).file,
      req
    );
    res.json({ success: true, data });
  });

  static listKycCases = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listKycCases({
      investorId: req.query.investorId as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createKycCase = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createKycCase(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static getKycCase = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getKycCase(req.params.caseId);
    res.json({ success: true, data });
  });

  static patchKycCase = wrap(async (req, res) => {
    const data = await FundraisingSrdService.patchKycCase(
      req.user!.id,
      req.params.caseId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static listDataRooms = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listDataRooms(req.params.campaignId);
    res.json({ success: true, data });
  });

  static createDataRoom = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createDataRoom(
      req.user!.id,
      req.params.campaignId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static getDataRoom = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getDataRoom(req.params.dataRoomId);
    res.json({ success: true, data });
  });

  static createDataRoomFolder = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createDataRoomFolder(
      req.user!.id,
      req.params.dataRoomId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static uploadDataRoomDocument = wrap(async (req, res) => {
    const data = await FundraisingSrdService.uploadDataRoomDocument(
      req.user!.id,
      req.params.dataRoomId,
      req.body,
      (req as any).file,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static downloadDataRoomDocument = wrap(async (req, res) => {
    const { buffer, fileName, mimeType } = await FundraisingSrdService.downloadDataRoomDocument(
      req.user!.id,
      req.params.dataRoomId,
      req.params.documentId,
      req
    );
    res.setHeader("Content-Type", mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${String(fileName).replace(/"/g, "")}"`);
    res.send(buffer);
  });

  static grantDataRoomAccess = wrap(async (req, res) => {
    const data = await FundraisingSrdService.grantDataRoomAccess(
      req.user!.id,
      req.params.dataRoomId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static listAgreements = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listAgreements({
      campaignId: req.query.campaignId as string | undefined,
      opportunityId: req.query.opportunityId as string | undefined,
      investorId: req.query.investorId as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createAgreement = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createAgreement(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static getAgreement = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getAgreement(req.params.agreementId);
    res.json({ success: true, data });
  });

  static uploadAgreementVersion = wrap(async (req, res) => {
    const data = await FundraisingSrdService.uploadAgreementVersion(
      req.user!.id,
      req.params.agreementId,
      (req as any).file,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static addAgreementSignatory = wrap(async (req, res) => {
    const data = await FundraisingSrdService.addAgreementSignatory(
      req.user!.id,
      req.params.agreementId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static signAgreement = wrap(async (req, res) => {
    const data = await FundraisingSrdService.signAgreement(
      req.user!.id,
      req.params.agreementId,
      req.params.signatoryId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static listPlacementAgents = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listPlacementAgents({
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createPlacementAgent = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createPlacementAgent(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static getPlacementAgent = wrap(async (req, res) => {
    const data = await FundraisingSrdService.getPlacementAgent(req.params.agentId);
    res.json({ success: true, data });
  });

  static patchPlacementAgent = wrap(async (req, res) => {
    const data = await FundraisingSrdService.patchPlacementAgent(
      req.user!.id,
      req.params.agentId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static assignPlacementOpportunity = wrap(async (req, res) => {
    const data = await FundraisingSrdService.assignPlacementOpportunity(
      req.user!.id,
      req.params.agentId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static listForecastScenarios = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listForecastScenarios({
      campaignId: req.query.campaignId as string | undefined,
      scenarioType: req.query.scenarioType as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createForecastScenario = wrap(async (req, res) => {
    const data = await FundraisingSrdService.createForecastScenario(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static analyticsFunnel = wrap(async (req, res) => {
    const data = await FundraisingSrdService.analyticsFunnel({
      campaignId: req.query.campaignId as string | undefined,
    });
    res.json({ success: true, data });
  });

  static analyticsSource = wrap(async (req, res) => {
    const data = await FundraisingSrdService.analyticsSource({
      campaignId: req.query.campaignId as string | undefined,
    });
    res.json({ success: true, data });
  });

  static analyticsOwnerPerformance = wrap(async (req, res) => {
    const data = await FundraisingSrdService.analyticsOwnerPerformance({
      campaignId: req.query.campaignId as string | undefined,
    });
    res.json({ success: true, data });
  });

  static analyticsStageAgeing = wrap(async (req, res) => {
    const data = await FundraisingSrdService.analyticsStageAgeing({
      campaignId: req.query.campaignId as string | undefined,
    });
    res.json({ success: true, data });
  });

  static runReport = wrap(async (req, res) => {
    const data = await FundraisingSrdService.runReport(req.params.reportKey, {
      campaignId: req.query.campaignId as string | undefined,
    });
    res.json({ success: true, data });
  });

  static listAuditLogs = wrap(async (req, res) => {
    const data = await FundraisingSrdService.listAuditLogs({
      objectType: req.query.objectType as string | undefined,
      objectId: req.query.objectId as string | undefined,
      userId: req.query.userId as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, data });
  });

  static investor360 = wrap(async (req, res) => {
    const data = await FundraisingSrdService.investor360(req.params.investorId);
    res.json({ success: true, data });
  });

  static patchInvestorContact = wrap(async (req, res) => {
    const data = await FundraisingIrInvestorService.patchContact(
      req.params.investorId,
      req.params.contactId,
      req.body
    );
    res.json({ success: true, data });
  });

  static archiveInvestorContact = wrap(async (req, res) => {
    const data = await FundraisingIrInvestorService.archiveContact(
      req.params.investorId,
      req.params.contactId
    );
    res.json({ success: true, data });
  });

  // ── Settings (FE gaps) ────────────────────────────────────────

  static getSettings = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.getSettings();
    res.json({ success: true, data });
  });

  static patchSettings = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.patchSettings(req.body);
    res.json({ success: true, data });
  });

  static addPipelineStage = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.addPipelineStage(req.params.pipelineKey, req.body);
    res.status(201).json({ success: true, data });
  });

  static patchPipelineStage = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.patchPipelineStage(
      req.params.pipelineKey,
      req.params.stageId,
      req.body
    );
    res.json({ success: true, data });
  });

  static deletePipelineStage = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.deletePipelineStage(
      req.params.pipelineKey,
      req.params.stageId
    );
    res.json({ success: true, data });
  });

  static patchStageGates = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.patchStageGates(req.body);
    res.json({ success: true, data });
  });

  static patchAmountTypes = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.patchAmountTypes(req.body);
    res.json({ success: true, data });
  });

  static patchNotificationSettings = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.patchNotifications(req.body);
    res.json({ success: true, data });
  });

  // ── Meetings ──────────────────────────────────────────────────

  static listMeetings = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.listMeetings({
      campaignId: req.query.campaignId as string | undefined,
      investorId: req.query.investorId as string | undefined,
      opportunityId: req.query.opportunityId as string | undefined,
      ownerId: req.query.ownerId as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      meetingType: req.query.meetingType as string | undefined,
      status: req.query.status as string | undefined,
      page: req.query.page as string | undefined,
      pageSize: req.query.pageSize as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createMeeting = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.createMeeting(req.user!.id, req.body);
    res.status(201).json({ success: true, data });
  });

  static getMeeting = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.getMeeting(req.params.meetingId);
    res.json({ success: true, data });
  });

  static patchMeeting = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.patchMeeting(req.params.meetingId, req.body);
    res.json({ success: true, data });
  });

  static cancelMeeting = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.cancelMeeting(req.params.meetingId, req.body);
    res.json({ success: true, data });
  });

  static completeMeeting = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.completeMeeting(
      req.user!.id,
      req.params.meetingId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  // ── Documents index ───────────────────────────────────────────

  static listDocuments = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.listDocuments({
      campaignId: req.query.campaignId as string | undefined,
      investorId: req.query.investorId as string | undefined,
      opportunityId: req.query.opportunityId as string | undefined,
      category: req.query.category as string | undefined,
      q: req.query.q as string | undefined,
      confidential: req.query.confidential as string | undefined,
      sourceType: req.query.sourceType as string | undefined,
      page: req.query.page as string | undefined,
      pageSize: req.query.pageSize as string | undefined,
    });
    res.json({ success: true, data });
  });

  static getDocument = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.getDocument(req.params.documentId);
    res.json({ success: true, data });
  });

  static createDocument = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.createDocument(
      req.user!.id,
      req.body,
      (req as any).file
    );
    res.status(201).json({ success: true, data });
  });

  static patchDocument = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.patchDocument(req.params.documentId, req.body);
    res.json({ success: true, data });
  });

  static downloadDocument = wrap(async (req, res) => {
    const version = req.query.version ? Number(req.query.version) : undefined;
    const { buffer, fileName, mimeType } = await FundraisingFeGapsService.downloadDocument(
      req.user!.id,
      req.params.documentId,
      version
    );
    res.setHeader("Content-Type", mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${String(fileName).replace(/"/g, "")}"`);
    res.send(buffer);
  });

  // ── Engagement / forecast curve / commissions / commitment checklist ─

  static getCampaignEngagement = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.getCampaignEngagement(req.params.campaignId);
    res.json({ success: true, data });
  });

  static getForecastScenarioCurve = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.getForecastScenarioCurve(req.params.scenarioId);
    res.json({ success: true, data });
  });

  static getAgentCommissions = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.getAgentCommissions(req.params.agentId);
    res.json({ success: true, data });
  });

  static getCommitmentChecklist = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.getCommitmentChecklist(req.params.commitmentId);
    res.json({ success: true, data });
  });

  static patchCommitmentChecklistItem = wrap(async (req, res) => {
    const data = await FundraisingFeGapsService.patchCommitmentChecklistItem(
      req.user!.id,
      req.params.commitmentId,
      req.params.itemId,
      req.body
    );
    res.json({ success: true, data });
  });

  // ── Requirements gaps 10–24 ───────────────────────────────────

  static listGlobalContacts = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listGlobalContacts({
      q: req.query.q as string | undefined,
      investorId: req.query.investorId as string | undefined,
      status: req.query.status as string | undefined,
      decisionInfluence: req.query.decisionInfluence as string | undefined,
      campaignId: req.query.campaignId as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
    res.json({ success: true, data });
  });

  static listCampaignTemplates = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listCampaignTemplates(req.params.campaignId);
    res.json({ success: true, data });
  });

  static createCampaignTemplate = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createCampaignTemplate(
      req.user!.id,
      req.params.campaignId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static listCampaignDistributionLists = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listCampaignDistributionLists(req.params.campaignId);
    res.json({ success: true, data });
  });

  static createCampaignDistributionList = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createCampaignDistributionList(
      req.user!.id,
      req.params.campaignId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static listCampaignEvents = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listCampaignEvents(req.params.campaignId);
    res.json({ success: true, data });
  });

  static createCampaignEvent = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createCampaignEvent(
      req.user!.id,
      req.params.campaignId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static listCampaignMaterials = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listCampaignMaterials(req.params.campaignId);
    res.json({ success: true, data });
  });

  static createCampaignMaterial = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createCampaignMaterial(
      req.user!.id,
      req.params.campaignId,
      req.body,
      (req as any).file,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static submitCampaignForApproval = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.submitCampaignForApproval(
      req.user!.id,
      req.params.campaignId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static pauseCampaign = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.pauseCampaign(
      req.user!.id,
      req.params.campaignId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static listRfpProposalVersions = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listRfpProposalVersions(req.params.rfpId);
    res.json({ success: true, data });
  });

  static createRfpProposalVersion = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createRfpProposalVersion(
      req.user!.id,
      req.params.rfpId,
      req.body,
      (req as any).file,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static patchDdqItem = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.patchDdqItem(
      req.user!.id,
      req.params.caseId,
      req.params.itemId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static listDdqQuestions = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listDdqQuestions(req.params.caseId, {
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createDdqQuestion = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createDdqQuestion(
      req.user!.id,
      req.params.caseId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static listDdqAnswerLibrary = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listDdqAnswerLibrary({
      category: req.query.category as string | undefined,
      q: req.query.q as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createDdqAnswerLibraryEntry = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createDdqAnswerLibraryEntry(
      req.user!.id,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static listDdqItemComments = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listDdqItemComments(
      req.params.caseId,
      req.params.itemId
    );
    res.json({ success: true, data });
  });

  static createDdqItemComment = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createDdqItemComment(
      req.user!.id,
      req.params.caseId,
      req.params.itemId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static downloadDdqEvidence = wrap(async (req, res) => {
    const { buffer, fileName, mimeType } = await FundraisingRequirementsService.downloadDdqEvidence(
      req.params.caseId,
      req.params.itemId,
      req.params.evidenceId
    );
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${String(fileName).replace(/"/g, "")}"`);
    res.send(buffer);
  });

  static exportDdqCaseCsv = wrap(async (req, res) => {
    const { csv } = await FundraisingRequirementsService.exportDdqCaseData(req.params.caseId);
    sendCsv(res, csv, `ddq-case-${req.params.caseId}.csv`);
  });

  static patchDataRoom = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.patchDataRoom(
      req.user!.id,
      req.params.dataRoomId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static revokeDataRoomAccess = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.revokeDataRoomAccess(
      req.user!.id,
      req.params.dataRoomId,
      req.params.accessId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static exportDocumentsCsv = wrap(async (req, res) => {
    const { csv } = await FundraisingRequirementsService.buildDocumentsCsvRows({
      campaignId: req.query.campaignId as string | undefined,
      investorId: req.query.investorId as string | undefined,
      category: req.query.category as string | undefined,
      sourceType: req.query.sourceType as string | undefined,
      q: req.query.q as string | undefined,
    });
    sendCsv(res, csv, "fundraising-documents.csv");
  });

  static getDocumentVersions = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.getDocumentVersionMetadata(req.params.documentId);
    res.json({ success: true, data });
  });

  static uploadDocumentVersion = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.uploadDocumentVersion(
      req.user!.id,
      req.params.documentId,
      req.body,
      (req as any).file,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static downloadDocumentVersion = wrap(async (req, res) => {
    const { buffer, fileName, mimeType } = await FundraisingFeGapsService.downloadDocument(
      req.user!.id,
      req.params.documentId,
      Number(req.params.versionNumber)
    );
    res.setHeader("Content-Type", mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${String(fileName).replace(/"/g, "")}"`);
    res.send(buffer);
  });

  static sendAgreement = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.sendAgreement(
      req.user!.id,
      req.params.agreementId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static declineAgreementSignatory = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.declineAgreementSignatory(
      req.user!.id,
      req.params.agreementId,
      req.params.signatoryId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static getAgreementSignedCopy = wrap(async (req, res) => {
    const result = await FundraisingRequirementsService.getAgreementProviderArtifact(req.params.agreementId);
    const artifacts = result.artifacts ?? [];
    const artifact =
      artifacts.find((a: any) => String(a.artifactType).toUpperCase() === "SIGNED_COPY") ?? artifacts[0];
    if (!artifact) {
      return res.json({ success: true, data: result });
    }
    if (artifact.storagePath) {
      const buffer = await remoteUploadService.downloadFile(artifact.storagePath);
      res.setHeader("Content-Type", artifact.mimeType || "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${String(artifact.fileName || "signed-copy.pdf").replace(/"/g, "")}"`
      );
      return res.send(buffer);
    }
    res.json({ success: true, data: { agreement: result.agreement, artifact } });
  });

  static getAgreementCertificate = wrap(async (req, res) => {
    const result = await FundraisingRequirementsService.getAgreementProviderArtifact(req.params.agreementId);
    const artifacts = result.artifacts ?? [];
    const artifact = artifacts.find((a: any) => String(a.artifactType).toUpperCase() === "CERTIFICATE");
    if (!artifact) {
      return res.json({ success: true, data: result });
    }
    if (artifact.storagePath) {
      const buffer = await remoteUploadService.downloadFile(artifact.storagePath);
      res.setHeader("Content-Type", artifact.mimeType || "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${String(artifact.fileName || "certificate.pdf").replace(/"/g, "")}"`
      );
      return res.send(buffer);
    }
    res.json({ success: true, data: { agreement: result.agreement, artifact } });
  });

  static placeInvestorComplianceHold = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.placeComplianceHold(
      req.user!.id,
      req.params.investorId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static releaseComplianceHold = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.releaseComplianceHold(
      req.user!.id,
      req.params.holdId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static listPlacementExclusions = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listPlacementExclusions({
      agentId: req.query.agentId as string | undefined,
      investorId: req.query.investorId as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createPlacementExclusion = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createPlacementExclusion(
      req.user!.id,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static listAgentPlacementExclusions = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listPlacementExclusions({
      agentId: req.params.agentId,
      investorId: req.query.investorId as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createAgentPlacementExclusion = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createPlacementExclusion(
      req.user!.id,
      { ...req.body, agentId: req.params.agentId },
      req
    );
    res.status(201).json({ success: true, data });
  });

  static deletePlacementExclusion = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.deletePlacementExclusion(
      req.user!.id,
      req.params.exclusionId,
      req
    );
    res.json({ success: true, data });
  });

  static unassignPlacementOpportunity = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.unassignPlacementOpportunity(
      req.user!.id,
      req.params.assignmentId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static unassignAgentPlacementOpportunity = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.unassignPlacementOpportunityByAgent(
      req.user!.id,
      req.params.agentId,
      req.params.opportunityId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static payPlacementCommission = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.payOrHoldPlacementCommission(
      req.user!.id,
      req.params.agentId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static payPlacementCommissionEntry = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.payPlacementCommissionEntry(
      req.user!.id,
      req.params.agentId,
      req.params.commissionId,
      req.body,
      req
    );
    res.status(201).json({ success: true, data });
  });

  static getReportCatalog = wrap(async (_req, res) => {
    const data = FundraisingRequirementsService.getReportCatalog();
    res.json({ success: true, data });
  });

  static listReportJobs = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listReportJobs({
      reportKey: req.query.reportKey as string | undefined,
      status: req.query.status as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, data });
  });

  static createReportJob = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createReportJob(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static runReportJob = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createReportJob(
      req.user!.id,
      { ...req.body, reportKey: req.params.reportKey },
      req
    );
    res.status(202).json({ success: true, data });
  });

  static getReportJob = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.getReportJob(req.params.jobId);
    res.json({ success: true, data });
  });

  static listReportSchedules = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listReportSchedules({
      reportKey: req.query.reportKey as string | undefined,
      isActive: req.query.isActive != null ? req.query.isActive === "true" : undefined,
    });
    res.json({ success: true, data });
  });

  static createReportSchedule = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createReportSchedule(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static patchReportSchedule = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.patchReportSchedule(
      req.user!.id,
      req.params.scheduleId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static deleteReportSchedule = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.deleteReportSchedule(
      req.user!.id,
      req.params.scheduleId,
      req
    );
    res.json({ success: true, data });
  });

  static listReportRunHistory = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listReportRunHistory({
      scheduleId: req.query.scheduleId as string | undefined,
      reportKey: req.query.reportKey as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, data });
  });

  static getReportHistory = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.listReportRunHistory({
      reportKey: req.params.reportKey,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ success: true, data });
  });

  static recalculateForecastScenario = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.recalculateForecastScenario(
      req.user!.id,
      req.params.scenarioId,
      req.body,
      req
    );
    res.json({ success: true, data });
  });

  static analyticsConcentration = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.analyticsConcentration({
      campaignId: req.query.campaignId as string | undefined,
      groupBy: req.query.groupBy as string | undefined,
    });
    res.json({ success: true, data });
  });

  static analyticsGeography = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.analyticsGeography({
      campaignId: req.query.campaignId as string | undefined,
    });
    res.json({ success: true, data });
  });

  static createApprovalRequest = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.createApprovalRequest(req.user!.id, req.body, req);
    res.status(201).json({ success: true, data });
  });

  static getApprovalHistory = wrap(async (req, res) => {
    const data = await FundraisingRequirementsService.getApprovalHistory(req.params.approvalId);
    res.json({ success: true, data });
  });

  static exportAuditLogsCsv = wrap(async (req, res) => {
    const { csv } = await FundraisingRequirementsService.exportAuditLogData({
      objectType: req.query.objectType as string | undefined,
      objectId: req.query.objectId as string | undefined,
      userId: req.query.userId as string | undefined,
      action: req.query.action as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    sendCsv(res, csv, "fundraising-audit-export.csv");
  });
}
