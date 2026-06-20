/**
 * Payroll, Employment & Training — Section A + B API paths.
 * Requirements: docs/payroll-employment-training-backend-requirements.md
 *
 * Cron routes (e.g. POST /payroll/compliance/cron/expiry-check) are omitted from Swagger — ops only.
 */

export const PAYROLL_ET_PAYROLL_TAG = "Payroll";
export const PAYROLL_ET_COMPLIANCE_TAG = "Employment & Training";

const bearer = [{ bearerAuth: [] }];

function op(summary: string, tag: string, extra: Record<string, unknown> = {}) {
  return { summary, tags: [tag], security: bearer, ...extra };
}

export const payrollEmploymentTrainingSwaggerPaths: Record<string, unknown> = {
  "/payroll/employees/{id}/suspend": {
    post: op("Suspend employee", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/employees/{id}/reinstate": {
    post: op("Reinstate employee", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/employees/{id}/change-requests": {
    post: op("Submit employee change request (maker)", PAYROLL_ET_PAYROLL_TAG, {
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
    get: op("List employee change requests", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] } },
      ],
    }),
  },
  "/payroll/change-requests/{requestId}/approve": {
    post: op("Approve change request (checker)", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "requestId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/change-requests/{requestId}/reject": {
    post: op("Reject change request (checker)", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "requestId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/payroll-runs/{payrollRunId}/submit-for-approval": {
    post: op("Submit payroll run for approval", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "payrollRunId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/payroll-runs/{payrollRunId}/approve": {
    post: op("Approve payroll run (checker)", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "payrollRunId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/payroll-runs/{payrollRunId}/reject": {
    post: op("Reject payroll run", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "payrollRunId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/statutory/brackets": {
    get: op("List ZIMRA tax brackets", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "currencyCode", in: "query", schema: { type: "string", enum: ["USD", "ZIG"] } }],
    }),
    post: op("Create ZIMRA tax bracket", PAYROLL_ET_PAYROLL_TAG),
  },
  "/payroll/statutory/levies": {
    get: op("List statutory levy config", PAYROLL_ET_PAYROLL_TAG),
    put: op("Upsert statutory levy config", PAYROLL_ET_PAYROLL_TAG),
  },
  "/payroll/payslips/by-id/{payslipId}/download": {
    get: op("Download payslip PDF (admin)", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/payslips/by-id/{payslipId}/verify": {
    get: op("Verify payslip SHA-256", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/employee/payslips/{payslipId}/download": {
    get: op("Download own payslip (JWT — no separate portal)", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/employee/payslips/{payslipId}/verify": {
    get: op("Verify own payslip integrity", PAYROLL_ET_PAYROLL_TAG, {
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/compliance/courses": {
    get: op("List training courses", PAYROLL_ET_COMPLIANCE_TAG),
    post: op("Create training course", PAYROLL_ET_COMPLIANCE_TAG),
  },
  "/payroll/compliance/assignments": {
    get: op("List course assignments", PAYROLL_ET_COMPLIANCE_TAG),
    post: op("Assign course to role/department", PAYROLL_ET_COMPLIANCE_TAG),
  },
  "/payroll/compliance/certifications": {
    get: op("List employee certifications", PAYROLL_ET_COMPLIANCE_TAG),
    post: op("Create certification with upload", PAYROLL_ET_COMPLIANCE_TAG),
  },
  "/payroll/compliance/dashboard/expiring": {
    get: op("Certifications expiring in 30/60/90 days", PAYROLL_ET_COMPLIANCE_TAG),
  },
};
