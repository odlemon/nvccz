// @ts-nocheck
import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { InvestmentOpsDashboardService } from "../services/investmentOps/InvestmentOpsDashboardService";
import { InvestmentOpsPortfolioService } from "../services/investmentOps/InvestmentOpsPortfolioService";
import { InvestmentInstrumentService } from "../services/investmentOps/InvestmentInstrumentService";
import { InvestmentOrderService } from "../services/investmentOps/InvestmentOrderService";
import { InvestmentComplianceService } from "../services/investmentOps/InvestmentComplianceService";
import { InvestmentValuationService } from "../services/investmentOps/InvestmentValuationService";
import { InvestmentAccountingFacadeService } from "../services/investmentOps/InvestmentAccountingFacadeService";
import { InvestmentReconciliationService } from "../services/investmentOps/InvestmentReconciliationService";
import { InvestmentDocumentationService } from "../services/investmentOps/InvestmentDocumentationService";
import { InvestmentReportingService } from "../services/investmentOps/InvestmentReportingService";
import { InvestmentSetupService } from "../services/investmentOps/InvestmentSetupService";
import { InvestmentFundService } from "../services/investmentOps/InvestmentFundService";
import { InvestmentSimulationService } from "../services/investmentOps/InvestmentSimulationService";
import { InvestmentModelPortfolioService } from "../services/investmentOps/InvestmentModelPortfolioService";
import { InvestmentMarketDataFacadeService } from "../services/investmentOps/InvestmentMarketDataFacadeService";
import { InvestmentOpsPhase1Service } from "../services/investmentOps/InvestmentOpsPhase1Service";
import { InvestmentOpsReferenceService } from "../services/investmentOps/InvestmentOpsReferenceService";
import { InvestmentOrderPhase2Service } from "../services/investmentOps/InvestmentOrderPhase2Service";
import { InvestmentTradingPhase2Service } from "../services/investmentOps/InvestmentTradingPhase2Service";
import { ListedEquityAccessService } from "../services/listedEquity/ListedEquityAccessService";
import { TradeOrchestratorService } from "../services/listedEquity/TradeOrchestratorService";
import { prisma } from "../utils/database";
import { ListedEquityMarketDataController } from "./ListedEquityMarketDataController";
import { ListedEquityTradeController } from "./ListedEquityTradeController";
import {
  getExpectedVersion,
  getIdempotencyKey,
  InvestmentOpsError,
  parseInvestmentListQuery,
  resolveExpectedVersion,
  sendInvestmentOpsError,
} from "../middleware/investmentOpsFoundation";

function handle(res: Response, promise: Promise<unknown>, successStatus = 200) {
  promise
    .then((data) => res.status(successStatus).json({ success: true, data }))
    .catch((e: any) => sendInvestmentOpsError(res, e));
}

export class InvestmentOpsController {
  // Dashboard
  static dashboardSummary(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsDashboardService.summary(
        req.user!.id,
        req.user,
        req.query.period as string,
        req.query.startDate as string,
        req.query.endDate as string
      )
    );
  }
  static dashboardAllocation(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsDashboardService.allocation(req.user!.id, req.user, req.query.fundId as string));
  }
  static dashboardCurrencyExposure(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsDashboardService.currencyExposure(req.user!.id, req.user, req.query.fundId as string));
  }
  static dashboardFunds(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsDashboardService.fundsTable(req.user!.id, req.user));
  }
  static dashboardRecalculate(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.dashboardJob(
        req.body.fundId,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      202
    );
  }

  // Portfolios
  static listPortfolios(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPhase1Service.portfolios(req.query, req.user!.id, req.user));
  }
  static createPortfolio(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPhase1Service.createPortfolio(req.body, req.user!.id), 201);
  }
  static getPortfolio(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPhase1Service.portfolioDetail(req.params.fundId, req.user!.id, req.user));
  }
  static patchPortfolio(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.patchPortfolio(
        req.params.fundId,
        req.body,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static archivePortfolio(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.patchPortfolio(
        req.params.fundId,
        { status: "ARCHIVED" },
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static portfolioOverview(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPortfolioService.overview(req.params.fundId, req.user!.id, req.user));
  }
  static portfolioHoldings(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPortfolioService.holdings(req.params.fundId, req.user!.id, req.user));
  }
  static portfolioTransactions(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPortfolioService.transactions(req.params.fundId, req.user!.id, req.user));
  }
  static portfolioExposure(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPortfolioService.exposure(req.params.fundId, req.user!.id, req.user));
  }
  static portfolioRecalculate(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPortfolioService.recalculate(req.params.fundId, req.user!.id, req.user));
  }
  static portfolioPositions(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPhase1Service.positions(req.params.fundId, req.user!.id, req.user));
  }
  static positionDetail(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPhase1Service.position(req.params.id, req.user!.id, req.user));
  }
  static portfolioTransactionList(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.transactions(
        req.params.fundId,
        req.query,
        req.user!.id,
        req.user
      )
    );
  }
  static transactionDetail(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPhase1Service.transaction(req.params.id, req.user!.id, req.user));
  }
  static manualAdjustment(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.manualAdjustment(
        req.params.fundId,
        req.body,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static reverseTransaction(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.reverseTransaction(
        req.params.id,
        req.body.reason,
        getExpectedVersion(req),
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }

  static listFolders(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.folders(
        req.params.fundId,
        req.user!.id,
        req.user,
        req.query.includeArchived === "true"
      )
    );
  }
  static getFolder(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPhase1Service.folder(req.params.id, req.user!.id, req.user));
  }
  static createFolder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.createFolder(req.params.fundId, req.body, req.user!.id, req.user),
      201
    );
  }
  static patchFolder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.patchFolder(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static archiveFolder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.setFolderArchived(
        req.params.id,
        true,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static restoreFolder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.setFolderArchived(
        req.params.id,
        false,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static reorderFolders(req: AuthRequest, res: Response) {
    const body = req.body || {};
    const ids =
      body.ids ??
      body.folderIds ??
      body.order ??
      (Array.isArray(body.items) ? body.items.map((item: any) => item?.id ?? item) : undefined);
    handle(
      res,
      InvestmentOpsPhase1Service.reorderFolders(
        req.params.fundId,
        body.parentId ?? null,
        ids,
        req.user!.id,
        req.user
      )
    );
  }
  static listPortfolioAssignments(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.listAssignments(req.params.fundId, req.user!.id, req.user)
    );
  }
  static createPortfolioAssignment(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.createAssignment(
        req.params.fundId,
        req.body,
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static patchPortfolioAssignment(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.patchAssignment(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  /** SRD alias: flattened / fund-scoped folder list. */
  static listPortfolioFoldersAlias(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.listFoldersFlat(req.user!.id, req.user, req.query)
    );
  }
  static createPortfolioFolderAlias(req: AuthRequest, res: Response) {
    const fundId = String(req.body?.fundId || req.query.fundId || "").trim();
    if (!fundId) {
      return sendInvestmentOpsError(
        res,
        new InvestmentOpsError("VALIDATION_ERROR", "fundId is required", 400, { field: "fundId" })
      );
    }
    handle(
      res,
      InvestmentOpsPhase1Service.createFolder(fundId, req.body, req.user!.id, req.user),
      201
    );
  }
  static getPortfolioFolderAlias(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.folder(req.params.folderId, req.user!.id, req.user)
    );
  }
  static patchPortfolioFolderAlias(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.patchFolder(
        req.params.folderId,
        req.body,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static archivePortfolioFolderAlias(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.setFolderArchived(
        req.params.folderId,
        true,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static restorePortfolioFolderAlias(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.setFolderArchived(
        req.params.folderId,
        false,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static reorderPortfolioFoldersAlias(req: AuthRequest, res: Response) {
    const fundId = String(req.body?.fundId || req.query.fundId || "").trim();
    if (!fundId) {
      return sendInvestmentOpsError(
        res,
        new InvestmentOpsError("VALIDATION_ERROR", "fundId is required", 400, { field: "fundId" })
      );
    }
    const body = req.body || {};
    const ids =
      body.ids ??
      body.folderIds ??
      body.order ??
      (Array.isArray(body.items) ? body.items.map((item: any) => item?.id ?? item) : undefined);
    handle(
      res,
      InvestmentOpsPhase1Service.reorderFolders(
        fundId,
        body.parentId ?? null,
        ids,
        req.user!.id,
        req.user
      )
    );
  }
  static createPortfolioAssignmentAlias(req: AuthRequest, res: Response) {
    const fundId = String(req.body?.fundId || req.query.fundId || "").trim();
    if (!fundId) {
      return sendInvestmentOpsError(
        res,
        new InvestmentOpsError("VALIDATION_ERROR", "fundId is required", 400, { field: "fundId" })
      );
    }
    handle(
      res,
      InvestmentOpsPhase1Service.createAssignment(fundId, req.body, req.user!.id, req.user),
      201
    );
  }
  static deletePortfolioAssignmentAlias(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.deleteAssignment(req.params.id, req.user!.id, req.user)
    );
  }
  static unassignFolderPortfolio(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.unassignFolderPortfolio(
        req.params.folderId,
        req.params.fundId,
        req.user!.id,
        req.user
      )
    );
  }
  static getPortfolioConfig(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPhase1Service.config(req.params.fundId, req.user!.id, req.user));
  }
  static patchPortfolioConfig(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.patchConfig(
        req.params.fundId,
        req.body,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static listPortfolioLimits(req: AuthRequest, res: Response) {
    const fundId = req.params.fundId || req.params.id;
    handle(
      res,
      InvestmentOpsPhase1Service.limits(
        fundId,
        req.user!.id,
        req.user,
        req.query.includeArchived === "true"
      )
    );
  }
  static createPortfolioLimit(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.createLimit(req.params.fundId, req.body, req.user!.id, req.user),
      201
    );
  }
  static getPortfolioLimit(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPhase1Service.limit(req.params.id, req.user!.id, req.user));
  }
  static patchPortfolioLimit(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.patchLimit(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static archivePortfolioLimit(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsPhase1Service.patchLimit(
        req.params.id,
        { isActive: false },
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }

  // Instruments
  static listInstrumentTypes(req: AuthRequest, res: Response) {
    handle(res, InvestmentInstrumentService.listTypes());
  }
  static listInstruments(req: AuthRequest, res: Response) {
    const list = parseInvestmentListQuery(req.query as Record<string, unknown>);
    handle(
      res,
      InvestmentInstrumentService.list({
        type: req.query.type as string,
        exchange: req.query.exchange as string,
        status: req.query.status as string,
        ...list,
      })
    );
  }
  static getInstrument(req: AuthRequest, res: Response) {
    handle(res, InvestmentInstrumentService.get(req.params.id));
  }
  static instrumentMarketContext(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentInstrumentService.marketContext(
        req.params.id,
        String(req.query.fundId || ""),
        req.user!.id,
        req.user
      )
    );
  }
  static createInstrument(req: AuthRequest, res: Response) {
    handle(res, InvestmentInstrumentService.create(req.body, req.user!.id), 201);
  }
  static updateInstrument(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentInstrumentService.update(req.params.id, req.body, getExpectedVersion(req))
    );
  }
  static approveInstrument(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentInstrumentService.approve(req.params.id, req.user!.id, getExpectedVersion(req))
    );
  }
  static transitionInstrument(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentInstrumentService.transition(
        req.params.id,
        req.body.status,
        req.user!.id,
        getExpectedVersion(req),
        req.body.reason,
        req.user
      )
    );
  }

  // Market data facade + delegate legacy
  static marketDataLatest(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentMarketDataFacadeService.latestPrices({
        search: req.query.search as string,
        exchangeCode: req.query.exchangeCode as string,
      })
    );
  }
  static marketDataStale(req: AuthRequest, res: Response) {
    handle(res, InvestmentMarketDataFacadeService.stalePrices(Number(req.query.hours) || 24));
  }
  static marketDataManual(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentMarketDataFacadeService.manualPriceEntry({
        ...req.body,
        userId: req.user!.id,
        idempotencyKey: getIdempotencyKey(req),
      })
    );
  }
  static marketDataUpload(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentMarketDataFacadeService.uploadPricesCsv(req.body.csvText, req.body.sourceCode)
    );
  }
  static marketDataIngestRun(req: AuthRequest, res: Response) {
    handle(res, InvestmentMarketDataFacadeService.runIngest(req.body.sourceCode));
  }
  static marketDataValidationQueue(req: AuthRequest, res: Response) {
    return ListedEquityMarketDataController.validationQueue(req, res);
  }
  static marketDataApproveTick(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentMarketDataFacadeService.reviewPrice(
        req.params.tickId,
        "APPROVED",
        req.user!.id,
        req.body.reason,
        getExpectedVersion(req)
      )
    );
  }
  static marketDataRejectTick(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentMarketDataFacadeService.reviewPrice(
        req.params.tickId,
        "REJECTED",
        req.user!.id,
        req.body.reason,
        getExpectedVersion(req)
      )
    );
  }
  static marketDataSecurityPrices(req: AuthRequest, res: Response) {
    return ListedEquityMarketDataController.getSecurityPrices(req, res);
  }
  static marketDataBatches(req: AuthRequest, res: Response) {
    return ListedEquityMarketDataController.listBatches(req, res);
  }
  static marketDataBatchDetail(req: AuthRequest, res: Response) {
    return ListedEquityMarketDataController.getBatch(req, res);
  }
  static marketDataPriceHistory(req: AuthRequest, res: Response) {
    handle(res, InvestmentMarketDataFacadeService.priceHistory(req.params.securityId, req.query));
  }
  static listFxRates(req: AuthRequest, res: Response) {
    handle(res, InvestmentMarketDataFacadeService.listFxRates(req.query));
  }
  static latestFxRate(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentMarketDataFacadeService.latestFxRate(
        req.query.baseCurrencyCode as string,
        req.query.quoteCurrencyCode as string
      )
    );
  }
  static createFxRate(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentMarketDataFacadeService.createFxRate(req.body, getIdempotencyKey(req)),
      201
    );
  }
  static approveFxRate(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentMarketDataFacadeService.reviewFxRate(
        req.params.id,
        "APPROVED",
        req.user!.id,
        req.body.reason,
        getExpectedVersion(req)
      )
    );
  }
  static rejectFxRate(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentMarketDataFacadeService.reviewFxRate(
        req.params.id,
        "REJECTED",
        req.user!.id,
        req.body.reason,
        getExpectedVersion(req)
      )
    );
  }

  // Orders
  static listOrders(req: AuthRequest, res: Response) {
    const list = parseInvestmentListQuery(req.query as Record<string, unknown>);
    handle(
      res,
      InvestmentOrderPhase2Service.list(req.user!.id, req.user, {
        status: req.query.status as string,
        fundId: req.query.fundId as string,
        ...list,
      })
    );
  }
  static previewOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.preview(req.body, getIdempotencyKey(req), req.user!.id, req.user),
      201
    );
  }
  static getOrder(req: AuthRequest, res: Response) {
    handle(res, InvestmentOrderPhase2Service.get(req.params.id, req.user!.id, req.user));
  }
  static createOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.create(
        req.body,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static updateOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.update(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static deleteOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.remove(
        req.params.id,
        getExpectedVersion(req),
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      )
    );
  }
  static orderHistory(req: AuthRequest, res: Response) {
    handle(res, InvestmentOrderPhase2Service.history(req.params.id, req.user!.id, req.user));
  }
  static submitOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.submit(
        req.params.id,
        getExpectedVersion(req),
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      )
    );
  }
  static approveOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.decide(
        req.params.id,
        "APPROVE",
        getExpectedVersion(req),
        getIdempotencyKey(req),
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static sendOrderToBroker(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.route(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static rejectOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.decide(
        req.params.id,
        "REJECT",
        getExpectedVersion(req),
        getIdempotencyKey(req),
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static cancelOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.get(req.params.id, req.user!.id, req.user).then((order: any) =>
        InvestmentOrderPhase2Service.transition(
          req.params.id,
          "CANCELLED",
          resolveExpectedVersion(req, order.version),
          getIdempotencyKey(req),
          req.user!.id,
          req.user,
          "CANCEL",
          req.body.reason
        )
      )
    );
  }
  static complianceCheckOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.get(req.params.id, req.user!.id, req.user).then((order: any) => {
        if (String(order.version) !== getExpectedVersion(req)) {
          throw new InvestmentOpsError(
            "VERSION_CONFLICT",
            "Order has changed since it was read",
            409,
            { expectedVersion: getExpectedVersion(req), currentVersion: String(order.version) }
          );
        }
        return InvestmentComplianceService.runForOrder(
          order.id,
          order.currentRevisionNo,
          getIdempotencyKey(req),
          req.user!.id,
          req.user
        );
      }),
      201
    );
  }
  static executeOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderService.executeOrder(
        req.params.id,
        req.user!.id,
        req.user,
        getIdempotencyKey(req),
        {
          quantity: req.body?.quantity != null ? Number(req.body.quantity) : undefined,
          partialFillQuantity:
            req.body?.partialFillQuantity != null
              ? Number(req.body.partialFillQuantity)
              : req.body?.filledQuantity != null
                ? Number(req.body.filledQuantity)
                : undefined,
          executionPrice:
            req.body?.executionPrice != null ? Number(req.body.executionPrice) : undefined,
        }
      )
    );
  }
  static failOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderService.fail(req.params.id, req.user!.id, String(req.body?.reason || ""), req.user)
    );
  }
  static archiveOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderService.archive(
        req.params.id,
        req.user!.id,
        req.body?.reason as string | undefined,
        req.user
      )
    );
  }
  static listOrderExecutions(req: AuthRequest, res: Response) {
    handle(res, InvestmentOrderPhase2Service.executions(req.params.id, req.user!.id, req.user));
  }
  static recordOrderExecution(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.recordExecution(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static confirmOrderTrade(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.confirmation(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      )
    );
  }
  static settleOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderPhase2Service.settlement(
        req.params.id,
        {
          ...req.body,
          allowDeferredAccounting:
            req.body?.allowDeferredAccounting ?? req.query.allowDeferredAccounting,
        },
        getExpectedVersion(req),
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      )
    );
  }
  static attachOrderDocument(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.attachToOrder(
        req.params.id,
        req.body,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  /** SRD: confirm trade via linked investment order when present; also advance LE broker hop. */
  static confirmTradeAlias(req: AuthRequest, res: Response) {
    handle(
      res,
      (async () => {
        const tradeId = req.params.id;
        const order = await prisma.investmentOrder.findFirst({
          where: { tradeId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, version: true, orderRef: true, brokerProfileId: true },
        });
        if (!order) {
          throw new InvestmentOpsError(
            "ORDER_NOT_FOUND_FOR_TRADE",
            "No investment order linked to this trade",
            404
          );
        }
        const route = await InvestmentOrderPhase2Service.confirmation(
          order.id,
          {
            ...req.body,
            externalOrderRef:
              req.body?.externalOrderRef || `BRK-${order.orderRef || tradeId.slice(-8)}`,
          },
          resolveExpectedVersion(req, order.version),
          getIdempotencyKey(req),
          req.user!.id,
          req.user
        );

        // Blotter Confirm also advances the listed-equity BROKER hop when still open.
        const brokerHop = await prisma.listedEquityTradeRoutingHop.findFirst({
          where: {
            tradeId,
            target: "BROKER",
            status: { in: ["STAGED", "DISPATCHED", "RETRYING"] },
          },
          orderBy: { createdAt: "asc" },
        });
        let hop = null as any;
        if (brokerHop) {
          hop = await TradeOrchestratorService.confirmHop(
            brokerHop.id,
            req.user!.id,
            route.externalOrderRef || req.body?.externalOrderRef
          );
        }

        const trade = await TradeOrchestratorService.getTradeDetail(tradeId);
        const [linked] = await InvestmentOrderService.attachOrderLinks([trade]);
        return {
          route,
          hop,
          trade: InvestmentOrderService.enrichTradeBlotter(linked),
        };
      })()
    );
  }
  static settleTradeAlias(req: AuthRequest, res: Response) {
    handle(
      res,
      (async () => {
        const tradeId = req.params.id;
        const order = await prisma.investmentOrder.findFirst({
          where: { tradeId },
          orderBy: { updatedAt: "desc" },
          select: { id: true, version: true },
        });
        if (!order) {
          throw new InvestmentOpsError(
            "ORDER_NOT_FOUND_FOR_TRADE",
            "No investment order linked to this trade",
            404
          );
        }
        return InvestmentOrderPhase2Service.settlement(
          order.id,
          {
            ...req.body,
            allowDeferredAccounting:
              req.body?.allowDeferredAccounting ?? req.query.allowDeferredAccounting,
          },
          resolveExpectedVersion(req, order.version),
          getIdempotencyKey(req),
          req.user!.id,
          req.user
        );
      })()
    );
  }

  // Trades (enriched blotter)
  static async listTradesEnriched(req: AuthRequest, res: Response) {
    try {
      const scope = await ListedEquityAccessService.getAccessibleFundIds(req.user!.id, req.user);
      if (req.query.fundId) {
        await ListedEquityAccessService.assertFundAccess(
          req.user!.id,
          req.query.fundId as string,
          req.user
        );
      }
      const data = await TradeOrchestratorService.listTrades({
        fundId: req.query.fundId as string,
        status: req.query.status as string,
        fundScope: scope,
      });
      const withOrders = await InvestmentOrderService.attachOrderLinks(data);
      const enriched = withOrders.map((t: any) => InvestmentOrderService.enrichTradeBlotter(t));
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
      const total = enriched.length;
      const start = (page - 1) * pageSize;
      res.json({
        success: true,
        data: {
          items: enriched.slice(start, start + pageSize),
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize) || 1,
        },
      });
    } catch (e: any) {
      sendInvestmentOpsError(res, e);
    }
  }
  static getTrade(req: AuthRequest, res: Response) {
    handle(
      res,
      (async () => {
        const trade = await TradeOrchestratorService.getTradeDetail(req.params.id);
        if (!trade) throw new InvestmentOpsError("NOT_FOUND", "Trade not found", 404);
        await ListedEquityAccessService.assertFundAccess(req.user!.id, trade.fundId, req.user);
        const [linked] = await InvestmentOrderService.attachOrderLinks([trade]);
        return InvestmentOrderService.enrichTradeBlotter(linked);
      })()
    );
  }
  static executeTrade(req: AuthRequest, res: Response) {
    return ListedEquityTradeController.execute(req, res);
  }
  static tradeRoutingHops(req: AuthRequest, res: Response) {
    return ListedEquityTradeController.routingHops(req, res);
  }
  static tradeConfirmHop(req: AuthRequest, res: Response) {
    return ListedEquityTradeController.confirmHop(req, res);
  }
  static tradeRetryHop(req: AuthRequest, res: Response) {
    return ListedEquityTradeController.retryHop(req, res);
  }
  static async tradeCancelHop(req: AuthRequest, res: Response) {
    try {
      const hop = await prisma.listedEquityTradeRoutingHop.findUnique({
        where: { id: req.params.hopId },
        include: { trade: true },
      });
      if (!hop) return res.status(404).json({ success: false, message: "Hop not found" });
      await ListedEquityAccessService.assertFundAccess(req.user!.id, hop.trade.fundId, req.user);
      const data = await TradeOrchestratorService.cancelHop(
        req.params.hopId,
        req.user!.id,
        req.body?.reason
      );
      res.json({ success: true, data });
    } catch (e: any) {
      sendInvestmentOpsError(res, e);
    }
  }
  static tradeSettlementDoc(req: AuthRequest, res: Response) {
    return ListedEquityTradeController.settlementDocument(req, res);
  }

  // Compliance
  static listComplianceRules(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentComplianceService.listRules(req.query.fundId as string, req.user!.id, req.user)
    );
  }
  static createComplianceRule(req: AuthRequest, res: Response) {
    handle(res, InvestmentComplianceService.createRule(req.body, req.user!.id, req.user), 201);
  }
  static complianceOverride(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentComplianceService.override({
        orderId: req.body.orderId,
        reason: req.body.reason,
        userId: req.user!.id,
        user: req.user,
        documentId: req.body.documentId,
      })
    );
  }
  static getComplianceRule(req: AuthRequest, res: Response) {
    handle(res, InvestmentComplianceService.getRule(req.params.id, req.user!.id, req.user));
  }
  static updateComplianceRule(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentComplianceService.updateRule(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static archiveComplianceRule(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentComplianceService.updateRule(
        req.params.id,
        { isActive: false },
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static listComplianceRuns(req: AuthRequest, res: Response) {
    handle(res, InvestmentComplianceService.listRuns(req.query, req.user!.id, req.user));
  }
  static listComplianceResults(req: AuthRequest, res: Response) {
    handle(res, InvestmentComplianceService.listResults(req.query, req.user!.id, req.user));
  }
  static getComplianceRun(req: AuthRequest, res: Response) {
    handle(res, InvestmentComplianceService.getRun(req.params.id, req.user!.id, req.user));
  }
  static requestComplianceOverride(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentComplianceService.requestOverride(
        { ...(req.query || {}), ...(req.body || {}) },
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static listComplianceOverrides(req: AuthRequest, res: Response) {
    handle(res, InvestmentComplianceService.listOverrides(req.query, req.user!.id, req.user));
  }
  static approveComplianceOverride(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentComplianceService.decideOverride(
        req.params.id,
        "APPROVED",
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static rejectComplianceOverride(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentComplianceService.decideOverride(
        req.params.id,
        "REJECTED",
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }

  // Simulation
  static runSimulation(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentSimulationService.run(
        req.body.fundId,
        req.user!.id,
        req.user,
        getIdempotencyKey(req),
        req.body.scenario
      ),
      201
    );
  }
  static getSimulation(req: AuthRequest, res: Response) {
    handle(res, InvestmentSimulationService.get(req.params.id, req.user!.id, req.user));
  }
  static listSimulations(req: AuthRequest, res: Response) {
    handle(res, InvestmentSimulationService.list(req.query, req.user!.id, req.user));
  }

  // Model portfolios
  static listModelPortfolios(req: AuthRequest, res: Response) {
    handle(res, InvestmentModelPortfolioService.list());
  }
  static createModelPortfolio(req: AuthRequest, res: Response) {
    handle(res, InvestmentModelPortfolioService.create(req.body), 201);
  }
  static modelDrift(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentModelPortfolioService.drift(
        req.params.id,
        req.query.fundId as string,
        req.user!.id,
        req.user
      )
    );
  }
  static getModelPortfolio(req: AuthRequest, res: Response) {
    handle(res, InvestmentModelPortfolioService.get(req.params.id));
  }
  static updateModelPortfolio(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentModelPortfolioService.update(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        req.user!.id
      )
    );
  }
  static activateModelPortfolio(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentModelPortfolioService.activate(
        req.params.id,
        getExpectedVersion(req),
        req.user!.id
      )
    );
  }
  static archiveModelPortfolio(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentModelPortfolioService.archive(req.params.id, getExpectedVersion(req))
    );
  }
  static recommendModelRebalance(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentModelPortfolioService.recommend(
        req.params.id,
        req.body.fundId,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static convertRebalanceToOrders(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentModelPortfolioService.convertToDraftOrders(
        req.params.id,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }

  // Phase 2 trading configuration, blotters, positions and views
  static getOrderConfiguration(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.orderConfiguration(req.params.fundId, req.user!.id, req.user)
    );
  }
  static updateOrderConfiguration(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.updateOrderConfiguration(
        req.params.fundId,
        req.body,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static listApprovalRoutes(_req: AuthRequest, res: Response) {
    handle(res, InvestmentTradingPhase2Service.approvalRoutes());
  }
  static createApprovalRoute(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.createApprovalRoute(
        req.body,
        getExpectedVersion(req),
        req.user!.id
      ),
      201
    );
  }
  static updateApprovalRoute(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.updateApprovalRoute(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        req.user!.id
      )
    );
  }
  static deleteApprovalRoute(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.removeApprovalRoute(
        req.params.id,
        getExpectedVersion(req),
        req.user!.id
      )
    );
  }
  static applicableApprovalRoutes(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.applicableApprovalRoutes(
        req.params.id,
        req.user!.id,
        req.user
      )
    );
  }
  static listBlotters(req: AuthRequest, res: Response) {
    handle(res, InvestmentTradingPhase2Service.blotters(req.query, req.user!.id, req.user));
  }
  static createBlotter(req: AuthRequest, res: Response) {
    handle(res, InvestmentTradingPhase2Service.createBlotter(req.body, req.user!.id, req.user), 201);
  }
  static getBlotter(req: AuthRequest, res: Response) {
    handle(res, InvestmentTradingPhase2Service.getBlotter(req.params.id, req.user!.id, req.user));
  }
  static updateBlotter(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.updateBlotter(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static addBlotterOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.addBlotterOrder(
        req.params.id,
        req.body.orderId,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static removeBlotterOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.removeBlotterOrder(
        req.params.id,
        req.params.orderId,
        getExpectedVersion(req),
        req.user!.id,
        req.user
      )
    );
  }
  static tradingPositions(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.positions(req.params.fundId, req.user!.id, req.user)
    );
  }
  static tradingPositionsByQuery(req: AuthRequest, res: Response) {
    const fundId = String(req.query.fundId || "").trim();
    if (!fundId) {
      return sendInvestmentOpsError(
        res,
        new InvestmentOpsError("VALIDATION_ERROR", "fundId is required", 400, { field: "fundId" })
      );
    }
    handle(res, InvestmentTradingPhase2Service.positions(fundId, req.user!.id, req.user));
  }
  static tradingPositionSummary(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.positionSummary(req.params.fundId, req.user!.id, req.user)
    );
  }
  static tradingSummaryByQuery(req: AuthRequest, res: Response) {
    const fundId = String(req.query.fundId || "").trim();
    if (!fundId) {
      return sendInvestmentOpsError(
        res,
        new InvestmentOpsError("VALIDATION_ERROR", "fundId is required", 400, { field: "fundId" })
      );
    }
    handle(res, InvestmentTradingPhase2Service.positionSummary(fundId, req.user!.id, req.user));
  }
  static recalculateTradingPositions(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.recalculatePositions(
        req.params.fundId,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      202
    );
  }
  static recalculateTradingByQuery(req: AuthRequest, res: Response) {
    const fundId = String(req.query.fundId || req.body?.fundId || "").trim();
    if (!fundId) {
      return sendInvestmentOpsError(
        res,
        new InvestmentOpsError("VALIDATION_ERROR", "fundId is required", 400, { field: "fundId" })
      );
    }
    handle(
      res,
      InvestmentTradingPhase2Service.recalculatePositions(
        fundId,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      202
    );
  }
  static listTradingSavedViews(req: AuthRequest, res: Response) {
    handle(res, InvestmentTradingPhase2Service.savedViews("TRADING_POSITIONS", req.user!.id));
  }
  static createTradingSavedView(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.createSavedView("TRADING_POSITIONS", req.body, req.user!.id),
      201
    );
  }
  static updateTradingSavedView(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.updateSavedView(
        req.params.id,
        req.body,
        getExpectedVersion(req),
        req.user!.id
      )
    );
  }
  static deleteTradingSavedView(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentTradingPhase2Service.deleteSavedView(
        req.params.id,
        getExpectedVersion(req),
        req.user!.id
      )
    );
  }

  // Valuation
  static runValuation(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.createRun(
        req.body,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      202
    );
  }
  static listValuationRuns(req: AuthRequest, res: Response) {
    handle(res, InvestmentValuationService.listRuns(req.query, req.user!.id, req.user));
  }
  static getValuationRun(req: AuthRequest, res: Response) {
    handle(res, InvestmentValuationService.getRun(req.params.id, req.user!.id, req.user));
  }
  static valuationRunInputs(req: AuthRequest, res: Response) {
    handle(res, InvestmentValuationService.listInputs(req.params.id, req.user!.id, req.user));
  }
  static valuationRunItems(req: AuthRequest, res: Response) {
    handle(res, InvestmentValuationService.listItems(req.params.id, req.user!.id, req.user));
  }
  static valuationRunSummary(req: AuthRequest, res: Response) {
    handle(res, InvestmentValuationService.summary(req.params.id, req.user!.id, req.user));
  }
  static cancelValuationRun(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.cancel(req.params.id, req.user!.id, req.user, req.body.reason)
    );
  }
  static rerunValuation(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.rerun(
        req.params.id,
        getIdempotencyKey(req),
        req.user!.id,
        req.user,
        req.body.processNow !== false
      ),
      202
    );
  }
  static valuationExceptions(req: AuthRequest, res: Response) {
    handle(res, InvestmentValuationService.listExceptions(req.query, req.user!.id, req.user));
  }
  static getValuationException(req: AuthRequest, res: Response) {
    handle(res, InvestmentValuationService.getException(req.params.id, req.user!.id, req.user));
  }
  static resolveValuationException(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.resolveException(req.params.id, req.user!.id, req.user, req.body)
    );
  }
  static overrideValuationException(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.requestOverride(req.params.id, req.user!.id, req.user, req.body)
    );
  }
  static approveValuationOverride(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.approveOverride(
        req.params.id,
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static rejectValuationOverride(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.rejectOverride(
        req.params.id,
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static escalateValuationException(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.escalate(req.params.id, req.user!.id, req.user, req.body.reason)
    );
  }
  static valuationPriceValidation(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.priceValidation(
        req.query.fundId as string,
        req.user!.id,
        req.user
      )
    );
  }
  static valuationFxValidation(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.fxValidation(req.query.fundId as string, req.user!.id, req.user)
    );
  }

  // Reconciliation
  static uploadReconciliationFile(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.createUpload(
        req.body,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static runReconciliation(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.run(
        req.body,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static listReconBatches(req: AuthRequest, res: Response) {
    handle(res, InvestmentReconciliationService.listBatches(req.query, req.user!.id, req.user));
  }
  static getReconBatch(req: AuthRequest, res: Response) {
    handle(res, InvestmentReconciliationService.getBatch(req.params.id, req.user!.id, req.user));
  }
  static listReconItems(req: AuthRequest, res: Response) {
    handle(res, InvestmentReconciliationService.listItems(req.query, req.user!.id, req.user));
  }
  static getReconItem(req: AuthRequest, res: Response) {
    handle(res, InvestmentReconciliationService.getItem(req.params.id, req.user!.id, req.user));
  }
  static assignReconItem(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.assign(
        req.params.id,
        req.user!.id,
        req.user,
        req.body.assigneeId,
        req.body.reason
      )
    );
  }
  static investigateReconItem(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.investigate(
        req.params.id,
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static resolveReconItem(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.resolve(
        req.params.id,
        req.user!.id,
        req.user,
        req.body.reason,
        req.body.documentId
      )
    );
  }
  static escalateReconItem(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.escalate(
        req.params.id,
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static writeOffReconItem(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.writeOff(
        req.params.id,
        req.user!.id,
        req.user,
        req.body.reason,
        req.body.documentId
      )
    );
  }
  static approveReconWriteOff(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.approveWriteOff(
        req.params.id,
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static rejectReconWriteOff(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.rejectWriteOff(
        req.params.id,
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static reopenReconItem(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.reopen(
        req.params.id,
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static reconItemHistory(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.itemHistory(req.params.id, req.user!.id, req.user)
    );
  }
  static reconSummary(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.summary(
        req.query.fundId as string,
        req.user!.id,
        req.user,
        req.query.reconType as string | undefined
      )
    );
  }

  // Accounting
  static listAccountingEvents(req: AuthRequest, res: Response) {
    const list = parseInvestmentListQuery(req.query as Record<string, unknown>);
    handle(
      res,
      InvestmentAccountingFacadeService.listEvents(req.user!.id, req.user, {
        fundId: req.query.fundId as string,
        status: req.query.status as string,
        ...list,
      })
    );
  }
  static accountingPostingStatus(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.postingStatus(req.user!.id, req.user, {
        fundId: req.query.fundId as string,
      })
    );
  }
  static getAccountingEvent(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.getEvent(req.params.id, req.user!.id, req.user)
    );
  }
  static retryAccountingEvent(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.retryEvent(
        req.params.id,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      )
    );
  }
  static listAccountingJournals(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.listJournals(req.user!.id, req.user, req.query)
    );
  }
  static getAccountingJournal(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.getJournal(req.params.id, req.user!.id, req.user)
    );
  }
  static submitAccountingJournal(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.journalWorkflow(
        req.params.id,
        "SUBMIT",
        getIdempotencyKey(req),
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static approveAccountingJournal(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.journalWorkflow(
        req.params.id,
        "APPROVE",
        getIdempotencyKey(req),
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static rejectAccountingJournal(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.journalWorkflow(
        req.params.id,
        "REJECT",
        getIdempotencyKey(req),
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static postAccountingJournal(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.journalWorkflow(
        req.params.id,
        "POST",
        getIdempotencyKey(req),
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static listAccountingReversals(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.listReversals(req.user!.id, req.user, req.query)
    );
  }
  static reverseAccountingEvent(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.requestReversal(
        req.params.id,
        req.body.reason,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static approveAccountingReversal(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.approveReversal(
        req.params.id,
        getIdempotencyKey(req),
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static rejectAccountingReversal(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.rejectReversal(
        req.params.id,
        getIdempotencyKey(req),
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static createLedgerExport(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.createLedgerExport(
        req.body,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static listLedgerExports(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.listLedgerExports(req.user!.id, req.user, req.query)
    );
  }
  static getLedgerExport(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.getLedgerExport(req.params.id, req.user!.id, req.user)
    );
  }
  static async downloadLedgerExport(req: AuthRequest, res: Response) {
    try {
      const file = await InvestmentAccountingFacadeService.downloadLedgerExport(
        req.params.id,
        req.user!.id,
        req.user
      );
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
      if (file.payloadHash) res.setHeader("X-Checksum-SHA256", file.payloadHash);
      res.send(file.content);
    } catch (e: any) {
      sendInvestmentOpsError(res, e);
    }
  }

  // Documentation / files
  static createUploadSession(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.createUploadSession(
        req.body,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static uploadFile(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.uploadFile(req.body, req.user!.id, req.user),
      201
    );
  }
  static completeFile(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.completeFile(req.params.fileId, req.user!.id, req.user)
    );
  }
  static fileStatus(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.fileStatus(req.params.fileId, req.user!.id, req.user)
    );
  }
  static listDocuments(req: AuthRequest, res: Response) {
    handle(res, InvestmentDocumentationService.list(req.user!.id, req.user, req.query));
  }
  static uploadDocument(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.createDocument(
        req.body,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static getDocument(req: AuthRequest, res: Response) {
    handle(res, InvestmentDocumentationService.get(req.params.id, req.user!.id, req.user));
  }
  static patchDocument(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.patch(req.params.id, req.body, req.user!.id, req.user)
    );
  }
  static listDocumentVersions(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.listVersions(req.params.id, req.user!.id, req.user)
    );
  }
  static addDocumentVersion(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.addVersion(
        req.params.id,
        req.body,
        getIdempotencyKey(req),
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static async previewDocumentVersion(req: AuthRequest, res: Response) {
    try {
      const file = await InvestmentDocumentationService.openVersionStream(
        req.params.id,
        req.params.versionId,
        req.user!.id,
        req.user,
        "preview"
      );
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", file.contentDisposition);
      file.stream.pipe(res);
    } catch (e: any) {
      sendInvestmentOpsError(res, e);
    }
  }
  static async downloadDocumentVersion(req: AuthRequest, res: Response) {
    try {
      const file = await InvestmentDocumentationService.openVersionStream(
        req.params.id,
        req.params.versionId,
        req.user!.id,
        req.user,
        "download"
      );
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", file.contentDisposition);
      file.stream.pipe(res);
    } catch (e: any) {
      sendInvestmentOpsError(res, e);
    }
  }
  static approveDocumentVersion(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.versionDecision(
        req.params.id,
        req.params.versionId,
        "APPROVE",
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static requestDocumentChanges(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.versionDecision(
        req.params.id,
        req.params.versionId,
        "REQUEST_CHANGES",
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static rejectDocumentVersion(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.versionDecision(
        req.params.id,
        req.params.versionId,
        "REJECT",
        req.user!.id,
        req.user,
        req.body.reason
      )
    );
  }
  static getDocumentAccess(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.getAccess(req.params.id, req.user!.id, req.user)
    );
  }
  static putDocumentAccess(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.putAccess(
        req.params.id,
        req.body.entries || req.body,
        req.user!.id,
        req.user
      )
    );
  }
  static documentAudit(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.audit(req.params.id, req.user!.id, req.user)
    );
  }
  static archiveDocument(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.archive(req.params.id, req.user!.id, req.user)
    );
  }
  /** @deprecated unsafe path download — redirects to current version download semantics */
  static async downloadDocument(req: AuthRequest, res: Response) {
    try {
      const file = await InvestmentDocumentationService.openDocumentDownload(
        req.params.id,
        req.user!.id,
        req.user,
        "download"
      );
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", file.contentDisposition);
      file.stream.pipe(res);
    } catch (e: any) {
      sendInvestmentOpsError(res, e);
    }
  }

  // Reporting
  static listReportTemplates(req: AuthRequest, res: Response) {
    handle(res, Promise.resolve(InvestmentReportingService.listTemplates()));
  }
  static listReports(req: AuthRequest, res: Response) {
    const list = parseInvestmentListQuery(req.query as Record<string, unknown>);
    handle(
      res,
      InvestmentReportingService.list(req.user!.id, req.user, {
        fundId: req.query.fundId as string | undefined,
        reportType: req.query.reportType as string | undefined,
        status: req.query.status as string | undefined,
        ...list,
      })
    );
  }
  static generateReport(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReportingService.generate(req.user!.id, req.user, {
        ...req.body,
        idempotencyKey: (req as any).investmentOps?.idempotencyKey,
      }),
      202
    );
  }
  static getReport(req: AuthRequest, res: Response) {
    handle(res, InvestmentReportingService.getDetail(req.params.id, req.user!.id, req.user));
  }
  static reportAudit(req: AuthRequest, res: Response) {
    handle(res, InvestmentReportingService.audit(req.params.id, req.user!.id, req.user));
  }
  static cancelReport(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReportingService.cancel(req.params.id, req.user!.id, req.user, req.body?.reason)
    );
  }
  static retryReport(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReportingService.retry(
        req.params.id,
        req.user!.id,
        req.user,
        (req as any).investmentOps?.idempotencyKey
      ),
      202
    );
  }
  static async downloadReport(req: AuthRequest, res: Response) {
    try {
      const run = await InvestmentReportingService.assertDownloadable(
        req.params.id,
        req.user!.id,
        req.user
      );
      res.setHeader("Content-Type", InvestmentReportingService.contentTypeForRun(run));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${InvestmentReportingService.downloadFilename(run)}"`
      );
      const meta = (run.parametersJson as any)?._platform;
      if (meta?.checksumSha256) {
        res.setHeader("X-Checksum-Sha256", meta.checksumSha256);
      }
      InvestmentReportingService.openDownloadStream(run.fileRef!).pipe(res);
    } catch (e: any) {
      sendInvestmentOpsError(res, e);
    }
  }

  // Phase 4 platform: jobs / outbox / audit / capabilities
  static getJob(req: AuthRequest, res: Response) {
    handle(
      res,
      (async () => {
        const { InvestmentJobWorkerService } = await import(
          "../services/investmentOps/InvestmentJobWorkerService"
        );
        const { permittedActionsFor } = await import(
          "../services/investmentOps/InvestmentCapabilitiesService"
        );
        const job = await InvestmentJobWorkerService.get(
          req.params.jobId,
          req.user!.id,
          req.user
        );
        return { ...job, permittedActions: permittedActionsFor(req.user, "job", job.status) };
      })()
    );
  }
  static cancelJob(req: AuthRequest, res: Response) {
    handle(
      res,
      (async () => {
        const { InvestmentJobWorkerService } = await import(
          "../services/investmentOps/InvestmentJobWorkerService"
        );
        return InvestmentJobWorkerService.cancel(req.params.jobId, req.body?.reason);
      })()
    );
  }
  static listOutboxEvents(req: AuthRequest, res: Response) {
    const list = parseInvestmentListQuery(req.query as Record<string, unknown>);
    handle(
      res,
      (async () => {
        const { InvestmentOutboxService } = await import(
          "../services/investmentOps/InvestmentOutboxService"
        );
        return InvestmentOutboxService.list({
          status: req.query.status as string | undefined,
          aggregateType: req.query.aggregateType as string | undefined,
          eventType: req.query.eventType as string | undefined,
          ...list,
        });
      })()
    );
  }
  static pollOutboxEvents(req: AuthRequest, res: Response) {
    handle(
      res,
      (async () => {
        const { InvestmentOutboxService } = await import(
          "../services/investmentOps/InvestmentOutboxService"
        );
        const items = await InvestmentOutboxService.pollPending(Number(req.query.limit) || 50);
        return { items };
      })()
    );
  }
  static listAuditEvents(req: AuthRequest, res: Response) {
    const list = parseInvestmentListQuery(req.query as Record<string, unknown>);
    handle(
      res,
      (async () => {
        const { InvestmentAuditEventService } = await import(
          "../services/investmentOps/InvestmentAuditEventService"
        );
        return InvestmentAuditEventService.list({
          aggregateType: req.query.aggregateType as string | undefined,
          aggregateId: req.query.aggregateId as string | undefined,
          actorId: req.query.actorId as string | undefined,
          eventType: req.query.eventType as string | undefined,
          correlationId: req.query.correlationId as string | undefined,
          ...list,
        });
      })()
    );
  }
  static getCapabilities(req: AuthRequest, res: Response) {
    handle(
      res,
      (async () => {
        const { InvestmentCapabilitiesService } = await import(
          "../services/investmentOps/InvestmentCapabilitiesService"
        );
        return InvestmentCapabilitiesService.get(
          req.user!.id,
          req.user,
          req.query.fundId as string | undefined
        );
      })()
    );
  }

  // Setup — listed-equity funds (Investment Operations module)
  static listInvestmentFunds(req: AuthRequest, res: Response) {
    handle(res, InvestmentFundService.list(req.user!.id, req.user));
  }
  static getInvestmentFund(req: AuthRequest, res: Response) {
    handle(res, InvestmentFundService.getById(req.params.id, req.user!.id, req.user));
  }
  static createInvestmentFund(req: AuthRequest, res: Response) {
    handle(res, InvestmentFundService.create(req.body, req.user!.id), 201);
  }
  static updateInvestmentFund(req: AuthRequest, res: Response) {
    handle(res, InvestmentFundService.update(req.params.id, req.body, req.user!.id, req.user));
  }
  static updateInvestmentFundConfig(req: AuthRequest, res: Response) {
    handle(res, InvestmentFundService.updateConfig(req.params.id, req.body, req.user!.id, req.user));
  }
  static addInvestmentFundManager(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentFundService.addManager(
        req.params.id,
        req.body.userId,
        req.body.role,
        req.user!.id,
        req.user
      ),
      201
    );
  }

  // Setup
  static listBrokers(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.listBrokers());
  }
  static createBroker(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.createBroker(req.body), 201);
  }
  static listCustodians(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.listCustodians());
  }
  static createCustodian(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.createCustodian(req.body), 201);
  }
  static listCommissions(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.listCommissions(req.query.stakeholderProfileId as string));
  }
  static createCommission(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.createCommission(req.body), 201);
  }
  static listMarkets(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.listMarkets());
  }
  static createMarket(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.createMarket(req.body), 201);
  }
  static listSetupCurrencies(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.listCurrencies());
  }
  static listCountries(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.listCountries());
  }
  static createCountry(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.createCountry(req.body), 201);
  }
  static listIssuers(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.listIssuers(req.query.countryCode as string));
  }
  static createIssuer(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.createIssuer(req.body), 201);
  }
  static priceSources(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.priceSources());
  }
  static getSettings(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.getSettings());
  }
  static updateSettings(req: AuthRequest, res: Response) {
    handle(res, InvestmentSetupService.updateSettings(req.body, req.user!.id));
  }

  // Phase 1 canonical reference catalogs
  static referenceTypes(_req: AuthRequest, res: Response) {
    handle(res, Promise.resolve(InvestmentOpsReferenceService.types()));
  }
  static listReferences(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsReferenceService.list(req.params.type, req.query));
  }
  static getReference(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsReferenceService.get(req.params.type, req.params.id));
  }
  static createReference(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsReferenceService.create(req.params.type, req.body, req.user!.id),
      201
    );
  }
  static updateReference(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsReferenceService.update(
        req.params.type,
        req.params.id,
        req.body,
        getExpectedVersion(req),
        req.user!.id
      )
    );
  }
  static archiveReference(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOpsReferenceService.archive(
        req.params.type,
        req.params.id,
        getExpectedVersion(req),
        req.user!.id
      )
    );
  }
}
