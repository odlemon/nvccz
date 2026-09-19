// @ts-nocheck
import { Response, NextFunction } from "express";
import type { LpPortalRequest } from "../middleware/lpPortalAuth";
import { successBody, listBody, parseListQuery } from "../middleware/lpPortalFoundation";
import { LpPortalDashboardService } from "../services/lpPortal/LpPortalDashboardService";
import { LpPortalLedgerService } from "../services/lpPortal/LpPortalLedgerService";
import { LpPortalVaultService } from "../services/lpPortal/LpPortalVaultService";
import { LpPortalReportsService } from "../services/lpPortal/LpPortalReportsService";
import { LpPortalColleagueService } from "../services/lpPortal/LpPortalColleagueService";
import { LpPortalAdminService } from "../services/lpPortal/LpPortalAdminService";
import { LpPortalRequestAdminService } from "../services/lpPortal/LpPortalRequestAdminService";
import { LpPortalNoticeAdminService } from "../services/lpPortal/LpPortalNoticeAdminService";
import { LpPortalSessionService } from "../services/lpPortal/LpPortalSessionService";
import { LpPortalCapitalActivityService } from "../services/lpPortal/LpPortalCapitalActivityService";
import { LpPortalDealingService } from "../services/lpPortal/LpPortalDealingService";
import { LpPortalPerformanceService } from "../services/lpPortal/LpPortalPerformanceService";
import { LpPortalDocumentsService } from "../services/lpPortal/LpPortalDocumentsService";
import { LpPortalServiceDeskService } from "../services/lpPortal/LpPortalServiceDeskService";
import { LpPortalNotificationsService } from "../services/lpPortal/LpPortalNotificationsService";
import { LpPortalAttachmentService } from "../services/lpPortal/LpPortalAttachmentService";

function q(req: LpPortalRequest) {
  return parseListQuery(req.query as any);
}

export class LpPortalController {
  // —— Session / dashboard ——
  static async getSession(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalSessionService.getSession(req.lpPortal!, req.user!.id);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async getDashboard(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDashboardService.getDashboardSrd(req.lpPortal!, {
        fundId: req.query.fundId as string,
        presentationCurrency: req.query.presentationCurrency as string,
        asOfDate: req.query.asOfDate as string,
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async getDashboardActions(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDashboardService.getActions(req.lpPortal!);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async getDashboardRecentActivity(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(String(req.query.limit || "10"), 10);
      const data = await LpPortalDashboardService.getRecentActivity(req.lpPortal!, limit);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  // —— Capital calls ——
  static async listCapitalCalls(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalCapitalActivityService.listCapitalCalls(req.lpPortal!, q(req));
      res.json(listBody(data.items, data.page, data.pageSize, data.total));
    } catch (e) {
      next(e);
    }
  }

  static async capitalCallSummary(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalCapitalActivityService.summary(req.lpPortal!, {
        fundId: req.query.fundId as string,
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async getCapitalCall(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalCapitalActivityService.getCapitalCall(
        req.lpPortal!,
        req.params.id
      );
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async acknowledgeCapitalCall(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalCapitalActivityService.acknowledge(
        req.lpPortal!,
        req.params.id,
        req.user!.id
      );
      res.json(successBody(data, "Capital call acknowledged"));
    } catch (e) {
      next(e);
    }
  }

  static async uploadPaymentConfirmation(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file;
      if (!file?.buffer) {
        return res.status(400).json({
          success: false,
          message: "file is required (multipart)",
          error: { code: "LP_VALIDATION", message: "file is required", retryable: false },
        });
      }
      const data = await LpPortalCapitalActivityService.uploadPaymentConfirmation(
        req.lpPortal!,
        req.params.id,
        file,
        {
          amountClaimed: req.body.amountClaimed,
          notes: req.body.notes,
          userId: req.user!.id,
        }
      );
      res.status(201).json(successBody(data, "Payment confirmation uploaded"));
    } catch (e) {
      next(e);
    }
  }

  static async downloadCapitalCallNotice(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const { buffer, filename, contentType } =
        await LpPortalCapitalActivityService.downloadNotice(req.lpPortal!, req.params.id);
      res.setHeader("Content-Type", contentType || "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  static async listCapitalCallDocuments(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalCapitalActivityService.listCallDocuments(
        req.lpPortal!,
        req.params.id
      );
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  // —— Distributions ——
  static async listDistributions(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalCapitalActivityService.listDistributions(req.lpPortal!, q(req));
      res.json(listBody(data.items, data.page, data.pageSize, data.total));
    } catch (e) {
      next(e);
    }
  }

  static async getDistribution(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalCapitalActivityService.getDistribution(
        req.lpPortal!,
        req.params.id
      );
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async downloadDistribution(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const { buffer, filename, contentType } =
        await LpPortalCapitalActivityService.downloadDistribution(req.lpPortal!, req.params.id);
      res.setHeader("Content-Type", contentType || "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  static async downloadDistributionStatement(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const { buffer, filename, contentType } =
        await LpPortalCapitalActivityService.downloadDistributionStatement(req.lpPortal!, {
          fundId: req.query.fundId as string,
          asOfDate: req.query.asOfDate as string,
        });
      res.setHeader("Content-Type", contentType || "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  // —— Account activity / ledger aliases ——
  static async listAccountActivity(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalLedgerService.listLedger(req.lpPortal!, {
        fundId: req.query.fundId as string,
        from: req.query.from as string,
        to: req.query.to as string,
        currency: req.query.currency as string,
      });
      const items = Array.isArray(data.data) ? data.data : data.data?.items || data.data || [];
      const page = q(req);
      res.json(
        listBody(
          Array.isArray(items) ? items : [],
          page.page,
          page.pageSize,
          Array.isArray(items) ? items.length : 0
        )
      );
    } catch (e) {
      next(e);
    }
  }

  static async exportAccountActivity(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalLedgerService.listLedger(req.lpPortal!, {
        fundId: req.query.fundId as string,
        from: req.query.from as string,
        to: req.query.to as string,
        currency: req.query.currency as string,
      });
      const items = Array.isArray(data.data) ? data.data : [];
      const format = String(req.query.format || "csv").toLowerCase();
      if (format === "csv") {
        const header = "id,date,type,amount,currency,fundId\n";
        const rows = items
          .map(
            (e: any) =>
              `${e.id || ""},${e.date || e.transactionDate || ""},${e.type || ""},${e.amount || ""},${e.currency || ""},${e.fundId || ""}`
          )
          .join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", 'attachment; filename="account-activity.csv"');
        return res.send(header + rows);
      }
      res.json(successBody({ items, format, note: "xlsx/pdf export falls back to JSON in v1" }));
    } catch (e) {
      next(e);
    }
  }

  static async listLedger(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalLedgerService.listLedger(req.lpPortal!, {
        fundId: req.query.fundId as string,
        from: req.query.from as string,
        to: req.query.to as string,
        currency: req.query.currency as string,
      });
      res.json(successBody(data.data));
    } catch (e) {
      next(e);
    }
  }

  static async getLedgerEntry(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalLedgerService.getEntryDetail(req.lpPortal!, req.params.entryId);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async exportDealingRequests(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const out = await LpPortalDealingService.exportRequests(req.lpPortal!, req.query as any);
      res.setHeader("Content-Type", out.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
      res.send(out.body);
    } catch (e) {
      next(e);
    }
  }

  static async documentsSummary(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDocumentsService.summary(req.lpPortal!);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async listNotifications(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(String(req.query.limit || "5"), 10);
      const data = await LpPortalNotificationsService.listFeed(req.lpPortal!, { limit });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async uploadRequestAttachment(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file;
      if (!file?.buffer) {
        return res.status(400).json({
          success: false,
          message: "file is required (multipart)",
          error: { code: "LP_VALIDATION", message: "file is required", retryable: false },
        });
      }
      const data = await LpPortalServiceDeskService.uploadRequestAttachment(
        req.lpPortal!,
        file,
        req.user!.id
      );
      res.status(201).json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async downloadAttachment(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const { buffer, filename, contentType } = await LpPortalAttachmentService.download(
        req.lpPortal!,
        req.params.id
      );
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  static async listBankInstructionChanges(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.listBankInstructionChanges(req.lpPortal!);
      res.json(successBody({ items: data }));
    } catch (e) {
      next(e);
    }
  }

  static async createBankInstructionChange(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.createBankInstructionChange(
        req.lpPortal!,
        req.body || {},
        req.user!.id,
        { ipAddress: req.ip, userAgent: req.get("user-agent") }
      );
      res.status(201).json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async patchDisplaySettings(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.patchDisplaySettings(
        req.lpPortal!,
        req.body || {},
        req.user!.id
      );
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  // —— Dealing ——
  static async dealingOverview(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDealingService.overview(req.lpPortal!, {
        fundId: req.query.fundId as string,
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async dealingRules(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDealingService.getRules(req.lpPortal!, {
        fundId: req.query.fundId as string,
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async listDealingRequests(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDealingService.listRequests(req.lpPortal!, q(req));
      res.json(listBody(data.items, data.page, data.pageSize, data.total));
    } catch (e) {
      next(e);
    }
  }

  static async estimateSubscription(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDealingService.estimateSubscription(req.lpPortal!, req.body);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async createSubscription(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDealingService.createSubscription(
        req.lpPortal!,
        req.body,
        req.user!.id
      );
      res.status(201).json(successBody(data, "Subscription submitted"));
    } catch (e) {
      next(e);
    }
  }

  static async estimateRedemption(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDealingService.estimateRedemption(req.lpPortal!, req.body);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async createRedemption(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDealingService.createRedemption(
        req.lpPortal!,
        req.body,
        req.user!.id
      );
      res.status(201).json(successBody(data, "Redemption submitted"));
    } catch (e) {
      next(e);
    }
  }

  static async listBankAccounts(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDealingService.listBankAccounts(req.lpPortal!, {
        fundId: req.query.fundId as string,
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  // —— Performance ——
  static async getPerformance(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalPerformanceService.getPerformance(req.lpPortal!, {
        fundId: req.query.fundId as string,
        period: req.query.period as string,
        asOfDate: req.query.asOfDate as string,
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async performanceHistory(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalPerformanceService.history(req.lpPortal!, {
        fundId: req.query.fundId as string,
        period: (req.query.period as string) || "SI",
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async performanceBenchmarks(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalPerformanceService.benchmarks(req.lpPortal!, {
        fundId: req.query.fundId as string,
        metric: req.query.metric as string,
        benchmarkId: req.query.benchmarkId as string,
        asOfDate: req.query.asOfDate as string,
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async performanceByFund(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalPerformanceService.byFund(req.lpPortal!);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async downloadPerformanceReport(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalPerformanceService.createPerformanceReportJob(req.lpPortal!, {
        fundId: req.query.fundId as string,
        userId: req.user!.id,
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async createPerformanceJob(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalPerformanceService.createPerformanceReportJob(req.lpPortal!, {
        ...req.body,
        userId: req.user!.id,
      });
      res.status(202).json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async getJob(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalPerformanceService.getJob(req.lpPortal!, req.params.jobId);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  // —— Documents / vault ——
  static async listDocuments(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDocumentsService.list(req.lpPortal!, q(req));
      res.json(listBody(data.items, data.page, data.pageSize, data.total));
    } catch (e) {
      next(e);
    }
  }

  static async getDocument(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDocumentsService.get(req.lpPortal!, req.params.id, {
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async downloadDocument(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const { buffer, filename, contentType } = await LpPortalDocumentsService.download(
        req.lpPortal!,
        req.params.id,
        {
          userId: req.user?.id,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        }
      );
      res.setHeader("Content-Type", contentType || "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  static async previewDocument(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const { buffer, filename, mimeType, contentType } = await LpPortalDocumentsService.preview(
        req.lpPortal!,
        req.params.id,
        {
          userId: req.user?.id,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        }
      );
      res.setHeader("Content-Type", contentType || mimeType || "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  static async listVault(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalVaultService.listVault(req.lpPortal!, {
        category: req.query.category as string,
        search: req.query.search as string,
        fundId: req.query.fundId as string,
      });
      res.json(successBody(data.data));
    } catch (e) {
      next(e);
    }
  }

  static async downloadVaultDoc(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const { buffer, filename } = await LpPortalDocumentsService.download(
        req.lpPortal!,
        req.params.documentId,
        {
          userId: req.user?.id,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        }
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  static async verifyVaultDoc(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalVaultService.verifyIntegrity(req.lpPortal!, req.params.documentId);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  // —— Notices ——
  static async listNotices(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDocumentsService.listNotices(req.lpPortal!, q(req));
      res.json(listBody(data.items, data.page, data.pageSize, data.total));
    } catch (e) {
      next(e);
    }
  }

  static async getNotice(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDocumentsService.getNotice(
        req.lpPortal!,
        req.params.id,
        req.user?.id
      );
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async acknowledgeNotice(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalDocumentsService.acknowledgeNotice(
        req.lpPortal!,
        req.params.id,
        req.user!.id
      );
      res.json(successBody(data, "Notice acknowledged"));
    } catch (e) {
      next(e);
    }
  }

  // —— Requests / messages ——
  static async listRequests(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.listRequests(req.lpPortal!, q(req));
      res.json(listBody(data.items, data.page, data.pageSize, data.total));
    } catch (e) {
      next(e);
    }
  }

  static async getRequest(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.getRequestByReference(
        req.lpPortal!,
        req.params.reference
      );
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async createRequest(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.createRequest(
        req.lpPortal!,
        req.body,
        req.user!.id
      );
      res.status(201).json(successBody(data, "Service request created"));
    } catch (e) {
      next(e);
    }
  }

  static async addRequestMessage(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.addRequestMessage(
        req.lpPortal!,
        req.params.reference,
        { body: req.body.body, attachmentIds: req.body.attachmentIds },
        req.user!.id
      );
      res.status(201).json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async listMessageThreads(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.listThreads(req.lpPortal!, q(req));
      res.json(listBody(data.items, data.page, data.pageSize, data.total));
    } catch (e) {
      next(e);
    }
  }

  static async getMessageThread(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.getThread(req.lpPortal!, req.params.id);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async replyMessageThread(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.replyToThread(
        req.lpPortal!,
        req.params.id,
        { body: req.body.body, attachmentIds: req.body.attachmentIds },
        req.user!.id
      );
      res.status(201).json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async markThreadRead(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.markThreadRead(
        req.lpPortal!,
        req.params.id
      );
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  // —— Organisation / colleagues / settings ——
  static async getOrganisation(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.getOrganisation(req.lpPortal!);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async listColleagues(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalColleagueService.listColleagues(req.lpPortal!);
      res.json(successBody(data.data));
    } catch (e) {
      next(e);
    }
  }

  static async inviteColleague(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalColleagueService.inviteColleague(req.lpPortal!, {
        email: req.body.email,
        role: req.body.role,
        fundIds: req.body.fundIds,
        invitedById: req.user!.id,
      });
      res.status(201).json(successBody(data, "Colleague invited"));
    } catch (e) {
      next(e);
    }
  }

  static async patchColleague(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalColleagueService.patchColleague(
        req.lpPortal!,
        req.params.membershipId,
        { role: req.body.role, fundIds: req.body.fundIds }
      );
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async revokeColleague(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalColleagueService.revokeViewer(
        req.lpPortal!,
        req.params.membershipId
      );
      res.json(successBody(data, "Colleague revoked"));
    } catch (e) {
      next(e);
    }
  }

  static async getSettings(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.getSettings(req.lpPortal!, req.user!.id);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async patchNotifications(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.patchNotifications(
        req.lpPortal!,
        req.body || {},
        req.user!.id
      );
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async getMfaSettings(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalServiceDeskService.getMfa(req.lpPortal!, req.user!.id);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async getRealtimeContract(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const port = process.env.PORT || "3009";
      const baseUrl = process.env.API_PUBLIC_URL || `http://127.0.0.1:${port}`;
      res.json(
        successBody({
          transport: "socket.io",
          url: baseUrl.replace(/\/api\/?$/, ""),
          path: "/socket.io",
          auth: { token: "Bearer <jwt> via handshake.auth.token" },
          autoRooms: ["user:{userId}", "lp_portal:{clientId}"],
          subscribe: {
            join_lp_thread: { threadId: "string" },
            leave_lp_thread: { threadId: "string" },
            join_lp_request: { reference: "string" },
            leave_lp_request: { reference: "string" },
            join_lp_portal: "re-join org room after reconnect",
          },
          events: {
            lp_notice_updated: "Notice opened/acknowledged — refresh notices list/detail",
            lp_request_created: "New service request — refresh requests list",
            lp_request_updated: "Request status/metadata changed",
            lp_request_message: "New message on request detail room",
            lp_thread_message: "New message in message thread room",
            lp_thread_read: "Thread marked read — update unread badges",
            lp_thread_updated: "Thread metadata/last message changed",
            lp_notification: "Topbar notification feed invalidation (per user)",
          },
        })
      );
    } catch (e) {
      next(e);
    }
  }

  // —— Reports (legacy) ——
  static async listReports(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(String(req.query.page || "1"), 10);
      const limit = parseInt(String(req.query.limit || "20"), 10);
      const data = await LpPortalReportsService.listReports(req.lpPortal!, page, limit);
      res.json({ success: true, ...data, timestamp: new Date().toISOString() });
    } catch (e) {
      next(e);
    }
  }

  static async downloadReport(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const { buffer, filename } = await LpPortalReportsService.downloadReport(
        req.lpPortal!,
        req.params.jobId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  // —— Admin ——
  // --- Investor notices, staff side (SRD section 23) ----------------------------------------

  static async listAdminNotices(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      res.json(successBody(await LpPortalNoticeAdminService.list(req.query as any)));
    } catch (e) {
      next(e);
    }
  }

  static async createAdminNotice(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalNoticeAdminService.create({
        title: req.body?.title,
        body: req.body?.body,
        category: req.body?.category ?? null,
        targetType: req.body?.targetType,
        fundId: req.body?.fundId ?? null,
        clientId: req.body?.clientId ?? null,
        userId: req.body?.userId ?? null,
        shareClass: req.body?.shareClass ?? null,
      });
      res.status(201).json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  // --- Investor service desk, staff side (SRD sections 21 and 5) ---------------------------
  // These are NOT investor-scoped and are mounted behind requireGpAdmin only.

  static async listAdminRequests(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      res.json(successBody(await LpPortalRequestAdminService.list(req.query as any)));
    } catch (e) {
      next(e);
    }
  }

  static async getAdminRequest(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      res.json(successBody(await LpPortalRequestAdminService.getByReference(req.params.reference)));
    } catch (e) {
      next(e);
    }
  }

  static async updateAdminRequest(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalRequestAdminService.update(req.params.reference, {
        status: req.body?.status,
        assignedToId: req.body?.assignedToId,
        priority: req.body?.priority,
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async replyAdminRequest(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalRequestAdminService.reply(req.params.reference, {
        body: req.body?.body,
        authorId: (req as any).user?.id ?? null,
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async listAdminMemberships(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalAdminService.listMemberships(req.query.clientId as string);
      res.json(successBody(data.data));
    } catch (e) {
      next(e);
    }
  }

  static async createAdminMembership(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalAdminService.createMembership({
        clientId: req.body.clientId,
        // Either identifies an existing account or, with `email`, onboards a new investor:
        // creates the user and emails an activation link. See LpPortalInviteService.
        userId: req.body.userId,
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        lpRole: req.body.lpRole,
        fundIds: req.body.fundIds,
        invitedById: req.user!.id,
      });
      res.status(201).json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async revokeAdminMembership(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalAdminService.revokeMembership(req.params.membershipId);
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async publishAdminDocument(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file;
      if (!file?.buffer) {
        return res.status(400).json({ success: false, message: "file is required (multipart)" });
      }
      const data = await LpPortalAdminService.publishDocument({
        clientId: req.body.clientId,
        fundId: req.body.fundId,
        category: req.body.category || "MANUAL",
        title: req.body.title || file.originalname,
        fileBuffer: file.buffer,
        mimeType: file.mimetype || "application/pdf",
        publishedById: req.user!.id,
      });
      res.status(201).json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async getMfaPolicy(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalAdminService.getMfaPolicy();
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }

  static async updateMfaPolicy(req: LpPortalRequest, res: Response, next: NextFunction) {
    try {
      const data = await LpPortalAdminService.updateMfaPolicy({
        requireMfaForLp: req.body.requireMfaForLp,
        issuerName: req.body.issuerName,
      });
      res.json(successBody(data));
    } catch (e) {
      next(e);
    }
  }
}
