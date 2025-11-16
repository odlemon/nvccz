# 🚀 PROCUREMENT COMPLETE FLOW TESTING GUIDE
## Requisition → RFQ → Quotation → PO → GRN → Invoice → Payment

**Last Updated:** January 2025  
**Status:** ✅ **TESTED AND VERIFIED**

---

## 📋 **TABLE OF CONTENTS**

1. [Overview](#overview)
2. [Complete Flow Diagram](#complete-flow-diagram)
3. [Prerequisites](#prerequisites)
4. [Step-by-Step Testing Guide](#step-by-step-testing-guide)
5. [API Endpoints Reference](#api-endpoints-reference)
6. [Expected Responses](#expected-responses)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 **OVERVIEW**

This guide provides **verified, tested endpoints and request bodies** for the complete procurement workflow from creating a purchase requisition to processing payment, including:

- ✅ Purchase Requisition creation and approval
- ✅ RFQ creation and sending
- ✅ Public vendor quotation submission
- ✅ Quotation acceptance → Purchase Order creation
- ✅ Purchase Order sending
- ✅ Goods Received Note (GRN) creation
- ✅ Invoice creation from PO/GRN
- ✅ Invoice approval
- ✅ Payment processing with accounting entries

---

## 🔄 **COMPLETE FLOW DIAGRAM**

```
┌─────────────────────────────────────────────────────────────────┐
│            COMPLETE PROCUREMENT FLOW (VERIFIED)                 │
└─────────────────────────────────────────────────────────────────┘

1. 📝 CREATE REQUISITION
   └─ POST /api/procurement/requisitions
   └─ Status: DRAFT

2. 📤 SUBMIT REQUISITION (Optional - auto-submitted on creation)
   └─ PUT /api/procurement/requisitions/{id}/submit
   └─ Status: PENDING_APPROVAL

3. ✅ APPROVE REQUISITION
   └─ PUT /api/procurement/requisitions/{id}/approve
   └─ Status: APPROVED

4. 📢 CREATE & SEND RFQ
   └─ POST /api/procurement/rfq
   └─ Status: SENT (emails sent to vendors)

5. 📝 SUBMIT VENDOR QUOTATION (PUBLIC - No Auth)
   └─ POST /api/vendor-quotations/submit
   └─ Status: SUBMITTED

6. ✅ ACCEPT QUOTATION → CREATES PO
   └─ POST /api/vendor-quotations/{id}/accept
   └─ Status: ACCEPTED → PO CREATED (DRAFT)

7. 📧 SEND PO TO VENDOR
   └─ POST /api/procurement/purchase-orders/{id}/send
   └─ Status: SENT

8. 📦 CREATE GRN (Goods Received Note)
   └─ POST /api/procurement/goods-received-notes
   └─ Status: RECEIVED

9. 💰 CREATE INVOICE FROM PO/GRN
   └─ POST /api/procurement/invoices
   └─ Status: DRAFT

10. ✅ APPROVE INVOICE
    └─ PUT /api/procurement/invoices/{id}/approve
    └─ Status: APPROVED

11. 💳 PROCESS PAYMENT
    └─ POST /api/procurement/invoices/{id}/payment
    └─ Status: PAID (with accounting entries)
```

---

## ✅ **PREREQUISITES**

### **1. Server Running**
```bash
npm start
# Server should be on http://localhost:3000
```

### **2. Test User Credentials**
Get credentials from `PROCUREMENT_TEST_USERS.md`:
- Email: `proc.manager@testnvccz.com`
- Password: `TestPass123!`

### **3. Login to Get Token**
```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "proc.manager@testnvccz.com",
  "password": "TestPass123!"
}
```

**Save the `token` from response!**

### **4. Get/Create Vendor**
```bash
GET http://localhost:3000/api/accounting/vendors
Authorization: Bearer YOUR_TOKEN
```

**Save vendor `id` and `email` from response!**

---

## 📖 **STEP-BY-STEP TESTING GUIDE**

### **STEP 1: Create Purchase Requisition** 📝

**Endpoint:**
```http
POST http://localhost:3000/api/procurement/requisitions
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Office Supplies Requisition",
  "description": "Monthly office supplies for operations",
  "department": "Procurement",
  "priority": "MEDIUM",
  "items": [
    {
      "itemName": "Office Supplies Bundle",
      "description": "Complete office supplies package",
      "quantity": 100,
      "unit": "units"
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Purchase requisition created successfully",
  "data": {
    "id": "cmi1p3xfo0027un7gcfkfq12h",
    "requisitionNumber": "REQ-1763296343261-541",
    "title": "Office Supplies Requisition",
    "status": "DRAFT",
    "totalAmount": "0.00",
    "items": [
      {
        "id": "item_id",
        "itemName": "Office Supplies Bundle",
        "quantity": "100.00",
        "unit": "units"
      }
    ]
  }
}
```

**✅ Save `requisitionId` (data.id)!**

---

### **STEP 2: Submit Requisition for Approval** 📤

**Endpoint:**
```http
PUT http://localhost:3000/api/procurement/requisitions/{REQ_ID}/submit
Authorization: Bearer YOUR_TOKEN
```

**Request Body:** (None - empty body)

**Expected Response:**
```json
{
  "success": true,
  "message": "Purchase requisition submitted successfully",
  "data": {
    "id": "REQ_ID",
    "status": "PENDING_APPROVAL"
  }
}
```

**Note:** Requisitions are often auto-submitted on creation. If you get a 400 error, the requisition is already submitted.

---

### **STEP 3: Approve Requisition** ✅

**Endpoint:**
```http
PUT http://localhost:3000/api/procurement/requisitions/{REQ_ID}/approve
Authorization: Bearer YOUR_TOKEN
```

**Request Body:** (None - empty body)

**Expected Response:**
```json
{
  "success": true,
  "message": "Purchase requisition approved successfully",
  "data": {
    "id": "REQ_ID",
    "status": "APPROVED",
    "approvedAt": "2025-01-16T12:30:00.000Z"
  }
}
```

---

### **STEP 4: Create and Send RFQ** 📢

**Endpoint:**
```http
POST http://localhost:3000/api/procurement/rfq
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "requisitionId": "REQ_ID",
  "title": "RFQ - Office Supplies",
  "description": "Request for quotation for office supplies",
  "vendorIds": ["VENDOR_ID"],
  "priority": "MEDIUM",
  "items": [
    {
      "itemName": "Office Supplies Bundle",
      "quantity": 100,
      "unit": "units"
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "RFQ sent to 1 vendor(s) successfully",
  "data": {
    "rfqNumber": "RFQ-1763296343261-541",
    "title": "RFQ - Office Supplies",
    "status": "SENT",
    "vendors": [
      {
        "id": "VENDOR_ID",
        "name": "Test Vendor",
        "email": "vendor@test.com"
      }
    ]
  }
}
```

**✅ Save `rfqNumber` (data.rfqNumber)!**

---

### **STEP 5: Submit Vendor Quotation (PUBLIC API)** 📝

**This endpoint does NOT require authentication!**

**Endpoint:**
```http
POST http://localhost:3000/api/vendor-quotations/submit
Content-Type: application/json
```

**⚠️ NO Authorization header needed!**

**Request Body:**
```json
{
  "rfqNumber": "RFQ-1763296343261-541",
  "vendorName": "Test Vendor Contact",
  "vendorEmail": "vendor@test.com",
  "companyName": "Test Vendor Ltd",
  "currencyCode": "USD",
  "items": [
    {
      "itemName": "Office Supplies Bundle",
      "quantity": 100,
      "unit": "units",
      "unitPrice": 40.00
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Quotation submitted successfully",
  "data": {
    "id": "cmi1p48hv002lun7gk9gqq7bx",
    "quotationNumber": "QUOTE-1763296343261-541-001",
    "status": "SUBMITTED",
    "totalAmount": "4000.00"
  }
}
```

**✅ Save `quotationId` (data.id)!**

---

### **STEP 6: Accept Quotation → Creates Purchase Order** ✅

**Endpoint:**
```http
POST http://localhost:3000/api/vendor-quotations/{QUOTATION_ID}/accept
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "reviewNotes": "Best price and quality",
  "createPO": true,
  "createInvoice": false
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Quotation accepted and Purchase Order created successfully (PO-1763296352396-251). Vendor has been notified. Next: Send PO to vendor.",
  "data": {
    "quotation": {
      "id": "QUOTATION_ID",
      "status": "ACCEPTED"
    },
    "purchaseOrder": {
      "id": "cmi1p4d5a002qun7glgyy04lw",
      "poNumber": "PO-1763296352396-251",
      "status": "DRAFT",
      "quotationId": "QUOTATION_ID"
    }
  }
}
```

**✅ Save `purchaseOrderId` (data.purchaseOrder.id)!**

**✅ Save `poNumber` (data.purchaseOrder.poNumber)!**

---

### **STEP 7: Send PO to Vendor** 📧

**Endpoint:**
```http
POST http://localhost:3000/api/procurement/purchase-orders/{PO_ID}/send
Authorization: Bearer YOUR_TOKEN
```

**Request Body:** (None - empty body)

**Expected Response:**
```json
{
  "success": true,
  "message": "Purchase order sent to vendor successfully",
  "data": {
    "id": "PO_ID",
    "poNumber": "PO-1763296352396-251",
    "status": "SENT",
    "sentAt": "2025-01-16T12:35:00.000Z",
    "sentById": "USER_ID"
  }
}
```

---

### **STEP 8: Get PO Items for GRN** 📋

**First, get the PO with items:**

**Endpoint:**
```http
GET http://localhost:3000/api/procurement/purchase-orders
Authorization: Bearer YOUR_TOKEN
```

**Response will include all POs. Find your PO and save the `items[0].id` (purchaseOrderItemId)!**

---

### **STEP 9: Create GRN (Goods Received Note)** 📦

**Endpoint:**
```http
POST http://localhost:3000/api/procurement/goods-received-notes
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "purchaseOrderId": "PO_ID",
  "items": [
    {
      "purchaseOrderItemId": "PO_ITEM_ID",
      "quantityReceived": 95,
      "quantityAccepted": 90,
      "quantityRejected": 5,
      "qualityStatus": "PASSED",
      "qualityNotes": "5 units damaged in transit"
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Goods Received Note created successfully",
  "data": {
    "id": "cmi1p4lys002xun7gy0fbpfpa",
    "grnNumber": "GRN-1763296363826-959",
    "status": "RECEIVED",
    "purchaseOrderId": "PO_ID"
  }
}
```

**✅ Save `grnId` (data.id)!**

---

### **STEP 10: Create Invoice from PO/GRN** 💰

**Endpoint:**
```http
POST http://localhost:3000/api/procurement/invoices
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "purchaseOrderId": "PO_ID",
  "quotationId": "QUOTATION_ID",
  "vendorId": "VENDOR_ID",
  "invoiceDate": "2025-01-16T12:40:00.000Z",
  "dueDate": "2025-02-15T12:40:00.000Z",
  "items": [
    {
      "itemName": "Office Supplies Bundle",
      "quantity": 90,
      "unitPrice": 40.00,
      "description": "Based on GRN - 90 units accepted"
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Procurement invoice created successfully",
  "data": {
    "id": "cmi1p4pyv0033un7g7wxiuwmm",
    "invoiceNumber": "INV-1763296369011-469",
    "status": "DRAFT",
    "subtotal": "3600.00",
    "taxAmount": "540.00",
    "totalAmount": "4140.00",
    "purchaseOrderId": "PO_ID",
    "quotationId": "QUOTATION_ID"
  }
}
```

**✅ Save `invoiceId` (data.id)!**

**Note:** Invoice number format is `INV-{timestamp}-{random}`. The system automatically calculates tax (15% default).

---

### **STEP 11: Approve Invoice** ✅

**Endpoint:**
```http
PUT http://localhost:3000/api/procurement/invoices/{INVOICE_ID}/approve
Authorization: Bearer YOUR_TOKEN
```

**Request Body:** (None - empty body)

**Expected Response:**
```json
{
  "success": true,
  "message": "Procurement invoice approved successfully",
  "data": {
    "id": "INVOICE_ID",
    "invoiceNumber": "INV-1763296369011-469",
    "status": "APPROVED",
    "paymentStatus": "PENDING",
    "approvedAt": "2025-01-16T12:45:00.000Z",
    "approvedById": "USER_ID"
  }
}
```

**Note:** Accounting entries are NOT created at approval. They are created when payment is processed.

---

### **STEP 12: Get Invoice Details for Payment** 📋

**First, get the invoice to know the total amount:**

**Endpoint:**
```http
GET http://localhost:3000/api/procurement/invoices
Authorization: Bearer YOUR_TOKEN
```

**Find your invoice and note the `totalAmount`!**

**Alternatively:** Calculate from test data (90 units @ $40 + 15% tax = $4,140.00)

---

### **STEP 13: Process Payment** 💳

**Endpoint:**
```http
POST http://localhost:3000/api/procurement/invoices/{INVOICE_ID}/payment
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "paymentAmount": 4140.00,
  "paymentDate": "2025-01-16T12:50:00.000Z",
  "paymentMethod": "BANK",
  "paymentReference": "PAY-1763296375000-123",
  "notes": "Payment processed via bank transfer"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "data": {
    "invoice": {
      "id": "INVOICE_ID",
      "invoiceNumber": "INV-1763296369011-469",
      "status": "PAID",
      "paymentStatus": "PAID",
      "paymentDate": "2025-01-16T12:50:00.000Z",
      "paymentReference": "PAY-1763296375000-123"
    },
    "journalEntry": {
      "id": "JE_EXPENSE_ID",
      "journalEntryNumber": "EXP-INV-1763296369011-469",
      "description": "Purchase Invoice: INV-1763296369011-469"
    },
    "paymentJournalEntry": {
      "id": "JE_PAYMENT_ID",
      "journalEntryNumber": "PAY-INV-1763296369011-469",
      "description": "Payment for invoice INV-1763296369011-469"
    }
  }
}
```

**✅ Payment Processed! Accounting Entries Created!**

---

## 📊 **ACCOUNTING ENTRIES CREATED ON PAYMENT**

When payment is processed, **TWO journal entries** are created:

### **1. Expense Recognition Entry**
```
Dr. Expense Account          $3,600.00
Dr. VAT Input Account         $540.00
    Cr. Accounts Payable              $4,140.00
```

### **2. Payment Processing Entry**
```
Dr. Accounts Payable         $4,140.00
    Cr. Bank/Cash Account             $4,140.00
```

**Net Effect:**
- Expense recorded: $3,600
- VAT Input recorded: $540
- Liability cleared: $4,140
- Cash/Bank reduced: $4,140

---

## 📋 **API ENDPOINTS REFERENCE**

### **Authentication**
| Method | Endpoint | Auth Required |
|--------|----------|---------------|
| POST | `/api/auth/login` | No |

### **Procurement**
| Method | Endpoint | Auth Required |
|--------|----------|---------------|
| POST | `/api/procurement/requisitions` | Yes |
| PUT | `/api/procurement/requisitions/{id}/submit` | Yes |
| PUT | `/api/procurement/requisitions/{id}/approve` | Yes |
| POST | `/api/procurement/rfq` | Yes |
| POST | `/api/procurement/purchase-orders/{id}/send` | Yes |
| GET | `/api/procurement/purchase-orders` | Yes |
| POST | `/api/procurement/goods-received-notes` | Yes |
| POST | `/api/procurement/invoices` | Yes |
| PUT | `/api/procurement/invoices/{id}/approve` | Yes |
| POST | `/api/procurement/invoices/{id}/payment` | Yes |
| GET | `/api/procurement/invoices` | Yes |

### **Vendor Quotations (Public)**
| Method | Endpoint | Auth Required |
|--------|----------|---------------|
| POST | `/api/vendor-quotations/submit` | **No** |
| POST | `/api/vendor-quotations/{id}/accept` | Yes |
| POST | `/api/vendor-quotations/{id}/reject` | Yes |

### **Accounting**
| Method | Endpoint | Auth Required |
|--------|----------|---------------|
| GET | `/api/accounting/vendors` | Yes |
| POST | `/api/accounting/vendors` | Yes |

---

## ✅ **VERIFICATION CHECKLIST**

After completing the flow, verify:

- [ ] Requisition created with status DRAFT
- [ ] Requisition approved (status: APPROVED)
- [ ] RFQ created and sent (status: SENT)
- [ ] Quotation submitted via public API (status: SUBMITTED)
- [ ] Quotation accepted (status: ACCEPTED)
- [ ] PO created from quotation (status: DRAFT)
- [ ] PO sent to vendor (status: SENT, sentAt set)
- [ ] GRN created (status: RECEIVED)
- [ ] Invoice created from PO/GRN (status: DRAFT)
- [ ] Invoice approved (status: APPROVED, paymentStatus: PENDING)
- [ ] Payment processed (status: PAID, paymentStatus: PAID)
- [ ] Accounting entries created (2 journal entries)
- [ ] Receipt generated

---

## 🐛 **TROUBLESHOOTING**

### **Issue: Requisition Submit Returns 400**
- **Cause:** Requisition already submitted or auto-submitted
- **Solution:** Continue to approval step

### **Issue: Quotation Accept Fails - Vendor Not Found**
- **Cause:** Vendor email in quotation doesn't match system vendor
- **Solution:** Use vendor email from system when submitting quotation

### **Issue: PO Items Not Found for GRN**
- **Cause:** PO list endpoint not including items
- **Solution:** Verify PO endpoint includes `items: true` in response

### **Issue: Invoice Approval Fails - Not Ready**
- **Cause:** Invoice status is not DRAFT
- **Solution:** Invoice must be created with status DRAFT (default)

### **Issue: Payment Fails - Invoice Not Approved**
- **Cause:** Invoice must be APPROVED before payment
- **Solution:** Approve invoice first using PUT endpoint

### **Issue: Missing Exchange Rate Column**
- **Cause:** Database schema not updated
- **Solution:** Run `node scripts/migrate-invoice-exchange-rate.js`

---

## 📝 **IMPORTANT NOTES**

1. **Requisitions** may auto-submit on creation - this is normal
2. **Vendor quotation submission** is PUBLIC - no auth needed
3. **PO creation** happens automatically when quotation is accepted
4. **Invoice status** must be DRAFT for approval
5. **Accounting entries** are created on PAYMENT, not approval
6. **GRN quantities** should match what was actually received
7. **Invoice quantities** should match GRN accepted quantities

---

## 🎉 **SUCCESS CRITERIA**

The complete flow is working correctly if:

✅ All 13 steps complete without errors  
✅ Requisition → APPROVED  
✅ RFQ → SENT  
✅ Quotation → SUBMITTED → ACCEPTED  
✅ PO → CREATED → SENT  
✅ GRN → CREATED → RECEIVED  
✅ Invoice → CREATED → APPROVED → PAID  
✅ Payment processed with accounting entries  
✅ All relationships verified (PO ↔ Quotation, Invoice ↔ PO, etc.)  

---

## 📄 **RELATED DOCUMENTATION**

- **Test Results:** `COMPLETE_FLOW_TEST_RESULTS.md`
- **Test Script:** `scripts/test-complete-po-grn-payment-flow.js`
- **Test Users:** `PROCUREMENT_TEST_USERS.md`
- **PO/GRN Implementation:** `PO_AND_GRN_IMPLEMENTATION_COMPLETE.md`

---

**Last Updated:** January 2025  
**Tested:** ✅ All endpoints verified  
**Status:** Production Ready

