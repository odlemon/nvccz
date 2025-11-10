// @ts-nocheck
import express from "express";
import { PortfolioCompanyController } from "../controllers/PortfolioCompanyController";
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
  authorize(["admin"]),
  PortfolioCompanyController.downloadFinancialReport
);

/**
 * @swagger
 * /api/portfolio-companies/{id}/financial-reports/{reportId}/review:
 *   post:
 *     summary: Review a financial report
 *     description: Approve or reject a submitted financial report.
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
 *                 enum: [ACCEPT, REJECT]
 *                 example: ACCEPT
 *               comment:
 *                 type: string
 *                 example: "Looks good"
 *               mapping:
 *                 type: object
 *                 description: Mapping snapshot for accounting/performance.
 *     responses:
 *       200:
 *         description: Review recorded successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       default:
 *         description: Unexpected error
 */
router.post(
  "/:id/financial-reports/:reportId/review",
  authenticate,
  authorize(["admin"]),
  PortfolioCompanyController.reviewFinancialReport
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
  authorize(["admin", "cio", "ceo", "INV_ANALYST", "analyst", "investment_analyst"]),
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
  authorize(["admin", "cio", "ceo", "INV_ANALYST", "analyst", "investment_analyst"]),
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
