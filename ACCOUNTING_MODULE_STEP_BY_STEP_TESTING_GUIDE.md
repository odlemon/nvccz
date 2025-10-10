# 🧪 **ACCOUNTING MODULE - COMPLETE STEP-BY-STEP TESTING GUIDE**

## 📋 **OVERVIEW**

This comprehensive testing guide provides step-by-step instructions for testing ALL accounting module endpoints in the proper order of usage. Follow these tests in order to ensure complete functionality.

## 🎯 **ACCOUNTING MODULE ENDPOINTS OVERVIEW**

### **📊 CORE ACCOUNTING ENDPOINTS:**
- **Currencies** - `/api/accounting/currencies`
- **Chart of Accounts** - `/api/accounting/chart-of-accounts`
- **Customers** - `/api/accounting/customers`
- **Vendors** - `/api/accounting/vendors`
- **Expenses** - `/api/accounting/expenses`
- **Expense Categories** - `/api/accounting/expense-categories`
- **Invoices** - `/api/accounting/invoices`
- **Journal Entries** - `/api/accounting/journal-entries`
- **Income Statement** - `/api/accounting/income-statement`
- **Cash Flow** - `/api/accounting/cash-flow`

### **📦 ADVANCED ACCOUNTING ENDPOINTS:**
- **Inventory Management** - `/api/accounting/inventory`
- **Asset Management** - `/api/accounting/assets`
- **Credit Notes** - `/api/accounting/credit-notes`
- **Statement of Accounts** - `/api/accounting/statements`
- **Multi-Currency** - `/api/accounting/multi-currency`
- **Bank Reconciliation** - `/api/accounting/bank-reconciliation`

## 🎯 **TESTING PHASES SUMMARY**

### **PHASE 1: CORE ACCOUNTING SETUP & INITIALIZATION**
- Database schema validation
- Currency creation (USD, ZWL, EUR)
- Chart of Accounts setup (Assets, Liabilities, Revenue, Expenses)
- **Total Tests: 7**

### **PHASE 2: CUSTOMER & VENDOR MANAGEMENT**
- Customer creation and management
- Vendor (Supplier) creation and management
- CRUD operations for customers and vendors
- **Total Tests: 8**

### **PHASE 3: EXPENSE CATEGORIES & EXPENSES**
- Expense category creation
- Expense creation and management
- Expense dashboard and reporting
- **Total Tests: 8**

### **PHASE 4: INVOICE MANAGEMENT**
- Invoice creation with items
- Invoice status updates (send, paid, void)
- Invoice operations and reporting
- **Total Tests: 8**

### **PHASE 5: JOURNAL ENTRIES & FINANCIAL REPORTING**
- Manual journal entry creation
- Journal entry operations (get, post, void)
- Automatic journal entry verification
- Financial reports (Income Statement, Cash Flow)
- Financial dashboard
- **Total Tests: 10**

### **PHASE 6: INVENTORY MANAGEMENT TESTING**
- Inventory item creation and CRUD operations
- Stock movements (IN, OUT, ADJUSTMENT)
- Inventory valuation and COGS calculation
- Sales invoice processing with inventory
- **Total Tests: 14**

### **PHASE 7: ASSET MANAGEMENT TESTING**
- Asset creation with depreciation setup
- Depreciation calculation (monthly, annual)
- Asset reports (register, depreciation schedule)
- **Total Tests: 6**

### **PHASE 8: MULTI-CURRENCY TESTING**
- Exchange rate creation and management
- Currency conversion
- Multi-currency payment processing
- Forex gain/loss calculation
- **Total Tests: 6**

### **PHASE 9: CREDIT NOTE TESTING**
- Credit note creation (simplified - no customer/currency ID needed)
- Credit note operations (send, apply)
- Credit note reporting
- **Total Tests: 5**

### **PHASE 10: STATEMENT OF ACCOUNTS TESTING**
- Generate all customer statements (all currencies)
- Generate all vendor statements (all currencies)
- Statement operations and management
- **Total Tests: 6**

### **PHASE 11: BANK RECONCILIATION TESTING**
- Bank statement upload (JSON and file support)
- Bank reconciliation operations
- Journal entry creation from bank statements
- **Total Tests: 8**

### **PHASE 12: TRIAL BALANCE TESTING**
- Trial balance generation (current date and specific dates)
- Trial balance summary and validation
- Trial balance by account type
- **Total Tests: 9**

### **PHASE 13: INTEGRATION TESTING**
- End-to-end workflow testing
- Cross-module integration verification
- **Total Tests: 4**

## 🎯 **TOTAL TESTING SUMMARY**
- **Total Phases: 13**
- **Total Test Cases: 101**
- **Core Accounting: 33 tests**
- **Advanced Accounting: 68 tests**

## 🎯 **KEY FEATURES TESTED**
- ✅ **Simplified API Design** - No redundant user IDs, auto-detected from authentication
- ✅ **Account Name References** - Uses account names instead of cryptic IDs
- ✅ **Multi-Currency Support** - All statements generated for all currencies
- ✅ **JSON & File Upload** - Bank reconciliation supports both formats
- ✅ **Complete CRUD Operations** - Full lifecycle testing for all modules
- ✅ **Automatic Journal Entries** - Double-entry bookkeeping verification
- ✅ **Financial Reporting** - Income statements, cash flow, dashboards

---

## 🎯 **PHASE 1: CORE ACCOUNTING SETUP & INITIALIZATION**

### **Step 1.1: Database Schema Validation**
```bash
# Test database schema creation
npx prisma generate
npx prisma db push

# Verify all models are created
npx prisma studio
```

**Expected Results:**
- ✅ All accounting models created successfully
- ✅ No schema validation errors
- ✅ All relationships properly established

### **Step 1.2: Create Currencies**
```bash
# Test 1: Create USD currency
curl -X POST http://localhost:3000/api/accounting/currencies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "code": "USD",
    "name": "US Dollar",
    "symbol": "$",
    "isActive": true
  }'

# Test 2: Create ZWL currency
curl -X POST http://localhost:3000/api/accounting/currencies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "code": "ZWL",
    "name": "Zimbabwean Dollar",
    "symbol": "Z$",
    "isActive": true
  }'

# Test 3: Create EUR currency
curl -X POST http://localhost:3000/api/accounting/currencies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "code": "EUR",
    "name": "Euro",
    "symbol": "€",
    "isActive": true
  }'
```

**Expected Results:**
- ✅ Currencies created successfully
- ✅ Unique currency codes enforced
- ✅ Currency symbols properly stored

### **Step 1.3: Create Chart of Accounts**
```bash
# Test 4: Create Asset accounts
curl -X POST http://localhost:3000/api/accounting/chart-of-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "accountNo": "1000",
    "accountName": "Cash",
    "accountType": "Current Asset",
    "financialStatement": "Balance Sheet",
    "isActive": true
  }'

# Test 4.1: Create Inventory Asset account (REQUIRED for inventory items)
curl -X POST http://localhost:3000/api/accounting/chart-of-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "accountNo": "1200",
    "accountName": "Inventory Asset",
    "accountType": "Current Asset",
    "financialStatement": "Balance Sheet",
    "isActive": true
  }'

# Test 5: Create Liability accounts
curl -X POST http://localhost:3000/api/accounting/chart-of-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "accountNo": "2000",
    "accountName": "Accounts Payable",
    "accountType": "Current Liability",
    "financialStatement": "Balance Sheet",
    "isActive": true
  }'

# Test 6: Create Revenue accounts
curl -X POST http://localhost:3000/api/accounting/chart-of-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "accountNo": "4000",
    "accountName": "Sales Revenue",
    "accountType": "Revenue",
    "financialStatement": "Income Statement",
    "isActive": true
  }'

# Test 7: Create Expense accounts
curl -X POST http://localhost:3000/api/accounting/chart-of-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "accountNo": "5000",
    "accountName": "Office Expenses",
    "accountType": "Expense",
    "financialStatement": "Income Statement",
    "isActive": true
  }'
```

**Expected Results:**
- ✅ Chart of accounts created successfully
- ✅ Account types properly categorized
- ✅ Account numbers unique

---

## 🎯 **PHASE 2: CUSTOMER & VENDOR MANAGEMENT**

### **Step 2.1: Create Customers**
```bash
# Test 8: Create customer
curl -X POST http://localhost:3000/api/accounting/customers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "ABC Company Ltd",
    "email": "contact@abccompany.com",
    "phone": "+263 4 123 456",
    "address": "123 Business Street, Harare",
    "taxNumber": "TAX123456789",
    "creditLimit": 50000.00,
    "currencyId": "USD_CURRENCY_ID"
  }'

# Test 9: Create another customer
curl -X POST http://localhost:3000/api/accounting/customers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "XYZ Corporation",
    "email": "info@xyzcorp.com",
    "phone": "+263 4 987 654",
    "address": "456 Corporate Avenue, Bulawayo",
    "taxNumber": "TAX987654321",
    "creditLimit": 75000.00,
    "currencyId": "USD_CURRENCY_ID"
  }'
```

**Expected Results:**
- ✅ Customers created successfully
- ✅ Unique email addresses enforced
- ✅ Credit limits properly set

### **Step 2.2: Create Vendors (Suppliers)**
```bash
# Test 10: Create vendor
curl -X POST http://localhost:3000/api/accounting/vendors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Office Supplies Ltd",
    "email": "orders@officesupplies.co.zw",
    "phone": "+263 4 555 123",
    "address": "789 Supply Street, Harare",
    "taxNumber": "VAT123456789",
    "paymentTerms": "30 days",
    "currencyId": "USD_CURRENCY_ID"
  }'

# Test 11: Create another vendor
curl -X POST http://localhost:3000/api/accounting/vendors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Tech Solutions Inc",
    "email": "sales@techsolutions.com",
    "phone": "+263 4 777 888",
    "address": "321 Tech Park, Harare",
    "taxNumber": "VAT987654321",
    "paymentTerms": "15 days",
    "currencyId": "USD_CURRENCY_ID"
  }'
```

**Expected Results:**
- ✅ Vendors created successfully
- ✅ Payment terms properly stored
- ✅ Tax numbers unique

### **Step 2.3: Test Customer & Vendor Management**
```bash
# Test 12: Get all customers
curl -X GET http://localhost:3000/api/accounting/customers \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 13: Get all vendors
curl -X GET http://localhost:3000/api/accounting/vendors \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 14: Get specific customer
curl -X GET http://localhost:3000/api/accounting/customers/CUSTOMER_ID_FROM_STEP_2_1 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 15: Update customer
curl -X PUT http://localhost:3000/api/accounting/customers/CUSTOMER_ID_FROM_STEP_2_1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "ABC Company Ltd (Updated)",
    "creditLimit": 60000.00
  }'
```

**Expected Results:**
- ✅ Customer and vendor listings working
- ✅ Individual records retrievable
- ✅ Updates applied successfully

---

## 🎯 **PHASE 3: EXPENSE CATEGORIES & EXPENSES**

### **Step 3.1: Create Expense Categories**
```bash
# Test 16: Create expense category
curl -X POST http://localhost:3000/api/accounting/expense-categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Office Supplies",
    "description": "Stationery and office materials",
    "isActive": true
  }'

# Test 17: Create another expense category
curl -X POST http://localhost:3000/api/accounting/expense-categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Travel & Transport",
    "description": "Business travel and transportation costs",
    "isActive": true
  }'

# Test 18: Create utility expense category
curl -X POST http://localhost:3000/api/accounting/expense-categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Utilities",
    "description": "Electricity, water, internet bills",
    "isActive": true
  }'
```

**Expected Results:**
- ✅ Expense categories created successfully
- ✅ Categories properly categorized
- ✅ Active status managed correctly

### **Step 3.2: Create Expenses**
```bash
# Test 19: Create office supplies expense
curl -X POST http://localhost:3000/api/accounting/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "vendorId": "VENDOR_ID_FROM_STEP_2_2",
    "categoryId": "CATEGORY_ID_FROM_STEP_3_1",
    "amount": 250.00,
    "currencyId": "USD_CURRENCY_ID",
    "transactionDate": "2024-01-15",
    "description": "Office stationery purchase",
    "receiptNumber": "RCP-001",
    "isTaxable": true
  }'

# Test 20: Create travel expense
curl -X POST http://localhost:3000/api/accounting/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "vendorId": "VENDOR_ID_FROM_STEP_2_2",
    "categoryId": "CATEGORY_ID_FROM_STEP_3_1",
    "amount": 500.00,
    "currencyId": "USD_CURRENCY_ID",
    "transactionDate": "2024-01-20",
    "description": "Business trip to client site",
    "receiptNumber": "RCP-002",
    "isTaxable": false
  }'
```

**Expected Results:**
- ✅ Expenses created successfully
- ✅ VAT calculation working
- ✅ Journal entries created automatically

### **Step 3.3: Test Expense Management**
```bash
# Test 21: Get all expenses
curl -X GET http://localhost:3000/api/accounting/expenses \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 22: Get expenses by category
curl -X GET "http://localhost:3000/api/accounting/expenses?categoryId=CATEGORY_ID_FROM_STEP_3_1" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 23: Get expense dashboard
curl -X GET http://localhost:3000/api/accounting/expenses/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Expense listings working
- ✅ Category filtering functional
- ✅ Dashboard data accurate

---

## 🎯 **PHASE 4: INVOICE MANAGEMENT**

### **Step 4.1: Create Invoices**
```bash
# Test 24: Create sales invoice
curl -X POST http://localhost:3000/api/accounting/invoices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "customerId": "CUSTOMER_ID_FROM_STEP_2_1",
    "currencyId": "USD_CURRENCY_ID",
    "invoiceDate": "2024-01-25",
    "dueDate": "2024-02-25",
    "items": [
      {
        "description": "Software License",
        "quantity": 1,
        "unitPrice": 1000.00,
        "taxRate": 15.0
      },
      {
        "description": "Support Services",
        "quantity": 12,
        "unitPrice": 100.00,
        "taxRate": 15.0
      }
    ],
    "notes": "Monthly software license and support"
  }'

# Test 25: Create another invoice
curl -X POST http://localhost:3000/api/accounting/invoices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "customerId": "CUSTOMER_ID_FROM_STEP_2_1",
    "currencyId": "USD_CURRENCY_ID",
    "invoiceDate": "2024-01-30",
    "dueDate": "2024-02-28",
    "items": [
      {
        "description": "Consulting Services",
        "quantity": 40,
        "unitPrice": 75.00,
        "taxRate": 15.0
      }
    ],
    "notes": "Project consulting services"
  }'
```

**Expected Results:**
- ✅ Invoices created successfully
- ✅ Tax calculations accurate
- ✅ Journal entries created automatically

### **Step 4.2: Test Invoice Status Updates**

#### **Invoice Status Lifecycle:**
1. **DRAFT** → **SENT** (Send to customer)
2. **SENT** → **PAID** (Mark as paid)
3. **Any Status** → **VOID** (Void invoice)

#### **Test 26: Send Invoice (DRAFT → SENT)**
```bash
# Test 26: Send invoice to customer
curl -X PATCH http://localhost:3000/api/accounting/invoices/INVOICE_ID_FROM_STEP_4_1/send \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Invoice status changed from DRAFT to SENT
- ✅ Invoice can be sent to customer
- ✅ Only DRAFT invoices can be sent

#### **Test 27: Mark Invoice as Paid (SENT → PAID)**
```bash
# Test 27: Mark invoice as paid
curl -X PATCH http://localhost:3000/api/accounting/invoices/INVOICE_ID_FROM_STEP_4_1/mark-as-paid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "paymentMethod": "BANK"
  }'
```

**Expected Results:**
- ✅ Invoice status changed from SENT to PAID
- ✅ Payment method recorded
- ✅ Only SENT invoices can be marked as paid

#### **Test 28: Void Invoice (Any Status → VOID)**
```bash
# Test 28: Void invoice
curl -X PATCH http://localhost:3000/api/accounting/invoices/INVOICE_ID_FROM_STEP_4_1/void \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "reason": "Customer requested cancellation"
  }'
```

**Expected Results:**
- ✅ Invoice status changed to VOID
- ✅ Void reason recorded
- ✅ Any status invoice can be voided

### **Step 4.3: Test Invoice Operations**
```bash
# Test 29: Get all invoices
curl -X GET http://localhost:3000/api/accounting/invoices \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 30: Get invoice by ID
curl -X GET http://localhost:3000/api/accounting/invoices/INVOICE_ID_FROM_STEP_4_1 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 31: Get invoice summary
curl -X GET http://localhost:3000/api/accounting/invoices/summary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Invoice listings working
- ✅ Individual invoice retrieval successful
- ✅ Invoice summary statistics accurate

---

## 🎯 **PHASE 5: JOURNAL ENTRIES & FINANCIAL REPORTING**

### **Step 5.1: Create Manual Journal Entries**
```bash
# Test 32: Create manual journal entry
curl -X POST http://localhost:3000/api/accounting/journal-entries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "transactionDate": "2024-01-15",
    "referenceNumber": "JE-2024-001",
    "description": "Manual adjustment for office supplies",
    "currencyId": "USD_CURRENCY_ID",
    "journalEntryLines": [
      {
        "chartOfAccountId": "Office Equipment Account ID",
        "debitAmount": 500.00,
        "creditAmount": 0.00,
        "description": "Office supplies purchase"
      },
      {
        "chartOfAccountId": "Cash and Cash Equivalents Account ID",
        "debitAmount": 0.00,
        "creditAmount": 500.00,
        "description": "Cash payment for supplies"
      }
    ]
  }'

# Test 33: Create another manual journal entry
curl -X POST http://localhost:3000/api/accounting/journal-entries \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "transactionDate": "2024-01-20",
    "referenceNumber": "JE-2024-002",
    "description": "Depreciation adjustment",
    "currencyId": "USD_CURRENCY_ID",
    "journalEntryLines": [
      {
        "chartOfAccountId": "Depreciation Expense Account ID",
        "debitAmount": 100.00,
        "creditAmount": 0.00,
        "description": "Monthly depreciation"
      },
      {
        "chartOfAccountId": "Accumulated Depreciation Account ID",
        "debitAmount": 0.00,
        "creditAmount": 100.00,
        "description": "Accumulated depreciation"
      }
    ]
  }'
```

### **Step 5.2: Test Journal Entry Operations**
```bash
# Test 34: Get all journal entries
curl -X GET http://localhost:3000/api/accounting/journal-entries \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 35: Get journal entries by date range
curl -X GET "http://localhost:3000/api/accounting/journal-entries?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 36: Get specific journal entry
curl -X GET http://localhost:3000/api/accounting/journal-entries/JOURNAL_ENTRY_ID_FROM_STEP_5_1 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 37: Post journal entry (change status to POSTED)
curl -X PATCH http://localhost:3000/api/accounting/journal-entries/JOURNAL_ENTRY_ID_FROM_STEP_5_1/post \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Journal entries retrieved successfully
- ✅ Date filtering working
- ✅ Automatic journal entries from expenses visible
- ✅ Automatic journal entries from invoices visible

### **Step 5.2: Test Financial Reports**
```bash
# Test 36: Generate Income Statement
curl -X GET "http://localhost:3000/api/accounting/income-statement?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 37: Generate Cash Flow Statement
curl -X GET "http://localhost:3000/api/accounting/cash-flow?startDate=2024-01-01&endDate=2024-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 38: Get financial dashboard
curl -X GET http://localhost:3000/api/accounting/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Income statement generated correctly
- ✅ Cash flow statement accurate
- ✅ Dashboard data comprehensive

---

## 🎯 **PHASE 6: INVENTORY MANAGEMENT TESTING**

**⚠️ IMPORTANT:** Before creating inventory items, ensure you have a Current Asset account available. You can use the existing "VAT Input" account (ID: cmg97jqgh000sung8xld8e0dq) or create a new Inventory Asset account if needed.

### **Step 6.1: Create Inventory Items**
```bash
# Test 39: Create basic inventory item
curl -X POST http://localhost:3000/api/accounting/inventory/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "itemName": "Test Product A",
    "skuNumber": "SKU-001",
    "description": "Test product for inventory management",
    "costOfPurchase": 50.00,
    "quantityOnHand": 100,
    "reorderLevel": 20,
    "unitOfMeasure": "pieces",
    "supplierId": "supplier-1",
    "inventoryAssetAccountId": "cmg97jqgh000sung8xld8e0dq"
  }'

# Test 40: Create inventory item with different parameters
curl -X POST http://localhost:3000/api/accounting/inventory/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "itemName": "Test Product B",
    "skuNumber": "SKU-002",
    "description": "Another test product",
    "costOfPurchase": 75.50,
    "quantityOnHand": 50,
    "reorderLevel": 10,
    "unitOfMeasure": "units",
    "supplierId": "supplier-2",
    "inventoryAssetAccountId": "cmg97jqgh000sung8xld8e0dq"
  }'
```

**Expected Results:**
- ✅ Items created successfully
- ✅ Unique SKU numbers enforced
- ✅ Proper validation of required fields

### **Step 6.1.1: Test Inventory CRUD Operations**
```bash
# Test 40.1: Get all inventory items
curl -X GET http://localhost:3000/api/accounting/inventory/items \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 40.2: Get inventory items with filtering
curl -X GET "http://localhost:3000/api/accounting/inventory/items?search=Test&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 40.3: Get single inventory item
curl -X GET http://localhost:3000/api/accounting/inventory/items/ITEM_ID_FROM_CREATION \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 40.4: Update inventory item
curl -X PUT http://localhost:3000/api/accounting/inventory/items/ITEM_ID_FROM_CREATION \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "itemName": "Updated Test Product A",
    "description": "Updated description",
    "costOfPurchase": 55.00,
    "reorderLevel": 25
  }'

# Test 40.5: Delete inventory item
curl -X DELETE http://localhost:3000/api/accounting/inventory/items/ITEM_ID_FROM_CREATION \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ All CRUD operations working
- ✅ Filtering and pagination working
- ✅ Update operations successful
- ✅ Delete operations successful

### **Step 6.2: Test Stock Movements**
```bash
# Test 41: Record stock movement (IN)
curl -X POST http://localhost:3000/api/accounting/inventory/movements \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "itemId": "ITEM_ID_FROM_STEP_2_1",
    "movementType": "IN",
    "quantity": 25,
    "unitCost": 50.00,
    "reference": "PURCHASE-001",
    "description": "Stock replenishment"
  }'

# Test 42: Record stock movement (OUT)
curl -X POST http://localhost:3000/api/accounting/inventory/movements \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "itemId": "ITEM_ID_FROM_STEP_2_1",
    "movementType": "OUT",
    "quantity": 10,
    "unitCost": 50.00,
    "reference": "SALES-001",
    "description": "Sales transaction"
  }'
```

**Expected Results:**
- ✅ Stock movements recorded successfully
- ✅ Inventory quantities updated correctly
- ✅ Movement history maintained

### **Step 6.3: Test Inventory Valuation**
```bash
# Test 43: Get inventory valuation
curl -X GET http://localhost:3000/api/accounting/inventory/valuation \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 44: Get reorder level alerts
curl -X GET http://localhost:3000/api/accounting/inventory/reorder-levels \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Valuation calculated correctly
- ✅ Reorder alerts generated properly
- ✅ Accurate inventory reports

### **Step 6.4: Test Additional Inventory Operations**
```bash
# Test 45: Get inventory dashboard
curl -X GET http://localhost:3000/api/accounting/inventory/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 46: Generate inventory report
curl -X GET http://localhost:3000/api/accounting/inventory/report \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 47: Get inventory value
curl -X GET http://localhost:3000/api/accounting/inventory/inventory-value \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 48: Update stock quantity
curl -X POST http://localhost:3000/api/accounting/inventory/update-stock \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "itemId": "ITEM_ID_FROM_CREATION",
    "newQuantity": 150,
    "reason": "Stock adjustment"
  }'

# Test 49: Calculate COGS
curl -X POST http://localhost:3000/api/accounting/inventory/calculate-cogs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "itemId": "ITEM_ID_FROM_CREATION",
    "quantity": 10,
    "method": "FIFO"
  }'

# Test 50: Create inventory adjustment
curl -X POST http://localhost:3000/api/accounting/inventory/adjustments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "itemId": "ITEM_ID_FROM_CREATION",
    "quantity": 5,
    "reason": "Physical count adjustment"
  }'

# Test 51: Check reorder levels
curl -X GET http://localhost:3000/api/accounting/inventory/check-reorder-levels \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Dashboard data retrieved
- ✅ Reports generated successfully
- ✅ Stock updates working
- ✅ COGS calculations accurate
- ✅ Adjustments recorded
- ✅ Reorder level checks working

### **Step 6.5: Test Sales Invoice Processing**
```bash
# Test 52: Process sales invoice with inventory items
curl -X POST http://localhost:3000/api/accounting/inventory/sales-invoice \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "invoiceId": "INV-001",
    "items": [
      {
        "itemId": "ITEM_ID_FROM_STEP_2_1",
        "quantity": 5,
        "unitPrice": 75.00
      }
    ]
  }'
```

**Expected Results:**
- ✅ Stock quantities reduced automatically
- ✅ COGS calculated and recorded
- ✅ Journal entries created for inventory and COGS

---

## 🎯 **PHASE 7: ASSET MANAGEMENT TESTING**

### **Step 7.1: Create Assets**
```bash
# Test 42: Create computer asset
curl -X POST http://localhost:3000/api/accounting/assets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "assetName": "Office Computer",
    "assetCode": "COMP-001",
    "description": "Dell Desktop Computer",
    "purchaseDate": "2024-01-15",
    "cost": 1200.00,
    "usefulLifeYears": 5,
    "depreciationMethod": "STRAIGHT_LINE",
    "salvageValue": 100.00,
    "assetAccountId": "cmg97iy320003ung8aau6zqbv", // Office Equipment
    "accumulatedDepreciationAccountId": "cmg97j09f0005ung82733ty8w", // Accumulated Depreciation
    "depreciationExpenseAccountId": "cmg97jeg5000iung857s7hlsn", // Office Equipment (Expense)
    "location": "Office Building A"
  }'

# Test 43: Create furniture asset
curl -X POST http://localhost:3000/api/accounting/assets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "assetName": "Office Desk",
    "assetCode": "DESK-001",
    "description": "Executive Office Desk",
    "purchaseDate": "2024-01-20",
    "cost": 800.00,
    "usefulLifeYears": 10,
    "depreciationMethod": "STRAIGHT_LINE",
    "salvageValue": 50.00,
    "assetAccountId": "cmg97iy320003ung8aau6zqbv", // Office Equipment
    "accumulatedDepreciationAccountId": "cmg97j09f0005ung82733ty8w", // Accumulated Depreciation
    "depreciationExpenseAccountId": "cmg97jeg5000iung857s7hlsn", // Office Equipment (Expense)
    "location": "Office Building A"
  }'
```

**Expected Results:**
- ✅ Assets created successfully
- ✅ Asset acquisition journal entries created
- ✅ Proper account assignments

### **Step 7.2: Test Depreciation Calculation**
```bash
# Test 44: Calculate depreciation for specific asset
curl -X POST http://localhost:3000/api/accounting/assets/ASSET_ID_FROM_STEP_3_1/depreciation \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "period": "2024-02"
  }'

# Test 45: Post monthly depreciation for all assets
curl -X POST http://localhost:3000/api/accounting/assets/depreciation/monthly \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{}'
```

**Expected Results:**
- ✅ Depreciation calculated correctly
- ✅ Journal entries created for depreciation
- ✅ Asset book values updated

### **Step 7.3: Test Asset Reports**
```bash
# Test 46: Get asset register
curl -X GET http://localhost:3000/api/accounting/assets/register \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 47: Get depreciation schedule
curl -X GET http://localhost:3000/api/accounting/assets/depreciation-schedule \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Complete asset register generated
- ✅ Depreciation schedule calculated
- ✅ Accurate asset valuations

---

## 🎯 **PHASE 8: MULTI-CURRENCY TESTING**

### **Step 8.1: Create Exchange Rates**
```bash
# Test 48: Create USD to ZWL exchange rate
curl -X POST http://localhost:3000/api/accounting/multi-currency/exchange-rates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "date": "2024-01-01",
    "fromCurrencyId": "USD_CURRENCY_ID",
    "toCurrencyId": "ZWL_CURRENCY_ID",
    "rate": 27.50
  }'

# Test 49: Create EUR to USD exchange rate
curl -X POST http://localhost:3000/api/accounting/multi-currency/exchange-rates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "date": "2024-01-01",
    "fromCurrencyId": "EUR_CURRENCY_ID",
    "toCurrencyId": "USD_CURRENCY_ID",
    "rate": 1.08
  }'
```

**Expected Results:**
- ✅ Exchange rates created successfully
- ✅ Historical rate tracking enabled
- ✅ Currency conversion functionality ready

### **Step 8.2: Test Currency Conversion**
```bash
# Test 50: Convert currency
curl -X POST http://localhost:3000/api/accounting/multi-currency/convert \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "amount": 1000.00,
    "fromCurrencyId": "USD_CURRENCY_ID",
    "toCurrencyId": "ZWL_CURRENCY_ID",
    "date": "2024-01-01"
  }'

# Test 51: Process multi-currency payment
curl -X POST http://localhost:3000/api/accounting/multi-currency/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "invoiceId": "INV-001",
    "paymentAmount": 1000.00,
    "paymentCurrencyId": "ZWL_CURRENCY_ID",
    "paymentDate": "2024-01-15"
  }'
```

**Expected Results:**
- ✅ Currency conversion calculated correctly
- ✅ Multi-currency payments processed
- ✅ Forex gain/loss calculated automatically

### **Step 8.3: Test Forex Gain/Loss**
```bash
# Test 52: Calculate forex gain/loss
curl -X POST http://localhost:3000/api/accounting/multi-currency/calculate-forex-gain-loss \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "invoiceId": "INV-001",
    "paymentCurrency": "ZWL",
    "paymentAmount": 27500.00
  }'

# Test 53: Post forex gain/loss
curl -X POST http://localhost:3000/api/accounting/multi-currency/post-forex-gain-loss \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "amount": 500.00,
    "currency": "ZWL",
    "gainLoss": "GAIN"
  }'
```

**Expected Results:**
- ✅ Forex gain/loss calculated accurately
- ✅ Journal entries created for forex transactions
- ✅ Multi-currency reconciliation working

---

## 🎯 **PHASE 9: CREDIT NOTE TESTING**

### **Step 9.1: Create Credit Notes**
```bash
# Test 54: Create credit note (simplified - customer and currency auto-detected from invoice)
curl -X POST http://localhost:3000/api/accounting/credit-notes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "invoiceId": "INVOICE_ID_FROM_CREATION",
    "amount": 100.00,
    "vatAmount": 15.00,
    "totalAmount": 115.00,
    "reason": "Product return - defective item"
  }'

```

**Expected Results:**
- ✅ Credit notes created successfully
- ✅ Unique credit note numbers generated
- ✅ Journal entries created for credit notes

### **Step 9.2: Test Credit Note Operations**
```bash
# Test 56: Send credit note (no body needed - user ID from authentication)
curl -X POST http://localhost:3000/api/accounting/credit-notes/CREDIT_NOTE_ID_FROM_STEP_5_1/send \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 57: Apply credit note to invoice (only invoiceId and amount needed)
curl -X POST http://localhost:3000/api/accounting/credit-notes/CREDIT_NOTE_ID_FROM_STEP_5_1/apply \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "invoiceId": "INVOICE_ID_FROM_CREATION",
    "amount": 100.00
  }'
```

**Expected Results:**
- ✅ Credit notes sent successfully
- ✅ Credit notes applied to invoices
- ✅ Application journal entries created

### **Step 9.3: Test Credit Note Reports**
```bash
# Test 58: Get credit note report
curl -X GET http://localhost:3000/api/accounting/credit-notes/report \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 59: Get customer credit notes
curl -X GET http://localhost:3000/api/accounting/credit-notes/customer/CUSTOMER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Comprehensive credit note reports generated
- ✅ Customer-specific credit notes retrieved
- ✅ Accurate credit note status tracking

---

## 🎯 **PHASE 10: STATEMENT OF ACCOUNTS TESTING**

### **Step 10.1: Generate All Statements (All Customers, All Vendors, All Currencies)**
```bash
# Test 60: Generate all customer statements for all currencies
curl -X POST http://localhost:3000/api/accounting/statements/customer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "statementDate": "2024-01-31"
  }'

# Test 61: Generate all vendor statements for all currencies
curl -X POST http://localhost:3000/api/accounting/statements/vendor \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "statementDate": "2024-01-31"
  }'
```

### **Step 10.2: Get All Statements (No ID Required)**
```bash
# Test 62: Get all customer statements
curl -X GET http://localhost:3000/api/accounting/statements/customer \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 63: Get all vendor statements
curl -X GET http://localhost:3000/api/accounting/statements/vendor \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Customer statements generated for ALL customers and ALL currencies
- ✅ Vendor statements generated for ALL vendors and ALL currencies
- ✅ Each statement labeled with its currency
- ✅ Opening and closing balances calculated correctly for each currency


---

## 🎯 **PHASE 11: BANK RECONCILIATION TESTING**

### **Step 11.1: Upload Bank Statements**
```bash
# Test 66: Upload bank statement
curl -X POST http://localhost:3000/api/accounting/bank-reconciliation/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "accountId": "Cash and Cash Equivalents",
    "statementDate": "2024-01-31",
    "openingBalance": 10000.00,
    "closingBalance": 15000.00,
    "transactions": [
      {
        "transactionDate": "2024-01-15",
        "description": "Customer Payment",
        "amount": 5000.00,
        "reference": "PAY-001"
      },
      {
        "transactionDate": "2024-01-20",
        "description": "Supplier Payment",
        "amount": -2000.00,
        "reference": "PAY-002"
      }
    ]
  }'
```

**Expected Results:**
- ✅ Bank statement uploaded successfully
- ✅ Transactions parsed correctly
- ✅ Opening/closing balances validated

### **Step 11.2: Test Reconciliation Process**
```bash
# Test 67: Get unmatched transactions
curl -X GET http://localhost:3000/api/accounting/bank-reconciliation/RECONCILIATION_ID_FROM_STEP_7_1/unmatched \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 68: Get potential matches
curl -X GET http://localhost:3000/api/accounting/bank-reconciliation/transactions/TRANSACTION_ID/matches \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Unmatched transactions identified
- ✅ Potential matches suggested
- ✅ Reconciliation process initiated

### **Step 11.3: Test Manual Reconciliation**
```bash
# Test 69: Manual reconciliation
curl -X POST http://localhost:3000/api/accounting/bank-reconciliation/manual-reconcile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "statementLineId": "STATEMENT_LINE_ID",
    "journalEntryId": "JOURNAL_ENTRY_ID"
  }'

# Test 70: Create journal from bank statement (user ID from authentication)
curl -X POST http://localhost:3000/api/accounting/bank-reconciliation/create-journal \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "statementLineId": "STATEMENT_LINE_ID",
    "accountId": "Cash and Cash Equivalents"
  }'
```

**Expected Results:**
- ✅ Manual reconciliation working
- ✅ Journal entries created from bank statements
- ✅ Reconciliation accuracy maintained

### **Step 11.4: Test Reconciliation Reports**
```bash
# Test 71: Generate reconciliation report
curl -X GET http://localhost:3000/api/accounting/bank-reconciliation/RECONCILIATION_ID_FROM_STEP_7_1/report \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 72: Get reconciliation summary
curl -X GET http://localhost:3000/api/accounting/bank-reconciliation/summary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Comprehensive reconciliation reports
- ✅ Summary statistics accurate
- ✅ Audit trail maintained

---

## 🎯 **PHASE 12: INTEGRATION TESTING**

### **Step 12.1: Cross-Module Integration**
```bash



### **Step 12.2: End-to-End Workflow Testing**
```bash
# Test 75: Complete business cycle
# 1. Create inventory item
# 2. Record stock movement
# 3. Process sales invoice
# 4. Create asset
# 5. Calculate depreciation
# 6. Generate statements
# 7. Reconcile bank statements

# Test 76: Performance testing
curl -X GET http://localhost:3000/api/accounting/inventory/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Complete business cycle working
- ✅ Performance within acceptable limits
- ✅ Data integrity maintained throughout

---


### **✅ PHASE 1: CORE ACCOUNTING SETUP**
- [ ] Database schema created successfully
- [ ] All models and relationships established
- [ ] Seed data created
- [ ] No validation errors

### **✅ PHASE 2: CUSTOMER & VENDOR MANAGEMENT**
- [ ] Customers created successfully
- [ ] Vendors created successfully
- [ ] Customer and vendor listings working
- [ ] Individual records retrievable
- [ ] Updates applied successfully

### **✅ PHASE 3: EXPENSE CATEGORIES & EXPENSES**
- [ ] Expense categories created successfully
- [ ] Expenses created successfully
- [ ] VAT calculation working
- [ ] Journal entries created automatically
- [ ] Expense listings working

### **✅ PHASE 4: INVOICE MANAGEMENT**
- [ ] Invoices created successfully
- [ ] Tax calculations accurate
- [ ] Journal entries created automatically
- [ ] Invoice listings working
- [ ] Status updates applied

### **✅ PHASE 5: JOURNAL ENTRIES & FINANCIAL REPORTING**
- [ ] Journal entries retrieved successfully
- [ ] Date filtering working
- [ ] Manual entries created correctly
- [ ] Income statement generated correctly
- [ ] Cash flow statement accurate

### **✅ PHASE 6: INVENTORY MANAGEMENT**
- [ ] Inventory items created
- [ ] Stock movements recorded
- [ ] Inventory valuation calculated
- [ ] Sales invoice processing working
- [ ] COGS calculation accurate
- [ ] Reorder level alerts generated

### **✅ PHASE 7: ASSET MANAGEMENT**
- [ ] Assets created successfully
- [ ] Depreciation calculated correctly
- [ ] Monthly/annual depreciation posting working
- [ ] Asset register generated
- [ ] Depreciation schedule accurate

### **✅ PHASE 8: MULTI-CURRENCY**
- [ ] Exchange rates created
- [ ] Currency conversion working
- [ ] Multi-currency payments processed
- [ ] Forex gain/loss calculated
- [ ] Multi-currency reconciliation working

### **✅ PHASE 9: CREDIT NOTES**
- [ ] Credit notes created
- [ ] Credit notes sent successfully
- [ ] Credit notes applied to invoices
- [ ] Credit note reports generated
- [ ] Customer credit notes retrieved

### **✅ PHASE 10: STATEMENT OF ACCOUNTS**
- [ ] Customer statements generated
- [ ] Vendor statements generated
- [ ] Statement formatting working
- [ ] Email functionality operational
- [ ] Statement management working

### **✅ PHASE 11: BANK RECONCILIATION**
- [ ] Bank statements uploaded
- [ ] Reconciliation process working
- [ ] Manual reconciliation functional
- [ ] Journal entries created from bank statements
- [ ] Reconciliation reports generated

### **✅ PHASE 12: INTEGRATION**
- [ ] Cross-module integration working
- [ ] End-to-end workflows functional
- [ ] Data consistency maintained
- [ ] Performance acceptable

### **✅ PHASE 13: ERROR HANDLING**
- [ ] Error scenarios handled gracefully
- [ ] Validation working correctly
- [ ] Edge cases managed properly
- [ ] Data integrity maintained

### **✅ PHASE 14: FINAL VERIFICATION**
- [ ] All endpoints accessible
- [ ] System fully operational
- [ ] Performance within limits
- [ ] No critical issues identified

---

## 🚀 **TESTING COMPLETION CRITERIA**

### **✅ SUCCESS CRITERIA:**
1. **All 49 test cases pass successfully**
2. **No critical errors or system failures**
3. **All business logic workflows functional**
4. **Performance within acceptable limits**
5. **Data integrity maintained throughout**
6. **Error handling working correctly**
7. **Integration between modules seamless**
8. **User experience smooth and intuitive**

### **📋 FINAL DELIVERABLES:**
- ✅ **Complete test suite executed**
- ✅ **All functionality verified**
- ✅ **Performance benchmarks met**
- ✅ **Error handling validated**
- ✅ **Integration testing completed**
- ✅ **System ready for production**

---

## 🎯 **PHASE 12: TRIAL BALANCE TESTING**

### **Step 12.1: Generate Trial Balance**
```bash
# Test 90: Generate trial balance for current date (no parameter needed)
curl -X GET "http://localhost:3000/api/accounting/trial-balance" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 91: Generate trial balance for specific date
curl -X GET "http://localhost:3000/api/accounting/trial-balance?date=2024-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 92: Generate trial balance for different date
curl -X GET "http://localhost:3000/api/accounting/trial-balance?date=2024-02-29" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **Step 12.2: Get Trial Balance Summary**
```bash
# Test 93: Get trial balance summary for current date
curl -X GET "http://localhost:3000/api/accounting/trial-balance/summary" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 94: Get trial balance summary for specific date
curl -X GET "http://localhost:3000/api/accounting/trial-balance/summary?date=2024-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **Step 12.3: Get Trial Balance by Account Type**
```bash
# Test 95: Get trial balance grouped by account type for current date
curl -X GET "http://localhost:3000/api/accounting/trial-balance/by-account-type" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 96: Get trial balance grouped by account type for specific date
curl -X GET "http://localhost:3000/api/accounting/trial-balance/by-account-type?date=2024-01-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **Step 12.4: Test Trial Balance Validation**
```bash
# Test 97: Test trial balance with no transactions
curl -X GET "http://localhost:3000/api/accounting/trial-balance?date=2023-01-01" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test 98: Test trial balance with invalid date
curl -X GET "http://localhost:3000/api/accounting/trial-balance?date=invalid-date" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ Trial balance generated successfully
- ✅ All accounts with balances included
- ✅ Debits equal credits (balanced)
- ✅ Account types properly grouped
- ✅ Summary statistics accurate
- ✅ Error handling for invalid dates

---

## 🎯 **CONCLUSION**

This comprehensive step-by-step testing guide ensures that every aspect of the accounting module is thoroughly tested and validated. Follow these tests in order to guarantee complete functionality and system reliability.

**Total Test Cases: 101**
**Expected Completion Time: 3-4 days**
**Success Rate Target: 100%**

The accounting module will be production-ready upon successful completion of all test phases! 🚀
