# 📊 Core Accounting Module - Complete Overview

## 🎯 **Module Overview**

The Core Accounting Module is a comprehensive double-entry bookkeeping system that provides complete financial management capabilities for the NVCCZ platform. It follows standard accounting principles and integrates seamlessly with all other business modules.

## 🏗️ **Architecture & Structure**

### **Core Components**

#### **1. Database Schema (Prisma Models)**
- **`ChartOfAccounts`** - Master chart of accounts with hierarchical structure
- **`JournalEntry`** - Core transaction records
- **`JournalEntryLine`** - Individual debit/credit entries
- **`Expense`** - Expense management with automatic journal entries
- **`Invoice`** - Invoice management with payment tracking
- **`Customer`** - Customer relationship management
- **`Vendor`** - Vendor management
- **`Currency`** - Multi-currency support
- **`ExpenseCategory`** - Expense categorization
- **`Revenue`** - Revenue tracking
- **`RevenueSource`** - Revenue source management

#### **2. Service Layer**
- **`JournalEntryService`** - Core double-entry bookkeeping logic
- **`ExpenseService`** - Expense management with automatic journal entries
- **`InvoiceService`** - Invoice lifecycle management
- **`IncomeStatementService`** - Financial reporting
- **`CashFlowService`** - Cash flow analysis
- **`VATService`** - Tax calculation and compliance
- **`BankReconciliationService`** - Bank statement reconciliation

#### **3. API Routes Structure**
```
/api/accounting/
├── currencies/              # Currency management
├── vendors/                 # Vendor management
├── expense-categories/      # Expense categorization
├── expenses/               # Expense management
├── journal-entries/        # Journal entry management
├── chart-of-accounts/      # Chart of accounts
├── invoices/              # Invoice management
├── customers/             # Customer management
├── income-statement/      # Financial reporting
├── revenues/             # Revenue management
├── revenue-sources/      # Revenue source tracking
├── revenue-categories/   # Revenue categorization
└── bank-reconciliation/  # Bank reconciliation
```

## 🔧 **Core Features**

### **1. Double-Entry Bookkeeping System**

#### **Journal Entry Structure**
```typescript
// Every transaction creates a journal entry with balanced debits/credits
JournalEntry {
  id: string
  transactionDate: Date
  referenceNumber: string (e.g., "JE-1703123456789-123")
  description: string
  totalAmount: Decimal
  currencyId: string
  status: "PENDING" | "POSTED" | "VOID"
  createdById: string
}

JournalEntryLine {
  id: string
  journalEntryId: string
  chartOfAccountId: string
  debitAmount: Decimal
  creditAmount: Decimal
  description: string
  vatAmount?: Decimal
}
```

#### **Automatic Journal Entry Creation**
- **Expense Recording**: Automatically creates journal entries
- **Invoice Creation**: Generates accounts receivable entries
- **Payment Processing**: Creates payment journal entries
- **VAT Handling**: Automatic VAT input/output tracking

### **2. Chart of Accounts**

#### **Account Structure**
```typescript
ChartOfAccounts {
  accountNo: string        // "1000", "1010", "s5070"
  accountName: string      // "Cash and Cash Equivalents"
  accountType: string      // "Current Asset", "Revenue", "Expense"
  financialStatement: string // "Balance Sheet", "Income Statement"
  parentId?: string       // Hierarchical structure
  isActive: boolean
}
```

#### **Account Categories**
- **1000s - Assets**: Cash, Accounts Receivable, Equipment
- **2000s - Liabilities**: Accounts Payable, VAT Output, Loans
- **3000s - Equity**: Share Capital, Retained Earnings
- **4000s - Revenue**: Management Fees, Investment Gains
- **5000s - Expenses**: Salaries, Rent, Marketing
- **6000s - Investment**: Write-offs, Capital Calls

### **3. Multi-Currency Support**

#### **Currency Management**
```typescript
Currency {
  code: string           // "USD", "EUR", "ZWL"
  name: string           // "US Dollar"
  symbol: string         // "$", "€", "Z$"
  isActive: boolean
}
```

#### **Exchange Rate Handling**
- Real-time currency conversion
- Historical rate tracking
- Multi-currency reporting
- Currency-specific journal entries

### **4. VAT Compliance**

#### **VAT Service Integration**
```typescript
// Automatic VAT calculation
const vatAmount = VATService.calculateVAT(amount);
const totalAmount = amount + vatAmount;

// VAT Account Structure
VAT Input Account (Asset)    - VAT paid on purchases
VAT Output Account (Liability) - VAT collected on sales
```

#### **VAT Journal Entries**
```sql
-- Purchase with VAT
Dr Expense Account        1000.00
Dr VAT Input Account       150.00
    Cr Cash/Bank Account   1150.00

-- Sale with VAT
Dr Cash/Bank Account      1150.00
    Cr Revenue Account     1000.00
    Cr VAT Output Account   150.00
```

## 📋 **Key Services Deep Dive**

### **1. JournalEntryService**

#### **Core Methods**
```typescript
class JournalEntryService {
  // Create expense journal entry
  static async createExpenseJournalEntry(params: CreateExpenseJournalEntryParams)
  
  // Create invoice journal entry
  static async createInvoiceJournalEntry(params: CreateInvoiceJournalEntryParams)
  
  // Create revenue journal entry
  static async createRevenueJournalEntry(params: CreateRevenueJournalEntryParams)
  
  // Post journal entry
  static async postJournalEntry(journalEntryId: string)
  
  // Void journal entry
  static async voidJournalEntry(journalEntryId: string)
}
```

#### **Expense Journal Entry Example**
```typescript
// Expense: Office Supplies - $500 (Taxable)
const journalEntry = await JournalEntryService.createExpenseJournalEntry({
  vendorId: "vendor_123",
  categoryId: "office_supplies",
  amount: 500,
  vatAmount: 75,
  totalAmount: 575,
  currencyId: "usd",
  transactionDate: new Date(),
  description: "Office supplies purchase",
  isTaxable: true,
  paymentMethod: "BANK",
  createdById: "user_123"
});

// Creates:
// Dr Office Supplies Expense    500.00
// Dr VAT Input Account           75.00
//    Cr Cash/Bank Account       575.00
```

### **2. ExpenseService**

#### **Expense Lifecycle**
```typescript
class ExpenseService {
  // Create expense with automatic journal entry
  static async createExpense(params: CreateExpenseParams)
  
  // Update expense (creates reversal + new entry)
  static async updateExpense(expenseId: string, updates: any)
  
  // Delete expense (creates reversal entry)
  static async deleteExpense(expenseId: string)
  
  // Get expenses with filtering
  static async getExpenses(filters: ExpenseFilters)
}
```

#### **Expense Categories**
- **Office Expenses**: Rent, utilities, supplies
- **Travel & Entertainment**: Business travel, client entertainment
- **Professional Services**: Legal, accounting, consulting
- **Marketing & PR**: Advertising, events, materials
- **Technology**: Software, hardware, maintenance

### **3. InvoiceService**

#### **Invoice Management**
```typescript
class InvoiceService {
  // Create invoice with journal entry
  static async createInvoice(params: CreateInvoiceParams)
  
  // Mark invoice as paid
  static async markAsPaid(invoiceId: string, paymentData: any)
  
  // Update invoice (creates reversal + new entry)
  static async updateInvoice(invoiceId: string, updates: any)
  
  // Generate invoice number
  private static async getNextInvoiceNumber()
}
```

#### **Invoice Workflow**
1. **Create Invoice** → Journal Entry (Dr Accounts Receivable, Cr Revenue)
2. **Send Invoice** → Status: SENT
3. **Receive Payment** → Journal Entry (Dr Cash, Cr Accounts Receivable)
4. **Mark as Paid** → Status: PAID

### **4. Financial Reporting Services**

#### **IncomeStatementService**
```typescript
class IncomeStatementService {
  // Generate income statement
  static async generateIncomeStatement(params: IncomeStatementParams)
  
  // Get detailed breakdown
  static async getDetailedIncomeStatement(params: IncomeStatementParams)
  
  // Get comparative statement
  static async getComparativeIncomeStatement(params: ComparativeParams)
}
```

#### **CashFlowService**
```typescript
class CashFlowService {
  // Generate cash flow statement
  static async generateCashFlowStatement(params: CashFlowParams)
  
  // Get detailed cash flow
  static async getDetailedCashFlowStatement(params: CashFlowParams)
  
  // Get cash flow summary
  static async getCashFlowStatementSummary(params: CashFlowParams)
}
```

## 🔄 **Integration Points**

### **1. Events Management Integration**
```typescript
// Event expense automatically creates journal entry
const eventExpense = await EventService.recordExpense(eventId, expenseData, userId);

// Creates journal entry:
// Dr Event Expenses - Venue
// Dr VAT Input Account
//    Cr Cash/Bank Account
```

### **2. Payroll Integration**
```typescript
// Payroll processing creates journal entries
const payrollResult = await PayrollService.processPayrollRun(payrollRunId);

// Creates journal entries for:
// - Salary expenses
// - Tax deductions
// - Net pay disbursements
```

### **3. Investment Module Integration**
```typescript
// Investment disbursements create journal entries
const disbursement = await InvestmentImplementationService.markDisbursementAsDisbursed(disbursementId);

// Creates journal entries for:
// - Investment disbursements
// - Fund management fees
// - Portfolio company investments
```

## 📊 **Financial Reporting**

### **1. Income Statement**
- **Revenue**: Management fees, investment gains, other income
- **Expenses**: Operating expenses, professional fees, marketing
- **Net Income**: Revenue minus expenses

### **2. Balance Sheet**
- **Assets**: Cash, accounts receivable, equipment, investments
- **Liabilities**: Accounts payable, VAT output, loans
- **Equity**: Share capital, retained earnings

### **3. Cash Flow Statement**
- **Operating Activities**: Revenue and expense cash flows
- **Investing Activities**: Asset purchases and sales
- **Financing Activities**: Debt and equity transactions

## 🛠️ **API Endpoints**

### **Core Accounting Operations**

#### **Journal Entries**
- `POST /api/accounting/journal-entries` - Create journal entry
- `GET /api/accounting/journal-entries` - List journal entries
- `PUT /api/accounting/journal-entries/{id}/post` - Post journal entry
- `PUT /api/accounting/journal-entries/{id}/void` - Void journal entry

#### **Expenses**
- `POST /api/accounting/expenses` - Create expense
- `GET /api/accounting/expenses` - List expenses
- `PUT /api/accounting/expenses/{id}` - Update expense
- `DELETE /api/accounting/expenses/{id}` - Delete expense

#### **Invoices**
- `POST /api/accounting/invoices` - Create invoice
- `GET /api/accounting/invoices` - List invoices
- `PUT /api/accounting/invoices/{id}/mark-paid` - Mark as paid
- `GET /api/accounting/invoices/summary` - Invoice statistics

#### **Financial Reports**
- `POST /api/accounting/income-statement/generate` - Generate income statement
- `POST /api/accounting/cash-flow/generate` - Generate cash flow statement
- `GET /api/accounting/chart-of-accounts` - Get chart of accounts

## 🔐 **Security & Compliance**

### **1. Audit Trail**
- **Complete transaction history** for all journal entries
- **User tracking** for all accounting operations
- **Change logs** for expense and invoice modifications
- **Compliance reporting** for regulatory requirements

### **2. Data Validation**
- **Double-entry validation** ensures debits equal credits
- **Currency validation** prevents invalid currency operations
- **Account validation** ensures valid chart of accounts usage
- **VAT compliance** automatic tax calculation and tracking

### **3. Access Control**
- **Role-based permissions** for accounting operations
- **Admin-only access** for chart of accounts management
- **Accountant permissions** for journal entry operations
- **Read-only access** for financial reporting

## 🎯 **Key Benefits**

### **1. Complete Financial Control**
- ✅ **Double-entry bookkeeping** ensures accuracy
- ✅ **Automatic journal entries** reduce manual work
- ✅ **Multi-currency support** for international operations
- ✅ **VAT compliance** for tax requirements

### **2. Comprehensive Reporting**
- ✅ **Real-time financial statements**
- ✅ **Detailed transaction tracking**
- ✅ **Audit trail maintenance**
- ✅ **Regulatory compliance**

### **3. Seamless Integration**
- ✅ **Events Management** expense tracking
- ✅ **Payroll** salary processing
- ✅ **Investment** disbursement management
- ✅ **Procurement** purchase tracking

### **4. Professional Accounting**
- ✅ **Chart of accounts** following standard practices
- ✅ **Journal entry** system for all transactions
- ✅ **Financial reporting** with multiple formats
- ✅ **Bank reconciliation** for accuracy

## 🚀 **Production Ready Features**

### **1. Scalability**
- **High-performance** database operations
- **Efficient** query optimization
- **Batch processing** for large transactions
- **Real-time** financial updates

### **2. Reliability**
- **Transaction integrity** with database constraints
- **Error handling** for failed operations
- **Data validation** at all levels
- **Backup and recovery** procedures

### **3. User Experience**
- **Intuitive API** design
- **Comprehensive documentation** with Swagger
- **Error messages** with clear guidance
- **Response standardization** across all endpoints

## 📈 **Future Enhancements**

### **1. Advanced Features**
- **Budget management** and variance analysis
- **Financial forecasting** and planning
- **Advanced reporting** with custom dashboards
- **Automated reconciliation** with bank feeds

### **2. Integration Expansion**
- **Banking APIs** for real-time data
- **Tax software** integration
- **External accounting** system sync
- **Regulatory reporting** automation

The Core Accounting Module provides a **complete, professional-grade accounting system** that handles all financial operations with accuracy, compliance, and seamless integration across the entire NVCCZ platform! 🎉

