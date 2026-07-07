// @ts-nocheck

import express from "express";

import { InvestmentOpsController } from "../controllers/InvestmentOpsController";

import { authenticate } from "../middleware/authenticate";

import { authorize } from "../middleware/permissionAuth";



const router = express.Router();

const auth = [

  authenticate,

  authorize([

    "admin",

    "fund_manager",

    "ceo",

    "cfo",

    "compliance_officer",

    "trader",

    "fund_accountant",

  ]),

];



// Dashboard

router.get("/dashboard/summary", ...auth, InvestmentOpsController.dashboardSummary);

router.get("/dashboard/allocation", ...auth, InvestmentOpsController.dashboardAllocation);

router.get("/dashboard/currency-exposure", ...auth, InvestmentOpsController.dashboardCurrencyExposure);

router.get("/dashboard/funds", ...auth, InvestmentOpsController.dashboardFunds);

router.post("/dashboard/recalculate", ...auth, InvestmentOpsController.dashboardRecalculate);



// Portfolios

router.get("/portfolios", ...auth, InvestmentOpsController.listPortfolios);

router.get("/portfolios/:fundId/overview", ...auth, InvestmentOpsController.portfolioOverview);

router.get("/portfolios/:fundId/holdings", ...auth, InvestmentOpsController.portfolioHoldings);

router.get("/portfolios/:fundId/transactions", ...auth, InvestmentOpsController.portfolioTransactions);

router.get("/portfolios/:fundId/exposure", ...auth, InvestmentOpsController.portfolioExposure);

router.post("/portfolios/:fundId/recalculate", ...auth, InvestmentOpsController.portfolioRecalculate);



// Instruments

router.get("/instruments/types", ...auth, InvestmentOpsController.listInstrumentTypes);

router.get("/instruments", ...auth, InvestmentOpsController.listInstruments);

router.get("/instruments/:id", ...auth, InvestmentOpsController.getInstrument);

router.post("/instruments", ...auth, InvestmentOpsController.createInstrument);

router.put("/instruments/:id", ...auth, InvestmentOpsController.updateInstrument);

router.post("/instruments/:id/approve", ...auth, InvestmentOpsController.approveInstrument);



// Market data

router.get("/market-data/prices/latest", ...auth, InvestmentOpsController.marketDataLatest);

router.get("/market-data/prices/stale", ...auth, InvestmentOpsController.marketDataStale);

router.post("/market-data/prices/manual", ...auth, InvestmentOpsController.marketDataManual);

router.post("/market-data/prices/upload", ...auth, InvestmentOpsController.marketDataUpload);

router.post("/market-data/ingest/run", ...auth, InvestmentOpsController.marketDataIngestRun);

router.get("/market-data/validation-queue", ...auth, InvestmentOpsController.marketDataValidationQueue);

router.post("/market-data/validation-queue/:tickId/approve", ...auth, InvestmentOpsController.marketDataApproveTick);

router.post("/market-data/validation-queue/:tickId/reject", ...auth, InvestmentOpsController.marketDataRejectTick);

router.get("/market-data/securities/:id/prices", ...auth, InvestmentOpsController.marketDataSecurityPrices);

router.get("/market-data/ingest/batches", ...auth, InvestmentOpsController.marketDataBatches);

router.get("/market-data/ingest/batches/:id", ...auth, InvestmentOpsController.marketDataBatchDetail);



// Orders

router.get("/orders", ...auth, InvestmentOpsController.listOrders);

router.post("/orders", ...auth, InvestmentOpsController.createOrder);

router.post("/orders/preview", ...auth, InvestmentOpsController.previewOrder);

router.get("/orders/:id", ...auth, InvestmentOpsController.getOrder);

router.post("/orders/:id/submit", ...auth, InvestmentOpsController.submitOrder);

router.post("/orders/:id/approve", ...auth, InvestmentOpsController.approveOrder);

router.post("/orders/:id/send-to-broker", ...auth, InvestmentOpsController.sendOrderToBroker);

router.post("/orders/:id/reject", ...auth, InvestmentOpsController.rejectOrder);

router.post("/orders/:id/cancel", ...auth, InvestmentOpsController.cancelOrder);

router.post("/orders/:id/compliance-check", ...auth, InvestmentOpsController.complianceCheckOrder);

router.post("/orders/:id/execute", ...auth, InvestmentOpsController.executeOrder);



// Trades

router.get("/trades", ...auth, InvestmentOpsController.listTradesEnriched);

router.get("/trades/:id", ...auth, InvestmentOpsController.getTrade);

router.post("/trades/:id/execute", ...auth, InvestmentOpsController.executeTrade);

router.get("/trades/:id/routing-hops", ...auth, InvestmentOpsController.tradeRoutingHops);

router.post("/trades/:id/routing-hops/:hopId/confirm", ...auth, InvestmentOpsController.tradeConfirmHop);

router.post("/trades/:id/routing-hops/:hopId/retry", ...auth, InvestmentOpsController.tradeRetryHop);

router.post("/trades/:id/routing-hops/:hopId/cancel", ...auth, InvestmentOpsController.tradeCancelHop);

router.get("/trades/:id/settlement-document", ...auth, InvestmentOpsController.tradeSettlementDoc);



// Compliance

router.get("/compliance/rules", ...auth, InvestmentOpsController.listComplianceRules);

router.post("/compliance/rules", ...auth, InvestmentOpsController.createComplianceRule);

router.post("/compliance/overrides", ...auth, InvestmentOpsController.complianceOverride);



// Simulation

router.post("/simulation/run", ...auth, InvestmentOpsController.runSimulation);

router.get("/simulation/runs/:id", ...auth, InvestmentOpsController.getSimulation);



// Model portfolios

router.get("/model-portfolios", ...auth, InvestmentOpsController.listModelPortfolios);

router.post("/model-portfolios", ...auth, InvestmentOpsController.createModelPortfolio);

router.get("/model-portfolios/:id/drift", ...auth, InvestmentOpsController.modelDrift);



// Valuation

router.post("/valuation/runs", ...auth, InvestmentOpsController.runValuation);

router.get("/valuation/runs/:id", ...auth, InvestmentOpsController.getValuationRun);

router.get("/valuation/exceptions", ...auth, InvestmentOpsController.valuationExceptions);

router.post("/valuation/exceptions/:id/resolve", ...auth, InvestmentOpsController.resolveValuationException);



// Reconciliation

router.post("/reconciliation/run", ...auth, InvestmentOpsController.runReconciliation);

router.post("/reconciliation/upload", ...auth, InvestmentOpsController.uploadReconciliationFile);

router.get("/reconciliation/batches", ...auth, InvestmentOpsController.listReconBatches);

router.get("/reconciliation/batches/:id", ...auth, InvestmentOpsController.getReconBatch);

router.post("/reconciliation/items/:id/resolve", ...auth, InvestmentOpsController.resolveReconItem);



// Accounting

router.get("/accounting/events", ...auth, InvestmentOpsController.listAccountingEvents);

router.get("/accounting/journals", ...auth, InvestmentOpsController.listAccountingJournals);

router.get("/accounting/journals/:id", ...auth, InvestmentOpsController.getAccountingJournal);

router.post("/accounting/events/:id/reverse", ...auth, InvestmentOpsController.reverseAccountingEvent);



// Documentation

router.get("/documents", ...auth, InvestmentOpsController.listDocuments);

router.post("/documents", ...auth, InvestmentOpsController.uploadDocument);

router.get("/documents/:id/download", ...auth, InvestmentOpsController.downloadDocument);



// Reporting

router.post("/reports/generate", ...auth, InvestmentOpsController.generateReport);

router.get("/reports/:id/download", ...auth, InvestmentOpsController.downloadReport);



// Setup

router.get("/setup/brokers", ...auth, InvestmentOpsController.listBrokers);

router.post("/setup/brokers", ...auth, InvestmentOpsController.createBroker);

router.get("/setup/custodians", ...auth, InvestmentOpsController.listCustodians);

router.post("/setup/custodians", ...auth, InvestmentOpsController.createCustodian);

router.get("/setup/commissions", ...auth, InvestmentOpsController.listCommissions);

router.post("/setup/commissions", ...auth, InvestmentOpsController.createCommission);

router.get("/setup/markets", ...auth, InvestmentOpsController.listMarkets);

router.post("/setup/markets", ...auth, InvestmentOpsController.createMarket);

router.get("/setup/currencies", ...auth, InvestmentOpsController.listSetupCurrencies);

router.get("/setup/countries", ...auth, InvestmentOpsController.listCountries);

router.post("/setup/countries", ...auth, InvestmentOpsController.createCountry);

router.get("/setup/issuers", ...auth, InvestmentOpsController.listIssuers);

router.post("/setup/issuers", ...auth, InvestmentOpsController.createIssuer);

router.get("/setup/price-sources", ...auth, InvestmentOpsController.priceSources);

router.get("/setup/settings", ...auth, InvestmentOpsController.getSettings);

router.put("/setup/settings", ...auth, InvestmentOpsController.updateSettings);



export default router;

