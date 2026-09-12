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
    "dual-currency runs, ZIMRA statutory config, payslip PDF + SHA-256 verify, **employee self-service portal** " +
    "(profile, payslips, leave — scoped to JWT user).\n\n" +
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

/** Self-service portal routes resolve the employee from the Bearer JWT — not from path/query. */
const PORTAL_USER_SCOPE =
  "**Authenticated user (required):** pass the employee's login JWT in `Authorization: Bearer <token>`. " +
  "The server reads `users.id` from the token and loads the linked `employees` row (`employees.userId`). " +
  "**Do not** send `userId` or `employeeId` on these routes — scope is always the logged-in user. " +
  "In Swagger/Postman, authenticate as the **employee user** (not HR admin). " +
  "Returns **404** when no payroll employee is linked to that user; **403** when `terminated`.";

function op(summary: string, extra: Record<string, unknown> = {}) {
  return { summary, tags: TAG, security: bearer, ...extra };
}

function portalOp(storyRef: string, summary: string, extra: Record<string, unknown> = {}) {
  const baseDescription = typeof extra.description === "string" ? extra.description : "";
  const { description: _d, ...rest } = extra;
  return op(`${storyRef} — ${summary}`, {
    ...rest,
    description: [baseDescription, PORTAL_USER_SCOPE].filter(Boolean).join("\n\n"),
  });
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
      description:
        "**HR / Payroll admin.** PDF for any payslip by id. " +
        "Employees use `GET /payroll/employee/payslips/{payslipId}/download` with their own JWT.",
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/payslips/by-id/{payslipId}/verify": {
    get: op("Verify payslip SHA-256 (admin)", {
      description:
        "**HR / Payroll admin.** Download integrity check for any payslip by id. " +
        "For employee self-service, use `GET /payroll/employee/payslips/{payslipId}/verify` with the employee JWT.",
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
    }),
  },
  "/payroll/employee/portal": {
    get: portalOp("US-3.13.1", "Employee portal — profile & payroll summary", {
      description:
        "**Persona:** Employee (self-service portal).\n\n" +
        "Returns the logged-in user's employee profile: employee number, bank details, active salary structures, " +
        "leave balances snapshot, currency, and user contact fields. Entry point for **My Portal → Payslips & Compliance**.",
      responses: {
        200: { description: "Employee profile for JWT user" },
        403: { description: "Employment terminated — portal disabled" },
        404: { description: "No employee record linked to JWT user" },
      },
    }),
  },
  "/payroll/employee/payslips": {
    get: portalOp("US-3.13.4", "Employee portal — list own payslips", {
      description:
        "**Persona:** Employee (self-service portal).\n\n" +
        "Paginated payslip history for the JWT user only. Each item includes payroll run period, gross/deductions/net, " +
        "and company name for PDF display.",
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } },
      ],
      responses: {
        200: { description: "Payslips for JWT user with pagination" },
        403: { description: "Employment terminated" },
        404: { description: "No employee record linked to JWT user" },
      },
    }),
  },
  "/payroll/employee/leave-balances": {
    get: portalOp("US-3.13.1", "Employee portal — own leave balances", {
      description: "**Persona:** Employee (self-service portal).\n\nLeave balance rows for the JWT user.",
      responses: {
        200: { description: "Leave balances for JWT user" },
        403: { description: "Employment terminated" },
        404: { description: "No employee record linked to JWT user" },
      },
    }),
  },
  "/payroll/employee/payslips/{payslipId}/download": {
    get: portalOp("US-3.13.4", "Employee portal — download own payslip PDF", {
      description:
        "**Persona:** Employee (self-service portal).\n\n" +
        "Streams PDF only when `payslipId` belongs to the JWT user's employee record.",
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "PDF stream" },
        403: { description: "Payslip not owned by JWT user, or employment terminated" },
        404: { description: "Payslip or employee not found" },
      },
    }),
  },
  "/payroll/employee/payslips/{payslipId}/verify": {
    get: portalOp("US-3.13.4", "Employee portal — verify own payslip SHA-256", {
      description:
        "**Persona:** Employee (self-service portal).\n\n" +
        "Returns `{ sha256, valid }` for payslips owned by the JWT user.",
      parameters: [{ name: "payslipId", in: "path", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Integrity check result" },
        403: { description: "Payslip not owned by JWT user" },
        404: { description: "Payslip or employee not found" },
      },
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
    get: op("List employee certifications", {
      description:
        "**Compliance / HR:** filter by `employeeId`, `courseId`, or `status`.\n\n" +
        "**Employee portal:** after `GET /payroll/employee/portal`, call with `?employeeId={data.id}` " +
        "using the employee JWT to show own certification summary (read-only).",
      parameters: [
        { name: "employeeId", in: "query", schema: { type: "string" }, description: "Filter to one employee (portal: use id from /employee/portal)" },
        { name: "courseId", in: "query", schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string" } },
      ],
    }),
    post: op("Create certification with upload"),
  },
  "/payroll/compliance/dashboard/expiring": {
    get: op("Certifications expiring in 30/60/90 days"),
  },
};
