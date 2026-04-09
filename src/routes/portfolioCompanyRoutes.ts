// @ts-nocheck
import express from "express";
import { PortfolioCompanyController } from "../controllers/PortfolioCompanyController";
import { ReportingScheduleConfigController } from "../controllers/ReportingScheduleConfigController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

/**
 * @swagger
 * /api/portfolio-companies:
 *   post:
 *     summary: Create a new portfolio company with user account
 *     tags: [Portfolio Companies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *               - name
 *               - registrationNumber
 *               - industry
 *               - foundingDate
 *               - address
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *               registrationNumber:
 *                 type: string
 *               industry:
 *                 type: string
 *               foundingDate:
 *                 type: string
 *                 format: date
 *               address:
 *                 type: string
 *               website:
 *                 type: string
 *                 format: uri
 *               description:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Portfolio company created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.post("/", PortfolioCompanyController.createPortfolioCompany);

/**
 * @swagger
 * /api/portfolio-companies/admin:
 *   post:
 *     summary: Create portfolio company by admin (internal creation)
 *     description: Create a new portfolio company from admin side with enhanced fields including fund association, cap table, financial KPIs, etc.
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               # User details (optional - either userId or user details)
 *               user_id:
 *                 type: string
 *                 description: Existing user ID (if user already exists)
 *               firstName:
 *                 type: string
 *                 description: First name (required if creating new user)
 *               lastName:
 *                 type: string
 *                 description: Last name (required if creating new user)
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email (required if creating new user)
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 description: Password (required if creating new user)
 *               
 *               # Company details
 *               name:
 *                 type: string
 *                 description: Company name
 *               registrationNumber:
 *                 type: string
 *                 description: Company registration number (optional - will be auto-generated if not provided)
 *               industry:
 *                 type: string
 *                 description: Industry sector (optional - defaults to "Technology")
 *               foundingDate:
 *                 type: string
 *                 format: date
 *                 description: Company founding date (optional - defaults to current date)
 *               address:
 *                 type: string
 *                 description: Company address (optional - defaults to "Address not provided")
 *               website:
 *                 type: string
 *                 format: uri
 *                 description: Company website
 *               description:
 *                 type: string
 *                 description: Company description
 *               logoUrl:
 *                 type: string
 *                 format: uri
 *                 description: Company logo URL
 *               status:
 *                 type: string
 *                 enum: [PENDING, APPROVED, REJECTED, ACTIVE, SUSPENDED]
 *                 default: ACTIVE
 *                 description: Company status
 *               companySize:
 *                 type: string
 *                 enum: [SMALL, MEDIUM, LARGE]
 *                 description: Company size
 *               employeeCount:
 *                 type: integer
 *                 description: Number of employees
 *               annualRevenue:
 *                 type: number
 *                 description: Annual revenue
 *               fundingStage:
 *                 type: string
 *                 enum: [SEED, SERIES_A, SERIES_B, SERIES_C, GROWTH]
 *                 description: Current funding stage
 *               contactPerson:
 *                 type: string
 *                 description: Primary contact person
 *               contactPhone:
 *                 type: string
 *                 description: Contact phone number
 *               contactEmail:
 *                 type: string
 *                 format: email
 *                 description: Contact email
 *               socialMedia:
 *                 type: object
 *                 description: Social media links
 *               
 *               # Enhanced fields
 *               fund_id:
 *                 type: string
 *                 description: Associated fund ID (optional)
 *               start_date:
 *                 type: string
 *                 format: date
 *                 description: Investment start date
 *               end_date:
 *                 type: string
 *                 format: date
 *                 description: Investment end date
 *               cap_table:
 *                 type: object
 *                 description: Capitalization table data
 *                 properties:
 *                   total_fully_diluted_shares:
 *                     type: number
 *                   securities:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         holder_name:
 *                           type: string
 *                         security_type:
 *                           type: string
 *                         class:
 *                           type: string
 *                         quantity:
 *                           type: number
 *                         percent_fully_diluted:
 *                           type: number
 *               financial_kpis:
 *                 type: object
 *                 description: Financial KPIs data
 *                 properties:
 *                   currency:
 *                     type: string
 *                   revenue:
 *                     type: number
 *                   expenses:
 *                     type: number
 *                   net_income:
 *                     type: number
 *                   cash:
 *                     type: number
 *                   months_of_runway:
 *                     type: number
 *               financial_history_excel:
 *                 type: object
 *                 description: Financial history file information
 *                 properties:
 *                   file_name:
 *                     type: string
 *                   mime_type:
 *                     type: string
 *                   url:
 *                     type: string
 *                   checksum_sha256:
 *                     type: string
 *               e_sign:
 *                 type: object
 *                 description: Electronic signature data
 *                 properties:
 *                   user_id:
 *                     type: string
 *                   signed_at:
 *                     type: string
 *                     format: date-time
 *                   signature_id:
 *                     type: string
 *     responses:
 *       201:
 *         description: Portfolio company created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Portfolio company created successfully by admin
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 *       400:
 *         description: Bad request - missing required fields or validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - insufficient permissions
 *       409:
 *         description: Conflict - company with registration number already exists
 */
router.post("/admin", authenticate, PortfolioCompanyController.createPortfolioCompanyByAdmin);

/**
 * @swagger
 * /api/portfolio-companies:
 *   get:
 *     summary: Get all portfolio companies
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of portfolio companies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PortfolioCompany'
 */
router.get("/", authenticate, PortfolioCompanyController.getAllPortfolioCompanies);

/**
 * @swagger
 * /api/portfolio-companies/{id}/document-organisation:
 *   get:
 *     summary: Document organisation (investor, per company)
 *     description: |
 *       Returns submitted report files for one portfolio company in a fixed folder structure:
 *       **Financial** (income statement, balance sheet, cash flow, bank statements, tax documents, audits, management accounts),
 *       **Operational** (HR, payroll, sales reports, inventory, production, non-financial KPIs),
 *       **Investment** (business plans, investor reports, compliance documents).
 *       Subfolders are always present; empty subfolders return `files: []`.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Portfolio company ID.
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *         description: Comma-separated statuses (e.g. PENDING,ACCEPTED). Default excludes DRAFT only.
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 2000
 *         description: Max reports loaded before grouping (cap 5000).
 *     responses:
 *       200:
 *         description: documentOrganisation tree (Financial / Operational / Investment)
 *       400:
 *         description: Missing company ID
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Portfolio company not found
 */
router.get(
  "/:id/document-organisation",
  authenticate,
  PortfolioCompanyController.getDocumentOrganisation
);

/**
 * @swagger
 * /api/portfolio-companies/{id}/reporting-audit:
 *   get:
 *     summary: Financial reporting audit trail (investor)
 *     description: |
 *       Timeline of reporting-related events for one portfolio company — investee submissions, file uploads,
 *       staff reviews (accept / reject / needs revision), and period-level KPI data saves. Uses `audit_logs`
 *       (company name and reporting period appear inside each event's `newValues` / `oldValues` JSON).
 *       The response also includes **`communicationLog`**: email/portal notification events
 *       (original request, T−3 reminder, overdue alert, manual nudge, viewed-by-investee) from `reporting_notification_logs`.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated events
 *       404:
 *         description: Company not found
 */
router.get("/:id/reporting-audit", authenticate, PortfolioCompanyController.getReportingAudit);

/**
 * @swagger
 * /api/portfolio-companies/{id}/financial-reports:
 *   get:
 *     summary: List financial reports for a portfolio company
 *     description: Returns submitted financial reports for the specified portfolio company.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Portfolio company ID.
 *     responses:
 *       200:
 *         description: Reports retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Missing company ID
 *       401:
 *         description: Unauthorized
 *       default:
 *         description: Unexpected error
 */
router.get("/:id/financial-reports", authenticate, PortfolioCompanyController.getFinancialReports);

/**
 * @swagger
 * /api/portfolio-companies/{id}/financial-reports/{reportId}/download:
 *   get:
 *     summary: Download a financial report
 *     description: Streams the financial report document from storage.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Portfolio company ID.
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *         description: Financial report ID.
 *     responses:
 *       200:
 *         description: CSV download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing identifiers
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Report not found
 *       default:
 *         description: Unexpected error
 */
router.get(
  "/:id/financial-reports/:reportId/download",
  authenticate,
  PortfolioCompanyController.downloadFinancialReport
);

/**
 * @swagger
 * /api/portfolio-companies/{id}/financial-reports/{reportId}/review:
 *   post:
 *     summary: Review a financial report
 *     description: |
 *       Approve or reject a submitted financial report. **ACCEPT** for operational/document types
 *       (**OPERATIONAL_KPIS**, **NON_FINANCIAL_KPIS**, **BUSINESS_PLAN**, **BANK_STATEMENTS**,
 *       **TAX_COMPLIANCE**, **MANAGEMENT_ACCOUNTS**) completes acceptance **without** valuation/dividend
 *       journal automation; any accounting payload in the body is ignored for those types.
 *       **ACCEPT** for core financial statements still requires valuation/dividend automation in the body.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Portfolio company ID.
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *         description: Financial report ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [ACCEPT, REJECT, NEEDS_REVISION]
 *                 example: ACCEPT
 *               comment:
 *                 type: string
 *                 example: "Looks good"
 *               mapping:
 *                 type: object
 *                 description: Mapping snapshot for accounting/performance.
 *     responses:
 *       200:
 *         description: Review recorded successfully; body includes updated report (with reportUrl/fileUrl when stored).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: Financial report row after review, with normalized file URL fields.
 *       400:
 *         description: Invalid request (e.g. missing automation payload for statement ACCEPT)
 *       401:
 *         description: Unauthorized
 *       default:
 *         description: Unexpected error
 */
router.post(
  "/:id/financial-reports/:reportId/review",
  authenticate,
  PortfolioCompanyController.reviewFinancialReport
);

/**
 * @swagger
 * /api/portfolio-companies/{id}/reporting/nudge:
 *   post:
 *     summary: Manual reporting nudge (email investee)
 *     description: |
 *       Sends an immediate email to the portfolio company's investee user with **custom analyst text** in the body.
 *       Logged as `MANUAL_NUDGE` in `reporting_notification_logs` (see **GET** `.../reporting-audit` → `communicationLog`).
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reportingPeriod, dueDate, message]
 *             properties:
 *               reportingPeriod:
 *                 type: string
 *                 example: "2025-12-31"
 *               dueDate:
 *                 type: string
 *                 example: "2026-01-15"
 *               message:
 *                 type: string
 *                 description: Shown in the email body (alias `notes`)
 *               notes:
 *                 type: string
 *               attachmentOptionIds:
 *                 type: array
 *                 description: Optional; multi-select catalog ids (overrides mandatoryAttachments when non-empty).
 *                 items:
 *                   type: string
 *                   enum:
 *                     - INCOME_STATEMENT
 *                     - STATEMENT_OF_FINANCIAL_POSITION
 *                     - CASH_FLOW_STATEMENT
 *                     - BANK_STATEMENTS
 *                     - TAX_COMPLIANCE
 *                     - MANAGEMENT_ACCOUNTS
 *                     - BUSINESS_PLAN
 *               mandatoryAttachments:
 *                 type: array
 *                 description: Optional when attachmentOptionIds provided; else defaults to full standard list.
 *                 items:
 *                   type: object
 *                   required: [name, formats]
 *                   properties:
 *                     name: { type: string }
 *                     formats: { type: string }
 *     responses:
 *       200:
 *         description: Nudge queued/sent for that company
 *       400:
 *         description: Missing fields or empty message
 */
router.post(
  "/:id/reporting/nudge",
  authenticate,
  PortfolioCompanyController.nudgeReporting
);

/**
 * @swagger
 * /api/portfolio-companies/reporting/mandatory-attachment-options:
 *   get:
 *     summary: Mandatory reporting attachments catalog (investor)
 *     description: |
 *       Rows for **multi-select** in the Reporting Calendar UI. Each `id` can be sent in `attachmentOptionIds`
 *       on **POST** `/reporting/requests` (recommended) instead of building `mandatoryAttachments` by hand.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: `{ options: [{ id, name, formats }, ...] }`
 */
router.get(
  "/reporting/mandatory-attachment-options",
  authenticate,
  PortfolioCompanyController.getMandatoryAttachmentOptions
);

/**
 * @swagger
 * /api/portfolio-companies/reporting/requests:
 *   post:
 *     summary: Open reporting calendar — Request for data (broadcast)
 *     description: |
 *       Sends the initial “Request for data” email to all eligible portfolio companies and opens the period on the investee portal.
 *       **Each `reportingPeriod` can only be opened once** (409 if a `REQUEST` already exists for that date).
 *       For **`phase: REQUEST`** (default), supply **either** `attachmentOptionIds` (recommended; multi-select from GET `/reporting/mandatory-attachment-options`)
 *       **or** `mandatoryAttachments` (explicit `{ name, formats }[]`). If `attachmentOptionIds` is present and non-empty, it wins.
 *       Reminder/cron phases (`T_MINUS_3`, `OVERDUE`, `AUTO`) may omit both; server defaults apply.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reportingPeriod, dueDate]
 *             properties:
 *               reportingPeriod:
 *                 type: string
 *                 format: date
 *                 example: "2024-03-31"
 *                 description: Period end date (e.g. Q1 2024 → 2024-03-31)
 *               dueDate:
 *                 type: string
 *                 format: date
 *                 example: "2024-04-15"
 *               attachmentOptionIds:
 *                 type: array
 *                 description: Recommended — one entry per multi-selected catalog row (Swagger try-it-out add multiple values).
 *                 items:
 *                   type: string
 *                   enum:
 *                     - INCOME_STATEMENT
 *                     - STATEMENT_OF_FINANCIAL_POSITION
 *                     - CASH_FLOW_STATEMENT
 *                     - BANK_STATEMENTS
 *                     - TAX_COMPLIANCE
 *                     - MANAGEMENT_ACCOUNTS
 *                     - BUSINESS_PLAN
 *                 example:
 *                   - INCOME_STATEMENT
 *                   - STATEMENT_OF_FINANCIAL_POSITION
 *                   - CASH_FLOW_STATEMENT
 *                   - BANK_STATEMENTS
 *                   - TAX_COMPLIANCE
 *                   - MANAGEMENT_ACCOUNTS
 *                   - BUSINESS_PLAN
 *               mandatoryAttachments:
 *                 type: array
 *                 minItems: 1
 *                 description: |
 *                   Alternative to `attachmentOptionIds` when opening the calendar. Omit if using ids.
 *                 items:
 *                   type: object
 *                   required: [name, formats]
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: "Income statement"
 *                     formats:
 *                       type: string
 *                       example: "Excel (.xlsx)"
 *               phase:
 *                 type: string
 *                 enum: [REQUEST, T_MINUS_3, OVERDUE, AUTO]
 *                 default: REQUEST
 *           examples:
 *             multiSelectAllCatalog:
 *               summary: Recommended — all standard attachments via ids (UI multi-select)
 *               value:
 *                 reportingPeriod: "2024-03-31"
 *                 dueDate: "2024-04-15"
 *                 attachmentOptionIds:
 *                   - INCOME_STATEMENT
 *                   - STATEMENT_OF_FINANCIAL_POSITION
 *                   - CASH_FLOW_STATEMENT
 *                   - BANK_STATEMENTS
 *                   - TAX_COMPLIANCE
 *                   - MANAGEMENT_ACCOUNTS
 *                   - BUSINESS_PLAN
 *             multiSelectSubset:
 *               summary: Subset — e.g. core statements only
 *               value:
 *                 reportingPeriod: "2024-03-31"
 *                 dueDate: "2024-04-15"
 *                 attachmentOptionIds:
 *                   - INCOME_STATEMENT
 *                   - STATEMENT_OF_FINANCIAL_POSITION
 *                   - CASH_FLOW_STATEMENT
 *             explicitNameFormats:
 *               summary: Explicit mandatoryAttachments (no catalog ids)
 *               value:
 *                 reportingPeriod: "2024-03-31"
 *                 dueDate: "2024-04-15"
 *                 mandatoryAttachments:
 *                   - name: "Income statement"
 *                     formats: "Excel (.xlsx)"
 *                   - name: "Statement of financial position (balance sheet)"
 *                     formats: "Excel (.xlsx)"
 *                   - name: "Cash flow statement"
 *                     formats: "Excel (.xlsx)"
 *                   - name: "Bank statements"
 *                     formats: "Excel (.xlsx) or PDF"
 *                   - name: "Tax / compliance filings and certificates"
 *                     formats: "PDF (Excel where applicable)"
 *                   - name: "Management accounts"
 *                     formats: "Excel (.xlsx) or PDF"
 *                   - name: "Business plan / investor narrative and projections"
 *                     formats: "PDF (Excel for models)"
 *     responses:
 *       200:
 *         description: Emails dispatched
 *       400:
 *         description: Missing or invalid fields
 *       409:
 *         description: Period already opened on the calendar
 */
router.post(
  "/reporting/requests",
  authenticate,
  PortfolioCompanyController.openReportingRequest
);

/**
 * @swagger
 * /api/portfolio-companies/reporting/calendar:
 *   get:
 *     summary: Reporting calendar — full list (investor)
 *     description: |
 *       Lists **opened calendars**: one row per **`reportingPeriod`** that has at least one **`REQUEST`** in
 *       `reporting_notification_logs` (manual POST **.../reporting/requests** or automated schedule tick).
 *       Returns **`data.periods`** (alias **`data.openedCalendars`**) and **`data.meta.listKind`** = `opened_calendars`.
 *       Each row includes: label, **dueDate**, first/last request time, last activity, **investeePortalUrl**,
 *       **mandatoryAttachments** (from latest REQUEST log), **lastRequestEmailSubject**, full **notificationSummary**
 *       (request / T−3 / overdue / nudge / viewed counts), companies that received the initial request vs **companiesSubmitted**
 *       (PENDING/ACCEPTED reports for that period).
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 200
 *         description: Max periods (cap 500)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: `{ success, data: { periods, openedCalendars, meta } }`
 */
router.get(
  "/reporting/calendar",
  authenticate,
  PortfolioCompanyController.getReportingCalendar
);

/**
 * @swagger
 * /api/portfolio-companies/reporting/calendar/detail:
 *   get:
 *     summary: Reporting calendar period detail + email inspector (investor)
 *     description: |
 *       Due date, investee portal deep link (`FRONTEND_URL/application-portal/reports`), mandatory attachment list,
 *       notification counts, and **sampleEmail** (subject + html) from the latest REQUEST log — same content sent to investees
 *       (stored in `reporting_notification_logs.meta` for new mailings).
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: reportingPeriod
 *         required: true
 *         schema:
 *           type: string
 *         example: "2024-03-31"
 *     responses:
 *       200:
 *         description: Period detail
 *       400:
 *         description: Missing or invalid reportingPeriod
 */
router.get(
  "/reporting/calendar/detail",
  authenticate,
  PortfolioCompanyController.getReportingCalendarPeriodDetail
);

/**
 * @swagger
 * /api/portfolio-companies/reporting/schedule-configs:
 *   get:
 *     summary: List reporting automation configs (cadence — not opened calendars)
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: `{ success, data: { configs } }`
 *   post:
 *     summary: Create reporting schedule config
 *     description: |
 *       Defines **when** the system may auto-broadcast REQUEST (open calendar) or run reminder-only AUTO tiers.
 *       Does **not** open a period by itself until **POST** `/api/cron/reporting/schedule-tick` (or your scheduler) runs.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, frequency]
 *             properties:
 *               name: { type: string, example: "Quarterly portfolio pack" }
 *               frequency:
 *                 type: string
 *                 enum: [MONTHLY, QUARTERLY, YEARLY, CUSTOM]
 *               isActive: { type: boolean, default: true }
 *               autoOpenCalendar:
 *                 type: boolean
 *                 default: true
 *                 description: If false, tick runs AUTO reminders only for periods already opened (fund-scoped).
 *               dueDateOffsetDaysAfterPeriodEnd: { type: integer, default: 15 }
 *               openCalendarAfterPeriodEndDays: { type: integer, default: 1 }
 *               defaultAttachmentOptionIds:
 *                 type: array
 *                 items: { type: string }
 *               customMonthEnds:
 *                 type: array
 *                 items: { type: integer }
 *                 description: Required when frequency is CUSTOM — month numbers 1–12 (period end = last day of that month).
 *     responses:
 *       201:
 *         description: Created
 */
router.get(
  "/reporting/schedule-configs",
  authenticate,
  ReportingScheduleConfigController.list
);
router.post(
  "/reporting/schedule-configs",
  authenticate,
  ReportingScheduleConfigController.create
);

/**
 * @swagger
 * /api/portfolio-companies/reporting/schedule-configs/{id}:
 *   get:
 *     summary: Get one reporting schedule config
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *   put:
 *     summary: Update reporting schedule config
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *   delete:
 *     summary: Delete reporting schedule config
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
router.get(
  "/reporting/schedule-configs/:id",
  authenticate,
  ReportingScheduleConfigController.getById
);
router.put(
  "/reporting/schedule-configs/:id",
  authenticate,
  ReportingScheduleConfigController.update
);
router.delete(
  "/reporting/schedule-configs/:id",
  authenticate,
  ReportingScheduleConfigController.remove
);

/**
 * @swagger
 * /api/portfolio-companies/{id}/valuation-adjustments:
 *   post:
 *     summary: Record a valuation adjustment for a portfolio company
 *     description: Captures valuation approvals and posts the related accounting and KPI updates.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Portfolio company ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [previousAmount, newAmount, valuationDate]
 *             properties:
 *               previousAmount:
 *                 type: number
 *                 example: 1250000
 *               newAmount:
 *                 type: number
 *                 example: 1500000
 *               valuationDate:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *                 example: "Q4 valuation approved by CIO"
 *     responses:
 *       201:
 *         description: Valuation adjustment recorded
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 *       default:
 *         description: Unexpected error
 */
router.post(
  "/:id/valuation-adjustments",
  authenticate,
  PortfolioCompanyController.recordValuationAdjustment
);

/**
 * @swagger
 * /api/portfolio-companies/{id}/dividends:
 *   post:
 *     summary: Record a dividend received from a portfolio company
 *     description: Logs dividend cash receipts, creates the journal entry, and updates KPIs.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Portfolio company ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, dividendDate]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 25000
 *               dividendDate:
 *                 type: string
 *                 format: date
 *               notes:
 *                 type: string
 *                 example: "FY2025 interim dividend"
 *     responses:
 *       201:
 *         description: Dividend recorded successfully
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 *       default:
 *         description: Unexpected error
 */
router.post(
  "/:id/dividends",
  authenticate,
  PortfolioCompanyController.recordDividend
);

/**
 * @swagger
 * /api/portfolio-companies/with-investments:
 *   get:
 *     summary: Get all portfolio companies with investment amounts
 *     description: Returns a list of all portfolio companies along with the total amount invested (sum of all disbursements) in each company
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of portfolio companies with investment amounts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       registrationNumber:
 *                         type: string
 *                       industry:
 *                         type: string
 *                       status:
 *                         type: string
 *                       fund:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                       user:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           email:
 *                             type: string
 *                       totalInvested:
 *                         type: number
 *                         description: Total amount invested (sum of all approved/disbursed disbursements)
 *                       disbursements:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             amount:
 *                               type: number
 *                             disbursementDate:
 *                               type: string
 *                               format: date-time
 *                             disbursementType:
 *                               type: string
 *                             status:
 *                               type: string
 *                       startDate:
 *                         type: string
 *                         format: date
 *                       endDate:
 *                         type: string
 *                         format: date
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 */
router.get("/with-investments", authenticate, authorize(["admin", "fund_manager"]), PortfolioCompanyController.getAllPortfolioCompaniesWithInvestments);

/**
 * @swagger
 * /api/portfolio-companies/{id}:
 *   get:
 *     summary: Get portfolio company by ID
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio company details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.get("/:id", authenticate, authorize(["admin", "applicant"]), PortfolioCompanyController.getPortfolioCompanyById);

/**
 * @swagger
 * /api/portfolio-companies/user/{user_id}:
 *   get:
 *     summary: Get portfolio company by user ID
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio company details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.get("/user/:user_id", authenticate, authorize(["admin", "applicant"]), PortfolioCompanyController.getPortfolioCompanyByUserId);

/**
 * @swagger
 * /api/portfolio-companies/me:
 *   get:
 *     summary: Get current user's portfolio company
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user's portfolio company details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.get("/me", authenticate, authorize(["applicant"]), PortfolioCompanyController.getCurrentUserPortfolioCompany);

/**
 * @swagger
 * /api/portfolio-companies/{id}:
 *   put:
 *     summary: Update portfolio company details
 *     description: Update portfolio company with enhanced fields including fund association, cap table, financial KPIs, etc.
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               # Basic company details
 *               name:
 *                 type: string
 *                 description: Company name
 *               industry:
 *                 type: string
 *                 description: Industry sector
 *               foundingDate:
 *                 type: string
 *                 format: date
 *                 description: Company founding date
 *               address:
 *                 type: string
 *                 description: Company address
 *               website:
 *                 type: string
 *                 format: uri
 *                 description: Company website
 *               description:
 *                 type: string
 *                 description: Company description
 *               logoUrl:
 *                 type: string
 *                 format: uri
 *                 description: Company logo URL
 *               status:
 *                 type: string
 *                 enum: [PENDING, APPROVED, REJECTED, ACTIVE, SUSPENDED]
 *                 description: Company status
 *               companySize:
 *                 type: string
 *                 enum: [SMALL, MEDIUM, LARGE]
 *                 description: Company size
 *               employeeCount:
 *                 type: integer
 *                 description: Number of employees
 *               annualRevenue:
 *                 type: number
 *                 description: Annual revenue
 *               fundingStage:
 *                 type: string
 *                 enum: [SEED, SERIES_A, SERIES_B, SERIES_C, GROWTH]
 *                 description: Current funding stage
 *               contactPerson:
 *                 type: string
 *                 description: Primary contact person
 *               contactPhone:
 *                 type: string
 *                 description: Contact phone number
 *               contactEmail:
 *                 type: string
 *                 format: email
 *                 description: Contact email
 *               socialMedia:
 *                 type: object
 *                 description: Social media links
 *               
 *               # Enhanced fields
 *               fund_id:
 *                 type: string
 *                 description: Associated fund ID (optional)
 *               start_date:
 *                 type: string
 *                 format: date
 *                 description: Investment start date
 *               end_date:
 *                 type: string
 *                 format: date
 *                 description: Investment end date
 *               cap_table:
 *                 type: object
 *                 description: Capitalization table data
 *                 properties:
 *                   total_fully_diluted_shares:
 *                     type: number
 *                   securities:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         holder_name:
 *                           type: string
 *                         security_type:
 *                           type: string
 *                         class:
 *                           type: string
 *                         quantity:
 *                           type: number
 *                         percent_fully_diluted:
 *                           type: number
 *               financial_kpis:
 *                 type: object
 *                 description: Financial KPIs data
 *                 properties:
 *                   currency:
 *                     type: string
 *                   revenue:
 *                     type: number
 *                   expenses:
 *                     type: number
 *                   net_income:
 *                     type: number
 *                   cash:
 *                     type: number
 *                   months_of_runway:
 *                     type: number
 *               financial_history_excel:
 *                 type: object
 *                 description: Financial history file information
 *                 properties:
 *                   file_name:
 *                     type: string
 *                   mime_type:
 *                     type: string
 *                   url:
 *                     type: string
 *                   checksum_sha256:
 *                     type: string
 *               e_sign:
 *                 type: object
 *                 description: Electronic signature data
 *                 properties:
 *                   user_id:
 *                     type: string
 *                   signed_at:
 *                     type: string
 *                     format: date-time
 *                   signature_id:
 *                     type: string
 *     responses:
 *       200:
 *         description: Portfolio company updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.put("/:id", authenticate, authorize(["admin", "applicant"]), PortfolioCompanyController.updatePortfolioCompany);

/**
 * @swagger
 * /api/portfolio-companies/me:
 *   put:
 *     summary: Update current user's portfolio company
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               industry:
 *                 type: string
 *               foundingDate:
 *                 type: string
 *                 format: date
 *               address:
 *                 type: string
 *               website:
 *                 type: string
 *                 format: uri
 *               description:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *                 format: uri
 *               status:
 *                 type: string
 *                 enum: ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED']
 *               companySize:
 *                 type: string
 *                 enum: ['SMALL', 'MEDIUM', 'LARGE']
 *               employeeCount:
 *                 type: integer
 *               annualRevenue:
 *                 type: number
 *               fundingStage:
 *                 type: string
 *                 enum: ['SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'LATE_STAGE']
 *               contactPerson:
 *                 type: string
 *               contactPhone:
 *                 type: string
 *               contactEmail:
 *                 type: string
 *               socialMedia:
 *                 type: object
 *     responses:
 *       200:
 *         description: Portfolio company updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.put("/me", authenticate, authorize(["applicant"]), PortfolioCompanyController.updateCurrentUserPortfolioCompany);

/**
 * @swagger
 * /api/portfolio-companies/{id}:
 *   delete:
 *     summary: Delete portfolio company
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio company deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.delete("/:id", authenticate, authorize(["admin"]), PortfolioCompanyController.deletePortfolioCompany);

export default router;
