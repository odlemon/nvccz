# 🚀 PROCUREMENT MODULE - VENDOR QUOTATION SYSTEM TESTING GUIDE

## 📋 **TABLE OF CONTENTS**
1. [Overview](#overview)
2. [New Vendor Quotation Flow](#new-vendor-quotation-flow)
3. [Prerequisites](#prerequisites)
4. [Step-by-Step Testing Guide](#step-by-step-testing-guide)
5. [API Endpoints Reference](#api-endpoints-reference)
6. [Email Notifications](#email-notifications)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 **OVERVIEW**

The Vendor Quotation System is an enhancement to the RFQ-based procurement flow that allows vendors to submit quotations online through a public form (no authentication required). The system includes:

✅ **Public Quotation Submission** - Vendors can submit quotes without login  
✅ **Automated Email Notifications** - Acceptance, rejection, and payment notifications  
✅ **Automatic Invoice Creation** - Accepted quotations become invoices automatically  
✅ **Quotation Management** - View, compare, accept, or reject quotations  
✅ **Complete Audit Trail** - All actions are logged  

---

## 🔄 **NEW VENDOR QUOTATION FLOW**

```
┌─────────────────────────────────────────────────────────────────┐
│              ENHANCED RFQ-BASED PROCUREMENT CYCLE                │
└─────────────────────────────────────────────────────────────────┘

1. 📝 CREATE REQUISITION
   ├── Employee lists items needed
   ├── NO prices required
   ├── NO vendor selection yet
   └── Submit for approval
   
2. ✅ APPROVE REQUISITION
   ├── Manager reviews and approves
   └── Status: APPROVED

3. 📧 CREATE & SEND RFQ (WITH QUOTATION LINK)
   ├── Select MULTIPLE vendors (by vendor IDs)
   ├── System fetches vendor details (name, email)
   ├── RFQ sent to ALL selected vendors via email
   ├── 🌟 Email includes link to online quotation form
   ├── 🌟 Email includes RFQ number for reference
   └── Status: RFQ_SENT

4. 💻 VENDORS SUBMIT QUOTATIONS ONLINE (NEW!)
   ├── Vendor clicks link in RFQ email
   ├── Opens public quotation form (NO LOGIN REQUIRED)
   ├── Vendor fills in:
   │   ├── Company details (name, Tax EIN, contact info)
   │   ├── Line items with prices
   │   ├── Payment terms and delivery time
   │   └── Additional notes
   ├── System generates unique quotation number
   └── Status: SUBMITTED

5. 📊 REVIEW QUOTATIONS
   ├── Procurement team views all submitted quotations
   ├── Compare prices and terms from different vendors
   ├── Filter by RFQ number, status, vendor
   └── Select best quotation

6. ✅ ACCEPT QUOTATION (NEW!)
   ├── Accept the winning quotation
   ├── 📧 System sends acceptance email to vendor
   ├── 💰 System AUTOMATICALLY creates invoice
   ├── Invoice includes all quotation details
   ├── Invoice status: DRAFT
   └── Quotation status: ACCEPTED

7. ❌ REJECT OTHER QUOTATIONS (NEW!)
   ├── Reject non-winning quotations
   ├── Provide rejection reason
   ├── 📧 System sends rejection email to vendors
   └── Quotation status: REJECTED

8. ✅ APPROVE INVOICE
   ├── Review auto-generated invoice
   ├── Approve invoice
   ├── 💰 ACCOUNTING ENTRY CREATED:
   │   Dr. Expense Account
   │   Dr. VAT Input
   │   Cr. Accounts Payable
   └── Status: APPROVED

9. 💳 PROCESS PAYMENT (WITH EMAIL)
   ├── Select payment method (Bank/Cash)
   ├── Enter payment reference
   ├── 💰 ACCOUNTING ENTRY CREATED:
   │   Dr. Accounts Payable
   │   Cr. Cash/Bank Account
   ├── 📧 System sends payment confirmation to vendor (NEW!)
   └── Status: PAID

10. ✅ CYCLE COMPLETE
    └── Vendor paid, quotation archived, books balanced
```

---

## ✅ **PREREQUISITES**

Before testing, ensure you have:

1. **Authentication Token**
   ```bash
   # Login to get your token
   POST http://localhost:3000/api/auth/login
   {
     "email": "your-email@example.com",
     "password": "your-password"
   }
   ```

2. **Required Master Data**
   - ✅ At least 2-3 vendors in the system (with valid emails)
   - ✅ Currency records (USD, ZWL, etc.)
   - ✅ Department records
   - ✅ Chart of Accounts with procurement accounts

3. **Environment**
   - Server running on `http://localhost:3000`
   - Database seeded with test data
   - Email service configured (ZeptoMail)
   - Frontend URL configured for quotation form link

---

## 🧪 **STEP-BY-STEP TESTING GUIDE**

### **STEP 1-3: Create, Submit, and Approve Requisition**

(Same as original flow - see PROCUREMENT_END_TO_END_TESTING_GUIDE.md)

---

### **STEP 4: Create and Send RFQ with Quotation Link**

```bash
POST http://localhost:3000/api/procurement/rfq
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "requisitionId": "REQ_ID_HERE",
  "title": "RFQ - Office Supplies January 2025",
  "description": "We are seeking competitive quotes for office supplies.",
  "vendorIds": [
    "VENDOR_ID_1",
    "VENDOR_ID_2",
    "VENDOR_ID_3"
  ],
  "priority": "HIGH",
  "deliveryAddress": "123 Main St, Harare, Zimbabwe",
  "expectedDeliveryDate": "2025-01-15",
  "rfqDeadline": "2025-01-10",
  "specialRequirements": "All prices must be in USD. Payment terms: NET 30.",
  "items": [
    {
      "itemName": "Office Desk",
      "description": "Executive wooden desk, 1.6m x 0.8m",
      "quantity": 10,
      "unit": "pieces"
    },
    {
      "itemName": "Office Chair",
      "description": "Ergonomic office chair with lumbar support",
      "quantity": 10,
      "unit": "pieces"
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "RFQ sent to 3 vendor(s) successfully",
  "data": {
    "rfqNumber": "RFQ-1729012345-123",
    "title": "RFQ - Office Supplies January 2025",
    "vendors": [
      {
        "id": "VENDOR_ID_1",
        "name": "ABC Supplies Ltd",
        "email": "john@abcsupplies.com"
      }
      // ... other vendors
    ],
    "status": "SENT"
  }
}
```

**✅ What Happens:**
- RFQ emails sent to ALL 3 vendors
- **Each email includes a prominent button/link to submit quotation online**
- Link format: `https://nvccz.com/vendor/quotation/submit?rfq=RFQ-1729012345-123`
- Vendors can click the link to access the public quotation form

---

### **STEP 5: Vendor Submits Quotation (PUBLIC - NO AUTH)**

**This is a PUBLIC endpoint - vendors don't need to be logged in!**

```bash
POST http://localhost:3000/api/vendor-quotations/submit
Content-Type: application/json
# NO AUTHORIZATION HEADER NEEDED!

{
  "rfqNumber": "RFQ-1729012345-123",
  "vendorName": "John Doe",
  "vendorEmail": "john@abcsupplies.com",
  "companyName": "ABC Supplies Ltd",
  "taxEIN": "12-3456789",
  "contactPerson": "John Doe",
  "phoneNumber": "+263771234567",
  "address": "123 Industrial Road, Harare",
  "validUntil": "2025-11-15T00:00:00Z",
  "currencyCode": "USD",
  "paymentTerms": "NET 30",
  "deliveryTerms": "FOB",
  "deliveryTime": "5 business days",
  "notes": "We can offer bulk discounts for orders over 20 units",
  "items": [
    {
      "itemName": "Office Desk",
      "description": "Executive wooden desk, IKEA BEKANT model",
      "quantity": 10,
      "unit": "pieces",
      "unitPrice": 250.00,
      "brand": "IKEA",
      "model": "BEKANT",
      "warranty": "2 years"
    },
    {
      "itemName": "Office Chair",
      "description": "Ergonomic office chair, MARKUS model",
      "quantity": 10,
      "unit": "pieces",
      "unitPrice": 180.00,
      "brand": "IKEA",
      "model": "MARKUS",
      "warranty": "3 years"
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Quotation submitted successfully. We will review your quote and contact you soon.",
  "data": {
    "id": "QUOTE_ID",
    "quotationNumber": "QUOTE-1729012456-789",
    "rfqNumber": "RFQ-1729012345-123",
    "vendorName": "John Doe",
    "vendorEmail": "john@abcsupplies.com",
    "companyName": "ABC Supplies Ltd",
    "status": "SUBMITTED",
    "subtotal": 4300.00,
    "taxAmount": 0.00,
    "totalAmount": 4300.00,
    "currencyCode": "USD",
    "items": [...]
  }
}
```

**🎯 Repeat this step for multiple vendors to submit different quotations**

---

### **STEP 6: View All Quotations**

```bash
GET http://localhost:3000/api/vendor-quotations
Authorization: Bearer YOUR_TOKEN_HERE
```

**Or filter by RFQ:**
```bash
GET http://localhost:3000/api/vendor-quotations?rfqNumber=RFQ-1729012345-123
Authorization: Bearer YOUR_TOKEN_HERE
```

**Or get quotations for specific RFQ:**
```bash
GET http://localhost:3000/api/vendor-quotations/rfq/RFQ-1729012345-123
Authorization: Bearer YOUR_TOKEN_HERE
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Quotations retrieved successfully",
  "data": [
    {
      "id": "QUOTE_ID_1",
      "quotationNumber": "QUOTE-1729012456-789",
      "vendorName": "John Doe",
      "companyName": "ABC Supplies Ltd",
      "vendorEmail": "john@abcsupplies.com",
      "totalAmount": 4300.00,
      "status": "SUBMITTED",
      "submittedAt": "2025-10-15T10:00:00.000Z",
      "items": [...]
    },
    {
      "id": "QUOTE_ID_2",
      "quotationNumber": "QUOTE-1729012457-790",
      "vendorName": "Jane Smith",
      "companyName": "XYZ Furniture Ltd",
      "vendorEmail": "jane@xyzfurniture.com",
      "totalAmount": 3900.00,
      "status": "SUBMITTED",
      "submittedAt": "2025-10-15T11:00:00.000Z",
      "items": [...]
    }
  ],
  "count": 2
}
```

**📊 Compare quotations and select the best one!**

---

### **STEP 7: Accept Winning Quotation**

```bash
POST http://localhost:3000/api/vendor-quotations/QUOTE_ID_2/accept
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "reviewNotes": "Best price and excellent delivery time. Vendor has good track record.",
  "createInvoice": true
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Quotation accepted and invoice created successfully. Vendor has been notified.",
  "data": {
    "quotation": {
      "id": "QUOTE_ID_2",
      "quotationNumber": "QUOTE-1729012457-790",
      "status": "ACCEPTED",
      "reviewedAt": "2025-10-15T14:00:00.000Z",
      "reviewNotes": "Best price and excellent delivery time..."
    },
    "invoice": {
      "id": "INVOICE_ID",
      "invoiceNumber": "INV-QUOTE-1729012457-790",
      "quotationId": "QUOTE_ID_2",
      "vendorId": "VENDOR_ID_2",
      "subtotal": 3900.00,
      "taxAmount": 0.00,
      "totalAmount": 3900.00,
      "status": "DRAFT",
      "items": [...]
    }
  }
}
```

**✅ What Happens:**
- Quotation status → `ACCEPTED`
- 📧 **Acceptance email sent to vendor**
- 💰 **Invoice automatically created** from quotation
- Invoice includes all line items from quotation
- Invoice status: `DRAFT` (ready for approval)
- Quotation linked to invoice

---

### **STEP 8: Reject Other Quotations**

```bash
POST http://localhost:3000/api/vendor-quotations/QUOTE_ID_1/reject
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "rejectionReason": "Price exceeds budget. We received a more competitive offer.",
  "reviewNotes": "Thank you for your submission. Please feel free to participate in future RFQs."
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Quotation rejected successfully. Vendor has been notified.",
  "data": {
    "id": "QUOTE_ID_1",
    "quotationNumber": "QUOTE-1729012456-789",
    "status": "REJECTED",
    "rejectionReason": "Price exceeds budget...",
    "reviewedAt": "2025-10-15T14:05:00.000Z"
  }
}
```

**✅ What Happens:**
- Quotation status → `REJECTED`
- 📧 **Rejection email sent to vendor**
- Vendor receives professional rejection notice with reason

---

### **STEP 9: Approve Auto-Generated Invoice**

```bash
POST http://localhost:3000/api/procurement/invoices/INVOICE_ID/approve
Authorization: Bearer YOUR_TOKEN_HERE
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Procurement invoice approved successfully",
  "data": {
    "id": "INVOICE_ID",
    "status": "APPROVED",
    "journalEntry": {
      "id": "JE_ID",
      "journalEntryNumber": "INV-INV-QUOTE-1729012457-790",
      "totalDebit": 3900.00,
      "totalCredit": 3900.00,
      "status": "POSTED",
      "lines": [...]
    }
  }
}
```

---

### **STEP 10: Process Payment (WITH EMAIL NOTIFICATION)**

```bash
POST http://localhost:3000/api/procurement/invoices/INVOICE_ID/payment
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "paymentAmount": 3900.00,
  "paymentMethod": "BANK",
  "paymentReference": "BANK-TXN-2025-001",
  "paymentDate": "2025-02-08",
  "notes": "Payment processed via Standard Bank"
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
      "status": "PAID",
      "paymentStatus": "PAID",
      "paidAt": "2025-02-08T00:00:00.000Z"
    },
    "journalEntry": {
      "id": "JE_ID",
      "referenceNumber": "PAY-INV-QUOTE-1729012457-790",
      "status": "POSTED"
    }
  }
}
```

**✅ What Happens:**
- Invoice status → `PAID`
- Payment journal entry created
- 📧 **Payment confirmation email sent to vendor** (NEW!)
- Vendor receives payment details and confirmation
- Accounts Payable cleared
- Cash/Bank reduced

---

## 📧 **EMAIL NOTIFICATIONS**

The system sends professional email notifications at key stages:

### 1. **RFQ Email (Enhanced)**
- **Recipient:** All selected vendors
- **Content:**
  - RFQ details and requirements
  - Items/services required
  - **Prominent "Submit Quotation Online" button**
  - Link to public quotation form
  - Alternative email response option
- **Trigger:** When RFQ is sent

### 2. **Quotation Accepted Email** ⭐ NEW
- **Recipient:** Vendor whose quotation was accepted
- **Content:**
  - Congratulations message
  - Quotation number and amount
  - Review notes from procurement team
  - Next steps (invoice and PO)
- **Trigger:** When quotation is accepted

### 3. **Quotation Rejected Email** ⭐ NEW
- **Recipient:** Vendor whose quotation was rejected
- **Content:**
  - Professional rejection notice
  - Rejection reason
  - Encouragement to participate in future RFQs
- **Trigger:** When quotation is rejected

### 4. **Invoice Paid Email** ⭐ NEW
- **Recipient:** Vendor
- **Content:**
  - Payment confirmation
  - Invoice number and amount
  - Payment date and method
  - Payment reference number
  - Expected clearance time
- **Trigger:** When invoice payment is processed

---

## 📚 **API ENDPOINTS REFERENCE**

### **Vendor Quotation Endpoints**

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/vendor-quotations/submit` | ❌ No | Submit quotation (PUBLIC) |
| GET | `/api/vendor-quotations` | ✅ Yes | Get all quotations |
| GET | `/api/vendor-quotations/:id` | ✅ Yes | Get quotation by ID |
| GET | `/api/vendor-quotations/rfq/:rfqNumber` | ✅ Yes | Get quotations for RFQ |
| POST | `/api/vendor-quotations/:id/accept` | ✅ Yes | Accept quotation |
| POST | `/api/vendor-quotations/:id/reject` | ✅ Yes | Reject quotation |
| DELETE | `/api/vendor-quotations/:id` | ✅ Yes | Delete quotation |

### **Query Parameters for GET /api/vendor-quotations**

| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status (SUBMITTED, UNDER_REVIEW, ACCEPTED, REJECTED) |
| rfqNumber | string | Filter by RFQ number |
| vendorEmail | string | Filter by vendor email |
| limit | number | Number of items to return (default: 50) |
| offset | number | Number of items to skip (default: 0) |

---

## 🐛 **TROUBLESHOOTING**

### **Issue: Vendor cannot access quotation form**

**Symptoms:**
- Link in email doesn't work
- 404 error when accessing form

**Solutions:**
1. **Check frontend URL configuration:**
   ```bash
   # Verify .env file
   FRONTEND_URL=https://nvccz.com
   ```

2. **Verify link format in email:**
   - Should be: `https://nvccz.com/vendor/quotation/submit?rfq=RFQ-1729012345-123`
   - RFQ number should be included in query parameter

3. **Check CORS settings:**
   - Frontend URL should be in CORS whitelist

---

### **Issue: Quotation submission fails**

**Symptoms:**
- Error: "Quotation submission failed"
- Validation errors

**Solutions:**
1. **Check required fields:**
   - vendorName, vendorEmail, items[] are required
   - At least one item must be provided
   - Item must have: itemName, quantity, unitPrice

2. **Check data types:**
   - quantity should be number
   - unitPrice should be number
   - validUntil should be valid date string

---

### **Issue: Cannot accept quotation**

**Symptoms:**
- Error: "Vendor not found in system"

**Solutions:**
1. **Vendor must exist in vendor table:**
   ```bash
   # Check if vendor exists with that email
   GET /api/accounting/vendors?email=vendor@example.com
   ```

2. **Add vendor if not exists:**
   ```bash
   POST /api/accounting/vendors
   {
     "name": "ABC Supplies Ltd",
     "email": "john@abcsupplies.com",
     "phone": "+263771234567",
     "address": "123 Industrial Road"
   }
   ```

3. **Verify vendor email matches:**
   - Quotation email must match an existing vendor email

---

### **Issue: Automatic invoice creation fails**

**Symptoms:**
- Quotation accepted but no invoice created
- Error: "Currency not found"

**Solutions:**
1. **Check currency exists:**
   ```bash
   GET /api/accounting/currencies
   # Verify currency code matches quotation currencyCode
   ```

2. **Create currency if missing:**
   ```bash
   POST /api/accounting/currencies
   {
     "code": "USD",
     "name": "US Dollar",
     "symbol": "$",
     "exchangeRate": 1.0
   }
   ```

---

### **Issue: Email notifications not sent**

**Symptoms:**
- API returns success but no emails received
- Console shows email errors

**Solutions:**
1. **Check email service configuration:**
   ```bash
   # Verify .env file
   ZEPTO_API_KEY=your_key_here
   ```

2. **Check vendor email addresses:**
   - Ensure valid email format
   - Check spam/junk folders

3. **Check console logs:**
   - Look for email service errors
   - Verify ZeptoMail API key is valid

---

## 🎉 **SUCCESS CRITERIA**

Your Vendor Quotation System is working correctly if:

✅ RFQ emails include prominent quotation form link  
✅ Vendors can submit quotations without authentication  
✅ Quotations are stored with all details  
✅ Procurement team can view and compare quotations  
✅ Accepting quotation automatically creates invoice  
✅ Acceptance email is sent to winning vendor  
✅ Rejection emails are sent to non-winning vendors  
✅ Payment confirmation email is sent when invoice is paid  
✅ All accounting entries are correct  
✅ Audit trail is complete  

---

## 📊 **COMPARISON: OLD vs NEW FLOW**

### **OLD FLOW (Manual)**
1. Send RFQ email
2. Wait for email responses
3. Manually compile quotes
4. Manually create invoice
5. No automated notifications

### **NEW FLOW (Automated)** ⭐
1. Send RFQ email with quotation link
2. Vendors submit online (structured data)
3. System compiles and displays quotes
4. **Automatic invoice creation** on acceptance
5. **Automated email notifications** throughout

**Benefits:**
- ⚡ Faster quote collection
- 📊 Structured data for easy comparison
- 🤖 Reduced manual data entry
- 📧 Better vendor communication
- ✅ Complete audit trail
- 🎯 Fewer errors

---

**Last Updated:** October 15, 2025  
**Version:** 1.0 (Vendor Quotation System)  
**Author:** NVCCZ Development Team






