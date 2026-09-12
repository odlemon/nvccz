// @ts-nocheck
import { Request, Response } from "express";
import { FundReportTemplateService } from "../services/fundReporting/FundReportTemplateService";
import { FundReportingScheduleService } from "../services/fundReporting/FundReportingScheduleService";
import { FundReportDistributionService } from "../services/fundReporting/FundReportDistributionService";
import { FundReportRunOrchestrator } from "../services/fundReporting/FundReportRunOrchestrator";
import { FundReportAssetStager } from "../services/fundReporting/FundReportAssetStager";
import { FundReportAuditService } from "../services/fundReporting/FundReportAuditService";

export class FundReportingController {
  static async listTemplates(req: Request, res: Response) {
    try {
      const data = await FundReportTemplateService.list({
        fundId: req.query.fundId ? String(req.query.fundId) : undefined,
        reportLevel: req.query.reportLevel ? String(req.query.reportLevel) : undefined,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async createTemplate(req: Request, res: Response) {
    try {
      const data = await FundReportTemplateService.create((req as any).user.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async updateTemplate(req: Request, res: Response) {
    try {
      const data = await FundReportTemplateService.update(req.params.id, (req as any).user.id, req.body);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async deleteTemplate(req: Request, res: Response) {
    try {
      const data = await FundReportTemplateService.delete(req.params.id, (req as any).user.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async listSchedules(req: Request, res: Response) {
    try {
      const data = await FundReportingScheduleService.list(
        req.query.fundId ? String(req.query.fundId) : undefined
      );
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async createSchedule(req: Request, res: Response) {
    try {
      const data = await FundReportingScheduleService.create(req.body);
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async updateSchedule(req: Request, res: Response) {
    try {
      const data = await FundReportingScheduleService.update(req.params.id, req.body);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async deleteSchedule(req: Request, res: Response) {
    try {
      const data = await FundReportingScheduleService.delete(req.params.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async listDistributionLists(req: Request, res: Response) {
    try {
      const data = await FundReportDistributionService.list(
        req.query.fundId ? String(req.query.fundId) : undefined
      );
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async createDistributionList(req: Request, res: Response) {
    try {
      const data = await FundReportDistributionService.create((req as any).user.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async updateDistributionList(req: Request, res: Response) {
    try {
      const data = await FundReportDistributionService.update(
        req.params.id,
        (req as any).user.id,
        req.body
      );
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async deleteDistributionList(req: Request, res: Response) {
    try {
      const data = await FundReportDistributionService.delete(req.params.id, (req as any).user.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async listRuns(req: Request, res: Response) {
    try {
      const data = await FundReportRunOrchestrator.listRuns({
        fundId: req.query.fundId ? String(req.query.fundId) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async createRun(req: Request, res: Response) {
    try {
      const body = req.body || {};
      const data = await FundReportRunOrchestrator.createRun({
        fundId: body.fundId,
        templateId: body.templateId,
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
        triggeredById: (req as any).user.id,
        triggerType: "MANUAL",
        distributionListId: body.distributionListId,
        clientIds: body.clientIds,
      });
      res.status(202).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async getRun(req: Request, res: Response) {
    try {
      const data = await FundReportRunOrchestrator.getRun(req.params.runId);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(404).json({ success: false, message: e.message });
    }
  }

  static async getRunLogs(req: Request, res: Response) {
    try {
      const data = await FundReportRunOrchestrator.getRunLogs(req.params.runId);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async getRunRecipients(req: Request, res: Response) {
    try {
      const run = await FundReportRunOrchestrator.getRun(req.params.runId);
      res.json({ success: true, data: run.recipientJobs });
    } catch (e: any) {
      res.status(404).json({ success: false, message: e.message });
    }
  }

  static async getAuditTrail(req: Request, res: Response) {
    try {
      const data = await FundReportAuditService.listForEntity(
        String(req.query.entityType),
        String(req.query.entityId)
      );
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async downloadByToken(req: Request, res: Response) {
    try {
      const result = await FundReportAssetStager.resolveDownloadByToken(req.params.token);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
    } catch (e: any) {
      res.status(e.statusCode || 400).json({ success: false, message: e.message });
    }
  }
}
