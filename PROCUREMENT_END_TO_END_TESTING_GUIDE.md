# 🚀 PROCUREMENT MODULE - END-TO-END TESTING GUIDE (RFQ-BASED WITH VENDOR QUOTATIONS)

## 📋 **TABLE OF CONTENTS**
1. [Overview](#overview)
2. [Complete RFQ-Based Procurement Flow](#complete-rfq-based-procurement-flow)
3. [Prerequisites](#prerequisites)
4. [🏦 Finance Department Workflow - Complete Test](#-finance-department-workflow---complete-test) ⭐ **START HERE!**
5. [Step-by-Step Testing Guide (General)](#-step-by-step-testing-guide-general)
6. [Accounting Impact Summary](#accounting-impact-summary)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 **OVERVIEW**

This guide walks you through the complete **RFQ (Request for Quote) based procurement cycle with automated vendor quotations**, from creating a requisition to paying a vendor. This is the **enhanced implementation** where:

✅ **Requisitions** only list items needed (no prices, no vendors)  
✅ **RFQs** are sent to multiple vendors to get competitive quotes  
✅ **Vendors submit quotations ONLINE** through a public form (no login required) 🌟  
✅ **System automatically creates invoices** from accepted quotations 🌟  
✅ **Email notifications** sent at every stage (acceptance, rejection, payment) 🌟  
✅ **Accounting entries are created automatically** at appropriate stages  

---

## 🔄 **COMPLETE RFQ-BASED PROCUREMENT FLOW**

```
┌─────────────────────────────────────────────────────────────────┐
│                    RFQ-BASED PROCUREMENT CYCLE                  │
└─────────────────────────────────────────────────────────────────┘

1. 📝 CREATE REQUISITION
   ├── Employee lists items needed
   ├── NO prices required
   ├── NO vendor selection yet
   └── Submit for approval
   
2. ✅ APPROVE REQUISITION
   ├── Manager reviews and approves
   └── Status: APPROVED

3. 📧 CREATE & SEND RFQ (WITH ONLINE QUOTATION LINK) 🌟
   ├── Select MULTIPLE vendors (by vendor IDs)
   ├── System fetches vendor details (name, email)
   ├── RFQ sent to ALL selected vendors via email
   ├── Email includes "Submit Quotation Online" button 🌟
   └── Status: RFQ_SENT

4. 💻 VENDORS SUBMIT QUOTATIONS ONLINE (NO LOGIN!) 🌟
   ├── Vendors click link in RFQ email
   ├── Opens public quotation form (NO AUTHENTICATION)
   ├── Fill in company details, prices, terms
   ├── Submit quotation
   └── Status: SUBMITTED

5. 📊 REVIEW & COMPARE QUOTATIONS 🌟
   ├── View all submitted quotations in system
   ├── Compare prices and terms
   ├── Filter by RFQ number, status, vendor
   └── Select winning quotation

6. ✅ ACCEPT WINNING QUOTATION 🌟
   ├── Accept the best quotation
   ├── System AUTOMATICALLY creates invoice from quotation
   ├── Email notification sent to winning vendor
   └── Status: ACCEPTED (Invoice: DRAFT)

7. ❌ REJECT OTHER QUOTATIONS 🌟
   ├── Reject non-winning quotations with reason
   ├── Email notification sent to rejected vendors
   └── Status: REJECTED

8. ✅ APPROVE INVOICE (AUTO-CREATED)
   ├── Review invoice details
   ├── Approve invoice
   ├── 💰 ACCOUNTING ENTRY CREATED:
   │   Dr. Expense Account (Rent/Supplies/etc.)
   │   Dr. VAT Input (if applicable)
   │   Cr. Accounts Payable
   └── Status: APPROVED

9. 💳 PROCESS PAYMENT (WITH EMAIL NOTIFICATION) 🌟
   ├── Select payment method (Bank/Cash)
   ├── Enter payment reference
   ├── 💰 ACCOUNTING ENTRY CREATED:
   │   Dr. Accounts Payable
   │   Cr. Cash/Bank Account
   ├── Email payment confirmation sent to vendor 🌟
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
   - ✅ Chart of Accounts with procurement accounts:
     - Accounts Payable (2010)
     - VAT Input (1220)
     - Bank Account - USD (1030)
     - Rent Expense (5010)
     - Office Supplies (5020)

3. **Environment**
   - Server running on `http://localhost:3000`
   - Database seeded with test data
   - Email service configured (ZeptoMail for RFQ emails)

---

## 🏦 **FINANCE DEPARTMENT WORKFLOW - COMPLETE TEST**

This section provides a **ready-to-use, copy-paste Finance department workflow** using your actual configured users!

### 📊 **Finance Team Setup**

Your Finance team is configured as follows:

| User | Email | Department | Dept Role | Role Code | Can Approve Requisitions? | Can Approve Invoices? |
|------|-------|------------|-----------|-----------|---------------------------|----------------------|
| **Admin User** | admin@nvccz.co.zw | Finance | HEAD | FIN_MGR | ✅ Yes | ✅ Yes (if configured) |
| **Jennifer Martinez** | jennifer.martinez@nvccz.co.zw | Finance | DEPUTY | FIN_OFF | ✅ Yes | ✅ Yes (if configured) |
| **Lisa Anderson** | lisa.anderson@nvccz.co.zw | Finance | MEMBER | ACCOUNTANT | ❌ No | ✅ Yes (if configured) |

---

### 🔧 **STEP 0: Setup Finance Approval Configuration**

**⚠️ CRITICAL:** You MUST create this approval configuration BEFORE creating any requisitions!

Without an approval configuration, requisitions will stay in DRAFT status and cannot be approved.

```bash
POST http://localhost:3000/api/procurement-approval-configs
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{
  "name": "Finance Department Procurement Approval",
  "description": "Two-stage approval process for Finance department: Accountant reviews, then Finance Manager approves",
  "department": "Finance",
  "isActive": true,
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Department Head Approval",
          "stepType": "ROLE",
          "roleCode": "FIN_MGR",
          "isRequired": true,
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    },
    {
      "stageType": "INVOICE",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Accountant Review",
          "stepType": "ROLE",
          "roleCode": "ACCOUNTANT",
          "isRequired": true,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 2,
          "stepName": "Finance Manager Final Approval",
          "stepType": "ROLE",
          "roleCode": "FIN_MGR",
          "isRequired": true,
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Procurement approval configuration created successfully",
  "data": {
    "id": "CONFIG_ID_HERE",
    "name": "Finance Department Procurement Approval",
    "department": "Finance",
    "isActive": true,
    "stages": [
      {
        "stageType": "PURCHASE_REQUISITION",
        "roleCode": "FIN_MGR"
      },
      {
        "stageType": "INVOICE",
        "steps": [
          { "stepNumber": 1, "roleCode": "ACCOUNTANT" },
          { "stepNumber": 2, "roleCode": "FIN_MGR" }
        ]
      }
    ]
  }
}
```

**✅ What This Does:**
- Creates a Finance-specific approval configuration
- **Requisition Stage:** Only Finance Manager (Admin User) can approve
- **Invoice Stage:** 
  - Step 1: Accountant (Lisa Anderson) reviews first
  - Step 2: Finance Manager (Admin User) gives final approval
- This config will ONLY be used for Finance department requisitions/invoices

**💡 Pro Tip:** You can verify the config was created:
```bash
GET http://localhost:3000/api/procurement-approval-configs
Authorization: Bearer YOUR_ADMIN_TOKEN
```

---

### 🧪 **FINANCE WORKFLOW TEST - COMPLETE CYCLE**

Now let's test the complete Finance procurement workflow!

#### **STEP F1: Login as Lisa Anderson (Accountant)**

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "lisa.anderson@nvccz.co.zw",
  "password": "YOUR_PASSWORD"
}
```

**Save the token as:** `LISA_TOKEN`

---

#### **STEP F2: Create Finance Requisition (as Lisa)**

```bash
POST http://localhost:3000/api/procurement/requisitions
Authorization: Bearer LISA_TOKEN
Content-Type: application/json

  {
    "title": "Finance Department - Software Licenses Q1 2025",
    "description": "Accounting software licenses and cloud storage for Finance team",
    "department": "Finance",
    "priority": "HIGH",
    "justification": "Critical software renewals for Finance operations",
    "items": [
      {
        "itemName": "QuickBooks Enterprise License",
        "description": "Annual subscription for 5 users",
        "quantity": 1,
        "unit": "year"
      },
      {
        "itemName": "Cloud Storage - Business Plan",
        "description": "1TB secure cloud storage for financial records",
        "quantity": 1,
        "unit": "year"
      },
      {
        "itemName": "Tax Software Subscription",
        "description": "Professional tax preparation software",
        "quantity": 1,
        "unit": "year"
      }
    ]
  }
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "REQ_FINANCE_ID",
    "requisitionNumber": "REQ-202501-XXXX",
    "department": "Finance",
    "status": "DRAFT",
    "createdBy": {
      "firstName": "Lisa",
      "lastName": "Anderson",
      "userDepartment": "Finance",
      "roleCode": "ACCOUNTANT"
    }
  }
}
```

**📝 SAVE THIS:** Copy the `id` field - this is your `REQ_FINANCE_ID`

---

#### **STEP F3: Submit Requisition for Approval (as Lisa)**

```bash
PUT http://localhost:3000/api/procurement/requisitions/REQ_FINANCE_ID/submit
Authorization: Bearer LISA_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Requisition submitted and approval request created",
  "data": {
    "status": "PENDING_APPROVAL",
    "approvalRequest": {
      "id": "APPROVAL_REQ_ID",
      "status": "PENDING",
      "approvers": [
        {
          "roleCode": "FIN_MGR",
          "user": {
            "firstName": "Admin",
            "lastName": "User"
          }
        }
      ]
    }
  }
}
```

**✅ What Happened:**
- Requisition status changed to `PENDING_APPROVAL`
- System created an approval request
- System identified Admin User (FIN_MGR) as the required approver
- System used the **Finance department approval config** automatically!

---

#### **STEP F4: Login as Admin User (Finance Manager)**

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@nvccz.co.zw",
  "password": "YOUR_PASSWORD"
}
```

**Save the token as:** `ADMIN_TOKEN`

---

#### **STEP F5: View Pending Requisitions (as Admin)**

```bash
GET http://localhost:3000/api/procurement/requisitions?status=PENDING_APPROVAL&department=Finance
Authorization: Bearer ADMIN_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "REQ_FINANCE_ID",
      "requisitionNumber": "REQ-202501-XXXX",
      "title": "Finance Department - Software Licenses Q1 2025",
      "status": "PENDING_APPROVAL",
      "department": "Finance",
      "createdBy": {
        "firstName": "Lisa",
        "lastName": "Anderson"
      }
    }
  ]
}
```

---

#### **STEP F6: Approve Requisition (as Admin - Finance Manager)**

```bash
PUT http://localhost:3000/api/procurement/requisitions/REQ_FINANCE_ID/approve
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{
  "comments": "Approved - These software licenses are essential for our operations"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Requisition approved successfully",
  "data": {
    "status": "APPROVED",
    "approvedBy": {
      "firstName": "Admin",
      "lastName": "User",
      "roleCode": "FIN_MGR"
    },
    "approvedAt": "2025-10-16T09:45:00.000Z"
  }
}
```

**✅ What Happened:**
- Admin User (as Finance HEAD with FIN_MGR role) approved the requisition
- Status changed to `APPROVED`
- Now ready for RFQ process

---

#### **STEP F7: Create & Send RFQ (as Admin)**

First, get some vendor IDs:
```bash
GET http://localhost:3000/api/vendors?limit=3
Authorization: Bearer ADMIN_TOKEN
```

Then create the RFQ:
```bash
POST http://localhost:3000/api/procurement/rfqs
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{
  "requisitionId": "REQ_FINANCE_ID",
  "title": "RFQ - Finance Software Licenses Q1 2025",
  "description": "Request for quotation for accounting software and cloud storage licenses",
  "deadline": "2025-10-30T23:59:59.000Z",
  "vendorIds": ["VENDOR_ID_1", "VENDOR_ID_2", "VENDOR_ID_3"],
  "terms": "Payment within 30 days. Licenses must be activated within 48 hours of payment.",
  "items": [
    {
      "itemName": "QuickBooks Enterprise License",
      "description": "Annual subscription for 5 users",
      "quantity": 1,
      "unit": "year"
    },
    {
      "itemName": "Cloud Storage - Business Plan",
      "description": "1TB secure cloud storage",
      "quantity": 1,
      "unit": "year"
    },
    {
      "itemName": "Tax Software Subscription",
      "description": "Professional tax software",
      "quantity": 1,
      "unit": "year"
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "RFQ created and sent to 3 vendors",
  "data": {
    "id": "RFQ_ID",
    "rfqNumber": "RFQ-202501-XXXX",
    "status": "SENT",
    "emailsSent": 3,
    "vendors": [
      { "name": "Vendor A", "email": "vendor-a@example.com" },
      { "name": "Vendor B", "email": "vendor-b@example.com" },
      { "name": "Vendor C", "email": "vendor-c@example.com" }
    ]
  }
}
```

**✅ What Happened:**
- RFQ created with items from the requisition
- Emails sent to all 3 vendors
- Each email includes a unique link to submit quotations online
- Vendors can submit quotes WITHOUT logging in!

**📧 Email Content (sent to vendors):**
```
Subject: RFQ - Finance Software Licenses Q1 2025

Dear Vendor,

You have been invited to submit a quotation for:
RFQ #RFQ-202501-XXXX

Deadline: October 30, 2025

[Submit Quotation Online] ← Button with unique link
```

---

#### **STEP F8: Vendor Submits Quotation (NO LOGIN REQUIRED!)**

**Simulate vendor submission** (use the public endpoint - NO authentication):

```bash
POST http://localhost:3000/api/vendor-quotations/submit
Content-Type: application/json

{
  "rfqId": "RFQ_ID",
  "companyName": "TechSoft Solutions Ltd",
  "contactPerson": "John Vendor",
  "email": "john@techsoft.com",
  "phone": "+263771234567",
  "taxId": "12345678",
  "paymentTerms": "Net 30",
  "deliveryTerms": "Digital delivery within 24 hours",
  "validityPeriod": 30,
  "notes": "We offer 24/7 support and training for all licenses",
  "items": [
    {
      "itemName": "QuickBooks Enterprise License",
      "quantity": 1,
      "unitPrice": 1200.00,
      "currency": "USD"
    },
    {
      "itemName": "Cloud Storage - Business Plan",
      "quantity": 1,
      "unitPrice": 150.00,
      "currency": "USD"
    },
    {
      "itemName": "Tax Software Subscription",
      "quantity": 1,
      "unitPrice": 450.00,
      "currency": "USD"
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
    "id": "QUOTATION_ID",
    "quotationNumber": "QUO-202501-XXXX",
    "status": "SUBMITTED",
    "totalAmount": 1800.00,
    "currency": "USD",
    "companyName": "TechSoft Solutions Ltd"
  }
}
```

**📝 SAVE THIS:** Copy the `id` field - this is your `QUOTATION_ID`

**💡 Repeat for other vendors** to get multiple quotations to compare!

---

#### **STEP F9: Review Quotations (as Admin)**

```bash
GET http://localhost:3000/api/vendor-quotations?rfqId=RFQ_ID
Authorization: Bearer ADMIN_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "QUOTATION_ID",
      "quotationNumber": "QUO-202501-XXXX",
      "companyName": "TechSoft Solutions Ltd",
      "status": "SUBMITTED",
      "totalAmount": 1800.00,
      "currency": "USD"
    }
    // ... other quotations
  ]
}
```

---

#### **STEP F10: Accept Winning Quotation (as Admin)**

```bash
POST http://localhost:3000/api/vendor-quotations/QUOTATION_ID/accept
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{
  "acceptanceNotes": "Best price and terms. Approved for purchase."
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Quotation accepted and invoice created automatically",
  "data": {
    "quotation": {
      "status": "ACCEPTED"
    },
    "invoice": {
      "id": "INVOICE_ID",
      "invoiceNumber": "INV-202501-XXXX",
      "status": "DRAFT",
      "department": "Finance",
      "totalAmount": 1800.00,
      "vendor": {
        "companyName": "TechSoft Solutions Ltd"
      }
    },
    "emailSent": true
  }
}
```

**📝 SAVE THIS:** Copy the invoice `id` - this is your `INVOICE_ID`

**✅ What Happened:**
- Quotation status changed to `ACCEPTED`
- Invoice **AUTOMATICALLY CREATED** from the quotation
- Email sent to winning vendor: "Congratulations! Your quotation has been accepted"
- Invoice is in `DRAFT` status, ready for approval

---

#### **STEP F11: Submit Invoice for Approval (as Admin)**

```bash
POST http://localhost:3000/api/procurement/invoices/INVOICE_ID/submit
Authorization: Bearer ADMIN_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Invoice submitted for approval",
  "data": {
    "status": "PENDING_APPROVAL",
    "approvalRequest": {
      "stage": "INVOICE",
      "currentStep": 1,
      "approvers": [
        {
          "stepNumber": 1,
          "roleCode": "ACCOUNTANT",
          "user": {
            "firstName": "Lisa",
            "lastName": "Anderson"
          }
        },
        {
          "stepNumber": 2,
          "roleCode": "FIN_MGR",
          "user": {
            "firstName": "Admin",
            "lastName": "User"
          }
        }
      ]
    }
  }
}
```

**✅ What Happened:**
- System found the Finance department approval config
- Created 2-step approval process:
  - Step 1: Lisa Anderson (ACCOUNTANT) must approve first
  - Step 2: Admin User (FIN_MGR) approves second
- Invoice status: `PENDING_APPROVAL`

---

#### **STEP F12: Login as Lisa (Accountant) Again**

Use the `LISA_TOKEN` from Step F1, or login again if needed.

---

#### **STEP F13: Approve Invoice - Step 1 (as Lisa - Accountant)**

```bash
GET http://localhost:3000/api/procurement/invoices/INVOICE_ID
Authorization: Bearer LISA_TOKEN
```

Check the invoice details, then approve:

```bash
PUT http://localhost:3000/api/procurement/invoices/INVOICE_ID/approve
Authorization: Bearer LISA_TOKEN
Content-Type: application/json

{
  "comments": "Invoice reviewed and verified. Amounts match quotation. Approved for final sign-off."
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Invoice approval step 1 of 2 completed. Awaiting Finance Manager approval.",
  "data": {
    "status": "PENDING_APPROVAL",
    "currentStep": 2,
    "nextApprover": {
      "roleCode": "FIN_MGR",
      "user": {
        "firstName": "Admin",
        "lastName": "User"
      }
    }
  }
}
```

**✅ What Happened:**
- Lisa (ACCOUNTANT) completed Step 1 approval
- Invoice still in `PENDING_APPROVAL` but moved to Step 2
- Waiting for Admin User (FIN_MGR) to give final approval

---

#### **STEP F14: Approve Invoice - Step 2 (as Admin - Finance Manager)**

```bash
PUT http://localhost:3000/api/procurement/invoices/INVOICE_ID/approve
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{
  "comments": "Final approval granted. Proceed with payment processing."
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Invoice fully approved. Ready for payment.",
  "data": {
    "status": "APPROVED",
    "approvedAt": "2025-10-16T10:30:00.000Z",
    "journalEntry": {
      "id": "JE_ID",
      "entryNumber": "JE-202501-XXXX",
      "description": "Invoice INV-202501-XXXX - TechSoft Solutions Ltd",
      "totalDebit": 1800.00,
      "totalCredit": 1800.00,
      "entries": [
        {
          "account": "Software Expense",
          "accountCode": "5030",
          "debit": 1800.00,
          "credit": 0
        },
        {
          "account": "Accounts Payable",
          "accountCode": "2010",
          "debit": 0,
          "credit": 1800.00
        }
      ]
    }
  }
}
```

**✅ What Happened:**
- Admin User (FIN_MGR) completed final approval
- Invoice status changed to `APPROVED`
- **ACCOUNTING ENTRY CREATED AUTOMATICALLY:**
  - Dr. Software Expense $1,800
  - Cr. Accounts Payable $1,800
- Ready for payment!

---

#### **STEP F15: Process Payment (as Admin)**

```bash
POST http://localhost:3000/api/procurement/invoices/INVOICE_ID/pay
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{
  "paymentMethod": "BANK_TRANSFER",
  "paymentReference": "TRF-FIN-202501-001",
  "paymentDate": "2025-10-16",
  "paidAmount": 1800.00,
  "bankAccountId": "YOUR_BANK_ACCOUNT_ID",
  "notes": "Payment for software licenses Q1 2025"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Payment processed successfully. Vendor has been notified.",
  "data": {
    "status": "PAID",
    "paidAt": "2025-10-16T10:45:00.000Z",
    "paidAmount": 1800.00,
    "journalEntry": {
      "id": "JE_PAYMENT_ID",
      "entryNumber": "JE-202501-YYYY",
      "description": "Payment for INV-202501-XXXX",
      "entries": [
        {
          "account": "Accounts Payable",
          "accountCode": "2010",
          "debit": 1800.00,
          "credit": 0
        },
        {
          "account": "Bank Account - USD",
          "accountCode": "1030",
          "debit": 0,
          "credit": 1800.00
        }
      ]
    },
    "emailSent": true
  }
}
```

**✅ What Happened:**
- Payment processed successfully
- Invoice status changed to `PAID`
- **PAYMENT ACCOUNTING ENTRY CREATED:**
  - Dr. Accounts Payable $1,800 (clearing the liability)
  - Cr. Bank Account $1,800 (money out)
- **EMAIL SENT TO VENDOR:** "Your invoice has been paid. Payment reference: TRF-FIN-202501-001"

---

### 🎉 **FINANCE WORKFLOW COMPLETE!**

**You just completed a full Finance department procurement cycle:**

✅ Lisa (Accountant) created a requisition  
✅ Admin (Finance Manager) approved the requisition  
✅ Admin sent RFQ to vendors  
✅ Vendor submitted quotation online (no login!)  
✅ Admin accepted winning quotation  
✅ Invoice automatically created  
✅ Lisa (Accountant) reviewed and approved invoice (Step 1)  
✅ Admin (Finance Manager) gave final approval (Step 2)  
✅ Admin processed payment  
✅ All accounting entries created automatically  
✅ Vendor notified via email at every stage  

**📊 Accounting Impact:**
```
1. Invoice Approval:
   Dr. Software Expense        $1,800
   Cr. Accounts Payable                $1,800

2. Payment Processing:
   Dr. Accounts Payable        $1,800
   Cr. Bank Account                    $1,800

Net Result: Expense recorded, liability cleared, cash reduced ✅
```

---

## 🧪 **STEP-BY-STEP TESTING GUIDE (GENERAL)**

### **STEP 1: Create Purchase Requisition**

**NO PRICES, NO VENDORS - Just list what you need!**

```bash
POST http://localhost:3000/api/procurement/requisitions
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "title": "Monthly Office Rent & Supplies - January 2025",
  "description": "Rent for main office and office supplies",
  "departmentId": "YOUR_DEPARTMENT_ID",
  "priority": "HIGH",
  "justification": "Essential operational expenses for Q1 2025",
  "items": [
    {
      "itemName": "Office Rent - Main Building",
      "description": "Monthly rent for 500 sqm office space",
      "quantity": 1,
      "unit": "month"
    },
    {
      "itemName": "Office Supplies Bundle",
      "description": "Paper, pens, folders, staplers, etc.",
      "quantity": 50,
      "unit": "units"
    },
    {
      "itemName": "Cleaning Services",
      "description": "Daily cleaning for entire office",
      "quantity": 1,
      "unit": "month"
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
    "id": "REQ_ID_HERE",
    "requisitionNumber": "REQ-202501-0001",
    "status": "DRAFT",
    "totalAmount": 0,  // ⬅️ NO PRICES YET
    "items": [
      {
        "itemName": "Office Rent - Main Building",
        "quantity": 1,
        "unitPrice": 0,  // ⬅️ NO PRICES YET
        "totalPrice": 0
      },
      // ... other items
    ]
  }
}
```

**✅ What Happens:**
- Requisition created with items
- No prices required
- No vendors selected
- Status: DRAFT

---

### **STEP 2: Submit Requisition for Approval**

```bash
PUT http://localhost:3000/api/procurement/requisitions/REQ_ID_HERE/submit
Authorization: Bearer YOUR_TOKEN_HERE
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Purchase requisition submitted successfully",
  "data": {
    "id": "REQ_ID_HERE",
    "status": "PENDING_APPROVAL"
  }
}
```

---

### **STEP 3: Approve Requisition**

```bash
PUT http://localhost:3000/api/procurement/requisitions/REQ_ID_HERE/approve
Authorization: Bearer YOUR_TOKEN_HERE
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Purchase requisition approved successfully",
  "data": {
    "id": "REQ_ID_HERE",
    "status": "APPROVED",
    "approvedAt": "2025-10-14T10:30:00.000Z"
  }
}
```

---

### **STEP 4: Create and Send RFQ to Multiple Vendors (WITH QUOTATION LINK)** ⭐ **ENHANCED!**

**This is the key step - send RFQ to multiple vendors with online quotation link!**

First, get your vendor IDs:
```bash
GET http://localhost:3000/api/vendors
Authorization: Bearer YOUR_TOKEN_HERE
```

Then create and send RFQ:

```bash
POST http://localhost:3000/api/procurement/rfq
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "requisitionId": "REQ_ID_HERE",
  "title": "RFQ - Office Rent & Supplies January 2025",
  "description": "We are seeking competitive quotes for office rent and supplies. Please provide your best pricing.",
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
      "itemName": "Office Rent - Main Building",
      "description": "Monthly rent for 500 sqm office space",
      "quantity": 1,
      "unit": "month"
    },
    {
      "itemName": "Office Supplies Bundle",
      "description": "Paper, pens, folders, staplers, etc.",
      "quantity": 50,
      "unit": "units"
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
    "rfqNumber": "RFQ-202501-0001",
    "title": "RFQ - Office Rent & Supplies January 2025",
    "vendors": [
      {
        "id": "VENDOR_ID_1",
        "name": "ABC Property Management",
        "email": "quotes@abcproperty.com"
      },
      {
        "id": "VENDOR_ID_2",
        "name": "XYZ Office Supplies",
        "email": "sales@xyzsupplies.com"
      },
      {
        "id": "VENDOR_ID_3",
        "name": "Premium Services Ltd",
        "email": "info@premiumservices.com"
      }
    ],
    "status": "SENT"
  }
}
```

**✅ What Happens:**
- RFQ emails sent to ALL 3 vendors
- Each vendor receives a beautifully formatted RFQ email
- Email includes:
  - RFQ number and date
  - Items/services required
  - Quantities and specifications
  - Delivery address and deadline
  - **🌟 Prominent "Submit Quotation Online" button with link**
  - **🌟 Link includes RFQ number for auto-population**
  - Alternative email submission instructions
- Requisition status updated to `RFQ_SENT`
- Console logs show detailed progress

**📧 Email Template Sent:**
Each vendor receives an email like this:
```
Subject: Request for Quote RFQ-202501-0001 - NVCCZ

Dear [Vendor Name],

We are seeking competitive quotes for the following items/services...

RFQ Information:
- RFQ Number: RFQ-202501-0001
- Date: October 14, 2025
- Project: Office Rent & Supplies January 2025

Response Deadline: January 10, 2025

Items/Services Required:
1. Office Rent - Main Building
   Quantity: 1 month
   
2. Office Supplies Bundle
   Quantity: 50 units

🌟 How to Submit Your Quote:

Option 1: Submit Online (Recommended)
[Submit Your Quotation Online] ← Big Button
Link: https://nvccz.com/vendor/quotation/submit?rfq=RFQ-202501-0001
This is the fastest way to submit your quote!

Option 2: Reply by Email
1. Company Name and Tax EIN
2. Contact Person and Phone
3. Unit Price for each item
4. Total Price including all costs
5. VAT/Tax amount
6. Delivery Timeline
7. Payment Terms
8. Warranty period (if applicable)
9. Quote validity period

[Full formatted email with instructions...]
```

---

### **STEP 5: Vendors Submit Quotations Online** 🌟 **NEW!**

**Vendors can now submit quotations online without any authentication!**

When vendors receive the RFQ email, they click the "Submit Quotation Online" button which takes them to a public form.

**Vendor A Submits Online:**
```bash
POST http://localhost:3000/api/vendor-quotations/submit
Content-Type: application/json
# NO AUTHORIZATION HEADER NEEDED!

{
  "rfqNumber": "RFQ-202501-0001",
  "vendorName": "John Doe",
  "vendorEmail": "quotes@abcproperty.com",
  "companyName": "ABC Property Management",
  "taxEIN": "12-3456789",
  "contactPerson": "John Doe",
  "phoneNumber": "+263771234567",
  "currencyCode": "USD",
  "paymentTerms": "NET 30",
  "deliveryTime": "Immediate",
  "items": [
    {
      "itemName": "Office Rent - Main Building",
      "quantity": 1,
      "unit": "month",
      "unitPrice": 5000.00
    },
    {
      "itemName": "Office Supplies Bundle",
      "quantity": 50,
      "unit": "units",
      "unitPrice": 45.00
    }
  ]
}
```

**Vendor B Submits Online:**
```bash
POST http://localhost:3000/api/vendor-quotations/submit
Content-Type: application/json

{
  "rfqNumber": "RFQ-202501-0001",
  "vendorName": "Jane Smith",
  "vendorEmail": "sales@xyzsupplies.com",
  "companyName": "XYZ Office Supplies",
  "taxEIN": "98-7654321",
  "currencyCode": "USD",
  "paymentTerms": "NET 30",
  "deliveryTime": "3 days",
  "items": [
    {
      "itemName": "Office Rent - Main Building",
      "quantity": 1,
      "unit": "month",
      "unitPrice": 4800.00
    },
    {
      "itemName": "Office Supplies Bundle",
      "quantity": 50,
      "unit": "units",
      "unitPrice": 40.00
    }
  ]
}
```

**📊 System Calculations:**
- **Vendor A:** Subtotal: $7,250 → **Total: $7,250** (+ VAT if applicable)
- **Vendor B:** Subtotal: $6,800 → **Total: $6,800** ⭐ **BEST PRICE!**
- Vendor C: (didn't submit)

---

### **STEP 6: View and Compare Quotations** 🌟 **NEW!**

```bash
# View all quotations for this RFQ
GET http://localhost:3000/api/vendor-quotations/rfq/RFQ-202501-0001
Authorization: Bearer YOUR_TOKEN_HERE
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Quotations retrieved successfully",
  "data": [
    {
      "id": "QUOTE_1",
      "quotationNumber": "QUOTE-1729012456-789",
      "companyName": "ABC Property Management",
      "vendorEmail": "quotes@abcproperty.com",
      "totalAmount": 7250.00,
      "status": "SUBMITTED",
      "paymentTerms": "NET 30",
      "deliveryTime": "Immediate"
    },
    {
      "id": "QUOTE_2",
      "quotationNumber": "QUOTE-1729012457-790",
      "companyName": "XYZ Office Supplies",
      "vendorEmail": "sales@xyzsupplies.com",
      "totalAmount": 6800.00,
      "status": "SUBMITTED",
      "paymentTerms": "NET 30",
      "deliveryTime": "3 days"
    }
  ],
  "count": 2
}
```

**📊 Compare and Select Winner:**
- Vendor A (ABC): $7,250.00
- Vendor B (XYZ): $6,800.00 ⭐ **WINNER! - Best price**
- Vendor C: (didn't submit)

---

### **STEP 7: Accept Winning Quotation** 🌟 **NEW!**

**Accept the winning quotation - the system will automatically create an invoice!**

```bash
POST http://localhost:3000/api/vendor-quotations/QUOTE_2/accept
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "reviewNotes": "Best price and delivery time. Vendor has good track record.",
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
      "id": "QUOTE_2",
      "quotationNumber": "QUOTE-1729012457-790",
      "status": "ACCEPTED",
      "reviewedAt": "2025-10-15T14:00:00.000Z"
    },
    "invoice": {
      "id": "INV_AUTO_ID",
      "invoiceNumber": "INV-QUOTE-1729012457-790",
      "quotationId": "QUOTE_2",
      "vendorId": "VENDOR_ID_2",
      "subtotal": 6800.00,
      "taxAmount": 0.00,
      "totalAmount": 6800.00,
      "status": "DRAFT",
      "items": [
        {
          "itemName": "Office Rent - Main Building",
          "quantity": 1,
          "unitPrice": 4800.00,
          "totalPrice": 4800.00
        },
        {
          "itemName": "Office Supplies Bundle",
          "quantity": 50,
          "unitPrice": 40.00,
          "totalPrice": 2000.00
        }
      ]
    }
  }
}
```

**✅ What Happens:**
- Quotation status → `ACCEPTED`
- **Invoice automatically created** from quotation data
- All line items transferred from quotation to invoice
- Invoice status: `DRAFT` (ready for approval)
- **Email sent to vendor** confirming acceptance
- Audit log created

---

### **STEP 8: Reject Other Quotations** 🌟 **NEW!**

**Reject the other quotations with a reason:**

```bash
POST http://localhost:3000/api/vendor-quotations/QUOTE_1/reject
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
    "id": "QUOTE_1",
    "quotationNumber": "QUOTE-1729012456-789",
    "status": "REJECTED",
    "rejectionReason": "Price exceeds budget...",
    "reviewedAt": "2025-10-15T14:05:00.000Z"
  }
}
```

**✅ What Happens:**
- Quotation status → `REJECTED`
- **Email sent to vendor** with professional rejection notice
- Rejection reason included in email
- Audit log created

---

### **STEP 9: Approve Auto-Generated Invoice** 🌟 **UPDATED!**

**Now approve the invoice that was automatically created:**

```bash
POST http://localhost:3000/api/procurement/invoices
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "vendorId": "VENDOR_ID_2",  // ⬅️ XYZ Office Supplies (winner)
  "currencyId": "USD_CURRENCY_ID",
  "invoiceNumber": "XYZ-INV-2025-001",
  "invoiceDate": "2025-01-11",
  "dueDate": "2025-02-10",
  "paymentTerms": "NET 30",
  "items": [
    {
      "itemName": "Office Rent - Main Building",
      "description": "Monthly rent for 500 sqm office space",
      "quantity": 1,
      "unitPrice": 4800.00,  // ⬅️ From vendor's quote
      "accountId": "RENT_EXPENSE_ACCOUNT_ID"
    },
    {
      "itemName": "Office Supplies Bundle",
      "description": "Paper, pens, folders, staplers",
      "quantity": 50,
      "unitPrice": 40.00,  // ⬅️ From vendor's quote
      "accountId": "OFFICE_SUPPLIES_ACCOUNT_ID"
    }
  ],
  "taxRate": 14.5,
  "notes": "Invoice from winning RFQ quote. Payment terms: NET 30"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Procurement invoice created successfully",
  "data": {
    "id": "INVOICE_ID",
    "invoiceNumber": "XYZ-INV-2025-001",
    "vendorId": "VENDOR_ID_2",
    "subtotal": 6800.00,
    "taxAmount": 986.00,
    "totalAmount": 7786.00,
    "status": "DRAFT",
    "items": [
      {
        "itemName": "Office Rent - Main Building",
        "quantity": 1,
        "unitPrice": 4800.00,
        "totalPrice": 4800.00
      },
      {
        "itemName": "Office Supplies Bundle",
        "quantity": 50,
        "unitPrice": 40.00,
        "totalPrice": 2000.00
      }
    ]
  }
}
```

---

```bash
PUT http://localhost:3000/api/procurement/invoices/INV_AUTO_ID/approve
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
      "journalEntryNumber": "INV-XYZ-INV-2025-001",
      "description": "Invoice approval: XYZ-INV-2025-001",
      "totalDebit": 7786.00,
      "totalCredit": 7786.00,
      "status": "POSTED",
      "lines": [
        {
          "accountId": "RENT_EXPENSE_ACCOUNT_ID",
          "accountName": "Rent Expense",
          "debit": 4800.00,
          "credit": 0
        },
        {
          "accountId": "OFFICE_SUPPLIES_ACCOUNT_ID",
          "accountName": "Office Supplies",
          "debit": 2000.00,
          "credit": 0
        },
        {
          "accountId": "VAT_INPUT_ACCOUNT_ID",
          "accountName": "VAT Input",
          "debit": 986.00,
          "credit": 0
        },
        {
          "accountId": "ACCOUNTS_PAYABLE_ID",
          "accountName": "Accounts Payable",
          "debit": 0,
          "credit": 7786.00
        }
      ]
    }
  }
}
```

**✅ What Happens:**
- Invoice status → `APPROVED`
- **Journal Entry Created:**
  - Dr. Rent Expense $4,800
  - Dr. Office Supplies $2,000
  - Dr. VAT Input $986
  - Cr. Accounts Payable $7,786
- Liability recorded in books
- Detailed console logs show each step

**📊 Console Logs:**
```
════════════════════════════════════════════════════════════════
💰 INVOICE APPROVAL - ACCOUNTING OPERATION
════════════════════════════════════════════════════════════════
Invoice: XYZ-INV-2025-001
Vendor: XYZ Office Supplies
Amount: $7,786.00

🔍 Step 1: Validating invoice...
   ✅ Invoice found
   ✅ Invoice is in DRAFT status
   ✅ Validation passed

📊 Step 2: Creating journal entry...
   Accounting Impact:
   Dr. Rent Expense         $4,800.00
   Dr. Office Supplies      $2,000.00
   Dr. VAT Input            $986.00
   Cr. Accounts Payable     $7,786.00
   
   ✅ Journal entry created: INV-XYZ-INV-2025-001

✅ Step 3: Updating invoice status...
   ✅ Invoice approved successfully

📝 Step 4: Creating audit log...
   ✅ Audit log created

════════════════════════════════════════════════════════════════
✅ INVOICE APPROVED SUCCESSFULLY!
════════════════════════════════════════════════════════════════
```

---

### **STEP 10: Process Payment (WITH EMAIL NOTIFICATION)** 🌟 **ENHANCED!**

```bash
POST http://localhost:3000/api/procurement/invoices/INV_AUTO_ID/payment
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "paymentAmount": 6800.00,
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
    "id": "INVOICE_ID",
    "status": "PAID",
    "paidAt": "2025-02-08T00:00:00.000Z",
    "paymentMethod": "BANK",
    "paymentReference": "BANK-TXN-2025-001",
    "journalEntry": {
      "id": "JE_ID",
      "journalEntryNumber": "PAY-XYZ-INV-2025-001",
      "description": "Payment for invoice: XYZ-INV-2025-001",
      "totalDebit": 7786.00,
      "totalCredit": 7786.00,
      "status": "POSTED",
      "lines": [
        {
          "accountId": "ACCOUNTS_PAYABLE_ID",
          "accountName": "Accounts Payable",
          "debit": 7786.00,
          "credit": 0
        },
        {
          "accountId": "BANK_USD_ACCOUNT_ID",
          "accountName": "Bank Account - USD",
          "debit": 0,
          "credit": 7786.00
        }
      ]
    }
  }
}
```

**✅ What Happens:**
- Invoice status → `PAID`
- **Journal Entry Created:**
  - Dr. Accounts Payable $6,800
  - Cr. Bank Account - USD $6,800
- **Email confirmation sent to vendor** 🌟
- Vendor receives payment details and confirmation
- Liability cleared
- Cash reduced
- Detailed console logs show each step

**📊 Console Logs:**
```
════════════════════════════════════════════════════════════════
💳 PAYMENT PROCESSING - ACCOUNTING OPERATION
════════════════════════════════════════════════════════════════
Invoice: XYZ-INV-2025-001
Vendor: XYZ Office Supplies
Amount: $7,786.00
Payment Method: BANK

🔍 Step 1: Validating invoice...
   ✅ Invoice found
   ✅ Invoice is APPROVED and ready for payment
   ✅ Validation passed

📊 Step 2: Creating payment journal entry...
   Accounting Impact:
   Dr. Accounts Payable     $7,786.00
   Cr. Bank Account - USD   $7,786.00
   
   ✅ Journal entry created: PAY-XYZ-INV-2025-001

✅ Step 3: Recording payment...
   ✅ Invoice marked as PAID
   ✅ Payment reference: BANK-TXN-2025-001

📝 Step 4: Creating audit log...
   ✅ Audit log created

════════════════════════════════════════════════════════════════
✅ PAYMENT PROCESSED SUCCESSFULLY!
════════════════════════════════════════════════════════════════
Liability cleared. Transaction complete.
```

---

## 💰 **ACCOUNTING IMPACT SUMMARY**

### **Complete Accounting Cycle**

**1. Invoice Approval (Liability Creation)**
```
Dr. Rent Expense         $4,800.00
Dr. Office Supplies      $2,000.00
Dr. VAT Input            $986.00
    Cr. Accounts Payable             $7,786.00
```
**Effect:** 
- Expenses recorded
- Liability created
- VAT input recorded (recoverable)

**2. Payment Processing (Liability Settlement)**
```
Dr. Accounts Payable     $7,786.00
    Cr. Bank Account - USD           $7,786.00
```
**Effect:**
- Liability cleared
- Cash reduced

**3. Net Effect on Accounts**

| Account | Debit | Credit | Net Effect |
|---------|-------|--------|------------|
| Rent Expense | $4,800 | - | +$4,800 (expense) |
| Office Supplies | $2,000 | - | +$2,000 (expense) |
| VAT Input | $986 | - | +$986 (asset) |
| Accounts Payable | $7,786 | $7,786 | $0 (cleared) |
| Bank Account - USD | - | $7,786 | -$7,786 (reduced) |

**✅ Books Balanced:** Total Debits = Total Credits = $15,572

---

## 📊 **VERIFICATION CHECKLIST**

After completing the cycle, verify:

### **1. Check Journal Entries**
```bash
GET http://localhost:3000/api/accounting/journal-entries?status=POSTED
```

Expected: 2 journal entries
- `INV-XYZ-INV-2025-001` (invoice approval)
- `PAY-XYZ-INV-2025-001` (payment)

### **2. Check Trial Balance**
```bash
GET http://localhost:3000/api/accounting/trial-balance
```

Verify accounts:
- Rent Expense: Debit $4,800
- Office Supplies: Debit $2,000
- VAT Input: Debit $986
- Accounts Payable: $0 (cleared)
- Bank Account - USD: Credit $7,786

### **3. Check Invoice Status**
```bash
GET http://localhost:3000/api/procurement/invoices/INVOICE_ID
```

Expected status: `PAID`

### **4. Check Requisition Status**
```bash
GET http://localhost:3000/api/procurement/requisitions/REQ_ID
```

Expected:
- Status: `RFQ_SENT`
- Notes field contains RFQ data

---

## 🐛 **TROUBLESHOOTING**

### **Issue: RFQ Email Not Sent**

**Symptoms:**
- API returns success but vendors don't receive emails

**Causes & Solutions:**
1. **Email service not configured**
   ```bash
   # Check .env file
   ZEPTO_API_KEY=your_key_here
   ```

2. **Invalid vendor email**
   - Check vendor has valid email: `GET /api/vendors/VENDOR_ID`
   - Update if needed: `PUT /api/vendors/VENDOR_ID`

3. **Email service error**
   - Check console logs for errors
   - Verify ZeptoMail API key is valid

---

### **Issue: Invoice Approval Fails**

**Symptoms:**
- Error: "Failed to approve invoice"

**Causes & Solutions:**
1. **Missing Chart of Accounts**
   ```bash
   # Run this script to add missing accounts
   node scripts/add-procurement-accounts.js
   ```

2. **Invalid account IDs in invoice items**
   - Verify account IDs exist: `GET /api/accounting/chart-of-accounts`
   - Update invoice with correct account IDs

3. **Invoice already approved**
   - Check invoice status: `GET /api/procurement/invoices/INVOICE_ID`
   - Only DRAFT invoices can be approved

---

### **Issue: Payment Processing Fails**

**Symptoms:**
- Error: "Bank account not found"

**Causes & Solutions:**
1. **Missing bank account in chart of accounts**
   ```bash
   # Check for bank accounts
   GET /api/accounting/chart-of-accounts?accountType=Current Asset
   
   # Create if missing
   POST /api/accounting/chart-of-accounts
   {
     "accountNo": "1030",
     "accountName": "Bank Account - USD",
     "accountType": "Current Asset",
     "financialStatement": "Balance Sheet"
   }
   ```

2. **Invoice not approved**
   - Invoice must be `APPROVED` before payment
   - Check status: `GET /api/procurement/invoices/INVOICE_ID`

---

### **Issue: Unbalanced Journal Entries**

**Symptoms:**
- Error: "Journal entry is unbalanced"

**Causes & Solutions:**
1. **Tax calculation error**
   - Check invoice: `GET /api/procurement/invoices/INVOICE_ID`
   - Verify: `subtotal × taxRate = taxAmount`
   - Verify: `subtotal + taxAmount = totalAmount`

2. **Rounding issues**
   - Ensure all amounts are rounded to 2 decimal places
   - Use `Decimal` type in database

---

### **Issue: Vendors Not Found**

**Symptoms:**
- Error: "One or more vendors not found"

**Causes & Solutions:**
1. **Invalid vendor IDs**
   ```bash
   # List all vendors
   GET /api/vendors
   
   # Use correct IDs from the response
   ```

2. **Vendors deleted**
   - Check vendor still exists in database

---

## 📝 **BEST PRACTICES**

1. **Always send RFQ to at least 3 vendors** for competitive pricing
2. **Set realistic RFQ deadlines** (give vendors 5-7 days minimum)
3. **Document vendor selection criteria** in invoice notes
4. **Verify vendor email addresses** before sending RFQ
5. **Keep email responses** from vendors for audit trail
6. **Review all quotes** before selecting winner
7. **Approve invoices promptly** to avoid delays
8. **Use payment references** for bank reconciliation
9. **Monitor trial balance** regularly to ensure books balance
10. **Review audit logs** for compliance

---

## 🎉 **SUCCESS CRITERIA**

Your RFQ-based procurement cycle is working correctly if:

✅ Requisitions can be created without prices  
✅ RFQs are sent to multiple vendors successfully  
✅ Vendors receive formatted RFQ emails  
✅ Invoices can be created with winning vendor's prices  
✅ Invoice approval creates correct journal entry (liability)  
✅ Payment processing creates correct journal entry (clears liability)  
✅ Trial balance remains balanced after all operations  
✅ All journal entries have `POSTED` status  
✅ Console logs show detailed accounting operations  
✅ Audit trail is complete  

---

## 📞 **SUPPORT**

If you encounter issues not covered in this guide:

1. Check console logs for detailed error messages
2. Verify all prerequisites are met
3. Check database for data integrity
4. Review audit logs: `GET /api/audit-logs`
5. Contact system administrator

---

**Last Updated:** October 14, 2025  
**Version:** 2.0 (RFQ-Based)  
**Author:** NVCCZ Development Team
