/**
 * Investment Operations v2.0 — Swagger paths (UI-section grouped).
 * Requirements: docs/investment-ops-backend-requirements.md
 *
 * All operations include SWAGGER_JSON_RESPONSES for Swagger UI 5 Try it out.
 * Click Authorize and paste JWT from POST /auth/login before executing.
 */

import { SWAGGER_JSON_RESPONSES } from "./swagger-default-responses";
import { jsonRequestBody, pathParam, queryParam } from "./swagger-module-helpers";
import { SWAGGER_EX } from "./swagger-uat-examples";

export const INVESTMENT_OPERATIONS_TAG = "Investment Operations";

export const INVESTMENT_OPERATIONS_TAG_DEFINITION = {
  name: INVESTMENT_OPERATIONS_TAG,
  description:
    "**Investment Operations (SRD v2.0)** — dashboard, portfolios, instruments, market data, orders, trades, compliance, valuation, reconciliation, accounting, documentation, reporting, setup.\n\n" +
    "Base path: `/investment-ops/*` (server URL already includes `/api`).\n\n" +
    "**Authorize required:** click Authorize, enter `Bearer <token>` from `POST /auth/login`.\n\n" +
    "See `docs/investment-ops-api-by-ui-section.md`.",
};

const TAG = [INVESTMENT_OPERATIONS_TAG];
const bearer = [{ bearerAuth: [] }];

function op(summary: string, extra: Record<string, unknown> = {}) {
  return { summary, tags: TAG, security: bearer, responses: SWAGGER_JSON_RESPONSES, ...extra };
}

const fundId = pathParam("fundId", SWAGGER_EX.fundId);
const id = pathParam("id", SWAGGER_EX.instrumentId);
const orderId = pathParam("id", SWAGGER_EX.orderId);
const tradeId = pathParam("id", SWAGGER_EX.tradeId);
const hopId = pathParam("hopId", SWAGGER_EX.hopId);
const tickId = pathParam("tickId", SWAGGER_EX.tickId);
const securityId = pathParam("id", SWAGGER_EX.securityId);
const batchId = pathParam("id", SWAGGER_EX.batchId);
const runId = pathParam("id", SWAGGER_EX.valuationRunId);
const modelId = pathParam("id", SWAGGER_EX.modelPortfolioId);

const fundIdQuery = queryParam("fundId", { type: "string" }, SWAGGER_EX.fundId);
const pageQuery = queryParam("page", { type: "integer" }, 1);
const pageSizeQuery = queryParam("pageSize", { type: "integer" }, 50);
const periodQuery = queryParam("period", { type: "string", enum: ["YTD", "MTD", "QTD", "WEEK", "DAY", "CUSTOM"] }, "MTD");

const orderPreviewBody = jsonRequestBody({
  schema: {
    type: "object",
    required: ["fundId", "side", "quantity"],
    properties: {
      fundId: { type: "string" },
      instrumentId: { type: "string" },
      side: { type: "string", enum: ["BUY", "SELL"] },
      quantity: { type: "number" },
      executionPrice: { type: "number" },
      limitPrice: { type: "number" },
      brokerProfileId: { type: "string" },
    },
  },
  examples: {
    buyPreview: {
      summary: "Buy preview",
      value: {
        fundId: SWAGGER_EX.fundId,
        instrumentId: SWAGGER_EX.instrumentId,
        side: "BUY",
        quantity: 100,
        executionPrice: 1.5,
      },
    },
  },
});

const fundIdBody = (extra: Record<string, unknown> = {}) =>
  jsonRequestBody({
    schema: {
      type: "object",
      properties: { fundId: { type: "string" }, ...extra },
    },
    examples: {
      default: { summary: "With fundId", value: { fundId: SWAGGER_EX.fundId } },
    },
  });

export const investmentOpsSwaggerPaths: Record<string, unknown> = {
  "/investment-ops/dashboard/summary": {
    get: op("Dashboard portfolio summary", {
      description: "NAV, P&L by fund. Use ?period=MTD|QTD|YTD|WEEK|DAY|CUSTOM.",
      parameters: [periodQuery, queryParam("startDate", { type: "string" }, "2026-01-01"), queryParam("endDate", { type: "string" })],
    }),
  },
  "/investment-ops/dashboard/allocation": {
    get: op("Asset allocation card", { parameters: [fundIdQuery] }),
  },
  "/investment-ops/dashboard/currency-exposure": {
    get: op("Currency exposure", { parameters: [fundIdQuery] }),
  },
  "/investment-ops/dashboard/funds": {
    get: op("Funds table"),
  },
  "/investment-ops/dashboard/recalculate": {
    post: op("Recalculate dashboard", {
      requestBody: fundIdBody(),
    }),
  },
  "/investment-ops/portfolios": {
    get: op("List portfolios"),
  },
  "/investment-ops/portfolios/{fundId}/overview": {
    get: op("Portfolio overview", { parameters: [fundId] }),
  },
  "/investment-ops/portfolios/{fundId}/holdings": {
    get: op("Positions / holdings", { parameters: [fundId] }),
  },
  "/investment-ops/portfolios/{fundId}/transactions": {
    get: op("Portfolio transactions", { parameters: [fundId] }),
  },
  "/investment-ops/portfolios/{fundId}/exposure": {
    get: op("Portfolio exposure", { parameters: [fundId] }),
  },
  "/investment-ops/portfolios/{fundId}/recalculate": {
    post: op("Recalculate portfolio", { parameters: [fundId] }),
  },
  "/investment-ops/instruments/types": {
    get: op("Instrument types"),
  },
  "/investment-ops/instruments": {
    get: op("List instruments", {
      parameters: [
        queryParam("type", { type: "string" }, "EQUITY"),
        queryParam("exchange", { type: "string" }, "ZSE"),
        queryParam("status", { type: "string" }, "APPROVED"),
        pageQuery,
        pageSizeQuery,
      ],
    }),
    post: op("Create instrument", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["shortName", "instrumentTypeCode"],
          properties: {
            shortName: { type: "string" },
            ticker: { type: "string" },
            exchangeCode: { type: "string" },
            instrumentTypeCode: { type: "string" },
            listingCurrencyCode: { type: "string" },
          },
        },
        examples: {
          equity: {
            summary: "ZSE equity",
            value: { shortName: "Test Co", ticker: "TEST", exchangeCode: "ZSE", instrumentTypeCode: "EQUITY", listingCurrencyCode: "USD" },
          },
        },
      }),
    }),
  },
  "/investment-ops/instruments/{id}": {
    get: op("Get instrument", { parameters: [id] }),
    put: op("Update instrument", {
      parameters: [id],
      requestBody: jsonRequestBody({
        schema: { type: "object", properties: { shortName: { type: "string" }, sector: { type: "string" } } },
        examples: { default: { summary: "Update name", value: { shortName: "Updated Name" } } },
      }),
    }),
  },
  "/investment-ops/instruments/{id}/approve": {
    post: op("Approve instrument", { parameters: [id] }),
  },
  "/investment-ops/market-data/prices/latest": {
    get: op("Latest prices"),
  },
  "/investment-ops/market-data/prices/stale": {
    get: op("Stale prices", { parameters: [queryParam("hours", { type: "integer" }, 24)] }),
  },
  "/investment-ops/market-data/prices/manual": {
    post: op("Manual price entry", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["securityId", "price"],
          properties: { securityId: { type: "string" }, price: { type: "number" }, sourceCode: { type: "string" } },
        },
        examples: {
          default: { summary: "Manual tick", value: { securityId: SWAGGER_EX.securityId, price: 1.25, sourceCode: "MANUAL" } },
        },
      }),
    }),
  },
  "/investment-ops/market-data/prices/upload": {
    post: op("Upload prices CSV", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["csvText"],
          properties: { csvText: { type: "string" }, sourceCode: { type: "string" } },
        },
        examples: {
          default: { summary: "CSV upload", value: { csvText: "symbol,exchange,price\nTEST,ZSE,1.5", sourceCode: "CSV" } },
        },
      }),
    }),
  },
  "/investment-ops/market-data/ingest/run": {
    post: op("Run price ingest", {
      requestBody: jsonRequestBody({
        schema: { type: "object", properties: { sourceCode: { type: "string", enum: ["ZSE", "VFEX", "SECZIM"] } } },
        examples: { zse: { summary: "ZSE ingest", value: { sourceCode: "ZSE" } } },
      }),
    }),
  },
  "/investment-ops/market-data/validation-queue": {
    get: op("Price validation queue"),
  },
  "/investment-ops/market-data/validation-queue/{tickId}/approve": {
    post: op("Approve price tick", { parameters: [tickId] }),
  },
  "/investment-ops/market-data/validation-queue/{tickId}/reject": {
    post: op("Reject price tick", {
      parameters: [tickId],
      requestBody: jsonRequestBody({
        schema: { type: "object", properties: { reason: { type: "string" } } },
        examples: { default: { summary: "Reject", value: { reason: "Price deviation too high" } } },
      }),
    }),
  },
  "/investment-ops/market-data/securities/{id}/prices": {
    get: op("Security price history", { parameters: [securityId] }),
  },
  "/investment-ops/market-data/ingest/batches": {
    get: op("Ingest batches"),
  },
  "/investment-ops/market-data/ingest/batches/{id}": {
    get: op("Ingest batch detail", { parameters: [batchId] }),
  },
  "/investment-ops/orders": {
    get: op("Orderbook", {
      parameters: [fundIdQuery, queryParam("status", { type: "string" }, "DRAFT"), pageQuery, pageSizeQuery],
    }),
    post: op("Create order", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["fundId", "side", "quantity"],
          properties: {
            fundId: { type: "string" },
            instrumentId: { type: "string" },
            side: { type: "string" },
            quantity: { type: "number" },
            executionPrice: { type: "number" },
            orderType: { type: "string" },
          },
        },
        examples: {
          draft: {
            summary: "Draft buy",
            value: { fundId: SWAGGER_EX.fundId, instrumentId: SWAGGER_EX.instrumentId, side: "BUY", quantity: 10, executionPrice: 1.5, orderType: "MARKET" },
          },
        },
      }),
    }),
  },
  "/investment-ops/orders/preview": {
    post: op("Preview order (pre-submit analytics)", { requestBody: orderPreviewBody }),
  },
  "/investment-ops/orders/{id}": {
    get: op("Get order", { parameters: [orderId] }),
  },
  "/investment-ops/orders/{id}/submit": {
    post: op("Submit order", { parameters: [orderId] }),
  },
  "/investment-ops/orders/{id}/approve": {
    post: op("Approve order", { parameters: [orderId] }),
  },
  "/investment-ops/orders/{id}/send-to-broker": {
    post: op("Send to broker", { parameters: [orderId] }),
  },
  "/investment-ops/orders/{id}/reject": {
    post: op("Reject order", {
      parameters: [orderId],
      requestBody: jsonRequestBody({
        schema: { type: "object", required: ["reason"], properties: { reason: { type: "string" } } },
        examples: { default: { summary: "Reject", value: { reason: "Compliance breach" } } },
      }),
    }),
  },
  "/investment-ops/orders/{id}/cancel": {
    post: op("Cancel order", {
      parameters: [orderId],
      requestBody: jsonRequestBody({
        schema: { type: "object", properties: { reason: { type: "string" } } },
        examples: { default: { summary: "Cancel", value: { reason: "User cancelled" } } },
      }),
    }),
  },
  "/investment-ops/orders/{id}/compliance-check": {
    post: op("Compliance check", { parameters: [orderId] }),
  },
  "/investment-ops/orders/{id}/execute": {
    post: op("Execute order", { parameters: [orderId] }),
  },
  "/investment-ops/trades": {
    get: op("Trade blotter", { parameters: [fundIdQuery, queryParam("status", { type: "string" })] }),
  },
  "/investment-ops/trades/{id}": {
    get: op("Get trade", { parameters: [tradeId] }),
  },
  "/investment-ops/trades/{id}/execute": {
    post: op("Execute trade", { parameters: [tradeId] }),
  },
  "/investment-ops/trades/{id}/routing-hops": {
    get: op("Routing hops", { parameters: [tradeId] }),
  },
  "/investment-ops/trades/{id}/routing-hops/{hopId}/confirm": {
    post: op("Confirm routing hop", {
      parameters: [tradeId, hopId],
      requestBody: jsonRequestBody({
        schema: { type: "object", properties: { externalRef: { type: "string" } } },
        examples: { default: { summary: "Confirm", value: { externalRef: "BROKER-CONF-001" } } },
      }),
    }),
  },
  "/investment-ops/trades/{id}/routing-hops/{hopId}/retry": {
    post: op("Retry routing hop", { parameters: [tradeId, hopId] }),
  },
  "/investment-ops/trades/{id}/routing-hops/{hopId}/cancel": {
    post: op("Cancel routing hop", {
      parameters: [tradeId, hopId],
      requestBody: jsonRequestBody({
        schema: { type: "object", properties: { reason: { type: "string" } } },
        examples: { default: { summary: "Cancel hop", value: { reason: "Cancelled by ops" } } },
      }),
    }),
  },
  "/investment-ops/trades/{id}/settlement-document": {
    get: op("Settlement document", { parameters: [tradeId] }),
  },
  "/investment-ops/compliance/rules": {
    get: op("Compliance rules", { parameters: [fundIdQuery] }),
    post: op("Create compliance rule", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["ruleCode", "ruleName", "ruleType"],
          properties: {
            fundId: { type: "string" },
            ruleCode: { type: "string" },
            ruleName: { type: "string" },
            ruleType: { type: "string" },
            thresholdValue: { type: "number" },
          },
        },
        examples: {
          maxWeight: {
            summary: "Max single security weight",
            value: { ruleCode: "MAX_WEIGHT", ruleName: "Max 25% single name", ruleType: "MAX_SINGLE_SECURITY_WEIGHT", thresholdValue: 25 },
          },
        },
      }),
    }),
  },
  "/investment-ops/compliance/overrides": {
    post: op("Compliance override", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["orderId", "reason"],
          properties: { orderId: { type: "string" }, reason: { type: "string" }, documentId: { type: "string" } },
        },
        examples: {
          default: { summary: "Override", value: { orderId: SWAGGER_EX.orderId, reason: "Board approved exception" } },
        },
      }),
    }),
  },
  "/investment-ops/simulation/run": {
    post: op("Run simulation", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["fundId"],
          properties: { fundId: { type: "string" }, scenario: { type: "object" } },
        },
        examples: {
          default: {
            summary: "What-if buy",
            value: {
              fundId: SWAGGER_EX.fundId,
              scenario: { side: "BUY", instrumentId: SWAGGER_EX.instrumentId, quantity: 100, price: 1.5 },
            },
          },
        },
      }),
    }),
  },
  "/investment-ops/simulation/runs/{id}": {
    get: op("Get simulation run", { parameters: [pathParam("id", SWAGGER_EX.simulationRunId)] }),
  },
  "/investment-ops/model-portfolios": {
    get: op("Model portfolios"),
    post: op("Create model portfolio", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" }, allocations: { type: "array", items: { type: "object" } } },
        },
        examples: {
          default: {
            summary: "Balanced",
            value: {
              name: "Balanced ZSE",
              allocations: [{ allocationType: "ASSET_CLASS", allocationKey: "EQUITY", targetWeightPct: 80 }],
            },
          },
        },
      }),
    }),
  },
  "/investment-ops/model-portfolios/{id}/drift": {
    get: op("Model drift", { parameters: [modelId, fundIdQuery] }),
  },
  "/investment-ops/valuation/runs": {
    post: op("Run valuation", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["fundId"],
          properties: {
            fundId: { type: "string" },
            async: { type: "boolean" },
            costBasisMethod: { type: "string", enum: ["WAC", "FIFO"] },
          },
        },
        examples: {
          sync: { summary: "Sync WAC valuation", value: { fundId: SWAGGER_EX.fundId, costBasisMethod: "WAC" } },
        },
      }),
    }),
  },
  "/investment-ops/valuation/runs/{id}": {
    get: op("Valuation run detail", { parameters: [runId] }),
  },
  "/investment-ops/valuation/exceptions": {
    get: op("Valuation exceptions", { parameters: [fundIdQuery] }),
  },
  "/investment-ops/valuation/exceptions/{id}/resolve": {
    post: op("Resolve valuation exception", {
      parameters: [pathParam("id", SWAGGER_EX.valuationExceptionId)],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["action"],
          properties: { action: { type: "string" }, reason: { type: "string" } },
        },
        examples: { default: { summary: "Resolve", value: { action: "OVERRIDE_PRICE", reason: "Committee approved estimate" } } },
      }),
    }),
  },
  "/investment-ops/reconciliation/run": {
    post: op("Run reconciliation", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["fundId", "reconType"],
          properties: {
            fundId: { type: "string" },
            reconType: { type: "string", enum: ["HOLDINGS", "CUSTODIAN_POSITION", "TRADE", "PRICE", "CASH"] },
            csvText: { type: "string" },
            fileName: { type: "string" },
          },
        },
        examples: {
          holdings: { summary: "Holdings recon", value: { fundId: SWAGGER_EX.fundId, reconType: "HOLDINGS" } },
        },
      }),
    }),
  },
  "/investment-ops/reconciliation/upload": {
    post: op("Upload recon file", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["fundId", "reconType", "csvText"],
          properties: {
            fundId: { type: "string" },
            reconType: { type: "string" },
            csvText: { type: "string" },
            fileName: { type: "string" },
          },
        },
        examples: {
          custodian: {
            summary: "Custodian CSV",
            value: { fundId: SWAGGER_EX.fundId, reconType: "CUSTODIAN_POSITION", csvText: "ref,quantity\nARIS.ZSE,1000", fileName: "custodian.csv" },
          },
        },
      }),
    }),
  },
  "/investment-ops/reconciliation/batches": {
    get: op("Reconciliation batches", { parameters: [fundIdQuery] }),
  },
  "/investment-ops/reconciliation/batches/{id}": {
    get: op("Reconciliation batch detail", { parameters: [batchId] }),
  },
  "/investment-ops/reconciliation/items/{id}/resolve": {
    post: op("Resolve recon item", {
      parameters: [pathParam("id", SWAGGER_EX.reconItemId)],
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["reason"],
          properties: { reason: { type: "string" }, documentId: { type: "string" } },
        },
        examples: { default: { summary: "Resolve", value: { reason: "Custodian confirmed via email" } } },
      }),
    }),
  },
  "/investment-ops/accounting/events": {
    get: op("Accounting events", {
      parameters: [fundIdQuery, queryParam("status", { type: "string" }, "POSTED"), pageQuery, pageSizeQuery],
    }),
  },
  "/investment-ops/accounting/journals": {
    get: op("Accounting journals", {
      description: "Linked journal entries from posted investment accounting events. Requires Authorize (Bearer JWT).",
      parameters: [fundIdQuery],
    }),
  },
  "/investment-ops/accounting/journals/{id}": {
    get: op("Accounting journal detail", { parameters: [pathParam("id", SWAGGER_EX.journalEntryId)] }),
  },
  "/investment-ops/accounting/events/{id}/reverse": {
    post: op("Reverse accounting event", {
      parameters: [pathParam("id", SWAGGER_EX.accountingEventId)],
      requestBody: jsonRequestBody({
        schema: { type: "object", required: ["reason"], properties: { reason: { type: "string" } } },
        examples: { default: { summary: "Reverse", value: { reason: "Posted in error" } } },
      }),
    }),
  },
  "/investment-ops/documents": {
    get: op("Documentation list", { parameters: [fundIdQuery, queryParam("documentType", { type: "string" })] }),
    post: op("Upload document", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["documentType", "title", "fileRef"],
          properties: {
            fundId: { type: "string" },
            documentType: { type: "string" },
            title: { type: "string" },
            fileRef: { type: "string" },
          },
        },
        examples: {
          default: { summary: "Broker confirm", value: { fundId: SWAGGER_EX.fundId, documentType: "BROKER_CONFIRM", title: "Trade confirm", fileRef: "/storage/doc.pdf" } },
        },
      }),
    }),
  },
  "/investment-ops/documents/{id}/download": {
    get: op("Download document", { parameters: [pathParam("id", SWAGGER_EX.documentId)] }),
  },
  "/investment-ops/reports/templates": {
    get: op("List report templates", {
      description: "Available Investment Operations report templates and supported output formats.",
    }),
  },
  "/investment-ops/reports": {
    get: op("List generated reports", {
      description:
        "Paginated history of generated report runs with fund, type, format, status, requester, and timestamps.",
      parameters: [
        fundIdQuery,
        queryParam("reportType", { type: "string" }, "PERFORMANCE_REPORT"),
        queryParam("status", { type: "string", enum: ["PENDING", "RUNNING", "COMPLETED", "FAILED"] }, "COMPLETED"),
        pageQuery,
        pageSizeQuery,
      ],
    }),
  },
  "/investment-ops/reports/generate": {
    post: op("Generate report", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["reportType"],
          properties: {
            fundId: { type: "string" },
            clientId: { type: "string", description: "Required for CLIENT_MANDATE scoped reports" },
            reportType: {
              type: "string",
              enum: [
                "PERFORMANCE_REPORT",
                "HOLDINGS_REPORT",
                "TRANSACTION_REPORT",
                "ASSET_ALLOCATION_REPORT",
                "INCOME_REPORT",
                "FEE_REPORT",
                "CLIENT_PORTFOLIO_VALUATION",
                "RECONCILIATION_EXCEPTION_REPORT",
                "CUSTODIAN_TRUSTEE_RECONCILIATION",
                "SUBSCRIPTIONS_REDEMPTIONS_REPORT",
                "AUM_FUM_MOVEMENT_REPORT",
                "TRUSTEE_QUARTERLY_PACK",
                "CIS_MONTHLY_RETURN_PACK",
                "AML_CFT_CPF_RETURN_PACK",
                "SECZIM_CAPITAL_ADEQUACY_PACK",
                "SECZIM_PRUDENTIAL_RETURN_PACK",
                "PORTFOLIO_VALUATION",
                "TRADE_BLOTTER",
                "HOLDINGS_SUMMARY",
                "COMPLIANCE_SUMMARY",
                "RECONCILIATION_SUMMARY",
              ],
            },
            format: { type: "string", enum: ["DOCX", "JSON", "PDF", "CSV", "EXCEL"] },
            parameters: {
              type: "object",
              properties: {
                periodStart: { type: "string", format: "date" },
                periodEnd: { type: "string", format: "date" },
                valuationDate: { type: "string", format: "date" },
                benchmarkName: { type: "string" },
                clientLegalName: { type: "string" },
                assetManagerName: { type: "string" },
              },
            },
          },
        },
        examples: {
          performanceDocx: {
            summary: "Performance Report (Word template)",
            value: {
              fundId: SWAGGER_EX.fundId,
              reportType: "PERFORMANCE_REPORT",
              format: "DOCX",
              parameters: {
                periodStart: "2026-01-01",
                periodEnd: "2026-03-31",
                valuationDate: "2026-03-31",
                benchmarkName: "ZSE Industrial Index",
              },
            },
          },
          pdf: { summary: "PDF valuation", value: { fundId: SWAGGER_EX.fundId, reportType: "PORTFOLIO_VALUATION", format: "PDF" } },
        },
      }),
    }),
  },
  "/investment-ops/reports/{id}/download": {
    get: op("Download report", { parameters: [pathParam("id", SWAGGER_EX.reportRunId)] }),
  },
  "/investment-ops/setup/brokers": {
    get: op("List brokers"),
    post: op("Create broker", {
      requestBody: jsonRequestBody({
        schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, contactEmail: { type: "string" } } },
        examples: { default: { summary: "Broker", value: { name: "Imara Capital", contactEmail: "dealing@imara.co.zw" } } },
      }),
    }),
  },
  "/investment-ops/setup/custodians": {
    get: op("List custodians"),
    post: op("Create custodian", {
      requestBody: jsonRequestBody({
        schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, contactEmail: { type: "string" } } },
        examples: { default: { summary: "Custodian", value: { name: "CABS Custody", contactEmail: "custody@cabs.co.zw" } } },
      }),
    }),
  },
  "/investment-ops/setup/commissions": {
    get: op("List commissions", { parameters: [queryParam("stakeholderProfileId", { type: "string" })] }),
    post: op("Create commission", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["stakeholderProfileId", "rateBps"],
          properties: { stakeholderProfileId: { type: "string" }, rateBps: { type: "number" }, instrumentTypeCode: { type: "string" } },
        },
        examples: { default: { summary: "Commission", value: { stakeholderProfileId: SWAGGER_EX.brokerProfileId, rateBps: 25 } } },
      }),
    }),
  },
  "/investment-ops/setup/markets": {
    get: op("List markets"),
    post: op("Create market", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["marketCode", "marketName"],
          properties: { marketCode: { type: "string" }, marketName: { type: "string" }, countryCode: { type: "string" } },
        },
        examples: { default: { summary: "Market", value: { marketCode: "ZSE", marketName: "Zimbabwe Stock Exchange", countryCode: "ZW" } } },
      }),
    }),
  },
  "/investment-ops/setup/currencies": {
    get: op("List currencies"),
  },
  "/investment-ops/setup/countries": {
    get: op("List countries"),
    post: op("Create country", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["countryCode", "countryName"],
          properties: { countryCode: { type: "string" }, countryName: { type: "string" }, region: { type: "string" } },
        },
        examples: { default: { summary: "Country", value: { countryCode: "ZW", countryName: "Zimbabwe", region: "Africa" } } },
      }),
    }),
  },
  "/investment-ops/setup/issuers": {
    get: op("List issuers", { parameters: [queryParam("countryCode", { type: "string" }, "ZW")] }),
    post: op("Create issuer", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          required: ["issuerCode", "legalName"],
          properties: { issuerCode: { type: "string" }, legalName: { type: "string" }, countryCode: { type: "string" } },
        },
        examples: { default: { summary: "Issuer", value: { issuerCode: "DELTA", legalName: "Delta Corporation Limited", countryCode: "ZW" } } },
      }),
    }),
  },
  "/investment-ops/setup/price-sources": {
    get: op("Price API heartbeat"),
  },
  "/investment-ops/setup/settings": {
    get: op("System settings"),
    put: op("Update settings", {
      requestBody: jsonRequestBody({
        schema: {
          type: "object",
          properties: {
            four_eye_orders: { type: "object", properties: { enabled: { type: "boolean" } } },
            default_valuation_method: { type: "object" },
          },
        },
        examples: {
          fourEye: { summary: "Enable four-eye", value: { four_eye_orders: { enabled: true } } },
        },
      }),
    }),
  },
};
