# ✅ SWAGGER EXPENSE DOCUMENTATION COMPLETE

## 🎯 **All Expense Endpoints Documented in Swagger**

The Swagger documentation has been fully updated to include all expense endpoints with proper category name support, examples, and restrictions.

---

## 📋 **Expense Endpoints in Swagger**

### **1. GET** `/accounting/expenses`
- **Summary**: Get all expenses
- **Description**: Retrieve all expenses with filtering and pagination
- **Tags**: Accounting - Expenses
- **Parameters**: page, limit, vendorId, categoryId, currencyId, startDate, endDate, status, search

### **2. POST** `/accounting/expenses`
- **Summary**: Create expense
- **Description**: Create a new expense with automatic VAT calculation and journal entry generation
- **Tags**: Accounting - Expenses
- **Request Body**: CreateExpenseRequest
- **Examples**: 
  - Salaries and Wages
  - Office Equipment (Fixed Asset)
  - Travel and Accommodation

### **3. GET** `/accounting/expenses/{id}`
- **Summary**: Get expense by ID
- **Description**: Retrieve a specific expense by ID
- **Tags**: Accounting - Expenses
- **Parameters**: id

### **4. PUT** `/accounting/expenses/{id}`
- **Summary**: Update expense
- **Description**: Update an existing expense with category change restrictions
- **Tags**: Accounting - Expenses
- **Request Body**: UpdateExpenseRequest
- **Restrictions**:
  - Category cannot be changed
  - Vendor cannot be changed
  - Currency cannot be changed
  - Amount changes create reversal entries

### **5. DELETE** `/accounting/expenses/{id}`
- **Summary**: Delete expense
- **Description**: Soft delete an expense
- **Tags**: Accounting - Expenses
- **Parameters**: id

### **6. POST** `/accounting/expenses/vat-calculation`
- **Summary**: Calculate VAT
- **Description**: Calculate VAT for an expense amount
- **Tags**: Accounting - Expenses
- **Request Body**: VATCalculationRequest

---

## 📋 **Expense Category Endpoints in Swagger**

### **1. GET** `/accounting/expense-categories`
- **Summary**: Get all expense categories
- **Description**: Retrieve all expense categories with hardcoded mappings
- **Tags**: Accounting - Expense Categories

### **2. POST** `/accounting/expense-categories`
- **Summary**: Create expense category
- **Description**: Create a new expense category
- **Tags**: Accounting - Expense Categories
- **Request Body**: CreateExpenseCategoryRequest

### **3. GET** `/accounting/expense-categories/{id}`
- **Summary**: Get expense category by ID
- **Description**: Retrieve a specific expense category by ID
- **Tags**: Accounting - Expense Categories
- **Parameters**: id

### **4. PUT** `/accounting/expense-categories/{id}`
- **Summary**: Update expense category
- **Description**: Update an existing expense category
- **Tags**: Accounting - Expense Categories
- **Request Body**: UpdateExpenseCategoryRequest

### **5. DELETE** `/accounting/expense-categories/{id}`
- **Summary**: Delete expense category
- **Description**: Delete an expense category
- **Tags**: Accounting - Expense Categories
- **Parameters**: id

---

## 📊 **Updated Request/Response Schemas**

### **CreateExpenseRequest**
```json
{
  "vendorId": "string (required)",
  "category": "string (enum, required) - Category name",
  "amount": "number (required)",
  "currencyId": "string (required)",
  "transactionDate": "string (date, required)",
  "description": "string (required)",
  "receiptNumber": "string (optional)",
  "isTaxable": "boolean (required)",
  "paymentMethod": "string (enum, optional)"
}
```

**Valid Categories:**
- `"Salaries and Wages"`
- `"Travel and Accommodation"`
- `"Operations"`
- `"Branding and Marketing"`
- `"Office Equipment"`

### **UpdateExpenseRequest**
```json
{
  "amount": "number (optional) - Creates reversal if changed",
  "transactionDate": "string (date, optional)",
  "description": "string (optional)",
  "receiptNumber": "string (optional)",
  "isTaxable": "boolean (optional) - Creates reversal if changed",
  "paymentMethod": "string (enum, optional)"
}
```

**Restrictions:**
- Category cannot be changed
- Vendor cannot be changed
- Currency cannot be changed

---

## 🎯 **Hardcoded Category Mappings**

| Category | Account | Account Name | Type | Statement |
|----------|---------|--------------|------|-----------|
| **Salaries and Wages** | 5030 | Salaries and Wages | Expense | Income Statement |
| **Travel and Accommodation** | 5070 | Travel Expense | Expense | Income Statement |
| **Operations** | 5090 | Other Operating Expenses | Expense | Income Statement |
| **Branding and Marketing** | 5060 | Marketing Expense | Expense | Income Statement |
| **Office Equipment** | 1100 | Office Equipment | Fixed Asset | Balance Sheet |

---

## 💡 **Request Examples in Swagger**

### **1. Salaries and Wages**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "category": "Salaries and Wages",
  "amount": 5000,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-15",
  "description": "Monthly payroll expense",
  "isTaxable": true,
  "paymentMethod": "BANK",
  "receiptNumber": "PAY-2024-001"
}
```

### **2. Office Equipment (Fixed Asset)**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "category": "Office Equipment",
  "amount": 2500,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-15",
  "description": "Computer purchase",
  "isTaxable": true,
  "paymentMethod": "BANK"
}
```

### **3. Travel and Accommodation**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "category": "Travel and Accommodation",
  "amount": 1200,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-15",
  "description": "Business travel expenses",
  "isTaxable": true,
  "paymentMethod": "BANK"
}
```

---

## 🎯 **Swagger Features Implemented**

### ✅ **Complete Documentation:**
- All expense endpoints documented
- All expense category endpoints documented
- Request/response schemas updated
- Parameter descriptions added

### ✅ **Category Name Support:**
- Updated schemas to use `category` instead of `categoryId`
- Added enum values for valid categories
- Clear examples with category names

### ✅ **Update Restrictions:**
- Clear documentation of what cannot be changed
- Explanation of reversal journal entries
- Category change prevention clearly stated

### ✅ **Comprehensive Examples:**
- Multiple request examples provided
- Different category scenarios shown
- Office Equipment as Fixed Asset highlighted

### ✅ **Account Mappings:**
- Hardcoded category mappings documented
- Account numbers and names shown
- Financial statement impact explained

---

## 🎉 **Production Ready**

✅ **All expense endpoints** are properly documented in Swagger  
✅ **Category names** work directly in API requests  
✅ **Update restrictions** clearly documented  
✅ **Reversal journal entries** behavior explained  
✅ **Comprehensive examples** provided for all scenarios  
✅ **Hardcoded account mappings** documented  
✅ **Office Equipment** correctly shown as Fixed Asset  

The Swagger documentation is now **complete and production-ready**! 🎯
