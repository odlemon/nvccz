# 📊 PROCUREMENT MODULE - COMPLETE ACCOUNTING ENTRIES GUIDE

**Date**: October 14, 2025  
**Module**: Procurement-to-Pay (P2P)  
**Status**: Chart of Accounts ✅ Ready | Implementation ⏳ Pending

---

## 🔄 COMPLETE PROCURE-TO-PAY CYCLE

### **OVERVIEW TABLE**

| Stage | Trigger | Accounting Entry Required? | Implementation Status |
|-------|---------|---------------------------|----------------------|
| 1. Purchase Requisition | Employee submits request | ❌ NO | N/A |
| 2. Purchase Order (PO) | Approver creates PO | ❌ NO | N/A |
| 3. Goods Receipt Note (GRN) | Goods physically received | ⚠️ OPTIONAL (Accrual) | ❌ Not Implemented |
| 4. Invoice Receipt | Vendor sends invoice | ❌ NO (Data capture only) | ✅ Upload exists |
| 5. Invoice Approval | Manager approves invoice | ✅ **YES - CRITICAL** | ✅ **IMPLEMENTED** |
| 6. Payment Processing | Finance pays vendor | ✅ **YES - CRITICAL** | ❌ **MISSING** |

---

## 📋 DETAILED STAGE-BY-STAGE BREAKDOWN

---

### **STAGE 1: PURCHASE REQUISITION SUBMISSION**

#### **Business Process:**
- Employee identifies need for goods/services
- Fills out requisition form with items, quantities, justification
- Submits for approval

#### **Accounting Entry:**
```
❌ NO JOURNAL ENTRY REQUIRED
```

#### **Reason:**
This is an **internal approval workflow** only. No financial commitment exists yet.

#### **Status:** ✅ No action needed

---

### **STAGE 2: PURCHASE ORDER CREATION**

#### **Business Process:**
- Approver reviews requisition
- Creates formal Purchase Order
- PO is sent to vendor
- Status: `DRAFT` → `SENT` → `ACKNOWLEDGED`

#### **Accounting Entry:**
```
❌ NO JOURNAL ENTRY REQUIRED
```

#### **Reason:**
A Purchase Order is a **commitment to purchase**, but:
- No goods/services have been received yet
- No legal obligation to pay exists until delivery
- This is an **executory contract** (both parties have obligations)

#### **Optional Enhancement:**
Some organizations use **Encumbrance Accounting** (advanced feature):
```
Dr Encumbrance Control (Budget Account)
   Cr Reserve for Encumbrance
```
This reserves budget but doesn't affect actual financials.

#### **Status:** ✅ No action needed (unless implementing encumbrance accounting)

---

### **STAGE 3: GOODS RECEIPT NOTE (GRN)**

#### **Business Process:**
- Goods physically delivered to warehouse/office
- Receiving clerk verifies quantity and quality
- Creates Goods Received Note (GRN)
- Updates PO status: `SENT` → `RECEIVED` or `PARTIALLY_RECEIVED`

#### **Accounting Entry (OPTIONAL - Accrual Accounting):**

**SCENARIO A: Goods for Resale (Inventory)**
```sql
Dr  1500  Inventory                              $10,000.00
    Cr  2020  Goods Received Not Invoiced (GRNI)  $10,000.00
```

**SCENARIO B: Goods for Immediate Use (Expense)**
```sql
Dr  5XXX  Expense Account (Rent/Supplies/IT/etc)  $5,000.00
    Cr  2020  Goods Received Not Invoiced (GRNI)   $5,000.00
```

#### **Chart of Accounts Affected:**
| Account | Account Name | Type | Dr/Cr | Effect |
|---------|-------------|------|-------|--------|
| **1500** | Inventory | Current Asset | **Dr** | ↑ Increases (goods received) |
| **5XXX** | Expense Account | Expense | **Dr** | ↑ Increases (expense incurred) |
| **2020** | Goods Received Not Invoiced (GRNI) | Current Liability | **Cr** | ↑ Increases (we owe vendor) |

#### **Accounting Effect:**
- **Assets** or **Expenses** increase (goods received)
- **Liabilities** increase (obligation to pay, even without invoice yet)
- Follows **Accrual Accounting Principle**: Record when earned/incurred, not when cash changes hands

#### **When This Entry is Reversed:**
When the vendor invoice arrives (Stage 5), this entry is reversed and replaced with the actual invoice entry.

#### **Status:** ❌ **NOT IMPLEMENTED**

#### **Implementation Priority:** 🟡 **MEDIUM**
- **Why implement**: Provides accurate financial position at month-end
- **Why skip**: Most small businesses use cash basis for procurement
- **Recommended for**: Organizations with significant inventory or monthly financial reporting requirements

---

### **STAGE 4: INVOICE RECEIPT (Upload & OCR)**

#### **Business Process:**
- Vendor emails invoice PDF
- Accounts clerk uploads to system
- OCR processes invoice (extracts data)
- AI matches invoice to PO and GRN
- Status: `RECEIVED` → `PROCESSING` → `MATCHED` or `DISCREPANCY`

#### **Accounting Entry:**
```
❌ NO JOURNAL ENTRY REQUIRED
```

#### **Reason:**
This is **data capture and validation** only. The actual accounting entry happens at Stage 5 (Approval).

#### **Status:** ✅ Already implemented (upload + OCR exists)

---

### **STAGE 5: INVOICE APPROVAL** ⭐ **CRITICAL**

#### **Business Process:**
- Manager reviews matched invoice
- Verifies amounts, terms, and approvals
- Clicks "Approve Invoice"
- Status: `MATCHED` → `APPROVED`
- Payment Status: `PENDING`

#### **Accounting Entry (REQUIRED):**

**SCENARIO A: Purchase WITH VAT**
```sql
Dr  5100  Rent Expense                      $5,000.00
Dr  1101  VAT Input                          $725.00  (14.5%)
    Cr  2000  Accounts Payable                $5,725.00
```

**SCENARIO B: Purchase WITHOUT VAT**
```sql
Dr  5130  IT and Software                   $1,200.00
    Cr  2000  Accounts Payable                $1,200.00
```

**SCENARIO C: Inventory Purchase WITH VAT**
```sql
Dr  1500  Inventory                         $10,000.00
Dr  1101  VAT Input                          $1,450.00  (14.5%)
    Cr  2000  Accounts Payable                $11,450.00
```

#### **Chart of Accounts Affected:**
| Account | Account Name | Type | Dr/Cr | Effect |
|---------|-------------|------|-------|--------|
| **5XXX** | Expense Account | Expense | **Dr** | ↑ Increases (expense recognized) |
| **1500** | Inventory | Current Asset | **Dr** | ↑ Increases (inventory received) |
| **1101** | VAT Input | Current Asset | **Dr** | ↑ Increases (recoverable tax) |
| **2000** | Accounts Payable | Current Liability | **Cr** | ↑ Increases (we owe vendor) |

#### **Accounting Effect:**
- **Expenses** increase (cost recognized)
- **Assets** increase (VAT recoverable + inventory if applicable)
- **Liabilities** increase (debt to vendor created)

#### **Special Note - If GRN was recorded (Stage 3):**
First reverse the GRNI entry:
```sql
Dr  2020  Goods Received Not Invoiced (GRNI)  $10,000.00
    Cr  1500  Inventory                        $10,000.00
```
Then record the actual invoice as shown above.

#### **Implementation Details:**
- **Service:** `ProcurementService.approveProcurementInvoice()`
- **Method Called:** `JournalEntryService.createExpenseJournalEntry()`
- **Reference Number:** `PROC-INV-{invoiceNumber}`
- **Journal Entry Status:** `POSTED`
- **Invoice Status:** `APPROVED`
- **Payment Status:** `PENDING`

#### **Status:** ✅ **FULLY IMPLEMENTED**

#### **Code Location:**
```typescript
// File: src/services/ProcurementService.ts
// Lines: 638-713
static async approveProcurementInvoice(invoiceId, approvedById) {
  // Creates journal entry automatically
  const journalEntryResult = await JournalEntryService.createExpenseJournalEntry({
    vendorId, amount, vatAmount, totalAmount, 
    currencyId, transactionDate, description, createdById
  });
  
  // Links journal entry to invoice
  // Sets paymentStatus to "PENDING"
}
```

---

### **STAGE 6: PAYMENT PROCESSING** ⭐ **CRITICAL**

#### **Business Process:**
- Finance reviews approved invoices
- Schedules payment to vendor
- Processes payment via bank transfer
- Updates invoice status
- Payment Status: `PENDING` → `PROCESSING` → `PAID`

#### **Accounting Entry (REQUIRED):**

**SCENARIO A: Payment from ZIG Bank Account**
```sql
Dr  2000  Accounts Payable                  $5,725.00
    Cr  1030  Bank Account - ZIG              $5,725.00
```

**SCENARIO B: Payment from Main Cash Account**
```sql
Dr  2000  Accounts Payable                  $11,450.00
    Cr  1000  Cash and Cash Equivalents       $11,450.00
```

**SCENARIO C: Partial Payment**
```sql
Dr  2000  Accounts Payable                  $3,000.00
    Cr  1030  Bank Account - ZIG              $3,000.00
```
(Remaining $2,725.00 balance stays in Accounts Payable)

#### **Chart of Accounts Affected:**
| Account | Account Name | Type | Dr/Cr | Effect |
|---------|-------------|------|-------|--------|
| **2000** | Accounts Payable | Current Liability | **Dr** | ↓ Decreases (debt paid off) |
| **1030** | Bank Account - ZIG | Current Asset | **Cr** | ↓ Decreases (money leaves account) |
| **1000** | Cash and Cash Equivalents | Current Asset | **Cr** | ↓ Decreases (money leaves account) |

#### **Accounting Effect:**
- **Liabilities** decrease (debt to vendor cleared)
- **Assets** decrease (cash/bank balance reduced)
- **Net effect**: Balance sheet remains balanced, but composition changes

#### **Implementation Requirements:**
1. **New Method:** `ProcurementService.payProcurementInvoice()`
2. **New Journal Entry Method:** `JournalEntryService.createVendorPaymentJournalEntry()`
3. **API Endpoint:** `POST /api/procurement/invoices/:id/payment`
4. **Parameters Required:**
   - `invoiceId`: ID of invoice being paid
   - `paymentAmount`: Amount being paid
   - `paymentMethod`: BANK, CASH, CREDIT, CHEQUE
   - `paymentDate`: Date of payment
   - `bankAccountId`: Which account to debit (1000 or 1030)
   - `paymentReference`: Bank reference number
   - `notes`: Optional payment notes

#### **Expected Journal Entry Format:**
```typescript
interface VendorPaymentJournalEntry {
  transactionDate: Date;
  referenceNumber: string;  // "VENDOR-PAY-{invoiceNumber}"
  description: string;       // "Payment to {vendorName} for invoice {invoiceNumber}"
  totalAmount: Decimal;
  currencyId: string;
  status: "POSTED";
}
```

#### **Status:** ❌ **NOT IMPLEMENTED - URGENT**

#### **Priority:** 🔴 **HIGH**
This is **critical** because without it:
- Accounts Payable liability stays on books forever
- Cash balance is never reduced
- Vendor payment history is not tracked
- Reconciliation with bank statements is impossible
- Financial statements are inaccurate

---

## 📊 ACCOUNTING ENTRIES SUMMARY TABLE

| Stage | Entry Type | Dr Account(s) | Cr Account(s) | When Posted | Status |
|-------|-----------|---------------|---------------|------------|--------|
| **1. Requisition** | None | - | - | - | N/A |
| **2. Purchase Order** | None | - | - | - | N/A |
| **3. GRN (Optional)** | Accrual | 1500 Inventory OR 5XXX Expense | 2020 GRNI | On goods receipt | ❌ Not Implemented |
| **4. Invoice Receipt** | None | - | - | - | N/A |
| **5. Invoice Approval** | Liability Creation | 5XXX Expense + 1101 VAT Input | 2000 Accounts Payable | On invoice approval | ✅ **Implemented** |
| **6. Payment** | Liability Settlement | 2000 Accounts Payable | 1030 Bank OR 1000 Cash | On payment processing | ❌ **MISSING** |

---

## 🎯 IMPLEMENTATION PRIORITY

### **IMMEDIATE (Critical):**
1. ✅ **DONE** - Chart of Accounts setup
2. ✅ **DONE** - Invoice Approval journal entry
3. ❌ **TODO** - **Payment Processing journal entry** 🔴 **URGENT**

### **MEDIUM PRIORITY (Enhanced Accuracy):**
4. ❌ **TODO** - GRN Accrual Accounting (optional but recommended)
5. ❌ **TODO** - GRNI reversal on invoice approval

### **ADVANCED (Future Enhancement):**
6. ⏰ **FUTURE** - Encumbrance accounting for budget control
7. ⏰ **FUTURE** - Three-way matching (PO + GRN + Invoice)
8. ⏰ **FUTURE** - Automated payment scheduling

---

## 💡 ACCOUNTING PRINCIPLES APPLIED

### **1. Double-Entry Bookkeeping**
Every transaction has equal debits and credits:
- Invoice Approval: Dr $5,725 = Cr $5,725 ✅
- Payment: Dr $5,725 = Cr $5,725 ✅

### **2. Accrual Accounting (Stage 3 - Optional)**
Record expenses when incurred, not when paid:
- Expense recognized when goods received (GRN)
- Not when invoice received
- Not when payment made

### **3. Matching Principle**
Expenses matched to period when benefit received:
- Rent expense matched to period of occupancy
- Inventory matched to period of sale (COGS)

### **4. Conservatism Principle**
Record liabilities as soon as obligation exists:
- GRNI records liability immediately on receipt
- Accounts Payable records liability on invoice approval

---

## 🚀 NEXT STEPS

### **Step 1: Implement Payment Processing** 🔴 **CRITICAL**

**Files to Create/Modify:**
1. `src/services/ProcurementService.ts` - Add `payProcurementInvoice()` method
2. `src/services/JournalEntryService.ts` - Add `createVendorPaymentJournalEntry()` method
3. `src/controllers/ProcurementController.ts` - Add payment endpoint
4. `src/routes/procurementRoutes.ts` - Add payment route

**Journal Entry Structure:**
```typescript
Dr  2000  Accounts Payable        $5,725.00
    Cr  1030  Bank Account - ZIG    $5,725.00
```

**Expected Outcome:**
- Invoice payment status updates to "PAID"
- Accounts Payable liability is cleared
- Bank account balance is reduced
- Full audit trail maintained

---

### **Step 2: Implement GRN Accrual (Optional)** 🟡 **MEDIUM**

**Files to Create/Modify:**
1. `src/services/ProcurementService.ts` - Add `recordGoodsReceipt()` method
2. `src/services/JournalEntryService.ts` - Add `createGRNIJournalEntry()` method
3. Modify `approveProcurementInvoice()` to reverse GRNI

**Journal Entry Structure:**
```typescript
// On GRN
Dr  1500  Inventory                  $10,000.00
    Cr  2020  GRNI                    $10,000.00

// On Invoice Approval (Reversal + New Entry)
Dr  2020  GRNI                       $10,000.00
    Cr  1500  Inventory               $10,000.00

Dr  1500  Inventory                  $10,000.00
Dr  1101  VAT Input                  $1,450.00
    Cr  2000  Accounts Payable        $11,450.00
```

---

## 📖 GLOSSARY

**Terms Used:**
- **P2P**: Procure-to-Pay (complete procurement cycle)
- **GRN**: Goods Received Note
- **GRNI**: Goods Received Not Invoiced
- **AP**: Accounts Payable
- **AR**: Accounts Receivable
- **VAT**: Value Added Tax
- **OCR**: Optical Character Recognition
- **Dr**: Debit (left side of journal entry)
- **Cr**: Credit (right side of journal entry)

---

## ✅ COMPLETION CHECKLIST

- [x] Chart of Accounts created (14 new accounts)
- [x] Invoice Approval journal entry implemented
- [ ] Payment Processing journal entry implemented 🔴 **URGENT**
- [ ] GRN Accrual accounting implemented (optional)
- [ ] API endpoints tested
- [ ] End-to-end P2P workflow tested
- [ ] Documentation updated

---

**Last Updated**: October 14, 2025  
**Document Version**: 1.0  
**Status**: Ready for Implementation 🚀


