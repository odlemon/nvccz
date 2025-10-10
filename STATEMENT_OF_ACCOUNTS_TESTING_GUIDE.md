# 📊 **STATEMENT OF ACCOUNTS SYSTEM - TESTING GUIDE**

## 📋 **OVERVIEW**

This guide will help you test the complete Statement of Accounts System implementation. The system includes:
- **Customer Statement Generation**
- **Vendor Statement Generation**
- **Transaction History Tracking**
- **Opening/Closing Balance Calculation**
- **Comprehensive Statement Reports**

## 🚀 **SETUP REQUIREMENTS**

### **1. Database Migration**
```bash
# Run the migration to create statement tables
npx prisma migrate dev --name statement-of-accounts-system
```

### **2. Test Data Setup**
Before testing, ensure you have:
- **Customers** with invoices and payments
- **Vendors** with purchase orders and payments
- **Journal entries** for various transactions
- **Credit notes** (if applicable)

## 🧪 **TESTING SCENARIOS**

### **TEST 1: Generate Customer Statement**

#### **1.1 Generate Basic Customer Statement**
```bash
POST /api/accounting/statements/customer/CUSTOMER_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "statementDate": "2024-12-31",
  "currencyId": "YOUR_CURRENCY_ID"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Customer statement generated successfully",
  "data": {
    "id": "statement_id",
    "customerId": "customer_id",
    "statementDate": "2024-12-31T00:00:00.000Z",
    "openingBalance": "0.00",
    "closingBalance": "500.00",
    "totalDebits": "1000.00",
    "totalCredits": "500.00",
    "statementType": "CUSTOMER",
    "customer": {
      "id": "customer_id",
      "name": "Customer Name",
      "email": "customer@example.com"
    },
    "currency": {
      "id": "currency_id",
      "code": "USD",
      "symbol": "$"
    },
    "statementItems": [
      {
        "id": "item_id",
        "transactionDate": "2024-01-15T00:00:00.000Z",
        "description": "Invoice INV-001",
        "reference": "INV-001",
        "debitAmount": "500.00",
        "creditAmount": "0.00",
        "balance": "500.00",
        "transactionType": "INVOICE"
      },
      {
        "id": "item_id",
        "transactionDate": "2024-02-15T00:00:00.000Z",
        "description": "Invoice INV-002",
        "reference": "INV-002",
        "debitAmount": "500.00",
        "creditAmount": "0.00",
        "balance": "1000.00",
        "transactionType": "INVOICE"
      },
      {
        "id": "item_id",
        "transactionDate": "2024-03-15T00:00:00.000Z",
        "description": "Payment received",
        "reference": "PAY-001",
        "debitAmount": "0.00",
        "creditAmount": "500.00",
        "balance": "500.00",
        "transactionType": "PAYMENT"
      }
    ]
  }
}
```

#### **1.2 Generate Customer Statement with Credit Notes**
```bash
POST /api/accounting/statements/customer/CUSTOMER_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "statementDate": "2024-12-31",
  "currencyId": "YOUR_CURRENCY_ID"
}
```

**Expected Results:**
1. **Statement includes credit notes** as separate line items
2. **Credit note transactions** show as credits
3. **Running balance** reflects credit note adjustments

### **TEST 2: Generate Vendor Statement**

#### **2.1 Generate Basic Vendor Statement**
```bash
POST /api/accounting/statements/vendor/VENDOR_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "statementDate": "2024-12-31",
  "currencyId": "YOUR_CURRENCY_ID"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Vendor statement generated successfully",
  "data": {
    "id": "statement_id",
    "vendorId": "vendor_id",
    "statementDate": "2024-12-31T00:00:00.000Z",
    "openingBalance": "0.00",
    "closingBalance": "750.00",
    "totalDebits": "1000.00",
    "totalCredits": "250.00",
    "statementType": "VENDOR",
    "vendor": {
      "id": "vendor_id",
      "name": "Vendor Name",
      "email": "vendor@example.com"
    },
    "currency": {
      "id": "currency_id",
      "code": "USD",
      "symbol": "$"
    },
    "statementItems": [
      {
        "id": "item_id",
        "transactionDate": "2024-01-15T00:00:00.000Z",
        "description": "Purchase Order PO-001",
        "reference": "PO-001",
        "debitAmount": "500.00",
        "creditAmount": "0.00",
        "balance": "500.00",
        "transactionType": "PURCHASE_ORDER"
      },
      {
        "id": "item_id",
        "transactionDate": "2024-02-15T00:00:00.000Z",
        "description": "Invoice INV-001",
        "reference": "INV-001",
        "debitAmount": "500.00",
        "creditAmount": "0.00",
        "balance": "1000.00",
        "transactionType": "INVOICE"
      },
      {
        "id": "item_id",
        "transactionDate": "2024-03-15T00:00:00.000Z",
        "description": "Payment made",
        "reference": "PAY-001",
        "debitAmount": "0.00",
        "creditAmount": "250.00",
        "balance": "750.00",
        "transactionType": "PAYMENT"
      }
    ]
  }
}
```

### **TEST 3: Statement Management**

#### **3.1 Get All Statements**
```bash
GET /api/accounting/statements?page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **3.2 Get Single Statement**
```bash
GET /api/accounting/statements/STATEMENT_ID
Authorization: Bearer YOUR_TOKEN
```

#### **3.3 Get Customer Statements**
```bash
GET /api/accounting/statements/customer/CUSTOMER_ID?page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **3.4 Get Vendor Statements**
```bash
GET /api/accounting/statements/vendor/VENDOR_ID?page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **3.5 Filter Statements by Type**
```bash
GET /api/accounting/statements?statementType=CUSTOMER&page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

### **TEST 4: Statement Dashboard**

#### **4.1 Get Statement Dashboard**
```bash
GET /api/accounting/statements/dashboard/statement-dashboard
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "totalStatements": 10,
    "customerStatements": 6,
    "vendorStatements": 4,
    "recentStatements": [
      {
        "id": "statement_id",
        "statementDate": "2024-12-31T00:00:00.000Z",
        "openingBalance": "0.00",
        "closingBalance": "500.00",
        "statementType": "CUSTOMER",
        "customer": {
          "name": "Customer Name",
          "email": "customer@example.com"
        },
        "currency": {
          "code": "USD",
          "symbol": "$"
        },
        "generatedBy": {
          "firstName": "John",
          "lastName": "Doe"
        }
      }
    ]
  }
}
```

### **TEST 5: Statement Operations**

#### **5.1 Delete Statement**
```bash
DELETE /api/accounting/statements/STATEMENT_ID
Authorization: Bearer YOUR_TOKEN
```

**Expected Results:**
1. **Statement deleted** from database
2. **Statement items deleted** (cascade delete)
3. **Audit log created** for deletion

#### **5.2 Test Cannot Generate Statement for Non-existent Customer**
```bash
POST /api/accounting/statements/customer/NON_EXISTENT_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "statementDate": "2024-12-31",
  "currencyId": "currency_id"
}
```

**Expected Response:**
```json
{
  "error": "Failed to generate customer statement",
  "details": "Customer not found"
}
```

### **TEST 6: Statement Validation**

#### **6.1 Test Statement Balance Calculation**
```bash
# Generate statement and verify:
# Opening Balance + Total Debits - Total Credits = Closing Balance
```

**Expected Calculation:**
- Opening Balance: 0.00
- Total Debits: 1000.00
- Total Credits: 500.00
- Closing Balance: 0.00 + 1000.00 - 500.00 = 500.00

#### **6.2 Test Statement Item Ordering**
```bash
# Verify statement items are ordered by transaction date
```

**Expected Results:**
1. **Items ordered chronologically** (oldest first)
2. **Running balance calculated** correctly
3. **Transaction types** properly categorized

## 🔍 **VALIDATION CHECKS**

### **1. Database Validation**
After each test, verify in your database:

```sql
-- Check statements
SELECT * FROM statement_of_accounts;

-- Check statement items
SELECT * FROM statement_items ORDER BY transaction_date;

-- Check statement relationships
SELECT s.*, si.* 
FROM statement_of_accounts s
JOIN statement_items si ON s.id = si.statement_id
WHERE s.id = 'STATEMENT_ID';
```

### **2. Statement Balance Validation**
Verify that statement balances are calculated correctly:
- **Opening Balance** + **Total Debits** - **Total Credits** = **Closing Balance**
- **Running Balance** for each item is calculated correctly
- **Statement totals** match individual item totals

### **3. Transaction Type Validation**
Verify that different transaction types are handled correctly:
- **INVOICE**: Increases customer balance (debit)
- **PAYMENT**: Decreases customer balance (credit)
- **CREDIT_NOTE**: Decreases customer balance (credit)
- **PURCHASE_ORDER**: Increases vendor balance (debit)
- **JOURNAL**: Based on journal entry lines

### **4. Statement Item Validation**
Verify that statement items include:
- **Transaction Date**: Correct date from source transaction
- **Description**: Clear description of the transaction
- **Reference**: Transaction reference number
- **Debit/Credit Amounts**: Correct amounts
- **Balance**: Running balance calculation
- **Transaction Type**: Proper categorization

## 🚨 **ERROR SCENARIOS TO TEST**

### **1. Missing Required Fields**
```bash
POST /api/accounting/statements/customer/CUSTOMER_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "customerId": "customer_id"
  // Missing required fields
}
```

### **2. Invalid Customer ID**
```bash
POST /api/accounting/statements/customer/NON_EXISTENT_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "statementDate": "2024-12-31",
  "currencyId": "currency_id"
}
```

### **3. Invalid Vendor ID**
```bash
POST /api/accounting/statements/vendor/NON_EXISTENT_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "statementDate": "2024-12-31",
  "currencyId": "currency_id"
}
```

### **4. Invalid Currency ID**
```bash
POST /api/accounting/statements/customer/CUSTOMER_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "statementDate": "2024-12-31",
  "currencyId": "NON_EXISTENT_CURRENCY_ID"
}
```

### **5. Invalid Date Format**
```bash
POST /api/accounting/statements/customer/CUSTOMER_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "statementDate": "invalid-date",
  "currencyId": "currency_id"
}
```

## 📊 **SUCCESS CRITERIA**

### **✅ All Tests Should Pass If:**
1. **Customer statements** can be generated correctly
2. **Vendor statements** can be generated correctly
3. **Statement balances** are calculated accurately
4. **Transaction history** is complete and ordered
5. **Statement items** include all required information
6. **Running balances** are calculated correctly
7. **Statement queries** return accurate data
8. **Dashboard data** is accurate and up-to-date
9. **Error handling** works for invalid inputs
10. **Database integrity** is maintained throughout

### **🎯 Key Features Verified:**
- ✅ **Customer Statement Generation**
- ✅ **Vendor Statement Generation**
- ✅ **Transaction History Tracking**
- ✅ **Balance Calculation**
- ✅ **Statement Management**
- ✅ **Dashboard Analytics**

## 🚀 **NEXT STEPS**

After successful testing:
1. **Document any issues** found during testing
2. **Verify statement calculations** are accurate
3. **Test with real data** scenarios
4. **Performance test** with large datasets
5. **Integration testing** with other modules

---

**🎉 Congratulations!** You've successfully tested the Statement of Accounts System. This system now provides:
- Complete customer and vendor statement generation
- Accurate transaction history tracking
- Proper balance calculations
- Comprehensive statement management
- Full integration with the accounting system

The system is ready for production use! 🚀

