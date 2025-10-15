# 💰 PROCUREMENT PAYMENT PROCESSING - COMPLETE GUIDE

**Date**: October 14, 2025  
**Feature**: Vendor Payment Processing  
**Status**: ✅ **FULLY IMPLEMENTED**

---

## 🎯 OVERVIEW

This guide explains how **vendor payment processing** works in the procurement module, including the journal entries created, API endpoints, and complete workflow.

---

## 📋 TABLE OF CONTENTS

1. [How It Works](#how-it-works)
2. [Journal Entry Logic](#journal-entry-logic)
3. [API Usage](#api-usage)
4. [Testing Guide](#testing-guide)
5. [Error Handling](#error-handling)
6. [Advanced Features](#advanced-features)

---

## 🔄 HOW IT WORKS

### **Complete Procurement-to-Pay Flow**

```
┌──────────────────────────────────────────────────────────┐
│ STEP 1: Purchase Requisition                             │
│ Action: Employee submits request                         │
│ Accounting Entry: NONE                                   │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 2: Purchase Order                                   │
│ Action: Manager approves & sends PO to vendor            │
│ Accounting Entry: NONE                                   │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 3: Invoice Receipt & Approval ✅ IMPLEMENTED        │
│ Action: Vendor sends invoice, manager approves           │
│ Accounting Entry: CREATE LIABILITY                       │
│                                                           │
│   Dr  5100  Rent Expense              $5,000.00          │
│   Dr  1101  VAT Input                   $725.00          │
│       Cr  2000  Accounts Payable        $5,725.00        │
│                                                           │
│ Result: Expense recognized, liability created            │
└──────────────────────────────────────────────────────────┘
                        ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 4: Payment Processing ✅ NEW - IMPLEMENTED          │
│ Action: Finance processes payment to vendor              │
│ Accounting Entry: CLEAR LIABILITY                        │
│                                                           │
│   Dr  2000  Accounts Payable           $5,725.00         │
│       Cr  1030  Bank Account - ZIG      $5,725.00        │
│                                                           │
│ Result: Liability cleared, cash reduced                  │
└──────────────────────────────────────────────────────────┘
```

---

## 💡 JOURNAL ENTRY LOGIC

### **What Happens During Payment Processing**

#### **1. Invoice Approval** (Step 3 - Already Implemented)
Creates a **LIABILITY** (you owe the vendor):

```sql
Dr  5100  Rent Expense              $5,000.00  // Expense recognized
Dr  1101  VAT Input                   $725.00  // Tax recoverable  
    Cr  2000  Accounts Payable        $5,725.00  // Liability created
```

**Accounting Effect:**
- **Assets** ↑ (VAT Input increased by $725)
- **Expenses** ↑ (Rent increased by $5,000)
- **Liabilities** ↑ (Accounts Payable increased by $5,725)

#### **2. Payment Processing** (Step 4 - NEW!)
Clears the **LIABILITY** (you paid the vendor):

```sql
Dr  2000  Accounts Payable          $5,725.00  // Clear liability
    Cr  1030  Bank Account - ZIG      $5,725.00  // Reduce cash
```

**Accounting Effect:**
- **Liabilities** ↓ (Accounts Payable decreased by $5,725)
- **Assets** ↓ (Bank decreased by $5,725)

### **Net Effect on Financial Statements**

After both steps complete:

| Account | Type | Net Change | Why? |
|---------|------|------------|------|
| Rent Expense (5100) | Expense | ↑ +$5,000 | Expense recognized |
| VAT Input (1101) | Asset | ↑ +$725 | Tax recoverable |
| Bank - ZIG (1030) | Asset | ↓ -$5,725 | Cash paid |
| **Accounts Payable (2000)** | **Liability** | **↑+$5,725 then ↓-$5,725 = 0** | **Created then cleared** |

---

## 🚀 API USAGE

### **Endpoint**
```
POST /api/procurement/invoices/:id/payment
```

### **Authentication**
Requires Bearer Token authentication.

### **Request Headers**
```
Authorization: Bearer <your-token>
Content-Type: application/json
```

### **Request Body Parameters**

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `paymentAmount` | number | ✅ Yes | Amount to pay (can be partial) | 5725.00 |
| `paymentMethod` | string | ✅ Yes | CASH or BANK | "BANK" |
| `paymentDate` | string | ❌ No | Payment date (ISO format) | "2025-10-14T10:00:00Z" |
| `bankAccountId` | string | ❌ No | Specific bank account ID | "cmg97iy320003ung8aau6zqbv" |
| `paymentReference` | string | ❌ No | Bank transaction reference | "TXN-12345" |
| `notes` | string | ❌ No | Additional notes | "Paid via CBZ Bank" |

### **Example Requests**

#### **1. Full Payment via Bank (ZIG Account)**
```bash
curl -X POST https://your-api.com/api/procurement/invoices/inv-123/payment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentAmount": 5725.00,
    "paymentMethod": "BANK",
    "bankAccountId": "cmg97iy320003ung8aau6zqbv",
    "paymentReference": "TXN-12345",
    "notes": "Payment via ZIG account"
  }'
```

#### **2. Partial Payment**
```bash
curl -X POST https://your-api.com/api/procurement/invoices/inv-123/payment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentAmount": 3000.00,
    "paymentMethod": "BANK",
    "paymentReference": "TXN-67890",
    "notes": "Partial payment - balance to follow"
  }'
```

#### **3. Cash Payment**
```bash
curl -X POST https://your-api.com/api/procurement/invoices/inv-123/payment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "paymentAmount": 5725.00,
    "paymentMethod": "CASH",
    "notes": "Cash payment from petty cash"
  }'
```

### **Success Response**
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "data": {
    "invoice": {
      "id": "inv-123",
      "invoiceNumber": "INV-2025-001",
      "status": "APPROVED",
      "paymentStatus": "PAID",
      "totalAmount": "5725.00",
      "paymentDate": "2025-10-14T10:00:00.000Z",
      "paymentReference": "TXN-12345"
    },
    "journalEntry": {
      "id": "je-456",
      "referenceNumber": "VENDOR-PAY-INV-2025-001",
      "totalAmount": "5725.00"
    },
    "payment": {
      "amount": 5725.00,
      "remainingBalance": 0,
      "status": "PAID"
    }
  }
}
```

### **Error Responses**

#### **Invalid Payment Amount**
```json
{
  "success": false,
  "message": "Valid payment amount is required"
}
```

#### **Already Paid**
```json
{
  "success": false,
  "message": "Invoice has already been paid"
}
```

#### **Invoice Not Approved**
```json
{
  "success": false,
  "message": "Invoice must be approved before payment can be processed"
}
```

#### **Payment Exceeds Invoice Total**
```json
{
  "success": false,
  "message": "Payment amount ($10000) cannot exceed invoice total ($5725)"
}
```

---

## 🧪 TESTING GUIDE

### **Test Scenario 1: Full Payment Flow**

**Step 1: Create Purchase Order**
```bash
POST /api/procurement/purchase-orders
{
  "vendorId": "vendor-123",
  "items": [{
    "itemName": "Office Rent - October",
    "quantity": 1,
    "unitPrice": 5000
  }]
}
```

**Step 2: Create & Approve Invoice**
```bash
POST /api/procurement/invoices
{
  "purchaseOrderId": "po-123",
  "vendorId": "vendor-123",
  "invoiceDate": "2025-10-01",
  "items": [{
    "itemName": "Office Rent - October",
    "quantity": 1,
    "unitPrice": 5000
  }]
}

PUT /api/procurement/invoices/inv-123/approve
```

**Step 3: Process Payment** ✅ NEW!
```bash
POST /api/procurement/invoices/inv-123/payment
{
  "paymentAmount": 5725.00,
  "paymentMethod": "BANK",
  "bankAccountId": "zigAccount123",
  "paymentReference": "TXN-TEST-001"
}
```

**Step 4: Verify Results**
- ✅ Invoice `paymentStatus` = "PAID"
- ✅ Journal Entry created: `VENDOR-PAY-INV-2025-001`
- ✅ Accounts Payable reduced by $5,725
- ✅ Bank Account reduced by $5,725
- ✅ Trial Balance still balanced

### **Test Scenario 2: Partial Payment**

```bash
# First payment
POST /api/procurement/invoices/inv-123/payment
{
  "paymentAmount": 3000.00,
  "paymentMethod": "BANK"
}
# Result: paymentStatus = "PARTIALLY_PAID", remainingBalance = 2725.00

# Second payment
POST /api/procurement/invoices/inv-123/payment
{
  "paymentAmount": 2725.00,
  "paymentMethod": "BANK"
}
# Result: paymentStatus = "PAID", remainingBalance = 0
```

### **Test Scenario 3: Error Handling**

```bash
# Try to pay more than invoice total
POST /api/procurement/invoices/inv-123/payment
{
  "paymentAmount": 10000.00,  // Invoice total is 5725
  "paymentMethod": "BANK"
}
# Expected: 400 Bad Request - "Payment amount cannot exceed invoice total"

# Try to pay same invoice twice
POST /api/procurement/invoices/inv-123/payment
{
  "paymentAmount": 5725.00,
  "paymentMethod": "BANK"
}
# Expected: 400 Bad Request - "Invoice has already been paid"
```

---

## ⚠️ ERROR HANDLING

### **Validation Errors**

| Error | HTTP Code | Reason | Solution |
|-------|-----------|--------|----------|
| "User not authenticated" | 401 | Missing or invalid token | Provide valid Bearer token |
| "Valid payment amount is required" | 400 | Amount ≤ 0 or missing | Provide positive amount |
| "Payment method must be either CASH or BANK" | 400 | Invalid payment method | Use "CASH" or "BANK" |
| "Invoice not found" | 404 | Invalid invoice ID | Check invoice ID |
| "Invoice must be approved before payment" | 400 | Invoice not approved | Approve invoice first |
| "Invoice has already been paid" | 400 | Payment status = PAID | Cannot pay twice |
| "Payment amount exceeds invoice total" | 400 | Amount > total | Reduce payment amount |
| "Bank account with ID X not found" | 400 | Invalid bankAccountId | Use valid bank account ID or omit parameter |

---

## 🎓 ADVANCED FEATURES

### **Feature 1: Multiple Bank Accounts**

You can specify which bank account to use:

```javascript
// Use ZIG account
{
  "paymentMethod": "BANK",
  "bankAccountId": "zigAccountId"  // Dr AP, Cr 1030 (ZIG)
}

// Use default bank account
{
  "paymentMethod": "BANK"
  // No bankAccountId → uses 1000 (Cash and Cash Equivalents)
}
```

### **Feature 2: Partial Payments**

The system automatically tracks partial payments:

```javascript
// Invoice Total: $5,725

// First Payment: $3,000
POST /payment → paymentStatus: "PARTIALLY_PAID", remaining: $2,725

// Second Payment: $2,000
POST /payment → paymentStatus: "PARTIALLY_PAID", remaining: $725

// Third Payment: $725
POST /payment → paymentStatus: "PAID", remaining: $0
```

### **Feature 3: Audit Trail**

Every payment is logged:
- Who processed the payment
- When it was processed
- Payment method and reference
- Bank account used
- Journal entry created

### **Feature 4: Payment Reference Tracking**

Link payments to bank transactions:

```javascript
{
  "paymentReference": "TXN-12345-2025",
  "notes": "Paid via CBZ Bank - Transaction #12345"
}
```

This helps with bank reconciliation later.

---

## 📊 DATABASE SCHEMA UPDATES

### **ProcurementInvoice Model**

Updated fields:
```prisma
model ProcurementInvoice {
  // Existing fields...
  
  // Payment tracking (updated by payment process)
  paymentStatus    String    @default("PENDING")     // ✅ Updated
  paymentDate      DateTime?                          // ✅ Set on payment
  paymentReference String?                            // ✅ Bank reference
}
```

---

## 🔍 INTERNAL FLOW

### **Code Architecture**

```
┌─────────────────────────────────────────────────┐
│ CLIENT (Frontend/Postman)                       │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓ POST /invoices/:id/payment
┌─────────────────────────────────────────────────┐
│ ROUTE: procurementRoutes.ts                     │
│ - Authenticates user                            │
│ - Validates request                             │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────┐
│ CONTROLLER: ProcurementController               │
│ - payProcurementInvoice()                       │
│ - Validates payment data                        │
│ - Extracts user ID                              │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────┐
│ SERVICE: ProcurementService                     │
│ - payProcurementInvoice()                       │
│ - Validates invoice status                      │
│ - Calls JournalEntryService                     │
│ - Updates invoice payment status                │
│ - Creates audit log                             │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────┐
│ SERVICE: JournalEntryService                    │
│ - createVendorPaymentJournalEntry()             │
│ - Dr Accounts Payable                           │
│ - Cr Cash/Bank                                  │
│ - Creates journal entry lines                   │
└─────────────────┬───────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────┐
│ DATABASE (Prisma)                               │
│ - JournalEntry (POSTED)                         │
│ - JournalEntryLine (2 lines)                    │
│ - ProcurementInvoice (payment updated)          │
└─────────────────────────────────────────────────┘
```

---

## ✅ SUMMARY

### **What Was Implemented:**

1. ✅ **Journal Entry Method**
   - File: `src/services/JournalEntryService.ts`
   - Method: `createVendorPaymentJournalEntry()`
   - Creates: Dr Accounts Payable, Cr Cash/Bank

2. ✅ **Payment Service**
   - File: `src/services/ProcurementService.ts`
   - Method: `payProcurementInvoice()`
   - Handles: Validation, journal entry, status updates

3. ✅ **API Controller**
   - File: `src/controllers/ProcurementController.ts`
   - Method: `payProcurementInvoice()`
   - Provides: Request validation, response formatting

4. ✅ **API Route**
   - File: `src/routes/procurementRoutes.ts`
   - Route: `POST /api/procurement/invoices/:id/payment`
   - Includes: Full Swagger documentation

### **Key Features:**

- ✅ Full and partial payments
- ✅ Multiple bank accounts support
- ✅ Cash and bank payment methods
- ✅ Automatic status tracking
- ✅ Complete audit trail
- ✅ Error handling and validation
- ✅ Swagger API documentation

### **Accounting Impact:**

- ✅ Clears Accounts Payable liability
- ✅ Reduces cash/bank balance
- ✅ Maintains balanced books
- ✅ Creates complete audit trail
- ✅ Supports bank reconciliation

---

## 🚀 NEXT STEPS

The payment processing is **COMPLETE and READY TO USE**!

Optional enhancements you can add later:
1. ⏰ Payment scheduling/automation
2. ⏰ Payment approval workflow
3. ⏰ Bulk payment processing
4. ⏰ Payment reminders/alerts
5. ⏰ Integration with banking APIs

---

**Last Updated**: October 14, 2025  
**Implementation Status**: ✅ **COMPLETE**  
**Ready for Production**: Yes (after testing)


