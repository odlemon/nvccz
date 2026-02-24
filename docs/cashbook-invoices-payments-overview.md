# Cashbook, Invoices & Payments – Overview

This document describes how the **cashbook**, **customer invoices**, and **supplier invoices** (purchase invoices and procurement invoices) work, and how they connect to journal entries and payments.

---

## 1. Cashbook

### 1.1 What it is

The **cashbook** records **money in** (receipts) and **money out** (payments) against **bank accounts**. Each bank is linked to a GL account (`Bank.glAccountId` → `ChartOfAccounts`). Every cashbook entry can create a **journal entry** (double-entry) when posted.

**Model:** `CashbookEntry`  
**Service:** `CashbookService`  
**Routes:** `src/routes/cashbookRoutes.ts` (e.g. `POST /api/cashbook/receipts`, `POST /api/cashbook/payments`)

### 1.2 Entry types and counterparty

- **RECEIPT** – Money in: Dr Bank, Cr contra account (and optionally Cr VAT Output).
- **PAYMENT** – Money out: Dr contra account (and optionally Dr VAT Input), Cr Bank.

**Counterparty type** (who the money is from/to):

| CounterpartyType | Meaning | Required ID | Use case |
|------------------|--------|-------------|----------|
| **GL** | General ledger (any account) | `glAccountId` | Receipt/payment to a revenue/expense/other GL account |
| **CUSTOMER** | Customer | `customerId` | Customer payment (receipt); can be allocated to **customer invoices** |
| **SUPPLIER** | Vendor | `vendorId` | Supplier payment; can trigger control-account logic (see below) |

### 1.3 Flow: Receipt

1. **Create receipt** – `CashbookService.createCashReceipt({ bankId, transactionDate, description, amount, counterpartyType, glAccountId | customerId | vendorId, vatCode, ... })`
2. A **CashbookEntry** is created with `type: 'RECEIPT'`, `status: 'PENDING'`.
3. A **journal entry** is created immediately:
   - **Dr** Bank (bank’s GL account)
   - **Cr** Contra: if CUSTOMER → Accounts Receivable (1200); if GL → given `glAccountId`. Receipt does **not** support SUPPLIER (invalid for receipt).
   - If VAT: **Cr** VAT Output (2100).
4. Entry is set to **POSTED** and linked to the JE (`journalEntryId`).
5. If counterparty is **CUSTOMER**, `ControlAccountIntegrationService.applyCustomerPayment` is called (can auto-allocate to customer invoices if enabled).

### 1.4 Flow: Payment

1. **Create payment** – `CashbookService.createCashPayment({ bankId, transactionDate, description, amount, counterpartyType, glAccountId | customerId | vendorId, vatCode, ... })`
2. A **CashbookEntry** is created with `type: 'PAYMENT'`, `status: 'PENDING'`.
3. **If counterparty is SUPPLIER or CUSTOMER:**  
   Entry stays **PENDING**. User must **allocate** the payment to invoices (see Open Items / Payment Allocations) then **post**.
4. **If counterparty is GL:**  
   Journal entry is created immediately (Dr given GL account, optionally Dr VAT Input, Cr Bank) and entry is set to **POSTED**.
5. If counterparty is **SUPPLIER**, `ControlAccountIntegrationService.applySupplierPayment` is called (optional auto-allocation; see note below on supplier allocations).

### 1.5 Posting a PENDING payment (supplier/customer)

- **Post** – `CashbookService.postTransaction(transactionId, userId)`.
- Validates that for PAYMENT with SUPPLIER/CUSTOMER, **allocations** exist and sum to the payment amount.
- Creates the journal entry:
  - **With allocations:** builds Net + VAT from allocated **customer** invoices (from `PaymentAllocation.invoiceId` → `Invoice`), then:
    - Dr Expense/AP (net), Dr VAT Input (if any), Cr Bank.
  - **Without allocations (e.g. GL-style):** Dr contra account (AP for supplier, or given GL), optionally Dr VAT Input, Cr Bank.
- Updates cashbook entry to **POSTED** and sets `journalEntryId`.

### 1.6 Important details

- **PaymentAllocation** links a **cashbook entry** to **customer invoices** only: `cashbookEntryId` → `CashbookEntry`, `invoiceId` → `Invoice`. So “allocate payment to invoices” in the cashbook is for **customer** invoices.
- **OpenItemService.getVendorInvoices** currently returns `[]` (PaymentAllocation schema references `Invoice`, not PurchaseInvoice/ProcurementInvoice). So supplier payments from the cashbook are recorded (and posted with Dr AP, Cr Bank) but **do not** auto-allocate to purchase/procurement invoices in this table; purchase invoice payment is done via “Pay invoice” on the purchase invoice (see below).

---

## 2. Customer Invoices (Sales – `Invoice`)

### 2.1 Model and service

- **Model:** `Invoice` (customerId, amount, vatAmount, totalAmount, currencyId, status, journalEntryId, paidAmount, outstandingAmount, etc.)
- **Service:** `InvoiceService`
- **Routes:** e.g. accounting invoice routes; cashbook also exposes invoice CRUD via `CashbookInvoiceController` (same `InvoiceService`).

### 2.2 Creating an invoice

- **InvoiceService.createInvoice** creates the **Invoice** (e.g. status DRAFT) and immediately creates a **journal entry**:
  - **Dr** Accounts Receivable (1200)
  - **Cr** Revenue (and **Cr** VAT Output if taxable)
- Invoice is updated with `journalEntryId`. So every created invoice has one JE for the **sale**.

### 2.3 How the customer “pays”

Two ways:

1. **Cashbook receipt + allocation (recommended for matching bank movements)**  
   - Create a **cash receipt** with `counterpartyType: 'CUSTOMER'` and `customerId`.  
   - Optionally use **ControlAccountIntegrationService** (e.g. auto-allocate).  
   - **Allocate** the receipt to one or more customer invoices via **OpenItemService.allocatePaymentToInvoices** (creates **PaymentAllocation** and updates Invoice `paidAmount` / `outstandingAmount`).  
   - **Post** the cashbook entry if it was left PENDING; the JE is then Dr Bank, Cr AR (and VAT if split). So the “payment” is reflected by the cashbook JE + allocation to invoices.

2. **Mark invoice as paid (InvoiceService.markAsPaid)**  
   - Updates invoice `paidAmount` / `outstandingAmount` and creates a **payment journal entry** via **JournalEntryService.createInvoicePaymentJournalEntry** (Dr Cash/Bank, Cr AR).  
   - This path does **not** create a **CashbookEntry**; it’s a direct JE for payment. So you can have either:  
     - Cashbook receipt → allocation → post (cashbook + JE), or  
     - Mark as paid (JE only, no cashbook row).

---

## 3. Supplier Invoices – Two Types

### 3.1 Purchase Invoices (`PurchaseInvoice`) – “Payables” / supplier bills

- **Model:** `PurchaseInvoice` (vendorId, invoiceNumber, subtotal, vatAmount, totalAmount, status, paymentStatus, journalEntryId, paymentJournalEntryId, cashbookEntryId, paidAmount, outstandingAmount, …)
- **Service:** `PurchaseInvoiceService`
- **Routes:** `src/routes/purchaseInvoiceRoutes.ts`

**Lifecycle:**

1. **Create** – DRAFT, with line items (`PurchaseInvoiceItem`). No JE yet.
2. **Submit** – User chooses payment method:
   - **CREDIT (pay later):**  
     One **journal entry**: Dr Expense (chosen account), Dr VAT Input (if any), **Cr Accounts Payable**.  
     Invoice gets `journalEntryId`, status POSTED, paymentStatus PENDING. No cashbook entry.
   - **BANK / CASH (pay now):**  
     Creates a **cashbook payment** (and its JE) and/or direct JE (implementation may create cashbook + link); invoice is effectively paid on submit.
3. **Pay (only for CREDIT invoices)** – `PurchaseInvoiceService.payInvoice`:
   - Creates a **cashbook payment** via **CashbookService.createCashPayment** with:
     - `counterpartyType: 'GL'`
     - `glAccountId: accountsPayableAccount.id` (so the JE is Dr AP, Cr Bank).
   - Updates **PurchaseInvoice**: paymentStatus PAID/PARTIALLY_PAID, paidAmount, outstandingAmount, paymentDate, **cashbookEntryId**.
   - So the **payment** is stored as a **CashbookEntry** and its JE; the invoice stores `cashbookEntryId` to link back. There is **no** PaymentAllocation row for purchase invoices; the link is **PurchaseInvoice.cashbookEntryId → CashbookEntry**.

So: **purchase invoices we pay** are paid **through the cashbook** (one cashbook payment per pay action), and the invoice holds the cashbook entry id.

### 3.2 Procurement Invoices (`ProcurementInvoice`) – Procurement module

- **Model:** `ProcurementInvoice` (vendor, quotation, approval, journalEntryId, paymentStatus, etc.)
- **Service:** `ProcurementService` (e.g. `payProcurementInvoice`)

**Payment:**  
- **ProcurementService.payProcurementInvoice** uses **JournalEntryService.createVendorPaymentJournalEntry** (Dr Accounts Payable, Cr Bank/Cash).  
- So payment is a **journal entry** only; there is **no** CashbookEntry or PurchaseInvoice-style cashbook link. Procurement payments are **not** entered via the cashbook; they’re vendor payment JEs created in the procurement flow.

---

## 4. Summary Table

| What | Model | Payment recorded via | Link to JE / Cashbook |
|------|--------|----------------------|------------------------|
| Cashbook receipt | CashbookEntry | N/A (it is the receipt) | CashbookEntry.journalEntryId → JournalEntry |
| Cashbook payment | CashbookEntry | Post (with or without allocations) | CashbookEntry.journalEntryId → JournalEntry |
| Customer invoice (sale) | Invoice | 1) Cashbook receipt + allocation, or 2) Mark as paid | Invoice.journalEntryId (sale JE); payment = cashbook JE or payment JE from markAsPaid |
| Customer payment allocation | PaymentAllocation | Allocate then post cashbook | cashbookEntryId + invoiceId (Invoice only) |
| Purchase invoice (supplier) | PurchaseInvoice | Submit CREDIT → then Pay invoice | journalEntryId (Dr Expense, Cr AP); cashbookEntryId → CashbookEntry (payment); payment JE from cashbook |
| Procurement invoice (supplier) | ProcurementInvoice | Pay in procurement | journalEntryId (vendor payment JE); no cashbook |

---

## 5. Key files

- **Cashbook:** `src/services/CashbookService.ts`, `src/controllers/CashbookController.ts`, `src/routes/cashbookRoutes.ts`
- **Customer invoices:** `src/services/InvoiceService.ts`, `src/controllers/CashbookInvoiceController.ts` (cashbook-facing invoice CRUD)
- **Purchase invoices:** `src/services/PurchaseInvoiceService.ts`, `src/routes/purchaseInvoiceRoutes.ts`
- **Procurement invoices:** `src/services/ProcurementService.ts` (payProcurementInvoice)
- **Allocations / open items:** `src/services/OpenItemService.ts`, `src/services/ControlAccountIntegrationService.ts`
- **Journal entries:** `src/services/JournalEntryService.ts` (createInvoiceJournalEntry, createInvoicePaymentJournalEntry, createVendorPaymentJournalEntry)

---

## 6. Account numbers used (typical)

- **1000** – Cash and Cash Equivalents (default bank)
- **1200** – Accounts Receivable (customer receipts; invoice sale JE)
- **2000 / 2100** – Accounts Payable; VAT Output (2100)
- **2110 / 1300** – VAT Input
- Bank-specific GL is per **Bank** record (`Bank.glAccountId`).

This gives you the full picture: **cashbook** for bank in/out and GL/customer/supplier counterparty; **customer invoices** paid via cashbook allocation or mark-as-paid; **purchase invoices** paid via cashbook and linked by `cashbookEntryId`; **procurement invoices** paid by vendor payment JE only, no cashbook.
