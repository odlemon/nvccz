# ARCUS Fundraising, Investor Relations & Mandate Origination System

> Developer Software Requirements Specification (Markdown Edition)

Version: **1.0**

**Repo note:** Canonical SRD for fundraising / IR / mandate work on this branch. Agents and engineers should reference this file (and gap analysis against `docs/fundraising-investor-relations-api.md` + `docs/fundraising-lp-pipeline-backend-requirements.md`) when implementing.

---

# Overview

## Purpose

The ARCUS Fundraising, Investor Relations and Mandate Origination System is an institutional platform designed for:

- Asset Managers
- Private Equity Funds
- Venture Capital Funds

The platform manages the complete fundraising lifecycle from investor sourcing through investor onboarding and ultimately activation of capital or assets under management.

This is **not** a generic CRM.

Every opportunity must be attached to:

- Fund
- Product
- Mandate
- Campaign

and move through controlled commercial, legal, compliance and onboarding workflows.

---

# Supported Business Models

The application must support three independent operating models.

## 1. Asset Management

Supports:

- Institutional mandates
- Managed accounts
- Unit trusts
- Pension funds
- Insurance mandates
- Corporate treasury mandates
- Advisory mandates
- Distributor relationships

Important fields include:

- Expected AUM
- Potential Future AUM
- Management Fees
- Performance Fees
- Benchmark
- Investment Restrictions
- Custodian
- Reporting Frequency

Activation only occurs after:

- Agreement Signed
- Portfolio Configured
- KYC Approved
- Assets Received

Lifecycle

```
Proposal
    ↓
Agreement Signed
    ↓
Client Onboarded
    ↓
Assets Transferred
    ↓
Mandate Activated
```

---

## 2. Private Equity Fundraising

Supports:

- Buyout Funds
- Growth Funds
- Infrastructure Funds
- Real Estate Funds
- Private Credit Funds
- SPVs
- Continuation Funds
- Co-Investments

Tracks

- Target Fund Size
- Minimum Raise
- Hard Cap
- First Close
- Final Close

Capital States

- Indicative
- Soft Circle
- Proposed
- Signed
- Admitted
- Funded

Legal Terms

- Side Letters
- MFN Rights
- Advisory Committee Rights
- Fee Discounts
- Excuse Rights

---

## 3. Venture Capital Fundraising

Supports

- Seed
- Early Stage
- Growth
- Angel Syndicates
- Climate Funds
- Impact Funds
- Corporate Venture

Unlike PE the system must handle:

- High volume investors
- Smaller ticket sizes
- Faster communication

while maintaining identical legal and compliance controls.

---

# Product Objectives

The platform shall provide:

1. Fundraising Campaign Management

2. Central Investor Database

3. Configurable Pipelines

4. Independent tracking for

- Indicative Interest
- Qualified Amount
- Soft Circle
- Proposed Amount
- Signed Commitment
- Admitted Commitment
- Funded Capital
- Expected AUM
- Activated AUM

These values must NEVER overwrite one another.

5. Communication history

Including

- Emails
- Calls
- Meetings
- Notes
- Documents

6. Due Diligence Management

Including

- DDQs
- RFPs
- KYC
- AML
- Sanctions
- Data Rooms

7. Agreement Management

Including

- Document generation
- Electronic signatures
- Approval routing

8. Analytics

Including

- Pipeline
- Expected Revenue
- Conversion
- Stage Ageing
- Fundraising Progress

9. Immutable Audit Logs

---

# Navigation

```
Dashboard

Campaigns

Investor Organisations

Contacts

Pipeline

Mandates & RFPs

Due Diligence

Data Rooms

Communications

Meetings

Tasks

Documents

Agreements

Commitments

Closings

Client Onboarding

Placement Agents

Forecasts

Analytics

Reports

Approvals

Audit Logs

Settings
```

Navigation should be permanently available through a fixed left sidebar.

---

# Adaptive Terminology

The UI must automatically change language depending on customer type.

Asset Managers see

- Mandates
- Products
- AUM
- Fees

Private Equity users see

- Funds
- LPs
- Commitments
- Closings

VC users see

- Funds
- Investors
- Commitments
- Capital

The backend services remain shared.

Only terminology changes.

---

# Investor Organisation

Represents

- Pension Funds
- Insurance Companies
- Family Offices
- DFIs
- Sovereign Wealth Funds
- Banks
- Consultants

Required Information

## Identity

- Legal Name
- Trading Name
- Registration Number
- Country
- Jurisdiction

## Commercial

- Estimated AUM
- Typical Ticket Size
- Preferred Asset Classes
- Geographic Focus

## Relationship

- Relationship Owner
- Source
- Last Contact
- Next Action
- Status

## Compliance

- KYC Status
- Sanctions Status
- Risk Rating
- Investor Classification
- Eligibility

---

# Contacts

Every Investor Organisation may have multiple contacts.

Contacts are reusable across campaigns.

Each stores

- Name
- Department
- Position
- Email
- Phone
- Decision Influence
- Consent
- Last Interaction
- Next Planned Action

---

# Campaigns

A campaign represents one fundraising initiative.

Examples

- Fundraise
- Product Launch
- Mandate
- SPV
- Co-Investment

Required Information

### Configuration

- Type
- Product
- Fund
- Strategy

### Targets

- Target Raise
- Minimum Raise
- Hard Cap
- First Close
- Final Close

### Ownership

- Team
- Owner
- Approval Status

### Rules

- Investor Segments
- Pipeline
- Stage Probabilities
- Marketing Jurisdictions

Campaigns cannot become active until:

- Product exists
- Targets approved
- Documents uploaded
- Pipeline configured
- Team assigned
- Compliance approval completed

---

# Opportunity

Formula

```
Investor

+

Campaign

+

Fund/Product

+

Relationship Owner

=

Opportunity
```

Every Opportunity stores

- Current Stage
- Currency
- Indicative Amount
- Qualified Amount
- Soft Circle
- Proposed Amount
- Signed Amount
- Confidence
- Probability
- Expected Close
- Consultant
- Placement Agent
- Owner
- Priority
- Source
- Lost Reason

---

# Opportunity Amount Types

| Type | Meaning |
|-------|----------|
| Indicative | Early Interest |
| Qualified | Validated Amount |
| Soft Circle | Expected Commitment |
| Proposed | Included in Documentation |
| Signed | Agreement Executed |
| Admitted | Accepted Into Closing |
| Funded | Cash Received |
| Expected AUM | Expected Assets |
| Activated AUM | Assets Under Management |

Rules

Every modification creates a history record.

Users are NEVER allowed to overwrite previous values.

History must include

- Old Value
- New Value
- User
- Timestamp
- Reason

---

# User Roles

Supported roles include

- Head of Fundraising
- Investor Relations Officer
- Business Development
- Managing Partner
- Compliance
- Legal
- Finance
- Placement Agent
- Investor Portal User

Each role has object-level permissions.

---

# Campaign Creation Workflow

```
Create Campaign
        ↓
Choose Type
        ↓
Link Product
        ↓
Targets
        ↓
Investor Segments
        ↓
Pipeline
        ↓
Assign Team
        ↓
Approval
        ↓
Activate
```

No campaign may bypass approvals.

---

# Pipeline

## PE / VC Pipeline

```
Target Investor

↓

Contacted

↓

Qualified

↓

Engaged

↓

Data Room

↓

Due Diligence

↓

Investment Committee

↓

Commercial Negotiation

↓

Subscription Documents

↓

KYC

↓

Signed

↓

Admitted

↓

Funded
```

Temporary statuses

- Lost
- Deferred
- Withdrawn
- On Hold
- Disqualified
- Tender Cancelled

---

# Stage Validation

Every movement between stages requires server validation.

Drag-and-drop only changes the UI.

The backend remains authoritative.

Missing requirements return structured validation messages.

---

# UI Translation (Image Requirements)

## Global Layout

The UI inspiration images indicate the following mandatory layout requirements:

- Fixed left navigation panel occupying approximately 240–260px.
- Compact top application bar with global search, notifications, quick actions, and user profile.
- Main content area uses high information density with minimal unused whitespace.
- Consistent card spacing (16–20px).
- Rounded cards with subtle shadows.
- Dark navy institutional theme with blue and purple accents.
- Right-side contextual drawer for editing/viewing records without leaving the current workspace.
- KPI cards aligned horizontally across the top of dashboards.
- Large data tables beneath KPI sections with sticky headers.
- Charts positioned below KPI summaries.
- Status chips use consistent colors:
  - Green = Success
  - Blue = Active
  - Amber = Pending
  - Red = Exception
  - Grey = Inactive

---

# Investor Relationship Management

Every Investor Organisation has a single master record that acts as the 360° relationship view.

The investor record must never be duplicated.

Instead, it owns multiple child records including:

- Contacts
- Opportunities
- Commitments
- Mandates
- Meetings
- Communications
- Documents
- KYC Cases
- Data Room Access
- Agreements
- Tasks
- Notes

The Investor 360 page should display:

## Organisation Summary

- Organisation Name
- Investor Type
- Country
- Jurisdiction
- Estimated AUM
- Risk Rating
- Investor Classification
- Relationship Owner
- Current Status

---

## Relationship Metrics

Display KPI cards showing

- Active Opportunities
- Active Campaigns
- Current Commitments
- Current AUM
- Meetings This Quarter
- Outstanding Tasks
- Open Due Diligence Requests

---

## Contact Hierarchy

The organisation page should display every contact in a structured table.

Required columns

| Field |
|---------|
| Name |
| Title |
| Department |
| Email |
| Phone |
| Decision Influence |
| Last Contact |
| Next Action |

The interface should allow

- Add Contact
- Edit Contact
- Archive Contact
- View Communication History

---

## Opportunity Timeline

Display every opportunity associated with the organisation.

Columns

- Opportunity
- Campaign
- Stage
- Probability
- Expected Close
- Value
- Owner

Users should be able to open the Opportunity Drawer directly from the table.

---

## Relationship Activity Timeline

Chronological timeline including

- Calls
- Emails
- Meetings
- Notes
- Documents Shared
- DDQs
- Proposal Submissions
- KYC Requests

Newest items appear first.

Every activity card displays

- User
- Date
- Type
- Summary
- Attachments
- Next Action

---

# Communications Module

The platform records every interaction.

Supported interaction types

- Email
- Phone Call
- Video Meeting
- Physical Meeting
- Conference
- Presentation
- Follow Up
- Internal Note
- Data Room Invitation
- Proposal Submission
- DDQ Response

Every communication stores

| Field |
|----------|
| Opportunity |
| Organisation |
| Contact |
| Type |
| Subject |
| Owner |
| Participants |
| Date |
| Outcome |
| Summary |
| Sentiment |
| Next Action |
| Due Date |
| Attachments |
| Confidentiality |

---

## Secure Communication

Sensitive documents must never be sent as normal email attachments.

Instead

Generate secure authenticated download links.

Features

- Expiry Date
- Download Limits
- Password Protection
- Audit Log
- Watermark

---

# Meetings & Tasks

Users can create

- Meetings
- Follow Ups
- Internal Tasks

Every task belongs to

- Opportunity
- Campaign
- Investor

Task fields

- Title
- Description
- Due Date
- Assigned User
- Priority
- Status

Statuses

```
NOT_STARTED

IN_PROGRESS

WAITING_ON_INVESTOR

WAITING_ON_INTERNAL_TEAM

COMPLETED

CANCELLED

OVERDUE
```

Recurring tasks must be supported.

Meetings should optionally synchronize with approved calendar integrations.

---

# RFP & Tender Management

The Asset Management workflow includes

- RFIs
- RFPs
- Institutional Tenders

Each submission stores

## Tender Details

- Reference Number
- Institution
- Deadline
- Presentation Date
- Evaluation Criteria

---

## Submission Management

- Required Documents
- Owners
- Proposal Versions
- Submission Evidence
- Internal Approvals

---

## Commercial Information

- Strategy
- Fees
- Benchmarks
- Investment Limits
- Risk
- Team
- Track Record
- Reporting
- Implementation Plan

---

## Outcome

- Won
- Lost
- Pending

Additional Information

- Debrief Notes
- Loss Reason
- Next Action

Successful tenders convert into Mandate Onboarding automatically.

---

# Due Diligence

The platform supports

- Investor DD
- Operational DD
- Financial DD
- Compliance DD
- Legal DD
- ESG DD
- Technology DD
- Investment Process DD

---

## DDQ Management

Required functionality

- Templates
- Categories
- Response Owners
- Approved Answer Library
- Version History
- Evidence
- Reviewer Comments
- Approvals
- Submission History
- Expiry Dates

Statuses

```
NOT_STARTED

IN_PROGRESS

INTERNAL_REVIEW

APPROVED

SUBMITTED

INVESTOR_FOLLOW_UP

COMPLETED
```

---

# Due Diligence Workspace (UI Translation)

Based on the UI inspiration, the Due Diligence workspace should contain

## Header

- Investor Name
- Campaign
- Overall Status
- Progress Bar
- Assigned Owner

---

## Left Panel

Checklist grouped by category

Examples

```
Corporate

Financial

Legal

Compliance

Operations

Technology

ESG
```

Each category shows

- Progress
- Outstanding Questions
- Completion %

---

## Main Workspace

Large document matrix displaying

| Requirement | Status | Owner | Due Date | Version |

Rows should be expandable.

---

## Right Drawer

Displays

- Reviewer Comments
- Investor Questions
- Attachments
- Activity History

---

# Data Rooms

Each campaign may have one or more secure investor data rooms.

Capabilities

- Investor Specific Access
- Folder Permissions
- Document Permissions
- Watermarks
- View Only Mode
- Download Restrictions
- Expiration
- MFA
- Activity Logs
- Access Revocation

---

## Suggested Folder Structure

```
Fund Overview

Strategy

Performance

Legal

Financial Statements

Portfolio

Valuation

Risk

Compliance

ESG

Tax

Subscription Documents
```

---

## Monitoring

Display

- Views
- Downloads
- Failed Login Attempts
- Last Access
- User
- Device
- Country

---

# KYC & Compliance

Capture

- Company Registration
- Beneficial Owners
- Tax Details
- Identity Documents
- Source of Wealth
- Source of Funds
- Sanctions
- PEP
- Adverse Media
- Signatories
- Bank Accounts

Statuses

```
NOT_STARTED

DOCUMENTS_REQUESTED

DOCUMENTS_RECEIVED

UNDER_REVIEW

MORE_INFORMATION_REQUIRED

APPROVED

APPROVED_WITH_CONDITIONS

REJECTED

EXPIRED
```

Compliance Rule

Commercial discussions may continue before KYC approval.

However

No investor may

- Be Admitted
- Fund
- Activate Assets

while a compliance block exists.

---

# Commercial Terms

## PE / VC

Store

- Commitment
- Management Fee
- Carried Interest
- Hurdle
- Preferred Return
- GP Commitment
- Advisory Rights
- MFN
- Side Letters
- Fee Discounts
- Transfer Restrictions

---

## Asset Management

Store

- Expected AUM
- Initial Funding
- Fee Basis Points
- Performance Fee
- Benchmark
- Fee Floors
- Fee Caps
- Reporting Frequency
- Custodian
- Notice Period

Any concession outside configured thresholds automatically generates an approval request.

Examples

- Fee Discounts
- Custom Reporting
- Non-standard Liquidity
- Special Liability Clauses
- Exclusivity

---

# Agreements & Electronic Signatures

The platform must support complete lifecycle management of fundraising and mandate-related agreements.

## Private Equity / Venture Capital Documents

Supported document types include:

- Non-Disclosure Agreements (NDAs)
- Term Sheets
- Subscription Agreements
- Limited Partnership Agreements (LPAs)
- Side Letters
- Co-Investment Agreements
- Adherence Agreements
- Investor Representation Letters

---

## Asset Management Documents

Supported document types include:

- Non-Disclosure Agreements (NDAs)
- Proposal Acceptance Letters
- Investment Management Agreements
- Investment Mandates
- Service Level Agreements
- Fee Schedules
- Investment Guidelines
- Custody Instructions

---

## Signature Management

Every signature workflow must include:

- Document Version
- Required Signatories
- Signing Sequence
- Invitation Date
- Expiration Date
- Signed Date
- Signature Certificate
- Signed Document Copy
- Digital Checksum
- Audit Trail

### Business Rules

A signature always belongs to a specific document version.

If a newer version is uploaded:

- All pending signature requests become invalid.
- A new approval workflow starts.
- Existing signatures cannot be transferred.
- Previous signed versions remain archived.

---

# Commitment Management (PE & VC)

Commitments represent legal promises made by investors.

A commitment is **not** equivalent to cash received.

## Commitment Statuses

```
INDICATIVE

SOFT_CIRCLED

PROPOSED

DOCUMENTS_ISSUED

SIGNED

ACCEPTED

ADMITTED_AT_CLOSE

PARTIALLY_FUNDED

FUNDED

REDUCED

CANCELLED

DEFAULTED
```

---

## Commitment Record

Each commitment stores:

### Investor Information

- Investor
- Fund
- Related Opportunity

### Financial Information

- Currency
- Commitment Amount
- Funded Amount
- Unfunded Amount

### Closing Information

- Signed Date
- Admission Date
- Closing Event

### Operations

- Side Letter
- Capital Call Contact
- Distribution Instructions
- Compliance Status
- Accounting Status

---

## Accounting Rules

The following values must remain independent:

```
Signed Commitment

≠

Admitted Commitment

≠

Funded Capital

≠

Cash Received
```

Cash should only be recognised once money has actually been received.

---

# Asset Management Mandates

Winning a mandate does not automatically activate Assets Under Management.

A mandate progresses through onboarding.

---

## Mandate Statuses

```
AWARDED

ONBOARDING

ASSETS_IN_TRANSITION

PARTIALLY_FUNDED

ACTIVE

SUSPENDED

TERMINATED

LOST_BEFORE_ACTIVATION
```

---

## Activation Requirements

A mandate becomes Active only after:

- Agreement Signed
- KYC Approved
- Guidelines Configured
- Benchmark Configured
- Fees Configured
- Reporting Configured
- Custodian Confirmed
- Opening Balances Verified
- Assets Received

---

# Fund Closing Management

Private Equity and Venture Capital funds may have multiple closing events.

Supported close types include:

- First Close
- Interim Close
- Subsequent Close
- Extended Close
- Final Close

---

## Closing Record

Each closing stores:

- Closing Date
- Investors Admitted
- Commitments Admitted
- Total Commitment Value
- Legal Approval
- Compliance Approval
- Equalisation Requirements
- Closing Documents
- Closing Pack

---

## Closing Validation

### Legal Readiness

Must confirm:

- Subscription Agreements Signed
- Side Letters Signed
- Tax Documentation Complete
- Eligibility Verified

---

### Compliance Readiness

Must confirm:

- KYC Approved
- Bank Accounts Verified
- No Active Compliance Hold

---

### Fund Readiness

Must confirm:

- Minimum Raise Achieved
- Closing Approved
- Admission Complete

---

### Post-Close Activities

Automatically create:

- LP Relationship
- Investor Portal Access
- Capital Call Contacts
- Reporting Preferences

---

# Placement Agent Management

Placement Agents receive controlled access to fundraising opportunities.

The system records:

- Appointment Period
- Territory
- Geography
- Investor Restrictions
- Commission Percentage
- Retainer
- Success Fee
- Protected Period
- Introduced Opportunities
- Supporting Agreement

Commission calculations only apply to opportunities explicitly covered by the appointment.

---

# Pipeline Calculations

## Base Currency Conversion

```
Base Value

=

Transaction Amount

×

Approved FX Rate
```

---

## Gross Pipeline

```
Gross Pipeline

=

Sum of all Qualified Open Opportunities
```

---

## Weighted Pipeline

```
Weighted Pipeline

=

Base Value

×

Stage Probability

×

Confidence Adjustment
```

---

## Fundraising Progress

```
Commitment Progress

=

Signed or Admitted Commitments

/

Fundraising Target

×

100%
```

---

## Asset Management Progress

```
Activated AUM

/

Target AUM

×

100%
```

---

## Coverage Ratio

```
Weighted Open Pipeline

/

Remaining Target
```

---

## Expected Annual Fees

```
Expected AUM

×

Management Fee (bps)

/

10,000

×

Probability
```

---

## Stage Conversion

```
Entered Next Stage

/

Entered Current Stage

×

100%
```

---

## Average Stage Age

```
Total Days

/

Number of Opportunities
```

---

# Forecasting

Forecast dashboards must display:

- Fundraising Target
- Signed Commitments
- Activated AUM
- Gross Pipeline
- Weighted Pipeline
- Remaining Target
- Coverage Ratio
- Expected Monthly Closings
- Expected Quarterly Closings
- Expected Fee Revenue
- Concentration Analysis

---

## Scenario Planning

Supported scenarios include:

- Downside
- Base
- Upside

Scenario assumptions must never modify live opportunity records.

Scenarios exist independently from operational data.

---

# Executive Dashboard (UI Translation)

The Executive Dashboard shown in the UI inspiration should include the following layout.

## Top KPI Cards

Display approximately 6–8 summary cards:

- Fundraising Target
- Pipeline Value
- Weighted Pipeline
- Signed Commitments
- Funded Capital
- Activated AUM
- Expected Revenue
- Coverage Ratio

Cards should display:

- Primary Value
- Percentage Change
- Small Trend Indicator
- Optional Sparkline
- Status Colour

---

## Pipeline Charts

Display interactive visualisations such as:

- Funnel Chart
- Pipeline by Stage
- Commitments by Month
- AUM Growth
- Revenue Forecast
- Opportunity Conversion
- Stage Ageing

---

## Recent Activity Panel

Shows chronological activity including:

- Meetings
- Calls
- New Investors
- New Opportunities
- Documents Signed
- KYC Updates

---

## Upcoming Actions

Dedicated panel showing:

- Today's Meetings
- Overdue Tasks
- Pending Approvals
- Expiring Documents
- Upcoming Closings

---

# Pipeline Kanban Board (UI Translation)

Each pipeline stage is represented by a vertical Kanban column.

Each column header displays:

- Stage Name
- Opportunity Count
- Total Pipeline Value

Each Opportunity Card displays:

- Investor Name
- Fund / Product
- Current Amount
- Owner
- Probability
- Next Action
- Due Date
- Age in Current Stage
- Priority Badge
- Status Chip

Cards should support drag-and-drop.

However, every move must trigger server-side validation before the UI updates.

Failed validations should return a checklist of missing requirements rather than silently rejecting the move.

---

# Investor Directory & 360° Profile (UI Translation)

The Investor Directory serves as the master relationship management workspace.

---

## Page Layout

```
-------------------------------------------------------------
Filters / Search / Saved Views / Export
-------------------------------------------------------------

Investor Table                         |  Investor Drawer
                                       |
                                       |
                                       |
                                       |
-------------------------------------------------------------
```

The screen consists of:

- Search Bar
- Advanced Filters
- Investor Table
- Detail Drawer

The drawer should slide in from the right without navigating away from the page.

---

## Search & Filtering

Supported filters include:

### Organisation

- Investor Name
- Investor Type
- Country
- Jurisdiction

### Commercial

- Estimated AUM
- Ticket Size
- Preferred Asset Class
- Strategy Interest

### Relationship

- Relationship Owner
- Stage
- Campaign
- Source

### Compliance

- KYC Status
- Sanctions Status
- Risk Rating
- Investor Classification

---

## Investor Table

Columns

| Column |
|---------|
| Organisation |
| Type |
| Country |
| Estimated AUM |
| Current Opportunity |
| Stage |
| Relationship Owner |
| Last Contact |
| Next Action |
| Risk Rating |
| KYC |

Users should be able to:

- Sort
- Resize Columns
- Hide Columns
- Save Views
- Export Results
- Bulk Update

---

## Investor Drawer

Opening an investor displays a side drawer containing:

### Summary

- Name
- Investor Type
- Jurisdiction
- Relationship Owner

---

### KPIs

- Total Opportunities
- Total Commitments
- Active Campaigns
- Current AUM

---

### Tabs

The drawer should contain:

```
Overview

Contacts

Pipeline

Meetings

Documents

Communications

Commitments

KYC

Notes

Activity
```

---

# Campaigns & Communications Hub (UI Translation)

This workspace manages all fundraising campaigns.

---

## Dashboard Header

Displays

- Campaign Name
- Campaign Type
- Status
- Owner
- Target Raise
- Progress
- Remaining Target

Actions

- Edit Campaign
- Launch Campaign
- Pause Campaign
- Archive Campaign

---

## Performance Cards

Top summary cards

- Investors Contacted
- Qualified Investors
- Active Opportunities
- Soft Circles
- Signed Commitments
- Funded Capital

---

## Communications Timeline

Display

```
Today

Yesterday

Last Week

Earlier
```

Each activity contains

- Avatar
- User
- Investor
- Type
- Timestamp
- Summary
- Attachments

---

## Marketing Materials

Campaign workspace should include

- Presentations
- Factsheets
- Pitch Decks
- Financial Models
- DDQs
- Legal Documents

Each document shows

- Version
- Status
- Last Updated
- Owner

---

# Commitments & Closings Workspace (UI Translation)

Designed primarily for PE and VC fundraising.

---

## KPI Cards

Display

- Total Commitments
- Signed
- Admitted
- Funded
- Remaining
- Investors

---

## Commitment Register

Columns

| Column |
|---------|
| Investor |
| Fund |
| Currency |
| Commitment |
| Signed |
| Admitted |
| Funded |
| Status |
| Closing |

Users can

- Filter
- Export
- Bulk Admit
- Bulk Update

---

## Closing Timeline

Visual timeline

```
First Close

↓

Interim Close

↓

Second Close

↓

Final Close
```

Each closing card displays

- Date
- Amount
- Investors
- Documents
- Approval Status

---

## Readiness Checklist

Each closing event displays

```
Legal

✔

Compliance

✔

Fund Conditions

✔

Equalisation

Pending

Portal Access

Pending
```

---

# Fundraising Analytics (UI Translation)

Analytics pages should support executive reporting.

---

## Dashboard Sections

### Pipeline Funnel

Shows

```
Target

↓

Qualified

↓

Data Room

↓

Due Diligence

↓

Negotiation

↓

Signed

↓

Funded
```

---

### Geographic Distribution

Interactive world map displaying

- Investor Count
- Capital
- AUM
- Commitments

---

### Source Analysis

Break down opportunities by

- Referral
- Consultant
- Placement Agent
- Direct Outreach
- Conference
- Existing Client

---

### Owner Performance

Leaderboard showing

- Opportunities
- Pipeline
- Closed Value
- Win Rate
- Average Sales Cycle

---

### Stage Ageing

Heatmap identifying

- Bottlenecks
- Slow Opportunities
- Stalled Investors

---

### Forecast Charts

Display

- Monthly Closings
- Quarterly Closings
- Revenue Forecast
- Expected AUM
- Weighted Pipeline

---

# Asset Management Mandates & RFPs (UI Translation)

Primary workspace for institutional mandates.

---

## Page Header

Displays

- Mandate
- Client
- Stage
- Expected AUM
- Deadline
- Relationship Owner

---

## KPI Cards

- Active RFPs
- Submitted
- Won
- Lost
- Expected AUM
- Activated AUM

---

## Mandate Pipeline

```
Target Client

↓

Discovery

↓

Qualified

↓

RFP

↓

Proposal

↓

Presentation

↓

Preferred Bidder

↓

Negotiation

↓

Awarded

↓

Transition

↓

Activated
```

---

## Opportunity Table

Columns

| Column |
|---------|
| Client |
| Strategy |
| Expected AUM |
| Stage |
| Deadline |
| Probability |
| Consultant |
| Owner |

---

## Checklist Panel

Each mandate displays

```
Proposal

✔

Presentation

✔

Investment Committee

✔

Commercial Approval

✔

Legal Review

Pending

KYC

Pending

Agreement

Pending
```

---

## Documents Panel

Grouped into

- Proposal
- Fee Schedule
- Track Record
- Investment Team
- Reporting
- Legal
- Guidelines
- Custody

---

# Reporting

The platform should include predefined reports.

## Fundraising

- Pipeline Summary
- Campaign Performance
- Conversion Rates
- Opportunity Ageing
- Investor Activity

---

## Investor Reports

- Investor Directory
- Relationship Health
- Contact Activity
- Investor Geography
- Investor Classification

---

## Compliance Reports

- KYC Status
- AML Reviews
- Expired Documents
- Sanctions
- Risk Ratings

---

## Commercial Reports

- Expected Fees
- Fee Discounts
- Side Letters
- Commercial Concessions

---

## Mandate Reports

- Expected AUM
- Activated AUM
- RFP Win Rate
- Mandate Pipeline

---

# Security Requirements

Every request must enforce:

- Object-level authorization
- Role-based permissions
- Campaign-level access
- Investor-level access
- Fund-level access
- Product-level access

Additional controls

- MFA
- Encrypted Documents
- Signed URLs
- Download Expiry
- Watermarking
- Audit Logging

Placement Agents may only access explicitly assigned opportunities.

Investors accessing the portal may only view information explicitly shared with them.

---

# Audit Log

Every material action generates an immutable audit record.

Each log entry stores:

- Timestamp
- User
- Role
- IP Address
- Session ID
- Device
- Action
- Object
- Previous Value
- New Value
- Reason

Audit logs cannot be edited or deleted.

---

# Developer Guardrails

Developers must ensure the following rules are never violated:

- Signed documents do not automatically mean a deal is won.
- Signed commitments are not cash received.
- Awarded mandates are not activated AUM.
- Drag-and-drop never bypasses validation.
- Investor organisations are never duplicated.
- Internal notes are never exposed externally.
- Historical amounts and stages are immutable.

---

# Acceptance Criteria

The completed platform must satisfy the following:

- Support Asset Management, Private Equity, and Venture Capital fundraising workflows.
- Allow a single investor organisation to participate in multiple campaigns without duplication.
- Track Indicative, Qualified, Soft Circle, Proposed, Signed, Admitted, Funded, Expected AUM, and Activated AUM as independent values.
- Enforce server-side stage gates and validation.
- Provide Kanban, Table, Dashboard, Analytics, Investor 360, Data Room, Due Diligence, KYC, Mandate, Commitment, and Reporting workspaces.
- Maintain complete history for every stage and amount change.
- Support communications, meetings, tasks, DDQs, secure data rooms, agreements, and electronic signatures.
- Prevent compliance-blocked investors from admission, funding, or activation.
- Enforce approval workflows for commercial concessions and side letters.
- Version-control every agreement and bind signatures to specific document versions.
- Prevent false accounting by separating commitments from cash receipts.
- Support multiple fund closings and institutional mandate onboarding.
- Calculate weighted pipeline using approved FX rates.
- Clearly distinguish Gross Pipeline, Weighted Pipeline, Signed Commitments, Admitted Commitments, Funded Capital, Awarded Mandates, and Activated AUM.
- Restrict external users and placement agents to explicitly assigned records.
- Record every significant action in an immutable audit log.

---

# Final Product Vision

The completed ARCUS Fundraising, Investor Relations & Mandate Origination System is an institutional-grade fundraising and mandate origination platform built for asset managers, private equity firms, and venture capital funds.

The platform combines fundraising CRM, investor relationship management, due diligence, secure document sharing, electronic signatures, commitments, mandate onboarding, forecasting, analytics, compliance, and reporting into a unified workflow while maintaining strict separation between commercial, legal, compliance, accounting, and operational states.
