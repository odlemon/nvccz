# 🔍 **ESSENTIAL DATA ANALYSIS FOR PRODUCTION**

## 📋 **OVERVIEW**

This document identifies all essential data that must be preserved when cleaning the database for production deployment. All other data can be safely deleted.

---

## ✅ **ESSENTIAL DATA (MUST PRESERVE)**

### **1. User Management**
- **Admin User**: `admin@nvccz.co.zw`
  - Email: `admin@nvccz.co.zw`
  - Password: `admin123` (hashed)
  - Role: `admin`
  - Department: `Operations`
  - **Action**: Preserve this user only, delete all other users

### **2. Roles & Permissions**
- **Admin Role**: Role with `name = 'admin'`
- **All Hardcoded Roles**: All 40 hardcoded roles (5 per department)
  - Finance Manager, Finance Officer, Finance Specialist, Finance Assistant, Finance Member
  - Sales Manager, Sales Officer, Sales Specialist, Sales Assistant, Sales Member
  - Operations Manager, Operations Officer, Operations Specialist, Operations Assistant, Operations Member
  - Procurement Manager, Procurement Officer, Procurement Specialist, Procurement Assistant, Procurement Member
  - HR Manager, HR Officer, HR Specialist, HR Assistant, HR Member
  - Marketing Manager, Marketing Officer, Marketing Specialist, Marketing Assistant, Marketing Member
  - Legal Manager, Legal Officer, Legal Specialist, Legal Assistant, Legal Member
  - IT Manager, IT Officer, IT Specialist, IT Assistant, IT Member
  - **Action**: Preserve all roles

### **3. Departments**
- **All 8 Hardcoded Departments**:
  - Finance
  - Sales
  - Operations
  - Procurement
  - Human Resources
  - Marketing
  - Legal
  - IT
  - **Action**: Preserve all departments

### **4. Currencies**
- **USD** (US Dollar)
- **ZWL** (Zimbabwean Dollar)
- **Action**: Preserve all currencies

### **5. Chart of Accounts**
- **All Chart of Accounts**: Complete chart of accounts structure
  - Assets (1000s): Cash, Equipment, Receivables, etc.
  - Liabilities (2000s): Payables, Accruals, Loans, etc.
  - Equity (3000s): Share Capital, Retained Earnings, etc.
  - Revenue (4000s): Management Fees, Investment Gains, etc.
  - Operating Expenses (5000s): Salaries, Rent, Travel, etc.
  - **Action**: Preserve all chart of accounts

### **6. KPIs (Key Performance Indicators)**
- **All 27 Hardcoded KPIs**: Performance tracking KPIs
  - 10 Finance KPIs
  - 5 Sales KPIs
  - 2 Operations KPIs
  - 5 Procurement KPIs
  - 5 HR KPIs
  - **Action**: Preserve all KPIs

### **7. Master Data (Essential for System Functionality)**
- **Banks**: All bank account records (required for cashbook to function)
- **Expense Categories**: All expense category records (required for expense management)
- **Revenue Sources**: All revenue source records (required for revenue tracking)
- **Revenue Categories**: All revenue category records (required for revenue categorization)
- **Action**: Preserve banks, expense categories, revenue sources, and revenue categories

### **8. System Configuration (Essential)**
- **Procurement Approval Configs**: Approval workflow configurations
- **Procurement Approval Stages**: Approval stage configurations
- **Tax Rules**: Payroll tax calculation rules
- **Allowance Types**: Payroll allowance type definitions
- **Deduction Types**: Payroll deduction type definitions
- **Salary Structures**: Payroll salary structure definitions
- **Cashbook Entry Type Configs**: Cashbook entry type configurations
- **Reference Number Configs**: Auto-increment reference number configurations
- **Cashbook Templates**: Cashbook entry templates
- **Contra Entry Configs**: Contra entry configurations
- **Discount Configs**: Customer/vendor discount configurations
- **Period Lockouts**: Accounting period lockout configurations
- **Accounting Periods**: Accounting period definitions
- **Action**: Preserve all configuration data

---

## ❌ **NON-ESSENTIAL DATA (CAN BE DELETED)**

### **1. Users**
- All users except `admin@nvccz.co.zw`
- **Action**: Delete all other users

### **2. Transactions & Accounting Data**
- **Journal Entries**: All journal entries and journal entry lines
- **Expenses**: All expense records
- **Invoices**: All invoices (sales and purchase)
- **Revenues**: All revenue records
- **Cashbook Entries**: All cashbook transactions
- **Bank Reconciliations**: All bank reconciliation records
- **Payment Allocations**: All payment allocations
- **Cashbook Transfers**: All cashbook transfers
- **Cashbook Batches**: All cashbook import batches
- **Bank Statements**: All bank statements
- **Reconciliation Mismatches**: All reconciliation mismatches
- **Contra Entries**: All contra entries
- **Action**: Delete all transaction data

### **3. Customers & Vendors**
- **Customers**: All customer records (can be recreated)
- **Vendors**: All vendor records (can be recreated)
- **Action**: DELETE all customers and vendors (they can be recreated as needed)

### **4. Portfolio Management**
- **Applications**: All investment applications
- **Portfolio Companies**: All portfolio company records
- **Funds**: All fund records
- **Clients**: All client records
- **Investment Commitments**: All investment commitments
- **Fund Managers**: All fund manager records
- **Due Diligence Reviews**: All due diligence reviews
- **Board Reviews**: All board reviews
- **Term Sheets**: All term sheets
- **Investment Implementations**: All investment implementations
- **Fund Disbursements**: All fund disbursements
- **Action**: Delete all portfolio management data

### **5. Performance Management**
- **Performance Goals**: All performance goals
- **Tasks**: All task records
- **Activities**: All activity records
- **Activity Logs**: All activity log records
- **Performance Reviews**: All performance reviews
- **Performance Review Cycles**: All review cycles
- **Performance Review Feedback**: All review feedback
- **External Data**: All external data records
- **Action**: Delete all performance management data

### **6. Procurement**
- **Purchase Requisitions**: All purchase requisitions
- **Purchase Orders**: All purchase orders
- **Vendor Quotations**: All vendor quotations
- **Procurement Invoices**: All procurement invoices
- **Purchase Invoices**: All purchase invoices
- **Goods Received Notes (GRNs)**: All GRN records
- **Approval Requests**: All approval requests
- **Approvals**: All approval records
- **Procurement Approval Configs**: All approval configurations (optional - can preserve)
- **Action**: Delete all procurement transaction data

### **7. Payroll**
- **Employees**: All employee records
- **Payroll Runs**: All payroll run records
- **Employee Payroll**: All employee payroll records
- **Payslips**: All payslip records
- **Leave Balances**: All leave balance records
- **Salary Structures**: All salary structure records
- **Tax Rules**: All tax rule records (optional - can preserve)
- **Allowance Types**: All allowance type records (optional - can preserve)
- **Deduction Types**: All deduction type records (optional - can preserve)
- **Action**: Delete all payroll transaction data

### **8. Inventory**
- **Inventory Items**: All inventory item records
- **Stock Movements**: All stock movement records
- **Action**: Delete all inventory data

### **9. Assets**
- **Assets**: All asset records
- **Depreciation Records**: All depreciation records
- **Asset Disposal Records**: All asset disposal records
- **Action**: Delete all asset data

### **10. Financial Reports**
- **Credit Notes**: All credit note records
- **Statements of Account**: All statement records
- **Exchange Rates**: All exchange rate records (optional - can preserve base rates)
- **Forex Gain/Loss**: All forex gain/loss records
- **Action**: Delete all financial report data

### **11. Content & Communication**
- **Posts**: All post records
- **Replies**: All reply records
- **Newsletters**: All newsletter records
- **Newsletter Subscriptions**: All newsletter subscription records
- **Newsletter Topics**: All newsletter topic records
- **Events**: All event records
- **Event Guests**: All event guest records
- **Event Budget Items**: All event budget item records
- **Event Expenses**: All event expense records
- **Event Feedback**: All event feedback records
- **Event Check-Ins**: All event check-in records
- **Event Reports**: All event report records
- **Action**: Delete all content and communication data

### **12. Notifications & Activity**
- **Notifications**: All notification records
- **User Activity**: All user activity records
- **Audit Logs**: All audit log records
- **Action**: Delete all notification and activity data

### **13. Stakeholder Management**
- **Stakeholders**: All stakeholder records
- **Stakeholder Onboarding**: All onboarding records
- **Stakeholder Engagement**: All engagement records
- **Action**: Delete all stakeholder data

### **14. Reporting & Analytics**
- **Report Templates**: All report template records
- **Generated Reports**: All generated report records
- **Variance Reports**: All variance report records
- **Turnover Analysis Reports**: All turnover analysis reports
- **Action**: Delete all report data

### **15. Deal Management**
- **Deal Sourcing Goals**: All deal sourcing goal records
- **Deal Progress**: All deal progress records
- **Deal Progress Updates**: All deal progress update records
- **Research Reports**: All research report records
- **Research Report Activities**: All research report activity records
- **Action**: Delete all deal management data

### **16. Risk Management**
- **Risk Assessments**: All risk assessment records
- **Risk Assessment Sub Tasks**: All risk assessment sub task records
- **Risk Assessment History**: All risk assessment history records
- **Action**: Delete all risk management data

### **17. Budget Management**
- **Budgets**: All budget records
- **Budget Items**: All budget item records
- **Action**: Delete all budget data

### **18. Portfolio Valuation**
- **Portfolio Valuations**: All portfolio valuation records
- **Portfolio Valuation Activities**: All portfolio valuation activity records
- **Action**: Delete all portfolio valuation data

### **19. Exit Interviews**
- **Exit Interviews**: All exit interview records
- **Action**: Delete all exit interview data

### **20. Company Profile**
- **Company Profiles**: All company profile records
- **Mini KYC**: All mini KYC records
- **Documents**: All document records
- **Action**: Delete all company profile data

### **21. Targets**
- **Targets**: All target records
- **Action**: Delete all target data

### **22. Banks**
- **Note**: Banks are MASTER DATA, required for cashbook functionality
- **Action**: PRESERVE all bank records (essential for system functionality)

### **23. Expense Categories**
- **Note**: Expense Categories are MASTER DATA, required for expense management
- **Action**: PRESERVE all expense categories (essential for system functionality)

### **24. Revenue Sources & Categories**
- **Note**: Revenue Sources and Categories are MASTER DATA, required for revenue tracking
- **Action**: PRESERVE all revenue sources and categories (essential for system functionality)

---

## 🎯 **CLEANUP STRATEGY**

### **Phase 1: Identify Essential Data**
1. Find admin user by email: `admin@nvccz.co.zw`
2. Find admin role by name: `admin`
3. Find all departments
4. Find all roles
5. Find all currencies (USD, ZWL)
6. Find all chart of accounts
7. Find all KPIs

### **Phase 2: Delete Non-Essential Data**
1. Delete all users except admin
2. Delete all transactions (journal entries, expenses, invoices, etc.)
3. Delete all portfolio management data
4. Delete all performance management data
5. Delete all procurement data
6. Delete all payroll data
7. Delete all inventory and asset data
8. Delete all content and communication data
9. Delete all other operational data

### **Phase 3: Verify Essential Data**
1. Verify admin user exists
2. Verify admin role exists
3. Verify all departments exist
4. Verify all roles exist
5. Verify currencies exist
6. Verify chart of accounts exists
7. Verify KPIs exist

---

## 📊 **SUMMARY**

### **Essential Data Count (Approximate)**
- **Users**: 1 (admin only)
- **Roles**: ~41 (1 admin + 40 hardcoded)
- **Departments**: 8
- **Currencies**: 2
- **Chart of Accounts**: ~50-60 accounts
- **KPIs**: 27
- **Banks**: Variable (master data)
- **Expense Categories**: ~5 (master data)
- **Revenue Sources**: Variable (master data)
- **Revenue Categories**: Variable (master data)
- **Configuration Data**: Variable (approval configs, tax rules, etc.)

### **Total Essential Records**: ~130-140 core records + variable master data + configuration data

### **Non-Essential Data**
- Everything else (potentially thousands of records)

---

## ⚠️ **IMPORTANT NOTES**

1. **Backup First**: Always backup the database before running cleanup
2. **Test Environment**: Test the cleanup script in a test environment first
3. **Dependencies**: Be aware of foreign key constraints when deleting data
4. **Cascade Deletes**: Some models have cascade deletes, which will automatically delete related records
5. **Transaction Safety**: Run cleanup in a transaction to ensure atomicity
6. **Verification**: Always verify essential data after cleanup

---

## 🚀 **NEXT STEPS**

1. Create cleanup script that preserves essential data
2. Test cleanup script in test environment
3. Run cleanup script in production
4. Verify essential data is preserved
5. Re-seed any optional data if needed

