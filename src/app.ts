// @ts-nocheck
import express from "express"
import { createServer } from "http"
import cors from "cors"
import helmet from "helmet"
import dotenv from "dotenv"
import compression from "compression"
import path from "path"

import { errorMiddleware } from "./middleware/error"
import { prisma, checkDatabaseConnection } from "./utils/database"
import { envConfig } from "./utils/env"
import { logger } from "./utils/logger"
let specs: any = { openapi: '3.0.0', info: { title: 'NVCCZ API', version: '1.0.0' }, paths: {} };
try {
  // Load swagger only if generation succeeds to prevent tests from failing on YAML issues
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swagger = require("./config/swagger");
  if (swagger?.specs) {
    specs = swagger.specs;
  }
} catch (e) {
  // Fallback minimal spec is already assigned
}

import authRoutes from "./routes/authRoutes"
import roleRoutes from "./routes/roleRoutes"
import userRoutes from "./routes/userRoutes"
import auditLogRoutes from "./routes/auditLogRoutes"
import postRoutes from "./routes/postRoutes"
import newsletterRoutes from "./routes/newsletterRoutes"
import newsletterSubscriptionRoutes from "./routes/newsletterSubscriptionRoutes"
import eventRoutes from "./routes/eventRoutes"
import homepageRoutes from "./routes/homepageRoutes"
import currencyRoutes from "./routes/currencyRoutes"
import vendorRoutes from "./routes/vendorRoutes"
import vendorPublicRegistrationRoutes from "./routes/vendorPublicRegistrationRoutes"
import publicProcurementRoutes from "./routes/publicProcurementRoutes"
import expenseCategoryRoutes from "./routes/expenseCategoryRoutes"
import expenseRoutes from "./routes/expenseRoutes"
import journalEntryRoutes from "./routes/journalEntryRoutes"
import chartOfAccountsRoutes from "./routes/chartOfAccountsRoutes"
import invoiceRoutes from "./routes/invoiceRoutes"
import purchaseInvoiceRoutes from "./routes/purchaseInvoiceRoutes"
import customerRoutes from "./routes/customerRoutes"
import incomeStatementRoutes from "./routes/incomeStatementRoutes"
import cashFlowRoutes from "./routes/cashFlowRoutes"
import balanceSheetRoutes from "./routes/balanceSheetRoutes"
import accountingDashboardRoutes from "./routes/accountingDashboardRoutes"
import shortTermInvestmentRoutes from "./routes/shortTermInvestmentRoutes"
import accountingPeIntegrationV1Routes from "./routes/accountingPeIntegrationV1Routes"
import statementOfEquityRoutes from "./routes/statementOfEquityRoutes"
import revenueRoutes from "./routes/revenueRoutes"
import revenueSourceRoutes from "./routes/revenueSourceRoutes"
import revenueCategoryRoutes from "./routes/revenueCategoryRoutes"
import bankReconciliationRoutes from "./routes/bankReconciliationRoutes"
import cashbookRoutes from "./routes/cashbookRoutes"
import cashbookRoutesEnhanced from "./routes/cashbookRoutes-Enhanced"
import cashbookBatchImportRoutes from "./routes/cashbookBatchImportRoutes"
import openItemMatchingRoutes from "./routes/openItemMatchingRoutes"
import transactionReversalRoutes from "./routes/transactionReversalRoutes"
import cashbookTransferRoutes from "./routes/cashbookTransferRoutes"
import entryTypeRoutes from "./routes/entryTypeRoutes"
import trialBalanceRoutes from "./routes/trialBalanceRoutes"
import fiscalCalendarRoutes from "./routes/fiscalCalendarRoutes"
import miniKycRoutes from "./routes/miniKycRoutes"
import companyProfileRoutes from "./routes/companyProfileRoutes"
import portfolioCompanyRoutes from "./routes/portfolioCompanyRoutes"
import applicationRoutes from "./routes/applicationRoutes"
import applicantPortalRoutes from "./routes/applicantPortalRoutes"
import boardReviewRoutes from "./routes/boardReviewRoutes"
import termSheetRoutes from "./routes/termSheetRoutes"
import investmentImplementationRoutes from "./routes/investmentImplementationRoutes"
import investmentMonitoringRoutes from "./routes/investmentMonitoringRoutes"
import fundRoutes from "./routes/fundRoutes"
import lpFeesAndDistributionsRoutes from "./routes/lpFeesAndDistributionsRoutes"
import clientRoutes from "./routes/clientRoutes"
import targetRoutes from "./routes/targetRoutes"
import targetTrackingRoutes from "./routes/targetTrackingRoutes"
import auditRoutes from "./routes/auditRoutes"
import systemAuditLogRoutes from "./routes/systemAuditLogRoutes"
import performanceGoalRoutes from "./routes/performanceGoalRoutes"
import performanceETLRoutes from "./routes/performanceETLRoutes"
import performanceWorkflowRoutes from "./routes/performanceWorkflowRoutes"
import performanceDashboardRoutes from "./routes/performanceDashboardRoutes"
import taskRoutes from "./routes/taskRoutes"
import kpiRoutes from "./routes/kpiRoutes"
import hardcodedKPIRoutes from "./routes/hardcodedKPIRoutes"
import performanceKpiCatalogRoutes from "./routes/performanceKpiCatalogRoutes"
import activityLogRoutes from "./routes/activityLogRoutes"
import ceoDashboardRoutes from "./routes/ceoDashboardRoutes"
import stakeholderRoutes from "./routes/stakeholderRoutes"
import performanceReviewRoutes from "./routes/performanceReviewRoutes"
import automatedReportingRoutes from "./routes/automatedReportingRoutes"
import dealSourcingRoutes from "./routes/dealSourcingRoutes"
import researchReportRoutes from "./routes/researchReportRoutes"
import riskAssessmentRoutes from "./routes/riskAssessmentRoutes"
import budgetManagementRoutes from "./routes/budgetManagementRoutes"
import portfolioValuationRoutes from "./routes/portfolioValuationRoutes"
import portfolioDashboardRoutes from "./routes/portfolioDashboardRoutes"
import exitInterviewRoutes from "./routes/exitInterviewRoutes"
import enhancedGoalTrackingRoutes from "./routes/enhancedGoalTrackingRoutes"
import enhancedETLRoutes from "./routes/enhancedETLRoutes"
import performanceReviewCycleRoutes from "./routes/performanceReviewCycleRoutes"
import performanceBreakdownRoutes from "./routes/performanceBreakdownRoutes"
import individualGoalToTaskRoutes from "./routes/individualGoalToTaskRoutes"
import scorecardPillarRoutes from "./routes/scorecardPillarRoutes"
import payrollRoutes from "./routes/payrollRoutes"
import payrollDashboardRoutes from "./routes/payrollDashboardRoutes"
import payrollComplianceRoutes from "./routes/payrollComplianceRoutes"
import procurementRoutes from "./routes/procurementRoutes"
import procurementSuite06Routes from "./routes/procurementSuite06Routes"
import vendorDocumentAttachmentRoutes from "./routes/vendorDocumentAttachmentRoutes"
import forecastingRoutes from "./routes/forecastingRoutes"
import forecastingV1Routes from "./routes/forecastingV1Routes"
import forecastingCronRoutes from "./routes/forecastingCronRoutes"
import vendorQuotationRoutes from "./routes/vendorQuotationRoutes"
import approvalWorkflowRoutes from "./routes/approvalWorkflowRoutes"
import procurementApprovalConfigRoutes from "./routes/procurementApprovalConfigRoutes"
import approvalRoutes from "./routes/approvalRoutes"
import inventoryRoutes from "./routes/inventoryRoutes"
import assetRoutes from "./routes/assetRoutes"
import cronRoutes from "./routes/cronRoutes"
import publicReportingTestRoutes from "./routes/publicReportingTestRoutes"
import creditNoteRoutes from "./routes/creditNoteRoutes"
import statementRoutes from "./routes/statementRoutes"
import multiCurrencyRoutes from "./routes/multiCurrencyRoutes"
import vatRateRoutes from "./routes/vatRateRoutes"
import hardcodedRoleRoutes from "./routes/hardcodedRoleRoutes"
import activityRoutes from "./routes/activityRoutes"
import rollupCalculationRoutes from "./routes/rollupCalculationRoutes"
import performanceScorecardRoutes from "./routes/performanceScorecardRoutes"
import performanceAnalyticsRoutes from "./routes/performanceAnalyticsRoutes"
import performanceConfigRoutes from "./routes/performanceConfigRoutes"
import performanceIntegrationRoutes from "./routes/performanceIntegrationRoutes"
import performanceBscEntryRoutes from "./routes/performanceBscEntryRoutes"
import bscWorkflowRoutes from "./routes/bscWorkflowRoutes"
import performanceContractRoutes from "./routes/performanceContractRoutes"
import accountingApiRoutes from "./routes/accountingApiRoutes"
import vatReportRoutes from "./routes/vatReportRoutes"
import glLedgerDetailRoutes from "./routes/glLedgerDetailRoutes"
import publicMediaRoutes from "./routes/publicMediaRoutes"
import publicMediaTestRoutes from "./routes/publicMediaTestRoutes"
import { initSocketServer } from "./services/RealtimeSocketService"


dotenv.config()



const app = express()
const httpServer = createServer(app)
const port = envConfig.get("PORT")

// Disable automatic ETag generation so successful JSON responses aren't converted to 304s
app.set("etag", false)

// Public media must run before Helmet/compression so no middleware adds CORP/COOP and PNGs are not gzip-broken.
app.use("/api/public-media", publicMediaRoutes)

// TODO: tighten CORP/COOP for production once public-media + CDN behavior is settled.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
  })
)
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      "https://nvcczz.vercel.app",
      "http://app.kyntaro.com",
        "https://dev.arcus.co.zw",
      "https://dev-api.arcus.co.zw",
      "https://app.arcus.co.zw",
      "https://arcus.co.zw",
      "https://app.kyntaro.com",
      "https://nvccz-new-taupe.vercel.app",
      "http://31.220.82.129",
      "http://kyntaro.com",
      "https://kyntaro.com",
      "https://nvccz-frontend.vercel.app", 
      "https://arcus-eight.vercel.app",
      "http://dev.kyntaro.com",
      "https://dev.kyntaro.com",
      "https://nvccz-new.vercel.app",
      "https://nvcc.vercel.app",
      "https://nvccz-pi.vercel.app",  // Added Swagger UI origin
      "http://localhost:3000",
      "http://localhost:3001",
      "http://k8cgsgsckswkkkgo0k4sko84.31.220.82.129.sslip.io",
      "http://yoogo0gw888okwwsgk0s88og.31.220.82.129.sslip.io",
      "http://rk0kkk0wok0c4c8s48wc04k0.31.220.82.129.sslip.io"
    ];
    
    // Allow all Vercel preview deployments for development
    if (origin && origin.includes('.vercel.app')) {
      return callback(null, true);
    }
    
    // Check if origin is allowed
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // Log the blocked origin for debugging
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Depreciation-Cron-Secret',
    'X-Reporting-Reminders-Cron-Secret',
  ],
  optionsSuccessStatus: 200
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
// Legacy local uploads. New media uploads use `/api/public-media/...` via `RemoteUploadService`.
app.use(
  "/api/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    etag: true,
    maxAge: process.env.NODE_ENV === "production" ? "7d" : "0"
  })
)
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) return false
      return compression.filter(req, res)
    },
  })
)

const enablePublicMediaTest =
  process.env.ALLOW_PUBLIC_MEDIA_TEST_UPLOAD === "true" ||
  process.env.NODE_ENV === "development" ||
  process.env.npm_lifecycle_event === "dev";
if (enablePublicMediaTest) {
  app.use("/api/dev/public-media-test", publicMediaTestRoutes);
}

// Disallow intermediate caching for API responses to keep freshness predictable
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
})

// Database connection health-check middleware (cached to avoid hammering the DB)
const HEALTH_CHECK_INTERVAL_MS = Number(process.env.DB_HEALTH_CHECK_INTERVAL_MS || 30000);
let lastHealthCheck = 0;
let lastHealthCheckStatus = true;

app.use(async (req, res, next) => {
  // Skip health checks for OPTIONS requests and when explicit bypass flag is set
  if (req.method === "OPTIONS" || process.env.SKIP_REQUEST_HEALTH_CHECK === "true") {
    return next();
  }
  // Static-ish media proxy + dev upload smoke test (no DB)
  if (
    req.path.startsWith("/api/public-media") ||
    req.path.startsWith("/api/dev/public-media-test")
  ) {
    return next();
  }

  const now = Date.now();
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL_MS) {
    if (!lastHealthCheckStatus) {
      logger.warn("Database health check previously failed; skipping request.");
      return res.status(503).json({
        success: false,
        message: "Database temporarily unavailable",
        error: "Service temporarily unavailable"
      });
    }
    return next();
  }

  lastHealthCheck = now;

  try {
    lastHealthCheckStatus = await checkDatabaseConnection();
    if (!lastHealthCheckStatus) {
      logger.warn("Database connection lost, attempting to reconnect");
      await prisma.$connect();
      lastHealthCheckStatus = true;
    }
    next();
  } catch (error: any) {
    lastHealthCheckStatus = false;
    logger.error("Database connection error in middleware", { error: error.message });
    res.status(503).json({
      success: false,
      message: "Database temporarily unavailable",
      error: "Service temporarily unavailable"
    });
  }
});

// Attach request metadata (ip, user-agent) for audit logging
import { attachRequestMeta } from "./middleware/requestMeta"
app.use(attachRequestMeta)

// Debug endpoint to check Swagger spec (development only)
if (process.env.NODE_ENV === 'development') {
  app.get('/api-spec', (req, res) => {
    res.json({
      success: true,
      spec: specs,
      paths: Object.keys(specs.paths || {}),
      totalPaths: Object.keys(specs.paths || {}).length,
      environment: process.env.NODE_ENV
    });
  });
}

// FASTEST FIX - Pure HTML with CDN resources (no swagger-ui-express)
const docsHandler = (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Role-Based Access Control API Documentation</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.27.1/swagger-ui.css" />
      <style>
        html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin:0; background: #fafafa; }
        .swagger-ui .topbar { display: none; }
        .swagger-ui { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
        .swagger-ui .scheme-container { background: #fafafa; padding: 15px 0; }
        .swagger-ui .info { margin: 50px 0; }
        .swagger-ui .info .title { font-size: 36px; color: #3b4151; }
        .swagger-ui .opblock .opblock-summary { padding: 15px; }
        .swagger-ui .opblock.opblock-post { border-color: #49cc90; background: rgba(73, 204, 144, 0.1); }
        .swagger-ui .opblock.opblock-get { border-color: #61affe; background: rgba(97, 175, 254, 0.1); }
        .swagger-ui .opblock.opblock-put { border-color: #fca130; background: rgba(252, 161, 48, 0.1); }
        .swagger-ui .opblock.opblock-delete { border-color: #f93e3e; background: rgba(249, 62, 62, 0.1); }
        .swagger-ui .filter-container { display: none !important; }
        .swagger-ui .filter { display: none !important; }
        .swagger-ui .search-properties { display: none !important; }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist@5.27.1/swagger-ui-bundle.js"></script>
      <script src="https://unpkg.com/swagger-ui-dist@5.27.1/swagger-ui-standalone-preset.js"></script>
      <script>
        window.onload = function() {
          const ui = SwaggerUIBundle({
            spec: ${JSON.stringify(specs)},
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIStandalonePreset
            ],
            plugins: [
              SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "StandaloneLayout",
            persistAuthorization: true,
            displayRequestDuration: true,
            filter: false,
            showRequestHeaders: true,
            docExpansion: 'list',
            defaultModelsExpandDepth: 1,
            defaultModelExpandDepth: 1,
            tryItOutEnabled: true,
            supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
            validatorUrl: null
          });
        };
      </script>
    </body>
    </html>
  `);
};

app.get('/api-docs', docsHandler);
app.get('/docs', docsHandler);

// Bump this string when you deploy — curl /test-api or /health to confirm prod picked up the build.
const DEPLOY_MARKER = "NVCCZ deploy marker — swagger Forecasting + PDF protected modules — 2026-06-15";

// Test endpoint to verify API is working
app.get('/test-api', (req, res) => {
  res.json({
    message: 'API is working',
    customText: DEPLOY_MARKER,
    timestamp: new Date().toISOString(),
    swaggerUrl: '/api-docs'
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    customText: DEPLOY_MARKER,
    timestamp: new Date().toISOString(),
    environment: envConfig.get("NODE_ENV"),
    database: "connected", // Prisma handles connection status
  })
})

// Database test endpoint
app.get("/test-db", async (req, res) => {
  try {
    await prisma.$connect();
    
    // Try a simple query
    const userCount = await prisma.user.count();
    
    res.status(200).json({
      success: true,
      message: "Database connection successful",
      userCount: userCount,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
})

// Cron / automation (no JWT — use route-specific secrets)
app.use("/api/cron", cronRoutes)
app.use("/api/public/reporting", publicReportingTestRoutes)

// Auth routes
app.use("/api/auth", authRoutes)

// Role management routes
app.use("/api/roles", roleRoutes)

// Hardcoded Roles (System roles grouped by department)
app.use("/api/hardcoded-roles", hardcodedRoleRoutes)

// User management routes
app.use("/api/users", userRoutes)

// Audit logs (admin only)
app.use("/api/audit-logs", auditLogRoutes)

// Homepage features routes
app.use("/api/posts", postRoutes)
app.use("/api/newsletters", newsletterRoutes)
app.use("/api/newsletter", newsletterSubscriptionRoutes)
app.use("/api/events", eventRoutes)
app.use("/api/homepage", homepageRoutes)

// Public vendor self-registration (no JWT)
app.use("/api/public", vendorPublicRegistrationRoutes)
app.use("/api/public", publicProcurementRoutes)

// Accounting module routes
app.use("/api/accounting/currencies", currencyRoutes)
app.use("/api/accounting/vendors", vendorRoutes)
app.use("/api/accounting/expense-categories", expenseCategoryRoutes)
app.use("/api/accounting/expenses", expenseRoutes)
app.use("/api/accounting/journal-entries", journalEntryRoutes)
app.use("/api/accounting/chart-of-accounts", chartOfAccountsRoutes)
app.use("/api/accounting/invoices", invoiceRoutes)
app.use("/api/accounting/purchase-invoices", purchaseInvoiceRoutes)
app.use("/api/accounting/customers", customerRoutes)
app.use("/api/accounting/income-statement", incomeStatementRoutes)
app.use("/api/accounting/cash-flow", cashFlowRoutes)
app.use("/api/accounting/balance-sheet", balanceSheetRoutes)
app.use("/api/accounting/dashboard", accountingDashboardRoutes)
app.use("/api/accounting/short-term-investments", shortTermInvestmentRoutes)
app.use("/api/accounting/v1", accountingPeIntegrationV1Routes)
app.use("/api/accounting/statement-of-equity", statementOfEquityRoutes)
app.use("/api/accounting/revenues", revenueRoutes)
app.use("/api/accounting/revenue-sources", revenueSourceRoutes)
app.use("/api/accounting/revenue-categories", revenueCategoryRoutes)
app.use("/api/accounting/bank-reconciliation", bankReconciliationRoutes)
app.use("/api/vat", vatReportRoutes)
app.use("/api/accounting/gl-ledger-detail", glLedgerDetailRoutes)

// Cashbook specific routes (must be BEFORE general /api/cashbook route)
app.use("/api/cashbook/batches", cashbookBatchImportRoutes)
app.use("/api/cashbook/open-items", openItemMatchingRoutes)
app.use("/api/cashbook/transactions", transactionReversalRoutes)
app.use("/api/cashbook/reversals", transactionReversalRoutes)
app.use("/api/cashbook/transfers", cashbookTransferRoutes)

// Enhanced cashbook routes (void, reconcile, etc.)
app.use("/api/cashbook", cashbookRoutesEnhanced)

// General cashbook routes (must be AFTER specific routes)
app.use("/api/cashbook", cashbookRoutes)
// Import new cashbook routes
import contraEntryRoutes from "./routes/contraEntryRoutes"
import batchImportExportRoutes from "./routes/batchImportExportRoutes"
import periodLockoutRoutes from "./routes/periodLockoutRoutes"

// Register new cashbook routes (must be BEFORE general /api/cashbook route)
app.use("/api/cashbook/contra", contraEntryRoutes)
app.use("/api/cashbook/entry-types", entryTypeRoutes)
app.use("/api/cashbook/periods", periodLockoutRoutes)
app.use("/api/accounting/trial-balance", trialBalanceRoutes)
app.use("/api/accounting/fiscal-calendar", fiscalCalendarRoutes)
app.use("/accounting/api", accountingApiRoutes)

// Mini-KYC routes
app.use("/api/mini-kyc", miniKycRoutes)

// Company Profile routes
app.use("/api/company-profile", companyProfileRoutes)

// Portfolio Company routes
app.use("/api/portfolio-companies", portfolioCompanyRoutes)

// Application routes
app.use("/api/applications", applicationRoutes)

// Applicant Portal routes
app.use("/api/applicant", applicantPortalRoutes)

// Board Review routes
app.use("/api/board-reviews", boardReviewRoutes)
app.use("/api/term-sheets", termSheetRoutes)

// Investment Implementation routes
app.use("/api/investment-implementations", investmentImplementationRoutes)
// Portfolio monitoring: investments/{id}/valuations & exit (spec §2.4)
app.use("/api/investments", investmentMonitoringRoutes)

// Fund Management routes
app.use("/api/funds", fundRoutes)

// LP Fees & Distributions (fee policy, management fees, distributions). Mounted on the same prefix
// since paths are scoped under `/:fundId/...`; siblings to Capital Calls inside fundRoutes.
app.use("/api/funds", lpFeesAndDistributionsRoutes)

// Client Management routes
app.use("/api/clients", clientRoutes)

// Target management routes
app.use("/api/targets", targetRoutes)

// Target tracking routes
app.use("/api/target-tracking", targetTrackingRoutes)

// Audit logs
app.use("/api/audit-logs", auditRoutes)
// System audit log (activity log: login, record creation, report export with user and IP)
app.use("/api/system-audit-log", systemAuditLogRoutes)

// Performance Management routes
app.use("/api/performance/goals", performanceGoalRoutes)
app.use("/api/performance/etl", performanceETLRoutes)
app.use("/api/performance/dashboard", performanceDashboardRoutes)
app.use("/api/performance/workflow", performanceWorkflowRoutes)
app.use("/api/tasks", taskRoutes)
app.use("/api/activities", activityRoutes)
app.use("/api/kpis", kpiRoutes)
app.use("/api/performance/kpis", hardcodedKPIRoutes)
app.use("/api/performance/kpis", performanceKpiCatalogRoutes)
app.use("/api/performance/scorecard-pillars", scorecardPillarRoutes)
app.use("/api/activity-logs", activityLogRoutes)
app.use("/api/performance/rollup", rollupCalculationRoutes)
app.use("/api/performance/scorecards", performanceScorecardRoutes)
app.use("/api/performance/analytics", performanceAnalyticsRoutes)
app.use("/api/performance/config", performanceConfigRoutes)
app.use("/api/performance/integration", performanceIntegrationRoutes)
app.use("/api/performance/bsc-entry", performanceBscEntryRoutes)
app.use("/api/performance/bsc-workflow", bscWorkflowRoutes)
app.use("/api/performance/contracts", performanceContractRoutes)

// CEO Dashboard routes
app.use("/api/ceo-dashboard", ceoDashboardRoutes)

// Stakeholder Management routes
app.use("/api/stakeholders", stakeholderRoutes)

// Performance Review routes
app.use("/api/performance-reviews", performanceReviewRoutes)

// Automated Reporting routes
app.use("/api/automated-reporting", automatedReportingRoutes)

// Deal Management routes
// app.use("/api/deal-sourcing", dealSourcingRoutes)

// Research Report routes
app.use("/api/research-reports", researchReportRoutes)

// Risk Assessment routes
app.use("/api/risk-assessments", riskAssessmentRoutes)

// Budget Management routes
app.use("/api/budget-management", budgetManagementRoutes)

// Portfolio Valuation routes
app.use("/api/portfolio-valuations", portfolioValuationRoutes)
app.use("/api/portfolio/dashboard", portfolioDashboardRoutes)

// Exit Interview routes
app.use("/api/exit-interviews", exitInterviewRoutes)

app.use("/api/performance/goal-tracking", enhancedGoalTrackingRoutes)
app.use("/api/performance/enhanced-etl", enhancedETLRoutes)
app.use("/api/performance/review-cycles", performanceReviewCycleRoutes)
app.use("/api/performance/breakdown", performanceBreakdownRoutes)
app.use("/api/performance/individual-goals", individualGoalToTaskRoutes)

// Payroll Management routes
app.use("/api/payroll", payrollRoutes)
app.use("/api/payroll/compliance", payrollComplianceRoutes)
app.use("/api/payroll/dashboard", payrollDashboardRoutes)

// Procurement Management routes — specific sub-routers BEFORE generic /procurement (which applies authenticate globally)
app.use("/api/procurement/document-attachments", vendorDocumentAttachmentRoutes)
app.use("/api/procurement/suite06", procurementSuite06Routes)
app.use("/api/procurement", procurementRoutes)

// Forecasting Engine
app.use("/api/forecasting", forecastingRoutes)
app.use("/api/v1/forecasting", forecastingV1Routes)
app.use("/api/cron/forecasting", forecastingCronRoutes)

// Vendor Quotation routes (some are public/unauthenticated)
app.use("/api/vendor-quotations", vendorQuotationRoutes)

// Approval Workflow routes
app.use("/api/approval-workflows", approvalWorkflowRoutes)

// Procurement Approval Configuration routes
app.use("/api/procurement-approval-configs", procurementApprovalConfigRoutes)

// Approval Action routes
app.use("/api/approvals", approvalRoutes)

// Inventory Management routes
app.use("/api/accounting/inventory", inventoryRoutes)

// Asset Management routes
app.use("/api/accounting/assets", assetRoutes)

// Credit Note routes
app.use("/api/accounting/credit-notes", creditNoteRoutes)

// Statement of Accounts routes
app.use("/api/accounting/statements", statementRoutes)

// Multi-Currency routes
app.use("/api/accounting/multi-currency", multiCurrencyRoutes)
app.use("/api/accounting/vat-rates", vatRateRoutes)



app.use(errorMiddleware)

const startServer = async (): Promise<void> => {
  try {
    // Add retry mechanism for database connection
    let retries = 3;
    let connected = false;
    
    while (retries > 0 && !connected) {
      try {
        await prisma.$connect();
        connected = await checkDatabaseConnection();
        
        if (connected) {
          logger.info("✅ Connected to MySQL database successfully");
          break;
        }
      } catch (error: any) {
        retries--;
        logger.warn(`Database connection attempt failed, ${retries} retries left`, { error: error.message });
        
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
        }
      }
    }
    
    if (!connected) {
      throw new Error("Failed to connect to database after 3 attempts");
    }

    initSocketServer(httpServer)

    httpServer.listen(port, '0.0.0.0', () => {
      logger.info(`🚀 Server running on port ${port}`, {
        environment: envConfig.get("NODE_ENV"),
        port: port,
      })
      logger.info(`📚 API Documentation available at http://localhost:${port}/api-docs`)
      logger.info(`🌐 Server accessible at http://31.220.82.129:${port}`)
    })
  } catch (error: any) {
    logger.error("Failed to start server", { error: error.message })
    process.exit(1)
  }
}

const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}. Shutting down gracefully...`)

  try {
    await prisma.$disconnect()
    logger.info("Server shut down successfully")
    process.exit(0)
  } catch (error: any) {
    logger.error("Error during shutdown", { error: error.message })
    process.exit(1)
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

// Start the server
startServer()

export default app
