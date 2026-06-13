/**
 * Forecasting Engine — hypercube scenario, grid, compute, versioning APIs.
 * Requirements: docs/forecasting-engine-backend-requirements.md
 */

export const FORECASTING_ENGINE_TAG = "Forecasting Engine";

const TAG = [FORECASTING_ENGINE_TAG];

export const forecastingEngineSwaggerPaths = {
  "/forecasting/scenarios": {
    post: {
      tags: TAG,
      summary: "Create forecast scenario (DRAFT, empty cells)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            example: {
              name: "Q3 Strategic Growth Runway",
              entity_id: "clx...",
              fund_id: "clx...",
              base_currency: "ZIG",
              horizon_start_date: "2026-07-01",
              horizon_end_date: "2027-06-30",
              granularity: "MONTHLY",
              dimensions: [{ type: "ACCOUNT", value_id: "COA_RANGE_REVENUE" }]
            }
          }
        }
      },
      responses: { 201: { description: "Scenario created" }, 400: { description: "INVALID_HORIZON" } }
    },
    get: {
      tags: TAG,
      summary: "List scenarios (filter, paginate, sort)",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "entity_id", in: "query", schema: { type: "string" } },
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
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Scenario workspace metadata" }, 404: { description: "SCENARIO_NOT_FOUND" } }
    },
    patch: {
      tags: TAG,
      summary: "Update metadata / promote DRAFT → ACTIVE",
      security: [{ bearerAuth: [] }],
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
        { name: "period_start", in: "query", schema: { type: "string" } },
        { name: "period_end", in: "query", schema: { type: "string" } },
        { name: "include_actuals", in: "query", schema: { type: "boolean" } },
        { name: "include_variance", in: "query", schema: { type: "boolean" } }
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
                  target_account_range_start: 5000,
                  target_account_range_end: 5999,
                  driver_type: "CAGR_DRIVEN",
                  formula_expression: "HISTORICAL_BASE * (1 + parameters.cagr_scalar)^t",
                  parameters: { cagr_scalar: 0.05, historical_months_lookback: 6 }
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
      summary: "Inline cell edit (future periods only)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            example: {
              period_key: "2026-09",
              account_id: "clx...",
              entity_id: "clx...",
              new_value: 125000,
              tx_currency: "USD",
              expected_updated_at: "2026-06-08T10:00:00.000Z"
            }
          }
        }
      },
      responses: {
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
      responses: { 200: { description: "Batch result" } }
    }
  },
  "/forecasting/scenarios/{id}/cells/override": {
    delete: {
      tags: TAG,
      summary: "Clear manual override and recompute from drivers",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "period_key", in: "query", required: true, schema: { type: "string" } },
        { name: "account_id", in: "query", required: true, schema: { type: "string" } },
        { name: "entity_id", in: "query", required: true, schema: { type: "string" } }
      ],
      responses: { 200: { description: "Override cleared" } }
    }
  },
  "/forecasting/scenarios/{id}/lock": {
    post: {
      tags: TAG,
      summary: "Lock scenario (requires FORECAST_LOCK / CFO / SYSADMIN)",
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
        { name: "version_a", in: "query", required: true, schema: { type: "string" } },
        { name: "version_b", in: "query", required: true, schema: { type: "string" } }
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
      security: [{ bearerAuth: [] }],
      responses: { 201: { description: "New scenario" } }
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
      responses: { 200: { description: "Goal links" } }
    },
    post: {
      tags: TAG,
      summary: "Create OPM goal link",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            example: {
              performance_goal_id: "clx...",
              account_id: "clx...",
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
      summary: "Admin audit feed (all scenarios)",
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
                value: {
                  scenario_id: "clx...",
                  edit_type: "SCENARIO_RECALC",
                  options: { include_elapsed_variance: true, skip_manual_overrides: false }
                }
              },
              driverCascade: {
                value: {
                  scenario_id: "clx...",
                  edit_type: "DRIVER",
                  driver_id: "fd_...",
                  parameters: { cagr_scalar: 0.05 }
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
            example: { scenario_id: "clx..." }
          }
        }
      },
      responses: { 200: { description: "Sync completed" }, 401: { description: "Unauthorized" } }
    }
  }
};
