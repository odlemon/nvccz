/**
 * Payroll & Employment Training — single Swagger module (Section A + B).
 * Requirements: docs/payroll-employment-training-backend-requirements.md
 *
 * Cron routes (e.g. POST /payroll/compliance/cron/expiry-check) are omitted from Swagger — ops only.
 */

export const PAYROLL_EMPLOYMENT_TRAINING_TAG = "Payroll & Employment Training";

/** @deprecated Use PAYROLL_EMPLOYMENT_TRAINING_TAG — single module tag */
export const PAYROLL_ET_PAYROLL_TAG = PAYROLL_EMPLOYMENT_TRAINING_TAG;
/** @deprecated Use PAYROLL_EMPLOYMENT_TRAINING_TAG — single module tag */
export const PAYROLL_ET_COMPLIANCE_TAG = PAYROLL_EMPLOYMENT_TRAINING_TAG;

export const PAYROLL_EMPLOYMENT_TRAINING_TAG_DEFINITION = {
  name: PAYROLL_EMPLOYMENT_TRAINING_TAG,
  description:
    "**Payroll & Employment Training** — US-3.13.1–US-3.13.4.\n\n" +
    "**Section A — Payroll:** employee register (multipart create/update), suspend/reinstate, maker-checker, " +
    "dual-currency runs, ZIMRA statutory config, payslip PDF + SHA-256 verify, employee self-service payslips.\n\n" +
    "**Section B — Employment & Training:** training courses, role/department assignments, employee certifications, expiry dashboard. " +
    "Cron expiry job is ops-only (omitted from Swagger).\n\n" +
    "See `docs/payroll-employment-training-backend-requirements.md`.",
};

/** @deprecated Use PAYROLL_EMPLOYMENT_TRAINING_TAG_DEFINITION */
export const PAYROLL_ET_PAYROLL_TAG_DEFINITION = PAYROLL_EMPLOYMENT_TRAINING_TAG_DEFINITION;
/** @deprecated Use PAYROLL_EMPLOYMENT_TRAINING_TAG_DEFINITION */
export const PAYROLL_ET_COMPLIANCE_TAG_DEFINITION = PAYROLL_EMPLOYMENT_TRAINING_TAG_DEFINITION;

const TAG = [PAYROLL_EMPLOYMENT_TRAINING_TAG];
const bearer = [{ bearerAuth: [] }];

function op(summary: string, extra: Record<string, unknown> = {}) {
  return { summary, tags: TAG, security: bearer, ...extra };
}

export const payrollEmploymentTrainingSwaggerPaths: Record<string, unknown> = {
  "/payroll/employees/{id}/suspend": {
    post: op("Suspend employee", {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/employees/{id}/reinstate": {
    post: op("Reinstate employee", {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/employees/{id}/change-requests": {
    post: op("Submit employee change request (maker)", {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["changeType", "payload"],
              properties: {
                changeType: { type: "string", example: "SALARY" },
                payload: {
                  type: "object",
                  example: { basicSalary: 4200, salarySplitUsdPct: 0.7, salarySplitZigPct: 0.3 },
                },
              },
            },
          },
        },
      },
    }),
    get: op("List employee change requests", {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] } },
      ],
    }),
  },
  "/payroll/change-requests/{requestId}/approve": {
    post: op("Approve change request (checker)", {
      parameters: [{ name: "requestId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/change-requests/{requestId}/reject": {
    post: op("Reject change request (checker)", {
      parameters: [{ name: "requestId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/payroll-runs/{payrollRunId}/submit-for-approval": {
    post: op("Submit payroll run for approval", {
      parameters: [{ name: "payrollRunId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/payroll-runs/{payrollRunId}/approve": {
    post: op("Approve payroll run (checker)", {
      parameters: [{ name: "payrollRunId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/payroll-runs/{payrollRunId}/reject": {
    post: op("Reject payroll run", {
      parameters: [{ name: "payrollRunId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/statutory/brackets": {
    get: op("List ZIMRA tax brackets", {
      parameters: [{ name: "currencyCode", in: "query", schema: { type: "string", enum: ["USD", "ZIG"] } }],
    }),
    post: op("Create ZIMRA tax bracket"),
  },
  "/payroll/statutory/levies": {
    get: op("List statutory levy config"),
    put: op("Upsert statutory levy config"),
  },
  "/payroll/payslips/by-id/{payslipId}/download": {
    get: op("Download payslip PDF (admin)", {
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/payslips/by-id/{payslipId}/verify": {
    get: op("Verify payslip SHA-256", {
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/employee/payslips/{payslipId}/download": {
    get: op("Download own payslip (JWT — no separate portal)", {
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/employee/payslips/{payslipId}/verify": {
    get: op("Verify own payslip integrity", {
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/compliance/courses": {
    get: op("List training courses"),
    post: op("Create training course"),
  },
  "/payroll/compliance/assignments": {
    get: op("List course assignments"),
    post: op("Assign course to role/department"),
  },
  "/payroll/compliance/certifications": {
    get: op("List employee certifications"),
    post: op("Create certification with upload"),
  },
  "/payroll/compliance/dashboard/expiring": {
    get: op("Certifications expiring in 30/60/90 days"),
  },
};
