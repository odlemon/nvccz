# SOFTWARE REQUIREMENTS DOCUMENT (SRD)
## PROCUREMENT MODULE - RFQ-BASED WORKFLOW SYSTEM

**Document Version:** 1.0  
**Date:** November 24, 2025  
**Project:** NVCCZ Procurement Management System  
**Status:** Final

---

## TABLE OF CONTENTS

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Functional Requirements](#3-functional-requirements)
4. [Workflow Specifications](#4-workflow-specifications)
5. [User Roles and Permissions](#5-user-roles-and-permissions)
6. [API Specifications](#6-api-specifications)
7. [Data Models](#7-data-models)
8. [Business Rules](#8-business-rules)
9. [Integration Requirements](#9-integration-requirements)
10. [Security Requirements](#10-security-requirements)
11. [Non-Functional Requirements](#11-non-functional-requirements)
12. [Acceptance Criteria](#12-acceptance-criteria)

---

## 1. INTRODUCTION

### 1.1 Purpose

This Software Requirements Document (SRD) defines the complete functional and technical requirements for the NVCCZ Procurement Module with RFQ-based workflow system. The document serves as the primary reference for development, testing, and validation of the procurement management system.

### 1.2 Scope

The Procurement Module implements a comprehensive Procure-to-Pay (P2P) workflow that includes:

- Purchase Requisition Management
- RFQ (Request for Quote) Processing
- Vendor Quotation Management (Online Submission)
- Invoice Management with Approval Workflow
- Payment Processing
- Accounting Integration
- Email Notifications
- Department-Specific Approval Configurations
- Audit Trail and Reporting

### 1.3 Definitions and Acronyms

| Term | Definition |
|------|------------|
| **RFQ** | Request for Quote - A document sent to vendors requesting pricing |
| **P2P** | Procure-to-Pay - Complete procurement lifecycle |
| **GRN** | Goods Received Note - Document confirming receipt of goods |
| **PO** | Purchase Order - Formal document to purchase goods/services |
| **PR** | Purchase Requisition - Internal request to purchase |
| **OCR** | Optical Character Recognition - Technology to extract data from documents |
| **API** | Application Programming Interface |
| **SRD** | Software Requirements Document |

### 1.4 Document Conventions

- **FR-XXX**: Functional Requirement identifier
- **NFR-XXX**: Non-Functional Requirement identifier
- **BR-XXX**: Business Rule identifier
- **API-XXX**: API Endpoint identifier

---

## 2. SYSTEM OVERVIEW

### 2.1 System Architecture

The Procurement Module is built as a web-based application with the following architecture:

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER                      │
│  (React/Next.js - User Interface & Client Logic)        │
└─────────────────────────────────────────────────────────┘
                          ↓↑
┌─────────────────────────────────────────────────────────┐
│                      API LAYER                          │
│  (RESTful APIs - Business Logic & Validation)           │
└─────────────────────────────────────────────────────────┘
                          ↓↑
┌─────────────────────────────────────────────────────────┐
│                   SERVICE LAYER                         │
│  (Business Logic, Workflow Engine, Approval System)     │
└─────────────────────────────────────────────────────────┘
                          ↓↑
┌─────────────────────────────────────────────────────────┐
│                   DATABASE LAYER                        │
│  (PostgreSQL with Prisma ORM)                           │
└─────────────────────────────────────────────────────────┘
                          ↓↑
┌─────────────────────────────────────────────────────────┐
│                EXTERNAL INTEGRATIONS                    │
│  (Email Service, Accounting Module, Document Storage)   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Key Components

1. **Requisition Management System**
   - Create and manage purchase requisitions
   - Submit for approval
   - Track requisition status

2. **RFQ Management System**
   - Create RFQs from approved requisitions
   - Send RFQs to multiple vendors via email
   - Track RFQ status and responses

3. **Vendor Quotation System**
   - Public form for vendor quotation submission (no login)
   - Quotation comparison and analysis
   - Accept/Reject quotation workflow

4. **Invoice Management System**
   - Automatic invoice creation from accepted quotations
   - Multi-step approval workflow
   - Invoice tracking and payment management

5. **Approval Workflow Engine**
   - Department-specific approval configurations
   - Role-based approval routing
   - Sequential and parallel approval support
   - Digital signature integration

6. **Accounting Integration**
   - Automatic journal entry creation
   - Accounts Payable tracking
   - Payment recording and reconciliation

7. **Email Notification System**
   - RFQ notifications to vendors
   - Quotation acceptance/rejection notifications
   - Payment confirmation emails
   - Approval notifications

8. **Audit and Reporting System**
   - Complete audit trail
   - Transaction logging
   - Compliance reporting

### 2.3 Technology Stack

- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL with Prisma ORM
- **Email Service:** ZeptoMail
- **Authentication:** JWT-based authentication
- **API Architecture:** RESTful APIs
- **Documentation:** Swagger/OpenAPI

---

## 3. FUNCTIONAL REQUIREMENTS

### 3.1 Purchase Requisition Management

#### FR-001: Create Purchase Requisition
**Priority:** High  
**Description:** Users must be able to create purchase requisitions without specifying prices or vendors.

**Requirements:**
- System shall allow users to create requisitions with the following fields:
  - Title (required)
  - Description (required)
  - Department (required, from hardcoded list)
  - Priority (HIGH, MEDIUM, LOW, URGENT)
  - Justification (required)
  - Items list with:
    - Item name
    - Description
    - Quantity
    - Unit of measurement
- System shall NOT require prices or vendor selection at requisition stage
- System shall automatically assign a unique requisition number (format: REQ-YYYYMM-XXXX)
- System shall save requisition in DRAFT status
- System shall record creation timestamp and user

**Acceptance Criteria:**
- User can create requisition without errors
- Requisition number is unique and follows format
- Status is DRAFT after creation
- All required fields are validated

#### FR-002: Submit Requisition for Approval
**Priority:** High  
**Description:** Users must be able to submit draft requisitions for approval.

**Requirements:**
- System shall validate all required fields before submission
- System shall identify appropriate approval configuration based on user's department
- System shall create approval request with correct approval steps
- System shall update requisition status to PENDING_APPROVAL
- System shall notify approvers via email/dashboard
- System shall prevent editing of submitted requisitions

**Acceptance Criteria:**
- Only DRAFT requisitions can be submitted
- Approval request is created successfully
- Approvers receive notifications
- Requisition cannot be edited after submission

#### FR-003: Approve/Reject Requisition
**Priority:** High  
**Description:** Authorized users must be able to approve or reject requisitions.

**Requirements:**
- System shall verify user has approval authority (based on department role)
- System shall allow approver to add comments
- System shall update approval status (APPROVED/REJECTED)
- System shall update requisition status to APPROVED or REJECTED
- System shall record approval timestamp and user
- System shall notify requester of decision
- System shall enable RFQ creation for approved requisitions

**Acceptance Criteria:**
- Only authorized users can approve/reject
- Comments are optional but recorded
- Requester receives notification
- Approved requisitions enable RFQ creation

### 3.2 RFQ Management

#### FR-004: Create and Send RFQ
**Priority:** High  
**Description:** System must allow creation and sending of RFQs to multiple vendors.

**Requirements:**
- System shall create RFQ from approved requisition
- System shall require selection of minimum 2 vendors
- System shall generate unique RFQ number (format: RFQ-YYYYMM-XXXX)
- System shall include the following RFQ details:
  - Title
  - Description
  - Items from requisition
  - Deadline for quotation submission
  - Expected delivery date
  - Delivery address
  - Special requirements/terms
- System shall send formatted email to all selected vendors
- Email shall include:
  - RFQ details
  - Items with quantities and specifications
  - "Submit Quotation Online" button with unique link
  - Alternative submission instructions
- System shall update requisition status to RFQ_SENT
- System shall log email delivery status

**Acceptance Criteria:**
- RFQ is created with unique number
- Emails are sent to all selected vendors
- Each email contains unique quotation submission link
- Requisition status updates to RFQ_SENT
- Email delivery is logged

#### FR-005: Track RFQ Status
**Priority:** Medium  
**Description:** System must provide visibility into RFQ status and vendor responses.

**Requirements:**
- System shall display list of all RFQs with status
- System shall show number of quotations received
- System shall allow filtering by:
  - RFQ number
  - Status (DRAFT, SENT, RESPONSES_RECEIVED, COMPLETED, CANCELLED)
  - Date range
  - Department
- System shall show vendor response status (SENT, VIEWED, SUBMITTED, NO_RESPONSE)

**Acceptance Criteria:**
- All RFQs are visible to authorized users
- Quotation count is accurate
- Filters work correctly
- Vendor response status is updated in real-time

### 3.3 Vendor Quotation Management

#### FR-006: Public Quotation Submission (No Login Required)
**Priority:** High  
**Description:** Vendors must be able to submit quotations online without logging in.

**Requirements:**
- System shall provide public endpoint for quotation submission
- System shall NOT require authentication/login
- System shall accept the following quotation data:
  - RFQ number (auto-populated from link)
  - Company name
  - Contact person
  - Email
  - Phone
  - Tax ID
  - Payment terms
  - Delivery terms
  - Validity period (days)
  - Notes
  - Items with unit prices and currency
- System shall validate RFQ number exists and is active
- System shall calculate subtotal and total automatically
- System shall generate unique quotation number
- System shall save quotation with status SUBMITTED
- System shall send confirmation email to vendor
- System shall notify procurement team of new quotation

**Acceptance Criteria:**
- Vendors can submit without login/authentication
- RFQ number validation works
- Quotation calculations are correct
- Confirmation email is sent
- Procurement team is notified

#### FR-007: Review and Compare Quotations
**Priority:** High  
**Description:** System must allow procurement team to review and compare vendor quotations.

**Requirements:**
- System shall display all quotations for a specific RFQ
- System shall show comparison table with:
  - Vendor name
  - Total amount
  - Currency
  - Payment terms
  - Delivery time
  - Item-by-item price comparison
- System shall highlight lowest price for each item
- System shall calculate total cost comparison
- System shall allow sorting by total amount, vendor, date
- System shall allow filtering by status

**Acceptance Criteria:**
- All submitted quotations are visible
- Comparison table displays correctly
- Lowest prices are highlighted
- Sorting and filtering work correctly

#### FR-008: Accept Winning Quotation
**Priority:** High  
**Description:** System must allow acceptance of winning quotation with automatic invoice creation.

**Requirements:**
- System shall allow authorized user to accept quotation
- System shall require acceptance notes/justification
- System shall update quotation status to ACCEPTED
- System shall automatically create invoice from quotation data with:
  - All items and prices from quotation
  - Vendor information
  - Payment terms
  - Invoice status: DRAFT
- System shall link invoice to accepted quotation
- System shall send acceptance email to winning vendor with:
  - Congratulations message
  - Next steps information
  - Contact information
- System shall prevent accepting multiple quotations for same RFQ

**Acceptance Criteria:**
- Only one quotation can be accepted per RFQ
- Invoice is created automatically
- Invoice data matches quotation exactly
- Vendor receives acceptance email
- Quotation status updates to ACCEPTED

#### FR-009: Reject Quotations
**Priority:** High  
**Description:** System must allow rejection of non-winning quotations with vendor notification.

**Requirements:**
- System shall allow authorized user to reject quotation
- System shall require rejection reason
- System shall update quotation status to REJECTED
- System shall send rejection email to vendor with:
  - Professional rejection message
  - Reason for rejection
  - Thank you message
  - Encouragement for future participation
- System shall record rejection timestamp and user

**Acceptance Criteria:**
- Quotation status updates to REJECTED
- Rejection reason is required and recorded
- Vendor receives professional rejection email
- Rejection is logged in audit trail

### 3.4 Invoice Management

#### FR-010: Invoice Approval Workflow
**Priority:** High  
**Description:** System must implement multi-step invoice approval workflow.

**Requirements:**
- System shall retrieve department-specific approval configuration
- System shall create approval request with configured steps
- System shall identify approvers based on role codes
- System shall process approvals sequentially as configured
- System shall update invoice status through workflow:
  - DRAFT → PENDING_APPROVAL → APPROVED
- System shall allow approvers to add comments
- System shall prevent payment until fully approved
- System shall notify next approver after each step
- System shall notify requester upon final approval

**Acceptance Criteria:**
- Correct approval configuration is retrieved
- All configured steps are executed
- Approvers are correctly identified
- Status transitions are correct
- Notifications are sent at each step

#### FR-011: Invoice Approval - Create Accounting Entry
**Priority:** High  
**Description:** Upon final invoice approval, system must create accounting journal entry.

**Requirements:**
- System shall create journal entry upon final approval
- System shall generate unique entry number (format: JE-YYYYMM-XXXX)
- System shall create the following accounting entries:
  - Debit: Expense accounts (from invoice line items)
  - Debit: VAT Input (if applicable)
  - Credit: Accounts Payable
- System shall ensure total debits equal total credits
- System shall post journal entry immediately
- System shall link journal entry to invoice
- System shall update invoice status to APPROVED
- System shall record accounting entry details in audit log

**Acceptance Criteria:**
- Journal entry is created automatically
- Entry is balanced (debits = credits)
- Correct accounts are used
- Entry is posted immediately
- Invoice status updates to APPROVED

### 3.5 Payment Processing

#### FR-012: Process Payment
**Priority:** High  
**Description:** System must allow payment processing for approved invoices.

**Requirements:**
- System shall only allow payment of APPROVED invoices
- System shall accept the following payment data:
  - Payment method (BANK_TRANSFER, CASH, CHECK)
  - Payment reference
  - Payment date
  - Paid amount
  - Bank account (if applicable)
  - Notes
- System shall validate paid amount matches invoice total
- System shall create payment journal entry:
  - Debit: Accounts Payable
  - Credit: Bank/Cash Account
- System shall update invoice status to PAID
- System shall record payment timestamp
- System shall send payment confirmation email to vendor with:
  - Payment confirmation
  - Payment reference
  - Amount paid
  - Invoice details
- System shall clear liability in accounting system

**Acceptance Criteria:**
- Only APPROVED invoices can be paid
- Payment amount validation works
- Payment journal entry is created
- Invoice status updates to PAID
- Vendor receives confirmation email
- Accounts Payable is cleared

### 3.6 Approval Configuration Management

#### FR-013: Department-Specific Approval Configurations
**Priority:** High  
**Description:** System must support department-specific approval configurations.

**Requirements:**
- System shall allow creation of approval configurations per department
- System shall support hardcoded departments:
  - Finance
  - Operations
  - Procurement
  - Human Resources
  - Marketing
  - Legal
  - IT
- Each configuration shall define approval steps for:
  - PURCHASE_REQUISITION stage
  - INVOICE stage
- System shall support multiple approval steps per stage
- System shall allow configuration of:
  - Step number (sequential order)
  - Step name
  - Step type (ROLE, USER, DEPARTMENT)
  - Role code (from 35 hardcoded roles)
  - Required flag
  - Approval order (SEQUENTIAL, PARALLEL)
- System shall enforce only one active configuration per department
- System shall automatically select correct configuration based on user's department

**Acceptance Criteria:**
- Configurations can be created per department
- All hardcoded departments are supported
- Configuration defines both requisition and invoice stages
- Sequential step processing works correctly
- Correct configuration is applied automatically

#### FR-014: Hardcoded Roles System
**Priority:** High  
**Description:** System must use 35 predefined role codes for approval configurations.

**Requirements:**
- System shall provide 35 hardcoded roles across 7 departments:
  - Finance: FIN_MGR, FIN_OFF, ACCOUNTANT, FIN_ASST, FIN_MEM
  - Operations: OPS_MGR, OPS_OFF, OPS_COORD, OPS_ANALYST, OPS_MEM
  - Procurement: PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM
  - HR: HR_MGR, HR_OFF, RECRUITER, HR_COORD, HR_MEM
  - Marketing: MKT_MGR, MKT_OFF, CONTENT_CREATOR, SOCIAL_MEDIA_MGR, MKT_MEM
  - Legal: LEGAL_MGR, LEGAL_OFF, COMPLIANCE_OFF, LEGAL_ADVISOR, LEGAL_MEM
  - IT: IT_MGR, SYSADMIN, DEVELOPER, IT_SUPPORT, IT_MEM
- System shall provide API endpoint to retrieve all roles
- System shall provide API endpoint to retrieve roles grouped by department
- System shall allow user assignment to role codes
- System shall use role codes for approval routing
- System shall NOT use database role IDs

**Acceptance Criteria:**
- All 35 role codes are available
- Roles API endpoint returns correct data
- Users can be assigned role codes
- Approval routing uses role codes correctly

---

## 4. WORKFLOW SPECIFICATIONS

### 4.1 Complete RFQ-Based Procurement Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    RFQ-BASED PROCUREMENT CYCLE                  │
└─────────────────────────────────────────────────────────────────┘

STAGE 1: REQUISITION CREATION
├── User creates requisition (no prices, no vendors)
├── System validates required fields
├── System generates requisition number
└── Status: DRAFT

STAGE 2: REQUISITION SUBMISSION
├── User submits requisition for approval
├── System identifies department-specific approval config
├── System creates approval request
├── System identifies approver(s) based on config
└── Status: PENDING_APPROVAL

STAGE 3: REQUISITION APPROVAL
├── Approver receives notification
├── Approver reviews requisition
├── Approver approves with comments
├── System updates approval status
└── Status: APPROVED

STAGE 4: RFQ CREATION & SENDING
├── User creates RFQ from approved requisition
├── User selects multiple vendors (minimum 2)
├── System generates RFQ number
├── System sends formatted email to all vendors
├── Email includes "Submit Quotation Online" link
└── Status: RFQ_SENT

STAGE 5: VENDOR QUOTATION SUBMISSION
├── Vendor receives RFQ email
├── Vendor clicks "Submit Quotation Online" button
├── Vendor fills public form (no login required)
├── System validates and saves quotation
├── System sends confirmation to vendor
├── System notifies procurement team
└── Quotation Status: SUBMITTED

STAGE 6: QUOTATION REVIEW
├── Procurement team views all quotations
├── System displays comparison table
├── Team reviews prices, terms, delivery time
├── Team selects winning quotation
└── Decision made

STAGE 7: QUOTATION ACCEPTANCE
├── User accepts winning quotation
├── System updates quotation status to ACCEPTED
├── System automatically creates invoice from quotation
├── Invoice status: DRAFT
├── System sends acceptance email to vendor
└── Invoice linked to quotation

STAGE 8: QUOTATION REJECTION
├── User rejects non-winning quotations
├── System requires rejection reason
├── System updates quotation status to REJECTED
├── System sends professional rejection email
└── Rejection logged in audit trail

STAGE 9: INVOICE SUBMISSION
├── User submits invoice for approval
├── System retrieves department approval config
├── System creates invoice approval request
├── System identifies approvers (Step 1, Step 2, etc.)
└── Status: PENDING_APPROVAL

STAGE 10: INVOICE APPROVAL (Multi-Step)
├── Step 1 Approver: Reviews and approves
│   ├── System moves to Step 2
│   └── Status: PENDING_APPROVAL (Step 2)
│
├── Step 2 Approver: Reviews and approves
│   ├── System completes approval workflow
│   └── Status: APPROVED
│
└── Accounting Entry Created:
    ├── Dr. Expense Account(s)
    ├── Dr. VAT Input (if applicable)
    └── Cr. Accounts Payable

STAGE 11: PAYMENT PROCESSING
├── Finance processes payment
├── System validates invoice is APPROVED
├── User enters payment details
├── System creates payment journal entry:
│   ├── Dr. Accounts Payable
│   └── Cr. Bank/Cash Account
├── System updates invoice status to PAID
├── System sends payment confirmation email to vendor
└── Status: PAID

STAGE 12: CYCLE COMPLETE
├── Vendor paid
├── Liability cleared
├── Books balanced
├── Quotation archived
└── Audit trail complete
```

### 4.2 Approval Workflow State Machine

```
REQUISITION APPROVAL STATES:
DRAFT → PENDING_APPROVAL → APPROVED / REJECTED

INVOICE APPROVAL STATES:
DRAFT → PENDING_APPROVAL → APPROVED / REJECTED → PAID

QUOTATION STATES:
SUBMITTED → ACCEPTED / REJECTED

RFQ STATES:
DRAFT → SENT → RESPONSES_RECEIVED → COMPLETED / CANCELLED
```

### 4.3 Status Transition Rules

| Entity Type | From Status | To Status | Trigger | Authorization |
|-------------|-------------|-----------|---------|---------------|
| Requisition | DRAFT | PENDING_APPROVAL | User submits | Requester |
| Requisition | PENDING_APPROVAL | APPROVED | Approver approves | Dept Head/Deputy |
| Requisition | PENDING_APPROVAL | REJECTED | Approver rejects | Dept Head/Deputy |
| RFQ | DRAFT | SENT | RFQ sent to vendors | Procurement Team |
| Quotation | - | SUBMITTED | Vendor submits | Vendor (public) |
| Quotation | SUBMITTED | ACCEPTED | User accepts | Procurement Team |
| Quotation | SUBMITTED | REJECTED | User rejects | Procurement Team |
| Invoice | DRAFT | PENDING_APPROVAL | User submits | Requester |
| Invoice | PENDING_APPROVAL | APPROVED | All approvers approve | Role-based |
| Invoice | APPROVED | PAID | Payment processed | Finance Team |

---

## 5. USER ROLES AND PERMISSIONS

### 5.1 Hardcoded Departments

The system uses 7 hardcoded departments (stored as strings in `userDepartment` field):

1. **Finance**
2. **Operations**
3. **Procurement**
4. **Human Resources**
5. **Marketing**
6. **Legal**
7. **IT**

### 5.2 Department Roles

Users have a department role that determines requisition approval authority:

| Role | Code | Can Approve Requisitions | Can Create Requisitions |
|------|------|-------------------------|------------------------|
| **Head** | HEAD | ✅ Yes | ✅ Yes |
| **Deputy** | DEPUTY | ✅ Yes | ✅ Yes |
| **Member** | MEMBER | ❌ No | ✅ Yes |

### 5.3 System Role Codes (35 Roles for Approval Configs)

#### Finance Department (5 roles)
| Role Code | Role Name | Level | Typical Permissions |
|-----------|-----------|-------|-------------------|
| FIN_MGR | Finance Manager | 5 | Invoice approval, payment authorization |
| FIN_OFF | Finance Officer | 4 | Invoice review, payment processing |
| ACCOUNTANT | Accountant | 3 | Invoice review, accounting entries |
| FIN_ASST | Finance Assistant | 2 | Invoice data entry |
| FIN_MEM | Finance Member | 1 | Basic finance tasks |

#### Operations Department (5 roles)
| Role Code | Role Name | Level | Typical Permissions |
|-----------|-----------|-------|-------------------|
| OPS_MGR | Operations Manager | 5 | All operations approvals |
| OPS_OFF | Operations Officer | 4 | Day-to-day operations |
| OPS_COORD | Operations Coordinator | 3 | Task coordination |
| OPS_ANALYST | Operations Analyst | 2 | Analysis and reporting |
| OPS_MEM | Operations Member | 1 | Basic operations tasks |

#### Procurement Department (5 roles)
| Role Code | Role Name | Level | Typical Permissions |
|-----------|-----------|-------|-------------------|
| PROC_MGR | Procurement Manager | 5 | All procurement approvals |
| PROC_OFF | Procurement Officer | 4 | RFQ management, vendor relations |
| BUYER | Buyer | 3 | Purchase execution |
| PROC_COORD | Procurement Coordinator | 2 | Documentation, tracking |
| PROC_MEM | Procurement Member | 1 | Basic procurement tasks |

#### Human Resources (5 roles)
| Role Code | Role Name | Level |
|-----------|-----------|-------|
| HR_MGR | HR Manager | 5 |
| HR_OFF | HR Officer | 4 |
| RECRUITER | Recruiter | 3 |
| HR_COORD | HR Coordinator | 2 |
| HR_MEM | HR Member | 1 |

#### Marketing (5 roles)
| Role Code | Role Name | Level |
|-----------|-----------|-------|
| MKT_MGR | Marketing Manager | 5 |
| MKT_OFF | Marketing Officer | 4 |
| CONTENT_CREATOR | Content Creator | 3 |
| SOCIAL_MEDIA_MGR | Social Media Manager | 3 |
| MKT_MEM | Marketing Member | 1 |

#### Legal (5 roles)
| Role Code | Role Name | Level |
|-----------|-----------|-------|
| LEGAL_MGR | Legal Manager | 5 |
| LEGAL_OFF | Legal Officer | 4 |
| COMPLIANCE_OFF | Compliance Officer | 3 |
| LEGAL_ADVISOR | Legal Advisor | 3 |
| LEGAL_MEM | Legal Member | 1 |

#### IT (5 roles)
| Role Code | Role Name | Level |
|-----------|-----------|-------|
| IT_MGR | IT Manager | 5 |
| SYSADMIN | System Administrator | 4 |
| DEVELOPER | Developer | 3 |
| IT_SUPPORT | IT Support | 2 |
| IT_MEM | IT Member | 1 |

### 5.4 Permission Matrix

| Action | Finance HEAD/DEPUTY | Finance MEMBER | Procurement PROC_MGR | All Members |
|--------|---------------------|----------------|----------------------|-------------|
| Create Requisition | ✅ | ✅ | ✅ | ✅ |
| Approve Own Dept Requisition | ✅ | ❌ | ✅ | ❌ |
| Create RFQ | ✅ | ✅ | ✅ | ✅ |
| Accept Quotation | ✅ | ❌ | ✅ | ❌ |
| Reject Quotation | ✅ | ❌ | ✅ | ❌ |
| Approve Invoice (Step 1) | Config-based | Config-based | Config-based | Config-based |
| Approve Invoice (Step 2) | Config-based | Config-based | Config-based | Config-based |
| Process Payment | ✅ | ❌ | ❌ | ❌ |
| View Reports | ✅ | ✅ | ✅ | ✅ |
| Manage Vendors | ✅ | ❌ | ✅ | ❌ |

**Note:** Invoice approval permissions are determined by the approval configuration, not by department role. The configuration uses role codes to identify approvers.

---

## 6. API SPECIFICATIONS

### 6.1 Authentication

All protected endpoints require JWT authentication:

```
Authorization: Bearer <JWT_TOKEN>
```

### 6.2 Core API Endpoints

#### 6.2.1 Approval Configuration APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/procurement-approval-configs` | Create approval configuration | ✅ Admin |
| GET | `/api/procurement-approval-configs` | Get all configurations | ✅ Yes |
| GET | `/api/procurement-approval-configs/active` | Get active configuration | ✅ Yes |
| PUT | `/api/procurement-approval-configs/{id}/deactivate` | Deactivate configuration | ✅ Admin |

#### 6.2.2 Hardcoded Roles APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/hardcoded-roles` | Get all 35 role codes | ✅ Yes |
| GET | `/api/hardcoded-roles/departments-with-roles` | Get roles grouped by department | ✅ Yes |

#### 6.2.3 Requisition APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/procurement/requisitions` | Create requisition | ✅ Yes |
| GET | `/api/procurement/requisitions` | Get all requisitions | ✅ Yes |
| GET | `/api/procurement/requisitions/{id}` | Get requisition by ID | ✅ Yes |
| PUT | `/api/procurement/requisitions/{id}/submit` | Submit for approval | ✅ Yes |
| PUT | `/api/procurement/requisitions/{id}/approve` | Approve requisition | ✅ Approver |
| PUT | `/api/procurement/requisitions/{id}/reject` | Reject requisition | ✅ Approver |

#### 6.2.4 RFQ APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/procurement/rfqs` | Create and send RFQ | ✅ Yes |
| GET | `/api/procurement/rfqs` | Get all RFQs | ✅ Yes |
| GET | `/api/procurement/rfqs/{id}` | Get RFQ by ID | ✅ Yes |

#### 6.2.5 Vendor Quotation APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/vendor-quotations/submit` | Submit quotation (PUBLIC) | ❌ No |
| GET | `/api/vendor-quotations` | Get all quotations | ✅ Yes |
| GET | `/api/vendor-quotations/rfq/{rfqNumber}` | Get quotations by RFQ | ✅ Yes |
| POST | `/api/vendor-quotations/{id}/accept` | Accept quotation | ✅ Yes |
| POST | `/api/vendor-quotations/{id}/reject` | Reject quotation | ✅ Yes |

#### 6.2.6 Invoice APIs

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/procurement/invoices` | Create invoice | ✅ Yes |
| GET | `/api/procurement/invoices` | Get all invoices | ✅ Yes |
| GET | `/api/procurement/invoices/{id}` | Get invoice by ID | ✅ Yes |
| POST | `/api/procurement/invoices/{id}/submit` | Submit for approval | ✅ Yes |
| PUT | `/api/procurement/invoices/{id}/approve` | Approve invoice | ✅ Approver |
| POST | `/api/procurement/invoices/{id}/pay` | Process payment | ✅ Finance |

### 6.3 Request/Response Formats

#### Create Requisition Request
```json
{
  "title": "Office Supplies - January 2025",
  "description": "Monthly office supplies for Finance department",
  "department": "Finance",
  "priority": "MEDIUM",
  "justification": "Required for daily operations",
  "items": [
    {
      "itemName": "A4 Paper",
      "description": "White, 80gsm",
      "quantity": 50,
      "unit": "ream"
    }
  ]
}
```

#### Create RFQ Request
```json
{
  "requisitionId": "req_id_here",
  "title": "RFQ - Office Supplies January 2025",
  "description": "Requesting competitive quotes for office supplies",
  "vendorIds": ["vendor_1", "vendor_2", "vendor_3"],
  "deadline": "2025-02-15T23:59:59.000Z",
  "expectedDeliveryDate": "2025-03-01",
  "deliveryAddress": "123 Main St, Harare",
  "items": [
    {
      "itemName": "A4 Paper",
      "description": "White, 80gsm",
      "quantity": 50,
      "unit": "ream"
    }
  ]
}
```

#### Submit Vendor Quotation (Public - No Auth)
```json
{
  "rfqNumber": "RFQ-202501-0001",
  "companyName": "ABC Office Supplies",
  "contactPerson": "John Doe",
  "email": "john@abc.com",
  "phone": "+263771234567",
  "taxEIN": "12-3456789",
  "paymentTerms": "NET 30",
  "deliveryTime": "3 business days",
  "validityPeriod": 30,
  "notes": "Free delivery for orders over $500",
  "items": [
    {
      "itemName": "A4 Paper",
      "quantity": 50,
      "unitPrice": 15.50,
      "currency": "USD"
    }
  ]
}
```

#### Process Payment Request
```json
{
  "paymentMethod": "BANK_TRANSFER",
  "paymentReference": "TRF-2025-001",
  "paymentDate": "2025-02-15",
  "paidAmount": 1500.00,
  "bankAccountId": "bank_account_id",
  "notes": "Payment via Standard Bank"
}
```

---

## 7. DATA MODELS

### 7.1 Purchase Requisition

```typescript
PurchaseRequisition {
  id: string (UUID)
  requisitionNumber: string (unique, auto-generated)
  title: string
  description: string
  department: string (hardcoded: Finance, Operations, etc.)
  priority: enum (HIGH, MEDIUM, LOW, URGENT)
  justification: string
  status: enum (DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, RFQ_SENT)
  totalAmount: decimal
  requestedById: string (FK: User)
  approvedById: string (FK: User, nullable)
  approvedAt: datetime (nullable)
  rejectedById: string (FK: User, nullable)
  rejectedAt: datetime (nullable)
  rejectionReason: string (nullable)
  items: RequisitionItem[]
  createdAt: datetime
  updatedAt: datetime
}

RequisitionItem {
  id: string (UUID)
  requisitionId: string (FK: PurchaseRequisition)
  itemName: string
  description: string
  quantity: decimal
  unit: string
  specifications: JSON (nullable)
  createdAt: datetime
}
```

### 7.2 RFQ (Request for Quote)

```typescript
RFQ {
  id: string (UUID)
  rfqNumber: string (unique, auto-generated)
  requisitionId: string (FK: PurchaseRequisition)
  title: string
  description: string
  status: enum (DRAFT, SENT, RESPONSES_RECEIVED, COMPLETED, CANCELLED)
  deadline: datetime
  expectedDeliveryDate: date
  deliveryAddress: string
  specialRequirements: text (nullable)
  terms: text (nullable)
  createdById: string (FK: User)
  vendors: RFQVendor[]
  items: RFQItem[]
  createdAt: datetime
  updatedAt: datetime
}

RFQVendor {
  id: string (UUID)
  rfqId: string (FK: RFQ)
  vendorId: string (FK: Vendor)
  emailSent: boolean
  emailSentAt: datetime (nullable)
  quotationSubmitted: boolean
  quotationSubmittedAt: datetime (nullable)
}

RFQItem {
  id: string (UUID)
  rfqId: string (FK: RFQ)
  itemName: string
  description: string
  quantity: decimal
  unit: string
  specifications: JSON (nullable)
}
```

### 7.3 Vendor Quotation

```typescript
VendorQuotation {
  id: string (UUID)
  quotationNumber: string (unique, auto-generated)
  rfqId: string (FK: RFQ)
  rfqNumber: string
  companyName: string
  contactPerson: string
  email: string
  phone: string
  taxEIN: string (nullable)
  status: enum (SUBMITTED, ACCEPTED, REJECTED)
  subtotal: decimal
  taxAmount: decimal
  totalAmount: decimal
  currency: string
  paymentTerms: string
  deliveryTime: string
  validityPeriod: integer (days)
  notes: text (nullable)
  acceptanceNotes: text (nullable)
  rejectionReason: text (nullable)
  reviewedById: string (FK: User, nullable)
  reviewedAt: datetime (nullable)
  items: QuotationItem[]
  createdAt: datetime
  updatedAt: datetime
}

QuotationItem {
  id: string (UUID)
  quotationId: string (FK: VendorQuotation)
  itemName: string
  description: string (nullable)
  quantity: decimal
  unitPrice: decimal
  totalPrice: decimal (calculated)
  unit: string
  currency: string
}
```

### 7.4 Procurement Invoice

```typescript
ProcurementInvoice {
  id: string (UUID)
  invoiceNumber: string (unique)
  quotationId: string (FK: VendorQuotation, nullable)
  vendorId: string (FK: Vendor)
  department: string (hardcoded department)
  status: enum (DRAFT, PENDING_APPROVAL, APPROVED, PAID, REJECTED)
  invoiceDate: date
  dueDate: date
  subtotal: decimal
  taxAmount: decimal
  taxRate: decimal
  totalAmount: decimal
  currency: string
  paymentTerms: string (nullable)
  notes: text (nullable)
  paymentMethod: enum (BANK_TRANSFER, CASH, CHECK, nullable)
  paymentReference: string (nullable)
  paymentDate: date (nullable)
  paidAmount: decimal (nullable)
  paidAt: datetime (nullable)
  approvedById: string (FK: User, nullable)
  approvedAt: datetime (nullable)
  journalEntryId: string (FK: JournalEntry, nullable)
  paymentJournalEntryId: string (FK: JournalEntry, nullable)
  items: InvoiceItem[]
  createdAt: datetime
  updatedAt: datetime
}

InvoiceItem {
  id: string (UUID)
  invoiceId: string (FK: ProcurementInvoice)
  itemName: string
  description: string (nullable)
  quantity: decimal
  unitPrice: decimal
  totalPrice: decimal (calculated)
  unit: string
  accountId: string (FK: ChartOfAccounts)
}
```

### 7.5 Approval Configuration

```typescript
ProcurementApprovalConfig {
  id: string (UUID)
  name: string
  description: text (nullable)
  department: string (hardcoded department, nullable)
  isActive: boolean (default: true)
  stages: ApprovalStage[]
  createdAt: datetime
  updatedAt: datetime
}

ApprovalStage {
  id: string (UUID)
  configId: string (FK: ProcurementApprovalConfig)
  stageType: enum (PURCHASE_REQUISITION, INVOICE)
  steps: ApprovalStep[]
}

ApprovalStep {
  id: string (UUID)
  stageId: string (FK: ApprovalStage)
  stepNumber: integer
  stepName: string
  stepType: enum (ROLE, USER, DEPARTMENT)
  roleCode: string (from 35 hardcoded roles, nullable)
  userId: string (FK: User, nullable)
  departmentId: string (FK: Department, nullable)
  isRequired: boolean (default: true)
  canDelegate: boolean (default: false)
  autoApprove: boolean (default: false)
  approvalOrder: enum (SEQUENTIAL, PARALLEL)
}
```

### 7.6 User Model (Relevant Fields)

```typescript
User {
  id: string (UUID)
  email: string (unique)
  firstName: string
  lastName: string
  userDepartment: string (hardcoded: Finance, Operations, etc.)
  departmentRole: enum (HEAD, DEPUTY, MEMBER)
  roleCode: string (from 35 hardcoded roles)
  isActive: boolean
  createdAt: datetime
  updatedAt: datetime
}
```

---

## 8. BUSINESS RULES

### 8.1 Requisition Rules

**BR-001:** Requisitions must NOT include prices or vendor selections  
**BR-002:** Only DRAFT requisitions can be edited  
**BR-003:** Only department HEAD or DEPUTY can approve requisitions from their department  
**BR-004:** Requisition must be APPROVED before RFQ can be created  
**BR-005:** Requisition number format: `REQ-YYYYMM-XXXX`

### 8.2 RFQ Rules

**BR-006:** RFQ must be sent to minimum 2 vendors  
**BR-007:** RFQ must include items from approved requisition  
**BR-008:** RFQ number format: `RFQ-YYYYMM-XXXX`  
**BR-009:** Vendors must submit quotations before deadline  
**BR-010:** Each vendor receives unique quotation submission link

### 8.3 Quotation Rules

**BR-011:** Vendor quotation submission does NOT require authentication  
**BR-012:** Quotation number format: `QUO-TIMESTAMP-RANDOM`  
**BR-013:** Only ONE quotation per RFQ can be accepted  
**BR-014:** Accepting quotation automatically creates invoice  
**BR-015:** Rejected quotations must include rejection reason  
**BR-016:** Quotation acceptance/rejection sends email to vendor

### 8.4 Invoice Rules

**BR-017:** Invoice from accepted quotation inherits all quotation data  
**BR-018:** Invoice approval follows department-specific configuration  
**BR-019:** Invoice must go through all configured approval steps  
**BR-020:** Invoice approval creates accounting journal entry:
- Dr. Expense Account(s)
- Dr. VAT Input (if applicable)
- Cr. Accounts Payable

**BR-021:** Only APPROVED invoices can be paid  
**BR-022:** Payment creates accounting journal entry:
- Dr. Accounts Payable
- Cr. Bank/Cash Account

**BR-023:** Payment amount must match invoice total  
**BR-024:** Payment processing sends confirmation email to vendor

### 8.5 Approval Configuration Rules

**BR-025:** Only one active approval configuration per department  
**BR-026:** Configuration must define both PURCHASE_REQUISITION and INVOICE stages  
**BR-027:** Approval steps are executed sequentially  
**BR-028:** System uses role codes (not database role IDs) for approval routing  
**BR-029:** User's roleCode determines if they can approve at a specific step  
**BR-030:** Finance department has 2-step invoice approval:
- Step 1: ACCOUNTANT review
- Step 2: FIN_MGR final approval

### 8.6 Accounting Rules

**BR-031:** All journal entries must be balanced (total debits = total credits)  
**BR-032:** Journal entries are posted immediately upon creation  
**BR-033:** Invoice approval journal entry links to invoice  
**BR-034:** Payment journal entry links to invoice  
**BR-035:** Journal entry number format: `JE-YYYYMM-XXXX`

### 8.7 Email Notification Rules

**BR-036:** RFQ email includes "Submit Quotation Online" button with unique link  
**BR-037:** Quotation acceptance email congratulates vendor  
**BR-038:** Quotation rejection email is professional and encourages future participation  
**BR-039:** Payment confirmation email includes payment reference  
**BR-040:** All emails are logged in audit trail

---

## 9. INTEGRATION REQUIREMENTS

### 9.1 Accounting Module Integration

**INT-001:** Invoice approval must create journal entry in accounting system  
**INT-002:** Payment processing must create journal entry in accounting system  
**INT-003:** Journal entries must link to procurement invoices  
**INT-004:** Chart of Accounts must include:
- Accounts Payable (account code: 2010)
- VAT Input (account code: 1220)
- Bank Accounts (account code: 1030+)
- Expense Accounts (account codes: 5000+)

**INT-005:** Accounting integration must:
- Validate account codes exist
- Ensure balanced entries
- Post entries immediately
- Update trial balance
- Link to procurement entities

### 9.2 Email Service Integration

**INT-006:** System must integrate with ZeptoMail for email delivery  
**INT-007:** Email templates required:
- RFQ notification to vendors
- Quotation acceptance notification
- Quotation rejection notification
- Payment confirmation notification
- Approval notifications

**INT-008:** Emails must be:
- Professionally formatted
- Mobile-responsive
- Include actionable buttons/links
- Logged for audit purposes

### 9.3 Vendor Management Integration

**INT-009:** System must retrieve vendor data (name, email, contact) from vendor module  
**INT-010:** Vendor list must be maintained in vendor management system  
**INT-011:** Vendor selection must validate vendor exists and is active

### 9.4 User Management Integration

**INT-012:** System must authenticate users via JWT tokens  
**INT-013:** User department and role code must be retrieved from user profile  
**INT-014:** Approval routing must use user's roleCode and userDepartment

---

## 10. SECURITY REQUIREMENTS

### 10.1 Authentication and Authorization

**SEC-001:** All protected endpoints must require JWT authentication  
**SEC-002:** JWT tokens must have expiration time  
**SEC-003:** System must validate user permissions for each action  
**SEC-004:** Approval actions must verify user has approval authority

### 10.2 Public Endpoints

**SEC-005:** Vendor quotation submission endpoint must NOT require authentication  
**SEC-006:** Public quotation submission must validate RFQ number exists and is active  
**SEC-007:** Public endpoint must have rate limiting to prevent abuse  
**SEC-008:** Public endpoint must validate all input data

### 10.3 Data Protection

**SEC-009:** All sensitive data must be encrypted at rest  
**SEC-010:** All API communications must use HTTPS  
**SEC-011:** User passwords must be hashed using bcrypt  
**SEC-012:** System must not expose internal IDs in public endpoints

### 10.4 Audit and Logging

**SEC-013:** All approval actions must be logged with user, timestamp, and decision  
**SEC-014:** All email sends must be logged with recipient and status  
**SEC-015:** All payment transactions must be logged with full details  
**SEC-016:** All quotation acceptances/rejections must be logged  
**SEC-017:** Audit logs must be immutable and tamper-proof

### 10.5 Access Control

**SEC-018:** Users can only view requisitions from their department  
**SEC-019:** Users can only approve requisitions if they have HEAD or DEPUTY role  
**SEC-020:** Invoice approval restricted to users with matching roleCode in config  
**SEC-021:** Payment processing restricted to Finance department users

---

## 11. NON-FUNCTIONAL REQUIREMENTS

### 11.1 Performance

**NFR-001:** API response time must be < 2 seconds for 95% of requests  
**NFR-002:** Public quotation submission must handle 100 concurrent requests  
**NFR-003:** Email delivery must complete within 30 seconds  
**NFR-004:** Database queries must be optimized with proper indexing

### 11.2 Scalability

**NFR-005:** System must support 1000+ active users  
**NFR-006:** System must handle 10,000+ requisitions per year  
**NFR-007:** Database must support growth to 100,000+ records per table

### 11.3 Reliability

**NFR-008:** System uptime must be 99.5% or higher  
**NFR-009:** Failed email deliveries must be retried up to 3 times  
**NFR-010:** Database must have automated backups every 24 hours  
**NFR-011:** Critical errors must be logged and monitored

### 11.4 Usability

**NFR-012:** Vendor quotation form must be mobile-friendly  
**NFR-013:** All user interfaces must be responsive  
**NFR-014:** Error messages must be clear and actionable  
**NFR-015:** Form validation must provide real-time feedback

### 11.5 Maintainability

**NFR-016:** Code must follow consistent style guidelines  
**NFR-017:** All APIs must be documented in Swagger/OpenAPI  
**NFR-018:** Database schema must use Prisma migrations  
**NFR-019:** All business logic must have unit tests with 80% coverage

### 11.6 Compliance

**NFR-020:** System must maintain complete audit trail for compliance  
**NFR-021:** Financial data must be retained for minimum 7 years  
**NFR-022:** System must support multi-currency transactions  
**NFR-023:** All accounting entries must follow standard accounting principles

---

## 12. ACCEPTANCE CRITERIA

### 12.1 Requisition Management

✅ User can create requisition without prices or vendors  
✅ User can submit requisition for approval  
✅ Department HEAD/DEPUTY can approve requisition  
✅ Requester receives notification of approval decision  
✅ Approved requisition enables RFQ creation

### 12.2 RFQ Management

✅ User can create RFQ from approved requisition  
✅ User can select multiple vendors (minimum 2)  
✅ System sends formatted email to all selected vendors  
✅ Email includes "Submit Quotation Online" button with unique link  
✅ RFQ status updates correctly

### 12.3 Vendor Quotation

✅ Vendor can submit quotation without login  
✅ Vendor receives confirmation email  
✅ Procurement team receives notification of new quotation  
✅ System displays quotation comparison table  
✅ User can accept winning quotation  
✅ System automatically creates invoice from accepted quotation  
✅ User can reject quotations with reason  
✅ Vendors receive acceptance/rejection emails

### 12.4 Invoice Approval

✅ Invoice from accepted quotation is auto-created  
✅ User can submit invoice for approval  
✅ System retrieves correct department approval configuration  
✅ Multi-step approval process works correctly  
✅ Approvers identified based on role codes  
✅ Invoice approval creates accounting journal entry:
  - Dr. Expense Accounts
  - Dr. VAT Input (if applicable)
  - Cr. Accounts Payable
✅ Journal entry is balanced (debits = credits)

### 12.5 Payment Processing

✅ Only APPROVED invoices can be paid  
✅ Payment creates accounting journal entry:
  - Dr. Accounts Payable
  - Cr. Bank/Cash Account
✅ Invoice status updates to PAID  
✅ Vendor receives payment confirmation email  
✅ Accounts Payable is cleared in accounting system

### 12.6 Approval Configuration

✅ Admin can create department-specific approval configurations  
✅ Configuration uses hardcoded role codes (not database IDs)  
✅ Configuration defines requisition and invoice stages  
✅ System automatically applies correct configuration based on user's department  
✅ Sequential approval steps execute in order

### 12.7 Email Notifications

✅ RFQ emails sent to all selected vendors  
✅ Quotation acceptance emails sent to winning vendor  
✅ Quotation rejection emails sent to non-winning vendors  
✅ Payment confirmation emails sent to vendors  
✅ All emails are professionally formatted  
✅ All email sends are logged

### 12.8 Accounting Integration

✅ Invoice approval creates journal entry  
✅ Payment creates journal entry  
✅ All journal entries are balanced  
✅ Journal entries link to procurement entities  
✅ Trial balance reflects procurement transactions

### 12.9 Audit and Compliance

✅ All actions are logged in audit trail  
✅ User, timestamp, and action recorded  
✅ Audit logs are immutable  
✅ Complete transaction history is maintained

### 12.10 Security

✅ Protected endpoints require authentication  
✅ Public quotation submission does not require login  
✅ User permissions are enforced  
✅ Approval authority is validated  
✅ Sensitive data is encrypted

---

## 13. TESTING REQUIREMENTS

### 13.1 Unit Testing

- All business logic functions must have unit tests
- Minimum 80% code coverage
- Test all approval routing logic
- Test accounting entry calculations
- Test email formatting

### 13.2 Integration Testing

- Test complete requisition to payment workflow
- Test approval configuration application
- Test accounting integration
- Test email delivery
- Test vendor quotation submission

### 13.3 User Acceptance Testing

- Test Finance department workflow (2-step invoice approval)
- Test Operations department workflow
- Test Procurement department workflow
- Test vendor quotation submission from vendor perspective
- Test complete end-to-end cycle

### 13.4 Performance Testing

- Load test public quotation endpoint (100 concurrent users)
- Test API response times under load
- Test email delivery at scale
- Test database performance with large datasets

### 13.5 Security Testing

- Test authentication and authorization
- Test public endpoint security
- Test SQL injection prevention
- Test XSS prevention
- Test rate limiting on public endpoints

---

## 14. DEPLOYMENT REQUIREMENTS

### 14.1 Environment Setup

- Production environment on cloud infrastructure
- PostgreSQL database with automatic backups
- Email service (ZeptoMail) configured
- HTTPS enabled for all endpoints
- Environment variables securely configured

### 14.2 Database Migration

- Prisma migrations for all schema changes
- Migration scripts tested in staging
- Rollback plan for failed migrations
- Data integrity checks after migration

### 14.3 Initial Data Setup

- 35 hardcoded roles available via API
- 7 hardcoded departments configured
- Chart of Accounts with procurement accounts
- Initial approval configurations created
- Test vendors created

### 14.4 Monitoring and Alerts

- Application performance monitoring (APM)
- Error tracking and logging
- Email delivery monitoring
- Database performance monitoring
- Alerts for critical errors

---

## 15. DOCUMENTATION REQUIREMENTS

### 15.1 API Documentation

✅ Swagger/OpenAPI specification for all endpoints  
✅ Request/response examples  
✅ Authentication requirements  
✅ Error codes and messages

### 15.2 User Documentation

✅ User guide for requisition creation  
✅ User guide for RFQ process  
✅ User guide for quotation management  
✅ User guide for invoice approval  
✅ User guide for payment processing

### 15.3 Administrator Documentation

✅ Guide for approval configuration setup  
✅ Guide for role management  
✅ Guide for troubleshooting  
✅ Guide for system monitoring

### 15.4 Vendor Documentation

✅ Guide for quotation submission  
✅ Quotation form instructions  
✅ FAQ for vendors

---

## 16. GLOSSARY

**Accounts Payable:** Liability account representing money owed to vendors

**Approval Configuration:** Department-specific rules defining who approves requisitions and invoices

**Chart of Accounts:** List of all accounting accounts used in the system

**Department Role:** User's role within their department (HEAD, DEPUTY, MEMBER)

**Hardcoded Roles:** 35 predefined role codes used for approval configurations

**Journal Entry:** Accounting record of a transaction with debits and credits

**RFQ (Request for Quote):** Document requesting price quotes from vendors

**Role Code:** String identifier for system roles (e.g., FIN_MGR, ACCOUNTANT)

**Vendor Quotation:** Price quote submitted by vendor in response to RFQ

---

## 17. REVISION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-24 | Development Team | Initial SRD based on procurement workflow documentation |

---

## 18. APPENDICES

### Appendix A: Sample Approval Configuration (Finance Department)

```json
{
  "name": "Finance Department Procurement Approval",
  "description": "Two-stage approval process for Finance department",
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

### Appendix B: Sample RFQ Email

```html
Subject: Request for Quote RFQ-202501-0001 - NVCCZ

Dear Vendor,

We are seeking competitive quotes for the following items/services:

RFQ Information:
- RFQ Number: RFQ-202501-0001
- Date: November 24, 2025
- Project: Office Supplies - January 2025

Response Deadline: December 15, 2025

Items/Services Required:
1. A4 Paper
   Quantity: 50 reams
   Specifications: White, 80gsm

2. Office Supplies Bundle
   Quantity: 10 sets

[Submit Your Quotation Online] ← Button with link

This is the fastest way to submit your quote!

Link: https://nvccz.com/vendor/quotation/submit?rfq=RFQ-202501-0001

Thank you for your participation.

Best regards,
NVCCZ Procurement Team
```

### Appendix C: Accounting Entry Examples

#### Invoice Approval Entry
```
Dr. Software Expense (Account 5030)      $1,800.00
Dr. VAT Input (Account 1220)             $   261.00
    Cr. Accounts Payable (Account 2010)      $2,061.00
```

#### Payment Entry
```
Dr. Accounts Payable (Account 2010)      $2,061.00
    Cr. Bank Account - USD (Account 1030)    $2,061.00
```

---

**END OF DOCUMENT**

---

**Document Control:**
- **Status:** Final
- **Approved By:** [Approval Required]
- **Approval Date:** [Date]
- **Next Review Date:** [6 months from approval]







