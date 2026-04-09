/**
 * OpenAPI paths for reporting **schedule automation** (CRUD + cron tick).
 * Merged last in `swagger.ts` so production/fallback specs always show full examples
 * even if swagger-jsdoc drops route comments.
 */

const scheduleConfigSchema = {
  type: "object",
  required: ["name", "frequency"],
  properties: {
    name: { type: "string", description: "Human-readable label in your admin UI", example: "Quarterly portfolio reporting" },
    frequency: {
      type: "string",
      enum: ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"],
      description:
        "How the system derives the last **completed** period end before `asOfDate` on each tick. CUSTOM uses `customMonthEnds` (month numbers 1–12; period end = last day of that month).",
    },
    isActive: {
      type: "boolean",
      default: true,
      description: "Inactive configs are skipped by **POST** `/cron/reporting/schedule-tick`.",
    },
    autoOpenCalendar: {
      type: "boolean",
      default: true,
      description:
        "**true**: tick may broadcast REQUEST (open calendar) for eligible companies when the open window is reached. **false**: tick only runs AUTO reminder tiers (T−3 / overdue) for periods **already** opened.",
    },
    dueDateOffsetDaysAfterPeriodEnd: {
      type: "integer",
      minimum: 1,
      default: 15,
      description: "Due date = period end date + this many calendar days (used when auto-opening).",
    },
    openCalendarAfterPeriodEndDays: {
      type: "integer",
      minimum: 0,
      default: 1,
      description:
        "Earliest calendar day the tick may send REQUEST: `asOfDate >= periodEnd + N` calendar days (`N=1` = first day after period closes).",
    },
    defaultAttachmentOptionIds: {
      type: "array",
      description:
        "Catalog ids — same as **POST** `/portfolio-companies/reporting/requests` `attachmentOptionIds`. Omit to use server default full list when automating REQUEST.",
      items: {
        type: "string",
        enum: [
          "INCOME_STATEMENT",
          "STATEMENT_OF_FINANCIAL_POSITION",
          "CASH_FLOW_STATEMENT",
          "BANK_STATEMENTS",
          "TAX_COMPLIANCE",
          "MANAGEMENT_ACCOUNTS",
          "BUSINESS_PLAN",
        ],
      },
    },
    customMonthEnds: {
      type: "array",
      description: "Required when `frequency` is CUSTOM. Each value is a month 1–12.",
      items: { type: "integer", minimum: 1, maximum: 12 },
      example: [3, 6, 9, 12],
    },
  },
} as const;

const ALL_ATTACHMENT_IDS = [
  "INCOME_STATEMENT",
  "STATEMENT_OF_FINANCIAL_POSITION",
  "CASH_FLOW_STATEMENT",
  "BANK_STATEMENTS",
  "TAX_COMPLIANCE",
  "MANAGEMENT_ACCOUNTS",
  "BUSINESS_PLAN",
];

export const reportingScheduleSwaggerEndpoints = {
  "/portfolio-companies/reporting/schedule-configs": {
    get: {
      summary: "List reporting schedule configs (automation cadence)",
      description:
        "Returns `{ success, data: { configs } }`. Each row is a **schedule definition** (not an opened calendar). Apply configs with **POST** `/cron/reporting/schedule-tick` (or `/public/reporting/schedule-tick`). Requires JWT.",
      tags: ["Financial Reporting"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "List of configs",
          content: {
            "application/json": {
              example: {
                success: true,
                data: { configs: [] },
              },
            },
          },
        },
        401: { description: "Unauthorized" },
      },
    },
    post: {
      summary: "Create reporting schedule config",
      description:
        "Persists cadence + timing fields in `reporting_schedule_configs`. Does **not** send email until a **schedule-tick** runs. After schema changes, run `npx prisma generate` so Prisma Client matches MySQL. DB: `npm run db:migrate:reporting-schedule-configs`.",
      tags: ["Financial Reporting"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: scheduleConfigSchema,
            examples: {
              quarterlyAutoOpenFullAttachments: {
                summary: "Quarterly — auto-open with full catalog",
                description: "Broadcast REQUEST when window hits; due 15 days after period end.",
                value: {
                  name: "Quarterly reporting — full pack",
                  frequency: "QUARTERLY",
                  isActive: true,
                  autoOpenCalendar: true,
                  dueDateOffsetDaysAfterPeriodEnd: 15,
                  openCalendarAfterPeriodEndDays: 1,
                  defaultAttachmentOptionIds: ALL_ATTACHMENT_IDS,
                },
              },
              monthlyMinimal: {
                summary: "Monthly — defaults for attachments",
                value: {
                  name: "Monthly reporting",
                  frequency: "MONTHLY",
                  autoOpenCalendar: true,
                  dueDateOffsetDaysAfterPeriodEnd: 10,
                  openCalendarAfterPeriodEndDays: 1,
                },
              },
              yearly: {
                summary: "Yearly — December period end",
                value: {
                  name: "Annual pack",
                  frequency: "YEARLY",
                  autoOpenCalendar: true,
                  dueDateOffsetDaysAfterPeriodEnd: 30,
                  openCalendarAfterPeriodEndDays: 1,
                  defaultAttachmentOptionIds: ["INCOME_STATEMENT", "BANK_STATEMENTS", "BUSINESS_PLAN"],
                },
              },
              customMonths: {
                summary: "CUSTOM — period ends last day of Jan/Apr/Jul/Oct",
                value: {
                  name: "Off-cycle quarters",
                  frequency: "CUSTOM",
                  customMonthEnds: [1, 4, 7, 10],
                  autoOpenCalendar: true,
                  dueDateOffsetDaysAfterPeriodEnd: 15,
                  openCalendarAfterPeriodEndDays: 1,
                },
              },
              remindersOnly: {
                summary: "Reminders only (no auto REQUEST)",
                description: "Tick runs AUTO tiers for already-open periods; analyst opens calendar manually or via another config.",
                value: {
                  name: "T−3 / overdue automation only",
                  frequency: "QUARTERLY",
                  autoOpenCalendar: false,
                },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Created `{ success, data }`" },
        400: { description: "Validation error (e.g. CUSTOM without customMonthEnds)" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/portfolio-companies/reporting/schedule-configs/{id}": {
    get: {
      summary: "Get one reporting schedule config",
      tags: ["Financial Reporting"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Config row" },
        404: { description: "Not found" },
        401: { description: "Unauthorized" },
      },
    },
    put: {
      summary: "Update reporting schedule config",
      description: "Send only fields to change (partial update).",
      tags: ["Financial Reporting"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { ...scheduleConfigSchema.properties },
            },
            examples: {
              deactivate: {
                summary: "Pause automation",
                value: { isActive: false },
              },
              adjustTiming: {
                summary: "Change due/open offsets",
                value: {
                  dueDateOffsetDaysAfterPeriodEnd: 20,
                  openCalendarAfterPeriodEndDays: 2,
                },
              },
              switchToRemindersOnly: {
                summary: "Stop auto-opening; keep reminders",
                value: { autoOpenCalendar: false },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Updated" },
        400: { description: "Invalid body" },
        404: { description: "Not found" },
        401: { description: "Unauthorized" },
      },
    },
    delete: {
      summary: "Delete reporting schedule config",
      tags: ["Financial Reporting"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: {
        200: { description: "Deleted" },
        404: { description: "Not found" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/cron/reporting/schedule-tick": {
    post: {
      summary: "Run reporting schedule automation (cron)",
      description: `
**No JWT.** Same auth as **POST** \`/cron/reporting/reminders\`:
- If \`REPORTING_REMINDERS_CRON_SECRET\` is set → header **X-Reporting-Reminders-Cron-Secret** must match.
- If unset → only **localhost** may call.

Evaluates all **active** rows in \`reporting_schedule_configs\` for \`asOfDate\` (default today).
      `.trim(),
      tags: ["Financial Reporting"],
      parameters: [
        {
          in: "header",
          name: "X-Reporting-Reminders-Cron-Secret",
          required: false,
          schema: { type: "string" },
          description: "Required when env `REPORTING_REMINDERS_CRON_SECRET` is set.",
        },
      ],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                asOfDate: {
                  type: "string",
                  format: "date",
                  description: "Simulate “today” (YYYY-MM-DD) for testing.",
                  example: "2026-04-15",
                },
              },
            },
            examples: {
              empty: { summary: "Production — use server date", value: {} },
              simulate: { summary: "UAT — fixed date", value: { asOfDate: "2026-04-15" } },
            },
          },
        },
      },
      responses: {
        200: {
          description: "`{ success, data: { asOfDate, configsProcessed, actions } }`",
        },
        401: { description: "Wrong/missing secret" },
        403: { description: "Non-loopback when secret not configured" },
        500: { description: "Tick error" },
      },
    },
  },

  "/public/reporting/schedule-tick": {
    post: {
      summary: "Run reporting schedule automation (public / UAT)",
      description: "Same handler and auth as **POST** `/cron/reporting/schedule-tick`.",
      tags: ["Financial Reporting"],
      parameters: [
        {
          in: "header",
          name: "X-Reporting-Reminders-Cron-Secret",
          required: false,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                asOfDate: { type: "string", format: "date", example: "2026-04-15" },
              },
            },
            examples: {
              empty: { value: {} },
              simulate: { value: { asOfDate: "2026-04-15" } },
            },
          },
        },
      },
      responses: {
        200: { description: "Tick completed" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden host" },
      },
    },
  },
};
