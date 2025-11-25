# PROCUREMENT MODULE - WORKFLOW GUIDE

**Document Version:** 1.0  
**Date:** November 24, 2025

---

## WORKFLOW OVERVIEW

```
Step 1: Configure Approval Workflow
  ↓
Step 2: Create Purchase Requisition
  ↓
Step 3: Approve Requisition
  ↓
Step 4: Create & Send RFQ
  ↓
Step 5: Vendors Submit Quotations (Online - No Login)
  ↓
Step 6: Review & Accept Quotation
  ↓
Step 7: Invoice Created Automatically
  ↓
Step 8: Approve Invoice (2 Steps)
  ↓
Step 9: Process Payment
  ↓
Complete
```

---

## STEP 1: CONFIGURE APPROVAL WORKFLOW

### Finance Department Approval Configuration

**Who Does This:** System Administrator  
**When:** Before anyone can use the system (one-time setup)  
**Time Required:** 30 minutes

**What You're Configuring:**

The system needs to know who approves what in each department. You're setting up two types of approvals:

1. **Requisition Approval** - Who approves purchase requests
2. **Invoice Approval** - Who approves invoices for payment

**Finance Department Configuration:**

```
Department: Finance

REQUISITION STAGE (1 step):
└── Step 1: Finance Manager (FIN_MGR) approves requisitions

INVOICE STAGE (2 steps - sequential):
├── Step 1: Accountant (ACCOUNTANT) reviews invoice first
└── Step 2: Finance Manager (FIN_MGR) gives final approval
```

**What This Means:**
- When a Finance employee creates a requisition, it goes to the Finance Manager for approval
- When an invoice is ready, it goes to the Accountant first for review
- After Accountant approves, it automatically goes to Finance Manager
- Finance Manager must approve before payment can happen
- Both steps must complete in order (sequential)

**Configuration Fields:**
- **Name:** "Finance Department Procurement Approval"
- **Department:** Finance
- **Status:** Active
- **Requisition Steps:** 1 (Finance Manager only)
- **Invoice Steps:** 2 (Accountant → Finance Manager)
- **Order:** Sequential (one after the other)

---

## STEP 2: CREATE PURCHASE REQUISITION

**Who:** Any employee (Lisa Anderson - Accountant, Finance Member)  
**When:** When you need to purchase something  
**Time Required:** 5-10 minutes

**Process:**

**2.1 - Start Requisition**
1. Log into procurement system
2. Navigate to "Purchase Requisitions"
3. Click "Create New Requisition" button
4. New form opens

**2.2 - Fill in Requisition Details**

**Title** (Required)
- Enter clear description: "Office Supplies - January 2025"
- Keep it short and descriptive

**Department** (Required)
- Select from dropdown: Finance
- System uses this to route approval

**Priority Level** (Required)
- Select: HIGH, MEDIUM, LOW, or URGENT
- HIGH = needed within 2 weeks
- MEDIUM = needed within 1 month
- LOW = needed when convenient
- URGENT = needed immediately

**Justification** (Required)
- Explain why needed: "Monthly office supplies for Finance team"
- Be specific enough for manager to understand

**2.3 - Add Items**

For each item you need, enter:

**Item 1:**
- Item Name: "A4 Paper"
- Description: "White, 80gsm"
- Quantity: 50
- Unit: reams

**Item 2:**
- Item Name: "Printer Toner Cartridges"
- Description: "HP LaserJet compatible"
- Quantity: 3
- Unit: cartridges

**Item 3:**
- Item Name: "Office Pens and Pencils"
- Description: "Black pens, HB pencils"
- Quantity: 100
- Unit: pieces

**Important:** 
- Do NOT enter prices
- Do NOT select vendors
- Just describe what you need

**2.4 - Save or Submit**

You have two options:

**Option A: Save as Draft**
- Click "Save as Draft"
- You can edit later
- Status: DRAFT
- Nobody is notified yet

**Option B: Submit for Approval**
- Click "Submit for Approval"
- Cannot edit after this
- Status: PENDING_APPROVAL
- Manager is notified immediately

**2.5 - System Actions**

When you submit:
- System generates unique number: **REQ-202501-0001**
- System checks your department: Finance
- System finds who can approve: Finance Manager (Jane Smith)
- System sends email to Jane Smith
- You receive confirmation: "Requisition submitted successfully"

---

## STEP 3: APPROVE REQUISITION

**Who:** Finance Manager (Jane Smith - has HEAD role)  
**When:** Within 24 hours of submission  
**Time Required:** 5 minutes

**Process:**

**3.1 - Receive Notification**

Email received:
```
Subject: New Requisition Requires Your Approval - REQ-202501-0001

Hi Jane,

Lisa Anderson has submitted a requisition that needs your approval.

Requisition: REQ-202501-0001
Title: Office Supplies - January 2025
Department: Finance
Priority: HIGH
Total Items: 3

[View & Approve Requisition] ← Button in email
```

**3.2 - Open and Review**

Click button in email or log into system:
1. Navigate to "Pending Approvals"
2. Click on requisition REQ-202501-0001
3. Review details:

**Check:**
- What items are being requested?
- Is the justification valid?
- Is this within our budget?
- Is the priority level correct?
- Does this align with department needs?

**View:**
- Requester: Lisa Anderson (Accountant)
- Created: January 15, 2025 10:30 AM
- Items:
  - 50 reams A4 Paper
  - 3 printer toner cartridges
  - 100 pens and pencils
- Justification: "Monthly office supplies for Finance team"

**3.3 - Make Decision**

**Option A: Approve**
1. Click "Approve" button
2. Add comments (optional but recommended): "Approved for purchase. These are our regular monthly supplies."
3. Click "Confirm Approval"
4. Status changes to: APPROVED

**Option B: Reject**
1. Click "Reject" button
2. Add reason (required): "This is not budgeted for this quarter. Please submit again in Q2."
3. Click "Confirm Rejection"
4. Status changes to: REJECTED

**3.4 - System Actions After Approval**

When you approve:
- Status updates to **APPROVED**
- Timestamp recorded: January 15, 2025 2:45 PM
- Your name recorded as approver
- Email sent to Lisa Anderson: "Your requisition has been approved"
- Email sent to Procurement team: "Approved requisition ready for RFQ"
- Requisition now available for RFQ creation

**What the Requester Sees:**

Lisa receives email:
```
Subject: Requisition Approved - REQ-202501-0001

Hi Lisa,

Your requisition has been approved by Jane Smith.

Requisition: REQ-202501-0001
Approved: January 15, 2025 2:45 PM
Approver Comments: "Approved for purchase. These are our regular monthly supplies."

Next Steps: Procurement team will create RFQ and send to vendors.

[View Requisition]
```

---

## STEP 4: CREATE & SEND RFQ

**Who:** Procurement Officer (John Doe - Finance Officer)  
**When:** After requisition is approved  
**Time Required:** 10-15 minutes

**Process:**

**4.1 - Open Approved Requisition**
1. Log into procurement system
2. Navigate to "Approved Requisitions"
3. Find requisition REQ-202501-0001
4. Click "Create RFQ from Requisition"
5. System pre-fills form with requisition items

**4.2 - Enter RFQ Details**

**RFQ Title** (Auto-filled, can edit)
- Default: "RFQ - Office Supplies January 2025"
- Edit if needed to be more specific

**Description** (Required)
- Enter: "We are requesting competitive quotes for monthly office supplies. Please provide your best pricing."

**Quotation Deadline** (Required)
- Select date: February 15, 2025
- Give vendors 7-14 days to respond
- Longer deadline = more responses

**Expected Delivery Date** (Required)
- Select date: March 1, 2025
- When you need items delivered

**Delivery Address** (Required)
- Enter: "NVCCZ Office, 123 Main Street, Harare, Zimbabwe"

**Special Requirements** (Optional)
- Enter: "Must deliver within 5 business days. Payment terms Net 30. Prices must be in USD."

**4.3 - Review Items List**

System automatically includes items from requisition:

✓ Item 1: A4 Paper - 50 reams - White, 80gsm  
✓ Item 2: Printer Toner Cartridges - 3 units - HP LaserJet compatible  
✓ Item 3: Office Pens and Pencils - 100 pieces - Black pens, HB pencils  

If items look correct, proceed. If not, edit as needed.

**4.4 - Select Vendors**

1. Click "Select Vendors"
2. Search vendor database
3. Filter by category: "Office Supplies"
4. Select minimum 3 vendors (recommended 3-5 for good competition):

Selected vendors:
- ☑ ABC Office Supplies Ltd (abc@officesupplies.com)
- ☑ XYZ Stationery Company (sales@xyzstationery.com)
- ☑ Premium Office Supplies (info@premiumoffice.com)

System shows:
- Vendor name
- Contact email
- Past response rate
- Last RFQ date

**4.5 - Review and Send**

1. Review all information one more time
2. Click "Send RFQ to Selected Vendors"
3. Confirmation popup: "Send RFQ to 3 vendors?"
4. Click "Confirm"
5. System processes

**4.6 - System Actions**

What happens automatically:

**RFQ Created:**
- RFQ Number: **RFQ-202501-0001**
- Status: SENT
- Created: January 16, 2025 9:00 AM
- Vendors: 3 selected

**Emails Sent to Each Vendor:**

```
To: abc@officesupplies.com
Subject: Request for Quote RFQ-202501-0001 - NVCCZ

Dear ABC Office Supplies Ltd,

We are requesting competitive quotes for the following items:

RFQ Number: RFQ-202501-0001
Date: January 16, 2025
Deadline: February 15, 2025 (30 days)

Items Requested:
1. A4 Paper (White, 80gsm) - Quantity: 50 reams
2. Printer Toner Cartridges (HP LaserJet) - Quantity: 3 units
3. Office Pens and Pencils (Black/HB) - Quantity: 100 pieces

Delivery Required By: March 1, 2025
Delivery Address: NVCCZ Office, 123 Main Street, Harare

Special Requirements: Must deliver within 5 business days. Payment terms Net 30.

═══════════════════════════════════════
SUBMIT YOUR QUOTATION ONLINE
═══════════════════════════════════════

[SUBMIT QUOTATION ONLINE] ← Big Green Button

Click the button above to submit your quote online.
No login or registration required!
Takes only 10 minutes.

Link: https://nvccz.com/vendor/quotation/submit?rfq=RFQ-202501-0001&token=xyz123

Thank you for your participation.

Best regards,
NVCCZ Procurement Team
procurement@nvccz.com
```

**Confirmation to You:**
- Email sent to 3 vendors ✓
- You receive confirmation email
- RFQ status: SENT
- You can track vendor responses in system

---

## STEP 5: VENDORS SUBMIT QUOTATIONS

**Who:** Vendors (external - no system access needed)  
**Access:** No login required - public form  
**Time Required:** 10-15 minutes per vendor

**Process:**

**5.1 - Vendor Receives RFQ Email**

Vendor opens email (on computer or mobile phone):
- Sees professional RFQ with all details
- Sees big green "SUBMIT QUOTATION ONLINE" button
- Sees alternative: can reply by email if preferred

**5.2 - Vendor Clicks Button**

When vendor clicks button:
- Opens quotation form in browser
- Works on desktop, tablet, or phone
- **No login required**
- **No account creation needed**
- **No password needed**

**5.3 - Quotation Form Opens**

Form is pre-filled with RFQ details:

**Pre-filled Information (Read-Only):**
- RFQ Number: RFQ-202501-0001
- Deadline: February 15, 2025
- Items list with quantities
- Delivery date required

**5.4 - Vendor Fills In Details**

**Company Information:**
- Company Name: "ABC Office Supplies Ltd"
- Contact Person: "John Vendor"
- Email: "john@abcoffice.com"
- Phone: "+263 771 234 567"
- Tax ID: "12345678"

**Pricing for Each Item:**

**Item 1: A4 Paper**
- Quantity shown: 50 reams
- Unit Price: $15.50 ← Vendor enters this
- Currency: USD ← Vendor selects
- Line Total: $775.00 ← Calculated automatically

**Item 2: Printer Toner Cartridges**
- Quantity shown: 3 units
- Unit Price: $45.00 ← Vendor enters
- Currency: USD
- Line Total: $135.00 ← Calculated automatically

**Item 3: Office Pens and Pencils**
- Quantity shown: 100 pieces
- Unit Price: $1.50 ← Vendor enters
- Currency: USD
- Line Total: $150.00 ← Calculated automatically

**Terms and Conditions:**
- Payment Terms: "Net 30" ← Vendor enters
- Delivery Time: "3 business days" ← Vendor enters
- Quote Valid For: "30 days" ← Vendor enters
- Notes (Optional): "Free delivery for orders over $1,000. We offer 24/7 support."

**5.5 - System Calculates Total**

As vendor enters prices, system calculates automatically:

```
QUOTATION SUMMARY

Subtotal:                      $1,060.00
VAT (14.5%):                   $  153.70
───────────────────────────────────────
Total Amount:                  $1,213.70
```

**5.6 - Vendor Submits**

1. Vendor reviews all information
2. Checks "I confirm the above information is accurate"
3. Clicks "Submit Quotation"
4. System validates all required fields
5. If valid, submission accepted

**5.7 - Confirmation to Vendor**

Vendor immediately sees:
```
✓ Quotation Submitted Successfully!

Your quotation has been submitted to NVCCZ.

Quotation Number: QUO-1732567890-123
Submitted: January 20, 2025 3:45 PM
Total Amount: $1,213.70

You will receive a confirmation email shortly.
We will notify you of the outcome after the deadline.

Thank you for your submission!
```

And receives confirmation email:
```
Subject: Quotation Submitted Successfully - QUO-1732567890-123

Dear ABC Office Supplies Ltd,

Thank you for submitting your quotation for RFQ-202501-0001.

Quotation Details:
- Quotation Number: QUO-1732567890-123
- RFQ Number: RFQ-202501-0001
- Total Amount: $1,213.70
- Submitted: January 20, 2025 3:45 PM

Your quote is now with NVCCZ procurement team for evaluation.
We will notify you of the outcome after the February 15, 2025 deadline.

Thank you for your participation.

Best regards,
NVCCZ Procurement Team
```

**5.8 - Notification to Procurement**

Procurement team (John) receives email:
```
Subject: New Quotation Received - RFQ-202501-0001

A new quotation has been submitted:

Vendor: ABC Office Supplies Ltd
RFQ: RFQ-202501-0001
Amount: $1,213.70
Submitted: January 20, 2025 3:45 PM

Total quotations received: 1 of 3 vendors

[View Quotation]
```

**5.9 - Multiple Vendors Submit**

**Timeline:**
- January 20: Vendor A (ABC Office Supplies) submits → $1,213.70
- January 22: Vendor B (XYZ Stationery) submits → $1,150.00 (lowest!)
- January 25: Vendor C (Premium Office) submits → $1,285.00

**After Deadline (February 15):**
- 3 out of 3 vendors responded (100% response rate)
- All quotations ready for comparison
- Procurement can now review and select winner

---

## STEP 6: REVIEW & ACCEPT QUOTATION

**Who:** Procurement Officer (John Doe)  
**When:** After deadline or when all quotations received  
**Time Required:** 15-30 minutes

**Process:**

**6.1 - Open RFQ**
1. Log into system
2. Navigate to "RFQs"
3. Find RFQ-202501-0001
4. Status shows: "3 quotations received"
5. Click "View Quotations"

**6.2 - View Comparison Table**

System automatically displays side-by-side comparison:

```
═══════════════════════════════════════════════════════════════
QUOTATION COMPARISON - RFQ-202501-0001
Office Supplies - January 2025
═══════════════════════════════════════════════════════════════

Vendor            | Total      | Payment  | Delivery | Notes
------------------|------------|----------|----------|------------------
ABC Office        | $1,213.70  | Net 30   | 3 days   | Free delivery
XYZ Stationery    | $1,150.00✓ | Net 30   | 5 days   | Lowest price
Premium Office    | $1,285.00  | Net 15   | 2 days   | Fastest delivery

───────────────────────────────────────────────────────────────
ITEM-BY-ITEM BREAKDOWN
───────────────────────────────────────────────────────────────

Item                      | ABC      | XYZ      | Premium
--------------------------|----------|----------|----------
A4 Paper (50 reams)       | $775.00  | $700.00✓ | $825.00
Printer Toner (3 units)   | $135.00  | $150.00  | $120.00✓
Pens/Pencils (100 pcs)    | $150.00  | $140.00✓ | $165.00
--------------------------|----------|----------|----------
Subtotal                  | $1,060   | $1,000✓  | $1,110
VAT (14.5%)              | $154     | $150✓    | $161
TOTAL                     | $1,214   | $1,150✓  | $1,271

✓ = Lowest price
```

**6.3 - Evaluate Quotations**

Consider multiple factors:

**Price Analysis:**
- XYZ Stationery: $1,150.00 (lowest)
- Savings vs highest: $135.00 (10.5% cheaper)

**Delivery Time:**
- ABC: 3 days
- XYZ: 5 days
- Premium: 2 days (fastest but most expensive)

**Payment Terms:**
- ABC: Net 30 (pay in 30 days)
- XYZ: Net 30
- Premium: Net 15 (pay in 15 days - tighter cash flow)

**Vendor History** (check system):
- XYZ Stationery: 95% on-time delivery rate
- Past performance: Excellent
- Last order: Delivered early

**Decision:** XYZ Stationery offers best overall value
- Lowest price
- Acceptable delivery time (5 days)
- Good payment terms (Net 30)
- Excellent track record

**6.4 - Accept Winning Quotation**

1. Select XYZ Stationery quotation
2. Click "Accept Quotation" button
3. Popup opens: "Accept this quotation?"

**Enter Acceptance Details:**
- **Selection Reason** (Required): "Selected for best overall value. Lowest price at $1,150 with good delivery terms. Vendor has excellent performance history."
- **Acceptance Notes** (Optional): "Please confirm delivery within 5 business days as quoted."

4. Click "Confirm Acceptance"
5. System processes

**6.5 - System Actions (Automatic)**

**Action 1: Update Quotation Status**
```
Quotation: QUO-1732567890-456 (XYZ Stationery)
Status: ACCEPTED ✓
Accepted By: John Doe (Procurement Officer)
Accepted At: February 16, 2025 10:30 AM
Reason: "Selected for best overall value..."
```

**Action 2: Create Invoice Automatically**
```
Invoice Created: INV-202501-0001
Vendor: XYZ Stationery Company
Department: Finance
Status: DRAFT
Total Amount: $1,150.00

All items copied from quotation:
✓ A4 Paper - 50 reams @ $14.00 = $700.00
✓ Printer Toner - 3 units @ $50.00 = $150.00
✓ Pens/Pencils - 100 pcs @ $1.40 = $140.00
✓ Subtotal: $1,000.00
✓ VAT: $150.00
✓ Total: $1,150.00

Payment Terms: Net 30
Link: Quotation QUO-1732567890-456
```

**Action 3: Send Acceptance Email to Winner**
```
To: sales@xyzstationery.com
Subject: Congratulations! Your Quotation Has Been Accepted

Dear XYZ Stationery Company,

We are pleased to inform you that your quotation has been accepted.

Quotation Details:
- Quotation Number: QUO-1732567890-456
- RFQ Number: RFQ-202501-0001
- Amount: $1,150.00
- Accepted: February 16, 2025

Invoice Details:
- Invoice Number: INV-202501-0001
- Payment Terms: Net 30 days
- Expected Payment Date: March 18, 2025

Next Steps:
1. We will process the invoice for approval
2. Payment will be made per Net 30 terms
3. Please prepare items for delivery

Delivery Instructions:
- Deliver to: NVCCZ Office, 123 Main Street, Harare
- Delivery Deadline: March 1, 2025
- Contact: John Doe, procurement@nvccz.com

Thank you for your competitive quotation. We look forward to receiving your delivery.

Best regards,
NVCCZ Procurement Team
```

**6.6 - Reject Other Quotations**

For each non-winning quotation:

**Vendor A (ABC Office Supplies):**
1. Select quotation
2. Click "Reject Quotation"
3. Enter reason: "Thank you for your submission. After careful evaluation, we selected another vendor that offered more competitive pricing. We appreciate your participation and encourage you to respond to future RFQs."
4. Click "Confirm Rejection"

**Vendor C (Premium Office):**
- Same process
- Status: REJECTED

**Action: Send Professional Rejection Emails**
```
To: abc@officesupplies.com
Subject: Thank You for Your Quotation - RFQ-202501-0001

Dear ABC Office Supplies Ltd,

Thank you for submitting your quotation for RFQ-202501-0001.

Quotation Number: QUO-1732567890-123
Amount: $1,213.70
Submitted: January 20, 2025

After careful review and comparison of all submissions, we have selected 
another vendor for this particular requirement.

Your pricing and terms were competitive, and we appreciate the time and 
effort you invested in preparing your quote.

We value our relationship with you and encourage you to participate in 
future RFQs from NVCCZ. Your company remains an important part of our 
vendor network.

Thank you for your understanding.

Best regards,
NVCCZ Procurement Team
```

**6.7 - Summary of Results**

**Accepted:**
- XYZ Stationery Company
- Amount: $1,150.00
- Status: Invoice created (INV-202501-0001)
- Vendor notified: ✓

**Rejected:**
- ABC Office Supplies ($1,213.70) - Vendor notified: ✓
- Premium Office Supplies ($1,285.00) - Vendor notified: ✓

**Next Step:**
- Invoice INV-202501-0001 ready for approval process
- Moves to Step 7 (Invoice Approval)

---

## STEP 7: INVOICE CREATED AUTOMATICALLY

**System Action:**

Invoice auto-created from accepted quotation:
- Invoice Number: INV-202501-0001
- Vendor: Vendor B
- Amount: $1,150.00
- Status: DRAFT
- All items and prices copied from quotation

---

## STEP 8: APPROVE INVOICE (2-STEP PROCESS)

### Step 8.1: Submit Invoice for Approval

**Who:** Procurement team

**Process:**
1. Review auto-created invoice
2. Click "Submit for Approval"
3. System routes to Step 1 (Accountant)

---

### Step 8.2: Accountant Review (Step 1)

**Who:** Accountant

**Process:**
1. Receive email notification
2. Review invoice
3. Verify amounts match quotation
4. Click "Approve"
5. Add comments: "Verified and approved"
6. System moves to Step 2

---

### Step 8.3: Finance Manager Approval (Step 2)

**Who:** Finance Manager

**Process:**
1. Receive email notification
2. Review invoice and accountant's approval
3. Click "Approve"
4. Add comments: "Final approval granted"

**System automatically:**
- Updates status to APPROVED
- Creates accounting entry:
  ```
  Dr. Office Supplies Expense    $1,000.00
  Dr. VAT Input                  $  150.00
      Cr. Accounts Payable                   $1,150.00
  ```
- Posts entry immediately
- Notifies procurement team

---

## STEP 9: PROCESS PAYMENT

**Who:** Finance team

**Process:**
1. Open approved invoice
2. Click "Process Payment"
3. Enter details:
   - Payment method: Bank Transfer
   - Payment reference: TRF-FIN-202501-001
   - Payment date: March 18, 2025
   - Amount: $1,150.00
4. Click "Submit Payment"

**System automatically:**
- Updates status to PAID
- Creates payment entry:
  ```
  Dr. Accounts Payable          $1,150.00
      Cr. Bank Account - USD                 $1,150.00
  ```
- Posts entry immediately
- Sends payment confirmation email to vendor
- Clears accounts payable

---

## COMPLETE

**Final Status:**
- Requisition: APPROVED
- RFQ: COMPLETED
- Quotation: ACCEPTED (Vendor B)
- Invoice: PAID
- Accounting: All entries balanced and posted
- Vendor: Paid and notified

**Timeline:**
- Day 1: Requisition created and approved
- Day 2: RFQ sent to vendors
- Days 3-15: Vendors submit quotations
- Day 16: Quotation accepted, invoice created and approved (both steps)
- Day 16: Accounting entry created
- Day 46: Payment processed (per Net 30 terms)

**Total: 46 days from requisition to payment**

---
1
## USER ROLES

| User | Department Role | System Role | Can Approve Requisitions | Can Approve Invoices |
|------|----------------|-------------|-------------------------|---------------------|
| Jane Smith | HEAD | FIN_MGR | ✅ Yes | ✅ Yes (Step 2) |
| Lisa Anderson | MEMBER | ACCOUNTANT | ❌ No | ✅ Yes (Step 1) |
| Bob Wilson | MEMBER | FIN_ASST | ❌ No | ❌ No |

**Key Points:**
- Department role (HEAD/DEPUTY/MEMBER) controls requisition approval
- System role (FIN_MGR, ACCOUNTANT, etc.) controls invoice approval based on configuration
- Members can create requisitions but not approve them

---

**END OF DOCUMENT**


