# GRN (Goods Received Note) - Explanation

## What is GRN?

**GRN (Goods Received Note)** is a document that records when goods are physically received from a vendor. It's created after a Purchase Order is sent and the vendor delivers the goods.

---

## Purpose

1. **Record Physical Receipt** - Documents that goods have arrived
2. **Track Quantities** - Records received, accepted, and rejected quantities
3. **Quality Control** - Tracks quality status of received items
4. **Update PO Status** - Automatically updates Purchase Order to "RECEIVED" when all items received
5. **Inventory Tracking** - Updates quantities in the system

---

## Current Implementation Status

### ✅ **IMPLEMENTED:**
- ✅ GRN creation endpoint
- ✅ Tracks received/accepted/rejected quantities
- ✅ Quality status tracking (PENDING, PASSED, FAILED, CONDITIONAL)
- ✅ Updates Purchase Order item quantities
- ✅ Updates PO status to "RECEIVED" when all items received
- ✅ Approval workflow support (can have GRN approval stages)
- ✅ Audit logging

### ❌ **NOT IMPLEMENTED:**
- ❌ Journal entries for GRN (accounting entries)
- ❌ Inventory management integration (if applicable)

---

## GRN Workflow

### Step 1: Vendor Delivers Goods
- Goods arrive at warehouse/office
- Receiving clerk inspects the delivery

### Step 2: Create GRN
- Clerk creates GRN via: `POST /api/procurement/goods-received-notes`
- Records:
  - Quantity received (what vendor sent)
  - Quantity accepted (what we keep)
  - Quantity rejected (damaged/wrong items)
  - Quality status
  - Quality notes

### Step 3: System Updates
- Updates Purchase Order item quantities
- Updates PO status if all items received
- Creates approval request (if GRN approval configured)

### Step 4: Approval (Optional)
- If approval workflow is configured for GRN
- Designated approver reviews and approves
- Updates GRN status to "APPROVED"

---

## Request Body Example

```json
{
  "purchaseOrderId": "po_id_here",
  "items": [
    {
      "purchaseOrderItemId": "po_item_id_here",
      "quantityReceived": 100,      // What vendor sent
      "quantityAccepted": 95,        // What we accept
      "quantityRejected": 5,         // Damaged/wrong items
      "qualityStatus": "PASSED",     // PENDING, PASSED, FAILED, CONDITIONAL
      "qualityNotes": "5 units damaged during shipping"
    }
  ]
}
```

---

## Accounting Entries (NOT IMPLEMENTED)

### Currently Missing:
According to the accounting documentation, GRN should create journal entries:

**For Inventory Items:**
```
Dr Inventory Account          $X,XXX
   Cr Goods Received Not Invoiced (GRNI)  $X,XXX
```

**For Expense Items:**
```
Dr Expense Account            $X,XXX
   Cr Goods Received Not Invoiced (GRNI)  $X,XXX
```

**Why:** Records the liability (we owe the vendor) even before the invoice arrives.

**Current Status:** These entries are NOT created. Only the invoice payment creates accounting entries.

---

## Where GRN Fits in the Procurement Flow

```
1. Create Requisition → DRAFT
2. Submit Requisition → PENDING APPROVAL
3. Approve Requisition → APPROVED
4. Create RFQ → Send to vendors
5. Receive Quotations → Review
6. Accept Quotation → Creates PO
7. Send PO to Vendor → SENT
8. 🆕 **Vendor Delivers Goods** → Create GRN
9. Receive Invoice → Approve Invoice
10. Pay Invoice → PAID
```

---

## Endpoint

**POST** `/api/procurement/goods-received-notes`

**Required Role:** PROC_MGR, PROC_OFF, BUYER, or WAREHOUSE_MANAGER

**Swagger:** ✅ Documented

---

## Summary

**GRN is implemented** for tracking physical receipt of goods, but **accounting journal entries are not yet created** when GRN is created. Currently, accounting entries are only created when the invoice is approved and paid.

**Recommendation:** If you need accrual accounting (recording liability when goods are received, not when invoice arrives), we should implement the journal entries for GRN. Otherwise, the current flow (accounting on invoice payment) works for cash-basis or simplified accounting.

