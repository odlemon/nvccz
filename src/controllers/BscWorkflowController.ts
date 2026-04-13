// @ts-nocheck
import { Request, Response } from "express";
import { BscWorkflowService } from "../services/BscWorkflowService";
import { BscDigitalEntryService } from "../services/BscDigitalEntryService";
import { FirebaseStorageService } from "../services/FirebaseStorageService";

export class BscWorkflowController {
  static async postBudgetVarianceReport(req: Request, res: Response) {
    try {
      const uid = req.user?.id;
      if (!uid) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const narrative = req.body.narrative ?? req.body.varianceAnalysis;
      const gid = String(req.body.performanceGoalId ?? req.body.goalId ?? "").trim();
      if (!gid) {
        res.status(400).json({ success: false, message: "performanceGoalId or goalId is required" });
        return;
      }
      const row = await BscWorkflowService.createBudgetVarianceReport({
        performanceGoalId: gid,
        narrative,
        submittedById: uid,
        periodLabel: req.body.periodLabel,
        periodStart: req.body.periodStart,
        periodEnd: req.body.periodEnd,
        actualSpend: req.body.actualSpend,
        strategicAllocation: req.body.strategicAllocation
      });
      res.status(201).json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message || "Failed to create variance report" });
    }
  }

  static async postStatutorySubmissionBundle(req: Request, res: Response) {
    try {
      const uid = req.user?.id;
      if (!uid) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const goalId = String(req.body.goalId ?? "").trim();
      if (!goalId) {
        res.status(400).json({ success: false, message: "goalId is required" });
        return;
      }
      let evidenceUrl =
        (req.body.evidenceDocumentUrl != null ? String(req.body.evidenceDocumentUrl).trim() : "") ||
        (req.body.documentUrl != null ? String(req.body.documentUrl).trim() : "");

      if (!evidenceUrl && req.file?.buffer?.length) {
        const uploaded = await FirebaseStorageService.uploadApplicationDocument(
          req.file.buffer,
          req.file.originalname || "statutory-submission-evidence",
          goalId,
          "BSC_STATUTORY_SUBMISSION_EVIDENCE"
        );
        evidenceUrl = uploaded.downloadURL;
      }

      const out = await BscWorkflowService.submitStatutoryWithSubmissionRecord({
        goalId,
        submittedById: uid,
        incrementBy: req.body.incrementBy,
        evidenceDocumentUrl: evidenceUrl,
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(201).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message || "Statutory bundle failed" });
    }
  }

  static async postStatutoryManagerSignOff(req: Request, res: Response) {
    try {
      const uid = req.user?.id;
      if (!uid) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const id = String(req.params.id ?? "").trim();
      if (!id) {
        res.status(400).json({ success: false, message: "submission id is required" });
        return;
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const row = await BscWorkflowService.managerSignOffStatutorySubmission({
        submissionId: id,
        managerUserId: uid,
        note: body.note ?? body.managerSignOffNote
      });
      res.status(200).json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message || "Sign-off failed" });
    }
  }

  static async getStatutorySubmissionsByGoal(req: Request, res: Response) {
    try {
      const goalId = String(req.params.goalId ?? "").trim();
      if (!goalId) {
        res.status(400).json({ success: false, message: "goalId is required" });
        return;
      }
      const rows = await BscWorkflowService.listStatutorySubmissionsForGoal(goalId);
      res.status(200).json({ success: true, data: rows });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message || "List failed" });
    }
  }

  static async getBudgetVarianceReportsByGoal(req: Request, res: Response) {
    try {
      const goalId = String(req.params.goalId ?? "").trim();
      if (!goalId) {
        res.status(400).json({ success: false, message: "goalId is required" });
        return;
      }
      const rows = await BscWorkflowService.listBudgetVarianceReportsForGoal(goalId);
      res.status(200).json({ success: true, data: rows });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message || "List failed" });
    }
  }

  /** HR integration: increment skills KPI when a certificate is approved (body `goalId` required). */
  static async postTrainingCertificateRecorded(req: Request, res: Response) {
    try {
      const uid = req.user?.id;
      if (!uid) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      const goalId = String(req.body.goalId ?? "").trim();
      if (!goalId) {
        res.status(400).json({
          success: false,
          message: "goalId is required"
        });
        return;
      }
      const out = await BscDigitalEntryService.submitTrainingCertificateCounter({
        goalId,
        incrementBy: req.body.incrementBy,
        responsibleUserId: uid,
        frequency: req.body.frequency,
        periodLabel: req.body.periodLabel
      });
      res.status(200).json({ success: true, ...out });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message || "Training certificate KPI update failed" });
    }
  }
}
