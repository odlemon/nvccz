# 🏦 Sage Pastel Cashbook Implementation Guide

## 📋 **Overview**

This implementation brings the Sage Pastel Cashbook functionality to your existing robust accounting system. Each bank account becomes a "cashbook" with Receipts and Payments journals that automatically create double-entry journal entries.

## 🏗️ **Architecture Summary**

### **Core Concept**
- **Bank Accounts as Cashbooks**: Each bank account is a separate cashbook
- **Two-Sided Structure**: Receipts Journal (money in) + Payments Journal (money out)
- **GCS Integration**: General/Customer/Supplier counterparty types
- **Automatic Journal Entries**: Every cashbook entry creates corresponding GL entries

### **Key Components**
1. **CashbookEntry Model**: Core transaction records
2. **CashbookService**: Business logic for receipts/payments
3. **Enhanced Bank Model**: Links to GL control accounts
4. **Automatic Journal Creation**: Double-entry bookkeeping
5. **Integration**: Works with existing Customer/Supplier modules

## 🚀 **Implementation Steps**

### **Step 0: Get Available Banks**

Before creating cashbook entries, you need to know which banks are available:

**Get Available Banks:**
```bash
GET /api/cashbook/banks
```

**Response:**
```json
{
  "success": true,
  "message": "Banks retrieved successfully",
  "data": [
    {
      "id": "bank-123",
      "name": "Main Bank Account - USD",
      "accountNumber": "USD-001-123456",
      "currency": {
        "code": "USD",
        "name": "US Dollar"
      },
      "glAccount": {
        "id": "gl-123",
        "accountNo": "1010",
        "accountName": "Main Bank Account - USD"
      },
      "isActive": true
    }
  ]
}
```

**Use the `id` field as `bankId` in your cashbook operations.**

### **Step 3: Link Banks to GL Accounts**

For each bank account, link it to its corresponding GL control account:
```typescript
// Example: Link "Main Bank Account" to GL account "1010 - Main Bank Account - USD"
await prisma.bank.update({
  where: { id: "bank-id" },
  data: { glAccountId: "gl-account-id" }
});
```

### **Step 4: Test the Implementation**

## 🧪 **Testing the Cashbook**

### **Test 1: Create a Cash Receipt (Customer Payment)**

**First, get a bank ID:**
```bash
GET /api/cashbook/banks
```

**Then create the receipt:**
```bash
POST /api/cashbook/receipts
{
  "bankId": "your-bank-id",
  "transactionDate": "2025-01-20",
  "description": "Payment from ABC Company",
  "amount": 5000.00,
  "reference": "EFT123456",
  "counterpartyType": "CUSTOMER",
  "customerId": "customer-id"
}
```

**Expected Result:**
- ✅ CashbookEntry created (type: RECEIPT)
- ✅ Journal Entry created:
  - Dr Bank Account: $5,000
  - Cr Accounts Receivable: $5,000
- ✅ Customer balance updated

### **Test 2: Create a Cash Payment (Vendor Payment)**

**First, get a bank ID:**
```bash
GET /api/cashbook/banks
```

**Then create the payment:**
```bash
POST /api/cashbook/payments
{
  "bankId": "your-bank-id", 
  "transactionDate": "2025-01-20",
  "description": "Payment to Office Supplies Ltd",
  "amount": 1200.00,
  "reference": "CHQ001",
  "counterpartyType": "SUPPLIER",
  "vendorId": "vendor-id"
}
```

**Expected Result:**
- ✅ CashbookEntry created (type: PAYMENT)
- ✅ Journal Entry created:
  - Dr Accounts Payable: $1,200
  - Cr Bank Account: $1,200
- ✅ Supplier balance updated

### **Test 3: Create a GL Transaction (Direct Expense)**

```bash
POST /api/cashbook/payments
{
  "bankId": "your-bank-id",
  "transactionDate": "2025-01-20", 
  "description": "Office Rent Payment",
  "amount": 2000.00,
  "reference": "EFT789",
  "counterpartyType": "GL",
  "glAccountId": "gl-account-id-for-rent-expense"
}
```

**Expected Result:**
- ✅ CashbookEntry created (type: PAYMENT)
- ✅ Journal Entry created:
  - Dr Rent Expense: $2,000
  - Cr Bank Account: $2,000

### **Test 4: Get Cash Position**

```bash
GET /api/cashbook/{bankId}/position
```

**Expected Result:**
```json
{
  "success": true,
  "data": {
    "bankName": "Main Bank Account - USD",
    "openingBalance": 0,
    "totalReceipts": 5000.00,
    "totalPayments": 3200.00,
    "currentBalance": 1800.00,
    "unreconciledCount": 3
  }
}
```

### **Test 5: Get Cash Flow Report**

```bash
GET /api/cashbook/reports/cashflow?startDate=2025-01-01&endDate=2025-01-31
```

## 🔄 **Integration with Existing Modules**

### **1. Procurement Module Integration**
When procurement payments are made, they can now use the cashbook:
```typescript
// In ProcurementService.payProcurementInvoice()
const result = await CashbookService.createCashPayment({
  bankId: paymentBankId,
  transactionDate: new Date(),
  description: `Payment for Invoice ${invoice.invoiceNumber}`,
  amount: Number(invoice.totalAmount),
  reference: paymentReference,
  counterpartyType: 'SUPPLIER',
  vendorId: invoice.vendorId,
  createdById: userId
});
```

### **2. Revenue Module Integration**
When customer payments are received:
```typescript
// In RevenueService.recordPayment()
const result = await CashbookService.createCashReceipt({
  bankId: receiptBankId,
  transactionDate: new Date(),
  description: `Payment from ${customer.name}`,
  amount: paymentAmount,
  reference: paymentReference,
  counterpartyType: 'CUSTOMER',
  customerId: customer.id,
  createdById: userId
});
```

### **3. Bank Reconciliation Integration**
The existing bank reconciliation can now match against cashbook entries:
```typescript
// Enhanced reconciliation matching
const cashbookEntries = await prisma.cashbookEntry.findMany({
  where: { 
    bankId: reconciliation.bankId,
    isReconciled: false 
  }
});
```

### **4. Balance Check Integration**
Compare cashbook entries with bank reconciliation data:
```bash
# Get comprehensive balance check
GET /api/cashbook/balance-check?bankId=cmh09d2i7000runyglxhf9s77&startDate=2025-01-01&endDate=2025-01-31
```

**Response includes:**
- Cashbook totals (receipts, payments, net balance)
- Bank reconciliation totals
- Differences and discrepancies
- Reconciliation status and recommendations

## 📊 **Key Features**

### **1. Sage Pastel GCS Implementation**
- **G (General Ledger)**: Direct posting to GL accounts
- **C (Customer)**: Automatic A/R management
- **S (Supplier)**: Automatic A/P management

### **2. Automatic Journal Entry Creation**
Every cashbook entry automatically creates balanced journal entries following double-entry principles.

### **3. Real-time Cash Position**
Track opening balance, receipts, payments, and current balance for each bank account.

### **4. Cash Flow Reporting**
Generate comprehensive cash flow reports with detailed transaction breakdowns.

### **5. Bank Reconciliation Ready**
Cashbook entries are designed to integrate with your existing bank reconciliation system.

## 🎯 **Benefits**

1. **Sage Pastel Compatibility**: Familiar workflow for users
2. **Seamless Integration**: Works with existing modules
3. **Automatic Bookkeeping**: No manual journal entry creation needed
4. **Real-time Tracking**: Immediate cash position updates
5. **Audit Trail**: Complete transaction history
6. **Multi-currency Support**: Works with your existing currency system

## 🔧 **Configuration Required**

### **1. Bank GL Account Linking**
Each bank must be linked to its GL control account:
```sql
UPDATE banks SET glAccountId = 'gl-account-id' WHERE id = 'bank-id';
```

### **2. Customer/Supplier Setup**
Ensure customers and vendors exist and are properly configured.

### **3. Chart of Accounts**
Run the seeder to ensure all required accounts exist.

## 🚨 **Important Notes**

1. **Immediate Posting**: Entries are posted to GL immediately (no batching)
2. **Balance Updates**: Customer/Supplier balances are updated automatically
3. **Reconciliation**: Cashbook entries can be marked as reconciled
4. **Audit Trail**: All transactions are logged for audit purposes

## 🧪 **Testing the Balance Check**

### **Step 1: Create Test Data**
```bash
# 1. Create a cash receipt
POST /api/cashbook/receipts
{
  "bankId": "cmh09d2i7000runyglxhf9s77",
  "amount": 5000,
  "description": "Payment from ABC Company",
  "counterpartyType": "CUSTOMER",
  "customerId": "cmgj4ckz40001unq4vdo5hs4m",
  "reference": "EFT123456"
}

# 2. Create a cash payment
POST /api/cashbook/payments
{
  "bankId": "cmh09d2i7000runyglxhf9s77",
  "amount": 1500,
  "description": "Office supplies purchase",
  "counterpartyType": "VENDOR",
  "vendorId": "your-vendor-id",
  "reference": "PO123456"
}
```

### **Step 2: Test Balance Check**
```bash
# Basic balance check (last 30 days)
GET /api/cashbook/balance-check?bankId=cmh09d2i7000runyglxhf9s77

# Custom date range
GET /api/cashbook/balance-check?bankId=cmh09d2i7000runyglxhf9s77&startDate=2025-01-01&endDate=2025-01-31
```

### **Step 3: Expected Response**
```json
{
  "success": true,
  "message": "Balance check completed successfully",
  "data": {
    "bank": {
      "id": "cmh09d2i7000runyglxhf9s77",
      "name": "Main Bank Account - USD",
      "accountNumber": "USD-001-123456",
      "currency": "USD"
    },
    "period": {
      "startDate": "2025-01-01T00:00:00.000Z",
      "endDate": "2025-01-31T23:59:59.999Z"
    },
    "cashbook": {
      "totalReceipts": 5000,
      "totalPayments": 1500,
      "netBalance": 3500,
      "entryCount": 2,
      "reconciledCount": 0,
      "unreconciledCount": 2
    },
    "bankReconciliation": {
      "totalReceipts": 0,
      "totalPayments": 0,
      "netBalance": 0,
      "reconciliationCount": 0,
      "matchedTransactions": 0,
      "unmatchedTransactions": 0
    },
    "differences": {
      "receiptDifference": 5000,
      "paymentDifference": 1500,
      "netDifference": 3500,
      "isBalanced": false
    },
    "status": {
      "isBalanced": false,
      "hasUnreconciledEntries": true,
      "hasUnmatchedTransactions": false,
      "needsAttention": true
    },
    "summary": {
      "message": "⚠️ Differences detected - review required",
      "recommendations": [
        "Review cashbook entries and bank transactions for discrepancies",
        "2 cashbook entries need reconciliation"
      ]
    }
  }
}
```

### **Step 4: Debug Information**
The endpoint includes debug logging that shows:
- Bank ID being queried
- Date range used
- Number of cashbook entries found
- Calculated totals

Check server logs for output like:
```
Balance Check Debug:
  Bank ID: cmh09d2i7000runyglxhf9s77
  Date Range: 2025-01-01T00:00:00.000Z to 2025-01-31T23:59:59.999Z
  Cashbook Entries Found: 2
  Cashbook Receipts: 5000
  Cashbook Payments: 1500
```

## 📈 **Next Steps**

1. **Implement the schema changes**
2. **Run the chart of accounts seeder**
3. **Link banks to GL accounts**
4. **Test with sample transactions**
5. **Integrate with existing modules**
6. **Train users on the new cashbook workflow**

This implementation brings professional-grade cash management to your system while maintaining compatibility with your existing robust accounting infrastructure.
