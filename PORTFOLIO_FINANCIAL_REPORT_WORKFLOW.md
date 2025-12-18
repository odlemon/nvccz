# Portfolio Company Financial Report Workflow

## 📋 Overview

This document explains how portfolio companies submit financial reports to investors for review, and how investors review and process these reports.

---

## 🔄 Complete Workflow

```
1. Portfolio Company Uploads Report (DRAFT)
   ↓
2. Portfolio Company Submits Report (PENDING)
   ↓
3. Investors Receive Notification
   ↓
4. Investor Reviews Report
   ↓
5. Investor Accepts or Rejects
   ↓
6. If Accepted: Report Processed & Automations Run
   ↓
7. Portfolio Company Receives Notification
```

---

## 📤 Step 1: Portfolio Company Uploads Financial Report

### **Endpoint:** `POST /api/applicant/financial-reports`

**Controller:** `ApplicantPortalController.uploadFinancialReport()`

**Service:** `FinancialReportService.createReport()`

### **Process:**
1. Portfolio company user (applicant) uploads a financial report file
2. File is uploaded to remote server via `FirebaseStorageService.uploadFinancialReport()`
3. Report is created in database with status: **`DRAFT`**
4. Report can be edited/deleted while in DRAFT status

### **Request Body:**
```json
{
  "reportType": "BALANCE_SHEET" | "INCOME_STATEMENT" | "CASHFLOW_STATEMENT",
  "periodType": "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL",
  "periodStart": "2024-01-01",
  "periodEnd": "2024-03-31",
  "title": "Q1 2024 Financial Report",
  "description": "Optional description",
  "templateVersion": "v1"
}
```

### **File Upload:**
- Multipart form data
- File field name: `file`
- Supported formats: CSV, PDF, Excel

### **Database Record:**
- Status: `DRAFT`
- `submittedById`: Portfolio company user ID
- `portfolioCompanyId`: Auto-detected from user's portfolio company
- `reportUrl`: URL to uploaded file
- `storagePath`: Path to file on storage server

---

## 📝 Step 2: Portfolio Company Submits Report for Review

### **Endpoint:** `POST /api/applicant/financial-reports/submit`

**Controller:** `ApplicantPortalController.submitFinancialReport()`

**Service:** `FinancialReportService.submitDrafts()`

### **Process:**
1. Portfolio company submits one or more DRAFT reports
2. Status changes from `DRAFT` → **`PENDING`**
3. Email notifications sent to investment team
4. Report becomes visible to investors for review

### **Request Body:**
```json
{
  "reportIds": ["report-id-1", "report-id-2"]
}
```

### **Validation:**
- Only reports with status `DRAFT` or `NEEDS_REVISION` can be submitted
- User must own the reports (submittedById must match)
- All reports must exist

### **Notifications:**
- Email sent to all users in Investments department with roles:
  - `BOARD_CHAIR`
  - `CIO`
  - `INV_ANALYST`
- Email includes:
  - Company name
  - Report type
  - Period (start/end dates)
  - Title

---

## 👀 Step 3: Investors View Reports

### **Endpoint:** `GET /api/portfolio-companies/{id}/financial-reports`

**Controller:** `PortfolioCompanyController.getFinancialReports()`

**Service:** `FinancialReportService.listReportsForCompany()`

### **Response:**
- Lists all submitted reports (status ≠ `DRAFT`)
- Includes:
  - Report details (type, period, title)
  - Submitted by user info
  - Current status
  - Created/updated timestamps

---

## 📥 Step 4: Investor Downloads Report

### **Endpoint:** `GET /api/portfolio-companies/{id}/financial-reports/{reportId}/download`

**Controller:** `PortfolioCompanyController.downloadFinancialReport()`

**Service:** `FirebaseStorageService.downloadImportFile()`

### **Process:**
1. Investor requests report download
2. File is downloaded from storage server
3. File streamed to investor
4. Only non-DRAFT reports can be downloaded

---

## ✅ Step 5: Investor Reviews Report

### **Endpoint:** `POST /api/portfolio-companies/{id}/financial-reports/{reportId}/review`

**Controller:** `PortfolioCompanyController.reviewFinancialReport()`

**Service:** `FinancialReportService.reviewReport()`

### **Request Body:**
```json
{
  "action": "ACCEPT" | "REJECT",
  "comment": "Optional review comment",
  "mapping": {
    "valuationAdjustment": {
      "previousAmount": 1000000,
      "newAmount": 1200000,
      "valuationDate": "2024-03-31",
      "notes": "Valuation increased based on Q1 performance"
    },
    "dividends": [
      {
        "amount": 50000,
        "dividendDate": "2024-03-31",
        "notes": "Q1 dividend payment"
      }
    ]
  }
}
```

### **Process:**

#### **If ACCEPTED:**
1. Status changes: `PENDING` → **`ACCEPTED`**
2. `reviewerId` set to investor user ID
3. `reviewedAt` timestamp recorded
4. `reviewerComment` saved
5. `mappingSnapshot` saved (for automations)

6. **Report Processing:**
   - `FinancialReportProcessingService.process()` is called
   - CSV file is parsed and validated
   - Financial data extracted and stored
   - KPIs updated

7. **Post-Approval Automations:**
   - **Valuation Adjustments:**
     - If `mapping.valuationAdjustment` provided
     - Creates valuation record via `PortfolioCompanyAccountingService.recordValuationAdjustment()`
     - Updates portfolio company valuation
   
   - **Dividends:**
     - If `mapping.dividends` provided
     - Creates dividend records via `PortfolioCompanyAccountingService.recordDividend()`
     - Records dividend payments
   
   - **Auto Valuation (Balance Sheet only):**
     - If no manual valuation provided
     - Calculates from shareholders equity
     - Compares with previous valuation
     - Creates valuation adjustment if difference > $0.01

8. **Email Notification:**
   - Sent to portfolio company contact email
   - Confirms report acceptance
   - Includes reviewer comment

#### **If REJECTED:**
1. Status changes: `PENDING` → **`REJECTED``
2. `reviewerId` set to investor user ID
3. `reviewedAt` timestamp recorded
4. `reviewerComment` saved
5. Status can be changed to `NEEDS_REVISION` if processing fails
6. **Email Notification:**
   - Sent to portfolio company contact email
   - Explains rejection reason
   - Company can revise and resubmit

---

## 🔄 Step 6: Portfolio Company Views Status

### **Endpoint:** `GET /api/applicant/financial-reports`

**Controller:** `ApplicantPortalController.getFinancialReports()`

**Service:** `FinancialReportService.listReportsForApplicant()`

### **Response:**
- Lists all reports for user's portfolio company
- Includes status information:
  - `isDraft`: true if status is DRAFT
  - `canSubmit`: true if status is DRAFT or NEEDS_REVISION
  - `canDownload`: true if status is not DRAFT

---

## 📊 Report Status Flow

```
DRAFT
  ↓ (submit)
PENDING
  ↓ (review)
ACCEPTED or REJECTED
  ↓ (if processing fails)
NEEDS_REVISION
  ↓ (resubmit)
PENDING
```

---

## 🔧 Key Services

### **FinancialReportService**
- `createReport()` - Create new report (DRAFT)
- `submitDrafts()` - Submit reports for review (DRAFT → PENDING)
- `reviewReport()` - Accept/reject reports (PENDING → ACCEPTED/REJECTED)
- `listReportsForApplicant()` - Get reports for portfolio company
- `listReportsForCompany()` - Get reports for investor view
- `getReportById()` - Get single report details

### **FinancialReportProcessingService**
- `process()` - Parse CSV, extract data, update KPIs
- Called automatically when report is ACCEPTED

### **PortfolioCompanyAccountingService**
- `recordValuationAdjustment()` - Record valuation changes
- `recordDividend()` - Record dividend payments
- Called automatically based on review mapping

### **EmailNotificationService**
- `sendFinancialReportSubmittedEmail()` - Notify investors of new submission
- `sendFinancialReportAcceptedEmail()` - Notify company of acceptance
- `sendFinancialReportRejectedEmail()` - Notify company of rejection

---

## 📁 File Storage

### **Upload:**
- Files uploaded via `FirebaseStorageService.uploadFinancialReport()`
- Now uses `RemoteUploadService` (custom Ubuntu server)
- Storage path: `financial-reports/{portfolioCompanyId}/{reportId}/{fileName}`

### **Download:**
- Files downloaded via `FirebaseStorageService.downloadImportFile()`
- Now uses `RemoteUploadService.downloadFile()`
- Files served from: `http://31.220.82.129/uploads/financial-reports/...`

---

## 🎯 Report Types

1. **BALANCE_SHEET**
   - Assets, Liabilities, Equity
   - Can trigger auto-valuation from shareholders equity

2. **INCOME_STATEMENT**
   - Revenue, Expenses, Net Income
   - Updates revenue KPIs

3. **CASHFLOW_STATEMENT**
   - Operating, Investing, Financing activities
   - Updates cash flow KPIs

---

## 📧 Email Notifications

### **To Investors (on submission):**
- Recipients: Investment team (BOARD_CHAIR, CIO, INV_ANALYST)
- Subject: "New Financial Report Submitted - {Company Name}"
- Includes: Report type, period, title

### **To Portfolio Company (on acceptance):**
- Recipient: Portfolio company contact email
- Subject: "Financial Report Accepted - {Company Name}"
- Includes: Report details, reviewer comment

### **To Portfolio Company (on rejection):**
- Recipient: Portfolio company contact email
- Subject: "Financial Report Update Needed - {Company Name}"
- Includes: Rejection reason, instructions to revise

---

## 🔐 Access Control

### **Portfolio Company (Applicant):**
- Can upload reports (DRAFT)
- Can submit their own reports
- Can view their own reports
- Can download submitted reports
- Cannot review/accept/reject reports

### **Investors:**
- Can view all submitted reports
- Can download reports
- Can review and accept/reject reports
- Must be authenticated
- Typically in Investments department

---

## 🚀 Automation Features

### **1. Valuation Adjustment**
- Manual: Investor provides in review mapping
- Automatic: Calculated from balance sheet equity (if no manual provided)

### **2. Dividend Recording**
- Investor provides dividend details in review mapping
- Automatically recorded in accounting system

### **3. KPI Updates**
- Financial data extracted from CSV
- KPIs automatically updated
- Historical data tracked

---

## 📝 Example Workflow

1. **Portfolio Company:**
   ```
   POST /api/applicant/financial-reports
   - Uploads Q1 2024 Balance Sheet (DRAFT)
   - Reviews draft, makes edits
   - Submits for review (PENDING)
   ```

2. **Investor:**
   ```
   GET /api/portfolio-companies/{id}/financial-reports
   - Sees new PENDING report
   - Downloads report
   - Reviews financial data
   ```

3. **Investor Reviews:**
   ```
   POST /api/portfolio-companies/{id}/financial-reports/{reportId}/review
   {
     "action": "ACCEPT",
     "comment": "All figures verified",
     "mapping": {
       "valuationAdjustment": {
         "newAmount": 1500000,
         "previousAmount": 1200000
       }
     }
   }
   ```

4. **System Automatically:**
   - Processes report data
   - Updates valuation to $1.5M
   - Updates KPIs
   - Sends acceptance email to company

5. **Portfolio Company:**
   ```
   GET /api/applicant/financial-reports
   - Sees report status: ACCEPTED
   - Receives email confirmation
   ```

---

## ✅ Summary

The financial report workflow enables:
- ✅ Portfolio companies to submit financial reports
- ✅ Investors to review and approve/reject reports
- ✅ Automatic processing and KPI updates
- ✅ Valuation and dividend automations
- ✅ Email notifications at each stage
- ✅ Complete audit trail of submissions and reviews


