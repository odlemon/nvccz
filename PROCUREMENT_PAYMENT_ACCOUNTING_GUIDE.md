# 💰 PROCUREMENT PAYMENT RECORDING & ACCOUNTING IMPACT

**Date Created:** January 2025  
**Purpose:** Complete guide on how payments are recorded and their accounting impact

---

## 📋 **TABLE OF CONTENTS**

1. [Payment Recording Process](#payment-recording-process)
2. [Accounting Impact - Journal Entries](#accounting-impact---journal-entries)
3. [Timing of Accounting Entries](#timing-of-accounting-entries)
4. [Complete Flow Diagram](#complete-flow-diagram)
5. [Accounting Entry Details](#accounting-entry-details)

---

## 🎯 **PAYMENT RECORDING PROCESS**

### **When Payment is Processed:**

When a Purchase Invoice is paid, the system performs the following steps:

1. **Receives Payment Data:**
   - Payment Amount
   - Payment Date
   - Payment Method (CASH or BANK)
   - Bank Account ID (optional, for specific bank account)
   - Payment Reference (bank transaction reference)
   - Notes

2. **Validates Invoice:**
   - Invoice must be in `APPROVED` status
   - Invoice must not already be fully paid
   - Payment amount cannot exceed invoice total

3. **Creates TWO Journal Entries:**
   - **Entry 1: Expense Recognition** (Dr. Expense, Dr. VAT, Cr. Accounts Payable)
   - **Entry 2: Payment Processing** (Dr. Accounts Payable, Cr. Bank/Cash)

4. **Creates Receipt:**
   - Generates receipt number: `RCP-{invoiceNumber}-{timestamp}`
   - Stores receipt details

5. **Updates Invoice:**
   - Sets payment status to `PAID` or `PARTIALLY_PAID`
   - Records payment date and reference
   - Links to journal entries

6. **Sends Email Notification:**
   - Payment confirmation email sent to vendor
   - Includes payment details and receipt number

---

## 📊 **ACCOUNTING IMPACT - JOURNAL ENTRIES**

### **⚠️ IMPORTANT: Accounting entries are created ON PAYMENT, NOT ON APPROVAL**

When an invoice is approved, **NO accounting entries are created**. The invoice status is simply updated to `APPROVED` and payment status set to `PENDING`.

Accounting entries are only created when the invoice is **actually paid**.

---

### **JOURNAL ENTRY 1: EXPENSE RECOGNITION**

**When:** Payment processing  
**Purpose:** Recognize the expense and create Accounts Payable liability

**Double-Entry Bookkeeping:**

```
DEBIT  Expense Account (e.g., "Office Supplies Expense")
        Amount: $3,400.00 (invoice subtotal)

DEBIT  VAT Input Account (e.g., "VAT Input - Recoverable")
        Amount: $510.00 (invoice VAT/tax)

CREDIT Accounts Payable
        Amount: $3,910.00 (invoice total)
```

**Effect:**
- ✅ Expense is recognized in the books
- ✅ VAT input is recorded (can be recovered)
- ✅ Liability is created (we owe the vendor)

**Status:** `POSTED` (immediately posted)

---

### **JOURNAL ENTRY 2: PAYMENT PROCESSING**

**When:** Payment processing  
**Purpose:** Clear the Accounts Payable liability and reduce cash/bank balance

**Double-Entry Bookkeeping:**

```
DEBIT  Accounts Payable
        Amount: $3,910.00 (payment amount)

CREDIT Bank Account (or Cash Account if payment method is CASH)
        Amount: $3,910.00 (payment amount)
```

**Effect:**
- ✅ Liability is cleared (we no longer owe the vendor)
- ✅ Cash/bank balance is reduced (money leaves account)

**Status:** `POSTED` (immediately posted)

---

## ⏰ **TIMING OF ACCOUNTING ENTRIES**

### **Invoice Lifecycle:**

1. **Invoice Created (from Quotation):**
   - Status: `DRAFT`
   - No accounting entries

2. **Invoice Approved:**
   - Status: `APPROVED`
   - Payment Status: `PENDING`
   - **NO accounting entries created**

3. **Invoice Paid:**
   - Status: `APPROVED`
   - Payment Status: `PAID`
   - **✅ TWO journal entries created:**
     - Expense Recognition Entry
     - Payment Processing Entry
   - Receipt generated

---

## 🔄 **COMPLETE FLOW DIAGRAM**

```
┌─────────────────────────────────────────────────────────────────┐
│              PAYMENT RECORDING & ACCOUNTING FLOW                │
└─────────────────────────────────────────────────────────────────┘

1. VENDOR SUBMITS QUOTATION (PUBLIC - NO LOGIN)
   └──→ Quotation saved, vendor notified via email
   
2. QUOTATION ACCEPTED
   └──→ Purchase Invoice created (PI-xxx)
   └──→ Invoice Status: DRAFT
   └──→ Vendor receives acceptance email
   └──→ ❌ NO ACCOUNTING ENTRIES YET

3. INVOICE APPROVED
   └──→ Invoice Status: APPROVED
   └──→ Payment Status: PENDING
   └──→ ❌ NO ACCOUNTING ENTRIES YET

4. PAYMENT PROCESSED 💰
   │
   ├──→ STEP 1: Validate Payment
   │    └──→ Check invoice status
   │    └──→ Verify payment amount
   │
   ├──→ STEP 2: Create Journal Entry 1 (Expense Recognition)
   │    └──→ DEBIT: Expense Account ($3,400.00)
   │    └──→ DEBIT: VAT Input Account ($510.00)
   │    └──→ CREDIT: Accounts Payable ($3,910.00)
   │    └──→ Status: POSTED
   │
   ├──→ STEP 3: Create Journal Entry 2 (Payment Processing)
   │    └──→ DEBIT: Accounts Payable ($3,910.00)
   │    └──→ CREDIT: Bank/Cash Account ($3,910.00)
   │    └──→ Status: POSTED
   │
   ├──→ STEP 4: Generate Receipt
   │    └──→ Receipt Number: RCP-PI-xxx-timestamp
   │
   ├──→ STEP 5: Update Invoice
   │    └──→ Payment Status: PAID
   │    └──→ Payment Date: [date]
   │    └──→ Payment Reference: [bank ref]
   │    └──→ Receipt Number: [receipt]
   │
   └──→ STEP 6: Send Email to Vendor
        └──→ Payment confirmation with receipt

✅ ACCOUNTING ENTRIES CREATED AT PAYMENT TIME
```

---

## 📈 **ACCOUNTING ENTRY DETAILS**

### **Example: Payment of $3,910.00**

**Invoice Details:**
- Subtotal: $3,400.00
- VAT (15%): $510.00
- Total: $3,910.00
- Payment Method: BANK
- Payment Date: 2025-01-15

---

### **Journal Entry 1: Expense Recognition**

**Reference Number:** `JE-{timestamp}-{random}`  
**Description:** `Purchase Invoice: PI-1234567890-001 - ABC Supplies Ltd`  
**Transaction Date:** 2025-01-15  
**Status:** `POSTED`

**Journal Entry Lines:**

| Account | Type | Amount | Description |
|---------|------|--------|-------------|
| Office Supplies Expense | DEBIT | $3,400.00 | Expense recognition |
| VAT Input - Recoverable | DEBIT | $510.00 | VAT input recovery |
| Accounts Payable | CREDIT | $3,910.00 | Vendor liability |

**Total Debits:** $3,910.00  
**Total Credits:** $3,910.00  
**Balance:** ✅ Balanced

---

### **Journal Entry 2: Payment Processing**

**Reference Number:** `VENDOR-PAY-PI-1234567890-001`  
**Description:** `Payment to ABC Supplies Ltd for Purchase Invoice PI-1234567890-001`  
**Transaction Date:** 2025-01-15  
**Status:** `POSTED`

**Journal Entry Lines:**

| Account | Type | Amount | Description |
|---------|------|--------|-------------|
| Accounts Payable | DEBIT | $3,910.00 | Clear vendor liability |
| Bank Account (Main) | CREDIT | $3,910.00 | Payment via bank - Ref: BANK-TXN-12345 |

**Total Debits:** $3,910.00  
**Total Credits:** $3,910.00  
**Balance:** ✅ Balanced

---

## 🔍 **KEY POINTS**

1. **❌ Invoice Approval = NO Accounting Entries**
   - Only status update
   - No impact on books

2. **✅ Payment Processing = TWO Accounting Entries**
   - Expense Recognition Entry
   - Payment Processing Entry

3. **📊 Double-Entry Bookkeeping:**
   - All entries are balanced (debits = credits)
   - Entries are immediately `POSTED` (not pending)

4. **🧾 Receipt Generated:**
   - Receipt number: `RCP-{invoiceNumber}-{timestamp}`
   - Stored with invoice

5. **📧 Vendor Notified:**
   - Payment confirmation email sent
   - Includes payment details and receipt number

---

## 📝 **RECEIPT GENERATION**

When payment is processed, a receipt is automatically generated:

**Receipt Format:**
```
RCP-{InvoiceNumber}-{Timestamp}
```

**Example:**
```
RCP-PI-1234567890-001-1705324800000
```

**Receipt Details Stored:**
- Receipt Number
- Invoice ID
- Vendor ID
- Payment Amount
- Payment Method
- Payment Date
- Payment Reference
- Description

---

## 🎯 **SUMMARY**

| Stage | Accounting Entries | Status |
|-------|-------------------|--------|
| Invoice Created | ❌ None | DRAFT |
| Invoice Approved | ❌ None | APPROVED (Payment: PENDING) |
| Invoice Paid | ✅ **TWO entries created** | APPROVED (Payment: PAID) |

**Both entries are `POSTED` immediately and affect the accounting books.**

---

## 📧 **EMAIL NOTIFICATIONS**

Vendors receive email notifications at these stages:

1. **RFQ Received** - When RFQ is sent to vendor (with quotation submission link)
2. **Quotation Accepted** - When their quotation is accepted
3. **Quotation Rejected** - When their quotation is rejected
4. **Payment Confirmed** - When invoice payment is processed (includes receipt)

**Note:** Vendors do NOT need to log into the system. All communication is via email.

---

**End of Document**

