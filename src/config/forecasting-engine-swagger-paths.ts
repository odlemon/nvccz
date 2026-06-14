/**
 * Forecasting Engine — hypercube scenario, grid, compute, versioning APIs.
 * Requirements: docs/forecasting-engine-backend-requirements.md
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
  source_account_id: "cmi0az1xg000dun64y7ay570i"
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
        "**fund_id** and dimension **value_id** presets are documented below.",
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
                fund_id: { type: "string", description: ID_SOURCES.fund_id },
                base_currency: { type: "string", example: "ZIG" },
                horizon_start_date: { type: "string", format: "date" },
                horizon_end_date: { type: "string", format: "date" },
                granularity: { type: "string", enum: ["MONTHLY", "QUARTERLY", "ANNUAL"] },
                dimensions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", example: "ACCOUNT" },
                      value_id: { type: "string", description: ID_SOURCES.dimension_value_id }
                    }
                  }
                }
              }
            },
            example: {
              name: "Q3 Strategic Growth Runway",
              entity_id: EX.default_entity_id,
              base_currency: "USD",
              horizon_start_date: "2026-07-01",
              horizon_end_date: "2027-06-30",
              granularity: "MONTHLY",
              dimensions: [{ type: "ACCOUNT", value_id: "COA_RANGE_OPEX" }]
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
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            example: {
              drivers: [
                {
                  target_account_range_start: EX.expense_account_no,
                  target_account_range_end: EX.expense_account_no,
                  driver_type: "CAGR_DRIVEN",
                  formula_expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
                  parameters: { cagr_scalar: 0.05, historical_base: 10000, tx_currency: "USD" }
                }
              ]
            }
          }
        }
      },
      responses: { 409: { description: "CIRCULAR_REFERENCE" } }
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
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Paginated audit logs" } }
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
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Audit list" } }
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
      summary: "Validate driver formula expression",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            example: { expression: "IF(t > 3, HISTORICAL_BASE * 1.05, HISTORICAL_BASE)" }
          }
        }
      },
      responses: { 400: { description: "INVALID_FORMULA" } }
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
  "/cron/forecasting/gl-sync": {
    post: {
      tags: TAG,
      summary: "Daily GL actuals sync cron",
      description:
        "Auth: header `X-Forecast-Gl-Sync-Cron-Secret` when `FORECAST_GL_SYNC_CRON_SECRET` is set; otherwise loopback only.",
      requestBody: {
        content: {
          "application/json": {
            example: { scenario_id: EX.duplicate_scenario_id }
          }
        }
      },
      responses: { 200: { description: "Sync completed" }, 401: { description: "Unauthorized" } }
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
