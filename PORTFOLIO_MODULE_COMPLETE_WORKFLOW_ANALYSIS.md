# 🏢 PORTFOLIO MODULE - COMPLETE WORKFLOW ANALYSIS

## 📋 OVERVIEW

This document provides a comprehensive analysis of the Portfolio Module workflow from the first stage (application submission) to the last stage (portfolio company management and fund disbursement).

---

## 🔄 COMPLETE WORKFLOW STAGES

### **STAGE 1: APPLICATION SUBMISSION** (Public - No Auth Required)

#### **Entry Point:**
- **Endpoint:** `POST /api/applications`
- **Service:** `ApplicationService.createApplication()`
- **File:** `src/services/ApplicationService.ts`

#### **What Happens:**
1. **User submits application** with:
   - Applicant information (name, email, phone, address)
   - Business information (name, description, industry, stage, founding date)
   - Investment details (requested amount, optional fund selection)
   - Required documents (BUSINESS_PLAN, PROOF_OF_CONCEPT, MARKET_RESEARCH, PROJECTED_CASH_FLOWS)

2. **Validation:**
   - Email format validation
   - Requested amount > 0
   - Fund must be OPEN (if fundId provided)
   - All required documents must be uploaded
   - Email must not already exist in applications or users

3. **Application Created:**
   - Status: `PENDING_SHORTLISTING` (initial stage)
   - `submittedAt`: Current timestamp
   - Documents linked to application
   - Email notification sent to applicant

#### **Database Models:**
- `Application` - Main application record
- `ApplicationDocument` - Uploaded documents
- `ApplicationNotification` - Email notifications

#### **Next Stage:**
- Application moves to `SHORTLISTED` (after AI evaluation or admin review)

---

### **STAGE 2: ADMIN REVIEW & SHORTLISTING** (Protected - Admin/Fund Manager)

#### **Entry Point:**
- **Endpoint:** `GET /api/applications?stage=SHORTLISTED`
- **Service:** `ApplicationService.getAllApplications()`
- **File:** `src/services/ApplicationService.ts`

#### **What Happens:**
1. Admin views applications with filtering:
   - By stage (SHORTLISTED, UNDER_DUE_DILIGENCE, etc.)
   - By fund
   - Pagination support

2. **Admin Actions:**
   - View application details
   - Download documents
   - Change application stage
   - Assign reviewers
   - Update application information

#### **Available Actions:**
- `GET /api/applications/:id` - Get application details
- `PUT /api/applications/:id` - Update application (only if SHORTLISTED)
- `POST /api/applications/:id/change-stage` - Change stage
- `DELETE /api/applications/:id` - Delete application (only if SHORTLISTED)

#### **Next Stage:**
- Application moves to `UNDER_DUE_DILIGENCE` when due diligence is initiated

---

### **STAGE 3: DUE DILIGENCE REVIEW** (Protected - Admin/Fund Manager)

#### **Entry Point:**
- **Endpoint:** `POST /api/applications/:id/due-diligence/initiate`
- **Service:** `DueDiligenceService.initiateDueDiligence()`
- **File:** `src/services/DueDiligenceService.ts`

#### **What Happens:**
1. **Initiate Due Diligence:**
   - Application must be in `SHORTLISTED` stage
   - No existing due diligence review
   - Due diligence created with status `IN_PROGRESS`
   - Application stage updated to `UNDER_DUE_DILIGENCE`

2. **Update Due Diligence:**
   - Assessment areas:
     - Market Research Viability (Yes/No + Comments)
     - Financial Viability (Yes/No + Comments)
     - Competitive Opportunities (Yes/No + Comments)
     - Management Team Qualification (Yes/No + Comments)
     - Legal Compliance (Yes/No + Comments)
     - Risk Tolerance (Yes/No + Comments)
   - Overall Score (0-100%)
   - Recommendation (APPROVE, REJECT, CONDITIONAL)

3. **Complete Due Diligence:**
   - Due diligence status set to `COMPLETED`
   - Application stage updated:
     - `DUE_DILIGENCE_COMPLETED` if recommendation is APPROVE
     - `REJECTED` if recommendation is REJECT
     - `UNDER_BOARD_REVIEW` if recommendation is CONDITIONAL

#### **Database Models:**
- `DueDiligenceReview` - Due diligence assessment record

#### **Endpoints:**
- `POST /api/applications/:id/due-diligence/initiate` - Start due diligence
- `PUT /api/applications/:id/due-diligence` - Update assessment
- `GET /api/applications/:id/due-diligence` - Get due diligence report
- `POST /api/applications/:id/due-diligence/complete` - Complete review

#### **Next Stage:**
- Application moves to `UNDER_BOARD_REVIEW` when due diligence is completed with APPROVE or CONDITIONAL recommendation

---

### **STAGE 4: BOARD REVIEW** (Protected - Admin/Fund Manager/Board Members)

#### **Entry Point:**
- **Endpoint:** `POST /api/board-reviews/:applicationId`
- **Service:** `BoardReviewService.createBoardReview()`
- **File:** `src/services/BoardReviewService.ts`

#### **What Happens:**
1. **Create Board Review:**
   - Application must be in `UNDER_BOARD_REVIEW` stage
   - Only ONE decision option can be selected:
     - `investmentApproved: true` OR
     - `investmentRejected: true` OR
     - `conditionalApproval: true`
   - Board review created with status `IN_PROGRESS`

2. **Board Review Fields:**
   - Investment Decision (one of: Approved, Rejected, Conditional)
   - Recommendation Report (condensed proposal)
   - Additional Information Requested
   - Decision Reason
   - Conditions (for conditional approval)
   - Next Steps
   - Overall Score (0-100%)
   - Final Comments

3. **Board Voting (Optional):**
   - Board members can cast votes (APPROVE/REJECT)
   - Voting power calculated based on role
   - Majority decision calculated automatically

4. **Complete Board Review:**
   - Board review status set to `COMPLETED`
   - Application stage updated based on decision:
     - `BOARD_APPROVED` → Move to term sheet
     - `BOARD_REJECTED` → Application rejected
     - `BOARD_CONDITIONAL` → Conditional approval with conditions

#### **Database Models:**
- `BoardReview` - Board review record
- `BoardReviewVote` - Individual board member votes

#### **Endpoints:**
- `POST /api/board-reviews/:applicationId` - Create board review
- `GET /api/board-reviews/:applicationId` - Get board review
- `PUT /api/board-reviews/:applicationId` - Update board review
- `POST /api/board-reviews/:applicationId/complete` - Complete review
- `POST /api/board-reviews/:applicationId/vote` - Cast board vote

#### **Next Stage:**
- Application moves to `TERM_SHEET` or `TERM_SHEET_NEGOTIATION` when board approves

---

### **STAGE 5: TERM SHEET GENERATION** (Protected - Admin/Fund Manager)

#### **Entry Point:**
- **Endpoint:** `POST /api/term-sheets/:applicationId`
- **Service:** `TermSheetService.createTermSheet()`
- **File:** `src/services/TermSheetService.ts`

#### **What Happens:**
1. **Create Term Sheet:**
   - Application must be in `BOARD_APPROVED` or `TERM_SHEET` stage
   - Only one term sheet allowed per application
   - Term sheet created with status `DRAFT`
   - Version: "1.0"

2. **Term Sheet Fields:**
   - Title
   - Investment Amount
   - Equity Percentage
   - Valuation
   - Key Terms (text)
   - Conditions (text)
   - Timeline (text)
   - Document (file URL, name, size)

3. **Update Term Sheet:**
   - Can update any field while status is DRAFT
   - Cannot update after signing

4. **Finalize Term Sheet:**
   - Status updated to `FINAL`
   - `isFinal: true`
   - `isDraft: false`
   - Email notification sent to applicant

#### **Database Models:**
- `TermSheet` - Term sheet record

#### **Endpoints:**
- `POST /api/term-sheets/:applicationId` - Create term sheet
- `GET /api/term-sheets/:applicationId` - Get term sheet
- `PUT /api/term-sheets/:applicationId` - Update term sheet
- `POST /api/term-sheets/:applicationId/finalize` - Mark as final

#### **Next Stage:**
- Term sheet moves to `SIGNED` when applicant signs it

---

### **STAGE 6: TERM SHEET SIGNING** (Protected - Applicant)

#### **Entry Point:**
- **Endpoint:** `POST /api/term-sheets/:applicationId/sign`
- **Service:** `TermSheetService.signTermSheet()`
- **File:** `src/services/TermSheetService.ts`

#### **What Happens:**
1. **Sign Term Sheet:**
   - Term sheet must be `FINAL` (not DRAFT)
   - Cannot sign if already signed
   - `isSigned: true`
   - `signedAt: current timestamp`
   - Status: `SIGNED`

2. **Application Stage Update:**
   - Application stage updated to `INVESTMENT_IMPLEMENTATION`
   - Email notification sent to applicant

3. **⚠️ AUTOMATIC USER & PORTFOLIO COMPANY CREATION:**
   - **Triggered by:** Board review completion (when board approves)
   - **Service:** `BoardReviewService.createUserAndPortfolioCompany()`
   - **File:** `src/services/BoardReviewService.ts` (lines 1053-1200)

   **Process:**
   - Check if user already exists (by email)
   - If user doesn't exist:
     - Generate secure temporary password
     - Create "applicant" role if doesn't exist
     - Create user with:
       * firstName: Split from applicantName
       * lastName: Split from applicantName
       * email: From application
       * password: Hashed temporary password
       * roleId: Applicant role ID
   - Create Portfolio Company:
     * Links to created user
     * name: From businessName
     * registrationNumber: Auto-generated (REG-{timestamp})
     * industry: From application
     * foundingDate: From application
     * address: From applicantAddress
     * description: From businessDescription
     * status: "PENDING"
     * companySize: Based on businessStage
     * fundingStage: "SEED"
     * contactPerson: From applicantName
     * contactPhone: From applicantPhone
     * contactEmail: From applicantEmail
   - Send email with login credentials (if user was just created)

#### **Database Models:**
- `User` - User account (created automatically)
- `PortfolioCompany` - Portfolio company (created automatically)
- `TermSheet` - Updated to SIGNED status

#### **Endpoints:**
- `POST /api/term-sheets/:applicationId/sign` - Sign term sheet (applicant)

#### **Next Stage:**
- Application moves to `INVESTMENT_IMPLEMENTATION` stage

---

### **STAGE 7: INVESTMENT IMPLEMENTATION** (Protected - Admin/Fund Manager)

#### **Entry Point:**
- **Endpoint:** `POST /api/investment-implementations/initiate`
- **Service:** `InvestmentImplementationService.initiateInvestmentImplementation()`
- **File:** `src/services/InvestmentImplementationService.ts`

#### **What Happens:**
1. **Get Signed Term Sheets:**
   - Admin views applications with signed term sheets
   - Applications in `INVESTMENT_IMPLEMENTATION` stage

2. **Initiate Implementation:**
   - Application must have signed term sheet
   - Application must be in `INVESTMENT_IMPLEMENTATION` stage
   - Portfolio company must exist
   - Creates InvestmentImplementation record
   - Status: `IN_PROGRESS`
   - Links to portfolio company, application, and fund

3. **Implementation Checklist:**
   - `finalDueDiligence: boolean` - Final due diligence completed
   - `contractsSigned: boolean` - Legal contracts signed
   - `fundsDisbursed: boolean` - Funds disbursed to company
   - `notes: string` - Additional notes

4. **Milestones:**
   - Create milestones with:
     * Title, description, amount, due date
     * Deliverables
   - Complete milestones when deliverables are met

#### **Database Models:**
- `InvestmentImplementation` - Implementation tracking record
- `InvestmentMilestone` - Implementation milestones

#### **Endpoints:**
- `GET /api/investment-implementations/signed-term-sheets` - Get ready for implementation
- `POST /api/investment-implementations/initiate` - Start implementation
- `GET /api/investment-implementations/:portfolioCompanyId` - Get implementation
- `PUT /api/investment-implementations/:portfolioCompanyId/checklist` - Update checklist
- `POST /api/investment-implementations/:portfolioCompanyId/milestones` - Add milestone
- `POST /api/investment-implementations/milestones/:milestoneId/complete` - Complete milestone

#### **Next Stage:**
- Implementation moves to fund disbursement when ready

---

### **STAGE 8: FUND DISBURSEMENT** (Protected - Admin/Fund Manager)

#### **Entry Point:**
- **Endpoint:** `POST /api/investment-implementations/disbursements`
- **Service:** `InvestmentImplementationService.createFundDisbursement()`
- **File:** `src/services/InvestmentImplementationService.ts`

#### **What Happens:**
1. **Create Disbursement:**
   - Investment implementation ID
   - Milestone ID (optional)
   - Amount
   - Disbursement date
   - Type: INITIAL, MILESTONE, or FINAL
   - Notes
   - Status: `PENDING`

2. **Approve Disbursement:**
   - **Endpoint:** `POST /api/investment-implementations/disbursements/:disbursementId/approve`
   - **Service:** `InvestmentImplementationService.approveFundDisbursement()`
   - **File:** `src/services/InvestmentImplementationService.ts` (lines 543-686)

   **Process:**
   - Validates fund has sufficient remaining amount
   - Gets Portfolio Investments account (1501) for GL payment
   - Gets Main Bank Account (1010) - finds Bank record linked to GL account
   - **Creates cashbook payment entry** via `CashbookService.createCashPayment()`
     * This automatically creates a journal entry:
       - Debit: 1501 - Portfolio Investments (investment increases)
       - Credit: 1010 - Main Bank Account (cash decreases)
   - Updates journal entry description to "Bank Payment: Fund Disbursement - {Company} - ${amount}"
   - Updates disbursement status to `APPROVED`
   - Updates fund remaining amount (subtracts disbursed amount)
   - Links disbursement to cashbook entry

3. **Mark as Disbursed:**
   - **Endpoint:** `POST /api/investment-implementations/disbursements/:disbursementId/disburse`
   - **Service:** `InvestmentImplementationService.markDisbursementAsDisbursed()`
   - **File:** `src/services/InvestmentImplementationService.ts` (lines 691-775)

   **Process:**
   - Disbursement must be `APPROVED`
   - Updates status to `DISBURSED`
   - Sets `disbursedAt` timestamp
   - Sets `transactionReference` (optional)
   - If all disbursements are disbursed:
     * Updates implementation `fundsDisbursed: true`
     * Updates implementation status to `COMPLETED`
     * Updates application stage to `DISBURSED`

#### **Database Models:**
- `FundDisbursement` - Disbursement record
- `CashbookEntry` - Cashbook payment entry (created automatically)
- `JournalEntry` - Journal entry (created automatically via CashbookService)
- `JournalEntryLine` - Journal entry lines (debit/credit)

#### **Endpoints:**
- `POST /api/investment-implementations/disbursements` - Create disbursement
- `POST /api/investment-implementations/disbursements/:disbursementId/approve` - Approve
- `POST /api/investment-implementations/disbursements/:disbursementId/disburse` - Mark disbursed

#### **Next Stage:**
- Application moves to `DISBURSED` when all funds are disbursed

---

### **STAGE 9: PORTFOLIO COMPANY MANAGEMENT** (Protected - Applicant/Admin)

#### **Entry Point:**
- **Endpoint:** `GET /api/portfolio-companies/me` (Applicant)
- **Endpoint:** `GET /api/portfolio-companies` (Admin)
- **Service:** `PortfolioCompanyService.getCurrentUserPortfolioCompany()` or `getAllPortfolioCompanies()`
- **File:** `src/services/PortfolioCompanyService.ts`

#### **What Happens:**
1. **Applicant Access:**
   - View portfolio company profile
   - Update company information
   - View investment details
   - Track implementation progress

2. **Admin Access:**
   - View all portfolio companies
   - Create portfolio companies manually
   - Update company information
   - View investment amounts and disbursements

3. **Portfolio Company Data:**
   - Company profile (name, industry, address, etc.)
   - Investment details (total invested, disbursements)
   - Fund association
   - Cap table (JSON)
   - Financial KPIs (JSON)
   - Financial history Excel (file info)
   - E-signature data

#### **Database Models:**
- `PortfolioCompany` - Portfolio company record
- `User` - User account (linked to portfolio company)

#### **Endpoints:**
- `GET /api/portfolio-companies/me` - Get current user's company (applicant)
- `PUT /api/portfolio-companies/me` - Update current user's company (applicant)
- `GET /api/portfolio-companies` - Get all companies (admin)
- `POST /api/portfolio-companies/admin` - Create by admin
- `GET /api/portfolio-companies/:id` - Get by ID
- `PUT /api/portfolio-companies/:id` - Update company

#### **Next Stage:**
- Portfolio company continues to be managed throughout investment lifecycle

---

### **STAGE 10: PORTFOLIO VALUATION** (Protected - Admin/CEO/CFO)

#### **Entry Point:**
- **Endpoint:** `POST /api/portfolio-valuations`
- **Service:** `PortfolioValuationService.createValuation()`
- **File:** `src/services/PortfolioValuationService.ts`

#### **What Happens:**
1. **Create Valuation:**
   - Portfolio company ID
   - Valuation date
   - Valuation amount
   - Valuation method
   - Notes

2. **Valuation Management:**
   - Track valuation activities
   - Quarterly summaries
   - Analytics and reporting

#### **Database Models:**
- `PortfolioValuation` - Valuation record
- `PortfolioValuationActivity` - Valuation activities

#### **Endpoints:**
- `POST /api/portfolio-valuations` - Create valuation
- `GET /api/portfolio-valuations` - Get all valuations
- `GET /api/portfolio-valuations/:id` - Get by ID
- `PUT /api/portfolio-valuations/:id` - Update valuation
- `DELETE /api/portfolio-valuations/:id` - Delete valuation
- `GET /api/portfolio-valuations/summary/quarterly` - Quarterly summary

---

## 🔄 APPLICATION STAGE FLOW

### **Stage Transitions:**
1. **PENDING_SHORTLISTING** → Initial application received
2. **SHORTLISTED** → Application reviewed and shortlisted
3. **UNDER_DUE_DILIGENCE** → Due diligence in progress
4. **DUE_DILIGENCE_COMPLETED** → Due diligence finished
5. **UNDER_BOARD_REVIEW** → Under board consideration
6. **BOARD_APPROVED** → Investment approved by board
7. **BOARD_REJECTED** → Application rejected by board
8. **BOARD_CONDITIONAL** → Approved with conditions
9. **TERM_SHEET** / **TERM_SHEET_NEGOTIATION** → Term sheet being negotiated
10. **INVESTMENT_IMPLEMENTATION** → Investment implementation in progress
11. **DISBURSED** → Investment completed and funded
12. **REJECTED** → Application rejected at any stage

### **Portfolio Company Status:**
- **PENDING** - Awaiting final setup
- **ACTIVE** - Fully operational
- **SUSPENDED** - Temporarily suspended
- **TERMINATED** - Relationship ended

---

## 🔐 AUTHENTICATION & AUTHORIZATION

### **Public Endpoints (No Auth):**
- `POST /api/applications` - Submit application
- `GET /api/applications/:id/status` - Check status

### **Applicant Endpoints (Auth Required - "applicant" role):**
- All `/api/applicant/*` endpoints
- `GET /api/portfolio-companies/me`
- `PUT /api/portfolio-companies/me`
- `POST /api/term-sheets/:applicationId/sign`
- `GET /api/term-sheets/my`

### **Admin/Fund Manager Endpoints (Auth Required):**
- All `/api/applications/*` (except public ones)
- All `/api/due-diligence/*`
- All `/api/board-reviews/*`
- All `/api/term-sheets/*` (except applicant ones)
- All `/api/investment-implementations/*`
- All `/api/portfolio-companies/*` (admin endpoints)
- All `/api/portfolio-valuations/*`

---

## 📧 EMAIL NOTIFICATIONS

### **Automated Emails:**
1. **Application Received** - Sent to applicant when application is submitted
2. **Admin Notification** - Sent to admin when new application is received
3. **Account Created** - Sent to applicant when user account is created (includes temporary password)
4. **Status Updates** - Sent when application stage changes
5. **Due Diligence Completion** - Sent when due diligence is completed
6. **Board Decision** - Sent when board makes decision
7. **Term Sheet Finalized** - Sent when term sheet is marked as final
8. **Term Sheet Signed** - Sent when term sheet is signed
9. **Investment Implementation Started** - Sent when implementation begins

---

## 🗄️ DATABASE MODELS

### **Core Models:**
1. **Application** - Main application data
2. **ApplicationDocument** - Uploaded documents
3. **ApplicationNotification** - Email notifications
4. **DueDiligenceReview** - Due diligence assessment
5. **BoardReview** - Board review and decision
6. **BoardReviewVote** - Individual board member votes
7. **TermSheet** - Investment terms
8. **User** - User accounts (created automatically)
9. **PortfolioCompany** - Portfolio company profiles (created automatically)
10. **InvestmentImplementation** - Implementation tracking
11. **InvestmentMilestone** - Implementation milestones
12. **FundDisbursement** - Fund disbursement records
13. **CashbookEntry** - Cashbook payment entries (created automatically)
14. **JournalEntry** - Journal entries (created automatically)
15. **JournalEntryLine** - Journal entry lines (debit/credit)
16. **PortfolioValuation** - Valuation records
17. **PortfolioValuationActivity** - Valuation activities

---

## 🎯 KEY FEATURES

### **✅ Public Application Portal:**
- No authentication required for submission
- Comprehensive application form
- Document upload functionality
- Email confirmations

### **✅ Admin Review System:**
- Protected admin dashboard
- Application filtering and pagination
- Document review capabilities
- Stage management
- Reviewer assignment

### **✅ Automated Workflow:**
- Automatic stage transitions
- **Automatic user creation** upon board approval
- **Automatic portfolio company creation** upon board approval
- Automatic email notifications
- Automatic journal entries for fund disbursements

### **✅ Due Diligence Process:**
- Comprehensive assessment areas
- Scoring system (0-100%)
- Recommendation tracking
- One review per application

### **✅ Board Review Process:**
- Three decision options (Approve/Reject/Conditional)
- Board voting system with voting power
- Recommendation reports
- Decision reasoning
- Conditional approval handling

### **✅ Term Sheet Management:**
- Draft → Final → Signed workflow
- Version control
- Document attachment
- Applicant signing capability

### **✅ Investment Implementation:**
- Checklist tracking
- Milestone management
- Fund disbursement workflow
- Approval and disbursement tracking
- **Automatic cashbook and journal entry creation**

### **✅ Portfolio Management:**
- Company profile management
- Valuation tracking
- Performance reporting
- Cap table management
- Investment tracking

---

## 🔗 KEY INTEGRATIONS

### **Cashbook Integration:**
- When fund disbursement is approved, a cashbook payment entry is automatically created
- This triggers automatic journal entry creation:
  - Debit: Portfolio Investments (1501)
  - Credit: Main Bank Account (1010)
- Journal entry description uses "Bank Payment" format

### **Accounting Integration:**
- All fund disbursements are automatically recorded in the accounting system
- Journal entries are created via CashbookService
- Balance sheet and cash flow statements reflect portfolio investments

---

## 🚀 SUMMARY

The Portfolio Module provides a **complete end-to-end investment management system** that:

1. **Allows public application submission** without authentication
2. **Manages applications** through multiple review stages
3. **Automates due diligence and board review** processes
4. **Handles term sheet negotiation** and signing
5. **Automatically creates user accounts** and portfolio companies upon board approval
6. **Tracks investment implementation** with milestones and disbursements
7. **Automatically creates accounting entries** for fund disbursements
8. **Manages portfolio companies** with valuations and reporting
9. **Provides email notifications** throughout the entire process

**✅ The system is fully automated from application submission to portfolio company management and fund disbursement!** 🚀

---

## 📝 NOTES

- User and portfolio company creation happens automatically when board review is completed with approval (not when term sheet is signed)
- Fund disbursements automatically create cashbook entries and journal entries
- All accounting entries use "Bank Payment" or "Bank Receipt" descriptions (not "Cashbook")
- Portfolio investments are tracked in account 1501 (Portfolio Investments)
- Bank account is tracked in account 1010 (Main Bank Account)

