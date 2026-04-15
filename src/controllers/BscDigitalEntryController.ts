// @ts-nocheck
import { Request, Response } from "express";
import { BscDigitalEntryService } from "../services/BscDigitalEntryService";
import { FirebaseStorageService } from "../services/FirebaseStorageService";

function actorId(req: Request, body: Record<string, unknown>): string | null {
  const fromBody = body.responsibleUserId;
  if (fromBody != null && String(fromBody).trim() !== "") return String(fromBody).trim();
  const u = req.user?.id;
  return u ? String(u) : null;
}

function requireGoalId(body: Record<string, unknown>): string {
  const id = body.goalId != null ? String(body.goalId).trim() : "";
  if (!id) throw new Error("goalId is required");
  return id;
}

export class BscDigitalEntryController {
  static async financialOutcomeRoi(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const out = await BscDigitalEntryService.submitFinancialOutcomeRoi({
        goalId,
        netProfit: req.body.netProfit,
        totalCapitalInvested: req.body.totalCapitalInvested,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel,
        periodStart: req.body.periodStart,
        periodEnd: req.body.periodEnd,
        currencyCode: req.body.currencyCode,
        skipCeoBoardMirror: Boolean(req.body.skipCeoBoardMirror)
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Financial outcome ROI entry failed"
      });
    }
  }

  static async internalProcessFundingRate(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const out = await BscDigitalEntryService.submitInternalProcessFundingRate({
        goalId,
        projectsFunded: req.body.projectsFunded,
        projectsApproved: req.body.projectsApproved,
        fundId: req.body.fundId,
        periodStart: req.body.periodStart,
        periodEnd: req.body.periodEnd,
        targetPercent: req.body.targetPercent,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Internal process funding rate entry failed"
      });
    }
  }

  static async stakeholderSurvey(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const score =
        req.body.averageScore ?? req.body.surveyAverageScore ?? req.body.meanScore;
      const total =
        req.body.scoreTotal ??
        req.body.scaleMaximum ??
        req.body.totalScalePoints ??
        req.body.maxScore;
      const prev =
        req.body.previousAverageScore ??
        req.body.previousSurveyAverageScore ??
        req.body.previousMeanScore;
      const out = await BscDigitalEntryService.submitStakeholderSurvey({
        goalId,
        averageScore: score,
        scoreTotal: total,
        previousAverageScore: prev,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel,
        periodStart: req.body.periodStart,
        periodEnd: req.body.periodEnd
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Stakeholder survey entry failed"
      });
    }
  }

  static async partnershipsSigned(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      let docUrl =
        (req.body.signedMouDocumentUrl != null ? String(req.body.signedMouDocumentUrl).trim() : "") ||
        (req.body.mouDocumentUrl != null ? String(req.body.mouDocumentUrl).trim() : "");

      if (!docUrl && req.file?.buffer?.length) {
        const uploaded = await FirebaseStorageService.uploadApplicationDocument(
          req.file.buffer,
          req.file.originalname || "signed-mou",
          goalId,
          "BSC_PARTNERSHIP_MOU"
        );
        docUrl = uploaded.downloadURL;
      }

      const out = await BscDigitalEntryService.submitPartnershipsSigned({
        goalId,
        incrementBy: req.body.incrementBy,
        mouDocumentUrl: docUrl,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Partnerships signed (MOU) entry failed"
      });
    }
  }

  static async serviceDeliveryCustomerCharter(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const uploadedUrls: string[] = [];
      const files = Array.isArray(req.files) ? req.files : [];
      for (const f of files) {
        if (!f?.buffer?.length) continue;
        const uploaded = await FirebaseStorageService.uploadApplicationDocument(
          f.buffer,
          f.originalname || "customer-charter-evidence",
          goalId,
          "BSC_CUSTOMER_CHARTER_EVIDENCE"
        );
        uploadedUrls.push(uploaded.downloadURL);
      }
      const bodyUrls = Array.isArray(req.body.supportingDocumentUrls)
        ? req.body.supportingDocumentUrls
        : req.body.supportingDocumentUrls != null && String(req.body.supportingDocumentUrls).trim() !== ""
          ? [String(req.body.supportingDocumentUrls).trim()]
          : [];

      const out = await BscDigitalEntryService.submitServiceDeliveryCustomerCharter({
        goalId,
        addPercent: req.body.addPercent,
        charterAvailableLocalLanguages: !!req.body.charterAvailableLocalLanguages,
        supportingDocumentUrls: [...bodyUrls, ...uploadedUrls],
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Service delivery customer charter entry failed"
      });
    }
  }

  static async jobsCreatedAggregate(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const out = await BscDigitalEntryService.submitJobsCreatedAggregate({
        goalId,
        totalFullTimeJobs: req.body.totalFullTimeJobs,
        fundId: req.body.fundId,
        excludeStatuses: Array.isArray(req.body.excludeStatuses)
          ? req.body.excludeStatuses
          : undefined,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Jobs created aggregate entry failed"
      });
    }
  }

  static async resourceBudgetAlignment(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const out = await BscDigitalEntryService.submitResourceBudgetAlignment({
        goalId,
        actualSpend: req.body.actualSpend,
        strategicAllocation: req.body.strategicAllocation,
        criticalOverspendPercent: req.body.criticalOverspendPercent,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel,
        periodStart: req.body.periodStart,
        periodEnd: req.body.periodEnd,
        currencyCode: req.body.currencyCode
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Resource budget alignment entry failed"
      });
    }
  }

  static async inclusionDiversityReporting(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const out = await BscDigitalEntryService.submitInclusionDiversityReporting({
        goalId,
        groupCounts:
          req.body.groupCounts && typeof req.body.groupCounts === "object"
            ? req.body.groupCounts
            : {},
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Inclusion and diversity reporting entry failed"
      });
    }
  }

  /** SRD §4.1 / Flow 1: posted GL totals for a period; optional push to revenue / net-profit goals. */
  static async accountingPeriodFromGl(req: Request, res: Response) {
    try {
      const out = await BscDigitalEntryService.submitAccountingPeriodFromGl({
        periodStart: req.body.periodStart,
        periodEnd: req.body.periodEnd,
        revenueGoalId: req.body.revenueGoalId,
        netProfitGoalId: req.body.netProfitGoalId,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel,
        currencyCode: req.body.currencyCode
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Accounting period from GL entry failed"
      });
    }
  }

  static async statutoryReportsOutput(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      let evidenceUrl =
        (req.body.evidenceDocumentUrl != null ? String(req.body.evidenceDocumentUrl).trim() : "") ||
        (req.body.documentUrl != null ? String(req.body.documentUrl).trim() : "");

      if (!evidenceUrl && req.file?.buffer?.length) {
        const uploaded = await FirebaseStorageService.uploadApplicationDocument(
          req.file.buffer,
          req.file.originalname || "statutory-report-evidence",
          goalId,
          "BSC_STATUTORY_REPORT_EVIDENCE"
        );
        evidenceUrl = uploaded.downloadURL;
      }

      const out = await BscDigitalEntryService.submitStatutoryReportsOutput({
        goalId,
        incrementBy: req.body.incrementBy,
        evidenceDocumentUrl: evidenceUrl,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Statutory reports output entry failed"
      });
    }
  }

  static async governanceChecklistScore(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const out = await BscDigitalEntryService.submitGovernanceChecklistScore({
        goalId,
        complianceItemsMet: req.body.complianceItemsMet ?? req.body.itemsMet,
        totalGovernanceRequirements:
          req.body.totalGovernanceRequirements ?? req.body.totalItems ?? req.body.requirementsTotal,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Governance checklist score entry failed"
      });
    }
  }

  static async procurementPlanCompliance(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const out = await BscDigitalEntryService.submitProcurementPlanCompliance({
        goalId,
        actualProcured: req.body.actualProcured ?? req.body.closedPurchaseOrdersValue,
        annualPlanned: req.body.annualPlanned ?? req.body.approvedAnnualPlanValue,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel,
        currencyCode: req.body.currencyCode
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Procurement plan compliance entry failed"
      });
    }
  }

  static async easeOfDoingBusinessProgress(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const out = await BscDigitalEntryService.submitEaseOfDoingBusinessProgress({
        goalId,
        innovationsCompleted: req.body.innovationsCompleted ?? req.body.completedCount,
        targetInnovations: req.body.targetInnovations ?? req.body.targetCount,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Ease of doing business progress entry failed"
      });
    }
  }

  static async skillsDevelopmentProgress(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const out = await BscDigitalEntryService.submitSkillsDevelopmentProgress({
        goalId,
        completedCount: req.body.completedCount ?? req.body.certificatesApproved,
        targetCount: req.body.targetCount ?? req.body.planTargetCount,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Skills development progress entry failed"
      });
    }
  }

  static async csrParticipationRate(req: Request, res: Response) {
    try {
      const goalId = requireGoalId(req.body);
      const out = await BscDigitalEntryService.submitCsrParticipationRate({
        goalId,
        participantsCompleted: req.body.participantsCompleted ?? req.body.attendedCount,
        participantsEligible: req.body.participantsEligible ?? req.body.eligibleCount,
        responsibleUserId: actorId(req, req.body),
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "CSR participation rate entry failed"
      });
    }
  }
}
