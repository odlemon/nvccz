# 📚 PROCUREMENT MODULE - COMPLETE CRUD ENDPOINTS

**Last Updated:** January 2025  
**Important:** ⚠️ **When an entity is APPROVED, it CANNOT be modified!**

---

## 📋 **TABLE OF CONTENTS**

1. [Purchase Requisitions](#1-purchase-requisitions)
2. [RFQs](#2-rfqs-request-for-quote)
3. [Vendor Quotations](#3-vendor-quotations)
4. [Purchase Orders](#4-purchase-orders)
5. [Goods Received Notes (GRN)](#5-goods-received-notes-grn)
6. [Procurement Invoices](#6-procurement-invoices)
7. [Payments](#7-payments)
8. [Status Restrictions](#status-restrictions)

---

## 1. **PURCHASE REQUISITIONS**

### **CREATE** ✅

**Endpoint:**
```http
POST /api/procurement/requisitions
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
  "justification": "Essential operational expenses",
  "items": [
    {
      "itemName": "Office Supplies Bundle",
      "description": "Complete office supplies package",
      "quantity": 100,
      "unit": "units",
      "specifications": {}
    }
  ]
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Purchase requisition created successfully",
  "data": {
    "id": "cmi1p3xfo0027un7gcfkfq12h",
    "requisitionNumber": "REQ-1763296343261-541",
    "status": "DRAFT",
    "totalAmount": "0.00"
  }
}
```

---

### **READ - Get All** ✅

**Endpoint:**
```http
GET /api/procurement/requisitions?status=DRAFT&limit=50&offset=0
Authorization: Bearer YOUR_TOKEN
```

**Query Parameters:**
- `status`: DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CONVERTED_TO_PO
- `departmentId`: Filter by department
- `requestedById`: Filter by requester
- `priority`: LOW, MEDIUM, HIGH, URGENT
- `limit`: Number of items (default: 50)
- `offset`: Skip items (default: 0)

**Response (200):**
```json
{
  "success": true,
  "data": [...],
  "count": 10
}
```

---

### **READ - Get My Requisitions** ✅

**Endpoint:**
```http
GET /api/procurement/requisitions/my
Authorization: Bearer YOUR_TOKEN
```

**Response (200):** List of requisitions created by logged-in user

---

### **READ - Get Pending Approval (Department Head)** ✅

**Endpoint:**
```http
GET /api/procurement/requisitions/pending-approval
Authorization: Bearer YOUR_TOKEN
```

**Response (200):** List of pending requisitions for department head's department

---

### **READ - Get By ID** ✅

**Endpoint:**
```http
GET /api/procurement/requisitions/{id}
Authorization: Bearer YOUR_TOKEN
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "requisitionNumber": "...",
    "status": "DRAFT",
    "items": [...]
  }
}
```

---

### **UPDATE** ❌ **NOT IMPLEMENTED**

**Note:** Update endpoint does NOT exist. Use DELETE and CREATE if needed (only if status is DRAFT).

---

### **DELETE** ❌ **NOT IMPLEMENTED**

**Note:** Delete endpoint does NOT exist.

---

### **SUBMIT FOR APPROVAL** ✅

**Endpoint:**
```http
PUT /api/procurement/requisitions/{id}/submit
Authorization: Bearer YOUR_TOKEN
```

**Request Body:** (None - empty body)

**Response (200):**
```json
{
  "success": true,
  "message": "Purchase requisition submitted successfully",
  "data": {
    "id": "...",
    "status": "PENDING_APPROVAL"
  }
}
```

**⚠️ Restrictions:**
- Can only submit if status is `DRAFT`
- After submission, status becomes `PENDING_APPROVAL` and **CANNOT be modified**

---

### **APPROVE** ✅

**Endpoint:**
```http
PUT /api/procurement/requisitions/{id}/approve
Authorization: Bearer YOUR_TOKEN
```

**Request Body:** (None - empty body)

**Response (200):**
```json
{
  "success": true,
  "message": "Purchase requisition approved successfully",
  "data": {
    "id": "...",
    "status": "APPROVED",
    "approvedAt": "2025-01-16T12:30:00.000Z"
  }
}
```

**⚠️ Restrictions:**
- Can only approve if status is `PENDING_APPROVAL`
- After approval, status becomes `APPROVED` and **CANNOT be modified**

---

## 2. **RFQs (Request for Quote)**

### **CREATE** ✅

**Endpoint:**
```http
POST /api/procurement/rfq
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "requisitionId": "REQ_ID",
  "title": "RFQ - Office Supplies",
  "description": "Request for quotation for office supplies",
  "vendorIds": ["VENDOR_ID_1", "VENDOR_ID_2"],
  "priority": "MEDIUM",
  "expectedDeliveryDate": "2025-02-15",
  "deliveryAddress": "123 Main St",
  "rfqDeadline": "2025-02-01",
  "specialRequirements": "All prices in USD",
  "items": [
    {
      "itemName": "Office Supplies Bundle",
      "quantity": 100,
      "unit": "units"
    }
  ]
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "RFQ sent to 2 vendor(s) successfully",
  "data": {
    "rfqNumber": "RFQ-1763296343261-541",
    "status": "SENT"
  }
}
```

---

### **READ** ❌ **NOT IMPLEMENTED**

**Note:** GET endpoint for RFQs does NOT exist.

---

### **UPDATE** ❌ **NOT IMPLEMENTED**

**Note:** Update endpoint does NOT exist. RFQs cannot be modified once sent.

---

### **DELETE** ❌ **NOT IMPLEMENTED**

**Note:** Delete endpoint does NOT exist.

---

## 3. **VENDOR QUOTATIONS**

### **CREATE (PUBLIC - No Auth)** ✅

**Endpoint:**
```http
POST /api/vendor-quotations/submit
Content-Type: application/json
```

**⚠️ NO Authorization header needed! This is a PUBLIC endpoint.**

**Request Body:**
```json
{
  "rfqNumber": "RFQ-1763296343261-541",
  "vendorName": "John Doe",
  "vendorEmail": "vendor@test.com",
  "companyName": "Test Vendor Ltd",
  "taxEIN": "12-3456789",
  "contactPerson": "John Doe",
  "phoneNumber": "+263771234567",
  "address": "123 Vendor St",
  "validUntil": "2025-02-15T00:00:00.000Z",
  "currencyCode": "USD",
  "paymentTerms": "NET 30",
  "deliveryTerms": "FOB",
  "deliveryTime": "3-5 business days",
  "notes": "Best quality products",
  "items": [
    {
      "itemName": "Office Supplies Bundle",
      "description": "Complete package",
      "quantity": 100,
      "unit": "units",
      "unitPrice": 40.00,
      "specifications": {},
      "brand": "Brand X",
      "model": "Model Y",
      "warranty": "2 years"
    }
  ]
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Quotation submitted successfully",
  "data": {
    "id": "cmi1p48hv002lun7gk9gqq7bx",
    "quotationNumber": "QUOTE-1763296343261-541-001",
    "status": "SUBMITTED"
  }
}
```

---

### **READ - Get All** ✅

**Endpoint:**
```http
GET /api/vendor-quotations?status=SUBMITTED&rfqNumber=RFQ-XXX&limit=50&offset=0
Authorization: Bearer YOUR_TOKEN
```

**Query Parameters:**
- `status`: SUBMITTED, UNDER_REVIEW, ACCEPTED, REJECTED
- `rfqNumber`: Filter by RFQ number
- `vendorEmail`: Filter by vendor email
- `limit`: Number of items (default: 50)
- `offset`: Skip items (default: 0)

**Response (200):**
```json
{
  "success": true,
  "data": [...],
  "count": 5
}
```

---

### **READ - Get By RFQ** ✅

**Endpoint:**
```http
GET /api/vendor-quotations/rfq/{rfqNumber}
Authorization: Bearer YOUR_TOKEN
```

**Response (200):** List of all quotations for the specified RFQ

---

### **READ - Get By ID** ✅

**Endpoint:**
```http
GET /api/vendor-quotations/{id}
Authorization: Bearer YOUR_TOKEN
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "quotationNumber": "...",
    "status": "SUBMITTED",
    "items": [...]
  }
}
```

---

### **UPDATE** ❌ **NOT IMPLEMENTED**

**Note:** Update endpoint does NOT exist. Once submitted, quotations cannot be modified.

---

### **DELETE** ✅

**Endpoint:**
```http
DELETE /api/vendor-quotations/{id}
Authorization: Bearer YOUR_TOKEN
```

**Response (200):**
```json
{
  "success": true,
  "message": "Quotation deleted successfully"
}
```

**⚠️ Restrictions:**
- Can only delete if status is `SUBMITTED` (not reviewed yet)
- Cannot delete if status is `ACCEPTED`, `REJECTED`, or `UNDER_REVIEW`

---

### **ACCEPT** ✅

**Endpoint:**
```http
POST /api/vendor-quotations/{id}/accept
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

**Response (200):**
```json
{
  "success": true,
  "message": "Quotation accepted and Purchase Order created successfully",
  "data": {
    "quotation": {
      "id": "...",
      "status": "ACCEPTED"
    },
    "purchaseOrder": {
      "id": "...",
      "poNumber": "PO-1763296352396-251"
    }
  }
}
```

**⚠️ Restrictions:**
- Can only accept if status is `SUBMITTED`
- After acceptance, status becomes `ACCEPTED` and **CANNOT be modified**

---

### **REJECT** ✅

**Endpoint:**
```http
POST /api/vendor-quotations/{id}/reject
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "rejectionReason": "Price too high",
  "reviewNotes": "Thank you for your submission"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Quotation rejected successfully",
  "data": {
    "id": "...",
    "status": "REJECTED"
  }
}
```

**⚠️ Restrictions:**
- Can only reject if status is `SUBMITTED`
- After rejection, status becomes `REJECTED` and **CANNOT be modified**

---

## 4. **PURCHASE ORDERS**

### **CREATE** ✅

**Endpoint:**
```http
POST /api/procurement/purchase-orders
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "requisitionId": "REQ_ID",
  "quotationId": "QUOTATION_ID",
  "vendorId": "VENDOR_ID",
  "priority": "MEDIUM",
  "currencyId": "CURRENCY_ID",
  "expectedDeliveryDate": "2025-02-15T00:00:00.000Z",
  "shippingAddress": "123 Main St",
  "paymentTerms": "NET 30",
  "deliveryTerms": "FOB",
  "items": [
    {
      "itemName": "Office Supplies Bundle",
      "description": "Complete package",
      "quantity": 100,
      "unitPrice": 40.00,
      "unit": "units",
      "specifications": {}
    }
  ]
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Purchase order created successfully",
  "data": {
    "id": "cmi1p4d5a002qun7glgyy04lw",
    "poNumber": "PO-1763296352396-251",
    "status": "DRAFT"
  }
}
```

---

### **READ - Get All** ✅

**Endpoint:**
```http
GET /api/procurement/purchase-orders?status=DRAFT&vendorId=VENDOR_ID&limit=50&offset=0
Authorization: Bearer YOUR_TOKEN
```

**Query Parameters:**
- `status`: DRAFT, SENT, ACKNOWLEDGED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED
- `vendorId`: Filter by vendor
- `priority`: LOW, MEDIUM, HIGH, URGENT
- `limit`: Number of items (default: 50)
- `offset`: Skip items (default: 0)

**Response (200):**
```json
{
  "success": true,
  "data": [...],
  "count": 10
}
```

**Note:** Response includes `items` array for each PO.

---

### **READ - Get By ID** ❌ **NOT IMPLEMENTED**

**Note:** GET endpoint for single PO by ID does NOT exist. Use GET all and filter.

---

### **UPDATE** ❌ **NOT IMPLEMENTED**

**Note:** Update endpoint does NOT exist. Use DELETE and CREATE if needed (only if status is DRAFT).

---

### **DELETE** ❌ **NOT IMPLEMENTED**

**Note:** Delete endpoint does NOT exist.

---

### **SEND TO VENDOR** ✅

**Endpoint:**
```http
POST /api/procurement/purchase-orders/{id}/send
Authorization: Bearer YOUR_TOKEN
```

**Request Body:** (None - empty body)

**Response (200):**
```json
{
  "success": true,
  "message": "Purchase order sent to vendor successfully",
  "data": {
    "id": "...",
    "poNumber": "...",
    "status": "SENT",
    "sentAt": "2025-01-16T12:35:00.000Z",
    "sentById": "USER_ID"
  }
}
```

**⚠️ Restrictions:**
- Can only send if status is `DRAFT` or `PENDING`
- After sending, status becomes `SENT` and **CANNOT be modified**

---

### **CONVERT TO BILL** ✅

**Endpoint:**
```http
POST /api/procurement/purchase-orders/{id}/convert-to-bill
Authorization: Bearer YOUR_TOKEN
```

**Response (200):** Converts PO to a Creditor Bill (Invoice) in Accounting module

---

## 5. **GOODS RECEIVED NOTES (GRN)**

### **CREATE** ✅

**Endpoint:**
```http
POST /api/procurement/goods-received-notes
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

**Response (201):**
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

---

### **READ** ❌ **NOT IMPLEMENTED**

**Note:** GET endpoints for GRNs do NOT exist.

---

### **UPDATE** ❌ **NOT IMPLEMENTED**

**Note:** Update endpoint does NOT exist. GRNs cannot be modified once created.

---

### **DELETE** ❌ **NOT IMPLEMENTED**

**Note:** Delete endpoint does NOT exist.

---

## 6. **PROCUREMENT INVOICES**

### **CREATE** ✅

**Endpoint:**
```http
POST /api/procurement/invoices
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
  "currencyId": "CURRENCY_ID",
  "documentPath": "/path/to/invoice.pdf",
  "documentType": "PDF",
  "items": [
    {
      "itemName": "Office Supplies Bundle",
      "quantity": 90,
      "unitPrice": 40.00,
      "description": "Based on GRN - 90 units accepted",
      "unit": "units"
    }
  ]
}
```

**Response (201):**
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
    "totalAmount": "4140.00"
  }
}
```

---

### **READ - Get All** ✅

**Endpoint:**
```http
GET /api/procurement/invoices?status=DRAFT&vendorId=VENDOR_ID&limit=50&offset=0
Authorization: Bearer YOUR_TOKEN
```

**Query Parameters:**
- `status`: RECEIVED, PROCESSING, MATCHED, DISCREPANCY, DRAFT, APPROVED, PAID, REJECTED
- `vendorId`: Filter by vendor
- `matchingStatus`: PENDING, MATCHED, DISCREPANCY, MANUAL_REVIEW
- `limit`: Number of items (default: 50)
- `offset`: Skip items (default: 0)

**Response (200):**
```json
{
  "success": true,
  "data": [...],
  "count": 10
}
```

---

### **READ - Get By ID** ❌ **NOT IMPLEMENTED**

**Note:** GET endpoint for single invoice by ID does NOT exist. Use GET all and filter.

---

### **UPDATE** ❌ **NOT IMPLEMENTED**

**Note:** Update endpoint does NOT exist. Use DELETE and CREATE if needed (only if status is DRAFT).

---

### **DELETE** ❌ **NOT IMPLEMENTED**

**Note:** Delete endpoint does NOT exist.

---

### **PROCESS OCR DATA** ✅

**Endpoint:**
```http
POST /api/procurement/invoices/{invoiceId}/ocr
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "invoiceNumber": "INV-123",
  "invoiceDate": "2025-01-16",
  "vendorName": "Vendor Name",
  "vendorAddress": "123 St",
  "subtotal": 3600.00,
  "taxAmount": 540.00,
  "totalAmount": 4140.00,
  "items": [...]
}
```

**Response (200):** Updates invoice with OCR data, status becomes `PROCESSING`

---

### **PERFORM AI MATCHING** ✅

**Endpoint:**
```http
POST /api/procurement/invoices/{invoiceId}/ai-matching
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "matched": true,
  "matchScore": 95.5,
  "discrepancies": [
    {
      "type": "PRICE",
      "description": "Price difference of $10",
      "severity": "LOW"
    }
  ]
}
```

**Response (200):** Updates invoice with AI matching results, status becomes `MATCHED` or `DISCREPANCY`

---

### **APPROVE** ✅

**Endpoint:**
```http
PUT /api/procurement/invoices/{id}/approve
Authorization: Bearer YOUR_TOKEN
```

**Request Body:** (None - empty body)

**Response (200):**
```json
{
  "success": true,
  "message": "Procurement invoice approved successfully",
  "data": {
    "id": "...",
    "status": "APPROVED",
    "paymentStatus": "PENDING",
    "approvedAt": "2025-01-16T12:45:00.000Z"
  }
}
```

**⚠️ Restrictions:**
- Can only approve if status is `DRAFT`, `MATCHED`, or `DISCREPANCY`
- After approval, status becomes `APPROVED` and **CANNOT be modified**
- Accounting entries are NOT created at approval - they are created on payment

---

## 7. **PAYMENTS**

### **CREATE (Process Payment)** ✅

**Endpoint:**
```http
POST /api/procurement/invoices/{id}/payment
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "paymentAmount": 4140.00,
  "paymentDate": "2025-01-16T12:50:00.000Z",
  "paymentMethod": "BANK",
  "bankAccountId": "BANK_ACCOUNT_ID",
  "paymentReference": "PAY-1763296375000-123",
  "notes": "Payment processed via bank transfer"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "data": {
    "invoice": {
      "id": "...",
      "status": "PAID",
      "paymentStatus": "PAID",
      "paymentDate": "2025-01-16T12:50:00.000Z"
    },
    "journalEntry": {
      "id": "JE_EXPENSE_ID",
      "journalEntryNumber": "EXP-INV-1763296369011-469"
    },
    "paymentJournalEntry": {
      "id": "JE_PAYMENT_ID",
      "journalEntryNumber": "PAY-INV-1763296369011-469"
    }
  }
}
```

**⚠️ Restrictions:**
- Can only process payment if invoice status is `APPROVED`
- Cannot process payment if invoice is already `PAID`
- Payment amount cannot exceed invoice total
- **Accounting entries are created at payment:**
  - Expense Recognition Entry (Dr. Expense, Dr. VAT Input, Cr. Accounts Payable)
  - Payment Processing Entry (Dr. Accounts Payable, Cr. Bank/Cash)

---

### **READ** ❌ **NOT IMPLEMENTED**

**Note:** GET endpoints for payments do NOT exist. Payment data is included in invoice response.

---

### **UPDATE** ❌ **NOT IMPLEMENTED**

**Note:** Update endpoint does NOT exist. Payments cannot be modified once processed.

---

### **DELETE** ❌ **NOT IMPLEMENTED**

**Note:** Delete endpoint does NOT exist. Payments cannot be deleted.

---

## 📊 **STATUS RESTRICTIONS**

### **⚠️ CRITICAL RULE: APPROVED ENTITIES CANNOT BE MODIFIED!**

Once an entity reaches `APPROVED` status, it **CANNOT** be:
- ❌ Updated
- ❌ Deleted
- ❌ Modified in any way

This applies to:
- ✅ **Purchase Requisitions:** `APPROVED` status
- ✅ **Purchase Orders:** `SENT`, `RECEIVED` status (cannot modify after sent)
- ✅ **Procurement Invoices:** `APPROVED`, `PAID` status
- ✅ **Vendor Quotations:** `ACCEPTED`, `REJECTED` status

### **Status Flow and Restrictions:**

**Purchase Requisition:**
```
DRAFT → Can modify ❌ (no update endpoint)
  ↓
PENDING_APPROVAL → Cannot modify ⚠️
  ↓
APPROVED → Cannot modify ❌
```

**Purchase Order:**
```
DRAFT → Can delete/recreate ❌ (no update/delete endpoints)
  ↓
SENT → Cannot modify ❌
  ↓
RECEIVED → Cannot modify ❌
```

**Procurement Invoice:**
```
DRAFT → Can delete/recreate ❌ (no update/delete endpoints)
  ↓
PROCESSING → Cannot modify ⚠️
  ↓
MATCHED/DISCREPANCY → Cannot modify ⚠️
  ↓
APPROVED → Cannot modify ❌
  ↓
PAID → Cannot modify ❌
```

**Vendor Quotation:**
```
SUBMITTED → Can delete ✅ (DELETE endpoint exists)
  ↓
ACCEPTED → Cannot modify ❌
  ↓
REJECTED → Cannot modify ❌
```

---

## 📋 **SUMMARY TABLE**

| Entity | CREATE | READ (All) | READ (By ID) | UPDATE | DELETE | Special Actions |
|--------|--------|------------|--------------|--------|--------|-----------------|
| **Purchase Requisition** | ✅ | ✅ | ✅ | ❌ | ❌ | Submit ✅, Approve ✅ |
| **RFQ** | ✅ | ❌ | ❌ | ❌ | ❌ | - |
| **Vendor Quotation** | ✅ (Public) | ✅ | ✅ | ❌ | ✅* | Accept ✅, Reject ✅ |
| **Purchase Order** | ✅ | ✅ | ❌ | ❌ | ❌ | Send ✅, Convert to Bill ✅ |
| **GRN** | ✅ | ❌ | ❌ | ❌ | ❌ | - |
| **Procurement Invoice** | ✅ | ✅ | ❌ | ❌ | ❌ | OCR ✅, AI Match ✅, Approve ✅, Payment ✅ |
| **Payment** | ✅ | ❌ | ❌ | ❌ | ❌ | - |

**Notes:**
- ✅ = Implemented
- ❌ = Not implemented
- ✅* = Only if status is SUBMITTED (not reviewed)

---

## 🔒 **MODIFICATION RESTRICTIONS SUMMARY**

### **Cannot Modify:**
1. ✅ Any entity with `APPROVED` status
2. ✅ Purchase Orders with `SENT` or `RECEIVED` status
3. ✅ Invoices with `APPROVED` or `PAID` status
4. ✅ Quotations with `ACCEPTED` or `REJECTED` status
5. ✅ Payments (once processed, cannot be changed)

### **Can Delete:**
1. ✅ Vendor Quotations (only if status is `SUBMITTED`)

### **Can Modify:**
1. ✅ Purchase Requisitions (only if status is `DRAFT` - but no UPDATE endpoint exists, so must delete and recreate)
2. ✅ Vendor Quotations (only if status is `SUBMITTED` - but no UPDATE endpoint exists)

---

## 📝 **BEST PRACTICES**

1. **Before Creating:** Verify all data is correct - updates are limited
2. **Before Submitting:** Double-check requisition items - cannot modify after submission
3. **Before Approving:** Review thoroughly - cannot modify after approval
4. **Before Payment:** Verify invoice amount - cannot modify payment once processed
5. **Error Handling:** If error occurs, delete and recreate (only if status allows)

---

## 🚨 **IMPORTANT WARNINGS**

⚠️ **Once approved, entities are immutable!**  
⚠️ **No UPDATE endpoints for most entities - plan carefully!**  
⚠️ **Use DELETE and CREATE to "update" (only if status allows)!**  
⚠️ **Approved requisitions, invoices, and POs cannot be changed!**

---

**Last Updated:** January 2025  
**Status:** Complete CRUD documentation for all procurement entities

