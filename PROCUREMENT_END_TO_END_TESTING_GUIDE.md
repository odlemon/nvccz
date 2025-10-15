# 🚀 PROCUREMENT MODULE - END-TO-END TESTING GUIDE (RFQ-BASED)

## 📋 **TABLE OF CONTENTS**
1. [Overview](#overview)
2. [Complete RFQ-Based Procurement Flow](#complete-rfq-based-procurement-flow)
3. [Prerequisites](#prerequisites)
4. [Step-by-Step Testing Guide](#step-by-step-testing-guide)
5. [Accounting Impact Summary](#accounting-impact-summary)
6. [Troubleshooting](#troubleshooting)

---

## 🎯 **OVERVIEW**

This guide walks you through the complete **RFQ (Request for Quote) based procurement cycle**, from creating a requisition to paying a vendor. This is the **correct implementation** where:

✅ **Requisitions** only list items needed (no prices, no vendors)  
✅ **RFQs** are sent to multiple vendors to get competitive quotes  
✅ **Vendors respond via email** with their quotes (outside the system)  
✅ **Invoices are created manually** for the winning vendor  
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

3. 📧 CREATE & SEND RFQ
   ├── Select MULTIPLE vendors (by vendor IDs)
   ├── System fetches vendor details (name, email)
   ├── RFQ sent to ALL selected vendors via email
   └── Status: RFQ_SENT

4. 💌 VENDORS RESPOND (OUTSIDE SYSTEM)
   ├── Vendors receive RFQ via email
   ├── Vendors reply with their quotes (via email)
   └── Procurement team reviews quotes manually

5. 🏆 SELECT WINNING VENDOR
   ├── Review all vendor quotes
   ├── Choose best quote
   └── Proceed to create invoice

6. 📄 CREATE INVOICE (MANUAL)
   ├── Create invoice for winning vendor
   ├── Enter prices from their quote
   ├── Include all line items with prices
   └── Status: DRAFT

7. ✅ APPROVE INVOICE
   ├── Review invoice details
   ├── Approve invoice
   ├── 💰 ACCOUNTING ENTRY CREATED:
   │   Dr. Expense Account (Rent/Supplies/etc.)
   │   Dr. VAT Input (if applicable)
   │   Cr. Accounts Payable
   └── Status: APPROVED

8. 💳 PROCESS PAYMENT
   ├── Select payment method (Bank/Cash)
   ├── Enter payment reference
   ├── 💰 ACCOUNTING ENTRY CREATED:
   │   Dr. Accounts Payable
   │   Cr. Cash/Bank Account
   └── Status: PAID

9. ✅ CYCLE COMPLETE
   └── Vendor paid, books balanced
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

## 🧪 **STEP-BY-STEP TESTING GUIDE**

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
POST http://localhost:3000/api/procurement/requisitions/REQ_ID_HERE/submit
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
POST http://localhost:3000/api/procurement/requisitions/REQ_ID_HERE/approve
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

### **STEP 4: Create and Send RFQ to Multiple Vendors** ⭐ **NEW!**

**This is the key step - send RFQ to multiple vendors!**

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
  - Instructions on how to submit their quote
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

How to Submit Your Quote:
Please reply to this email with:
1. Unit Price for each item
2. Total Price including all costs
3. VAT/Tax amount
4. Delivery Timeline
5. Payment Terms
6. Warranty period (if applicable)
7. Quote validity period

[Full formatted email with instructions...]
```

---

### **STEP 5: Vendors Respond via Email (Outside System)**

**This happens OUTSIDE your system!**

Vendors will reply to the RFQ email with their quotes. Example:

**Vendor A Reply:**
```
From: quotes@abcproperty.com
To: procurement@nvccz.com
Subject: RE: Request for Quote RFQ-202501-0001

Dear NVCCZ Procurement Team,

Thank you for your RFQ. Please find our quote below:

Item 1: Office Rent - Main Building
Unit Price: $5,000 per month
Total: $5,000

Item 2: Office Supplies Bundle
Unit Price: $45 per unit
Total: $2,250 (50 units × $45)

Subtotal: $7,250
VAT (14.5%): $1,051.25
Total: $8,301.25

Delivery: Immediate
Payment Terms: NET 30
Quote Valid Until: January 10, 2025

Best regards,
ABC Property Management
```

**Vendor B Reply:**
```
From: sales@xyzsupplies.com
Subject: RE: Request for Quote RFQ-202501-0001

Our Quote:

Item 1: Office Rent - $4,800/month
Item 2: Office Supplies - $40/unit

Total: $4,800 + $2,000 = $6,800
VAT: $986
Grand Total: $7,786

Payment: NET 30
Delivery: 3 days

XYZ Office Supplies
```

**📊 You Review and Select Winner:**
- Vendor A: $8,301.25
- Vendor B: $7,786.00 ⭐ **WINNER!**
- Vendor C: (didn't respond)

---

### **STEP 6: Create Invoice for Winning Vendor (Manual)**

**Now you manually create an invoice with the winning vendor's prices:**

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

### **STEP 7: Approve Invoice** 💰 **ACCOUNTING ENTRY**

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

### **STEP 8: Process Payment** 💰 **ACCOUNTING ENTRY**

```bash
POST http://localhost:3000/api/procurement/invoices/INVOICE_ID/pay
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
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
  - Dr. Accounts Payable $7,786
  - Cr. Bank Account - USD $7,786
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
