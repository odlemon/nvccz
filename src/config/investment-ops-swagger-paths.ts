/**
 * Investment Operations v2.0 — Swagger paths (UI-section grouped).
 * Requirements: docs/investment-ops-backend-requirements.md
 */

export const INVESTMENT_OPERATIONS_TAG = "Investment Operations";

export const INVESTMENT_OPERATIONS_TAG_DEFINITION = {
  name: INVESTMENT_OPERATIONS_TAG,
  description:
    "Arcus Investment Operations terminal (SRD v2.0): dashboard, portfolios, instruments, orders, trades, valuation, reconciliation, accounting facade, documentation, reporting, and setup.",
};

const TAG = [INVESTMENT_OPERATIONS_TAG];
const bearer = [{ bearerAuth: [] }];

function path(method: string, route: string, summary: string, description: string, extra: object = {}) {
  const m = method.toLowerCase();
  return {
    [route]: {
      [m]: {
        tags: TAG,
        summary,
        description,
        security: bearer,
        ...extra,
      },
    },
  };
}

export const investmentOpsSwaggerPaths = {
  ...path("get", "/investment-ops/dashboard/summary", "Dashboard portfolio summary", "Executive multi-fund NAV, P&L and status. Supports ?period=MTD|QTD|YTD|WEEK|DAY|CUSTOM."),
  ...path("get", "/investment-ops/dashboard/allocation", "Asset allocation card", "Multi-asset buckets: equities, cash, bonds, funds, commodities, crypto, alternatives."),
  ...path("get", "/investment-ops/dashboard/currency-exposure", "Currency exposure", "USD, ZiG and other currency weights."),
  ...path("get", "/investment-ops/dashboard/funds", "Funds table", "Fund NAV and valuation status."),
  ...path("post", "/investment-ops/dashboard/recalculate", "Recalculate dashboard", "Force valuation run for fund(s)."),
  ...path("get", "/investment-ops/portfolios", "List portfolios", "Funds accessible to user."),
  ...path("get", "/investment-ops/portfolios/{fundId}/overview", "Portfolio overview", "NAV, P&L, manager, status."),
  ...path("get", "/investment-ops/portfolios/{fundId}/holdings", "Positions / holdings", "WAC, market value, unrealized P&L."),
  ...path("get", "/investment-ops/portfolios/{fundId}/transactions", "Portfolio transactions", "Trades, settlements, JE links."),
  ...path("get", "/investment-ops/portfolios/{fundId}/exposure", "Portfolio exposure", "Sector and concentration exposure."),
  ...path("post", "/investment-ops/portfolios/{fundId}/recalculate", "Recalculate portfolio", "Fund valuation run."),
  ...path("get", "/investment-ops/instruments/types", "Instrument types", "Equity, bond, ETF, cash, etc."),
  ...path("get", "/investment-ops/instruments", "List instruments", "Paginated instrument master registry."),
  ...path("get", "/investment-ops/instruments/{id}", "Get instrument", "Instrument detail by id."),
  ...path("post", "/investment-ops/instruments", "Create instrument", "Equity, ETF, bond, cash types."),
  ...path("put", "/investment-ops/instruments/{id}", "Update instrument", "Edit draft instrument."),
  ...path("post", "/investment-ops/instruments/{id}/approve", "Approve instrument", "Required before trading."),
  ...path("get", "/investment-ops/market-data/prices/latest", "Latest prices", "Watchlist bulk prices."),
  ...path("get", "/investment-ops/market-data/prices/stale", "Stale prices", "Instruments past stale threshold."),
  ...path("post", "/investment-ops/market-data/prices/manual", "Manual price entry", "Pending validation queue."),
  ...path("post", "/investment-ops/market-data/prices/upload", "Upload prices CSV", "Bulk price upload."),
  ...path("post", "/investment-ops/market-data/ingest/run", "Run price ingest", "ZSE/VFEX/SECZIM adapters."),
  ...path("get", "/investment-ops/market-data/validation-queue", "Price validation queue", "Pending review ticks."),
  ...path("get", "/investment-ops/orders", "Orderbook", "Paginated; filter by status tab."),
  ...path("post", "/investment-ops/orders", "Create order", "Draft order."),
  ...path("post", "/investment-ops/orders/preview", "Preview order", "Pre-submit consideration, weight, cash impact, compliance."),
  ...path("get", "/investment-ops/orders/{id}", "Get order", "Order detail with approvals."),
  ...path("post", "/investment-ops/orders/{id}/submit", "Submit order", "Compliance check then SUBMITTED or COMPLIANCE_REVIEW."),
  ...path("post", "/investment-ops/orders/{id}/approve", "Approve order", "Four-eye approval when enabled."),
  ...path("post", "/investment-ops/orders/{id}/send-to-broker", "Send to broker", "SENT_TO_BROKER lifecycle transition."),
  ...path("post", "/investment-ops/orders/{id}/reject", "Reject order", "Reject with reason."),
  ...path("post", "/investment-ops/orders/{id}/cancel", "Cancel order", "Cancel draft/submitted order."),
  ...path("post", "/investment-ops/orders/{id}/compliance-check", "Compliance check", "Run mandate rules on order."),
  ...path("post", "/investment-ops/orders/{id}/execute", "Execute order", "Creates trade and routes settlement."),
  ...path("get", "/investment-ops/trades", "Trade blotter", "Enriched with accounting and confirmation status."),
  ...path("get", "/investment-ops/trades/{id}", "Get trade", "Trade detail with routing hops."),
  ...path("get", "/investment-ops/trades/{id}/routing-hops", "Routing hops", "Broker/custodian/GL hop status."),
  ...path("post", "/investment-ops/trades/{id}/routing-hops/{hopId}/confirm", "Confirm routing hop", "Confirm broker/custodian hop."),
  ...path("post", "/investment-ops/trades/{id}/routing-hops/{hopId}/retry", "Retry routing hop", "Retry failed hop."),
  ...path("post", "/investment-ops/trades/{id}/routing-hops/{hopId}/cancel", "Cancel routing hop", "Cancel staged hop."),
  ...path("get", "/investment-ops/compliance/rules", "Compliance rules", "Mandate and exposure limits."),
  ...path("post", "/investment-ops/compliance/rules", "Create compliance rule", "Sector, country, issuer, ESG rules."),
  ...path("post", "/investment-ops/compliance/overrides", "Compliance override", "Override with reason and document."),
  ...path("post", "/investment-ops/simulation/run", "Run simulation", "What-if NAV, cash, compliance impact."),
  ...path("get", "/investment-ops/model-portfolios", "Model portfolios", "Target weight templates."),
  ...path("get", "/investment-ops/model-portfolios/{id}/drift", "Model drift", "Live vs target weights."),
  ...path("post", "/investment-ops/valuation/runs", "Run valuation", "Sync or async; WAC or FIFO cost basis."),
  ...path("get", "/investment-ops/valuation/runs/{id}", "Valuation run detail", "Run status and NAV."),
  ...path("get", "/investment-ops/valuation/exceptions", "Valuation exceptions", "Missing price / FX issues."),
  ...path("post", "/investment-ops/valuation/exceptions/{id}/resolve", "Resolve valuation exception", "Close exception with action."),
  ...path("post", "/investment-ops/reconciliation/run", "Run reconciliation", "Cash, holdings, trade, price."),
  ...path("post", "/investment-ops/reconciliation/upload", "Upload recon file", "External custodian/bank CSV match."),
  ...path("get", "/investment-ops/reconciliation/batches", "Reconciliation batches", "Batch list by fund."),
  ...path("get", "/investment-ops/reconciliation/batches/{id}", "Reconciliation batch detail", "Batch with line items."),
  ...path("get", "/investment-ops/accounting/events", "Accounting events", "Paginated GL events facade."),
  ...path("get", "/investment-ops/accounting/journals", "Accounting journals", "Linked journal entries."),
  ...path("post", "/investment-ops/accounting/events/{id}/reverse", "Reverse accounting event", "Creates reversing journal entry."),
  ...path("get", "/investment-ops/documents", "Documentation list", "Broker confirms, mandates, statements."),
  ...path("post", "/investment-ops/reports/generate", "Generate report", "PDF, Excel, CSV portfolio and trade exports."),
  ...path("get", "/investment-ops/setup/brokers", "List brokers", "Execution counterparties."),
  ...path("get", "/investment-ops/setup/custodians", "List custodians", "Settlement counterparties."),
  ...path("get", "/investment-ops/setup/countries", "List countries", "Country reference data."),
  ...path("get", "/investment-ops/setup/issuers", "List issuers", "Issuer reference data."),
  ...path("get", "/investment-ops/setup/price-sources", "Price API heartbeat", "Ingest status per source."),
  ...path("get", "/investment-ops/setup/settings", "System settings", "Four-eye, valuation method, stale price."),
  ...path("put", "/investment-ops/setup/settings", "Update settings", "Configure four-eye and valuation defaults."),
};
