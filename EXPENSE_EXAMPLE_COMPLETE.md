# 💰 **EXPENSE CREATION - COMPLETE EXAMPLE**

## 🎯 **What is an Expense?**

An **expense** is a cost incurred by the business that reduces the company's assets or increases its liabilities. In the accounting system, expenses are tracked with automatic VAT calculation and journal entry generation.

---

## 📋 **EXPENSE REQUEST BODY STRUCTURE**

### **API Endpoint:**
```http
POST /api/accounting/expenses
Authorization: Bearer {user_token}
Content-Type: application/json
```

### **Required Fields:**
- `vendorId` - ID of the vendor/supplier
- `category` - Expense category name (hardcoded)
- `amount` - Base amount (excluding VAT)
- `currencyId` - Currency ID
- `transactionDate` - Date of the expense
- `description` - Description of the expense

### **Optional Fields:**
- `receiptNumber` - Receipt or invoice number
- `isTaxable` - Whether VAT applies (default: false)
- `paymentMethod` - Payment method (CASH, BANK, CREDIT)

---

## 🎯 **COMPLETE REQUEST EXAMPLES**

### **1. Salaries and Wages Expense**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "category": "Salaries and Wages",
  "amount": 5000.00,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-15",
  "description": "Monthly payroll expense for January 2024",
  "receiptNumber": "PAY-2024-001",
  "isTaxable": true,
  "paymentMethod": "BANK"
}
```

**Expected Journal Entry:**
```
Dr. 5030 - Salaries and Wages        $5,000.00
Dr. 1101 - VAT Input                 $750.00
    Cr. 1000 - Cash and Cash Equivalents $5,750.00
```

### **2. Travel and Accommodation Expense**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "category": "Travel and Accommodation",
  "amount": 1200.00,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-20",
  "description": "Business travel to client meeting in Harare",
  "receiptNumber": "TRAVEL-2024-001",
  "isTaxable": true,
  "paymentMethod": "BANK"
}
```

**Expected Journal Entry:**
```
Dr. 5070 - Travel Expense            $1,200.00
Dr. 1101 - VAT Input                 $180.00
    Cr. 1000 - Cash and Cash Equivalents $1,380.00
```

### **3. Operations Expense**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "category": "Operations",
  "amount": 800.00,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-25",
  "description": "Office supplies and stationery",
  "receiptNumber": "OPS-2024-001",
  "isTaxable": true,
  "paymentMethod": "BANK"
}
```

**Expected Journal Entry:**
```
Dr. 5080 - Operations Expense        $800.00
Dr. 1101 - VAT Input                 $120.00
    Cr. 1000 - Cash and Cash Equivalents $920.00
```

### **4. Branding and Marketing Expense**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "category": "Branding and Marketing",
  "amount": 2500.00,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-30",
  "description": "Digital marketing campaign for Q1 2024",
  "receiptNumber": "MKT-2024-001",
  "isTaxable": true,
  "paymentMethod": "BANK"
}
```

**Expected Journal Entry:**
```
Dr. 5090 - Marketing Expense         $2,500.00
Dr. 1101 - VAT Input                 $375.00
    Cr. 1000 - Cash and Cash Equivalents $2,875.00
```

### **5. Office Equipment Expense**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "category": "Office Equipment",
  "amount": 3000.00,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-02-01",
  "description": "New computers and office furniture",
  "receiptNumber": "EQ-2024-001",
  "isTaxable": true,
  "paymentMethod": "BANK"
}
```

**Expected Journal Entry:**
```
Dr. 5100 - Office Equipment          $3,000.00
Dr. 1101 - VAT Input                 $450.00
    Cr. 1000 - Cash and Cash Equivalents $3,450.00
```

---

## 📊 **EXPENSE CATEGORIES (HARDCODED)**

The system uses **hardcoded category names** instead of database lookups:

1. **"Salaries and Wages"** - Employee compensation
2. **"Travel and Accommodation"** - Business travel expenses
3. **"Operations"** - General operational expenses
4. **"Branding and Marketing"** - Marketing and advertising costs
5. **"Office Equipment"** - Equipment and furniture purchases

---

## 🔢 **AUTOMATIC CALCULATIONS**

### **VAT Calculation:**
- **VAT Rate:** 15% (Zimbabwe standard rate)
- **Base Amount:** Amount provided in request
- **VAT Amount:** Base Amount × 0.15
- **Total Amount:** Base Amount + VAT Amount

### **Example Calculation:**
```javascript
Base Amount: $1,000.00
VAT Rate: 15%
VAT Amount: $1,000.00 × 0.15 = $150.00
Total Amount: $1,000.00 + $150.00 = $1,150.00
```

---

## 📋 **RESPONSE BODY EXAMPLE**

### **Successful Creation Response:**
```json
{
  "success": true,
  "message": "Expense created successfully",
  "data": {
    "id": "exp_1234567890",
    "vendorId": "cmg97iu9b0000ung8h8u3bg02",
    "category": "Salaries and Wages",
    "amount": 5000.00,
    "vatAmount": 750.00,
    "totalAmount": 5750.00,
    "currencyId": "usd_currency_id",
    "transactionDate": "2024-01-15T00:00:00.000Z",
    "description": "Monthly payroll expense for January 2024",
    "receiptNumber": "PAY-2024-001",
    "isTaxable": true,
    "paymentMethod": "BANK",
    "status": "PENDING",
    "journalEntryId": "je_1234567890",
    "createdById": "user_1234567890",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "vendor": {
      "id": "cmg97iu9b0000ung8h8u3bg02",
      "name": "ABC Services Ltd",
      "email": "contact@abcservices.com",
      "phone": "+263771234567"
    },
    "currency": {
      "id": "usd_currency_id",
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$"
    },
    "journalEntry": {
      "id": "je_1234567890",
      "referenceNumber": "EXP-2024-001",
      "status": "PENDING"
    }
  }
}
```

---

## 🎯 **EXPENSE WORKFLOW**

### **1. Expense Creation:**
- User submits expense request
- System validates required fields
- VAT calculation performed automatically
- Journal entry created automatically

### **2. Journal Entry Generation:**
- **Debit:** Appropriate expense account (based on category)
- **Debit:** VAT Input account (if taxable)
- **Credit:** Cash/Bank account

### **3. Status Tracking:**
- **PENDING** - Initial status
- **APPROVED** - Approved by manager
- **PAID** - Payment processed
- **REJECTED** - Rejected by manager

---

## 🔧 **TECHNICAL IMPLEMENTATION**

### **Database Models:**
- **Expense** - Main expense record
- **Vendor** - Supplier information
- **Currency** - Currency details
- **JournalEntry** - Automatic journal entry creation

### **Key Features:**
- ✅ **Automatic VAT calculation** (15% rate)
- ✅ **Journal entry generation** (double-entry bookkeeping)
- ✅ **Category-based accounting** (hardcoded categories)
- ✅ **Vendor integration** (existing vendor records)
- ✅ **Currency support** (multi-currency expenses)
- ✅ **Receipt tracking** (optional receipt numbers)

---

## 🎉 **SUMMARY**

An **expense** in this system is a comprehensive financial transaction that:

1. **Tracks business costs** with detailed categorization
2. **Calculates VAT automatically** (15% standard rate)
3. **Generates journal entries** for proper accounting
4. **Integrates with vendors** and currency systems
5. **Supports multiple payment methods** (Cash, Bank, Credit)
6. **Provides audit trail** with status tracking

**The expense system ensures proper financial record-keeping with automatic accounting integration!** 💰



