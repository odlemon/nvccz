# 📧 EMAIL CONFIGURATION & IMPLEMENTATION DOCUMENTATION

## Project: NVCCZ ERP System
**Last Updated:** October 16, 2025

---

## 📋 TABLE OF CONTENTS

1. [Overview](#overview)
2. [Email Service Provider](#email-service-provider)
3. [Configuration & Credentials](#configuration--credentials)
4. [Email Services Architecture](#email-services-architecture)
5. [Email Notification Service](#email-notification-service)
6. [Newsletter Email Service](#newsletter-email-service)
7. [Email Types & Templates](#email-types--templates)
8. [Module-Specific Email Implementations](#module-specific-email-implementations)
9. [Email Templates Design](#email-templates-design)
10. [Error Handling](#error-handling)
11. [Testing Email Functionality](#testing-email-functionality)
12. [Troubleshooting](#troubleshooting)

---

## 1. OVERVIEW

The NVCCZ ERP system uses **ZeptoMail** (by Zoho) as its email service provider for sending transactional emails across multiple modules including:

- 📊 **Investment Module** (12+ email types)
- 💰 **Payroll Module** (payslips)
- 🛒 **Procurement Module** (POs, RFQs, vendor communications)
- 📅 **Events Module** (invitations, RSVPs)
- 📰 **Newsletter Module** (subscriptions, confirmations)
- 💵 **Accounting Module** (planned: statements, invoices)

### Key Statistics

| Metric | Value |
|--------|-------|
| **Total Email Types** | 22+ distinct email notifications |
| **Email Service Provider** | ZeptoMail (Zoho) |
| **Email Services** | 2 (EmailNotificationService, EmailService) |
| **From Address** | `noreply@lysp.io` |
| **Email Template Format** | HTML + Plain Text |
| **Package Used** | `zeptomail` v6.2.1 |

---

## 2. EMAIL SERVICE PROVIDER

### ZeptoMail by Zoho

**Why ZeptoMail?**
- ✅ Reliable transactional email delivery
- ✅ High deliverability rates
- ✅ Simple API integration
- ✅ Part of Zoho ecosystem
- ✅ Cost-effective for transactional emails

**Service Details:**
- **Provider**: Zoho ZeptoMail
- **API URL**: `api.zeptomail.com/`
- **API Version**: Latest
- **Node.js Package**: `zeptomail@6.2.1`

**Package Installation:**
```bash
npm install zeptomail@6.2.1
```

**Package.json Entry:**
```json
{
  "dependencies": {
    "zeptomail": "^6.2.1"
  }
}
```

---

## 3. CONFIGURATION & CREDENTIALS

### 🔐 ZeptoMail Credentials

**Location**: `src/services/EmailNotificationService.ts` (lines 4-7)

```typescript
const zeptoUrl = "api.zeptomail.com/";
const zeptoToken = "Zoho-enczapikey wSsVR61/+xejCqZ6mzOpJuptkQxSVlmgER993FKmuHb7HKiT8MdvxELKDFWmTfJMFmZvRTRAorookUoIgGZa3dUszgsFASiF9mqRe1U4J3x17qnvhDzPX29dmxCAL4wPwQ1jmWVjFc8q+g==";

const zeptoClient = new SendMailClient({ url: zeptoUrl, token: zeptoToken });
```

### ⚠️ CRITICAL SECURITY NOTE

**Current Implementation**: API key is **hardcoded** in the source code.

**SECURITY RISK**: 🔴 HIGH
- API key is visible in version control
- Anyone with repository access can see and use the key
- Key could be leaked publicly

**RECOMMENDED FIX**: Move credentials to environment variables

```typescript
// RECOMMENDED APPROACH
const zeptoUrl = process.env.ZEPTO_MAIL_URL || "api.zeptomail.com/";
const zeptoToken = process.env.ZEPTO_MAIL_TOKEN;

if (!zeptoToken) {
  throw new Error('ZEPTO_MAIL_TOKEN environment variable is required');
}

const zeptoClient = new SendMailClient({ url: zeptoUrl, token: zeptoToken });
```

**env.example** (add these lines):
```bash
# ZeptoMail Configuration
ZEPTO_MAIL_URL="api.zeptomail.com/"
ZEPTO_MAIL_TOKEN="Zoho-enczapikey YOUR_API_KEY_HERE"
ZEPTO_FROM_ADDRESS="noreply@lysp.io"
ZEPTO_FROM_NAME="NVCCZ Notifications"
```

---

### From Address Configuration

**Current Configuration:**
```typescript
from: {
  address: "noreply@lysp.io",
  name: "NVCCZ Investment Team"  // Varies by module
}
```

**From Names by Module:**
| Module | From Name |
|--------|-----------|
| Investment | `NVCCZ Investment Team` |
| Payroll | `NVCCZ Payroll Team` |
| Procurement | `NVCCZ Procurement Team` |
| Finance | `NVCCZ Finance Team` |
| Events | `NVCCZ Events Team` |
| Newsletter | `NVCCZ` |

---

## 4. EMAIL SERVICES ARCHITECTURE

### Two Email Services

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  1. EmailNotificationService.ts (PRIMARY)           │
│     ├─ Investment emails (12+ types)                │
│     ├─ Payroll emails (payslips)                    │
│     ├─ Procurement emails (POs, RFQs, vendors)      │
│     ├─ Events emails (invitations, RSVPs)           │
│     └─ Budget approval emails                       │
│                                                     │
│  2. EmailService.ts (NEWSLETTER ONLY)               │
│     ├─ Newsletter subscription confirmation         │
│     └─ Welcome emails                               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Architecture Decision

**Why Two Services?**
1. **EmailNotificationService**: Uses ZeptoMail for **production** transactional emails
2. **EmailService**: Currently **simulated** (logs only) for newsletter functionality
   - Newsletter emails are not sent in production yet
   - Uses mock/simulation mode with console.log
   - Ready for future ZeptoMail integration

---

## 5. EMAIL NOTIFICATION SERVICE

### File Location
`src/services/EmailNotificationService.ts` (3,180 lines)

### Initialization

```typescript
import { SendMailClient } from "zeptomail";

const zeptoUrl = "api.zeptomail.com/";
const zeptoToken = "Zoho-enczapikey [API_KEY]";

const zeptoClient = new SendMailClient({ url: zeptoUrl, token: zeptoToken });
```

### Email Data Interface

```typescript
export interface EmailNotificationData {
  applicantName: string;
  applicantEmail: string;
  businessName: string;
  applicationId: string;
  currentStage: string;
  additionalInfo?: any;
}
```

---

### Standard Email Sending Pattern

All email methods in `EmailNotificationService` follow this pattern:

```typescript
static async sendExampleEmail(data: EmailNotificationData): Promise<void> {
  try {
    // 1. Define email subject
    const subject = "Example Subject - NVCCZ";
    
    // 2. Get HTML content from template method
    const htmlContent = this.getExampleTemplate(data);
    
    // 3. Send email via ZeptoMail
    await zeptoClient.sendMail({
      from: {
        address: "noreply@lysp.io",
        name: "NVCCZ Team"
      },
      to: [
        {
          email_address: {
            address: data.applicantEmail,
            name: data.applicantName
          }
        }
      ],
      subject: subject,
      htmlbody: htmlContent
    });

    // 4. Log success
    console.log(`Example email sent to ${data.applicantEmail}`);
  } catch (error) {
    // 5. Log and throw error
    console.error("Error sending example email:", error);
    throw error;
  }
}
```

---

## 6. NEWSLETTER EMAIL SERVICE

### File Location
`src/services/EmailService.ts` (232 lines)

### Current Status: 🟡 SIMULATION MODE

```typescript
/**
 * Send double opt-in confirmation email
 */
public async sendConfirmationEmail(email: string, firstName: string | null, confirmationToken: string): Promise<boolean> {
  try {
    const confirmationUrl = `${process.env.FRONTEND_URL || 'https://nvccz-frontend.vercel.app'}/confirm-newsletter?token=${confirmationToken}`;
    
    // ⚠️ NOT ACTUALLY SENT - Only logged
    console.log('📧 Sending confirmation email:', {
      to: email,
      subject: 'Confirm Your Newsletter Subscription',
      confirmationUrl
    });

    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return true;
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    return false;
  }
}
```

### Features

| Feature | Implementation | Status |
|---------|---------------|--------|
| **Double Opt-In** | Confirmation token generation | ✅ Working |
| **Confirmation URL** | Dynamic URL generation | ✅ Working |
| **Welcome Email** | Sent after confirmation | ✅ Working |
| **HTML Templates** | Professional design | ✅ Ready |
| **Actual Sending** | ZeptoMail integration | ❌ Not integrated |

### To Enable Production Newsletter Emails

**Step 1**: Import ZeptoMail in `EmailService.ts`

```typescript
import { SendMailClient } from "zeptomail";

const zeptoUrl = process.env.ZEPTO_MAIL_URL || "api.zeptomail.com/";
const zeptoToken = process.env.ZEPTO_MAIL_TOKEN;
const zeptoClient = new SendMailClient({ url: zeptoUrl, token: zeptoToken });
```

**Step 2**: Replace console.log with actual sending

```typescript
// Replace this:
console.log('📧 Sending confirmation email:', { to: email, subject });

// With this:
await zeptoClient.sendMail({
  from: {
    address: "noreply@lysp.io",
    name: "NVCCZ"
  },
  to: [
    {
      email_address: {
        address: email,
        name: firstName || "Subscriber"
      }
    }
  ],
  subject: emailData.subject,
  htmlbody: emailData.html
});
```

---

## 7. EMAIL TYPES & TEMPLATES

### Complete Email Inventory (22 Types)

#### A. Investment Module (12 emails)

| # | Email Type | Method | Trigger |
|---|-----------|--------|---------|
| 1 | Application Received | `sendApplicationReceivedEmail()` | New application submitted |
| 2 | Application Shortlisted | `sendApplicationShortlistedEmail()` | Application moved to shortlist |
| 3 | Due Diligence Started | `sendDueDiligenceStartedEmail()` | Due diligence initiated |
| 4 | Due Diligence Completed | `sendDueDiligenceCompletedEmail()` | Due diligence finished |
| 5 | Board Review Started | `sendBoardReviewStartedEmail()` | Board review begins |
| 6 | Investment Decision | `sendInvestmentDecisionEmail()` | Board decision made |
| 7 | Application Rejected | `sendApplicationRejectedEmail()` | Application rejected |
| 8 | Term Sheet Created | `sendTermSheetCreatedEmail()` | Term sheet generated |
| 9 | Term Sheet Approved | `sendTermSheetApprovedEmail()` | Term sheet approved |
| 10 | Term Sheet Rejected | `sendTermSheetRejectedEmail()` | Term sheet rejected |
| 11 | Investment Approved + Account | `sendInvestmentApprovedAccountCreatedEmail()` | Account created for investor |
| 12 | Portfolio Company Created | `sendPortfolioCompanyCreatedEmail()` | Added to portfolio |

#### B. Investment Implementation (2 emails)

| # | Email Type | Method | Trigger |
|---|-----------|--------|---------|
| 13 | Implementation Started | `sendInvestmentImplementationStartedEmail()` | Implementation begins |
| 14 | Disbursement Completed | `sendDisbursementCompletedEmail()` | Funds disbursed |

#### C. Payroll Module (1 email)

| # | Email Type | Method | Trigger |
|---|-----------|--------|---------|
| 15 | Payslip | `sendPayslipEmail()` | Payroll run completed |

#### D. Procurement Module (4 emails)

| # | Email Type | Method | Trigger |
|---|-----------|--------|---------|
| 16 | Purchase Order to Vendor | `sendPurchaseOrderToVendor()` | PO sent to vendor |
| 17 | Quotation Accepted | `sendQuotationAcceptedEmail()` | Vendor quotation accepted |
| 18 | Quotation Rejected | `sendQuotationRejectedEmail()` | Vendor quotation rejected |
| 19 | Invoice Paid | `sendInvoicePaidEmail()` | Vendor invoice paid |

#### E. Events Module (3 emails)

| # | Email Type | Method | Trigger |
|---|-----------|--------|---------|
| 20 | Event Invitation | `sendEventInvitationEmail()` | User invited to event |
| 21 | RSVP Notification | `sendRSVPNotificationEmail()` | RSVP received |
| 22 | Budget Approval | `sendBudgetApprovalEmail()` | Event budget approved |

#### F. Newsletter Module (2 emails - SIMULATED)

| # | Email Type | Method | Status |
|---|-----------|--------|--------|
| 23 | Confirmation Email | `sendConfirmationEmail()` | 🟡 Simulated |
| 24 | Welcome Email | `sendWelcomeEmail()` | 🟡 Simulated |

---

## 8. MODULE-SPECIFIC EMAIL IMPLEMENTATIONS

### 8.1 Investment Module

**Controller**: `src/controllers/ApplicationController.ts`

**Email Trigger Logic**:

```typescript
private static async sendStageSpecificEmail(application: any, newStage: string): Promise<void> {
  const emailData = {
    applicantName: application.applicantName,
    applicantEmail: application.applicantEmail,
    businessName: application.businessName,
    applicationId: application.id,
    currentStage: newStage
  };

  switch (newStage) {
    case 'SHORTLISTED':
      await EmailNotificationService.sendApplicationShortlistedEmail(emailData);
      break;
    case 'UNDER_DUE_DILIGENCE':
      await EmailNotificationService.sendDueDiligenceStartedEmail(emailData);
      break;
    case 'DUE_DILIGENCE_COMPLETED':
      await EmailNotificationService.sendDueDiligenceCompletedEmail(emailData);
      break;
    case 'UNDER_BOARD_REVIEW':
      await EmailNotificationService.sendBoardReviewStartedEmail(emailData);
      break;
    case 'BOARD_APPROVED':
      await EmailNotificationService.sendInvestmentDecisionEmail(emailData);
      break;
    case 'BOARD_REJECTED':
      await EmailNotificationService.sendApplicationRejectedEmail(emailData);
      break;
    // ... more cases
  }
}
```

**Example Email Template** (Application Received):

```typescript
private static getApplicationReceivedTemplate(data: EmailNotificationData): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Application Received</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                  color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; background: #f8f9fa; }
        .button { background: #667eea; color: white; padding: 12px 30px; 
                  text-decoration: none; border-radius: 5px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Application Received</h1>
        </div>
        <div class="content">
          <p>Dear ${data.applicantName},</p>
          <p>Thank you for submitting your investment application for <strong>${data.businessName}</strong>.</p>
          <p><strong>Application ID:</strong> ${data.applicationId}</p>
          <p>Our team will review your application within the next 2-3 weeks.</p>
          <p>Best regards,<br>NVCCZ Investment Team</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
```

---

### 8.2 Payroll Module

**Service**: `src/services/PayrollService.ts`

**When Payslips Are Sent:**
- After payroll run is finalized
- One email per employee
- Contains detailed payslip with earnings, deductions, net pay

**Email Trigger**:

```typescript
// In PayrollService
await EmailNotificationService.sendPayslipEmail({
  employee: payslip.employee,
  payrollRun: payrollRun,
  grossPay: payslip.grossPay,
  totalDeductions: payslip.totalDeductions,
  netPay: payslip.netPay,
  currency: payrollRun.currency,
  companyName: 'NVCCZ'
});
```

**Payslip Email Features:**
- ✅ Professional gradient design (purple theme)
- ✅ Company branding
- ✅ Detailed earnings breakdown
- ✅ Deductions itemized (taxes, contributions, loans)
- ✅ Net pay highlighted
- ✅ Currency symbol display
- ✅ Payment date and period
- ✅ Employee details

**Template Preview** (simplified):

```html
<div class="header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
  <h1>PAYSLIP</h1>
  <h2>NVCCZ</h2>
</div>

<div class="content">
  <h2>Pay Period: January 2025</h2>
  
  <table>
    <tr><td>Gross Pay:</td><td>$5,000.00</td></tr>
    <tr><td>Total Deductions:</td><td>$1,200.00</td></tr>
    <tr class="highlight"><td>Net Pay:</td><td>$3,800.00</td></tr>
  </table>
</div>
```

---

### 8.3 Procurement Module

**Service**: `src/services/ProcurementService.ts`

**Purchase Order Email Flow:**

```typescript
static async sendPurchaseOrder(poId: string, sentById: string) {
  // 1. Get PO details
  const purchaseOrder = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { vendor: true, items: true, currency: true }
  });

  // 2. Validate vendor email
  if (!purchaseOrder.vendor.email) {
    throw new Error("Vendor email address is required to send PO");
  }

  // 3. Send email via EmailNotificationService
  await EmailNotificationService.sendPurchaseOrderToVendor({
    vendorName: purchaseOrder.vendor.name,
    vendorEmail: purchaseOrder.vendor.email,
    poNumber: purchaseOrder.poNumber,
    poDate: purchaseOrder.createdAt,
    totalAmount: Number(purchaseOrder.totalAmount),
    currency: purchaseOrder.currency?.code || 'USD',
    items: purchaseOrder.items.map(item => ({
      itemName: item.itemName,
      description: item.description || '',
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      total: Number(item.totalPrice)
    })),
    deliveryAddress: purchaseOrder.shippingAddress,
    expectedDeliveryDate: purchaseOrder.expectedDeliveryDate,
    paymentTerms: purchaseOrder.paymentTerms,
    notes: purchaseOrder.notes,
    companyName: 'NVCCZ'
  });

  // 4. Update PO status
  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: "SENT", sentAt: new Date(), sentById }
  });
}
```

**Vendor Quotation Review Emails:**

```typescript
// In VendorQuotationService.ts
if (action === "ACCEPT") {
  await EmailNotificationService.sendQuotationAcceptedEmail({
    vendorName: quotation.companyName,
    vendorEmail: quotation.vendorEmail,
    quotationNumber: quotation.quotationNumber,
    quotationAmount: Number(quotation.totalAmount),
    currencyCode: quotation.currencyCode,
    reviewNotes
  });
} else {
  await EmailNotificationService.sendQuotationRejectedEmail({
    vendorName: quotation.companyName,
    vendorEmail: quotation.vendorEmail,
    quotationNumber: quotation.quotationNumber,
    quotationAmount: Number(quotation.totalAmount),
    currencyCode: quotation.currencyCode,
    rejectionReason
  });
}
```

---

### 8.4 Events Module

**Service**: `src/services/EventService.ts`

**Event Invitation Email:**

```typescript
await EmailNotificationService.sendEventInvitationEmail({
  recipientName: invitee.name,
  recipientEmail: invitee.email,
  eventTitle: event.title,
  eventDate: event.startDate,
  eventLocation: event.location,
  eventDescription: event.description,
  rsvpUrl: `https://nvccz.io/events/${event.id}/rsvp`
});
```

**RSVP Notification to Organizer:**

```typescript
await EmailNotificationService.sendRSVPNotificationEmail({
  organizerName: event.organizer.name,
  organizerEmail: event.organizer.email,
  eventTitle: event.title,
  attendeeName: rsvp.attendeeName,
  rsvpStatus: rsvp.status,  // ATTENDING, DECLINED, MAYBE
  responseDate: new Date()
});
```

---

## 9. EMAIL TEMPLATES DESIGN

### Design Principles

All email templates follow these design guidelines:

1. **Responsive Design**: Works on mobile, tablet, desktop
2. **Inline CSS**: All styles inline for email client compatibility
3. **Gradient Headers**: Modern purple gradient (`#667eea` to `#764ba2`)
4. **Clean Typography**: Arial, sans-serif for universal compatibility
5. **Clear CTAs**: Prominent buttons with hover effects
6. **Professional Footer**: Company branding and contact info
7. **Accessibility**: High contrast, readable font sizes

### Standard Template Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Title</title>
  <style>
    /* Responsive styles */
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
              color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; background: #f8f9fa; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>Email Title</h1>
    </div>
    
    <!-- Content -->
    <div class="content">
      <p>Email content goes here...</p>
    </div>
    
    <!-- Footer -->
    <div class="footer">
      <p>© 2025 NVCCZ. All rights reserved.</p>
      <p>Contact: support@nvccz.co.zw</p>
    </div>
  </div>
</body>
</html>
```

### Color Scheme

| Element | Color | Hex Code |
|---------|-------|----------|
| **Primary Gradient Start** | Purple | `#667eea` |
| **Primary Gradient End** | Deep Purple | `#764ba2` |
| **Text Color** | Dark Gray | `#333333` |
| **Background** | Light Gray | `#f8f9fa` |
| **Button** | Purple | `#667eea` |
| **Button Hover** | Darker Purple | `#5568d3` |
| **Success** | Green | `#28a745` |
| **Warning** | Orange | `#ffc107` |
| **Danger** | Red | `#dc3545` |

---

## 10. ERROR HANDLING

### Standard Error Handling Pattern

All email methods implement try-catch error handling:

```typescript
static async sendExampleEmail(data: EmailNotificationData): Promise<void> {
  try {
    // Email sending logic
    await zeptoClient.sendMail({ /* ... */ });
    console.log(`✅ Email sent to ${data.applicantEmail}`);
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;  // Re-throw to allow caller to handle
  }
}
```

### Error Handling in Controllers

**Pattern 1: Log and Continue** (don't fail operation if email fails)

```typescript
// In BoardReviewController
try {
  await EmailNotificationService.sendBoardReviewStartedEmail(emailData);
  logger.info("Board review email sent successfully");
} catch (emailError) {
  logger.error("Failed to send board review email", {
    error: emailError.message
  });
  // Don't fail the board review creation if email fails
}
```

**Pattern 2: Log Warning and Continue**

```typescript
// In VendorQuotationService
try {
  await EmailNotificationService.sendQuotationAcceptedEmail(data);
  console.log("✅ Acceptance email sent to vendor");
} catch (emailError: any) {
  console.error("⚠️  Failed to send email notification:", emailError.message);
  // Don't fail the entire operation if email fails
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| **Invalid API Token** | Wrong or expired token | Regenerate token in Zoho |
| **Invalid Email Address** | Malformed recipient email | Validate email format before sending |
| **Rate Limit Exceeded** | Too many emails sent | Implement rate limiting/queue |
| **Network Error** | Connection timeout | Retry with exponential backoff |
| **Template Error** | Missing data in template | Validate data before template rendering |

---

## 11. TESTING EMAIL FUNCTIONALITY

### Development Testing

**Option 1: Console Log Review** (Current Implementation)

All emails log to console:
```
✅ Purchase Order PO-1729012345-123 sent to vendor@example.com
✅ Payslip email sent to john.doe@company.com
```

**Option 2: Email Interception Tools**

Use tools like **Mailtrap** or **Mailhog** for development:

```typescript
// Development mode
const zeptoClient = process.env.NODE_ENV === 'development'
  ? new MailtrapClient({ /* ... */ })
  : new SendMailClient({ url: zeptoUrl, token: zeptoToken });
```

**Option 3: Test Email Address**

Send all development emails to a test inbox:

```typescript
const recipientEmail = process.env.NODE_ENV === 'development'
  ? 'test@yourdomain.com'
  : data.applicantEmail;
```

---

### Manual Testing Checklist

#### Investment Emails

```bash
# 1. Create application (should send "Application Received" email)
POST /api/applications
{
  "applicantEmail": "test@example.com",
  "applicantName": "Test User",
  "businessName": "Test Business"
}

# 2. Change stage to SHORTLISTED (should send "Shortlisted" email)
PUT /api/applications/:id/stage
{
  "newStage": "SHORTLISTED"
}
```

#### Procurement Emails

```bash
# 1. Create and send PO (should send email to vendor)
POST /api/procurement/purchase-orders/:id/send

# 2. Review quotation (should send acceptance/rejection email)
PUT /api/vendor-quotations/:id/review
{
  "action": "ACCEPT",
  "reviewNotes": "Accepted"
}
```

#### Payroll Emails

```bash
# Generate payslip (should send email to employee)
POST /api/payroll/runs/:runId/finalize
```

---

## 12. TROUBLESHOOTING

### Issue 1: Emails Not Sending

**Symptoms:**
- No emails received
- Console shows error messages

**Debug Steps:**

```typescript
// Add detailed logging
console.log("📧 Attempting to send email...");
console.log("From:", from);
console.log("To:", to);
console.log("Subject:", subject);

try {
  const result = await zeptoClient.sendMail({ /* ... */ });
  console.log("✅ ZeptoMail response:", result);
} catch (error) {
  console.error("❌ ZeptoMail error:", {
    message: error.message,
    response: error.response?.data,
    status: error.response?.status
  });
}
```

**Common Causes:**
1. ❌ Invalid API token
2. ❌ Email address not verified in ZeptoMail
3. ❌ API rate limits exceeded
4. ❌ Network connectivity issues
5. ❌ Invalid recipient email format

---

### Issue 2: Emails Going to Spam

**Symptoms:**
- Emails delivered but in spam folder

**Solutions:**

1. **SPF Record**: Add SPF record for `lysp.io` domain
   ```
   v=spf1 include:zeptomail.net ~all
   ```

2. **DKIM**: Configure DKIM in ZeptoMail dashboard

3. **DMARC**: Add DMARC record
   ```
   v=DMARC1; p=none; rua=mailto:dmarc@lysp.io
   ```

4. **Sender Reputation**: Ensure consistent "From" address

---

### Issue 3: Template Not Rendering

**Symptoms:**
- Email received but looks broken
- Missing data in template

**Debug Template**:

```typescript
private static getExampleTemplate(data: EmailNotificationData): string {
  // Log data before rendering
  console.log("Template data:", JSON.stringify(data, null, 2));
  
  // Validate required fields
  if (!data.applicantName) {
    console.warn("⚠️  Missing applicantName in template data");
  }
  
  const template = `
    <!DOCTYPE html>
    <html>
      <body>
        <p>Hello ${data.applicantName || 'User'},</p>
      </body>
    </html>
  `;
  
  return template;
}
```

---

### Issue 4: API Key Exposed in Logs

**Problem**: API key visible in error logs or version control

**Solutions:**

1. **Move to Environment Variables** (as shown in Section 3)

2. **Add to .gitignore**:
   ```
   .env
   .env.local
   .env.*.local
   ```

3. **Rotate API Key**: If exposed, regenerate in ZeptoMail dashboard

4. **Use Secret Management**: For production, use AWS Secrets Manager, Azure Key Vault, etc.

---

### Issue 5: Performance Issues (Slow Email Sending)

**Symptoms:**
- API requests take long time
- Timeouts when sending emails

**Solutions:**

1. **Async/Background Jobs**: Use queue system (Bull, Agenda)

```typescript
// Instead of:
await EmailNotificationService.sendPayslipEmail(data);

// Use:
await emailQueue.add('send-payslip', { payslipData: data });
```

2. **Batch Sending**: Send multiple emails in one API call (if supported)

3. **Error Handling**: Don't let email failures block critical operations

```typescript
// Fire and forget pattern
EmailNotificationService.sendPayslipEmail(data)
  .catch(error => {
    logger.error("Failed to send payslip email", { error, employeeId });
  });
```

---

## 📊 SUMMARY

### Email System Statistics

| Metric | Value |
|--------|-------|
| **Email Service Provider** | ZeptoMail (Zoho) |
| **API Package** | `zeptomail@6.2.1` |
| **Total Email Types** | 24 (22 production + 2 simulated) |
| **Email Services** | 2 files (3,180 + 232 lines) |
| **Modules Using Emails** | 6 (Investment, Payroll, Procurement, Events, Newsletter, Budget) |
| **From Address** | `noreply@lysp.io` |
| **Template Format** | HTML with inline CSS |
| **Error Handling** | Try-catch with logging |

---

### Current Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| **Investment Emails** | ✅ Production | 12 email types |
| **Payroll Emails** | ✅ Production | Payslip distribution |
| **Procurement Emails** | ✅ Production | PO, RFQ, vendor communications |
| **Events Emails** | ✅ Production | Invitations, RSVPs |
| **Budget Emails** | ✅ Production | Approval notifications |
| **Newsletter Emails** | 🟡 Simulated | Ready for integration |
| **Statement Emails** | 🔴 Planned | TODO in StatementOfAccountService |
| **Invoice Emails** | 🔴 Planned | Customer invoice notifications |

---

### Best Practices ✅

1. ✅ **Consistent From Address**: All emails from `noreply@lysp.io`
2. ✅ **Professional Templates**: HTML with gradient design
3. ✅ **Error Handling**: Comprehensive try-catch blocks
4. ✅ **Logging**: All emails logged for debugging
5. ✅ **Non-Blocking**: Email failures don't break operations
6. ⚠️ **Security**: API key should be moved to environment variables
7. ✅ **Responsive Design**: Email templates work on all devices
8. ✅ **Module Separation**: Clear email responsibilities per module

---

### Recommended Improvements 🔧

1. **Move API Key to Environment Variables** (HIGH PRIORITY - Security)
2. **Implement Email Queue System** (Bull/Agenda for scalability)
3. **Add Email Templates Repository** (Centralized template management)
4. **Enable Newsletter Production Emails** (Integrate ZeptoMail)
5. **Add Email Analytics** (Open rates, click tracking)
6. **Implement Email Preferences** (Allow users to opt-out of certain emails)
7. **Add Rate Limiting** (Prevent API quota exhaustion)
8. **Create Email Testing Suite** (Automated email tests)
9. **Add Retry Logic** (Exponential backoff for failed emails)
10. **Implement Email Audit Log** (Track all sent emails in database)

---

## 🔗 ADDITIONAL RESOURCES

### ZeptoMail Documentation
- [ZeptoMail API Docs](https://www.zoho.com/zeptomail/help/api/)
- [Node.js SDK](https://www.zoho.com/zeptomail/help/nodejs-sdk.html)
- [Authentication](https://www.zoho.com/zeptomail/help/api-authentication.html)

### Related Documentation
- `INVESTMENT_EMAIL_NOTIFICATIONS_IMPLEMENTATION.md` - Investment email details
- `PROCUREMENT_END_TO_END_TESTING_GUIDE.md` - Procurement workflow including emails
- `PAYROLL_MODULE_API_DOCS.md` - Payroll payslip emails

### Email Best Practices
- [Email Template Design](https://mailchimp.com/resources/email-design-guide/)
- [Transactional Email Best Practices](https://postmarkapp.com/guides)
- [Email Deliverability](https://sendgrid.com/blog/email-deliverability-best-practices/)

---

**Documentation Prepared By**: AI Assistant  
**Project**: NVCCZ ERP System  
**Date**: October 16, 2025  
**Status**: ✅ Comprehensive Documentation Complete  
**Security Status**: ⚠️ API Key Hardcoded (Needs Environment Variable Migration)





