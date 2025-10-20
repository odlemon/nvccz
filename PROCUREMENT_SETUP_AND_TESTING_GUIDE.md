# 🚀 PROCUREMENT MODULE - COMPLETE SETUP & TESTING GUIDE

## 📋 **TABLE OF CONTENTS**
1. [Prerequisites](#prerequisites)
2. [Step 1: Setup Approval Configuration](#step-1-setup-approval-configuration)
3. [Step 2: Setup Master Data](#step-2-setup-master-data)
4. [Step 3: Test Complete Procurement Flow](#step-3-test-complete-procurement-flow)
5. [Step 4: Test New Vendor Quotation System](#step-4-test-new-vendor-quotation-system)

---

## 📚 **PREREQUISITES**

### **1. Get Authentication Token**
```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Save the token - you'll need it for all API calls!**

### **2. Get Your User ID**
```bash
GET http://localhost:3000/api/users/me
Authorization: Bearer YOUR_TOKEN
```

Save your user ID for later steps.

---

## 🔧 **STEP 1: SETUP APPROVAL CONFIGURATION**

### **1.1 Understanding the System**

**🏢 HARDCODED DEPARTMENTS (For User Assignment):**
The procurement system uses **7 hardcoded department names**:
1. 💰 Finance
2. ⚙️ Operations
3. 📦 Procurement
4. 👥 Human Resources
5. 📢 Marketing
6. ⚖️ Legal
7. 💻 IT

These are assigned to users via `userDepartment` field (string, not ID).

**🔐 DYNAMIC ROLES (In Database):**
Roles are stored in the database and need to be created. Default role from seed:
- `admin` - Full system access

You'll likely need to create:
- `finance_manager`
- `procurement_manager`
- `operations_manager`
- etc.

---

### **1.2 Create Roles First**

Before configuring approvals, create the roles you need:

```bash
POST http://localhost:3000/api/roles
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "name": "finance_manager",
  "description": "Finance Manager Role",
  "permissions": [
    {"name": "view_accounting", "value": true},
    {"name": "manage_accounting", "value": true},
    {"name": "approve_invoices", "value": true}
  ]
}
```

Repeat for other roles like:
- `procurement_manager`
- `operations_manager`
- `ceo`

**Then get all roles:**
```bash
GET http://localhost:3000/api/roles
Authorization: Bearer YOUR_TOKEN
```

**Save role IDs!**

---

### **1.3 Get Department IDs (If Using DEPARTMENT Step Type)**

The approval system can also reference the `Department` table:

```bash
GET http://localhost:3000/api/departments
Authorization: Bearer YOUR_TOKEN
```

**Note:** You may need to create departments first if none exist.

---

### **1.4 Get User IDs (If Using USER Step Type)**

```bash
GET http://localhost:3000/api/users
Authorization: Bearer YOUR_TOKEN
```

**Save user IDs** for specific approvers if you want USER-based approval steps

---

### **1.5 Create Procurement Approval Configuration**

Now create the approval configuration with the Role IDs you created:

```bash
POST http://localhost:3000/api/procurement-approval-configs
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "name": "Main Procurement Approval Configuration",
  "description": "Default approval workflow for all procurement stages",
  "isActive": true,
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Finance Manager Approval",
          "stepType": "ROLE",
          "roleId": "YOUR_FINANCE_MANAGER_ROLE_ID",
          "isRequired": true,
          "canDelegate": true,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    },
    {
      "stageType": "INVOICE",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Finance Approval",
          "stepType": "ROLE",
          "roleId": "YOUR_FINANCE_MANAGER_ROLE_ID",
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    }
  ]
}
```

**📝 Step Type Options:**

1. **ROLE** (Recommended) - Requires user with specific role ID
2. **USER** - Requires specific user ID
3. **DEPARTMENT** - Requires user from specific department ID (from Department table)
4. **AMOUNT_THRESHOLD** - Auto-approve below threshold amount

**Expected Response:**
```json
{
  "success": true,
  "message": "Procurement approval configuration created successfully",
  "data": {
    "id": "CONFIG_ID_HERE",
    "name": "Main Procurement Approval Configuration",
    "isActive": true,
    "stages": [...]
  }
}
```

**✅ Save the CONFIG_ID!**

---

### **1.6 Assign Users to Roles and Departments**

**IMPORTANT:** Users need both:
1. **Role** (`roleId`) - For approval permissions
2. **Department** (`userDepartment`) - For requisition context
3. **Department Role** (`departmentRole`) - HEAD, DEPUTY, or MEMBER

**Example: Update a user to be Finance Manager:**
```sql
UPDATE users 
SET 
  roleId = 'YOUR_FINANCE_MANAGER_ROLE_ID',
  userDepartment = 'Finance',
  departmentRole = 'HEAD'
WHERE email = 'john@company.com';
```

Or via API if available.

---

### **1.7 Verify Configuration**

```bash
# Get all configurations
GET http://localhost:3000/api/procurement-approval-configs
Authorization: Bearer YOUR_TOKEN

# Get active configuration
GET http://localhost:3000/api/procurement-approval-configs/active
Authorization: Bearer YOUR_TOKEN

# Get specific configuration
GET http://localhost:3000/api/procurement-approval-configs/CONFIG_ID
Authorization: Bearer YOUR_TOKEN
```

---

## 📦 **STEP 2: SETUP MASTER DATA**

### **2.1 Create Currencies**

```bash
POST http://localhost:3000/api/accounting/currencies
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "code": "USD",
  "name": "US Dollar",
  "symbol": "$",
  "exchangeRate": 1.0
}
```

Repeat for other currencies (ZWL, EUR, etc.)

### **2.2 Create Vendors**

**IMPORTANT:** Create vendors with valid emails - these emails will receive RFQs and quotation links!

```bash
POST http://localhost:3000/api/accounting/vendors
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "name": "ABC Office Supplies Ltd",
  "email": "quotes@abcsupplies.com",
  "phone": "+263771234567",
  "address": "123 Industrial Road, Harare, Zimbabwe",
  "taxId": "12-3456789",
  "paymentTerms": "NET 30",
  "category": "Office Supplies"
}
```

**Create at least 3 vendors for competitive RFQ testing!**

#### **Example Vendors:**
1. **ABC Office Supplies** - quotes@abcsupplies.com
2. **XYZ Furniture Ltd** - sales@xyzfurniture.com
3. **Premium Services** - info@premiumservices.com

**Save vendor IDs!**

### **2.3 Create Chart of Accounts**

Make sure you have these accounts:

```bash
# Check existing accounts
GET http://localhost:3000/api/accounting/chart-of-accounts
Authorization: Bearer YOUR_TOKEN

# Create if missing - Accounts Payable
POST http://localhost:3000/api/accounting/chart-of-accounts
{
  "accountNo": "2010",
  "accountName": "Accounts Payable",
  "accountType": "Current Liability",
  "financialStatement": "Balance Sheet"
}

# VAT Input
POST http://localhost:3000/api/accounting/chart-of-accounts
{
  "accountNo": "1220",
  "accountName": "VAT Input",
  "accountType": "Current Asset",
  "financialStatement": "Balance Sheet"
}

# Bank Account - USD
POST http://localhost:3000/api/accounting/chart-of-accounts
{
  "accountNo": "1030",
  "accountName": "Bank Account - USD",
  "accountType": "Current Asset",
  "financialStatement": "Balance Sheet"
}

# Office Supplies Expense
POST http://localhost:3000/api/accounting/chart-of-accounts
{
  "accountNo": "5020",
  "accountName": "Office Supplies",
  "accountType": "Expense",
  "financialStatement": "Income Statement"
}
```

**Save account IDs!**

---

## 🧪 **STEP 3: TEST COMPLETE PROCUREMENT FLOW**

Now let's test the entire procurement flow from requisition to payment:

### **3.1 Create Purchase Requisition**

```bash
POST http://localhost:3000/api/procurement/requisitions
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "title": "Office Furniture Q1 2025",
  "description": "Furniture for new office space",
  "department": "Operations",
  "priority": "HIGH",
  "justification": "Expanding team requires new office furniture",
  "items": [
    {
      "itemName": "Office Desk",
      "description": "Executive wooden desk, 1.6m x 0.8m",
      "quantity": 10,
      "unit": "pieces"
    },
    {
      "itemName": "Office Chair",
      "description": "Ergonomic chair with lumbar support",
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
  "message": "Purchase requisition created successfully",
  "data": {
    "id": "REQ_ID",
    "requisitionNumber": "REQ-202510-0001",
    "status": "DRAFT",
    "items": [...]
  }
}
```

**✅ Save REQ_ID!**

---

### **3.2 Submit Requisition for Approval**

```bash
POST http://localhost:3000/api/procurement/requisitions/REQ_ID/submit
Authorization: Bearer YOUR_TOKEN
```

**Status changes:** DRAFT → PENDING_APPROVAL

---

### **3.3 Approve Requisition**

```bash
POST http://localhost:3000/api/procurement/requisitions/REQ_ID/approve
Authorization: Bearer YOUR_TOKEN
```

**Status changes:** PENDING_APPROVAL → APPROVED

---

### **3.4 Create and Send RFQ with Quotation Link** 🌟

**This is where the magic happens!**

```bash
POST http://localhost:3000/api/procurement/rfq
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "requisitionId": "REQ_ID",
  "title": "RFQ - Office Furniture Q1 2025",
  "description": "We are seeking competitive quotes for office furniture",
  "vendorIds": [
    "VENDOR_ID_1",
    "VENDOR_ID_2",
    "VENDOR_ID_3"
  ],
  "priority": "HIGH",
  "deliveryAddress": "123 Main Street, Harare, Zimbabwe",
  "expectedDeliveryDate": "2025-11-30",
  "rfqDeadline": "2025-11-20",
  "specialRequirements": "All prices in USD. Payment terms: NET 30",
  "items": [
    {
      "itemName": "Office Desk",
      "description": "Executive wooden desk, 1.6m x 0.8m",
      "quantity": 10,
      "unit": "pieces"
    },
    {
      "itemName": "Office Chair",
      "description": "Ergonomic chair with lumbar support",
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
    "vendors": [...]
  }
}
```

**✅ Save RFQ_NUMBER!**

**What happens:**
- ✅ Emails sent to ALL 3 vendors
- ✅ Each email includes "Submit Quotation Online" button
- ✅ Link format: `https://nvccz.com/vendor/quotation/submit?rfq=RFQ-1729012345-123`
- ✅ Requisition status → RFQ_SENT

---

## 🌟 **STEP 4: TEST NEW VENDOR QUOTATION SYSTEM**

### **4.1 Vendor Submits Quotation (PUBLIC - NO AUTH!)**

**Simulate vendor submission - NO TOKEN NEEDED:**

```bash
POST http://localhost:3000/api/vendor-quotations/submit
Content-Type: application/json
# NO AUTHORIZATION HEADER!

{
  "rfqNumber": "RFQ-1729012345-123",
  "vendorName": "John Doe",
  "vendorEmail": "quotes@abcsupplies.com",
  "companyName": "ABC Office Supplies Ltd",
  "taxEIN": "12-3456789",
  "contactPerson": "John Doe",
  "phoneNumber": "+263771234567",
  "address": "123 Industrial Road, Harare",
  "validUntil": "2025-12-31T00:00:00Z",
  "currencyCode": "USD",
  "paymentTerms": "NET 30",
  "deliveryTerms": "FOB",
  "deliveryTime": "5 business days",
  "notes": "Bulk discount available for orders over 20 units",
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
    "id": "QUOTE_ID_1",
    "quotationNumber": "QUOTE-1729012456-789",
    "totalAmount": 4300.00,
    "status": "SUBMITTED"
  }
}
```

**Repeat for other vendors with different prices!**

**Vendor 2 (Lower Price):**
- Office Desk: $220/unit
- Office Chair: $150/unit
- Total: $3,700

**Vendor 3:**
- Office Desk: $280/unit
- Office Chair: $200/unit
- Total: $4,800

---

### **4.2 View All Quotations for the RFQ**

```bash
GET http://localhost:3000/api/vendor-quotations/rfq/RFQ-1729012345-123
Authorization: Bearer YOUR_TOKEN
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
      "companyName": "ABC Office Supplies Ltd",
      "totalAmount": 4300.00,
      "status": "SUBMITTED"
    },
    {
      "id": "QUOTE_ID_2",
      "quotationNumber": "QUOTE-1729012457-790",
      "companyName": "XYZ Furniture Ltd",
      "totalAmount": 3700.00,
      "status": "SUBMITTED"
    },
    {
      "id": "QUOTE_ID_3",
      "quotationNumber": "QUOTE-1729012458-791",
      "companyName": "Premium Services",
      "totalAmount": 4800.00,
      "status": "SUBMITTED"
    }
  ]
}
```

**Compare and select winner:** QUOTE_ID_2 has the best price!

---

### **4.3 Accept Winning Quotation (Auto-Creates Invoice!)** 🌟

```bash
POST http://localhost:3000/api/vendor-quotations/QUOTE_ID_2/accept
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "reviewNotes": "Best price and excellent delivery time. Vendor has proven track record.",
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
      "status": "ACCEPTED",
      "reviewedAt": "2025-10-15T14:00:00.000Z"
    },
    "invoice": {
      "id": "INVOICE_ID",
      "invoiceNumber": "INV-QUOTE-1729012457-790",
      "quotationId": "QUOTE_ID_2",
      "totalAmount": 3700.00,
      "status": "DRAFT",
      "items": [...]
    }
  }
}
```

**✅ What happened:**
- Quotation status → ACCEPTED
- **Invoice automatically created!** 🎉
- Email sent to winning vendor
- Invoice ready for approval
- **Save INVOICE_ID!**

---

### **4.4 Reject Other Quotations**

```bash
POST http://localhost:3000/api/vendor-quotations/QUOTE_ID_1/reject
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "rejectionReason": "Price exceeds budget. We received a more competitive offer.",
  "reviewNotes": "Thank you for your submission. Please participate in future RFQs."
}
```

```bash
POST http://localhost:3000/api/vendor-quotations/QUOTE_ID_3/reject
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "rejectionReason": "Price exceeds budget.",
  "reviewNotes": "Thank you for participating."
}
```

**✅ What happened:**
- Quotation status → REJECTED
- Email sent to rejected vendors
- Professional rejection notice

---

### **4.5 Approve Auto-Generated Invoice**

```bash
POST http://localhost:3000/api/procurement/invoices/INVOICE_ID/approve
Authorization: Bearer YOUR_TOKEN
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
      "journalEntryNumber": "INV-INV-QUOTE-...",
      "totalDebit": 3700.00,
      "totalCredit": 3700.00,
      "lines": [
        {
          "accountName": "Office Supplies",
          "debit": 3700.00
        },
        {
          "accountName": "Accounts Payable",
          "credit": 3700.00
        }
      ]
    }
  }
}
```

**✅ What happened:**
- Invoice status → APPROVED
- Accounting entry created:
  - Dr. Office Supplies $3,700
  - Cr. Accounts Payable $3,700

---

### **4.6 Process Payment (with Email Notification!)** 🌟

```bash
POST http://localhost:3000/api/procurement/invoices/INVOICE_ID/payment
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "paymentAmount": 3700.00,
  "paymentMethod": "BANK",
  "paymentReference": "BANK-TXN-2025-001",
  "paymentDate": "2025-10-20T00:00:00Z",
  "notes": "Payment via Standard Bank"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Payment processed successfully",
  "data": {
    "invoice": {
      "status": "PAID",
      "paymentStatus": "PAID"
    },
    "journalEntry": {
      "journalEntryNumber": "PAY-INV-QUOTE-...",
      "lines": [
        {
          "accountName": "Accounts Payable",
          "debit": 3700.00
        },
        {
          "accountName": "Bank Account - USD",
          "credit": 3700.00
        }
      ]
    }
  }
}
```

**✅ What happened:**
- Invoice status → PAID
- Accounting entry created:
  - Dr. Accounts Payable $3,700
  - Cr. Bank Account - USD $3,700
- **Email sent to vendor** with payment confirmation! 🎉

---

## ✅ **CYCLE COMPLETE!**

You've successfully tested the entire procurement flow with the new vendor quotation system:

1. ✅ Set up approval configuration
2. ✅ Set up master data (vendors, currencies, accounts)
3. ✅ Created requisition → Approved
4. ✅ Sent RFQ with quotation link
5. ✅ Vendors submitted quotations online (no auth!)
6. ✅ Compared quotations
7. ✅ Accepted winner → Invoice auto-created
8. ✅ Rejected others → Emails sent
9. ✅ Approved invoice → Accounting entry
10. ✅ Paid invoice → Vendor notified by email

---

## 📧 **EMAIL CHECKLIST**

Verify these emails were sent:

- [ ] RFQ emails to 3 vendors (with quotation link button)
- [ ] Acceptance email to winning vendor
- [ ] Rejection emails to 2 rejected vendors
- [ ] Payment confirmation email to vendor

---

## 🎯 **NEXT STEPS**

1. **Check email inbox** (if email service configured)
2. **View audit logs:** `GET /api/audit-logs`
3. **Check trial balance:** `GET /api/accounting/trial-balance`
4. **View journal entries:** `GET /api/accounting/journal-entries`

---

## 📚 **ADDITIONAL ENDPOINTS**

### **View All Quotations**
```bash
GET http://localhost:3000/api/vendor-quotations
Authorization: Bearer YOUR_TOKEN
```

### **View All Invoices**
```bash
GET http://localhost:3000/api/procurement/invoices
Authorization: Bearer YOUR_TOKEN
```

### **View Requisitions**
```bash
GET http://localhost:3000/api/procurement/requisitions
Authorization: Bearer YOUR_TOKEN
```

---

**Version:** 1.0.0  
**Last Updated:** October 15, 2025  
**Status:** ✅ Complete Testing Guide

