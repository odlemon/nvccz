/**
 * OpenAPI path definitions: fiscal calendar + module period locks (draft/commit).
 * Swagger tag: `Accounting - Period lock` (same section as `/cashbook/periods/...`).
 * Base URL in Swagger includes `/api`; paths here are `/accounting/fiscal-calendar/...`.
 */
export const fiscalCalendarEndpoints = {
  "/accounting/fiscal-calendar": {
    get: {
      tags: ["Accounting - Period lock"],
      summary: "Get fiscal calendar with module locks",
      description:
        "Returns fiscal years/periods, effective module locks, policy, lockConfigVersion, and current draft. Requires `accounting.period_lock.view`, `accounting.period_lock.manage`, or `manage_accounting`.",
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: "OK" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
      },
    },
  },
  "/accounting/fiscal-calendar/locks/draft": {
    put: {
      tags: ["Accounting - Period lock"],
      summary: "Save lock draft (inactive until commit)",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["draft"],
              properties: {
                draft: {
                  type: "object",
                  required: ["moduleLocks"],
                  properties: {
                    moduleLocks: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["fiscalPeriodId", "moduleCode", "lockStatus"],
                        properties: {
                          fiscalPeriodId: { type: "string" },
                          moduleCode: { type: "string", example: "GL" },
                          lockStatus: { type: "string", enum: ["OPEN", "LOCKED", "CLOSED"] },
                          reason: { type: "string", nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Draft saved" },
        400: { description: "Invalid body" },
        403: { description: "Requires accounting.period_lock.manage" },
      },
    },
  },
  "/accounting/fiscal-calendar/locks/commit": {
    post: {
      tags: ["Accounting - Period lock"],
      summary: "Commit draft locks (atomic)",
      description: "Applies draft module locks, bumps lockConfigVersion, writes audit rows; may return `warnings`.",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                reason: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Committed" },
        403: { description: "Requires accounting.period_lock.manage" },
      },
    },
  },
  "/accounting/fiscal-calendar/period-lock/audit": {
    get: {
      tags: ["Accounting - Period lock"],
      summary: "List period-lock audit entries",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "take", in: "query", schema: { type: "integer", default: 100 } },
        { name: "skip", in: "query", schema: { type: "integer", default: 0 } },
      ],
      responses: {
        200: { description: "OK" },
        403: { description: "Forbidden" },
      },
    },
  },
  "/accounting/fiscal-calendar/posting-exceptions": {
    get: {
      tags: ["Accounting - Period lock"],
      summary: "List posting exceptions (feeder lock failures)",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "status", in: "query", schema: { type: "string" } },
        { name: "take", in: "query", schema: { type: "integer" } },
        { name: "skip", in: "query", schema: { type: "integer" } },
      ],
      responses: { 200: { description: "OK" } },
    },
  },
  "/accounting/fiscal-calendar/policy": {
    patch: {
      tags: ["Accounting - Period lock"],
      summary: "Update company accounting policy for locks",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                lockedPeriodPolicy: { type: "string", enum: ["ERROR", "WARN"] },
                allowOverridePosting: { type: "boolean" },
                glErrorBatchEnabled: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: { 200: { description: "OK" }, 403: { description: "Forbidden" } },
    },
  },
};
