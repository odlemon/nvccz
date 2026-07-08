// @ts-nocheck
import { createReadStream } from "fs";
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
import { ListedEquityAccessService } from "../services/listedEquity/ListedEquityAccessService";
import { TradeOrchestratorService } from "../services/listedEquity/TradeOrchestratorService";
import { prisma } from "../utils/database";
import { ListedEquityMarketDataController } from "./ListedEquityMarketDataController";
import { ListedEquityTradeController } from "./ListedEquityTradeController";

function handle(res: Response, promise: Promise<unknown>, successStatus = 200) {
  promise
    .then((data) => res.status(successStatus).json({ success: true, data }))
    .catch((e: any) => {
      const status =
        e.message === "FORBIDDEN_FUND_ACCESS"
          ? 403
          : e.message === "FUND_NOT_LISTED_EQUITY"
            ? 400
            : e.message === "Not found" || e.message === "FUND_NOT_FOUND"
              ? 404
              : 400;
      res.status(status).json({ success: false, message: e.message });
    });
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
    handle(res, InvestmentOpsDashboardService.recalculate(req.user!.id, req.user, req.body.fundId));
  }

  // Portfolios
  static listPortfolios(req: AuthRequest, res: Response) {
    handle(res, InvestmentOpsPortfolioService.list(req.user!.id, req.user));
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

  // Instruments
  static listInstrumentTypes(req: AuthRequest, res: Response) {
    handle(res, InvestmentInstrumentService.listTypes());
  }
  static listInstruments(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentInstrumentService.list({
        type: req.query.type as string,
        exchange: req.query.exchange as string,
        status: req.query.status as string,
        page: Number(req.query.page),
        pageSize: Number(req.query.pageSize),
      })
    );
  }
  static getInstrument(req: AuthRequest, res: Response) {
    handle(res, InvestmentInstrumentService.get(req.params.id));
  }
  static createInstrument(req: AuthRequest, res: Response) {
    handle(res, InvestmentInstrumentService.create(req.body, req.user!.id), 201);
  }
  static updateInstrument(req: AuthRequest, res: Response) {
    handle(res, InvestmentInstrumentService.update(req.params.id, req.body));
  }
  static approveInstrument(req: AuthRequest, res: Response) {
    handle(res, InvestmentInstrumentService.approve(req.params.id, req.user!.id));
  }

  // Market data facade + delegate legacy
  static marketDataLatest(req: AuthRequest, res: Response) {
    handle(res, InvestmentMarketDataFacadeService.latestPrices());
  }
  static marketDataStale(req: AuthRequest, res: Response) {
    handle(res, InvestmentMarketDataFacadeService.stalePrices(Number(req.query.hours) || 24));
  }
  static marketDataManual(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentMarketDataFacadeService.manualPriceEntry({ ...req.body, userId: req.user!.id })
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
    return ListedEquityMarketDataController.approveTick(req, res);
  }
  static marketDataRejectTick(req: AuthRequest, res: Response) {
    return ListedEquityMarketDataController.rejectTick(req, res);
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

  // Orders
  static listOrders(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderService.list(req.user!.id, req.user, {
        status: req.query.status as string,
        fundId: req.query.fundId as string,
        page: Number(req.query.page),
        pageSize: Number(req.query.pageSize),
      })
    );
  }
  static previewOrder(req: AuthRequest, res: Response) {
    handle(res, InvestmentOrderService.preview(req.body, req.user!.id, req.user));
  }
  static getOrder(req: AuthRequest, res: Response) {
    handle(res, InvestmentOrderService.get(req.params.id));
  }
  static createOrder(req: AuthRequest, res: Response) {
    handle(res, InvestmentOrderService.create(req.body, req.user!.id), 201);
  }
  static submitOrder(req: AuthRequest, res: Response) {
    handle(res, InvestmentOrderService.submit(req.params.id, req.user!.id));
  }
  static approveOrder(req: AuthRequest, res: Response) {
    handle(res, InvestmentOrderService.approve(req.params.id, req.user!.id));
  }
  static sendOrderToBroker(req: AuthRequest, res: Response) {
    handle(res, InvestmentOrderService.sendToBroker(req.params.id, req.user!.id));
  }
  static rejectOrder(req: AuthRequest, res: Response) {
    handle(res, InvestmentOrderService.reject(req.params.id, req.user!.id, req.body.reason || ""));
  }
  static cancelOrder(req: AuthRequest, res: Response) {
    handle(res, InvestmentOrderService.cancel(req.params.id, req.user!.id, req.body.reason));
  }
  static complianceCheckOrder(req: AuthRequest, res: Response) {
    handle(res, InvestmentComplianceService.checkOrder(req.params.id));
  }
  static executeOrder(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentOrderService.executeOrder(
        req.params.id,
        req.user!.id,
        req.headers["idempotency-key"] as string
      )
    );
  }

  // Trades (enriched blotter)
  static async listTradesEnriched(req: AuthRequest, res: Response) {
    try {
      const scope = await ListedEquityAccessService.getAccessibleFundIds(req.user!.id, req.user);
      const data = await TradeOrchestratorService.listTrades({
        fundId: req.query.fundId as string,
        status: req.query.status as string,
        fundScope: scope,
      });
      res.json({
        success: true,
        data: data.map((t: any) => InvestmentOrderService.enrichTradeBlotter(t)),
      });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
  static getTrade(req: AuthRequest, res: Response) {
    return ListedEquityTradeController.get(req, res);
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
      const status = e.message === "FORBIDDEN_FUND_ACCESS" ? 403 : 400;
      res.status(status).json({ success: false, message: e.message });
    }
  }
  static tradeSettlementDoc(req: AuthRequest, res: Response) {
    return ListedEquityTradeController.settlementDocument(req, res);
  }

  // Compliance
  static listComplianceRules(req: AuthRequest, res: Response) {
    handle(res, InvestmentComplianceService.listRules(req.query.fundId as string));
  }
  static createComplianceRule(req: AuthRequest, res: Response) {
    handle(res, InvestmentComplianceService.createRule(req.body), 201);
  }
  static complianceOverride(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentComplianceService.override({
        orderId: req.body.orderId,
        reason: req.body.reason,
        userId: req.user!.id,
        documentId: req.body.documentId,
      })
    );
  }

  // Simulation
  static runSimulation(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentSimulationService.run(req.body.fundId, req.user!.id, req.user, req.body.scenario),
      201
    );
  }
  static getSimulation(req: AuthRequest, res: Response) {
    handle(res, InvestmentSimulationService.get(req.params.id));
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

  // Valuation
  static runValuation(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.runValuation(req.body.fundId, req.user!.id, req.user, {
        async: req.body.async === true,
        costBasisMethod: req.body.costBasisMethod,
      }),
      201
    );
  }
  static getValuationRun(req: AuthRequest, res: Response) {
    handle(res, InvestmentValuationService.getRun(req.params.id));
  }
  static valuationExceptions(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.listExceptions(
        req.query.fundId as string,
        req.user!.id,
        req.user
      )
    );
  }
  static resolveValuationException(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentValuationService.resolveException(req.params.id, req.user!.id, req.body)
    );
  }

  // Reconciliation
  static runReconciliation(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.run(
        req.body.fundId,
        req.body.reconType,
        req.user!.id,
        req.user,
        req.body.csvText ? { csvText: req.body.csvText, fileName: req.body.fileName } : undefined
      ),
      201
    );
  }
  static uploadReconciliationFile(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.uploadExternalFile(
        req.body.fundId,
        req.body.reconType,
        req.body.csvText,
        req.body.fileName || "upload.csv",
        req.user!.id,
        req.user
      ),
      201
    );
  }
  static listReconBatches(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.listBatches(
        req.query.fundId as string,
        req.user!.id,
        req.user
      )
    );
  }
  static getReconBatch(req: AuthRequest, res: Response) {
    handle(res, InvestmentReconciliationService.getBatch(req.params.id));
  }
  static resolveReconItem(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReconciliationService.resolveItem(
        req.params.id,
        req.user!.id,
        req.body.reason,
        req.body.documentId
      )
    );
  }

  // Accounting
  static listAccountingEvents(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.listEvents(req.user!.id, req.user, {
        fundId: req.query.fundId as string,
        status: req.query.status as string,
        page: Number(req.query.page),
        pageSize: Number(req.query.pageSize),
      })
    );
  }
  static listAccountingJournals(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.listJournals(
        req.user!.id,
        req.user,
        req.query.fundId as string
      )
    );
  }
  static getAccountingJournal(req: AuthRequest, res: Response) {
    handle(res, InvestmentAccountingFacadeService.getJournal(req.params.id));
  }
  static reverseAccountingEvent(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentAccountingFacadeService.reverseEvent(req.params.id, req.user!.id, req.body.reason)
    );
  }

  // Documentation
  static listDocuments(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.list({
        fundId: req.query.fundId as string,
        documentType: req.query.documentType as string,
      })
    );
  }
  static uploadDocument(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentDocumentationService.upload({ ...req.body, userId: req.user!.id }),
      201
    );
  }
  static async downloadDocument(req: AuthRequest, res: Response) {
    try {
      const doc = await InvestmentDocumentationService.get(req.params.id);
      if (!doc) return res.status(404).json({ success: false, message: "Not found" });
      res.setHeader("Content-Disposition", `attachment; filename="${doc.title}"`);
      createReadStream(doc.fileRef).pipe(res);
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  // Reporting
  static listReportTemplates(req: AuthRequest, res: Response) {
    handle(res, Promise.resolve(InvestmentReportingService.listTemplates()));
  }
  static listReports(req: AuthRequest, res: Response) {
    handle(
      res,
      InvestmentReportingService.list(req.user!.id, req.user, {
        fundId: req.query.fundId as string | undefined,
        reportType: req.query.reportType as string | undefined,
        status: req.query.status as string | undefined,
        page: req.query.page ? Number(req.query.page) : undefined,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      })
    );
  }
  static generateReport(req: AuthRequest, res: Response) {
    handle(res, InvestmentReportingService.generate(req.user!.id, req.user, req.body), 201);
  }
  static async downloadReport(req: AuthRequest, res: Response) {
    try {
      const run = await InvestmentReportingService.get(req.params.id);
      if (!run?.fileRef) return res.status(404).json({ success: false, message: "Not found" });
      res.setHeader("Content-Type", InvestmentReportingService.contentTypeForRun(run));
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${InvestmentReportingService.downloadFilename(run)}"`
      );
      InvestmentReportingService.openDownloadStream(run.fileRef).pipe(res);
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
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
}
