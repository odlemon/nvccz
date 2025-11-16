# 💼 VENDOR QUOTATION FLOW - COMPLETE GUIDE

**Date Created:** January 2025  
**Purpose:** Complete guide on vendor quotation submission flow (PUBLIC ACCESS - NO LOGIN REQUIRED)

---

## 📋 **TABLE OF CONTENTS**

1. [Overview](#overview)
2. [Vendor Access - No Login Required](#vendor-access---no-login-required)
3. [Complete Vendor Quotation Flow](#complete-vendor-quotation-flow)
4. [Email Notifications for Vendors](#email-notifications-for-vendors)
5. [Quotation Submission API](#quotation-submission-api)
6. [Vendor Perspective Flow](#vendor-perspective-flow)

---

## 🎯 **OVERVIEW**

Vendors **do NOT need to log into the system**. They interact with the procurement system entirely via:

1. **Email Notifications** - Receive RFQs and status updates via email
2. **Public Quotation Form** - Submit quotations via a public API endpoint (no authentication)

**Key Points:**
- ✅ Vendors receive RFQs via email
- ✅ Vendors submit quotations via public form (no login)
- ✅ Vendors receive status updates via email (acceptance, rejection, payment)
- ❌ Vendors do NOT need system accounts
- ❌ Vendors do NOT need to log in

---

## 🔓 **VENDOR ACCESS - NO LOGIN REQUIRED**

### **Public Endpoint:**

**URL:** `POST /api/vendor-quotations/submit`  
**Authentication:** ❌ **NONE REQUIRED** (Public endpoint)  
**Description:** Vendors submit their quotations through this public endpoint

### **Why No Login Required:**

1. **Vendors are external parties** - They don't have system accounts
2. **RFQ emails contain submission links** - Vendors click link in email to submit
3. **Simple workflow** - Vendors just need to provide quote details
4. **Security via RFQ number** - Only vendors who receive RFQ can submit quotes

---

## 🔄 **COMPLETE VENDOR QUOTATION FLOW**

```
┌─────────────────────────────────────────────────────────────────┐
│              VENDOR QUOTATION FLOW (NO LOGIN)                   │
└─────────────────────────────────────────────────────────────────┘

1. SYSTEM SENDS RFQ TO VENDORS
   ├──→ RFQ created in system
   ├──→ Email sent to all selected vendors
   ├──→ Email contains:
   │    • RFQ details (items, quantities, requirements)
   │    • RFQ Number
   │    • Deadline for submission
   │    • Link to submit quotation online (PUBLIC FORM)
   └──→ ✅ Vendor receives email (no login needed)

2. VENDOR OPENS QUOTATION FORM (PUBLIC LINK)
   ├──→ Vendor clicks link in email
   ├──→ Opens public quotation submission form
   ├──→ ❌ NO LOGIN REQUIRED
   ├──→ Form pre-filled with:
   │    • RFQ Number
   │    • Item list from RFQ
   └──→ ✅ Vendor can see all RFQ details

3. VENDOR FILLS OUT QUOTATION
   ├──→ Company information:
   │    • Company Name
   │    • Contact Person
   │    • Email
   │    • Phone Number
   │    • Tax EIN/VAT Number
   │    • Address
   ├──→ Quotation details:
   │    • Prices for each item
   │    • Quantity (if different from RFQ)
   │    • Unit prices
   │    • Total amounts
   │    • Payment terms (NET 30, etc.)
   │    • Delivery terms (FOB, etc.)
   │    • Delivery time
   │    • Validity date
   │    • Notes/additional info
   └──→ ✅ All fields filled

4. VENDOR SUBMITS QUOTATION (PUBLIC API)
   ├──→ POST /api/vendor-quotations/submit
   ├──→ ❌ NO AUTHENTICATION REQUIRED
   ├──→ Quotation saved in system
   ├──→ Status: SUBMITTED
   ├──→ Vendor receives confirmation email
   └──→ ✅ Quotation submitted successfully

5. SYSTEM REVIEWS QUOTATIONS
   ├──→ Internal users (logged in) review all quotations
   ├──→ Compare prices and terms
   └──→ Select winning quotation

6. VENDOR RECEIVES STATUS UPDATE (VIA EMAIL)
   ├──→ IF ACCEPTED:
   │    • Acceptance email sent
   │    • Invoice automatically created (Purchase Invoice)
   │    • Invoice status updates sent via email
   │    • Payment confirmation sent when invoice paid
   └──→ IF REJECTED:
       • Rejection email sent with reason

✅ VENDOR NEVER NEEDS TO LOG IN
```

---

## 📧 **EMAIL NOTIFICATIONS FOR VENDORS**

Vendors receive email notifications at these stages:

### **1. RFQ Received Email** 📨

**When:** System sends RFQ to vendor  
**Content:**
- RFQ Number
- RFQ Title and Description
- Item list (quantities, specifications)
- Delivery requirements
- Deadline for submission
- **Link to submit quotation online** (PUBLIC FORM)
- Company contact information

**Action:** Vendor clicks link to submit quotation

---

### **2. Quotation Submission Confirmation** ✅

**When:** Vendor successfully submits quotation  
**Content:**
- Quotation Number
- Confirmation that quotation was received
- Expected review timeline
- Next steps

**Action:** Vendor waits for review

---

### **3. Quotation Accepted Email** 🎉

**When:** System accepts vendor's quotation  
**Content:**
- Quotation Number
- Acceptance confirmation
- Purchase Invoice Number (auto-created)
- Invoice amount
- Invoice status
- Next steps (payment process)

**Action:** Vendor prepares for invoice

---

### **4. Quotation Rejected Email** ❌

**When:** System rejects vendor's quotation  
**Content:**
- Quotation Number
- Rejection notification
- Reason for rejection (if provided)
- Thank you message

**Action:** None (quotation closed)

---

### **5. Invoice Status Updates** 📋

**When:** Invoice status changes  
**Content:**
- Invoice Number
- Current status (APPROVED, PAID, etc.)
- Payment status updates

**Action:** Vendor tracks invoice status

---

### **6. Payment Confirmation Email** 💰

**When:** Invoice payment is processed  
**Content:**
- Invoice Number
- Payment Amount
- Payment Date
- Payment Method (BANK/CASH)
- Payment Reference (bank transaction ref)
- **Receipt Number** (for payment confirmation)

**Action:** Vendor records payment received

---

## 🌐 **QUOTATION SUBMISSION API**

### **Endpoint:**

```
POST /api/vendor-quotations/submit
```

### **Authentication:**

❌ **NONE REQUIRED** - This is a public endpoint

### **Request Headers:**

```
Content-Type: application/json
```

### **Request Body:**

```json
{
  "rfqNumber": "RFQ-1729012345-123",
  "vendorName": "John Doe",
  "vendorEmail": "john@abcsupplies.com",
  "companyName": "ABC Supplies Ltd",
  "taxEIN": "12-3456789",
  "contactPerson": "John Doe",
  "phoneNumber": "+263771234567",
  "address": "123 Test Street, Harare",
  "validUntil": "2025-11-15T00:00:00Z",
  "currencyCode": "USD",
  "paymentTerms": "NET 30",
  "deliveryTerms": "FOB",
  "deliveryTime": "5 business days",
  "notes": "All items include 2-year warranty",
  "items": [
    {
      "itemName": "Office Desk",
      "description": "Executive wooden desk, 1.6m x 0.8m",
      "quantity": 10,
      "unit": "pieces",
      "unitPrice": 240.00,
      "brand": "Premium Office",
      "warranty": "2 years"
    },
    {
      "itemName": "Office Chair",
      "description": "Ergonomic office chair with lumbar support",
      "quantity": 10,
      "unit": "pieces",
      "unitPrice": 145.00,
      "brand": "Comfort Plus",
      "warranty": "2 years"
    }
  ]
}
```

### **Response (Success):**

```json
{
  "success": true,
  "message": "Quotation submitted successfully. We will review your quote and contact you soon.",
  "data": {
    "id": "quotation-id",
    "quotationNumber": "QUOTE-1729012345-456",
    "rfqNumber": "RFQ-1729012345-123",
    "status": "SUBMITTED",
    "subtotal": 3400.00,
    "taxAmount": 510.00,
    "totalAmount": 3910.00,
    "submittedAt": "2025-01-15T10:00:00Z"
  }
}
```

---

## 👀 **VENDOR PERSPECTIVE FLOW**

### **Step 1: Receive RFQ Email** 📨

Vendor receives email with RFQ details and a **PUBLIC LINK** to submit quotation:

```
Subject: Request for Quote RFQ-1729012345-123 - NVCCZ

Dear ABC Supplies Ltd,

We are requesting a quotation for the following items:

RFQ Number: RFQ-1729012345-123
Deadline: January 22, 2025

Items Required:
- Office Desk (10 pieces)
- Office Chair (10 pieces)

[📝 Submit Your Quotation Online] ← PUBLIC LINK (NO LOGIN REQUIRED)
Link: https://nvccz.com/vendor/quotation/submit?rfq=RFQ-1729012345-123
```

**RFQ Email Link Format:**
```
{FRONTEND_URL}/vendor/quotation/submit?rfq={RFQ_NUMBER}
```

**Vendor Action:** Clicks link to open quotation form (no login needed)

---

### **Step 2: Fill Out Quotation Form** ✍️

Vendor sees a form with:
- RFQ details (pre-filled)
- Company information fields
- Item pricing fields
- Terms and conditions fields

**Vendor Action:** Fills out form with their prices and terms

---

### **Step 3: Submit Quotation** 📤

Vendor clicks "Submit" button

**What Happens:**
- Quotation sent to `/api/vendor-quotations/submit` (no login needed)
- Quotation saved in system
- Vendor receives confirmation email

**Vendor Action:** Waits for response

---

### **Step 4: Receive Status Update** 📧

**If Accepted:**
```
Subject: Quotation Accepted - QUOTE-1729012345-456

Dear ABC Supplies Ltd,

We are pleased to inform you that your quotation has been accepted!

Quotation Number: QUOTE-1729012345-456
Purchase Invoice: PI-1234567890-001
Total Amount: $3,910.00

Invoice details will be sent separately.
```

**If Rejected:**
```
Subject: Quotation Status Update - QUOTE-1729012345-456

Dear ABC Supplies Ltd,

Thank you for your quotation. Unfortunately, we have selected another vendor for this RFQ.

We appreciate your interest and will keep you in mind for future opportunities.
```

---

### **Step 5: Receive Payment Confirmation** 💰

When invoice is paid:
```
Subject: Payment Confirmed - Purchase Invoice PI-1234567890-001

Dear ABC Supplies Ltd,

Payment has been processed for your invoice:

Invoice Number: PI-1234567890-001
Payment Amount: $3,910.00
Payment Date: January 20, 2025
Payment Method: BANK
Payment Reference: BANK-TXN-12345
Receipt Number: RCP-PI-1234567890-001-1705324800000

Thank you for your services!
```

---

## 🔒 **SECURITY CONSIDERATIONS**

Even though the endpoint is public, security is maintained through:

1. **RFQ Number Validation:**
   - Only valid RFQ numbers can be used
   - RFQ numbers are unique and time-bound

2. **Email Verification:**
   - RFQs are sent to specific vendor emails
   - Only vendors who receive RFQ emails know the RFQ number

3. **Rate Limiting:**
   - API endpoints can have rate limiting to prevent abuse
   - Multiple submissions for same RFQ can be prevented

4. **Audit Trail:**
   - All quotation submissions are logged
   - Email addresses are recorded with quotations

---

## 📝 **SUMMARY**

| Stage | Vendor Action | Login Required | Communication Method |
|-------|--------------|----------------|---------------------|
| Receive RFQ | Read email | ❌ No | Email |
| Submit Quotation | Fill form & submit | ❌ No | Public API |
| Receive Acceptance | Read email | ❌ No | Email |
| Receive Rejection | Read email | ❌ No | Email |
| Receive Payment Confirmation | Read email | ❌ No | Email |

**Key Takeaway:**
- ✅ Vendors interact entirely via **email** and **public API**
- ❌ Vendors **NEVER need to log in**
- ✅ All status updates sent via **email**

---

**End of Document**

