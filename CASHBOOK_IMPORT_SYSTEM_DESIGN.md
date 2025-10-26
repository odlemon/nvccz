# 📥 **CASHBOOK IMPORT SYSTEM DESIGN**

## 🎯 **OVERVIEW**

The cashbook import system allows users to import cashbook transactions from external sources (CSV, Excel, bank statements) and process them through the two-stage cashbook workflow.

---

## 📋 **IMPORT WORKFLOW**

### **Stage 1: File Upload & Validation**
1. **File Selection**: User selects CSV/Excel file
2. **File Validation**: Check file format, size, encoding
3. **Column Mapping**: Map file columns to cashbook fields
4. **Data Preview**: Show first 10-20 rows for verification
5. **Validation Report**: Highlight errors and warnings

### **Stage 2: Data Processing**
1. **Batch Creation**: Create unposted cashbook batch
2. **Transaction Import**: Import individual transactions
3. **Line Item Import**: Import transaction line items
4. **Validation**: Run business rules validation
5. **Error Handling**: Collect and report errors

### **Stage 3: Review & Post**
1. **Batch Review**: User reviews imported transactions
2. **Edit/Delete**: Modify or remove transactions
3. **Batch Posting**: Post to General Ledger
4. **Audit Trail**: Generate import report

---

## 🏗️ **TECHNICAL ARCHITECTURE**

### **📊 Database Schema Extensions**

#### **Import Batch Model:**
```typescript
model CashbookImportBatch {
  id: string
  fileName: string
  fileSize: number
  importDate: DateTime
  status: 'UPLOADING' | 'MAPPING' | 'VALIDATING' | 'READY' | 'POSTED' | 'FAILED'
  totalRecords: number
  validRecords: number
  errorRecords: number
  createdById: string
  createdAt: DateTime
  updatedAt: DateTime
  
  // Relations
  createdBy: User
  transactions: CashbookTransaction[]
  importErrors: CashbookImportError[]
}
```

#### **Import Error Model:**
```typescript
model CashbookImportError {
  id: string
  batchId: string
  rowNumber: number
  fieldName: string
  errorType: 'VALIDATION' | 'MAPPING' | 'BUSINESS_RULE'
  errorMessage: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  createdAt: DateTime
}
```

### **📁 File Format Support**

#### **CSV Format:**
```csv
Date,Type,Description,Amount,Reference,Bank,ContraAccount,VATCode,Project
2024-01-15,RECEIPT,Customer Payment,5000.00,INV-001,Main Bank,Sales Revenue,15%,PROJ-001
2024-01-16,PAYMENT,Rent Payment,2000.00,CHQ-001,Main Bank,Rent Expense,15%,PROJ-001
```

#### **Excel Format:**
- Multiple sheets support
- Header row detection
- Data type validation
- Formula evaluation

#### **Bank Statement Format:**
```csv
Transaction Date,Description,Debit Amount,Credit Amount,Balance,Reference
2024-01-15,Customer Payment,,5000.00,25000.00,INV-001
2024-01-16,Rent Payment,2000.00,,23000.00,CHQ-001
```

---

## 🔧 **IMPORT PROCESSING ENGINE**

### **📥 File Upload Service:**
```typescript
class CashbookImportService {
  // File upload and validation
  static async uploadFile(file: File, userId: string): Promise<ImportBatch>
  
  // Column mapping
  static async mapColumns(batchId: string, mappings: ColumnMapping[]): Promise<void>
  
  // Data validation
  static async validateData(batchId: string): Promise<ValidationReport>
  
  // Import processing
  static async processImport(batchId: string): Promise<ImportResult>
  
  // Error handling
  static async getImportErrors(batchId: string): Promise<ImportError[]>
}
```

### **🔍 Validation Engine:**
```typescript
class CashbookValidationService {
  // Field validation
  static validateDate(date: string): ValidationResult
  static validateAmount(amount: string): ValidationResult
  static validateAccount(accountNo: string): ValidationResult
  
  // Business rule validation
  static validateTransaction(transaction: ImportTransaction): ValidationResult
  static validateBatch(batch: ImportBatch): ValidationResult
  
  // VAT validation
  static validateVAT(amount: number, vatCode: string): ValidationResult
}
```

---

## 📋 **IMPORT FIELD MAPPING**

### **Required Fields:**
- **Date**: Transaction date (YYYY-MM-DD)
- **Type**: RECEIPT or PAYMENT
- **Description**: Transaction description
- **Amount**: Transaction amount (decimal)
- **Bank**: Bank account identifier
- **ContraAccount**: GL account for contra entry

### **Optional Fields:**
- **Reference**: Transaction reference number
- **VATCode**: VAT code (15%, 0%, EXEMPT)
- **Project**: Project code
- **Customer**: Customer ID (for customer receipts)
- **Supplier**: Supplier ID (for supplier payments)
- **Discount**: Settlement discount amount

### **Auto-Generated Fields:**
- **Transaction ID**: Auto-generated
- **VAT Amount**: Calculated from amount and VAT code
- **Net Amount**: Amount minus VAT
- **Created By**: Current user
- **Created At**: Current timestamp

---

## 🎯 **IMPORT SCENARIOS**

### **Scenario 1: Bank Statement Import**
```typescript
// Import bank statement with automatic transaction type detection
const bankStatement = {
  date: "2024-01-15",
  description: "Customer Payment",
  amount: 5000.00,
  type: "CREDIT", // Auto-detected from bank statement
  bank: "Main Bank Account - USD"
};

// System automatically:
// 1. Detects as RECEIPT (CREDIT in bank statement)
// 2. Maps to appropriate contra account
// 3. Calculates VAT if applicable
// 4. Creates cashbook transaction
```

### **Scenario 2: CSV Batch Import**
```typescript
// Import multiple transactions from CSV
const csvData = [
  {
    date: "2024-01-15",
    type: "RECEIPT",
    description: "Customer Payment",
    amount: 5000.00,
    bank: "Main Bank",
    contraAccount: "4000", // Sales Revenue
    vatCode: "15%"
  },
  {
    date: "2024-01-16", 
    type: "PAYMENT",
    description: "Rent Payment",
    amount: 2000.00,
    bank: "Main Bank",
    contraAccount: "5000", // Rent Expense
    vatCode: "15%"
  }
];
```

### **Scenario 3: Excel Multi-Sheet Import**
```typescript
// Import from Excel with multiple sheets
const excelData = {
  "Receipts": [
    { date: "2024-01-15", description: "Customer Payment", amount: 5000.00 }
  ],
  "Payments": [
    { date: "2024-01-16", description: "Rent Payment", amount: 2000.00 }
  ]
};
```

---

## 🔄 **IMPORT PROCESSING FLOW**

### **Step 1: File Upload**
```typescript
// User uploads file
const uploadResult = await CashbookImportService.uploadFile(file, userId);

// System creates import batch
const batch = {
  id: "batch-123",
  fileName: "cashbook_import.csv",
  status: "UPLOADING",
  totalRecords: 0
};
```

### **Step 2: Column Mapping**
```typescript
// System detects columns and suggests mappings
const columnMappings = {
  "Date": "transactionDate",
  "Type": "transactionType", 
  "Description": "description",
  "Amount": "amount",
  "Bank": "bankId",
  "ContraAccount": "contraGlAccountId"
};

// User confirms or modifies mappings
await CashbookImportService.mapColumns(batchId, columnMappings);
```

### **Step 3: Data Validation**
```typescript
// System validates each row
const validationReport = await CashbookImportService.validateData(batchId);

// Validation results
const report = {
  totalRecords: 100,
  validRecords: 95,
  errorRecords: 5,
  warnings: 10,
  errors: [
    {
      rowNumber: 15,
      fieldName: "Date",
      errorMessage: "Invalid date format",
      severity: "ERROR"
    }
  ]
};
```

### **Step 4: Import Processing**
```typescript
// System processes valid records
const importResult = await CashbookImportService.processImport(batchId);

// Creates cashbook transactions
const transactions = [
  {
    id: "cb-001",
    bankId: "bank-123",
    transactionDate: "2024-01-15",
    transactionType: "RECEIPT",
    amount: 5000.00,
    status: "DRAFT"
  }
];
```

### **Step 5: Batch Review**
```typescript
// User reviews imported transactions
const batchReview = await CashbookImportService.getBatchReview(batchId);

// User can:
// - Edit transactions
// - Delete transactions  
// - Add missing transactions
// - Post batch to GL
```

---

## 🎯 **IMPORT VALIDATION RULES**

### **Field Validation:**
- **Date**: Must be valid date, not future
- **Amount**: Must be positive number
- **Bank**: Must exist in bank accounts
- **ContraAccount**: Must exist in chart of accounts
- **VATCode**: Must be valid VAT code (15%, 0%, EXEMPT)

### **Business Rules:**
- **Receipts**: Must have revenue or asset contra account
- **Payments**: Must have expense or liability contra account
- **VAT**: Must be consistent with account type
- **Customer/Supplier**: Must exist in master data

### **Data Integrity:**
- **Duplicate Detection**: Check for duplicate transactions
- **Balance Validation**: Ensure debits equal credits
- **Period Validation**: Check accounting period is open
- **User Permissions**: Verify user can create transactions

---

## 📊 **IMPORT REPORTING**

### **Import Summary:**
```typescript
interface ImportSummary {
  batchId: string
  fileName: string
  importDate: DateTime
  totalRecords: number
  validRecords: number
  errorRecords: number
  warningCount: number
  processingTime: number
  status: 'COMPLETED' | 'FAILED' | 'PARTIAL'
}
```

### **Error Report:**
```typescript
interface ErrorReport {
  rowNumber: number
  fieldName: string
  errorType: string
  errorMessage: string
  severity: 'ERROR' | 'WARNING' | 'INFO'
  suggestedFix?: string
}
```

### **Success Report:**
```typescript
interface SuccessReport {
  transactionsCreated: number
  journalEntriesGenerated: number
  totalAmount: number
  vatAmount: number
  bankAccountsAffected: string[]
  glAccountsAffected: string[]
}
```

---

## 🚀 **IMPLEMENTATION PLAN**

### **Phase 1: Core Import Engine**
- [ ] File upload service
- [ ] Column mapping interface
- [ ] Basic validation engine
- [ ] Import batch model

### **Phase 2: Validation & Processing**
- [ ] Advanced validation rules
- [ ] Error handling and reporting
- [ ] Data transformation engine
- [ ] Batch processing logic

### **Phase 3: User Interface**
- [ ] File upload interface
- [ ] Column mapping wizard
- [ ] Validation report display
- [ ] Batch review interface

### **Phase 4: Advanced Features**
- [ ] Excel multi-sheet support
- [ ] Bank statement auto-detection
- [ ] Template generation
- [ ] Scheduled imports

---

## 🎉 **EXPECTED OUTCOMES**

### **✅ User Benefits:**
- **Bulk Import**: Process hundreds of transactions quickly
- **Error Prevention**: Validation prevents data entry errors
- **Time Saving**: Automated processing vs manual entry
- **Audit Trail**: Complete import history and reporting

### **✅ System Benefits:**
- **Data Integrity**: Validation ensures accurate data
- **Performance**: Batch processing for large datasets
- **Flexibility**: Support multiple file formats
- **Scalability**: Handle large import volumes

**The cashbook import system will provide a comprehensive solution for bulk transaction processing while maintaining data integrity and audit compliance.**


