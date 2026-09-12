/**
 * OpenAPI paths for **reporting schedule configuration** (investor CRUD on `reporting_schedule_configs`).
 * Schedule **tick** HTTP routes are intentionally omitted from Swagger — they remain callable for ops (`/api/cron/...`, `/api/public/...`) but are not part of the public API doc surface.
 * Merged in `swagger.ts` so production/fallback specs stay complete for config management.
 */

const AUD_SCHEDULE_CONFIG_INVESTOR =
  "**Audience:** **Investor (fund staff)** — JWT (e.g. admin, fund_manager, investments_manager). Not for investee portal users. ";

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
      description: "Inactive configs are skipped when the reporting schedule automation job runs.",
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
      summary: "List reporting schedule configs — investor",
      description:
        AUD_SCHEDULE_CONFIG_INVESTOR +
        "Returns `{ success, data: { configs } }`. Each row is a **schedule definition** (cadence + timing), not an opened calendar period. " +
        "Use the returned **`id`** with **GET** `/portfolio-companies/reporting/schedule-configs/{id}/preview` to see exact calendar dates (period end, reporting open, due, T−3 reminder, overdue). " +
        "Active configs are consumed by server automation on its own schedule.",
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
      summary: "Create reporting schedule config — investor",
      description:
        AUD_SCHEDULE_CONFIG_INVESTOR +
        "Persists cadence + timing fields in `reporting_schedule_configs`. Opening periods / reminder sends happen when automation runs — not immediately on save. After schema changes, run `npx prisma generate`. DB: `npm run db:migrate:reporting-schedule-configs`.",
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

  "/portfolio-companies/reporting/schedule-configs/{id}/preview": {
    get: {
      summary: "Preview reporting schedule dates — investor",
      description:
        AUD_SCHEDULE_CONFIG_INVESTOR +
        "Computes **exact calendar dates** for upcoming reporting periods from a saved config (`id` from **GET** `.../schedule-configs`). " +
        "Use before **POST** `/portfolio-companies/reporting/requests` to pre-fill `reportingPeriod` and `dueDate`, or to explain offsets to stakeholders. " +
        "**Offsets:** `reportingOpensOn` = period end + `openCalendarAfterPeriodEndDays`; `submissionDueDate` = period end + `dueDateOffsetDaysAfterPeriodEnd`; " +
        "`reminderTMinus3On` = due − 3 days; `overdueAlertOn` = due + 1 day (emails only when the daily reporting job runs on those dates).",
      tags: ["Financial Reporting"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
          description: "Config id from GET /portfolio-companies/reporting/schedule-configs",
        },
        {
          in: "query",
          name: "asOfDate",
          schema: { type: "string", format: "date", example: "2026-05-18" },
          description: "Reference “today” for period derivation (default UTC today).",
        },
        {
          in: "query",
          name: "count",
          schema: { type: "integer", minimum: 1, maximum: 24, default: 6 },
          description: "How many upcoming periods to list (default 6).",
        },
      ],
      responses: {
        200: {
          description: "Schedule preview",
          content: {
            "application/json": {
              example: {
                success: true,
                data: {
                  asOfDate: "2026-05-18",
                  count: 6,
                  reminderScheduleNote:
                    "Reminder emails send only when the daily reporting job runs on the exact dates above.",
                  periods: [
                    {
                      reportingPeriod: "2026-03-31",
                      reportingPeriodLabel: "Q1 2026",
                      periodEndDate: "2026-03-31",
                      reportingOpensOn: "2026-04-01",
                      submissionDueDate: "2026-04-15",
                      reminderTMinus3On: "2026-04-12",
                      overdueAlertOn: "2026-04-16",
                      calendarAlreadyOpened: false,
                      openWindowReached: true,
                      isSubmissionOverdue: true,
                      automationWouldOpenOnTick: false,
                    },
                  ],
                },
              },
            },
          },
        },
        404: { description: "Config not found" },
        400: { description: "Invalid query (asOfDate or count)" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/portfolio-companies/reporting/schedule-configs/{id}": {
    get: {
      summary: "Get one reporting schedule config — investor",
      description: AUD_SCHEDULE_CONFIG_INVESTOR + "Fetch a single `reporting_schedule_configs` row by id.",
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
      summary: "Update reporting schedule config — investor",
      description:
        AUD_SCHEDULE_CONFIG_INVESTOR + "Send only fields to change (partial update).",
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
      summary: "Delete reporting schedule config — investor",
      description: AUD_SCHEDULE_CONFIG_INVESTOR + "Hard-remove a config; automation will no longer reference it.",
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
};
