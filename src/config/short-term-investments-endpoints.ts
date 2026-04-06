/**
 * Short-term investments — merged into Swagger fallback + primary spec (prod /api-docs).
 * Paths follow the same /accounting/... prefix as other accounting entries (full URL = server + /api + path when using /api base — see project hosting).
 */
const bearer = [{ bearerAuth: [] }];
const tag = "Accounting - Short-term investments";

export const shortTermInvestmentsEndpoints = {
  "/accounting/short-term-investments/settings": {
    get: {
      summary: "Get STI global settings",
      description: "Posting mode (DRAFT/APPROVED), fiscal timezone, login accrual watermark.",
      tags: [tag],
      security: bearer,
      responses: {
        200: { description: "Settings row" },
        401: { description: "Unauthorized" },
        500: { description: "Server error" },
      },
    },
    patch: {
      summary: "Update STI global settings",
      tags: [tag],
      security: bearer,
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                postingMode: { type: "string", enum: ["DRAFT", "APPROVED"] },
                fiscalTimezone: { type: "string", nullable: true, example: "Africa/Harare" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Updated settings" },
        400: { description: "Validation error" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/accounting/short-term-investments/dashboard": {
    get: {
      summary: "CFO-style STI dashboard",
      description:
        "Portfolio totals, per-instrument breakdown, dense daily yield in month, maturity buckets (projected at maturity), settlement variance, alerts.",
      tags: [tag],
      security: bearer,
      parameters: [
        {
          in: "query",
          name: "asOfIso",
          schema: { type: "string", format: "date", example: "2026-04-30" },
          description: "Reporting date YYYY-MM-DD (defaults to server UTC date)",
        },
        {
          in: "query",
          name: "broker",
          schema: { type: "string", example: "Demo broker" },
          description: "Optional broker filter (Daily Yield Report + portfolio totals scoped to broker)",
        },
      ],
      responses: {
        200: { description: "Dashboard payload" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/accounting/short-term-investments/instruments": {
    get: {
      summary: "List STI instruments",
      tags: [tag],
      security: bearer,
      responses: {
        200: { description: "Array of instruments (summary includes)" },
        401: { description: "Unauthorized" },
      },
    },
    post: {
      summary: "Create STI instrument",
      tags: [tag],
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: [
                "name",
                "principal",
                "currencyId",
                "settlementBankId",
                "principalGlAccountId",
                "accruedInterestGlAccountId",
                "interestIncomeGlAccountId",
                "negativeYieldExpenseGlAccountId",
                "startDateIso",
                "initialApy",
              ],
              properties: {
                name: { type: "string" },
                category: { type: "string", nullable: true },
                broker: { type: "string", nullable: true },
                principal: { type: "number" },
                currencyId: { type: "string" },
                functionalCurrencyId: {
                  type: "string",
                  nullable: true,
                  description: "Reporting currency; null = single-currency book",
                },
                compoundingMethod: { type: "string", enum: ["SIMPLE", "COMPOUND_DAILY", "COMPOUND_MONTHLY"] },
                dayCountConvention: { type: "string", example: "ACTUAL_365" },
                settlementBankId: { type: "string" },
                principalGlAccountId: { type: "string" },
                accruedInterestGlAccountId: { type: "string" },
                interestIncomeGlAccountId: { type: "string" },
                negativeYieldExpenseGlAccountId: { type: "string" },
                unrealizedFxGlAccountId: { type: "string", nullable: true },
                realizedFxGlAccountId: { type: "string", nullable: true },
                startDateIso: { type: "string", format: "date" },
                maturityDateIso: { type: "string", format: "date", nullable: true },
                initialApy: { type: "number", example: 0.05, description: "Decimal APY e.g. 0.05 = 5%" },
                initialApyEffectiveFromIso: { type: "string", format: "date" },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Instrument created" },
        400: { description: "Validation error" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/accounting/short-term-investments/instruments/{id}": {
    get: {
      summary: "Get STI instrument by id",
      tags: [tag],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Instrument with apyRates, accruals (capped), relations" },
        404: { description: "Not found" },
        401: { description: "Unauthorized" },
      },
    },
    patch: {
      summary: "Update ACTIVE STI instrument (partial)",
      tags: [tag],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                category: { type: "string", nullable: true },
                broker: { type: "string", nullable: true },
                maturityDateIso: { type: "string", format: "date" },
                dayCountConvention: { type: "string" },
                functionalCurrencyId: { type: "string", nullable: true },
                unrealizedFxGlAccountId: { type: "string", nullable: true },
                realizedFxGlAccountId: { type: "string", nullable: true },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Updated" },
        400: { description: "e.g. day count locked" },
        404: { description: "Not found" },
        401: { description: "Unauthorized" },
      },
    },
    delete: {
      summary: "Delete STI instrument (blocked)",
      description:
        "Deletion is intentionally blocked. Use POST /accounting/short-term-investments/instruments/{id}/void instead.",
      tags: [tag],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: {
        405: { description: "Method not allowed (use void)" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/accounting/short-term-investments/instruments/{id}/apy-rates": {
    post: {
      summary: "Append APY rate segment",
      tags: [tag],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["effectiveFromIso", "apy"],
              properties: {
                effectiveFromIso: { type: "string", format: "date" },
                apy: { type: "number" },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "APY row created" },
        400: { description: "Validation error" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/accounting/short-term-investments/instruments/{id}/catch-up": {
    post: {
      summary: "Catch up accruals through a date",
      description: "Fills missing calendar days from last accrual + 1 through throughIso (inclusive).",
      tags: [tag],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["throughIso"],
              properties: {
                throughIso: { type: "string", format: "date", example: "2026-04-30" },
                throughDate: { type: "string", description: "Alias for throughIso" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Array of { day, outcome }" },
        400: { description: "Validation error" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/accounting/short-term-investments/instruments/{id}/liquidate": {
    post: {
      summary: "Settle / liquidate instrument",
      tags: [tag],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["settlementIso", "cashReceived"],
              properties: {
                settlementIso: { type: "string", format: "date" },
                settlementDate: { type: "string", description: "Alias" },
                cashReceived: { type: "number" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Instrument SETTLED" },
        400: { description: "Validation error" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/accounting/short-term-investments/instruments/{id}/void": {
    post: {
      summary: "Void instrument (reverse linked accrual JEs)",
      tags: [tag],
      security: bearer,
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Instrument VOIDED" },
        400: { description: "Error" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/accounting/short-term-investments/accruals/{accrualId}/approve": {
    post: {
      summary: "Approve accrual journal (DRAFT posting mode)",
      description: "Posts linked JE when accrual is PENDING_POST.",
      tags: [tag],
      security: bearer,
      parameters: [{ in: "path", name: "accrualId", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Accrual updated" },
        400: { description: "Not pending" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/accounting/short-term-investments/fx/month-end-revaluation": {
    post: {
      summary: "Month-end unrealized FX revaluation",
      description:
        "Runs only for ACTIVE instruments with functionalCurrencyId and unrealizedFxGlAccountId set.",
      tags: [tag],
      security: bearer,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["yearMonth"],
              properties: {
                yearMonth: { type: "string", pattern: "^\\d{4}-\\d{2}$", example: "2026-04" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "monthEndIso + summary[]" },
        400: { description: "Invalid yearMonth" },
        401: { description: "Unauthorized" },
      },
    },
  },
};
