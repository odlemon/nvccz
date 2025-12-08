# 📧 Complete Email Configuration Occurrences Report

**Generated for**: NVCCZ ERP System  
**Purpose**: Comprehensive list of all email configuration occurrences for upcoming refactoring

---

## 🔴 CRITICAL: API Keys & URLs (2 Locations)

### Location 1: `src/services/EmailNotificationService.ts`
- **Lines 4-7**: ZeptoMail API configuration
  ```typescript
  const zeptoUrl = "api.zeptomail.com/";
  const zeptoToken = "Zoho-enczapikey wSsVR61/+xejCqZ6mzOpJuptkQxSVlmgER993FKmuHb7HKiT8MdvxELKDFWmTfJMFmZvRTRAorookUoIgGZa3dUszgsFASiF9mqRe1U4J3x17qnvhDzPX29dmxCAL4wPwQ1jmWVjFc8q+g==";
  const zeptoClient = new SendMailClient({ url: zeptoUrl, token: zeptoToken });
  ```
- **Status**: 🔴 HARDCODED - Must be moved to environment variables

### Location 2: `src/services/UserService.ts`
- **Lines 8-11**: ZeptoMail API configuration (DUPLICATE)
  ```typescript
  // Email configuration
  const zeptoUrl = "api.zeptomail.com/";
  const zeptoToken = "Zoho-enczapikey wSsVR61/+xejCqZ6mzOpJuptkQxSVlmgER993FKmuHb7HKiT8MdvxELKDFWmTfJMFmZvRTRAorookUoIgGZa3dUszgsFASiF9mqRe1U4J3x17qnvhDzPX29dmxCAL4wPwQ1jmWVjFc8q+g==";
  const zeptoClient = new SendMailClient({ url: zeptoUrl, token: zeptoToken });
  ```
- **Status**: 🔴 HARDCODED - Must be moved to environment variables

---

## 📧 From Address: `"noreply@lysp.io"` (42 Occurrences)

### File: `src/services/EmailNotificationService.ts`

#### Investment Module Emails (41 occurrences of `noreply@lysp.io`):

1. **Line 29**: `sendApplicationReceivedEmail()` - Investment application received
2. **Line 61**: `sendDueDiligenceStartedEmail()` - Due diligence started
3. **Line 93**: `sendDueDiligenceCompletedEmail()` - Due diligence completed
4. **Line 132**: `sendBoardReviewStartedEmail()` - Board review started
5. **Line 173**: `sendBoardReviewCompletedEmail()` - Board review completed
6. **Line 215**: `sendInvestmentDecisionEmail()` - Investment decision
7. **Line 247**: `sendTermSheetSentEmail()` - Term sheet sent
8. **Line 282**: `sendTermSheetSignedEmail()` - Term sheet signed
9. **Line 320**: `sendImplementationStartedEmail()` - Implementation started
10. **Line 365**: `sendStageUpdateEmail()` - Stage update
11. **Line 409**: `sendRFQEmailToVendor()` - RFQ to vendor (Procurement)
12. **Line 453**: `sendVendorQuotationReceivedEmail()` - Vendor quotation received
13. **Line 490**: `sendPurchaseOrderEmail()` - Purchase order sent
14. **Line 516**: `sendVendorInvoiceReceivedEmail()` - Vendor invoice received
15. **Line 548**: `sendPaymentConfirmationEmail()` - Payment confirmation
16. **Line 580**: `sendGRNEmail()` - GRN notification
17. **Line 623**: `sendPayslipEmail()` - Payslip email (Payroll)
18. **Line 672**: `sendEventInvitationEmail()` - Event invitation (Events)
19. **Line 704**: `sendEventReminderEmail()` - Event reminder (Events)
20. **Line 736**: `sendEventRSVPConfirmationEmail()` - RSVP confirmation (Events)
21. **Line 768**: `sendBudgetApprovalEmail()` - Budget approval (Finance)
22. **Line 800**: `sendBudgetRejectionEmail()` - Budget rejection (Finance)
23. **Line 832**: `sendBudgetPendingEmail()` - Budget pending (Finance)
24. **Line 2247**: `sendPayslipEmail()` - Payslip email (Payroll) - Duplicate method?
25. **Line 2498**: `sendEventInvitationEmail()` - Event invitation (Events) - Duplicate method?
26. **Line 2530**: `sendEventReminderEmail()` - Event reminder (Events) - Duplicate method?
27. **Line 2562**: `sendBudgetApprovalEmail()` - Budget approval (Finance) - Duplicate method?
28. **Line 2939**: `sendRFQEmailToVendor()` - RFQ to vendor (Procurement)
29. **Line 2980**: `sendVendorQuotationReceivedEmail()` - Vendor quotation received (Procurement)
30. **Line 3020**: `sendPurchaseOrderEmail()` - Purchase order sent (Procurement)
31. **Line 3061**: `sendVendorInvoiceReceivedEmail()` - Vendor invoice received (Procurement)
32. **Line 3105**: `sendPaymentConfirmationEmail()` - Payment confirmation (Procurement)
33. **Line 3149**: `sendGRNEmail()` - GRN notification (Procurement)
34. **Line 3191**: `sendVendorInvoiceApprovedEmail()` - Vendor invoice approved (Procurement)
35. **Line 3233**: `sendVendorInvoiceRejectedEmail()` - Vendor invoice rejected (Procurement)
36. **Line 3278**: `sendVendorInvoicePendingEmail()` - Vendor invoice pending (Procurement)
37. **Line 3329**: `sendVendorPaymentProcessedEmail()` - Vendor payment processed (Procurement)

#### Special Case - Different Domain (1 occurrence):

38. **Line 2154**: `sendDisbursementCompletedEmail()` - Uses `"noreply@nvccz.co.zw"` instead!
   ```typescript
   from: { address: "noreply@nvccz.co.zw", name: "NVCCZ Investment Platform" }
   ```
   - **Note**: This is INCONSISTENT - uses different domain!

### File: `src/services/UserService.ts`

39. **Line 236**: Password reset email
   ```typescript
   address: "noreply@lysp.io"
   ```

---

## 👤 From Names (Hardcoded in Multiple Places)

### File: `src/services/EmailNotificationService.ts`

#### "NVCCZ Investment Team" (40+ occurrences):
- Used in all Investment module emails
- Appears in email headers (from.name) and email template content
- **Lines**: 30, 62, 94, 133, 174, 216, 248, 283, 321, 366, 454, 491, 517, 549, 581, 624, 673, 705, 737, 769, 801, 833
- **Template content lines**: 875, 905, 935, 969, 1026, 1082, 1149, 1178, 1202, 1232, 1263, 1445, 1478, 1508, 1538, 1568, 1611, 1698, 1748, 1778, 1823, 1853, 1883, 1913, 1943, 2015, 2045, 2082, 2112, 2133, 2225

#### "NVCCZ Investment Platform" (2 occurrences):
- **Line 2154**: `sendDisbursementCompletedEmail()` - from.name
- **Line 2190**: Email template header

#### "NVCCZ Payroll Team" (1 occurrence):
- **Line 2248**: `sendPayslipEmail()` - from.name

#### "NVCCZ Events Team" (2 occurrences):
- **Line 2499**: `sendEventInvitationEmail()` - from.name
- **Line 2531**: `sendEventReminderEmail()` - from.name
- **Template content lines**: 2713, 2811

#### "NVCCZ Finance Team" (1 occurrence):
- **Line 2563**: `sendBudgetApprovalEmail()` - from.name
- **Template content lines**: 2879, 2898

#### "NVCCZ Procurement Team" (Dynamic - 4 occurrences):
- **Lines 2940, 2981, 3021, 3330**: Uses `data.companyName || "NVCCZ Procurement Team"`
- **Template content line**: 3837

#### "NVCCZ Finance Team" (Dynamic - 2 occurrences):
- **Lines 3062, 3106**: Uses `data.companyName || "NVCCZ Finance Team"`

### File: `src/services/UserService.ts`

#### "NVCCZ IT Team" (1 occurrence):
- **Line 237**: Password reset email - from.name

### File: `src/services/EmailService.ts`

#### "The NVCCZ Team" (2 occurrences):
- **Line 191**: Welcome email template
- **Line 222**: Welcome email text template

---

## 📊 Summary Statistics

| Configuration Item | Total Occurrences | Files Affected |
|-------------------|------------------|----------------|
| **ZeptoMail API Key** | 2 | EmailNotificationService.ts, UserService.ts |
| **ZeptoMail URL** | 2 | EmailNotificationService.ts, UserService.ts |
| **From Address: noreply@lysp.io** | 42 | EmailNotificationService.ts (41), UserService.ts (1) |
| **From Address: noreply@nvccz.co.zw** | 1 | EmailNotificationService.ts (inconsistent!) |
| **From Name: NVCCZ Investment Team** | 40+ | EmailNotificationService.ts |
| **From Name: NVCCZ Payroll Team** | 1 | EmailNotificationService.ts |
| **From Name: NVCCZ Events Team** | 2 | EmailNotificationService.ts |
| **From Name: NVCCZ Finance Team** | 3 | EmailNotificationService.ts |
| **From Name: NVCCZ Procurement Team** | 4 | EmailNotificationService.ts |
| **From Name: NVCCZ Investment Platform** | 2 | EmailNotificationService.ts |
| **From Name: NVCCZ IT Team** | 1 | UserService.ts |
| **From Name: The NVCCZ Team** | 2 | EmailService.ts |

---

## 🔍 Detailed Line-by-Line Breakdown

### `src/services/EmailNotificationService.ts`

#### API Configuration (Lines 1-7):
```typescript
//@ts-nocheck
import { SendMailClient } from "zeptomail";

const zeptoUrl = "api.zeptomail.com/";
const zeptoToken = "Zoho-enczapikey wSsVR61/+xejCqZ6mzOpJuptkQxSVlmgER993FKmuHb7HKiT8MdvxELKDFWmTfJMFmZvRTRAorookUoIgGZa3dUszgsFASiF9mqRe1U4J3x17qnvhDzPX29dmxCAL4wPwQ1jmWVjFc8q+g==";

const zeptoClient = new SendMailClient({ url: zeptoUrl, token: zeptoToken });
```

#### Email Send Calls with From Address:

1. **Line 27-31**: `sendApplicationReceivedEmail()`
   - `address: "noreply@lysp.io"`
   - `name: "NVCCZ Investment Team"`

2. **Line 59-63**: `sendDueDiligenceStartedEmail()`
   - `address: "noreply@lysp.io"`
   - `name: "NVCCZ Investment Team"`

3. **Line 91-95**: `sendDueDiligenceCompletedEmail()`
   - `address: "noreply@lysp.io"`
   - `name: "NVCCZ Investment Team"`

4. **Line 130-134**: `sendBoardReviewStartedEmail()`
   - `address: "noreply@lysp.io"`
   - `name: "NVCCZ Investment Team"`

5. **Line 171-175**: `sendBoardReviewCompletedEmail()`
   - `address: "noreply@lysp.io"`
   - `name: "NVCCZ Investment Team"`

6. **Line 213-217**: `sendInvestmentDecisionEmail()`
   - `address: "noreply@lysp.io"`
   - `name: "NVCCZ Investment Team"`

7. **Line 245-249**: `sendTermSheetSentEmail()`
   - `address: "noreply@lysp.io"`
   - `name: "NVCCZ Investment Team"`

8. **Line 280-284**: `sendTermSheetSignedEmail()`
   - `address: "noreply@lysp.io"`
   - `name: "NVCCZ Investment Team"`

9. **Line 318-322**: `sendImplementationStartedEmail()`
   - `address: "noreply@lysp.io"`
   - `name: "NVCCZ Investment Team"`

10. **Line 363-367**: `sendStageUpdateEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

11. **Line 407-411**: `sendRFQEmailToVendor()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Procurement Team"`

12. **Line 451-455**: `sendVendorQuotationReceivedEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

13. **Line 488-492**: `sendPurchaseOrderEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

14. **Line 514-518**: `sendVendorInvoiceReceivedEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

15. **Line 546-550**: `sendPaymentConfirmationEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

16. **Line 578-582**: `sendGRNEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

17. **Line 621-625**: `sendPayslipEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

18. **Line 670-674**: `sendEventInvitationEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

19. **Line 702-706**: `sendEventReminderEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

20. **Line 734-738**: `sendEventRSVPConfirmationEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

21. **Line 766-770**: `sendBudgetApprovalEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

22. **Line 798-802**: `sendBudgetRejectionEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

23. **Line 830-834**: `sendBudgetPendingEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

24. **Line 2153-2155**: `sendDisbursementCompletedEmail()` ⚠️ **INCONSISTENT**
    - `address: "noreply@nvccz.co.zw"` ← **DIFFERENT DOMAIN!**
    - `name: "NVCCZ Investment Platform"`

25. **Line 2245-2249**: `sendPayslipEmail()` (duplicate method?)
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Payroll Team"`

26. **Line 2496-2500**: `sendEventInvitationEmail()` (duplicate method?)
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Events Team"`

27. **Line 2528-2532**: `sendEventReminderEmail()` (duplicate method?)
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Events Team"`

28. **Line 2560-2564**: `sendBudgetApprovalEmail()` (duplicate method?)
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Finance Team"`

29. **Line 2937-2941**: `sendRFQEmailToVendor()` (duplicate method?)
    - `address: "noreply@lysp.io"`
    - `name: data.companyName || "NVCCZ Procurement Team"`

30. **Line 2978-2982**: `sendVendorQuotationReceivedEmail()` (duplicate method?)
    - `address: "noreply@lysp.io"`
    - `name: data.companyName || "NVCCZ Procurement Team"`

31. **Line 3018-3022**: `sendPurchaseOrderEmail()` (duplicate method?)
    - `address: "noreply@lysp.io"`
    - `name: data.companyName || "NVCCZ Procurement Team"`

32. **Line 3059-3063**: `sendVendorInvoiceReceivedEmail()` (duplicate method?)
    - `address: "noreply@lysp.io"`
    - `name: data.companyName || "NVCCZ Finance Team"`

33. **Line 3103-3107**: `sendPaymentConfirmationEmail()` (duplicate method?)
    - `address: "noreply@lysp.io"`
    - `name: data.companyName || "NVCCZ Finance Team"`

34. **Line 3147-3151**: `sendGRNEmail()` (duplicate method?)
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

35. **Line 3189-3193**: `sendVendorInvoiceApprovedEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

36. **Line 3231-3235**: `sendVendorInvoiceRejectedEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

37. **Line 3276-3280**: `sendVendorInvoicePendingEmail()`
    - `address: "noreply@lysp.io"`
    - `name: "NVCCZ Investment Team"`

38. **Line 3327-3331**: `sendVendorPaymentProcessedEmail()`
    - `address: "noreply@lysp.io"`
    - `name: data.companyName || "NVCCZ Procurement Team"`

### `src/services/UserService.ts`

#### API Configuration (Lines 8-11):
```typescript
// Email configuration
const zeptoUrl = "api.zeptomail.com/";
const zeptoToken = "Zoho-enczapikey wSsVR61/+xejCqZ6mzOpJuptkQxSVlmgER993FKmuHb7HKiT8MdvxELKDFWmTfJMFmZvRTRAorookUoIgGZa3dUszgsFASiF9mqRe1U4J3x17qnvhDzPX29dmxCAL4wPwQ1jmWVjFc8q+g==";
const zeptoClient = new SendMailClient({ url: zeptoUrl, token: zeptoToken });
```

#### Email Send Call (Line 234-238):
```typescript
await zeptoClient.sendMail({
  from: {
    address: "noreply@lysp.io",
    name: "NVCCZ IT Team"
  },
  // ... rest of email
});
```

---

## 🎯 Refactoring Checklist

When implementing centralized email configuration, update:

- [ ] **API Configuration** (2 files):
  - [ ] `src/services/EmailNotificationService.ts` (lines 4-7)
  - [ ] `src/services/UserService.ts` (lines 8-11)

- [ ] **From Address** (42 occurrences):
  - [ ] All 41 occurrences in `EmailNotificationService.ts`
  - [ ] 1 occurrence in `UserService.ts`
  - [ ] Fix inconsistent `noreply@nvccz.co.zw` at line 2154

- [ ] **From Names** (50+ occurrences):
  - [ ] "NVCCZ Investment Team" (40+ occurrences)
  - [ ] "NVCCZ Payroll Team" (1 occurrence)
  - [ ] "NVCCZ Events Team" (2 occurrences)
  - [ ] "NVCCZ Finance Team" (3 occurrences)
  - [ ] "NVCCZ Procurement Team" (4 occurrences)
  - [ ] "NVCCZ Investment Platform" (2 occurrences)
  - [ ] "NVCCZ IT Team" (1 occurrence)
  - [ ] "The NVCCZ Team" (2 occurrences in EmailService.ts)

- [ ] **Environment Variables**:
  - [ ] Add to `env.example`
  - [ ] Add to `.env` (if exists)
  - [ ] Update deployment configs (Vercel, etc.)

- [ ] **Documentation**:
  - [ ] Update `EMAIL_CONFIGURATION_DOCUMENTATION.md`
  - [ ] Update any deployment guides

---

## ⚠️ Important Notes

1. **Inconsistency Found**: Line 2154 uses `"noreply@nvccz.co.zw"` instead of `"noreply@lysp.io"`. This needs to be standardized.

2. **Duplicate Methods**: There appear to be duplicate email methods (e.g., `sendPayslipEmail()` appears at lines 621 and 2247). These should be consolidated.

3. **Security Risk**: API keys are hardcoded and visible in version control. This is a **HIGH PRIORITY** security issue.

4. **Maintenance Burden**: Changing the email domain requires updating 42+ locations manually. Centralization will fix this.

---

**Last Updated**: Current  
**Total Files to Update**: 3 (EmailNotificationService.ts, UserService.ts, EmailService.ts)  
**Total Occurrences to Replace**: 90+ (API configs, from addresses, from names)

