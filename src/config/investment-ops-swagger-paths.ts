/**
 * Investment Operations v2.0 — Swagger paths (SRD-aligned).
 * Regenerated from src/routes/investmentOpsRoutes.ts (docs-tests-seed).
 * Canonical docs: docs/investments-v2-api.md
 *
 * All operations include SWAGGER_JSON_RESPONSES for Swagger UI Try it out.
 * Click Authorize and paste JWT from POST /auth/login before executing.
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";
import { pathParam } from "./swagger-module-helpers";
import { SWAGGER_EX } from "./swagger-uat-examples";

export const INVESTMENT_OPERATIONS_TAG = "Investment Operations";

export const INVESTMENT_OPERATIONS_TAG_DEFINITION = {
  name: INVESTMENT_OPERATIONS_TAG,
  description:
    "**Investment Operations (Investments V2 / SRD v2.0)** — dashboard, portfolios, instruments, market data, orders, trades, compliance, valuation, reconciliation, accounting, documentation, reporting, jobs, audit, capabilities, setup.\n\n" +
    "Base path: `/investment-ops/*` (server URL already includes `/api`).\n\n" +
    "**Authorize required:** click Authorize, enter `Bearer <token>` from `POST /auth/login`.\n\n" +
    "See `docs/investments-v2-api.md`, `docs/stock-picker-cash-api.md` (cash), and `docs/investments-v2-frontend-handoff.md`.",
};

const TAG = [INVESTMENT_OPERATIONS_TAG];
const bearer = [{ bearerAuth: [] }];

function op(summary: string, extra: Record<string, unknown> = {}) {
  return { summary, tags: TAG, security: bearer, responses: SWAGGER_JSON_RESPONSES, ...extra };
}

/** Route count helper for verify scripts (expanded reference catalogs). */
export const INVESTMENT_OPS_SWAGGER_OP_COUNT = 377;

export const investmentOpsSwaggerPaths = {
  "/investment-ops/accounting/events": {
    get: op("Get accounting/events"),
  },
  "/investment-ops/accounting/posting-status": {
    get: op("Accounting posting status aggregate counts"),
  },
  "/investment-ops/accounting/events/{id}": {
    get: op("Get accounting/events/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/accounting/events/{id}/retry": {
    post: op("Create or run accounting/events/{id}/retry", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/accounting/events/{id}/reverse": {
    post: op("Create or run accounting/events/{id}/reverse", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/accounting/journals": {
    get: op("Get accounting/journals"),
  },
  "/investment-ops/accounting/journals/{id}": {
    get: op("Get accounting/journals/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/accounting/journals/{id}/approve": {
    post: op("Create or run accounting/journals/{id}/approve", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/accounting/journals/{id}/post": {
    post: op("Create or run accounting/journals/{id}/post", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/accounting/journals/{id}/reject": {
    post: op("Create or run accounting/journals/{id}/reject", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/accounting/journals/{id}/submit": {
    post: op("Create or run accounting/journals/{id}/submit", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/accounting/ledger-exports": {
    get: op("Get accounting/ledger-exports"),
    post: op("Create or run accounting/ledger-exports"),
  },
  "/investment-ops/accounting/ledger-exports/{id}": {
    get: op("Get accounting/ledger-exports/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/accounting/ledger-exports/{id}/download": {
    get: op("Get accounting/ledger-exports/{id}/download", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/accounting/reversals": {
    get: op("Get accounting/reversals"),
  },
  "/investment-ops/accounting/reversals/{id}/approve": {
    post: op("Create or run accounting/reversals/{id}/approve", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/accounting/reversals/{id}/reject": {
    post: op("Create or run accounting/reversals/{id}/reject", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/assignments/{id}": {
    patch: op("Update assignments/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/audit-events": {
    get: op("Get audit-events"),
  },
  "/investment-ops/blotters": {
    get: op("Get blotters"),
    post: op("Create or run blotters"),
  },
  "/investment-ops/blotters/{id}": {
    get: op("Get blotters/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update blotters/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/blotters/{id}/orders": {
    post: op("Create or run blotters/{id}/orders", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/blotters/{id}/orders/{orderId}": {
    delete: op("Delete blotters/{id}/orders/{orderId}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId), pathParam("orderId", SWAGGER_EX.orderId)] }),
  },
  "/investment-ops/capabilities": {
    get: op("Get capabilities"),
  },
  "/investment-ops/compliance/overrides": {
    get: op("Get compliance/overrides"),
  },
  "/investment-ops/compliance/overrides/requests": {
    post: op("Create or run compliance/overrides/requests"),
  },
  "/investment-ops/compliance/overrides/{id}/approve": {
    post: op("Create or run compliance/overrides/{id}/approve", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/compliance/overrides/{id}/reject": {
    post: op("Create or run compliance/overrides/{id}/reject", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/compliance/rules": {
    get: op("Get compliance/rules"),
    post: op("Create or run compliance/rules"),
  },
  "/investment-ops/compliance/rules/{id}": {
    delete: op("Delete compliance/rules/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    get: op("Get compliance/rules/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update compliance/rules/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/compliance/runs": {
    get: op("Get compliance/runs"),
  },
  "/investment-ops/compliance/results": {
    get: op("List flat pre-trade compliance results (paged)"),
  },
  "/investment-ops/compliance/runs/{id}": {
    get: op("Get compliance/runs/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/dashboard/allocation": {
    get: op("Get dashboard/allocation"),
  },
  "/investment-ops/dashboard/currency-exposure": {
    get: op("Get dashboard/currency-exposure"),
  },
  "/investment-ops/dashboard/funds": {
    get: op("Get dashboard/funds"),
  },
  "/investment-ops/dashboard/recalculate": {
    post: op("Create or run dashboard/recalculate"),
  },
  "/investment-ops/dashboard/summary": {
    get: op("Get dashboard/summary"),
  },
  "/investment-ops/documents": {
    get: op("Get documents"),
    post: op("Create or run documents"),
  },
  "/investment-ops/documents/{id}": {
    get: op("Get documents/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update documents/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/documents/{id}/access": {
    get: op("Get documents/{id}/access", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    put: op("Replace documents/{id}/access", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/documents/{id}/archive": {
    post: op("Create or run documents/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/documents/{id}/audit": {
    get: op("Get documents/{id}/audit", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/documents/{id}/download": {
    get: op("Get documents/{id}/download", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/documents/{id}/versions": {
    get: op("Get documents/{id}/versions", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    post: op("Create or run documents/{id}/versions", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/documents/{id}/versions/{versionId}/approve": {
    post: op("Create or run documents/{id}/versions/{versionId}/approve", { parameters: [pathParam("id", SWAGGER_EX.instrumentId), pathParam("versionId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/documents/{id}/versions/{versionId}/download": {
    get: op("Get documents/{id}/versions/{versionId}/download", { parameters: [pathParam("id", SWAGGER_EX.instrumentId), pathParam("versionId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/documents/{id}/versions/{versionId}/preview": {
    get: op("Get documents/{id}/versions/{versionId}/preview", { parameters: [pathParam("id", SWAGGER_EX.instrumentId), pathParam("versionId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/documents/{id}/versions/{versionId}/reject": {
    post: op("Create or run documents/{id}/versions/{versionId}/reject", { parameters: [pathParam("id", SWAGGER_EX.instrumentId), pathParam("versionId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/documents/{id}/versions/{versionId}/request-changes": {
    post: op("Create or run documents/{id}/versions/{versionId}/request-changes", { parameters: [pathParam("id", SWAGGER_EX.instrumentId), pathParam("versionId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/files": {
    post: op("Create or run files"),
  },
  "/investment-ops/files/upload-sessions": {
    post: op("Create or run files/upload-sessions"),
  },
  "/investment-ops/files/{fileId}/complete": {
    post: op("Create or run files/{fileId}/complete", { parameters: [pathParam("fileId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/files/{fileId}/status": {
    get: op("Get files/{fileId}/status", { parameters: [pathParam("fileId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/folders/{id}": {
    get: op("Get folders/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update folders/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/folders/{id}/archive": {
    post: op("Create or run folders/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/folders/{id}/restore": {
    post: op("Create or run folders/{id}/restore", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/instruments": {
    get: op("Get instruments"),
    post: op("Create or run instruments"),
  },
  "/investment-ops/instruments/types": {
    get: op("Get instruments/types"),
  },
  "/investment-ops/instruments/{id}": {
    get: op("Get instruments/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    put: op("Replace instruments/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/instruments/{id}/approve": {
    post: op("Create or run instruments/{id}/approve", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/instruments/{id}/archive": {
    post: op("Create or run instruments/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/instruments/{id}/reject": {
    post: op("Create or run instruments/{id}/reject", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/instruments/{id}/restrict": {
    post: op("Create or run instruments/{id}/restrict", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/instruments/{id}/submit": {
    post: op("Create or run instruments/{id}/submit", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/jobs/{jobId}": {
    get: op("Get jobs/{jobId}", { parameters: [pathParam("jobId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/jobs/{jobId}/cancel": {
    post: op("Create or run jobs/{jobId}/cancel", { parameters: [pathParam("jobId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/limits/{id}": {
    get: op("Get limits/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update limits/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/limits/{id}/archive": {
    post: op("Create or run limits/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/market-data/fx-rates": {
    get: op("Get market-data/fx-rates"),
    post: op("Create or run market-data/fx-rates"),
  },
  "/investment-ops/market-data/fx-rates/latest": {
    get: op("Get market-data/fx-rates/latest"),
  },
  "/investment-ops/market-data/fx-rates/{id}/approve": {
    post: op("Create or run market-data/fx-rates/{id}/approve", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/market-data/fx-rates/{id}/reject": {
    post: op("Create or run market-data/fx-rates/{id}/reject", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/market-data/ingest/batches": {
    get: op("Get market-data/ingest/batches"),
  },
  "/investment-ops/market-data/ingest/batches/{id}": {
    get: op("Get market-data/ingest/batches/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/market-data/ingest/run": {
    post: op("Create or run market-data/ingest/run"),
  },
  "/investment-ops/market-data/prices/latest": {
    get: op("Get market-data/prices/latest"),
  },
  "/investment-ops/market-data/prices/manual": {
    post: op("Create or run market-data/prices/manual"),
  },
  "/investment-ops/market-data/prices/stale": {
    get: op("Get market-data/prices/stale"),
  },
  "/investment-ops/market-data/prices/upload": {
    post: op("Create or run market-data/prices/upload"),
  },
  "/investment-ops/market-data/prices/{securityId}/history": {
    get: op("Get market-data/prices/{securityId}/history", { parameters: [pathParam("securityId", SWAGGER_EX.securityId)] }),
  },
  "/investment-ops/market-data/securities/{id}/prices": {
    get: op("Get market-data/securities/{id}/prices", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/market-data/sources/health": {
    get: op("Get market-data/sources/health"),
  },
  "/investment-ops/market-data/validation-queue": {
    get: op("Get market-data/validation-queue"),
  },
  "/investment-ops/market-data/validation-queue/{tickId}/approve": {
    post: op("Create or run market-data/validation-queue/{tickId}/approve", { parameters: [pathParam("tickId", SWAGGER_EX.tickId)] }),
  },
  "/investment-ops/market-data/validation-queue/{tickId}/reject": {
    post: op("Create or run market-data/validation-queue/{tickId}/reject", { parameters: [pathParam("tickId", SWAGGER_EX.tickId)] }),
  },
  "/investment-ops/model-portfolios": {
    get: op("Get model-portfolios"),
    post: op("Create or run model-portfolios"),
  },
  "/investment-ops/model-portfolios/{id}": {
    get: op("Get model-portfolios/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update model-portfolios/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/model-portfolios/{id}/activate": {
    post: op("Create or run model-portfolios/{id}/activate", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/model-portfolios/{id}/archive": {
    post: op("Create or run model-portfolios/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/model-portfolios/{id}/drift": {
    get: op("Get model-portfolios/{id}/drift", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/model-portfolios/{id}/rebalance-recommendations": {
    post: op("Create or run model-portfolios/{id}/rebalance-recommendations", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders": {
    get: op("Get orders"),
    post: op("Create or run orders"),
  },
  "/investment-ops/orders/approval-routes": {
    get: op("Get orders/approval-routes"),
    post: op("Create or run orders/approval-routes"),
  },
  "/investment-ops/orders/approval-routes/{id}": {
    delete: op("Delete orders/approval-routes/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update orders/approval-routes/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/configuration/{fundId}": {
    get: op("Get orders/configuration/{fundId}", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
    patch: op("Update orders/configuration/{fundId}", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/orders/preview": {
    post: op("Create or run orders/preview"),
  },
  "/investment-ops/orders/{id}": {
    delete: op("Delete orders/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    get: op("Get orders/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update orders/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/applicable-approval-routes": {
    get: op("Get orders/{id}/applicable-approval-routes", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/approve": {
    post: op("Create or run orders/{id}/approve", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/cancel": {
    post: op("Create or run orders/{id}/cancel", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/compliance-check": {
    post: op("Create or run orders/{id}/compliance-check", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/execute": {
    post: op("Create or run orders/{id}/execute", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/executions": {
    get: op("Get orders/{id}/executions", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    post: op("Create or run orders/{id}/executions", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/history": {
    get: op("Get orders/{id}/history", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/reject": {
    post: op("Create or run orders/{id}/reject", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/send-to-broker": {
    post: op("Create or run orders/{id}/send-to-broker", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/settlement": {
    post: op("Create or run orders/{id}/settlement", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/submit": {
    post: op("Create or run orders/{id}/submit", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/orders/{id}/trade-confirmation": {
    post: op("Create or run orders/{id}/trade-confirmation", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/outbox-events": {
    get: op("Get outbox-events"),
  },
  "/investment-ops/outbox-events/poll": {
    get: op("Get outbox-events/poll"),
  },
  "/investment-ops/portfolios": {
    get: op("Get portfolios"),
    post: op("Create or run portfolios"),
  },
  "/investment-ops/portfolios/{fundId}": {
    delete: op("Delete portfolios/{fundId}", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
    get: op("Get portfolios/{fundId}", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
    patch: op("Update portfolios/{fundId}", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/assignments": {
    get: op("Get portfolios/{fundId}/assignments", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
    post: op("Create or run portfolios/{fundId}/assignments", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/config": {
    get: op("Get portfolios/{fundId}/config", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
    patch: op("Update portfolios/{fundId}/config", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/exposure": {
    get: op("Get portfolios/{fundId}/exposure", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/folders": {
    get: op("Get portfolios/{fundId}/folders", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
    post: op("Create or run portfolios/{fundId}/folders", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/folders/reorder": {
    put: op("Replace portfolios/{fundId}/folders/reorder", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/holdings": {
    get: op("Get portfolios/{fundId}/holdings", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/limits": {
    get: op("Get portfolios/{fundId}/limits", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
    post: op("Create or run portfolios/{fundId}/limits", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/overview": {
    get: op("Get portfolios/{fundId}/overview", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/positions": {
    get: op("Get portfolios/{fundId}/positions", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/recalculate": {
    post: op("Create or run portfolios/{fundId}/recalculate", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/transactions": {
    get: op("Get portfolios/{fundId}/transactions", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/portfolios/{fundId}/transactions/manual-adjustments": {
    post: op("Create or run portfolios/{fundId}/transactions/manual-adjustments", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/positions/{id}": {
    get: op("Get positions/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/rebalance-runs/{id}/convert-to-draft-orders": {
    post: op("Create or run rebalance-runs/{id}/convert-to-draft-orders", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/batches": {
    get: op("Get reconciliation/batches"),
  },
  "/investment-ops/reconciliation/batches/{id}": {
    get: op("Get reconciliation/batches/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/items": {
    get: op("Get reconciliation/items"),
  },
  "/investment-ops/reconciliation/items/{id}": {
    get: op("Get reconciliation/items/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/items/{id}/approve-write-off": {
    post: op("Create or run reconciliation/items/{id}/approve-write-off", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/items/{id}/assign": {
    post: op("Create or run reconciliation/items/{id}/assign", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/items/{id}/escalate": {
    post: op("Create or run reconciliation/items/{id}/escalate", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/items/{id}/history": {
    get: op("Get reconciliation/items/{id}/history", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/items/{id}/investigate": {
    post: op("Create or run reconciliation/items/{id}/investigate", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/items/{id}/reject-write-off": {
    post: op("Create or run reconciliation/items/{id}/reject-write-off", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/items/{id}/reopen": {
    post: op("Create or run reconciliation/items/{id}/reopen", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/items/{id}/resolve": {
    post: op("Create or run reconciliation/items/{id}/resolve", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/items/{id}/write-off": {
    post: op("Create or run reconciliation/items/{id}/write-off", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation/run": {
    post: op("Create or run reconciliation/run"),
  },
  "/investment-ops/reconciliation/summary": {
    get: op("Get reconciliation/summary"),
  },
  "/investment-ops/reconciliation/upload": {
    post: op("Create or run reconciliation/upload"),
  },
  "/investment-ops/reconciliation/uploads": {
    post: op("Create or run reconciliation/uploads"),
  },
  "/investment-ops/reports": {
    get: op("Get reports"),
  },
  "/investment-ops/reports/generate": {
    post: op("Create or run reports/generate"),
  },
  "/investment-ops/reports/templates": {
    get: op("Get reports/templates"),
  },
  "/investment-ops/reports/{id}": {
    get: op("Get reports/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reports/{id}/audit": {
    get: op("Get reports/{id}/audit", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reports/{id}/cancel": {
    post: op("Create or run reports/{id}/cancel", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reports/{id}/download": {
    get: op("Get reports/{id}/download", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reports/{id}/retry": {
    post: op("Create or run reports/{id}/retry", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/brokers": {
    get: op("Get setup/brokers"),
    post: op("Create or run setup/brokers"),
  },
  "/investment-ops/setup/commissions": {
    get: op("Get setup/commissions"),
    post: op("Create or run setup/commissions"),
  },
  "/investment-ops/setup/commissions/{id}": {
    get: op("Get setup/commissions/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/commissions/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/commissions/{id}/archive": {
    post: op("Create or run setup/commissions/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/countries": {
    get: op("Get setup/countries"),
    post: op("Create or run setup/countries"),
  },
  "/investment-ops/setup/countries/{id}": {
    get: op("Get setup/countries/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/countries/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/countries/{id}/archive": {
    post: op("Create or run setup/countries/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/coupon-frequencies": {
    get: op("Get setup/coupon-frequencies"),
    post: op("Create or run setup/coupon-frequencies"),
  },
  "/investment-ops/setup/coupon-frequencies/{id}": {
    get: op("Get setup/coupon-frequencies/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/coupon-frequencies/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/coupon-frequencies/{id}/archive": {
    post: op("Create or run setup/coupon-frequencies/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/icons": {
    get: op("List setup icons reference catalog"),
    post: op("Create setup icon"),
  },
  "/investment-ops/setup/icons/{id}": {
    get: op("Get setup icon", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup icon", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/icons/{id}/archive": {
    post: op("Archive setup icon", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/currencies": {
    get: op("Get setup/currencies"),
    post: op("Create or run setup/currencies"),
  },
  "/investment-ops/setup/currencies/{id}": {
    get: op("Get setup/currencies/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/currencies/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/currencies/{id}/archive": {
    post: op("Create or run setup/currencies/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/custodians": {
    get: op("Get setup/custodians"),
    post: op("Create or run setup/custodians"),
  },
  "/investment-ops/setup/funds": {
    get: op("Get setup/funds"),
    post: op("Create or run setup/funds"),
  },
  "/investment-ops/setup/funds/{id}": {
    get: op("Get setup/funds/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    put: op("Replace setup/funds/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/funds/{id}/config": {
    put: op("Replace setup/funds/{id}/config", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/funds/{id}/managers": {
    post: op("Create or run setup/funds/{id}/managers", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/instrument-mappings": {
    get: op("Get setup/instrument-mappings"),
    post: op("Create or run setup/instrument-mappings"),
  },
  "/investment-ops/setup/instrument-mappings/{id}": {
    get: op("Get setup/instrument-mappings/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/instrument-mappings/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/instrument-mappings/{id}/archive": {
    post: op("Create or run setup/instrument-mappings/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/instrument-subcategories": {
    get: op("Get setup/instrument-subcategories"),
    post: op("Create or run setup/instrument-subcategories"),
  },
  "/investment-ops/setup/instrument-subcategories/{id}": {
    get: op("Get setup/instrument-subcategories/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/instrument-subcategories/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/instrument-subcategories/{id}/archive": {
    post: op("Create or run setup/instrument-subcategories/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/instrument-types": {
    get: op("Get setup/instrument-types"),
    post: op("Create or run setup/instrument-types"),
  },
  "/investment-ops/setup/instrument-types/{id}": {
    get: op("Get setup/instrument-types/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/instrument-types/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/instrument-types/{id}/archive": {
    post: op("Create or run setup/instrument-types/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/issuers": {
    get: op("Get setup/issuers"),
    post: op("Create or run setup/issuers"),
  },
  "/investment-ops/setup/issuers/{id}": {
    get: op("Get setup/issuers/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/issuers/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/issuers/{id}/archive": {
    post: op("Create or run setup/issuers/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/markets": {
    get: op("Get setup/markets"),
    post: op("Create or run setup/markets"),
  },
  "/investment-ops/setup/markets/{id}": {
    get: op("Get setup/markets/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/markets/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/markets/{id}/archive": {
    post: op("Create or run setup/markets/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/price-sources": {
    get: op("Get setup/price-sources"),
    post: op("Create or run setup/price-sources"),
  },
  "/investment-ops/setup/price-sources/{id}": {
    get: op("Get setup/price-sources/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/price-sources/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/price-sources/{id}/archive": {
    post: op("Create or run setup/price-sources/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/reference-types": {
    get: op("Get setup/reference-types"),
  },
  "/investment-ops/setup/settings": {
    get: op("Get setup/settings"),
    put: op("Replace setup/settings"),
  },
  "/investment-ops/setup/settlement-accounts": {
    get: op("Get setup/settlement-accounts"),
    post: op("Create or run setup/settlement-accounts"),
  },
  "/investment-ops/setup/settlement-accounts/{id}": {
    get: op("Get setup/settlement-accounts/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/settlement-accounts/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/settlement-accounts/{id}/archive": {
    post: op("Create or run setup/settlement-accounts/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/ssis": {
    get: op("Get setup/ssis"),
    post: op("Create or run setup/ssis"),
  },
  "/investment-ops/setup/ssis/{id}": {
    get: op("Get setup/ssis/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/ssis/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/ssis/{id}/archive": {
    post: op("Create or run setup/ssis/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/stakeholders": {
    get: op("Get setup/stakeholders"),
    post: op("Create or run setup/stakeholders"),
  },
  "/investment-ops/setup/stakeholders/{id}": {
    get: op("Get setup/stakeholders/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/stakeholders/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/stakeholders/{id}/archive": {
    post: op("Create or run setup/stakeholders/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/tags": {
    get: op("Get setup/tags"),
    post: op("Create or run setup/tags"),
  },
  "/investment-ops/setup/tags/{id}": {
    get: op("Get setup/tags/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update setup/tags/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/tags/{id}/archive": {
    post: op("Create or run setup/tags/{id}/archive", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/simulation/run": {
    post: op("Create or run simulation/run"),
  },
  "/investment-ops/simulation/runs": {
    get: op("Get simulation/runs"),
  },
  "/investment-ops/simulation/runs/{id}": {
    get: op("Get simulation/runs/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/trades": {
    get: op("Get trades"),
  },
  "/investment-ops/trades/{id}": {
    get: op("Get trades/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/trades/{id}/execute": {
    post: op("Create or run trades/{id}/execute", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/trades/{id}/routing-hops": {
    get: op("Get trades/{id}/routing-hops", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/trades/{id}/routing-hops/{hopId}/cancel": {
    post: op("Create or run trades/{id}/routing-hops/{hopId}/cancel", { parameters: [pathParam("id", SWAGGER_EX.instrumentId), pathParam("hopId", SWAGGER_EX.hopId)] }),
  },
  "/investment-ops/trades/{id}/routing-hops/{hopId}/confirm": {
    post: op("Create or run trades/{id}/routing-hops/{hopId}/confirm", { parameters: [pathParam("id", SWAGGER_EX.instrumentId), pathParam("hopId", SWAGGER_EX.hopId)] }),
  },
  "/investment-ops/trades/{id}/routing-hops/{hopId}/retry": {
    post: op("Create or run trades/{id}/routing-hops/{hopId}/retry", { parameters: [pathParam("id", SWAGGER_EX.instrumentId), pathParam("hopId", SWAGGER_EX.hopId)] }),
  },
  "/investment-ops/trades/{id}/settlement-document": {
    get: op("Get trades/{id}/settlement-document", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/trading/portfolios/{fundId}/positions": {
    get: op("Get trading/portfolios/{fundId}/positions", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/trading/portfolios/{fundId}/positions/recalculate": {
    post: op("Create or run trading/portfolios/{fundId}/positions/recalculate", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/trading/portfolios/{fundId}/positions/summary": {
    get: op("Get trading/portfolios/{fundId}/positions/summary", { parameters: [pathParam("fundId", SWAGGER_EX.fundId)] }),
  },
  "/investment-ops/trading/saved-views": {
    get: op("Get trading/saved-views"),
    post: op("Create or run trading/saved-views"),
  },
  "/investment-ops/trading/saved-views/{id}": {
    delete: op("Delete trading/saved-views/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
    patch: op("Update trading/saved-views/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/transactions/{id}": {
    get: op("Get transactions/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/transactions/{id}/reverse": {
    post: op("Create or run transactions/{id}/reverse", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/exceptions": {
    get: op("Get valuation/exceptions"),
  },
  "/investment-ops/valuation/exceptions/{id}": {
    get: op("Get valuation/exceptions/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/exceptions/{id}/approve-override": {
    post: op("Create or run valuation/exceptions/{id}/approve-override", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/exceptions/{id}/escalate": {
    post: op("Create or run valuation/exceptions/{id}/escalate", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/exceptions/{id}/override": {
    post: op("Create or run valuation/exceptions/{id}/override", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/exceptions/{id}/reject-override": {
    post: op("Create or run valuation/exceptions/{id}/reject-override", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/exceptions/{id}/resolve": {
    post: op("Create or run valuation/exceptions/{id}/resolve", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/fx-validation": {
    get: op("Get valuation/fx-validation"),
  },
  "/investment-ops/valuation/price-validation": {
    get: op("Get valuation/price-validation"),
  },
  "/investment-ops/valuation/runs": {
    get: op("Get valuation/runs"),
    post: op("Create or run valuation/runs"),
  },
  "/investment-ops/valuation/runs/{id}": {
    get: op("Get valuation/runs/{id}", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/runs/{id}/cancel": {
    post: op("Create or run valuation/runs/{id}/cancel", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/runs/{id}/inputs": {
    get: op("Get valuation/runs/{id}/inputs", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/runs/{id}/items": {
    get: op("Get valuation/runs/{id}/items", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/runs/{id}/rerun": {
    post: op("Create or run valuation/runs/{id}/rerun", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/valuation/runs/{id}/summary": {
    get: op("Get valuation/runs/{id}/summary", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  // ── Stock Picker Cash (SRD §14) — see docs/stock-picker-cash-api.md ──
  "/investment-ops/client-cash-accounts": {
    get: op("List client cash accounts"),
    post: op("Create client cash account"),
  },
  "/investment-ops/client-cash-accounts/{accountId}": {
    get: op("Get client cash account", { parameters: [pathParam("accountId", "cca_sunrise_usd_001")] }),
  },
  "/investment-ops/client-cash-accounts/{accountId}/submit": {
    post: op("Submit client cash account", { parameters: [pathParam("accountId", "cca_sunrise_usd_001")] }),
  },
  "/investment-ops/client-cash-accounts/{accountId}/approve": {
    post: op("Approve client cash account", { parameters: [pathParam("accountId", "cca_sunrise_usd_001")] }),
  },
  "/investment-ops/client-cash-accounts/{accountId}/reject": {
    post: op("Reject client cash account", { parameters: [pathParam("accountId", "cca_sunrise_usd_001")] }),
  },
  "/investment-ops/client-cash-accounts/{accountId}/suspend": {
    post: op("Suspend client cash account", { parameters: [pathParam("accountId", "cca_sunrise_usd_001")] }),
  },
  "/investment-ops/client-cash-accounts/{accountId}/close": {
    post: op("Close client cash account", { parameters: [pathParam("accountId", "cca_sunrise_usd_001")] }),
  },
  "/investment-ops/cash-overview": {
    get: op("Get cash overview"),
  },
  "/investment-ops/cash-overview/daily-movement": {
    get: op("Get daily cash movement series for charts"),
  },
  "/investment-ops/portfolios/{portfolioId}/cash-position": {
    get: op("Get portfolio cash position", { parameters: [pathParam("portfolioId", "SPF-SUNRISE-001")] }),
  },
  "/investment-ops/portfolios/{portfolioId}/cash-explanation": {
    get: op("Get portfolio cash explanation", { parameters: [pathParam("portfolioId", "SPF-SUNRISE-001")] }),
  },
  "/investment-ops/portfolios/{portfolioId}/cash-projection": {
    get: op("Get portfolio cash projection", { parameters: [pathParam("portfolioId", "SPF-SUNRISE-001")] }),
  },
  "/investment-ops/cash-reservations": {
    get: op("List cash reservations"),
    post: op("Create cash reservation"),
  },
  "/investment-ops/cash-reservations/{id}/approve": {
    post: op("Approve cash reservation", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/cash-reservations/{id}/consume": {
    post: op("Consume cash reservation", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/cash-reservations/{id}/release": {
    post: op("Release cash reservation", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/cash-ledger": {
    get: op("List cash ledger"),
  },
  "/investment-ops/cash-journals": {
    post: op("Create cash journal"),
  },
  "/investment-ops/cash-journals/{id}": {
    get: op("Get cash journal", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/cash-journals/{id}/submit": {
    post: op("Submit cash journal", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/cash-journals/{id}/approve": {
    post: op("Approve cash journal", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/cash-journals/{id}/reject": {
    post: op("Reject cash journal", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/cash-journals/{id}/reverse": {
    post: op("Reverse cash journal", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/external-statements/imports": {
    post: op("Create external statement import"),
  },
  "/investment-ops/external-statements/imports/{id}": {
    get: op("Get external statement import", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/external-statements/imports/{id}/errors": {
    get: op("List external statement import errors", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/external-statements/imports/{id}/validate": {
    post: op("Validate external statement import", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/external-statements/imports/{id}/submit": {
    post: op("Submit external statement import", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/external-statements/imports/{id}/commit": {
    post: op("Commit external statement import", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/external-statements/imports/{id}/reject": {
    post: op("Reject external statement import", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-batches": {
    get: op("List cash reconciliation batches"),
    post: op("Create cash reconciliation batch"),
  },
  "/investment-ops/reconciliation-batches/{id}": {
    get: op("Get cash reconciliation batch", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-batches/{id}/run": {
    post: op("Run cash reconciliation batch", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-batches/{id}/workspace": {
    get: op("Get cash recon workspace", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-batches/{id}/summary": {
    get: op("Get cash recon batch summary", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-batches/{id}/auto-match": {
    post: op("Auto-match cash reconciliation batch", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-rules/active": {
    get: op("Get active cash reconciliation rules"),
  },
  "/investment-ops/fund-cash-summary": {
    get: op("Get fund cash summary"),
  },
  "/investment-ops/matches/confirm": {
    post: op("Confirm cash match links"),
  },
  "/investment-ops/matches/manual": {
    post: op("Create manual cash match"),
  },
  "/investment-ops/matches/{linkId}": {
    get: op("Get cash match link", { parameters: [pathParam("linkId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/matches/{linkId}/reverse": {
    post: op("Reverse cash match link", { parameters: [pathParam("linkId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/broker-custodian/workspace": {
    get: op("Get broker-custodian workspace"),
  },
  "/investment-ops/broker-custodian/matches/confirm": {
    post: op("Confirm broker-custodian matches"),
  },
  "/investment-ops/broker-custodian/items/{id}/escalate": {
    post: op("Escalate broker-custodian item", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/broker-custodian/items/{id}/clear": {
    post: op("Clear broker-custodian item", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-exceptions": {
    get: op("List cash reconciliation exceptions"),
  },
  "/investment-ops/reconciliation-exceptions/summary": {
    get: op("Get cash reconciliation exceptions summary"),
  },
  "/investment-ops/reconciliation-exceptions/{id}": {
    get: op("Get cash reconciliation exception", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-exceptions/{id}/timeline": {
    get: op("Get exception timeline", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-exceptions/{id}/comments": {
    get: op("List exception comments"),
    post: op("Add exception comment"),
  },
  "/investment-ops/reconciliation-exceptions/{id}/attachments": {
    get: op("List exception attachments"),
    post: op("Add exception attachment"),
  },
  "/investment-ops/reconciliation-exceptions/{id}/audit": {
    get: op("Get exception audit trail"),
  },
  "/investment-ops/reconciliation-exceptions/{id}/assign": {
    post: op("Assign cash reconciliation exception", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-exceptions/{id}/propose-resolution": {
    post: op("Propose exception resolution", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-exceptions/{id}/approve": {
    post: op("Approve cash reconciliation exception", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/reconciliation-breaks/{breakId}": {
    get: op("Get cash reconciliation break", { parameters: [pathParam("breakId", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/cash-periods/{period}/precheck": {
    post: op("Precheck cash period close", { parameters: [pathParam("period", "2026-07")] }),
  },
  "/investment-ops/cash-periods/{period}/close": {
    post: op("Close cash period", { parameters: [pathParam("period", "2026-07")] }),
  },
  "/investment-ops/cash-gl-exports": {
    post: op("Create cash GL export"),
  },
  "/investment-ops/cash-gl-exports/{id}": {
    get: op("Get cash GL export", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/client-statements": {
    get: op("List client cash statements"),
  },
  "/investment-ops/client-statements/generate": {
    post: op("Generate client cash statement"),
  },
  "/investment-ops/client-statements/{id}": {
    get: op("Get client cash statement", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/client-statements/{id}/approve": {
    post: op("Approve client cash statement", { parameters: [pathParam("id", SWAGGER_EX.instrumentId)] }),
  },
  "/investment-ops/setup/providers": {
    get: op("List cash statement providers"),
    post: op("Create cash statement provider"),
  },
  "/investment-ops/setup/file-layouts": {
    get: op("List cash file layouts"),
    post: op("Create cash file layout"),
  },
  "/investment-ops/setup/account-mappings": {
    get: op("List cash account mappings"),
    post: op("Create cash account mapping"),
  },
  "/investment-ops/setup/tolerance-policies": {
    get: op("List cash tolerance policies"),
    post: op("Create cash tolerance policy"),
  },
  "/investment-ops/setup/match-weight-policies": {
    get: op("List cash match weight policies"),
    post: op("Create cash match weight policy"),
  },
  "/investment-ops/setup/{resource}/{id}/activate": {
    post: op("Activate cash setup resource", {
      parameters: [pathParam("resource", "providers"), pathParam("id", SWAGGER_EX.instrumentId)],
    }),
  },

};

export default investmentOpsSwaggerPaths;
