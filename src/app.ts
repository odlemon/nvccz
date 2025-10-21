// @ts-nocheck
import express from "express"
import cors from "cors"
import helmet from "helmet"
import dotenv from "dotenv"

import { errorMiddleware } from "./middleware/error"
import { dbConnection } from "./utils/database"
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
import postRoutes from "./routes/postRoutes"
import newsletterRoutes from "./routes/newsletterRoutes"
import newsletterSubscriptionRoutes from "./routes/newsletterSubscriptionRoutes"
import eventRoutes from "./routes/eventRoutes"
import homepageRoutes from "./routes/homepageRoutes"
import currencyRoutes from "./routes/currencyRoutes"
import vendorRoutes from "./routes/vendorRoutes"
import expenseCategoryRoutes from "./routes/expenseCategoryRoutes"
import expenseRoutes from "./routes/expenseRoutes"
import journalEntryRoutes from "./routes/journalEntryRoutes"
import chartOfAccountsRoutes from "./routes/chartOfAccountsRoutes"
import invoiceRoutes from "./routes/invoiceRoutes"
import customerRoutes from "./routes/customerRoutes"
import incomeStatementRoutes from "./routes/incomeStatementRoutes"
import cashFlowRoutes from "./routes/cashFlowRoutes"
import balanceSheetRoutes from "./routes/balanceSheetRoutes"
import revenueRoutes from "./routes/revenueRoutes"
import revenueSourceRoutes from "./routes/revenueSourceRoutes"
import revenueCategoryRoutes from "./routes/revenueCategoryRoutes"
import bankReconciliationRoutes from "./routes/bankReconciliationRoutes"
import cashbookRoutes from "./routes/cashbookRoutes"
import cashbookRoutesEnhanced from "./routes/cashbookRoutes-Enhanced"
import trialBalanceRoutes from "./routes/trialBalanceRoutes"
import miniKycRoutes from "./routes/miniKycRoutes"
import companyProfileRoutes from "./routes/companyProfileRoutes"
import portfolioCompanyRoutes from "./routes/portfolioCompanyRoutes"
import applicationRoutes from "./routes/applicationRoutes"
import boardReviewRoutes from "./routes/boardReviewRoutes"
import termSheetRoutes from "./routes/termSheetRoutes"
import investmentImplementationRoutes from "./routes/investmentImplementationRoutes"
import fundRoutes from "./routes/fundRoutes"
import clientRoutes from "./routes/clientRoutes"
import targetRoutes from "./routes/targetRoutes"
import targetTrackingRoutes from "./routes/targetTrackingRoutes"
import auditRoutes from "./routes/auditRoutes"
import departmentRoutes from "./routes/departmentRoutes"
import performanceGoalRoutes from "./routes/performanceGoalRoutes"
import taskRoutes from "./routes/taskRoutes"
import kpiRoutes from "./routes/kpiRoutes"
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
import exitInterviewRoutes from "./routes/exitInterviewRoutes"
import performanceScorecardRoutes from "./routes/performanceScorecardRoutes"
import payrollRoutes from "./routes/payrollRoutes"
import procurementRoutes from "./routes/procurementRoutes"
import vendorQuotationRoutes from "./routes/vendorQuotationRoutes"
import approvalWorkflowRoutes from "./routes/approvalWorkflowRoutes"
import procurementApprovalConfigRoutes from "./routes/procurementApprovalConfigRoutes"
import approvalRoutes from "./routes/approvalRoutes"
import inventoryRoutes from "./routes/inventoryRoutes"
import assetRoutes from "./routes/assetRoutes"
import creditNoteRoutes from "./routes/creditNoteRoutes"
import statementRoutes from "./routes/statementRoutes"
import multiCurrencyRoutes from "./routes/multiCurrencyRoutes"
import hardcodedRoleRoutes from "./routes/hardcodedRoleRoutes"


dotenv.config()



const app = express()
const port = process.env.PORT || 3000



app.use(helmet({
  contentSecurityPolicy: false
}))
app.use(cors({
  origin: [ 
    "https://nvcczz.vercel.app",
    "https://nvccz-frontend.vercel.app",
    "https://arcus-eight.vercel.app",
    "https://nvccz-new.vercel.app",
    "https://nvcc.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://k8cgsgsckswkkkgo0k4sko84.31.220.82.129.sslip.io",
    "http://yoogo0gw888okwwsgk0s88og.31.220.82.129.sslip.io",
    "http://k8cgsgsckswkkkgo0k4sko84.31.220.82.129.sslip.io",
    "http://rk0kkk0wok0c4c8s48wc04k0.31.220.82.129.sslip.io"
    
  ],
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  })
  next()
})

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
app.get('/api-docs', (req, res) => {
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
            filter: true,
            showRequestHeaders: true,
            docExpansion: 'list',
            defaultModelsExpandDepth: 1,
            defaultModelExpandDepth: 1,
            tryItOutEnabled: true
          });
        };
      </script>
    </body>
    </html>
  `);
});

// Test endpoint to verify API is working
app.get('/test-api', (req, res) => {
  res.json({
    message: 'API is working',
    timestamp: new Date().toISOString(),
    swaggerUrl: '/api-docs'
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: envConfig.get("NODE_ENV"),
    database: "connected", // Prisma handles connection status
  })
})

// Database test endpoint
app.get("/test-db", async (req, res) => {
  try {
    const prisma = dbConnection.getPrismaClient();
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

// Auth routes
app.use("/api/auth", authRoutes)

// Role management routes
app.use("/api/roles", roleRoutes)

// Hardcoded Roles (System roles grouped by department)
app.use("/api/hardcoded-roles", hardcodedRoleRoutes)

// User management routes
app.use("/api/users", userRoutes)

// Homepage features routes
app.use("/api/posts", postRoutes)
app.use("/api/newsletters", newsletterRoutes)
app.use("/api/newsletter", newsletterSubscriptionRoutes)
app.use("/api/events", eventRoutes)
app.use("/api/homepage", homepageRoutes)

// Accounting module routes
app.use("/api/accounting/currencies", currencyRoutes)
app.use("/api/accounting/vendors", vendorRoutes)
app.use("/api/accounting/expense-categories", expenseCategoryRoutes)
app.use("/api/accounting/expenses", expenseRoutes)
app.use("/api/accounting/journal-entries", journalEntryRoutes)
app.use("/api/accounting/chart-of-accounts", chartOfAccountsRoutes)
app.use("/api/accounting/invoices", invoiceRoutes)
app.use("/api/accounting/customers", customerRoutes)
app.use("/api/accounting/income-statement", incomeStatementRoutes)
app.use("/api/accounting/cash-flow", cashFlowRoutes)
app.use("/api/accounting/balance-sheet", balanceSheetRoutes)
app.use("/api/accounting/revenues", revenueRoutes)
app.use("/api/accounting/revenue-sources", revenueSourceRoutes)
app.use("/api/accounting/revenue-categories", revenueCategoryRoutes)
app.use("/api/accounting/bank-reconciliation", bankReconciliationRoutes)
app.use("/api/cashbook", cashbookRoutes)
app.use("/api/cashbook", cashbookRoutesEnhanced)
app.use("/api/accounting/trial-balance", trialBalanceRoutes)

// Mini-KYC routes
app.use("/api/mini-kyc", miniKycRoutes)

// Company Profile routes
app.use("/api/company-profile", companyProfileRoutes)

// Portfolio Company routes
app.use("/api/portfolio-companies", portfolioCompanyRoutes)

// Application routes
app.use("/api/applications", applicationRoutes)

// Board Review routes
app.use("/api/board-reviews", boardReviewRoutes)
app.use("/api/term-sheets", termSheetRoutes)

// Investment Implementation routes
app.use("/api/investment-implementations", investmentImplementationRoutes)

// Fund Management routes
app.use("/api/funds", fundRoutes)

// Client Management routes
app.use("/api/clients", clientRoutes)

// Target management routes
app.use("/api/targets", targetRoutes)

// Target tracking routes
app.use("/api/target-tracking", targetTrackingRoutes)

// Audit logs
app.use("/api/audit-logs", auditRoutes)

// Performance Management routes
app.use("/api/departments", departmentRoutes)
app.use("/api/performance/goals", performanceGoalRoutes)
app.use("/api/tasks", taskRoutes)
app.use("/api/kpis", kpiRoutes)
app.use("/api/activity-logs", activityLogRoutes)

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

// Exit Interview routes
app.use("/api/exit-interviews", exitInterviewRoutes)

// Performance Scorecard routes
app.use("/api/performance-scorecards", performanceScorecardRoutes)

// Payroll Management routes
app.use("/api/payroll", payrollRoutes)

// Procurement Management routes
app.use("/api/procurement", procurementRoutes)

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



app.use(errorMiddleware)

const startServer = async (): Promise<void> => {
  try {
    await dbConnection.connect()

    app.listen(port, '0.0.0.0', () => {
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
    await dbConnection.disconnect()
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
