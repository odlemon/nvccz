// @ts-nocheck

import express from "express";

import { InvestmentOpsController } from "../controllers/InvestmentOpsController";
import { StockPickerCashController } from "../controllers/StockPickerCashController";

import { authenticate } from "../middleware/authenticate";
import {
  investmentOpsContract,
  requireExpectedVersion,
  requireIdempotencyKey,
  requireInvestmentPermission,
} from "../middleware/investmentOpsFoundation";
import "../services/investmentOps/InvestmentPlatformJobHandlers";
import "../services/investmentOps/InvestmentReportingService";



const router = express.Router();
router.use(investmentOpsContract);

const access = (permission: string) => [
  authenticate,
  requireInvestmentPermission(permission),
];
const read = access("investments.read");
const write = access("investments.write");
const approve = access("investments.approve");
const execute = access("investments.execute");
const auth = read;
const instrumentTransition = (status: string) => (req: any, res: any) => {
  req.body = { ...(req.body || {}), status };
  return InvestmentOpsController.transitionInstrument(req, res);
};
const reference = (type: string, handler: any) => (req: any, res: any) => {
  req.params.type = type;
  return handler(req, res);
};



// Dashboard

router.get("/dashboard/summary", ...auth, InvestmentOpsController.dashboardSummary);

router.get("/dashboard/allocation", ...auth, InvestmentOpsController.dashboardAllocation);

router.get("/dashboard/currency-exposure", ...auth, InvestmentOpsController.dashboardCurrencyExposure);

router.get("/dashboard/funds", ...auth, InvestmentOpsController.dashboardFunds);

router.post(
  "/dashboard/recalculate",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.dashboardRecalculate
);



// Portfolios

router.get("/portfolios", ...auth, InvestmentOpsController.listPortfolios);
router.post("/portfolios", ...write, InvestmentOpsController.createPortfolio);
router.get("/portfolios/:fundId", ...auth, InvestmentOpsController.getPortfolio);
router.patch(
  "/portfolios/:fundId",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.patchPortfolio
);
router.delete(
  "/portfolios/:fundId",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.archivePortfolio
);

router.get("/portfolios/:fundId/overview", ...auth, InvestmentOpsController.portfolioOverview);

router.get("/portfolios/:fundId/holdings", ...auth, InvestmentOpsController.portfolioHoldings);
router.get("/portfolios/:fundId/positions", ...auth, InvestmentOpsController.portfolioPositions);
router.get("/positions/:id", ...auth, InvestmentOpsController.positionDetail);

router.get(
  "/portfolios/:fundId/transactions",
  ...auth,
  InvestmentOpsController.portfolioTransactionList
);
router.get("/transactions/:id", ...auth, InvestmentOpsController.transactionDetail);
router.post(
  "/portfolios/:fundId/transactions/manual-adjustments",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.manualAdjustment
);
router.post(
  "/transactions/:id/reverse",
  ...approve,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.reverseTransaction
);

router.get("/portfolios/:fundId/exposure", ...auth, InvestmentOpsController.portfolioExposure);

router.post("/portfolios/:fundId/recalculate", ...write, InvestmentOpsController.portfolioRecalculate);
router.get("/portfolios/:fundId/folders", ...auth, InvestmentOpsController.listFolders);
router.post("/portfolios/:fundId/folders", ...write, InvestmentOpsController.createFolder);
router.get("/folders/:id", ...auth, InvestmentOpsController.getFolder);
router.patch(
  "/folders/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.patchFolder
);
router.post(
  "/folders/:id/archive",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.archiveFolder
);
router.post(
  "/folders/:id/restore",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.restoreFolder
);
router.put("/portfolios/:fundId/folders/reorder", ...write, InvestmentOpsController.reorderFolders);
router.get(
  "/portfolios/:fundId/assignments",
  ...auth,
  InvestmentOpsController.listPortfolioAssignments
);
router.post(
  "/portfolios/:fundId/assignments",
  ...write,
  InvestmentOpsController.createPortfolioAssignment
);
router.patch(
  "/assignments/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.patchPortfolioAssignment
);

// SRD aliases — portfolio folders / assignments (flattened)
router.get("/portfolio-folders", ...auth, InvestmentOpsController.listPortfolioFoldersAlias);
router.post("/portfolio-folders", ...write, InvestmentOpsController.createPortfolioFolderAlias);
router.put("/portfolio-folders/reorder", ...write, InvestmentOpsController.reorderPortfolioFoldersAlias);
router.get("/portfolio-folders/:folderId", ...auth, InvestmentOpsController.getPortfolioFolderAlias);
router.patch(
  "/portfolio-folders/:folderId",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.patchPortfolioFolderAlias
);
router.post(
  "/portfolio-folders/:folderId/archive",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.archivePortfolioFolderAlias
);
router.post(
  "/portfolio-folders/:folderId/restore",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.restorePortfolioFolderAlias
);
router.post("/portfolio-assignments", ...write, InvestmentOpsController.createPortfolioAssignmentAlias);
router.delete(
  "/portfolio-assignments/:id",
  ...write,
  InvestmentOpsController.deletePortfolioAssignmentAlias
);
router.delete(
  "/portfolio-folders/:folderId/portfolio-assignments/:fundId",
  ...write,
  InvestmentOpsController.unassignFolderPortfolio
);

router.get("/portfolios/:fundId/config", ...auth, InvestmentOpsController.getPortfolioConfig);
router.patch(
  "/portfolios/:fundId/config",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.patchPortfolioConfig
);
router.get("/portfolios/:fundId/limits", ...auth, InvestmentOpsController.listPortfolioLimits);
router.post("/portfolios/:fundId/limits", ...write, InvestmentOpsController.createPortfolioLimit);
router.get("/limits/:id", ...auth, InvestmentOpsController.getPortfolioLimit);
router.patch(
  "/limits/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.patchPortfolioLimit
);
router.post(
  "/limits/:id/archive",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.archivePortfolioLimit
);



// Instruments

router.get("/instruments/types", ...auth, InvestmentOpsController.listInstrumentTypes);

router.get("/instruments", ...auth, InvestmentOpsController.listInstruments);

router.get("/instruments/:id", ...auth, InvestmentOpsController.getInstrument);

router.get(
  "/instruments/:id/market-context",
  ...auth,
  InvestmentOpsController.instrumentMarketContext
);

router.post("/instruments", ...write, InvestmentOpsController.createInstrument);

router.put(
  "/instruments/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.updateInstrument
);

router.patch(
  "/instruments/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.updateInstrument
);

router.post(
  "/instruments/:id/submit",
  ...write,
  requireExpectedVersion,
  instrumentTransition("PENDING_APPROVAL")
);
router.post(
  "/instruments/:id/approve",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.approveInstrument
);
router.post(
  "/instruments/:id/reject",
  ...approve,
  requireExpectedVersion,
  instrumentTransition("REJECTED")
);
router.post(
  "/instruments/:id/restrict",
  ...approve,
  requireExpectedVersion,
  instrumentTransition("RESTRICTED")
);
router.post(
  "/instruments/:id/archive",
  ...write,
  requireExpectedVersion,
  instrumentTransition("ARCHIVED")
);



// Market data

router.get("/market-data/prices/latest", ...auth, InvestmentOpsController.marketDataLatest);

router.get("/market-data/prices/stale", ...auth, InvestmentOpsController.marketDataStale);

router.post(
  "/market-data/prices/manual",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.marketDataManual
);

router.post("/market-data/prices/upload", ...write, InvestmentOpsController.marketDataUpload);

router.post("/market-data/ingest/run", ...write, InvestmentOpsController.marketDataIngestRun);

router.get("/market-data/validation-queue", ...auth, InvestmentOpsController.marketDataValidationQueue);

router.post(
  "/market-data/validation-queue/:tickId/approve",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.marketDataApproveTick
);

router.post(
  "/market-data/validation-queue/:tickId/reject",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.marketDataRejectTick
);

router.get("/market-data/securities/:id/prices", ...auth, InvestmentOpsController.marketDataSecurityPrices);
router.get(
  "/market-data/prices/:securityId/history",
  ...auth,
  InvestmentOpsController.marketDataPriceHistory
);

router.get("/market-data/ingest/batches", ...auth, InvestmentOpsController.marketDataBatches);

router.get("/market-data/ingest/batches/:id", ...auth, InvestmentOpsController.marketDataBatchDetail);
router.get("/market-data/sources/health", ...auth, InvestmentOpsController.priceSources);
router.get("/market-data/fx-rates", ...auth, InvestmentOpsController.listFxRates);
router.get("/market-data/fx-rates/latest", ...auth, InvestmentOpsController.latestFxRate);
router.post(
  "/market-data/fx-rates",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.createFxRate
);
router.post(
  "/market-data/fx-rates/:id/approve",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.approveFxRate
);
router.post(
  "/market-data/fx-rates/:id/reject",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.rejectFxRate
);



// Orders

router.get("/orders", ...auth, InvestmentOpsController.listOrders);

router.get("/orders/configuration/:fundId", ...auth, InvestmentOpsController.getOrderConfiguration);
router.patch(
  "/orders/configuration/:fundId",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.updateOrderConfiguration
);
router.get("/orders/approval-routes", ...auth, InvestmentOpsController.listApprovalRoutes);
router.post(
  "/orders/approval-routes",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.createApprovalRoute
);
router.patch(
  "/orders/approval-routes/:id",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.updateApprovalRoute
);
router.delete(
  "/orders/approval-routes/:id",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.deleteApprovalRoute
);

// SRD aliases — approval routes
router.get("/approval-routes", ...auth, InvestmentOpsController.listApprovalRoutes);
router.post(
  "/approval-routes",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.createApprovalRoute
);
router.get(
  "/orders/:id/approval-routes/applicable",
  ...auth,
  InvestmentOpsController.applicableApprovalRoutes
);

router.post(
  "/orders/preview",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.previewOrder
);
router.post("/orders", ...write, requireIdempotencyKey, InvestmentOpsController.createOrder);

router.get("/orders/:id", ...auth, InvestmentOpsController.getOrder);
router.patch(
  "/orders/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.updateOrder
);
router.delete(
  "/orders/:id",
  ...write,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.deleteOrder
);
router.get("/orders/:id/history", ...auth, InvestmentOpsController.orderHistory);
router.get(
  "/orders/:id/applicable-approval-routes",
  ...auth,
  InvestmentOpsController.applicableApprovalRoutes
);

router.post(
  "/orders/:id/submit",
  ...write,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.submitOrder
);

router.post(
  "/orders/:id/approve",
  ...approve,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.approveOrder
);

router.post(
  "/orders/:id/send-to-broker",
  ...execute,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.sendOrderToBroker
);

router.get(
  "/orders/:id/broker-confirmations",
  ...auth,
  InvestmentOpsController.listBrokerConfirmations
);
router.post(
  "/orders/:id/broker-confirmations",
  ...execute,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.recordBrokerConfirmation
);
router.post(
  "/orders/:id/broker-confirmations/:confirmationId/accept",
  ...execute,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.acceptBrokerConfirmation
);
router.post(
  "/orders/:id/broker-confirmations/:confirmationId/reject",
  ...execute,
  requireExpectedVersion,
  InvestmentOpsController.rejectBrokerConfirmation
);

router.post(
  "/orders/:id/reject",
  ...approve,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.rejectOrder
);

router.post(
  "/orders/:id/cancel",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.cancelOrder
);
router.post(
  "/orders/:id/fail",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.failOrder
);
router.post(
  "/orders/:id/archive",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.archiveOrder
);

router.post(
  "/orders/:id/compliance-check",
  ...approve,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.complianceCheckOrder
);
router.post("/orders/:id/execute", ...execute, requireIdempotencyKey, InvestmentOpsController.executeOrder);
router.get("/orders/:id/executions", ...auth, InvestmentOpsController.listOrderExecutions);
router.post(
  "/orders/:id/executions",
  ...execute,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.recordOrderExecution
);
// SRD aliases — fills
router.get("/orders/:id/fills", ...auth, InvestmentOpsController.listOrderExecutions);
router.post(
  "/orders/:id/fills",
  ...execute,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.recordOrderExecution
);
router.post(
  "/orders/:id/documents",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.attachOrderDocument
);
router.post(
  "/orders/:id/trade-confirmation",
  ...execute,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.confirmOrderTrade
);
router.post(
  "/orders/:id/settlement",
  ...execute,
  requireExpectedVersion,
  requireIdempotencyKey,
  InvestmentOpsController.settleOrder
);

router.get("/blotters", ...auth, InvestmentOpsController.listBlotters);
router.post("/blotters", ...write, InvestmentOpsController.createBlotter);
router.get("/blotters/:id", ...auth, InvestmentOpsController.getBlotter);
router.patch(
  "/blotters/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.updateBlotter
);
router.post(
  "/blotters/:id/orders",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.addBlotterOrder
);
router.delete(
  "/blotters/:id/orders/:orderId",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.removeBlotterOrder
);

router.get("/trading/portfolios/:fundId/positions", ...auth, InvestmentOpsController.tradingPositions);
router.get(
  "/trading/portfolios/:fundId/positions/summary",
  ...auth,
  InvestmentOpsController.tradingPositionSummary
);
router.post(
  "/trading/portfolios/:fundId/positions/recalculate",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.recalculateTradingPositions
);
// SRD aliases — trading (fundId query)
router.get("/trading/positions", ...auth, InvestmentOpsController.tradingPositionsByQuery);
router.get("/trading/summary", ...auth, InvestmentOpsController.tradingSummaryByQuery);
router.post(
  "/trading/recalculate",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.recalculateTradingByQuery
);
router.get("/trading/saved-views", ...auth, InvestmentOpsController.listTradingSavedViews);
router.post("/trading/saved-views", ...write, InvestmentOpsController.createTradingSavedView);
router.patch(
  "/trading/saved-views/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.updateTradingSavedView
);
router.delete(
  "/trading/saved-views/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.deleteTradingSavedView
);



// Trades

router.get("/trades", ...auth, InvestmentOpsController.listTradesEnriched);

router.get("/trades/:id", ...auth, InvestmentOpsController.getTrade);

router.post("/trades/:id/execute", ...execute, requireIdempotencyKey, InvestmentOpsController.executeTrade);

router.get("/trades/:id/routing-hops", ...auth, InvestmentOpsController.tradeRoutingHops);

router.post("/trades/:id/routing-hops/:hopId/confirm", ...execute, InvestmentOpsController.tradeConfirmHop);

router.post("/trades/:id/routing-hops/:hopId/retry", ...execute, InvestmentOpsController.tradeRetryHop);

router.post("/trades/:id/routing-hops/:hopId/cancel", ...execute, InvestmentOpsController.tradeCancelHop);

router.get("/trades/:id/settlement-document", ...auth, InvestmentOpsController.tradeSettlementDoc);

router.post(
  "/trades/:id/confirm",
  ...execute,
  requireIdempotencyKey,
  InvestmentOpsController.confirmTradeAlias
);
router.post(
  "/trades/:id/settle",
  ...execute,
  requireIdempotencyKey,
  InvestmentOpsController.settleTradeAlias
);

router.get(
  "/trades/:id/reconciliation-summary",
  ...auth,
  InvestmentOpsController.tradeReconciliationSummary
);

// Trade 3-way reconciliation (BA-RC-1 / BA-RC-4) — distinct from cash /reconciliation-batches
router.get(
  "/trade-reconciliation/templates",
  ...auth,
  InvestmentOpsController.listTradeReconTemplates
);
router.post(
  "/trade-reconciliation/batches",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.createTradeReconBatch
);
router.get(
  "/trade-reconciliation/batches/:id",
  ...auth,
  InvestmentOpsController.getTradeReconBatch
);
router.post(
  "/trade-reconciliation/batches/:id/ingest-broker",
  ...write,
  InvestmentOpsController.ingestTradeReconBroker
);
router.post(
  "/trade-reconciliation/batches/:id/ingest-custodian",
  ...write,
  InvestmentOpsController.ingestTradeReconCustodian
);
router.post(
  "/trade-reconciliation/batches/:id/run-match",
  ...write,
  InvestmentOpsController.runTradeReconMatch
);
router.post(
  "/trade-reconciliation/batches/:id/complete",
  ...write,
  InvestmentOpsController.completeTradeReconBatch
);
router.post(
  "/trade-reconciliation/exceptions/:id/manual-match",
  ...write,
  InvestmentOpsController.manualMatchTradeReconException
);
router.post(
  "/trade-reconciliation/exceptions/:id/write-off",
  ...write,
  InvestmentOpsController.writeOffTradeReconException
);
router.get(
  "/client-account-reconciliation",
  ...auth,
  InvestmentOpsController.clientAccountRecon
);



// Compliance

router.get("/compliance/rules", ...auth, InvestmentOpsController.listComplianceRules);

router.post("/compliance/rules", ...write, InvestmentOpsController.createComplianceRule);
router.get("/compliance/rules/:id", ...auth, InvestmentOpsController.getComplianceRule);
router.patch(
  "/compliance/rules/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.updateComplianceRule
);
router.delete(
  "/compliance/rules/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.archiveComplianceRule
);
router.get("/compliance/runs", ...auth, InvestmentOpsController.listComplianceRuns);
router.get("/compliance/results", ...auth, InvestmentOpsController.listComplianceResults);
router.get("/compliance/runs/:id", ...auth, InvestmentOpsController.getComplianceRun);
router.get("/compliance/overrides", ...auth, InvestmentOpsController.listComplianceOverrides);
// FE / walkthrough often POST here; canonical create path is also /overrides/requests
router.post("/compliance/overrides", ...write, InvestmentOpsController.requestComplianceOverride);
router.post("/compliance/overrides/requests", ...write, InvestmentOpsController.requestComplianceOverride);
router.post(
  "/compliance/overrides/:id/approve",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.approveComplianceOverride
);
router.post(
  "/compliance/overrides/:id/reject",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.rejectComplianceOverride
);

// Simulation

router.get("/simulation/runs", ...auth, InvestmentOpsController.listSimulations);
router.post(
  "/simulation/run",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.runSimulation
);

router.get("/simulation/runs/:id", ...auth, InvestmentOpsController.getSimulation);



// Model portfolios

router.get("/model-portfolios", ...auth, InvestmentOpsController.listModelPortfolios);

router.post("/model-portfolios", ...write, InvestmentOpsController.createModelPortfolio);
router.get("/model-portfolios/:id", ...auth, InvestmentOpsController.getModelPortfolio);
router.patch(
  "/model-portfolios/:id",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.updateModelPortfolio
);
router.post(
  "/model-portfolios/:id/activate",
  ...approve,
  requireExpectedVersion,
  InvestmentOpsController.activateModelPortfolio
);
router.post(
  "/model-portfolios/:id/archive",
  ...write,
  requireExpectedVersion,
  InvestmentOpsController.archiveModelPortfolio
);

router.get("/model-portfolios/:id/drift", ...auth, InvestmentOpsController.modelDrift);
router.post(
  "/model-portfolios/:id/rebalance-recommendations",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.recommendModelRebalance
);
router.post(
  "/rebalance-runs/:id/convert-to-draft-orders",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.convertRebalanceToOrders
);



// Valuation
router.post(
  "/valuation/runs",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.runValuation
);
router.get("/valuation/runs", ...auth, InvestmentOpsController.listValuationRuns);
router.get("/valuation/runs/:id", ...auth, InvestmentOpsController.getValuationRun);
router.get("/valuation/runs/:id/inputs", ...auth, InvestmentOpsController.valuationRunInputs);
router.get("/valuation/runs/:id/items", ...auth, InvestmentOpsController.valuationRunItems);
router.get("/valuation/runs/:id/summary", ...auth, InvestmentOpsController.valuationRunSummary);
router.post("/valuation/runs/:id/cancel", ...write, InvestmentOpsController.cancelValuationRun);
router.post(
  "/valuation/runs/:id/rerun",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.rerunValuation
);
router.get("/valuation/exceptions", ...auth, InvestmentOpsController.valuationExceptions);
router.get("/valuation/exceptions/:id", ...auth, InvestmentOpsController.getValuationException);
router.post(
  "/valuation/exceptions/:id/resolve",
  ...approve,
  InvestmentOpsController.resolveValuationException
);
router.post(
  "/valuation/exceptions/:id/override",
  ...write,
  InvestmentOpsController.overrideValuationException
);
router.post(
  "/valuation/exceptions/:id/approve-override",
  ...approve,
  InvestmentOpsController.approveValuationOverride
);
router.post(
  "/valuation/exceptions/:id/reject-override",
  ...approve,
  InvestmentOpsController.rejectValuationOverride
);
router.post(
  "/valuation/exceptions/:id/escalate",
  ...write,
  InvestmentOpsController.escalateValuationException
);
router.get("/valuation/price-validation", ...auth, InvestmentOpsController.valuationPriceValidation);
router.get("/valuation/fx-validation", ...auth, InvestmentOpsController.valuationFxValidation);

// Reconciliation
router.post(
  "/reconciliation/uploads",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.uploadReconciliationFile
);
router.post(
  "/reconciliation/upload",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.uploadReconciliationFile
);
router.post(
  "/reconciliation/run",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.runReconciliation
);
router.get("/reconciliation/batches", ...auth, InvestmentOpsController.listReconBatches);
router.get("/reconciliation/batches/:id", ...auth, InvestmentOpsController.getReconBatch);
router.get("/reconciliation/items", ...auth, InvestmentOpsController.listReconItems);
router.get("/reconciliation/items/:id", ...auth, InvestmentOpsController.getReconItem);
router.post("/reconciliation/items/:id/assign", ...write, InvestmentOpsController.assignReconItem);
router.post(
  "/reconciliation/items/:id/investigate",
  ...write,
  InvestmentOpsController.investigateReconItem
);
router.post(
  "/reconciliation/items/:id/resolve",
  ...approve,
  InvestmentOpsController.resolveReconItem
);
router.post(
  "/reconciliation/items/:id/escalate",
  ...write,
  InvestmentOpsController.escalateReconItem
);
router.post(
  "/reconciliation/items/:id/write-off",
  ...write,
  InvestmentOpsController.writeOffReconItem
);
router.post(
  "/reconciliation/items/:id/approve-write-off",
  ...approve,
  InvestmentOpsController.approveReconWriteOff
);
router.post(
  "/reconciliation/items/:id/reject-write-off",
  ...approve,
  InvestmentOpsController.rejectReconWriteOff
);
router.post("/reconciliation/items/:id/reopen", ...write, InvestmentOpsController.reopenReconItem);
router.get(
  "/reconciliation/items/:id/history",
  ...auth,
  InvestmentOpsController.reconItemHistory
);
router.get("/reconciliation/summary", ...auth, InvestmentOpsController.reconSummary);

// Accounting
router.get("/accounting/events", ...auth, InvestmentOpsController.listAccountingEvents);
router.get("/accounting/posting-status", ...auth, InvestmentOpsController.accountingPostingStatus);
router.get("/accounting/events/:id", ...auth, InvestmentOpsController.getAccountingEvent);
router.post(
  "/accounting/events/:id/retry",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.retryAccountingEvent
);
router.get("/accounting/journals", ...auth, InvestmentOpsController.listAccountingJournals);
router.get("/accounting/journals/:id", ...auth, InvestmentOpsController.getAccountingJournal);
router.post(
  "/accounting/journals/:id/submit",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.submitAccountingJournal
);
router.post(
  "/accounting/journals/:id/approve",
  ...approve,
  requireIdempotencyKey,
  InvestmentOpsController.approveAccountingJournal
);
router.post(
  "/accounting/journals/:id/reject",
  ...approve,
  requireIdempotencyKey,
  InvestmentOpsController.rejectAccountingJournal
);
router.post(
  "/accounting/journals/:id/post",
  ...approve,
  requireIdempotencyKey,
  InvestmentOpsController.postAccountingJournal
);
router.get("/accounting/reversals", ...auth, InvestmentOpsController.listAccountingReversals);
router.post(
  "/accounting/events/:id/reverse",
  ...approve,
  requireIdempotencyKey,
  InvestmentOpsController.reverseAccountingEvent
);
router.post(
  "/accounting/reversals/:id/approve",
  ...approve,
  requireIdempotencyKey,
  InvestmentOpsController.approveAccountingReversal
);
router.post(
  "/accounting/reversals/:id/reject",
  ...approve,
  requireIdempotencyKey,
  InvestmentOpsController.rejectAccountingReversal
);
router.post(
  "/accounting/ledger-exports",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.createLedgerExport
);
router.get("/accounting/ledger-exports", ...auth, InvestmentOpsController.listLedgerExports);
router.get("/accounting/ledger-exports/:id", ...auth, InvestmentOpsController.getLedgerExport);
router.get(
  "/accounting/ledger-exports/:id/download",
  ...auth,
  InvestmentOpsController.downloadLedgerExport
);

// Documentation / files
router.post(
  "/files/upload-sessions",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.createUploadSession
);
router.post("/files", ...write, InvestmentOpsController.uploadFile);
router.post("/files/:fileId/complete", ...write, InvestmentOpsController.completeFile);
router.get("/files/:fileId/status", ...auth, InvestmentOpsController.fileStatus);
router.get("/documents", ...auth, InvestmentOpsController.listDocuments);
router.post(
  "/documents",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.uploadDocument
);
router.get("/documents/:id", ...auth, InvestmentOpsController.getDocument);
router.patch("/documents/:id", ...write, InvestmentOpsController.patchDocument);
router.get("/documents/:id/versions", ...auth, InvestmentOpsController.listDocumentVersions);
router.post(
  "/documents/:id/versions",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.addDocumentVersion
);
router.get(
  "/documents/:id/versions/:versionId/preview",
  ...auth,
  InvestmentOpsController.previewDocumentVersion
);
router.get(
  "/documents/:id/versions/:versionId/download",
  ...auth,
  InvestmentOpsController.downloadDocumentVersion
);
router.post(
  "/documents/:id/versions/:versionId/approve",
  ...approve,
  InvestmentOpsController.approveDocumentVersion
);
router.post(
  "/documents/:id/versions/:versionId/request-changes",
  ...write,
  InvestmentOpsController.requestDocumentChanges
);
router.post(
  "/documents/:id/versions/:versionId/reject",
  ...approve,
  InvestmentOpsController.rejectDocumentVersion
);
router.get("/documents/:id/access", ...auth, InvestmentOpsController.getDocumentAccess);
router.put("/documents/:id/access", ...approve, InvestmentOpsController.putDocumentAccess);
router.get("/documents/:id/audit", ...auth, InvestmentOpsController.documentAudit);
router.post("/documents/:id/archive", ...write, InvestmentOpsController.archiveDocument);
router.get("/documents/:id/download", ...auth, InvestmentOpsController.downloadDocument);



// Reporting

router.get("/reports/templates", ...auth, InvestmentOpsController.listReportTemplates);

router.get("/reports", ...auth, InvestmentOpsController.listReports);

router.post(
  "/reports/generate",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.generateReport
);

router.get("/reports/:id", ...auth, InvestmentOpsController.getReport);
router.get("/reports/:id/audit", ...auth, InvestmentOpsController.reportAudit);
router.post("/reports/:id/cancel", ...write, InvestmentOpsController.cancelReport);
router.post(
  "/reports/:id/retry",
  ...write,
  requireIdempotencyKey,
  InvestmentOpsController.retryReport
);
router.get("/reports/:id/download", ...auth, InvestmentOpsController.downloadReport);

// Phase 4 platform: durable jobs, outbox, audit, capabilities
router.get("/jobs/:jobId", ...auth, InvestmentOpsController.getJob);
router.post("/jobs/:jobId/cancel", ...write, InvestmentOpsController.cancelJob);
router.get("/outbox-events", ...auth, InvestmentOpsController.listOutboxEvents);
router.get("/outbox-events/poll", ...auth, InvestmentOpsController.pollOutboxEvents);
router.get("/audit-events", ...auth, InvestmentOpsController.listAuditEvents);
router.get("/capabilities", ...auth, InvestmentOpsController.getCapabilities);



// Setup — listed-equity funds

router.get("/setup/funds", ...auth, InvestmentOpsController.listInvestmentFunds);

router.post("/setup/funds", ...write, InvestmentOpsController.createInvestmentFund);

router.get("/setup/funds/:id", ...auth, InvestmentOpsController.getInvestmentFund);

router.get("/setup/funds/:id/limits", ...auth, InvestmentOpsController.listPortfolioLimits);

router.put("/setup/funds/:id", ...write, InvestmentOpsController.updateInvestmentFund);

router.put("/setup/funds/:id/config", ...write, InvestmentOpsController.updateInvestmentFundConfig);

router.post("/setup/funds/:id/managers", ...approve, InvestmentOpsController.addInvestmentFundManager);



// Setup reference catalogs

router.get("/setup/brokers", ...auth, InvestmentOpsController.listBrokers);
router.post("/setup/brokers", ...write, InvestmentOpsController.createBroker);
router.get("/setup/custodians", ...auth, InvestmentOpsController.listCustodians);
router.post("/setup/custodians", ...write, InvestmentOpsController.createCustodian);
router.get("/setup/reference-types", ...auth, InvestmentOpsController.referenceTypes);

const referenceTypes = [
  "countries",
  "currencies",
  "issuers",
  "markets",
  "stakeholders",
  "commissions",
  "settlement-accounts",
  "ssis",
  "instrument-types",
  "instrument-subcategories",
  "instrument-mappings",
  "tags",
  "coupon-frequencies",
  "corporate-action-mappings",
  "price-sources",
  "icons",
];
for (const type of referenceTypes) {
  router.get(`/setup/${type}`, ...auth, reference(type, InvestmentOpsController.listReferences));
  router.post(`/setup/${type}`, ...write, reference(type, InvestmentOpsController.createReference));
  router.get(`/setup/${type}/:id`, ...auth, reference(type, InvestmentOpsController.getReference));
  router.patch(
    `/setup/${type}/:id`,
    ...write,
    requireExpectedVersion,
    reference(type, InvestmentOpsController.updateReference)
  );
  router.post(
    `/setup/${type}/:id/archive`,
    ...write,
    requireExpectedVersion,
    reference(type, InvestmentOpsController.archiveReference)
  );
}

// SRD: whole-catalog PUT for corporate-action-mappings (settings-backed)
router.put(
  "/setup/corporate-action-mappings",
  ...write,
  (req: any, res: any) => {
    req.body = {
      "reference.corporate-action-mappings": {
        version: Number(req.body?.version || 1) + 1,
        items: Array.isArray(req.body?.items) ? req.body.items : req.body?.mappings || [],
      },
    };
    return InvestmentOpsController.updateSettings(req, res);
  }
);

router.get("/setup/settings", ...auth, InvestmentOpsController.getSettings);

router.put("/setup/settings", ...write, InvestmentOpsController.updateSettings);

// ---------------------------------------------------------------------------
// Stock Picker Cash (flat paths — do not collide with /reconciliation/* §22)
// ---------------------------------------------------------------------------
const spCash = (permission: string) => [
  authenticate,
  requireInvestmentPermission(permission),
];
const spView = spCash("sp.cash.access");
const spAccountsView = spCash("sp.cash.accounts.view");
const spAccountsManage = spCash("sp.cash.accounts.manage");
const spAccountsApprove = spCash("sp.cash.accounts.approve");
const spPositionView = spCash("sp.cash.position.view");
const spReservationsReq = spCash("sp.cash.reservations.request");
const spReservationsApprove = spCash("sp.cash.reservations.approve");
const spReservationsRelease = spCash("sp.cash.reservations.release");
const spLedgerView = spCash("sp.cash.ledger.view");
const spJournalsCreate = spCash("sp.cash.journals.create");
const spJournalsApprove = spCash("sp.cash.journals.approve");
const spJournalsReverse = spCash("sp.cash.journals.reverse");
const spImportsUpload = spCash("sp.cash.imports.upload");
const spImportsValidate = spCash("sp.cash.imports.validate");
const spImportsCommit = spCash("sp.cash.imports.commit");
const spReconView = spCash("sp.cash.reconciliation.view");
const spReconRun = spCash("sp.cash.reconciliation.run");
const spReconMatch = spCash("sp.cash.reconciliation.match");
const spReconUnmatch = spCash("sp.cash.reconciliation.unmatch");
const spExcView = spCash("sp.cash.exceptions.view");
const spExcAssign = spCash("sp.cash.exceptions.assign");
const spExcPropose = spCash("sp.cash.exceptions.propose");
const spExcApprove = spCash("sp.cash.exceptions.approve");
const spClosePrecheck = spCash("sp.cash.close.precheck");
const spCloseExecute = spCash("sp.cash.close.execute");
const spCloseReopen = spCash("sp.cash.close.reopen");
const spGlExport = spCash("sp.cash.gl.export");
const spSetupManage = spCash("sp.cash.setup.manage");
const spStmtView = spCash("sp.cash.statements.view");
const spStmtGen = spCash("sp.cash.statements.generate");
const spStmtApprove = spCash("sp.cash.statements.approve");
const spStmtDeliver = spCash("sp.cash.statements.deliver");

// 14.1 Client cash accounts
router.get("/client-cash-accounts", ...spAccountsView, StockPickerCashController.listAccounts);
router.post("/client-cash-accounts", ...spAccountsManage, requireIdempotencyKey, StockPickerCashController.createAccount);
router.get("/client-cash-accounts/:accountId", ...spAccountsView, StockPickerCashController.getAccount);
router.post("/client-cash-accounts/:accountId/submit", ...spAccountsManage, StockPickerCashController.submitAccount);
router.post("/client-cash-accounts/:accountId/approve", ...spAccountsApprove, StockPickerCashController.approveAccount);
router.post("/client-cash-accounts/:accountId/reject", ...spAccountsApprove, StockPickerCashController.rejectAccount);
router.post("/client-cash-accounts/:accountId/suspend", ...spAccountsManage, StockPickerCashController.suspendAccount);
router.post("/client-cash-accounts/:accountId/close", ...spAccountsApprove, StockPickerCashController.closeAccount);

// 14.2 Cash position / overview
router.get("/portfolios/:portfolioId/cash-position", ...spPositionView, StockPickerCashController.cashPosition);
router.get("/portfolios/:portfolioId/cash-explanation", ...spPositionView, StockPickerCashController.cashExplanation);
router.get("/portfolios/:portfolioId/cash-projection", ...spPositionView, StockPickerCashController.cashProjection);
router.get("/cash-overview", ...spView, StockPickerCashController.cashOverview);
router.get("/cash-overview/daily-movement", ...spView, StockPickerCashController.cashDailyMovement);

// 14.3 Reservations
router.get("/cash-reservations", ...spPositionView, StockPickerCashController.listReservations);
router.post("/cash-reservations", ...spReservationsReq, requireIdempotencyKey, StockPickerCashController.createReservation);
router.post("/cash-reservations/:id/approve", ...spReservationsApprove, StockPickerCashController.approveReservation);
router.post("/cash-reservations/:id/consume", ...spReservationsRelease, StockPickerCashController.consumeReservation);
router.post("/cash-reservations/:id/release", ...spReservationsRelease, StockPickerCashController.releaseReservation);

// 14.4 Ledger / journals
router.get("/cash-ledger", ...spLedgerView, StockPickerCashController.listLedger);
router.post("/cash-journals", ...spJournalsCreate, requireIdempotencyKey, StockPickerCashController.createJournal);
router.get("/cash-journals/:id", ...spLedgerView, StockPickerCashController.getJournal);
router.post("/cash-journals/:id/submit", ...spJournalsCreate, StockPickerCashController.submitJournal);
router.post("/cash-journals/:id/approve", ...spJournalsApprove, StockPickerCashController.approveJournal);
router.post("/cash-journals/:id/reject", ...spJournalsApprove, StockPickerCashController.rejectJournal);
router.post("/cash-journals/:id/reverse", ...spJournalsReverse, StockPickerCashController.reverseJournal);

// 14.5 External statement imports
router.post("/external-statements/imports", ...spImportsUpload, requireIdempotencyKey, StockPickerCashController.createImport);
router.get("/external-statements/imports/:id", ...spReconView, StockPickerCashController.getImport);
router.get("/external-statements/imports/:id/errors", ...spReconView, StockPickerCashController.importErrors);
router.post("/external-statements/imports/:id/validate", ...spImportsValidate, StockPickerCashController.validateImport);
router.post("/external-statements/imports/:id/submit", ...spImportsUpload, StockPickerCashController.submitImport);
router.post("/external-statements/imports/:id/commit", ...spImportsCommit, StockPickerCashController.commitImport);
router.post("/external-statements/imports/:id/reject", ...spImportsCommit, StockPickerCashController.rejectImport);

// 14.6 Reconciliation batches (cash subledger — not §22 /reconciliation/*)
router.post("/reconciliation-batches", ...spReconRun, requireIdempotencyKey, StockPickerCashController.createReconBatch);
router.get("/reconciliation-batches", ...spReconView, StockPickerCashController.listReconBatches);
router.get("/reconciliation-batches/:id", ...spReconView, StockPickerCashController.getReconBatch);
router.post("/reconciliation-batches/:id/run", ...spReconRun, StockPickerCashController.runReconBatch);
router.get("/reconciliation-batches/:id/workspace", ...spReconView, StockPickerCashController.reconWorkspace);
router.get("/reconciliation-batches/:id/summary", ...spReconView, StockPickerCashController.reconSummary);
router.post("/reconciliation-batches/:id/auto-match", ...spReconMatch, StockPickerCashController.autoMatch);
router.get("/reconciliation-rules/active", ...spReconView, StockPickerCashController.activeRules);
router.get("/fund-cash-summary", ...spReconView, StockPickerCashController.fundCashSummary);

// 14.7 Matches
router.post("/matches/confirm", ...spReconMatch, requireIdempotencyKey, StockPickerCashController.confirmMatch);
router.post("/matches/manual", ...spReconMatch, requireIdempotencyKey, StockPickerCashController.manualMatch);
router.post("/matches/unmatch", ...spReconUnmatch, StockPickerCashController.reverseMatchBody);
router.get("/matches/:linkId", ...spReconView, StockPickerCashController.getMatch);
router.post("/matches/:linkId/reverse", ...spReconUnmatch, StockPickerCashController.reverseMatch);
router.post("/matches/:linkId/unmatch", ...spReconUnmatch, StockPickerCashController.reverseMatch);

// 14.8 Broker & custodian
router.get("/broker-custodian/workspace", ...spReconView, StockPickerCashController.brokerCustodianWorkspace);
router.post("/broker-custodian/matches/confirm", ...spReconMatch, requireIdempotencyKey, StockPickerCashController.brokerCustodianConfirm);
router.post("/broker-custodian/items/:id/escalate", ...spExcAssign, StockPickerCashController.brokerCustodianEscalate);
router.post("/broker-custodian/items/:id/clear", ...spExcApprove, StockPickerCashController.brokerCustodianClear);

// 14.9 Exceptions
router.get("/cash-exceptions", ...spExcView, StockPickerCashController.listExceptions);
router.get("/cash-exceptions/summary", ...spExcView, StockPickerCashController.exceptionsSummary);
router.get("/cash-exceptions/:id", ...spExcView, StockPickerCashController.getException);
router.get("/reconciliation-exceptions", ...spExcView, StockPickerCashController.listExceptions);
router.get("/reconciliation-exceptions/summary", ...spExcView, StockPickerCashController.exceptionsSummary);
router.get("/reconciliation-exceptions/:id", ...spExcView, StockPickerCashController.getException);
router.get("/reconciliation-exceptions/:id/timeline", ...spExcView, StockPickerCashController.exceptionTimeline);
router.get("/reconciliation-exceptions/:id/comments", ...spExcView, StockPickerCashController.listExceptionComments);
router.post("/reconciliation-exceptions/:id/comments", ...spExcAssign, StockPickerCashController.addExceptionComment);
router.get("/reconciliation-exceptions/:id/attachments", ...spExcView, StockPickerCashController.listExceptionAttachments);
router.post("/reconciliation-exceptions/:id/attachments", ...spExcAssign, StockPickerCashController.addExceptionAttachment);
router.get("/reconciliation-exceptions/:id/audit", ...spExcView, StockPickerCashController.exceptionAudit);
router.post("/reconciliation-exceptions/:id/assign", ...spExcAssign, StockPickerCashController.assignException);
router.post("/reconciliation-exceptions/:id/investigate", ...spExcAssign, StockPickerCashController.investigateException);
router.post("/reconciliation-exceptions/:id/propose-resolution", ...spExcPropose, StockPickerCashController.proposeException);
router.post("/reconciliation-exceptions/:id/approve", ...spExcApprove, StockPickerCashController.approveException);
router.post("/reconciliation-exceptions/:id/request-info", ...spExcAssign, StockPickerCashController.requestInfoException);
router.post("/reconciliation-exceptions/:id/reject", ...spExcApprove, StockPickerCashController.rejectException);
router.post("/reconciliation-exceptions/:id/close", ...spExcApprove, StockPickerCashController.closeException);
router.post("/reconciliation-exceptions/:id/reopen", ...spExcAssign, StockPickerCashController.reopenException);

// 14.10 Breaks
router.get("/reconciliation-breaks/:breakId", ...spReconView, StockPickerCashController.getBreak);
router.post("/reconciliation-breaks/:breakId/adjust-internal", ...spExcPropose, StockPickerCashController.adjustInternalBreak);
router.post("/reconciliation-breaks/:breakId/mark-reviewed", ...spExcAssign, StockPickerCashController.markBreakReviewed);
router.post("/reconciliation-breaks/:breakId/create-manual-entry", ...spJournalsCreate, StockPickerCashController.createManualEntryBreak);
router.post("/reconciliation-breaks/:breakId/comments", ...spExcAssign, StockPickerCashController.commentBreak);

// 14.11 Period close / GL
router.post("/cash-periods/:period/precheck", ...spClosePrecheck, StockPickerCashController.periodPrecheck);
router.post("/cash-periods/:period/close", ...spCloseExecute, requireIdempotencyKey, StockPickerCashController.periodClose);
router.post("/cash-periods/:period/reopen-request", ...spCloseReopen, StockPickerCashController.periodReopenRequest);
router.post("/cash-periods/:period/restate", ...spCloseExecute, requireIdempotencyKey, StockPickerCashController.periodRestate);
router.post("/cash-gl-exports", ...spGlExport, requireIdempotencyKey, StockPickerCashController.createGlExport);
router.get("/cash-gl-exports/:id", ...spGlExport, StockPickerCashController.getGlExport);
router.post("/cash-gl-exports/:id/retry", ...spGlExport, requireIdempotencyKey, StockPickerCashController.retryGlExport);

// 14.12 Client statements
router.get("/client-statements", ...spStmtView, StockPickerCashController.listStatements);
router.get("/client-statements/summary", ...spStmtView, StockPickerCashController.statementsSummary);
router.post("/client-statements/generate", ...spStmtGen, requireIdempotencyKey, StockPickerCashController.generateStatement);
router.get("/client-statements/:id", ...spStmtView, StockPickerCashController.getStatement);
router.get("/client-statements/:id/preview", ...spStmtView, StockPickerCashController.previewStatement);
router.post("/client-statements/:id/approve", ...spStmtApprove, StockPickerCashController.approveStatement);
router.post("/client-statements/:id/email", ...spStmtDeliver, StockPickerCashController.emailStatement);
router.get("/client-statements/:id/download", ...spStmtView, StockPickerCashController.downloadStatement);

// 14.13 Setup (cash-specific; distinct from listed-equity reference catalogs)
router.get("/setup/providers", ...spSetupManage, StockPickerCashController.listProviders);
router.post("/setup/providers", ...spSetupManage, requireIdempotencyKey, StockPickerCashController.createProvider);
router.get("/setup/file-layouts", ...spSetupManage, StockPickerCashController.listFileLayouts);
router.post("/setup/file-layouts", ...spSetupManage, requireIdempotencyKey, StockPickerCashController.createFileLayout);
router.get("/setup/account-mappings", ...spSetupManage, StockPickerCashController.listAccountMappings);
router.post("/setup/account-mappings", ...spSetupManage, requireIdempotencyKey, StockPickerCashController.createAccountMapping);
router.get("/setup/tolerance-policies", ...spSetupManage, StockPickerCashController.listTolerancePolicies);
router.post("/setup/tolerance-policies", ...spSetupManage, requireIdempotencyKey, StockPickerCashController.createTolerancePolicy);
router.get("/setup/match-weight-policies", ...spSetupManage, StockPickerCashController.listMatchWeightPolicies);
router.post("/setup/match-weight-policies", ...spSetupManage, requireIdempotencyKey, StockPickerCashController.createMatchWeightPolicy);
router.post("/setup/:resource/:id/activate", ...spSetupManage, StockPickerCashController.activateSetup);

export default router;

