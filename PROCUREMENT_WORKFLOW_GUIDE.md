# PROCUREMENT MODULE
## WORKFLOW-BASED IMPLEMENTATION GUIDE

**Document Version:** 1.0  
**Date:** November 24, 2025  
**Project:** NVCCZ Procurement Management System  
**Status:** Final - Ready for Implementation

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Phase 1: System Configuration](#2-phase-1-system-configuration)
3. [Phase 2: User Setup](#3-phase-2-user-setup)
4. [Phase 3: Operational Workflow](#4-phase-3-operational-workflow)
5. [Phase 4: Monitoring and Optimization](#5-phase-4-monitoring-and-optimization)
6. [Business Benefits](#6-business-benefits)
7. [Success Metrics](#7-success-metrics)

---

## 1. EXECUTIVE SUMMARY

### 1.1 What This System Does

The Procurement Module automates the complete procurement cycle from initial request to vendor payment using a Request for Quote (RFQ) approach. The system ensures competitive pricing, proper approvals, and complete accounting integration.

### 1.2 Key Innovation

**Vendors submit quotes online without needing to log in** - they simply click a link in an email and fill out a form. This removes barriers and gets you better quotes faster.

### 1.3 Implementation Approach

The system implementation follows a **4-phase workflow**:

```
PHASE 1: System Configuration
  ↓
PHASE 2: User Setup
  ↓
PHASE 3: Operational Workflow
  ↓
PHASE 4: Monitoring & Optimization
```

---

## 2. PHASE 1: SYSTEM CONFIGURATION

### Overview

Before anyone can use the system, administrators must configure how approvals work for each department. This is the foundation of the entire system.

---

### STEP 1.1: Define Your Departments

**Who Does This:** System Administrator  
**When:** Before any other setup

**Available Departments:**
The system supports 7 departments:

1. **Finance** - Financial management and accounting
2. **Operations** - Day-to-day business operations
3. **Procurement** - Vendor management and purchasing
4. **Human Resources** - HR and personnel
5. **Marketing** - Marketing and communications
6. **Legal** - Legal and compliance
7. **IT** - Technology and systems

**Action Required:**
- Confirm which departments your organization uses
- Identify which departments need procurement capability

---

### STEP 1.2: Understand the 35 System Roles

**Who Does This:** System Administrator  
**When:** Before configuring approvals

The system has **35 predefined roles** organized by department. These roles are used to route invoice approvals to the right people.

**Finance Department Roles (5):**
- **Finance Manager** (FIN_MGR) - Senior role, final approvals
- **Finance Officer** (FIN_OFF) - Day-to-day finance operations
- **Accountant** (ACCOUNTANT) - Invoice review and verification
- **Finance Assistant** (FIN_ASST) - Support role
- **Finance Member** (FIN_MEM) - Basic member

**Operations Department Roles (5):**
- Operations Manager (OPS_MGR)
- Operations Officer (OPS_OFF)
- Operations Coordinator (OPS_COORD)
- Operations Analyst (OPS_ANALYST)
- Operations Member (OPS_MEM)

**Procurement Department Roles (5):**
- Procurement Manager (PROC_MGR)
- Procurement Officer (PROC_OFF)
- Buyer (BUYER)
- Procurement Coordinator (PROC_COORD)
- Procurement Member (PROC_MEM)

**Other Departments:** HR (5 roles), Marketing (5 roles), Legal (5 roles), IT (5 roles)

**Key Point:** These roles are ONLY for invoice approvals. Requisition approvals use Department Roles (covered next).

---

### STEP 1.3: Understand Department Roles

**Who Does This:** System Administrator  
**When:** Before assigning users

Each user has a **Department Role** that determines if they can approve requisitions:

| Department Role | Can Approve Requisitions? | Can Create Requisitions? |
|----------------|--------------------------|-------------------------|
| **HEAD** | ✅ Yes | ✅ Yes |
| **DEPUTY** | ✅ Yes | ✅ Yes |
| **MEMBER** | ❌ No | ✅ Yes |

**Example:**
- John (Finance HEAD) can approve Finance requisitions
- Jane (Finance DEPUTY) can also approve Finance requisitions
- Bob (Finance MEMBER) can only create requisitions, cannot approve

**Important:** This is DIFFERENT from system roles. System roles are for invoice approval, department roles are for requisition approval.

---

### STEP 1.4: Configure Finance Department Approval Workflow

**Who Does This:** System Administrator  
**When:** Before Finance can use the system  
**Time Required:** 30 minutes

This is the most important configuration. Finance department needs a **2-step invoice approval** process.

**Finance Department Approval Configuration:**

```
REQUISITION APPROVAL (1 Step):
├── Step 1: Finance Manager (FIN_MGR) approves
└── Result: Requisition approved, ready for RFQ

INVOICE APPROVAL (2 Steps):
├── Step 1: Accountant (ACCOUNTANT) reviews
│   ├── Checks invoice details
│   ├── Verifies amounts match quotation
│   └── Approves to move to Step 2
│
├── Step 2: Finance Manager (FIN_MGR) final approval
│   ├── Final review
│   ├── Gives approval
│   └── System creates accounting entry automatically
│
└── Result: Invoice approved, ready for payment
```

**Why This Matters:**
- Accountant catches errors first
- Finance Manager has final say
- Two-person control for financial integrity
- System enforces this automatically

**Configuration Details:**
- **Department:** Finance
- **Requisition Stage:** 1 step (Finance Manager)
- **Invoice Stage:** 2 steps (Accountant → Finance Manager)
- **Order:** Sequential (must go in order)
- **Required:** Both steps must be completed

---

### STEP 1.5: Configure Other Department Workflows (Optional)

**Who Does This:** System Administrator  
**When:** As other departments need the system

**Example: Operations Department (Single-Step Approval)**

```
REQUISITION APPROVAL:
└── Step 1: Operations Manager approves

INVOICE APPROVAL:
└── Step 1: Operations Manager approves
```

**Example: Procurement Department (Three-Step Approval)**

```
REQUISITION APPROVAL:
└── Step 1: Procurement Manager approves

INVOICE APPROVAL:
├── Step 1: Buyer reviews
├── Step 2: Procurement Officer approves
└── Step 3: Procurement Manager final approval
```

**Flexibility:** Each department can have different workflows based on their needs and risk tolerance.

---

### STEP 1.6: Set Up Vendor Database

**Who Does This:** Procurement Team / Administrator  
**When:** Before sending RFQs  
**Time Required:** 1-2 hours

**Required Information for Each Vendor:**
- Company name
- Contact person name
- **Email address** (critical - this is how RFQs are sent)
- Phone number
- Physical address
- Tax ID number
- Payment terms they prefer

**Minimum Requirement:**
- At least **3 vendors per category** for competitive pricing
- Valid email addresses for all vendors
- Up-to-date contact information

**Example Categories:**
- Office supplies vendors (3+)
- IT equipment vendors (3+)
- Facility maintenance vendors (3+)
- Professional services (3+)

---

### STEP 1.7: Configure Email Templates

**Who Does This:** System Administrator  
**When:** Before going live  
**Time Required:** 1 hour

The system sends automatic emails at key stages. Customize these with your branding:

**Templates to Configure:**

1. **RFQ Email to Vendors**
   - Add company logo
   - Include contact information
   - Customize greeting and closing

2. **Quotation Acceptance Email**
   - Congratulations message
   - Next steps instructions
   - Payment terms reminder

3. **Quotation Rejection Email**
   - Professional and respectful
   - Thank you message
   - Encouragement for future participation

4. **Payment Confirmation Email**
   - Payment details
   - Invoice reference
   - Thank you message

---

### STEP 1.8: Set Up Chart of Accounts

**Who Does This:** Finance Team / Accountant  
**When:** Before processing invoices  
**Time Required:** 2 hours

The system needs these accounts to create automatic journal entries:

**Required Accounts:**

| Account Name | Account Code | Type | Purpose |
|--------------|--------------|------|---------|
| Accounts Payable | 2010 | Liability | Money owed to vendors |
| VAT Input | 1220 | Asset | Tax recoverable |
| Bank Account - USD | 1030 | Asset | Cash payments |
| Office Supplies | 5020 | Expense | Supply purchases |
| Rent Expense | 5010 | Expense | Rent payments |
| Software Expense | 5030 | Expense | Software licenses |
| Professional Fees | 5040 | Expense | Consulting, legal, etc. |

**Action:** Ensure all these accounts exist in your accounting system.

---

### PHASE 1 CHECKLIST

Before moving to Phase 2, confirm:

✅ Departments identified and confirmed  
✅ 35 system roles understood  
✅ Department roles (HEAD, DEPUTY, MEMBER) understood  
✅ Finance department approval workflow configured  
✅ Other department workflows configured (if needed)  
✅ Vendor database set up with minimum 3 vendors per category  
✅ Vendor email addresses verified  
✅ Email templates customized  
✅ Chart of accounts configured  

**Once complete:** System is configured and ready for users.

---

## 3. PHASE 2: USER SETUP

### Overview

Now that the system is configured, assign roles to users so they can access and use the system.

---

### STEP 2.1: Identify Key Users

**Who Does This:** Department Heads / HR  
**When:** Before users can access system

**For Finance Department:**

| User | Position | Will They... |
|------|----------|-------------|
| Jane Smith | Finance Manager | Approve requisitions and invoices (Step 2) |
| John Doe | Finance Officer | Create requisitions and RFQs |
| Lisa Anderson | Accountant | Review invoices (Step 1) |
| Bob Wilson | Finance Assistant | Create requisitions only |

**For Each Department:**
- Identify who can approve requisitions (HEAD or DEPUTY)
- Identify who reviews invoices
- Identify who gives final invoice approval
- Identify regular users who create requisitions

---

### STEP 2.2: Assign Department Roles

**Who Does This:** System Administrator  
**When:** Before users start working

**Assign Each User:**
1. **Department** (Finance, Operations, etc.)
2. **Department Role** (HEAD, DEPUTY, or MEMBER)
3. **System Role** (FIN_MGR, ACCOUNTANT, etc.)

**Finance Department Example:**

```
User: Jane Smith
├── Department: Finance
├── Department Role: HEAD
└── System Role: FIN_MGR

Why:
- HEAD role = Can approve Finance requisitions
- FIN_MGR role = Can give final invoice approval (Step 2)
```

```
User: Lisa Anderson
├── Department: Finance
├── Department Role: MEMBER
└── System Role: ACCOUNTANT

Why:
- MEMBER role = Cannot approve requisitions
- ACCOUNTANT role = Can review invoices (Step 1)
```

```
User: Bob Wilson
├── Department: Finance
├── Department Role: MEMBER
└── System Role: FIN_ASST

Why:
- MEMBER role = Cannot approve requisitions
- FIN_ASST role = Cannot approve invoices
- Can only create requisitions
```

---

### STEP 2.3: Train Users

**Who Does This:** Training Coordinator / Administrator  
**When:** Before go-live

**Training Sessions Needed:**

**Session 1: Basic Users (All Staff)**
- Duration: 30 minutes
- How to create requisitions
- How to check requisition status
- How to view history

**Session 2: Department Heads (Approvers)**
- Duration: 45 minutes
- How to review requisitions
- How to approve/reject with comments
- Email notifications
- Mobile access for approvals

**Session 3: Procurement Team**
- Duration: 1 hour
- How to create RFQs from approved requisitions
- How to select vendors
- How to review vendor quotations
- How to compare quotes
- How to accept/reject quotations

**Session 4: Finance Team (Invoice Approvers)**
- Duration: 1 hour
- How invoice approval workflow works
- Accountant review process (Step 1)
- Finance Manager final approval (Step 2)
- How to verify amounts match quotations
- How accounting entries are created automatically

**Session 5: Finance Team (Payment Processing)**
- Duration: 45 minutes
- How to process payments
- Payment methods
- How to enter payment references
- How payment entries are created automatically
- How vendors are notified

---

### PHASE 2 CHECKLIST

Before moving to Phase 3, confirm:

✅ All users identified for each department  
✅ Department roles assigned (HEAD, DEPUTY, MEMBER)  
✅ System roles assigned (FIN_MGR, ACCOUNTANT, etc.)  
✅ User accounts created  
✅ All users trained  
✅ Test logins successful  
✅ Users understand their permissions  

**Once complete:** Users are ready to start using the system.

---

## 4. PHASE 3: OPERATIONAL WORKFLOW

### Overview

This is how the system works day-to-day once configured and users are trained.

---

### WORKFLOW STAGE 1: Purchase Requisition

#### STEP 3.1.1: Employee Creates Requisition

**Who:** Any employee (all department roles)  
**When:** When they need to purchase something  
**Time:** 5-10 minutes

**Process:**
1. Employee logs into system
2. Clicks "Create New Requisition"
3. Fills out form:
   - **Title:** "Office Supplies - January 2025"
   - **Department:** Select their department (Finance, Operations, etc.)
   - **Priority:** HIGH, MEDIUM, LOW, or URGENT
   - **Justification:** Why needed ("Monthly office supplies for team")
   - **Items List:**
     - Item 1: "A4 Paper" - Quantity: 50 reams
     - Item 2: "Printer Toner" - Quantity: 3 cartridges
     - Item 3: "Pens and Pencils" - Quantity: 100 units

4. Reviews the information
5. Saves as DRAFT (can edit later) OR submits for approval

**Important Notes:**
- NO prices needed at this stage
- NO vendor selection needed
- Just describe what you need
- System generates unique number (REQ-202501-0001)

---

#### STEP 3.1.2: Employee Submits for Approval

**Who:** Requisition creator  
**When:** After reviewing draft requisition  
**Time:** 1 minute

**Process:**
1. Open draft requisition
2. Click "Submit for Approval"
3. Confirm submission
4. Status changes to "PENDING_APPROVAL"
5. **Requisition is locked** (cannot be edited)
6. System identifies approver based on department
7. Approver receives email notification

**What Happens Behind the Scenes:**
```
System checks: Who created this?
Answer: Lisa Anderson (Finance Member)

System checks: What department?
Answer: Finance

System checks: Who can approve Finance requisitions?
Answer: Users with Finance HEAD or DEPUTY role

System finds: Jane Smith (Finance HEAD)

System: Sends email to Jane Smith
Email: "New requisition from Lisa Anderson needs your approval"
```

---

#### STEP 3.1.3: Manager Approves Requisition

**Who:** Department HEAD or DEPUTY  
**When:** Within 24 hours of submission  
**Time:** 5 minutes

**Process:**
1. Manager receives email notification
2. Clicks link in email (or logs into system)
3. Reviews requisition:
   - What items are needed?
   - Is justification valid?
   - Is this within budget?
   - Is priority level correct?
4. Options:
   - **APPROVE** with comments: "Approved for purchase"
   - **REJECT** with reason: "Not budgeted for this quarter"
5. Makes decision
6. Status updated
7. Employee receives notification

**If Approved:**
- Status: APPROVED
- Procurement team notified
- Ready for RFQ creation

**If Rejected:**
- Status: REJECTED
- Employee notified with reason
- Employee can create new requisition with adjustments

---

### WORKFLOW STAGE 2: Request for Quote (RFQ)

#### STEP 3.2.1: Create RFQ from Approved Requisition

**Who:** Procurement Team  
**When:** After requisition is approved  
**Time:** 10-15 minutes

**Process:**
1. Procurement opens approved requisition
2. Clicks "Create RFQ"
3. System pre-fills RFQ with requisition items
4. Procurement adds:
   - **RFQ Title:** "RFQ - Office Supplies January 2025"
   - **Description:** "Requesting competitive quotes for monthly office supplies"
   - **Quotation Deadline:** February 15, 2025 (7-14 days from now)
   - **Expected Delivery Date:** March 1, 2025
   - **Delivery Address:** "123 Main Street, Harare"
   - **Special Requirements:** "Must deliver within 5 business days"
5. Reviews item list (auto-populated from requisition)
6. Saves as DRAFT

---

#### STEP 3.2.2: Select Vendors and Send RFQ

**Who:** Procurement Team  
**When:** After RFQ is created  
**Time:** 5 minutes

**Process:**
1. Open RFQ draft
2. Click "Select Vendors"
3. Search vendor database by category
4. Select **minimum 3 vendors** (recommended 3-5)
   - ✅ ABC Office Supplies Ltd
   - ✅ XYZ Stationery Company
   - ✅ Premium Office Supplies Inc
5. Review selections
6. Click "Send RFQ to Selected Vendors"
7. System confirms: "RFQ sent to 3 vendors"
8. Status: RFQ_SENT

**What Happens Automatically:**
```
System sends professional email to each vendor:

Subject: Request for Quote RFQ-202501-0001 - NVCCZ

Dear Vendor,

We are requesting competitive quotes for the following items:

Items:
1. A4 Paper - 50 reams
2. Printer Toner - 3 cartridges
3. Pens and Pencils - 100 units

Deadline: February 15, 2025
Delivery Required By: March 1, 2025

[SUBMIT QUOTATION ONLINE] ← Big Button

This button takes you directly to our quotation form.
No login required - just fill in your prices and submit!

Thank you for your participation.

Best regards,
NVCCZ Procurement Team
```

---

### WORKFLOW STAGE 3: Vendor Quotation Submission

#### STEP 3.3.1: Vendor Receives RFQ Email

**Who:** Vendor (external)  
**When:** Immediately after RFQ is sent  
**Access:** No login needed

**Vendor Experience:**
1. Vendor opens email on computer or phone
2. Sees professional RFQ with clear details
3. Sees big "Submit Quotation Online" button
4. Clicks button
5. Opens quotation form (mobile-friendly)

---

#### STEP 3.3.2: Vendor Submits Quotation

**Who:** Vendor (external)  
**When:** Before deadline (within 7-14 days)  
**Time:** 10-15 minutes  
**Access:** No login required!

**Vendor Process:**
1. Form opens with RFQ details pre-filled
2. Vendor fills in:
   - **Company Name:** "ABC Office Supplies Ltd"
   - **Contact Person:** "John Vendor"
   - **Email:** "john@abcoffice.com"
   - **Phone:** "+263 771234567"
   - **Tax ID:** "12345678"
   - **Payment Terms:** "Net 30"
   - **Delivery Time:** "3 business days"
   - **Quote Valid For:** "30 days"
   
3. Vendor enters prices for each item:
   - A4 Paper (50 reams) × $15.50 = $775
   - Printer Toner (3 cartridges) × $45.00 = $135
   - Pens and Pencils (100 units) × $1.50 = $150
   
4. System calculates automatically:
   - **Subtotal:** $1,060
   - **VAT (if applicable):** $153.70
   - **Total:** $1,213.70

5. Vendor adds notes (optional): "Free delivery for orders over $1,000"
6. Vendor clicks "Submit Quotation"
7. System shows: "Quotation submitted successfully!"
8. Vendor receives confirmation email with quotation number

**What Happens Behind the Scenes:**
```
System generates unique quotation number: QUO-1732467890-123
System saves quotation with status: SUBMITTED
System sends confirmation email to vendor
System notifies procurement team: "New quotation received from ABC Office Supplies"
```

---

#### STEP 3.3.3: Multiple Vendors Submit Quotations

**Process:**
- Vendor A submits: Total $1,213.70
- Vendor B submits: Total $1,150.00 (best price!)
- Vendor C submits: Total $1,285.00
- Each receives confirmation
- Procurement team receives notification for each

**Deadline Passes:**
- System tracks which vendors submitted
- System tracks which vendors didn't respond
- Procurement team can see status of all vendors

---

### WORKFLOW STAGE 4: Quotation Review and Selection

#### STEP 3.4.1: Review All Quotations

**Who:** Procurement Team  
**When:** After deadline (or earlier if all quotes received)  
**Time:** 15-30 minutes

**Process:**
1. Procurement opens RFQ
2. Clicks "View Quotations"
3. System displays comparison table:

```
QUOTATION COMPARISON - RFQ-202501-0001

Vendor            | Total     | Payment Terms | Delivery  | Notes
------------------|-----------|---------------|-----------|------------------
ABC Office ($)    | $1,213.70 | Net 30       | 3 days    | Free delivery
XYZ Stationery    | $1,150.00 | Net 30       | 5 days    | Best price!
Premium Office    | $1,285.00 | Net 15       | 2 days    | Fastest delivery

ITEM BREAKDOWN:

Item               | ABC    | XYZ     | Premium
-------------------|--------|---------|--------
A4 Paper (50)      | $775   | $700 ✓  | $825
Printer Toner (3)  | $135   | $150    | $120 ✓
Pens/Pencils (100) | $150   | $140 ✓  | $165
```

4. Team evaluates based on:
   - **Price** (most important)
   - **Delivery time**
   - **Payment terms**
   - **Vendor reliability** (past performance)
   - **Total value**

5. Team decides: "XYZ Stationery offers best overall value"

---

#### STEP 3.4.2: Accept Winning Quotation

**Who:** Procurement Team  
**When:** After evaluation  
**Time:** 5 minutes

**Process:**
1. Select XYZ Stationery quotation
2. Click "Accept Quotation"
3. Add acceptance notes: "Selected for best price and reliable delivery. Past performance excellent."
4. Confirm acceptance
5. System shows: "Quotation accepted. Invoice created automatically!"

**What Happens Automatically:**

```
STEP 1: Update quotation status
├── XYZ Stationery quotation: ACCEPTED
└── Timestamp: February 16, 2025 10:30 AM

STEP 2: Create invoice automatically
├── Invoice number: INV-202501-0001
├── Vendor: XYZ Stationery Company
├── All items copied from quotation
├── All prices copied from quotation
├── Payment terms: Net 30
├── Total: $1,150.00
├── Status: DRAFT
└── Link to quotation maintained

STEP 3: Send acceptance email to XYZ Stationery
Email:
Subject: Congratulations! Your Quotation Has Been Accepted

Dear XYZ Stationery,

We are pleased to inform you that your quotation QUO-1732467890-456
has been accepted.

Invoice Details:
- Invoice Number: INV-202501-0001
- Amount: $1,150.00
- Payment Terms: Net 30
- Expected Payment: March 18, 2025

Next Steps:
1. We will process invoice approval
2. Payment will be made per agreed terms
3. Please prepare for delivery

Thank you for your competitive quote.

Best regards,
NVCCZ Procurement Team
```

---

#### STEP 3.4.3: Reject Other Quotations

**Who:** Procurement Team  
**When:** After accepting winner  
**Time:** 2 minutes per vendor

**Process:**
1. Select ABC Office Supplies quotation
2. Click "Reject Quotation"
3. Add professional reason: "Thank you for your submission. We selected another vendor that offered a more competitive price. We appreciate your participation and encourage you to respond to future RFQs."
4. Confirm rejection
5. Repeat for Premium Office

**What Happens Automatically:**

```
System sends professional rejection email:

Subject: Thank You for Your Quotation - RFQ-202501-0001

Dear ABC Office Supplies,

Thank you for submitting your quotation for RFQ-202501-0001.

After careful review of all submissions, we have selected another vendor
for this particular requirement.

We appreciate the time and effort you invested in preparing your quote.
Your pricing and terms were competitive, and we encourage you to
participate in future RFQs from NVCCZ.

We value our vendor relationships and look forward to working with you
on future opportunities.

Best regards,
NVCCZ Procurement Team
```

**Result:** Professional rejection maintains good vendor relationships for future RFQs.

---

### WORKFLOW STAGE 5: Invoice Approval

#### STEP 3.5.1: Submit Invoice for Approval

**Who:** Procurement Team  
**When:** After quotation acceptance  
**Time:** 2 minutes

**Process:**
1. System automatically created invoice from quotation
2. Procurement reviews auto-created invoice
3. Verifies all details are correct
4. Clicks "Submit for Approval"
5. Status: PENDING_APPROVAL

**What Happens Behind the Scenes:**

```
System checks: What department created the requisition?
Answer: Finance

System retrieves: Finance Department approval configuration
Configuration found:
├── INVOICE stage has 2 steps:
├── Step 1: ACCOUNTANT (Lisa Anderson)
└── Step 2: FIN_MGR (Jane Smith)

System creates: Invoice approval request
├── Current step: 1 of 2
└── Waiting for: Lisa Anderson (Accountant)

System sends: Email to Lisa Anderson
Email: "Invoice INV-202501-0001 needs your review (Step 1 of 2)"
```

---

#### STEP 3.5.2: Accountant Reviews Invoice (Step 1)

**Who:** Accountant (Lisa Anderson)  
**When:** Within 24 hours  
**Time:** 10 minutes

**Process:**
1. Lisa receives email notification
2. Opens invoice in system
3. Reviews details:
   - **Does invoice match accepted quotation?** ✓ Yes
   - **Are all amounts correct?** ✓ Yes
   - **Is vendor information correct?** ✓ Yes
   - **Is accounting code correct?** ✓ Yes
   - **Are payment terms correct?** ✓ Net 30
4. Verifies subtotal and VAT calculations
5. Adds comments: "Invoice reviewed and verified. Amounts match accepted quotation. Approved for final sign-off."
6. Clicks "Approve"
7. Status: Still PENDING_APPROVAL, but moved to Step 2

**What Happens Automatically:**

```
System updates: Approval step 1 complete
├── Approved by: Lisa Anderson (ACCOUNTANT)
├── Approved at: February 16, 2025 2:15 PM
├── Comments: "Invoice reviewed and verified..."
└── Step 1 of 2: ✓ COMPLETE

System moves to: Step 2 of 2
└── Waiting for: Jane Smith (FIN_MGR)

System sends: Email to Jane Smith
Email: "Invoice INV-202501-0001 ready for final approval (Step 2 of 2)"
Email includes: Lisa's review comments
```

---

#### STEP 3.5.3: Finance Manager Final Approval (Step 2)

**Who:** Finance Manager (Jane Smith)  
**When:** Within 24 hours  
**Time:** 5 minutes

**Process:**
1. Jane receives email notification
2. Opens invoice in system
3. Sees Lisa's review and approval (Step 1)
4. Reviews details:
   - **Accountant reviewed?** ✓ Yes (Lisa approved)
   - **Within budget?** ✓ Yes
   - **Business justification valid?** ✓ Yes
   - **Ready for payment?** ✓ Yes
5. Adds comments: "Final approval granted. Approved for payment."
6. Clicks "Approve"
7. System processes final approval

**What Happens Automatically - THE MAGIC:**

```
STEP A: Update approval status
├── Step 2 of 2: ✓ COMPLETE
├── Approved by: Jane Smith (FIN_MGR)
├── Approved at: February 16, 2025 3:45 PM
└── All approval steps complete!

STEP B: Update invoice status
└── Status: APPROVED (ready for payment)

STEP C: CREATE ACCOUNTING ENTRY AUTOMATICALLY
Journal Entry: JE-202501-0001
Description: "Invoice INV-202501-0001 - XYZ Stationery Company"

Accounting Entry:
Dr. Office Supplies Expense (Account 5020)     $1,000.00
Dr. VAT Input (Account 1220)                   $  150.00
    Cr. Accounts Payable (Account 2010)                    $1,150.00

Balance Check: Debits ($1,150) = Credits ($1,150) ✓ BALANCED

Post Status: POSTED (immediately)
Posted At: February 16, 2025 3:45 PM
Link: Invoice INV-202501-0001

STEP D: Notify procurement team
Email: "Invoice INV-202501-0001 fully approved and ready for payment"

STEP E: Update financial reports
├── Trial Balance updated
├── Income Statement updated (expense recorded)
├── Balance Sheet updated (liability created)
└── All reports show new transaction
```

**Result:** 
- Invoice fully approved
- Accounting entry created and posted automatically
- Liability recorded in books
- Ready for payment

---

### WORKFLOW STAGE 6: Payment Processing

#### STEP 3.6.1: Process Payment

**Who:** Finance Team  
**When:** Per payment terms (Net 30 = 30 days after invoice date)  
**Time:** 5 minutes

**Process:**
1. Finance opens approved invoice
2. Clicks "Process Payment"
3. Enters payment details:
   - **Payment Method:** Bank Transfer
   - **Payment Reference:** "TRF-FIN-202501-001"
   - **Payment Date:** March 18, 2025
   - **Bank Account:** Bank Account - USD (Account 1030)
   - **Amount:** $1,150.00 (must match invoice total)
4. Adds notes: "Payment processed via Standard Bank"
5. Clicks "Submit Payment"
6. System processes payment

**What Happens Automatically - MORE MAGIC:**

```
STEP A: Validate payment
├── Is invoice approved? ✓ Yes
├── Does amount match? ✓ Yes ($1,150.00)
├── Is bank account valid? ✓ Yes
└── Validation: PASSED

STEP B: Update invoice status
├── Status: PAID
├── Paid Amount: $1,150.00
├── Paid At: March 18, 2025 10:15 AM
└── Payment Reference: TRF-FIN-202501-001

STEP C: CREATE PAYMENT ACCOUNTING ENTRY AUTOMATICALLY
Journal Entry: JE-202501-0002
Description: "Payment for Invoice INV-202501-0001"

Accounting Entry:
Dr. Accounts Payable (Account 2010)       $1,150.00
    Cr. Bank Account - USD (Account 1030)             $1,150.00

Balance Check: Debits ($1,150) = Credits ($1,150) ✓ BALANCED

Post Status: POSTED (immediately)
Posted At: March 18, 2025 10:15 AM
Link: Invoice INV-202501-0001

STEP D: Send payment confirmation to vendor
Email to: XYZ Stationery Company

Subject: Payment Confirmation - Invoice INV-202501-0001

Dear XYZ Stationery,

We are pleased to inform you that payment has been processed for:

Invoice Number: INV-202501-0001
Amount Paid: $1,150.00
Payment Date: March 18, 2025
Payment Reference: TRF-FIN-202501-001
Payment Method: Bank Transfer

Please allow 2-3 business days for funds to reflect in your account.

Thank you for your excellent service.

Best regards,
NVCCZ Finance Team

STEP E: Update financial reports
├── Trial Balance updated (liability cleared, cash reduced)
├── Balance Sheet updated
├── Cash Flow Statement updated
└── All reports show payment transaction
```

**Result:**
- Payment recorded
- Accounts Payable cleared (liability = $0)
- Bank balance reduced
- Vendor notified
- Complete audit trail

---

### WORKFLOW STAGE 7: Cycle Complete

#### Final Status Summary

**Requisition:**
- Number: REQ-202501-0001
- Status: APPROVED
- Created by: Lisa Anderson (Finance Member)
- Approved by: Jane Smith (Finance Manager)

**RFQ:**
- Number: RFQ-202501-0001
- Status: COMPLETED
- Sent to: 3 vendors
- Quotations received: 3

**Quotation:**
- Winner: XYZ Stationery Company
- Amount: $1,150.00
- Status: ACCEPTED
- Losers notified professionally

**Invoice:**
- Number: INV-202501-0001
- Status: PAID
- Approved by: Lisa Anderson (Step 1) → Jane Smith (Step 2)
- Amount: $1,150.00

**Payment:**
- Reference: TRF-FIN-202501-001
- Amount: $1,150.00
- Date: March 18, 2025
- Method: Bank Transfer

**Accounting Impact:**

```
Invoice Approval Entry (JE-202501-0001):
Dr. Office Supplies Expense    $1,000.00
Dr. VAT Input                  $  150.00
    Cr. Accounts Payable                   $1,150.00

Payment Entry (JE-202501-0002):
Dr. Accounts Payable          $1,150.00
    Cr. Bank Account - USD                 $1,150.00

Net Result:
├── Expense recorded: $1,000.00
├── VAT Input: $150.00
├── Accounts Payable: $0 (cleared)
├── Cash reduced: $1,150.00
└── Books balanced ✓
```

**Timeline Summary:**
- Day 1: Requisition created and approved
- Day 2: RFQ created and sent to 3 vendors
- Days 3-15: Vendors submitted quotations (14-day deadline)
- Day 16: Quotation selected, invoice created and approved (both steps)
- Day 16: Accounting entry created automatically
- Day 46: Payment processed (Net 30 terms)
- Day 46: Payment entry created automatically, vendor notified

**Total Time:** 46 days from initial request to payment

---

## 5. PHASE 4: MONITORING AND OPTIMIZATION

### Overview

After the system is operational, monitor performance and optimize processes.

---

### STEP 4.1: Monitor Key Metrics

**Who:** Management / Procurement Team  
**Frequency:** Weekly / Monthly

**Metrics to Track:**

**Speed Metrics:**
- Average requisition approval time (Target: < 24 hours)
- Average quotation response rate (Target: > 70%)
- Average invoice approval time (Target: < 48 hours)
- Total cycle time (Target: < 30 days from requisition to payment)

**Cost Metrics:**
- Average number of quotations per RFQ (Target: 3+)
- Cost savings from competitive quotes (vs. previous year)
- Processing cost per transaction

**Quality Metrics:**
- Requisition rejection rate (Target: < 10%)
- Invoice discrepancies (Target: < 5%)
- Vendor satisfaction score
- User satisfaction score

**Compliance Metrics:**
- Approvals completed correctly (Target: 100%)
- Audit trail completeness (Target: 100%)
- Policies followed (Target: 100%)

---

### STEP 4.2: Review and Adjust Approval Workflows

**Who:** System Administrator / Department Heads  
**Frequency:** Quarterly

**Review Questions:**
- Are approval workflows working efficiently?
- Are there bottlenecks in any department?
- Do approval steps need adjustment?
- Should additional approvers be added?
- Should approval thresholds change?

**Example Adjustments:**
- Add amount thresholds (e.g., under $500 = 1 step, over $500 = 2 steps)
- Change approval order
- Add express approval for urgent items
- Adjust payment terms by vendor category

---

### STEP 4.3: Vendor Performance Review

**Who:** Procurement Team  
**Frequency:** Quarterly

**Review:**
- Which vendors respond to RFQs consistently?
- Which vendors offer competitive pricing?
- Which vendors deliver on time?
- Which vendors should be added/removed from database?

**Actions:**
- Recognize top-performing vendors
- Remove non-responsive vendors
- Add new vendors for better competition
- Negotiate better terms with reliable vendors

---

### STEP 4.4: User Feedback and Training

**Who:** Training Coordinator  
**Frequency:** Monthly

**Gather Feedback:**
- What's working well?
- What's frustrating users?
- What features are underutilized?
- What additional training is needed?

**Actions:**
- Conduct refresher training sessions
- Update user guides
- Create video tutorials
- Address common issues

---

## 6. BUSINESS BENEFITS

### 6.1 Time Savings

**Before System:**
- Requisition to approval: 3-5 days (paper-based)
- RFQ creation and sending: 2 days (emails and phone calls)
- Collecting vendor quotes: 14-21 days (waiting for email responses)
- Quote comparison: 1 day (manual spreadsheets)
- Invoice approval: 5-7 days (paper routing)
- Payment processing: Manual entry and tracking

**With System:**
- Requisition to approval: Same day
- RFQ creation and sending: 15 minutes
- Collecting vendor quotes: 7-14 days (automated tracking)
- Quote comparison: Instant (automated table)
- Invoice approval: 1-2 days (automated routing)
- Payment processing: Automated accounting entries

**Total Time Saved:** 50-60% reduction in cycle time

---

### 6.2 Cost Savings

**Competitive Pricing:**
- Multiple vendors compete for each RFQ
- Easy quote comparison shows best prices
- Average savings: 10-15% vs. single-vendor pricing

**Reduced Errors:**
- Automatic invoice creation from quotations (no retyping)
- Automatic accounting entries (no manual journal entries)
- Automatic calculations (no math errors)
- Average error reduction: 80-90%

**Lower Administrative Costs:**
- Less time spent on procurement process
- Fewer people needed for processing
- Less paper and printing
- Reduced administrative overhead: 40-50%

---

### 6.3 Control and Compliance

**Proper Approvals:**
- Cannot bypass approval workflow
- Department-specific approval rules enforced
- Two-person control for finance integrity
- Result: 100% compliance with approval policies

**Complete Audit Trail:**
- Every action recorded with timestamp and user
- Cannot be modified or deleted
- Ready for internal and external audits
- Result: Pass audits without manual documentation

**Financial Controls:**
- Accounts Payable tracked automatically
- Payments linked to approved invoices
- Balanced journal entries every time
- Result: Accurate financial reporting

---

### 6.4 Vendor Relationships

**Professional Communication:**
- Branded, professional emails
- Clear RFQ documentation
- Respectful rejection messages
- Timely payment confirmations
- Result: Better vendor satisfaction and willingness to quote

**Easy Participation:**
- Vendors submit quotes online without login barriers
- Mobile-friendly forms
- Automatic confirmations
- Result: Higher vendor response rates (70%+ vs. 40-50% manual)

---

## 7. SUCCESS METRICS

### 7.1 Implementation Success

System implementation is successful when:

✅ All approval configurations are set up correctly  
✅ All users are trained and assigned roles  
✅ First requisition is created successfully  
✅ First requisition is approved successfully  
✅ First RFQ is sent successfully  
✅ Vendor receives RFQ and can open quotation form  
✅ Vendor submits quotation without issues  
✅ Quotation comparison works correctly  
✅ Invoice is created automatically from accepted quotation  
✅ Invoice approval workflow routes correctly  
✅ Accounting entries are created automatically and balanced  
✅ Payment is processed successfully  
✅ Vendor receives payment confirmation  

---

### 7.2 Operational Success

System operation is successful when:

**Speed:**
✅ Requisition approval: Same day (95% of time)  
✅ RFQ vendor response: 70%+ response rate  
✅ Invoice approval: Within 2 days (90% of time)  
✅ Total cycle time: < 30 days (from requisition to payment)

**Quality:**
✅ Requisition rejection rate: < 10%  
✅ Invoice accuracy: > 95%  
✅ Accounting entries: 100% balanced  
✅ Vendor satisfaction: > 80%

**Compliance:**
✅ Approvals: 100% follow configured workflow  
✅ Audit trail: 100% complete  
✅ Policy compliance: 100%

**Cost:**
✅ Cost savings from competitive quotes: 10-15%  
✅ Administrative cost reduction: 40-50%  
✅ Error reduction: 80-90%

---

### 7.3 Long-Term Success

Long-term success is measured by:

✅ User adoption: 100% of users actively using system  
✅ User satisfaction: > 85% satisfied or very satisfied  
✅ Process improvement: Continuous optimization of workflows  
✅ Vendor participation: Growing vendor database  
✅ Financial accuracy: Improved financial reporting  
✅ Audit readiness: Pass all audits without issues  
✅ Business growth: System scales with organization  

---

## APPENDIX A: QUICK REFERENCE

### Workflow Summary

```
PHASE 1: CONFIGURE SYSTEM
├── Define departments
├── Understand 35 system roles
├── Configure approval workflows (Finance = 2-step invoice approval)
├── Set up vendor database
├── Configure email templates
└── Set up chart of accounts

PHASE 2: SET UP USERS
├── Identify users
├── Assign department roles (HEAD, DEPUTY, MEMBER)
├── Assign system roles (FIN_MGR, ACCOUNTANT, etc.)
└── Train users

PHASE 3: OPERATE SYSTEM
├── Stage 1: Employee creates requisition → Manager approves
├── Stage 2: Procurement creates RFQ → Sends to vendors
├── Stage 3: Vendors submit quotations online (no login)
├── Stage 4: Procurement reviews and selects winner
├── Stage 5: Invoice approved (Step 1: Accountant → Step 2: Finance Manager)
│          → Accounting entry created automatically
├── Stage 6: Finance processes payment
│          → Payment entry created automatically
│          → Vendor notified
└── Stage 7: Cycle complete

PHASE 4: MONITOR & OPTIMIZE
├── Track metrics
├── Review workflows
├── Assess vendor performance
└── Gather user feedback
```

---

## APPENDIX B: Common Questions

**Q: Why do vendors submit quotes without logging in?**  
A: Removes barriers. Vendors are more likely to quote if they don't need to create accounts and remember passwords. Results in better competition and pricing.

**Q: Why does Finance have 2-step invoice approval?**  
A: Two-person control for financial integrity. Accountant catches errors, Finance Manager has final authority. Standard best practice.

**Q: Can we change approval workflows after going live?**  
A: Yes! Workflows can be adjusted quarterly based on your needs. System is flexible.

**Q: What if a vendor doesn't respond to an RFQ?**  
A: System tracks non-responsive vendors. You can send to additional vendors or proceed with quotes received. Non-responsive vendors can be reviewed for removal from database.

**Q: Can requisitions be edited after submission?**  
A: No. Once submitted, requisitions are locked to maintain audit trail. If changes needed, requisition must be rejected and new one created.

**Q: Are accounting entries reversible?**  
A: Yes, through standard accounting reversal procedures. However, system-created entries are designed to be accurate, reducing need for reversals.

**Q: How long does implementation take?**  
A: 
- Phase 1 (Configuration): 1 week
- Phase 2 (User Setup): 1 week  
- Phase 3 (Go-Live): Start immediately
- Phase 4 (Optimization): Ongoing

Total: 2 weeks from start to go-live.

---

**END OF WORKFLOW GUIDE**

**Document Status:** Ready for Implementation  
**Next Step:** Begin Phase 1 (System Configuration)  
**Contact:** System Administrator / Project Manager


