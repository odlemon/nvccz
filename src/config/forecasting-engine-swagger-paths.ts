/**
 * Forecasting Engine — hypercube scenario, grid, compute, versioning APIs.
 * Requirements: docs/forecasting-engine-backend-requirements.md
 *
 * Cron routes (e.g. POST /cron/forecasting/gl-sync) are omitted from Swagger — ops only.
 */

export const FORECASTING_ENGINE_TAG = "Forecasting Engine";

const TAG = [FORECASTING_ENGINE_TAG];

/** Shared reference for Swagger — where external IDs come from. */
const ID_SOURCES = {
  entity_id:
    "Forecast entity id from **GET /api/forecasting/entities**. Each entity (internal subsidiary or external startup) owns its own cloned chart of accounts. Omit to use the default entity (migrated from the singleton CompanyProfile).",
  fund_id:
    "Fund (investment vehicle) id from **GET /api/funds**. Optional on create; when set, cells default to this fund dimension.",
  account_id:
    "Per-entity account id from **GET /api/forecasting/entities/{entity_id}/chart-of-accounts**. These are entity-specific clones of the global chart; their `source_account_id` links back to the global `chart_of_accounts` for GL actuals sync. External-startup entities may have accounts with no `source_account_id` — those contribute 0 to GL sync.",
  performance_goal_id:
    "Performance module goal id from **GET /api/performance/goals** (OPM). Links forecast totals to a goal's currentValue after compute.",
  dimension_value_id:
    "Preset slice key (not a DB id): `COA_RANGE_REVENUE`, `COA_RANGE_OPEX`, `COA_RANGE_CAPEX`, or a specific entity account id from **GET /api/forecasting/entities/{id}/chart-of-accounts**.",
  scenario_id: "Forecast scenario id from **GET /api/forecasting/scenarios** or create/duplicate responses.",
  version_id: "Immutable snapshot id from **GET /api/forecasting/scenarios/{id}/versions** (after lock)."
};

/**
 * Live examples from `npm run uat:forecasting:full` (see forecast-test-scenario-id.txt).
 * These are real ids from the dev database — use GET /forecasting/entities to refresh.
 */
const EX = {
  default_entity_id: "cmqddqg04pUFU2O-JAELLpQ",
  default_entity_name: "Default Entity",
  revenue_account_id: "cmqddrgx1pwE5d7aGXGFqSw",
  revenue_account_no: "6100",
  revenue_account_name: "Management Fees Income",
  expense_account_id: "cmqddrcfbSQBql-kfN1sYNg",
  expense_account_no: 5000,
  performance_goal_id: "cmprcs9a60009unhg6ng2nme7",
  scenario_id: "cmqdskzr000a7unvou4oepzvl",
  duplicate_scenario_id: "cmqdsp6fd00counvohyzhxu1o",
  version_id: "cmqdsorht00ckunvo25ert6oo",
  compute_job_id: "cmqdsl8x100agunvo3wa3ajjq",
  source_account_id: "cmi0az1xg000dun64y7ay570i",
  fund_id: "cmfund_example0001",
  dept_id: "dept_finance_001",
  portfolio_company_id: "cmportfolio_example01",
  analytical_tag: "COST_CENTER_HQ"
};

/** Frontend dropdown reference — dimension `type` + allowed `value_id` shapes. */
const DIMENSION_TYPE_ENUM = ["ACCOUNT", "DEPT", "TAG", "PORTFOLIO_COMPANY"] as const;

const ACCOUNT_VALUE_IDS = [
  { value_id: "COA_RANGE_REVENUE", label: "Revenue (accounts 4000–4999)", range: "4000–4999" },
  { value_id: "COA_RANGE_OPEX", label: "Operating expense (5000–5999)", range: "5000–5999" },
  { value_id: "COA_RANGE_COGS", label: "Cost of goods sold (6000–6999)", range: "6000–6999" },
  { value_id: "COA_RANGE_ASSETS", label: "Assets (1000–1999)", range: "1000–1999" },
  { value_id: "COA_RANGE_LIABILITIES", label: "Liabilities (2000–2999)", range: "2000–2999" },
  { value_id: "COA_RANGE_EQUITY", label: "Equity (3000–3999)", range: "3000–3999" },
  {
    value_id: EX.revenue_account_id,
    label: `Single account ${EX.revenue_account_no} — ${EX.revenue_account_name}`,
    range: "single account id from entity COA"
  },
  {
    value_id: EX.expense_account_id,
    label: `Single account ${EX.expense_account_no} — Opex line`,
    range: "single account id from entity COA"
  }
];

const CREATE_SCENARIO_DIMENSIONS_EXAMPLE = [
  { type: "ACCOUNT", value_id: "COA_RANGE_REVENUE" },
  { type: "ACCOUNT", value_id: "COA_RANGE_OPEX" },
  { type: "ACCOUNT", value_id: "COA_RANGE_COGS" },
  { type: "ACCOUNT", value_id: EX.revenue_account_id },
  { type: "DEPT", value_id: EX.dept_id },
  { type: "TAG", value_id: EX.analytical_tag },
  { type: "PORTFOLIO_COMPANY", value_id: EX.portfolio_company_id }
];

const DRIVER_FORMULA_EXAMPLES = {
  cagrRevenue: {
    summary: "CAGR_DRIVEN — revenue account range",
    description: "Compound growth on historical GL base. Uses built-in CAGR projection when driver_type is CAGR_DRIVEN.",
    value: {
      drivers: [
        {
          target_account_range_start: 4000,
          target_account_range_end: 4999,
          driver_type: "CAGR_DRIVEN",
          formula_expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
          parameters: { cagr_scalar: 0.08, historical_base: 250000, tx_currency: "USD" }
        }
      ]
    }
  },
  headcountOpex: {
    summary: "HEADCOUNT_GROWTH — payroll / opex line",
    description: "Headcount × cost-per-head × growth^t. Built-in when driver_type is HEADCOUNT_GROWTH.",
    value: {
      drivers: [
        {
          target_account_range_start: EX.expense_account_no,
          target_account_range_end: EX.expense_account_no,
          driver_type: "HEADCOUNT_GROWTH",
          formula_expression: "parameters.headcount * (1 + parameters.growth_rate)^t * parameters.cost_per_head",
          parameters: {
            headcount: 42,
            growth_rate: 0.03,
            cost_per_head: 2850,
            tx_currency: "USD"
          }
        }
      ]
    }
  },
  inflationOpex: {
    summary: "INFLATION_MULTIPLIER — opex inflation",
    description: "Escalates historical base by inflation_rate each period.",
    value: {
      drivers: [
        {
          target_account_range_start: 5000,
          target_account_range_end: 5999,
          driver_type: "INFLATION_MULTIPLIER",
          formula_expression: "HISTORICAL_BASE * (1 + parameters.inflation_rate)^t",
          parameters: { inflation_rate: 0.045, historical_base: 180000, tx_currency: "ZIG" }
        }
      ]
    }
  },
  fxScalar: {
    summary: "FX_SCALAR — USD base with FX revaluation",
    description: "Multiplies historical base by projected FX rate (built-in FX_SCALAR path).",
    value: {
      drivers: [
        {
          target_account_range_start: 6100,
          target_account_range_end: 6100,
          driver_type: "FX_SCALAR",
          formula_expression: "HISTORICAL_BASE * parameters.fx_rate",
          parameters: { fx_rate: 1.12, historical_base: 95000, tx_currency: "USD" }
        }
      ]
    }
  },
  linearRegression: {
    summary: "LINEAR_REGRESSION — trend from GL lookback",
    description: "Projects from posted GL actuals over lookback_periods (built-in regression).",
    value: {
      drivers: [
        {
          target_account_range_start: EX.expense_account_no,
          target_account_range_end: EX.expense_account_no,
          driver_type: "LINEAR_REGRESSION",
          formula_expression: "parameters.slope * t + parameters.intercept",
          parameters: { lookback_periods: 6, tx_currency: "USD" }
        }
      ]
    }
  },
  customIfFormula: {
    summary: "Custom formula — IF() step-up after period 3",
    description: "Uses formula parser: IF, t, HISTORICAL_BASE, parameters.*",
    value: {
      drivers: [
        {
          target_account_range_start: 4000,
          target_account_range_end: 4100,
          driver_type: "CAGR_DRIVEN",
          formula_expression: "IF(t > 3, HISTORICAL_BASE * (1 + parameters.step_rate)^t, HISTORICAL_BASE)",
          parameters: { step_rate: 0.06, historical_base: 120000, tx_currency: "USD" }
        }
      ]
    }
  },
  customMinMaxRound: {
    summary: "Custom formula — MIN / MAX / ROUND",
    description: "Supported functions: IF, MIN, MAX, ABS, ROUND. Variables: t, t-1, t-12, HISTORICAL_BASE, parameters.*",
    value: {
      drivers: [
        {
          target_account_range_start: 5000,
          target_account_range_end: 5100,
          driver_type: "INFLATION_MULTIPLIER",
          formula_expression: "ROUND(MAX(HISTORICAL_BASE, parameters.floor) * (1 + parameters.inflation_rate)^t, 2)",
          parameters: { inflation_rate: 0.04, floor: 50000, historical_base: 75000, tx_currency: "USD" }
        }
      ]
    }
  },
  laggedGrowth: {
    summary: "Custom formula — lagged period (t-1, t-12)",
    description: "Reference prior periods in expression for YoY or MoM patterns.",
    value: {
      drivers: [
        {
          target_account_range_start: 6000,
          target_account_range_end: 6999,
          driver_type: "CAGR_DRIVEN",
          formula_expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t + parameters.seasonal * (t - t-12)",
          parameters: { cagr_scalar: 0.05, seasonal: 1500, historical_base: 90000, tx_currency: "USD" }
        }
      ]
    }
  },
  fullOperatingPlan: {
    summary: "Multi-driver bundle (all driver types)",
    description: "Replace entire driver set — one row per account range / driver type. Triggers cascade compute.",
    value: {
      drivers: [
        {
          target_account_range_start: 4000,
          target_account_range_end: 4999,
          driver_type: "CAGR_DRIVEN",
          formula_expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
          parameters: { cagr_scalar: 0.07, historical_base: 320000, tx_currency: "USD" }
        },
        {
          target_account_range_start: 5000,
          target_account_range_end: 5999,
          driver_type: "INFLATION_MULTIPLIER",
          formula_expression: "HISTORICAL_BASE * (1 + parameters.inflation_rate)^t",
          parameters: { inflation_rate: 0.05, historical_base: 210000, tx_currency: "USD" }
        },
        {
          target_account_range_start: EX.expense_account_no,
          target_account_range_end: EX.expense_account_no,
          driver_type: "HEADCOUNT_GROWTH",
          formula_expression: "parameters.headcount * (1 + parameters.growth_rate)^t * parameters.cost_per_head",
          parameters: { headcount: 55, growth_rate: 0.025, cost_per_head: 3100, tx_currency: "USD" }
        },
        {
          target_account_range_start: 6100,
          target_account_range_end: 6100,
          driver_type: "FX_SCALAR",
          formula_expression: "HISTORICAL_BASE * parameters.fx_rate",
          parameters: { fx_rate: 1.08, historical_base: 88000, tx_currency: "USD" }
        },
        {
          target_account_range_start: 5200,
          target_account_range_end: 5299,
          driver_type: "LINEAR_REGRESSION",
          formula_expression: "parameters.slope * t + parameters.intercept",
          parameters: { lookback_periods: 12, tx_currency: "USD" }
        },
        {
          target_account_range_start: 5300,
          target_account_range_end: 5399,
          driver_type: "CAGR_DRIVEN",
          formula_expression: "IF(t > 6, HISTORICAL_BASE * 1.1, HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t)",
          parameters: { cagr_scalar: 0.04, historical_base: 45000, tx_currency: "USD" }
        }
      ]
    }
  }
};

export const forecastingEngineSwaggerPaths = {
  "/forecasting/scenarios": {
    post: {
      tags: TAG,
      summary: "Create forecast scenario (DRAFT, empty cells). Optionally scoped to a specific entity.",
      description:
        "**entity_id** selects which legal entity (subsidiary or startup) this scenario belongs to. " +
        "Omit to use the default entity (derived from the singleton CompanyProfile). " +
        "Each entity maintains its own isolated chart of accounts — `account_id` on cell edits must come from that entity's COA (**GET /api/forecasting/entities/{entity_id}/chart-of-accounts**). " +
        "**fund_id** optional — fund vehicle id from **GET /api/funds**. " +
        "**dimensions** — multi-select slices for the hypercube. Each item is `{ type, value_id }`. " +
        "**type** enum: `ACCOUNT` | `DEPT` | `TAG` | `PORTFOLIO_COMPANY`. " +
        "**value_id** by type: " +
        "`ACCOUNT` → preset `COA_RANGE_*` keys or a single entity account id; " +
        "`DEPT` → department id; `TAG` → analytical tag string; `PORTFOLIO_COMPANY` → portfolio company id.",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "base_currency", "horizon_start_date", "horizon_end_date", "granularity"],
              properties: {
                name: { type: "string" },
                entity_id: { type: "string", description: ID_SOURCES.entity_id },
                fund_id: { type: "string", description: ID_SOURCES.fund_id, example: EX.fund_id },
                base_currency: { type: "string", example: "USD", enum: ["USD", "ZIG", "ZWG"] },
                horizon_start_date: { type: "string", format: "date" },
                horizon_end_date: { type: "string", format: "date" },
                granularity: { type: "string", enum: ["MONTHLY", "QUARTERLY", "ANNUAL"] },
                dimensions: {
                  type: "array",
                  description:
                    "Multi-select dimension slices. Frontend: load ACCOUNT presets from COA_RANGE_* keys below; " +
                    "single accounts from GET …/chart-of-accounts; DEPT/TAG/PORTFOLIO_COMPANY from your master-data pickers.",
                  items: {
                    type: "object",
                    required: ["type", "value_id"],
                    properties: {
                      type: {
                        type: "string",
                        enum: DIMENSION_TYPE_ENUM,
                        description: "Dimension axis — drives grid filtering and driver account ranges."
                      },
                      value_id: {
                        type: "string",
                        description: ID_SOURCES.dimension_value_id
                      },
                      range_start: {
                        type: "integer",
                        description: "Optional override when value_id is a custom ACCOUNT range (defaults from COA_RANGE_* preset)."
                      },
                      range_end: { type: "integer", description: "Optional ACCOUNT range end." }
                    }
                  }
                }
              }
            },
            examples: {
              fullDimensionsWorkspace: {
                summary: "Full workspace — all dimension types + fund (recommended for frontend)",
                description:
                  "Shows every dimension `type` and typical `value_id` values for dropdowns. " +
                  "ACCOUNT presets map to COA ranges; single-account ids come from entity COA.",
                value: {
                  name: "FY2027 Operating Plan — full slice",
                  description: "Revenue + opex + COGS + dept + tag + portfolio company",
                  entity_id: EX.default_entity_id,
                  fund_id: EX.fund_id,
                  base_currency: "USD",
                  horizon_start_date: "2026-07-01",
                  horizon_end_date: "2027-06-30",
                  granularity: "MONTHLY",
                  dimensions: CREATE_SCENARIO_DIMENSIONS_EXAMPLE
                }
              },
              accountPresetsOnly: {
                summary: "ACCOUNT presets only — all COA_RANGE_* keys",
                value: {
                  name: "P&L account ranges only",
                  entity_id: EX.default_entity_id,
                  base_currency: "USD",
                  horizon_start_date: "2026-07-01",
                  horizon_end_date: "2027-06-30",
                  granularity: "MONTHLY",
                  dimensions: [
                    { type: "ACCOUNT", value_id: "COA_RANGE_REVENUE" },
                    { type: "ACCOUNT", value_id: "COA_RANGE_OPEX" },
                    { type: "ACCOUNT", value_id: "COA_RANGE_COGS" },
                    { type: "ACCOUNT", value_id: "COA_RANGE_ASSETS" },
                    { type: "ACCOUNT", value_id: "COA_RANGE_LIABILITIES" },
                    { type: "ACCOUNT", value_id: "COA_RANGE_EQUITY" }
                  ]
                }
              },
              singleAccountsFromCoa: {
                summary: "Single entity accounts (from GET …/chart-of-accounts)",
                value: {
                  name: "Two-line revenue + opex scenario",
                  entity_id: EX.default_entity_id,
                  base_currency: "USD",
                  horizon_start_date: "2026-07-01",
                  horizon_end_date: "2027-06-30",
                  granularity: "MONTHLY",
                  dimensions: [
                    { type: "ACCOUNT", value_id: EX.revenue_account_id },
                    { type: "ACCOUNT", value_id: EX.expense_account_id }
                  ]
                }
              },
              accountValueIdDropdownReference: {
                summary: "Reference — ACCOUNT value_id options for dropdowns (not a valid POST body alone)",
                description: "Use these `value_id` strings when type is ACCOUNT. Presets expand to account number ranges on the server.",
                value: {
                  _note: "This example documents dropdown options; send dimensions[] items from the other examples.",
                  account_value_ids: ACCOUNT_VALUE_IDS,
                  dimension_types: DIMENSION_TYPE_ENUM.map((t) => ({
                    type: t,
                    value_id_hint:
                      t === "ACCOUNT"
                        ? "COA_RANGE_* or entity account id"
                        : t === "DEPT"
                          ? "department id string"
                          : t === "TAG"
                            ? "analytical tag string e.g. COST_CENTER_HQ"
                            : "portfolio company id"
                  }))
                }
              }
            }
          }
        }
      },
      responses: { 201: { description: "Scenario created" }, 400: { description: "INVALID_HORIZON or unknown entity_id" } }
    },
    get: {
      tags: TAG,
      summary: "List scenarios (filter, paginate, sort)",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "status", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "limit", in: "query", schema: { type: "integer" } }
      ],
      responses: { 200: { description: "Paginated scenario list" } }
    }
  },
  "/forecasting/scenarios/counts": {
    get: {
      tags: TAG,
      summary: "Scenario counts by status",
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "{ draft, active, locked, total }" } }
    }
  },
  "/forecasting/scenarios/{id}": {
    get: {
      tags: TAG,
      summary: "Scenario detail + dimensions + period keys",
      security: [{ bearerAuth: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", example: EX.scenario_id } }],
      responses: { 200: { description: "Scenario workspace metadata" }, 404: { description: "SCENARIO_NOT_FOUND" } }
    },
    patch: {
      tags: TAG,
      summary: "Update metadata / promote DRAFT → ACTIVE",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            examples: {
              promoteActive: {
                summary: "Promote DRAFT to ACTIVE",
                value: { status: "ACTIVE" }
              },
              rename: {
                summary: "Rename scenario",
                value: { name: "FY2027 Operating Plan (revised)" }
              }
            }
          }
        }
      },
      responses: { 403: { description: "FORECAST_LOCKED" } }
    }
  },
  "/forecasting/scenarios/{id}/summary": {
    get: {
      tags: TAG,
      summary: "Aggregated forecast totals and sync timestamps",
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Summary metrics" } }
    }
  },
  "/forecasting/scenarios/{id}/grid": {
    get: {
      tags: TAG,
      summary: "Paginated hypercube slice for Ag-Grid",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", example: EX.scenario_id } },
        { name: "period_start", in: "query", schema: { type: "string", example: "2026-07" } },
        { name: "period_end", in: "query", schema: { type: "string", example: "2026-12" } },
        { name: "include_actuals", in: "query", schema: { type: "boolean" } },
        { name: "include_variance", in: "query", schema: { type: "boolean", example: true } }
      ],
      responses: { 200: { description: "Grid rows" } }
    }
  },
  "/forecasting/scenarios/{id}/drivers": {
    put: {
      tags: TAG,
      summary: "Replace scenario drivers (full replace + cascade compute)",
      description:
        "Replaces the entire driver set for the scenario and runs cascade compute. " +
        "**driver_type** enum: `CAGR_DRIVEN` | `HEADCOUNT_GROWTH` | `INFLATION_MULTIPLIER` | `FX_SCALAR` | `LINEAR_REGRESSION` | `MANUAL_OVERRIDE`. " +
        "**formula_expression** — validated by the formula parser. Supports `IF cond THEN a ELSE b` and `IF(cond,a,b)`. " +
        "Variables: `t`, `t-1`, `t-12` (lagged cell values), `LAG(n)`, `HISTORICAL_BASE`, `parameters.<name>`, `CELL[period|account]`. " +
        "Functions: `IF`, `LAG`, `MIN`, `MAX`, `ABS`, `ROUND`. " +
        "Hybrid compute: default template per driver_type uses fast built-in math; customized formulas use full engine. " +
        "Overlapping account ranges rejected with `409 DRIVER_RANGE_OVERLAP`.",
      security: [{ bearerAuth: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", example: EX.scenario_id } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["drivers"],
              properties: {
                drivers: {
                  type: "array",
                  items: {
                    type: "object",
                    required: [
                      "target_account_range_start",
                      "target_account_range_end",
                      "driver_type",
                      "formula_expression",
                      "parameters"
                    ],
                    properties: {
                      target_account_range_start: {
                        type: "integer",
                        example: EX.expense_account_no,
                        description: "COA account number range start (inclusive)."
                      },
                      target_account_range_end: {
                        type: "integer",
                        example: EX.expense_account_no,
                        description: "COA account number range end (inclusive)."
                      },
                      driver_type: {
                        type: "string",
                        enum: [
                          "CAGR_DRIVEN",
                          "HEADCOUNT_GROWTH",
                          "INFLATION_MULTIPLIER",
                          "FX_SCALAR",
                          "LINEAR_REGRESSION",
                          "MANUAL_OVERRIDE"
                        ]
                      },
                      formula_expression: {
                        type: "string",
                        example: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t"
                      },
                      parameters: {
                        type: "object",
                        description: "Driver-specific numeric inputs + `tx_currency` (USD | ZIG | ZWG).",
                        additionalProperties: true
                      }
                    }
                  }
                }
              }
            },
            examples: DRIVER_FORMULA_EXAMPLES
          }
        }
      },
      responses: { 409: { description: "CIRCULAR_REFERENCE | DRIVER_RANGE_OVERLAP" } }
    }
  },
  "/forecasting/scenarios/{id}/cells": {
    patch: {
      tags: TAG,
      summary: "Inline cell edit (future periods only). Company scope is inherited from the scenario.",
      description: ID_SOURCES.account_id,
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["period_key", "account_id", "new_value", "tx_currency"],
              properties: {
                period_key: { type: "string", example: "2026-09", description: "YYYY-MM for MONTHLY granularity." },
                account_id: { type: "string", description: ID_SOURCES.account_id },
                fund_id: { type: "string", description: ID_SOURCES.fund_id },
                portfolio_company_id: { type: "string", description: "Optional portfolio company id." },
                analytical_tag: { type: "string", description: "Optional analytical tag dimension." },
                new_value: { type: "number" },
                tx_currency: { type: "string", example: "USD" },
                expected_updated_at: {
                  type: "string",
                  format: "date-time",
                  description: "Optimistic lock — cell updatedAt from prior read."
                }
              }
            },
            example: {
              period_key: "2026-09",
              account_id: EX.expense_account_id,
              new_value: 125000,
              tx_currency: "USD"
            }
          }
        }
      },
      responses: {
        200: {
          description:
            "Manual cell saved in `cell`. Nested `compute` is driver recalculation only (manual overrides excluded); `affected_cell_count` may be 0 even when the edit succeeded."
        },
        409: { description: "STALE_CELL_EDIT" },
        400: { description: "INVALID_PERIOD" }
      }
    }
  },
  "/forecasting/scenarios/{id}/cells/batch": {
    patch: {
      tags: TAG,
      summary: "Batch cell edits (max 500, atomic default true)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            example: {
              atomic: true,
              edits: [
                {
                  period_key: "2026-10",
                  account_id: EX.expense_account_id,
                  new_value: 130000,
                  tx_currency: "USD"
                },
                {
                  period_key: "2026-11",
                  account_id: EX.expense_account_id,
                  new_value: 135000,
                  tx_currency: "USD"
                }
              ]
            }
          }
        }
      },
      responses: { 200: { description: "Batch result with edits count and per-cell results" } }
    }
  },
  "/forecasting/scenarios/{id}/cells/override": {
    delete: {
      tags: TAG,
      summary: "Clear manual override and recompute from drivers",
      description: ID_SOURCES.account_id,
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "period_key", in: "query", required: true, schema: { type: "string", example: "2026-09" } },
        {
          name: "account_id",
          in: "query",
          required: true,
          schema: { type: "string", example: EX.expense_account_id },
          description: ID_SOURCES.account_id
        }
      ],
      responses: { 200: { description: "Override cleared" } }
    }
  },
  "/forecasting/scenarios/{id}/lock": {
    post: {
      tags: TAG,
      summary: "Lock scenario (requires admin, CFO, SYSADMIN, or FORECAST_LOCK)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            example: { version_label: "FY2026_BOARD_APPROVED" }
          }
        }
      },
      responses: { 403: { description: "FORBIDDEN_ROLE or FORECAST_LOCKED" } }
    }
  },
  "/forecasting/scenarios/{id}/versions": {
    get: {
      tags: TAG,
      summary: "List immutable version snapshots",
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Version list" } }
    }
  },
  "/forecasting/scenarios/{id}/versions/compare": {
    get: {
      tags: TAG,
      summary: "Compare two version snapshots",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "version_a", in: "query", required: true, schema: { type: "string", example: EX.version_id } },
        { name: "version_b", in: "query", required: true, schema: { type: "string", example: EX.version_id } }
      ],
      responses: { 200: { description: "Diff payload" } }
    }
  },
  "/forecasting/scenarios/{id}/versions/{versionId}": {
    get: {
      tags: TAG,
      summary: "Get version snapshot payload",
      security: [{ bearerAuth: [] }],
      responses: { 404: { description: "VERSION_NOT_FOUND" } }
    }
  },
  "/forecasting/scenarios/{id}/versions/{versionId}/duplicate": {
    post: {
      tags: TAG,
      summary: "Duplicate locked version into new DRAFT scenario",
      description:
        `Creates a working copy from a locked snapshot. **versionId** — ${ID_SOURCES.version_id} Response includes the new **scenario id** for Phase 2 goal links and edits.`,
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", example: EX.scenario_id }, description: ID_SOURCES.scenario_id },
        { name: "versionId", in: "path", required: true, schema: { type: "string", example: EX.version_id }, description: ID_SOURCES.version_id }
      ],
      requestBody: {
        content: {
          "application/json": {
            example: { name: "FY2027 Working Copy (from locked baseline)" }
          }
        }
      },
      responses: { 201: { description: "New DRAFT scenario (includes id, status DRAFT)" } }
    }
  },
  "/forecasting/scenarios/{id}/audit": {
    get: {
      tags: TAG,
      summary: "Scenario audit trail",
      description:
        "Paginated audit log for analysts. **Frontend:** use `summary` as the only narrative line; " +
        "`action_label` as a badge/chip; `actor_label` + `created_at` as secondary metadata. " +
        "Filter chips use `action_type`. No `detail_lines` — all analyst context is in `summary`.",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Paginated audit logs with analyst-friendly presentation fields",
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  items: [
                    {
                      scenario_name: "ZimFund 2026",
                      action_type: "PORTFOLIO_DISPATCH",
                      action_label: "Portfolio report imported",
                      summary:
                        "Test Company · Nov 2026: accepted investee report applied to forecast · Revenue 250,000 USD, Net profit 42,000 USD · Report: December 2026 Operational KPIs",
                      actor_label: "System",
                      created_at: "2026-06-17T12:08:18.000Z"
                    }
                  ],
                  pagination: { page: 1, limit: 25, total: 1, total_pages: 1 }
                }
              }
            }
          }
        }
      }
    }
  },
  "/forecasting/scenarios/{id}/goal-links": {
    get: {
      tags: TAG,
      summary: "List OPM goal links (Phase 2)",
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Goal links with performance_goal_id and optional account_id filter." } }
    },
    post: {
      tags: TAG,
      summary: "Create OPM goal link",
      description:
        "Links this forecast scenario to an OPM performance goal. After compute completes, forecast cell totals (optionally filtered by **account_id**) sync to the goal's **currentValue**. If **threshold_value** is set and the forecast sum is below it, the goal is marked at risk.",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["performance_goal_id"],
              properties: {
                performance_goal_id: { type: "string", description: ID_SOURCES.performance_goal_id },
                account_id: {
                  type: "string",
                  description:
                    "Optional. " + ID_SOURCES.account_id + " When omitted, sums all forecast cells in the scenario."
                },
                threshold_value: {
                  type: "number",
                  description: "Optional minimum forecast total; below this the linked goal is flagged at risk (RED)."
                }
              }
            },
            example: {
              performance_goal_id: EX.performance_goal_id,
              account_id: EX.revenue_account_id,
              threshold_value: 1000000
            }
          }
        }
      },
      responses: { 201: { description: "Link created" } }
    }
  },
  "/forecasting/scenarios/{id}/goal-links/{linkId}": {
    delete: {
      tags: TAG,
      summary: "Delete OPM goal link",
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Deleted" } }
    }
  },
  "/forecasting/audit": {
    get: {
      tags: TAG,
      summary: "Admin audit feed (admin / finance leadership — all scenarios)",
      description:
        "Cross-scenario audit feed. Each item includes `scenario_name` plus the same fields as scenario audit (`summary`, `action_label`, `actor_label`, `created_at`).",
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Audit list with presentation fields" } }
    }
  },
  "/forecasting/audit/high-priority": {
    get: {
      tags: TAG,
      summary: "High-priority audit events (LOCK_VIOLATION, etc.)",
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "HIGH priority audit" } }
    }
  },
  "/v1/forecasting/compute": {
    post: {
      tags: TAG,
      summary: "Run DAG compute / recalculation",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            examples: {
              scenarioRecalc: {
                summary: "Full scenario recalculation",
                value: {
                  scenario_id: EX.scenario_id,
                  edit_type: "SCENARIO_RECALC",
                  options: { include_elapsed_variance: true, skip_manual_overrides: false }
                }
              },
              driverCascade: {
                summary: "Recompute after driver change",
                value: {
                  scenario_id: EX.scenario_id,
                  edit_type: "DRIVER",
                  options: { skip_manual_overrides: true }
                }
              }
            }
          }
        }
      },
      responses: {
        200: { description: "{ compute_job_id, updated_cells, duration_ms }" },
        409: { description: "CIRCULAR_REFERENCE | COMPUTE_IN_PROGRESS" },
        504: { description: "COMPUTE_TIMEOUT" }
      }
    }
  },
  "/v1/forecasting/compute/validate": {
    post: {
      tags: TAG,
      summary: "Validate driver formula expression (dry-run)",
      description:
        "**Frontend Validate button** — send the same `expression`, `parameters`, and `driver_type` as the driver row being edited. " +
        "**Binary result:** `data.valid` is `true` only when syntax, all referenced parameters, and numeric values pass. " +
        "Any flaw → HTTP **400** `INVALID_FORMULA` with `expression_errors` (formula editor) and/or `parameter_errors` (parameters panel, each with `key`). " +
        "If the formula uses `HISTORICAL_BASE`, `parameters.historical_base` is required. " +
        "Supports `IF cond THEN a ELSE b` and `IF(cond,a,b)`. `t-12` / `LAG(12)` = year-ago cell value for same account.",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["expression", "parameters"],
              properties: {
                expression: {
                  type: "string",
                  description: "Formula from the inline editor.",
                  example: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t"
                },
                parameters: {
                  type: "object",
                  description:
                    "Driver parameter key-value map from the Parameters panel. Keys must match formula references (`cagr_scalar`, `historical_base`, etc.).",
                  additionalProperties: true,
                  example: {
                    cagr_scalar: 0.05,
                    historical_base: 10000,
                    tx_currency: "USD"
                  }
                },
                driver_type: {
                  type: "string",
                  enum: [
                    "CAGR_DRIVEN",
                    "HEADCOUNT_GROWTH",
                    "INFLATION_MULTIPLIER",
                    "FX_SCALAR",
                    "LINEAR_REGRESSION",
                    "MANUAL_OVERRIDE"
                  ],
                  description: "Optional — sets `uses_builtin_path` when expression matches the default template."
                },
                sample_t: {
                  type: "integer",
                  description: "Period index for `sample_result` preview (default 1).",
                  example: 6
                }
              }
            },
            examples: {
              cagrDefault: {
                summary: "CAGR driver (typical UI)",
                value: {
                  expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
                  parameters: {
                    cagr_scalar: 0.05,
                    historical_base: 10000,
                    tx_currency: "USD"
                  },
                  driver_type: "CAGR_DRIVEN",
                  sample_t: 6
                }
              },
              ifThenElse: {
                summary: "IF / THEN / ELSE dialect",
                value: {
                  expression: "IF t > 3 THEN HISTORICAL_BASE * 1.05 ELSE HISTORICAL_BASE",
                  parameters: {
                    cagr_scalar: 0.05,
                    historical_base: 10000,
                    tx_currency: "USD"
                  },
                  driver_type: "CAGR_DRIVEN",
                  sample_t: 6
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Formula valid — all checks passed",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "object",
                    properties: {
                      valid: { type: "boolean", example: true },
                      ok: { type: "boolean", example: true },
                      normalized_expression: { type: "string" },
                      sample_result: { type: "number", nullable: true },
                      expression_errors: { type: "array", items: { type: "string" } },
                      parameter_errors: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            key: { type: "string" },
                            message: { type: "string" }
                          }
                        }
                      },
                      missing_parameters: { type: "array", items: { type: "string" } },
                      errors: { type: "array", items: { type: "string" } },
                      warnings: { type: "array", items: { type: "string" } },
                      uses_builtin_path: { type: "boolean" }
                    }
                  }
                }
              },
              examples: {
                cagrValid: {
                  summary: "Success — default CAGR formula",
                  value: {
                    success: true,
                    data: {
                      valid: true,
                      ok: true,
                      normalized_expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
                      sample_result: 13401.13,
                      expression_errors: [],
                      parameter_errors: [],
                      missing_parameters: [],
                      errors: [],
                      warnings: [],
                      uses_builtin_path: true
                    }
                  }
                },
                ifValid: {
                  summary: "Success — IF/THEN/ELSE normalized",
                  value: {
                    success: true,
                    data: {
                      valid: true,
                      ok: true,
                      normalized_expression: "IF(t > 3, HISTORICAL_BASE * 1.05, HISTORICAL_BASE)",
                      sample_result: 10500,
                      expression_errors: [],
                      parameter_errors: [],
                      missing_parameters: [],
                      errors: [],
                      warnings: [],
                      uses_builtin_path: false
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          description: "INVALID_FORMULA — syntax and/or parameter errors (`data.valid` is always false)",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: false },
                  code: { type: "string", example: "INVALID_FORMULA" },
                  message: { type: "string" },
                  data: {
                    type: "object",
                    properties: {
                      valid: { type: "boolean", example: false },
                      ok: { type: "boolean", example: false },
                      normalized_expression: { type: "string" },
                      sample_result: { type: "number", nullable: true, example: null },
                      expression_errors: { type: "array", items: { type: "string" } },
                      parameter_errors: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            key: { type: "string" },
                            message: { type: "string" }
                          }
                        }
                      },
                      missing_parameters: { type: "array", items: { type: "string" } },
                      errors: { type: "array", items: { type: "string" } },
                      uses_builtin_path: { type: "boolean", example: false }
                    }
                  }
                }
              },
              examples: {
                missingParameter: {
                  summary: "Failure — missing historical_base",
                  value: {
                    success: false,
                    code: "INVALID_FORMULA",
                    message:
                      'Parameter "historical_base" is referenced in the formula but missing from parameters',
                    data: {
                      valid: false,
                      ok: false,
                      normalized_expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
                      sample_result: null,
                      expression_errors: [],
                      parameter_errors: [
                        {
                          key: "historical_base",
                          message:
                            'Parameter "historical_base" is referenced in the formula but missing from parameters'
                        }
                      ],
                      missing_parameters: ["historical_base"],
                      errors: [
                        'Parameter "historical_base" is referenced in the formula but missing from parameters'
                      ],
                      uses_builtin_path: false
                    }
                  }
                },
                syntaxError: {
                  summary: "Failure — invalid expression syntax",
                  value: {
                    success: false,
                    code: "INVALID_FORMULA",
                    message: "Expression contains disallowed characters",
                    data: {
                      valid: false,
                      ok: false,
                      normalized_expression: "HISTORICAL_BASE ++ invalid @@@",
                      sample_result: null,
                      expression_errors: ["Expression contains disallowed characters"],
                      parameter_errors: [],
                      missing_parameters: [],
                      errors: ["Expression contains disallowed characters"],
                      uses_builtin_path: false
                    }
                  }
                },
                invalidParameterValue: {
                  summary: "Failure — non-numeric parameter",
                  value: {
                    success: false,
                    code: "INVALID_FORMULA",
                    message: 'Parameter "cagr_scalar" must be a valid number',
                    data: {
                      valid: false,
                      ok: false,
                      normalized_expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
                      sample_result: null,
                      expression_errors: [],
                      parameter_errors: [
                        { key: "cagr_scalar", message: 'Parameter "cagr_scalar" must be a valid number' }
                      ],
                      missing_parameters: [],
                      errors: ['Parameter "cagr_scalar" must be a valid number'],
                      uses_builtin_path: false
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  "/v1/forecasting/compute/{computeJobId}": {
    get: {
      tags: TAG,
      summary: "Get compute job status",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "computeJobId",
          in: "path",
          required: true,
          schema: { type: "string", example: EX.compute_job_id }
        }
      ],
      responses: { 200: { description: "Job record" } }
    }
  },

  "/forecasting/entities": {
    get: {
      tags: TAG,
      summary: "List all active forecast entities",
      description:
        "Returns all active `ForecastEntity` rows. Use the `id` field as `entity_id` when creating scenarios or fetching per-entity chart-of-accounts. " +
        "The **default entity** (seeded from the singleton CompanyProfile) is marked `is_default: true`.",
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "List of entities",
          content: {
            "application/json": {
              example: {
                success: true,
                data: [
                  {
                    id: EX.default_entity_id,
                    name: EX.default_entity_name,
                    type: "INTERNAL_SUBSIDIARY",
                    is_default: true,
                    account_count: 90,
                    scenario_count: 3
                  }
                ]
              }
            }
          }
        }
      }
    },
    post: {
      tags: TAG,
      summary: "Create a new forecast entity and clone its chart of accounts",
      description:
        "Creates a new entity (INTERNAL_SUBSIDIARY or EXTERNAL_STARTUP) and immediately clones a full chart of accounts from `clone_from_entity_id` (defaults to the default entity). " +
        "The cloned accounts are stored in `entity_chart_of_accounts` and are independent of the global `chart_of_accounts`. " +
        "**Internal subsidiaries** keep `source_account_id` links so GL actuals sync works. " +
        "**External startups** can omit the source link — they contribute 0 to GL sync.",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "type"],
              properties: {
                name: { type: "string", example: "Sunrise Holdings (Subsidiary)" },
                type: { type: "string", enum: ["INTERNAL_SUBSIDIARY", "EXTERNAL_STARTUP"] },
                base_currency: { type: "string", example: "USD" },
                registration_number: { type: "string" },
                portfolio_company_id: { type: "string", description: "Link to existing PortfolioCompany record (for EXTERNAL_STARTUP)." },
                clone_from_entity_id: { type: "string", description: "Entity to clone COA from. Omit to clone from the default entity." }
              }
            },
            examples: {
              internalSubsidiary: {
                summary: "Internal subsidiary (clones COA with GL source links)",
                value: {
                  name: "Sunrise Holdings (Subsidiary)",
                  type: "INTERNAL_SUBSIDIARY",
                  base_currency: "USD",
                  clone_from_entity_id: EX.default_entity_id
                }
              },
              externalStartup: {
                summary: "External startup portfolio company",
                value: {
                  name: "Acme Ventures Portfolio Co",
                  type: "EXTERNAL_STARTUP",
                  base_currency: "USD"
                }
              }
            }
          }
        }
      },
      responses: {
        201: { description: "Entity created with cloned COA" },
        400: { description: "Validation error (invalid type, unknown portfolio_company_id, etc.)" }
      }
    }
  },

  "/forecasting/entities/{id}": {
    get: {
      tags: TAG,
      summary: "Get a single forecast entity",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", example: EX.default_entity_id } }
      ],
      responses: {
        200: {
          description: "Entity detail",
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  id: EX.default_entity_id,
                  name: EX.default_entity_name,
                  type: "INTERNAL_SUBSIDIARY",
                  is_default: true,
                  account_count: 90,
                  company_profile_id: "cmnhbavdi0001unogzsv8ai56"
                }
              }
            }
          }
        },
        404: { description: "Not found" }
      }
    }
  },

  "/forecasting/entities/{id}/chart-of-accounts": {
    get: {
      tags: TAG,
      summary: "List per-entity chart of accounts",
      description:
        "Returns the entity-scoped account rows from `entity_chart_of_accounts`. " +
        "Use these `id` values as `account_id` when patching cells or creating goal-links for this entity's scenarios. " +
        "**`source_account_id`** is the linked global `ChartOfAccounts.id` (present for INTERNAL_SUBSIDIARY accounts; null for custom EXTERNAL_STARTUP accounts).",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", example: EX.default_entity_id } },
        { name: "account_type", in: "query", schema: { type: "string", example: "Revenue" }, description: "Filter by accountType (Revenue, Expense, Asset, etc.)" },
        { name: "is_active", in: "query", schema: { type: "boolean" }, description: "Defaults to true" },
        { name: "for_posting", in: "query", schema: { type: "boolean" }, description: "Exclude root summary accounts" }
      ],
      responses: {
        200: {
          description: "Account list",
          content: {
            "application/json": {
              example: {
                success: true,
                data: [
                  {
                    id: EX.revenue_account_id,
                    account_no: EX.revenue_account_no,
                    account_name: EX.revenue_account_name,
                    account_type: "Revenue",
                    natural_balance: "CREDIT",
                    financial_statement: "Income Statement",
                    parent_id: null,
                    is_active: true,
                    source_account_id: EX.source_account_id
                  },
                  {
                    id: EX.expense_account_id,
                    account_no: String(EX.expense_account_no),
                    account_name: "Rent Expense",
                    account_type: "Expense",
                    natural_balance: "DEBIT",
                    financial_statement: "Income Statement",
                    parent_id: null,
                    is_active: true,
                    source_account_id: "cmi0az1wzl000gunxkonvxbzmg"
                  }
                ]
              }
            }
          }
        },
        404: { description: "Entity not found" }
      }
    }
  },

  "/forecasting/entities/{id}/resync-coa": {
    post: {
      tags: TAG,
      summary: "Resync entity COA from global chart (INTERNAL_SUBSIDIARY only)",
      description:
        "Adds any new accounts from the global `ChartOfAccounts` that are not yet cloned into this entity, and updates name/type for existing clones. " +
        "Only supported for `INTERNAL_SUBSIDIARY` entities. No-op for `EXTERNAL_STARTUP`.",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", example: EX.default_entity_id } }
      ],
      responses: {
        200: {
          description: "Resync result with accounts_added and accounts_updated counts",
          content: {
            "application/json": {
              example: {
                success: true,
                data: { entity_id: EX.default_entity_id, accounts_added: 0, accounts_updated: 0 }
              }
            }
          }
        },
        400: { description: "Not an INTERNAL_SUBSIDIARY entity" },
        404: { description: "Entity not found" }
      }
    }
  }
};
