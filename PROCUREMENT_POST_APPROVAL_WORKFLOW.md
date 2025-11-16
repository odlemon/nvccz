# 📋 WHAT HAPPENS AFTER REQUISITION IS APPROVED

**Date:** January 2025  
**Status:** Complete RFQ-Based Workflow

---

## 🎯 **NEXT STEPS AFTER REQUISITION APPROVAL**

After a requisition is approved, the system follows an **RFQ (Request for Quote) based procurement workflow**:

---

## 📊 **COMPLETE POST-APPROVAL WORKFLOW**

```
✅ REQUISITION APPROVED
   ↓
📧 STEP 1: CREATE & SEND RFQ
   ├── Select MULTIPLE vendors (by vendor IDs)
   ├── RFQ sent to ALL selected vendors via email
   ├── Email includes "Submit Quotation Online" link
   └── Status: RFQ_SENT
   ↓
💻 STEP 2: VENDORS SUBMIT QUOTATIONS
   ├── Vendors click link in RFQ email
   ├── Public quotation form (NO login required)
   ├── Vendors enter prices and terms
   └── Status: QUOTATION_SUBMITTED
   ↓
📊 STEP 3: REVIEW & COMPARE QUOTATIONS
   ├── View all submitted quotations
   ├── Compare prices and terms
   └── Select winning quotation
   ↓
✅ STEP 4: ACCEPT WINNING QUOTATION
   ├── Accept the best quotation
   ├── System AUTOMATICALLY creates invoice from quotation
   ├── Email sent to winning vendor
   └── Status: QUOTATION_ACCEPTED (Invoice: DRAFT)
   ↓
❌ STEP 5: REJECT OTHER QUOTATIONS
   ├── Reject non-winning quotations with reason
   ├── Email sent to rejected vendors
   └── Status: QUOTATION_REJECTED
   ↓
✅ STEP 6: APPROVE INVOICE
   ├── Invoice approval workflow triggers (if configured)
   ├── Approve invoice
   ├── 💰 ACCOUNTING ENTRY CREATED:
   │   Dr. Expense Account (Rent/Supplies/etc.)
   │   Dr. VAT Input (if applicable)
   │   Cr. Accounts Payable
   └── Status: INVOICE_APPROVED
   ↓
💳 STEP 7: PROCESS PAYMENT
   ├── Select payment method (Bank/Cash)
   ├── Enter payment reference
   ├── 💰 ACCOUNTING ENTRY CREATED:
   │   Dr. Accounts Payable
   │   Cr. Cash/Bank Account
   ├── Email payment confirmation sent to vendor
   └── Status: PAID
   ↓
✅ CYCLE COMPLETE
```

---

## 🔧 **STEP-BY-STEP ACTIONS**

### **STEP 1: Create & Send RFQ**

**Purpose:** Get competitive quotes from multiple vendors

**API Endpoint:**
```bash
POST /api/procurement/rfq/create-and-send
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "requisitionId": "REQ_ID_HERE",
  "title": "RFQ for Office Supplies Q1 2025",
  "description": "Requesting quotes for office supplies",
  "vendorIds": ["vendor_id_1", "vendor_id_2", "vendor_id_3"],
  "priority": "HIGH",
  "rfqDeadline": "2025-02-15",
  "expectedDeliveryDate": "2025-03-01",
  "deliveryAddress": "123 Main St, Harare",
  "specialRequirements": "Must deliver within 5 business days"
}
```

**What Happens:**
- ✅ RFQ created with unique number (e.g., `RFQ-2025-001`)
- ✅ RFQ sent via email to ALL selected vendors
- ✅ Email includes link to submit quotation online
- ✅ Requisition status updated to `RFQ_SENT`

---

### **STEP 2: Vendors Submit Quotations**

**Purpose:** Vendors provide competitive quotes

**How It Works:**
- Vendors click link in RFQ email
- Opens public quotation form (no login required)
- Vendors fill in:
  - Company details
  - Item prices
  - Terms & conditions
  - Delivery timeline
- Submit quotation

**Result:**
- Quotation saved in system
- Status: `QUOTATION_SUBMITTED`
- Visible in "Review Quotations" section

---

### **STEP 3: Review & Compare Quotations**

**Purpose:** Select the best vendor based on price and terms

**API Endpoint:**
```bash
GET /api/procurement/rfq/{rfqId}/quotations
Authorization: Bearer YOUR_TOKEN
```

**What You See:**
- List of all submitted quotations
- Vendor details
- Item prices comparison
- Terms & conditions
- Total amounts

**Decision:** Select the winning quotation

---

### **STEP 4: Accept Winning Quotation**

**Purpose:** Lock in the selected vendor and create invoice

**API Endpoint:**
```bash
PUT /api/procurement/quotations/{quotationId}/accept
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "comments": "Selected for best price and delivery terms"
}
```

**What Happens:**
- ✅ Quotation status: `ACCEPTED`
- ✅ Invoice **AUTOMATICALLY CREATED** from quotation data
- ✅ Invoice status: `DRAFT`
- ✅ Email sent to winning vendor
- ✅ Other quotations remain `SUBMITTED` (will be rejected)

---

### **STEP 5: Reject Other Quotations**

**Purpose:** Notify non-winning vendors

**API Endpoint:**
```bash
PUT /api/procurement/quotations/{quotationId}/reject
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "reason": "Not selected - another vendor provided better pricing"
}
```

**What Happens:**
- ✅ Quotation status: `REJECTED`
- ✅ Email sent to vendor with rejection reason
- ✅ Vendor notified professionally

---

### **STEP 6: Approve Invoice**

**Purpose:** Create accounting liability

**Note:** Invoice approval workflow may trigger (if configured)

**API Endpoint:**
```bash
PUT /api/procurement/invoices/{invoiceId}/approve
Authorization: Bearer YOUR_TOKEN
```

**What Happens:**
- ✅ Invoice approval workflow triggered (if configured)
- ✅ Approvers review invoice (based on approval config)
- ✅ After approval, invoice status: `APPROVED`
- ✅ **ACCOUNTING ENTRY CREATED:**
  ```
  Dr. Expense Account (e.g., Office Supplies)    $XXX.XX
  Dr. VAT Input (if applicable)                   $XX.XX
  Cr. Accounts Payable                            $XXX.XX
  ```

---

### **STEP 7: Process Payment**

**Purpose:** Clear liability and pay vendor

**API Endpoint:**
```bash
POST /api/procurement/invoices/{invoiceId}/payments
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "paymentMethod": "BANK",
  "paymentReference": "TT-123456",
  "amount": 1000.00,
  "paymentDate": "2025-01-20",
  "comments": "Bank transfer payment"
}
```

**What Happens:**
- ✅ Invoice status: `PAID`
- ✅ **ACCOUNTING ENTRY CREATED:**
  ```
  Dr. Accounts Payable              $XXX.XX
  Cr. Bank Account (or Cash)        $XXX.XX
  ```
- ✅ Email payment confirmation sent to vendor
- ✅ Cycle complete

---

## 📋 **API ENDPOINTS SUMMARY**

| Step | Endpoint | Method | Purpose |
|------|----------|--------|---------|
| 1. Create RFQ | `/api/procurement/rfq/create-and-send` | POST | Send RFQ to vendors |
| 2. View Quotations | `/api/procurement/rfq/{rfqId}/quotations` | GET | List all quotations |
| 3. Accept Quotation | `/api/procurement/quotations/{id}/accept` | PUT | Accept winning quote |
| 4. Reject Quotation | `/api/procurement/quotations/{id}/reject` | PUT | Reject non-winning quote |
| 5. Approve Invoice | `/api/procurement/invoices/{id}/approve` | PUT | Approve invoice |
| 6. Process Payment | `/api/procurement/invoices/{id}/payments` | POST | Pay vendor |

---

## 💰 **ACCOUNTING IMPACT**

### **After Invoice Approval:**
```
Dr. Expense Account              $1,000.00
Dr. VAT Input (14.5%)             $145.00
Cr. Accounts Payable             $1,145.00
```

### **After Payment:**
```
Dr. Accounts Payable             $1,145.00
Cr. Bank Account                 $1,145.00
```

---

## ✅ **STATUS PROGRESSION**

```
REQUISITION: APPROVED
    ↓
RFQ: SENT
    ↓
QUOTATIONS: SUBMITTED → ACCEPTED (one) / REJECTED (others)
    ↓
INVOICE: DRAFT → APPROVED
    ↓
INVOICE: PAID
    ↓
✅ COMPLETE
```

---

## 🎯 **KEY POINTS**

1. ✅ **RFQ-Based System** - Get competitive quotes from multiple vendors
2. ✅ **No Prices in Requisition** - Prices come from vendor quotations
3. ✅ **Automatic Invoice Creation** - Invoice created from accepted quotation
4. ✅ **Accounting Integration** - Journal entries created automatically
5. ✅ **Email Notifications** - Vendors notified at each stage
6. ✅ **Audit Trail** - Complete tracking of all actions

---

**Last Updated:** January 2025  
**Reference:** See `PROCUREMENT_END_TO_END_TESTING_GUIDE.md` for detailed testing steps

