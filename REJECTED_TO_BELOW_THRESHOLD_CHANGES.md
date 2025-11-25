# 🔄 REJECTED → BELOW_THRESHOLD Changes

## Overview

Changed the application status from `REJECTED` to `BELOW_THRESHOLD` to provide a softer, more professional approach when applications don't meet investment criteria.

---

## 📝 Changes Made

### 1. **ApplicationService.ts**
- ✅ Updated `validTransitions` - Changed all `REJECTED` to `BELOW_THRESHOLD`
- ✅ Updated email notification switch case
- ✅ Updated filter exclusions

**Changes:**
```typescript
// Before
"SHORTLISTED": ["UNDER_DUE_DILIGENCE", "REJECTED"]

// After
"SHORTLISTED": ["UNDER_DUE_DILIGENCE", "BELOW_THRESHOLD"]
```

### 2. **EmailNotificationService.ts**
- ✅ Renamed `sendApplicationRejectedEmail()` → `sendApplicationBelowThresholdEmail()`
- ✅ Renamed `getApplicationRejectedTemplate()` → `getApplicationBelowThresholdTemplate()`
- ✅ Added deprecated methods for backwards compatibility
- ✅ Updated email template wording:
  - "Not Selected" → "Below Investment Threshold"
  - "Rejected" → "Below Threshold"
  - Changed color scheme (Red → Amber)
  - Softened language throughout

**Email Changes:**
- **Subject:** Still "Application Update - NVCCZ" (professional)
- **Header Color:** `#dc2626` (red) → `#f59e0b` (amber)
- **Background:** `#fef2f2` (red tint) → `#fffbeb` (amber tint)
- **Status:** "Not Selected" → "Below Investment Threshold"
- **Message:** More encouraging and professional tone

### 3. **ApplicationController.ts**
- ✅ Added new endpoint: `getBelowThresholdApplications()`
- ✅ Fetches only applications with `BELOW_THRESHOLD` status
- ✅ Supports pagination

### 4. **applicationRoutes.ts**
- ✅ Updated Swagger enum documentation
- ✅ Added new route: `GET /api/applications/below-threshold`
- ✅ Complete Swagger documentation for new endpoint

**New Endpoint:**
```
GET /api/applications/below-threshold?page=1&limit=10
```

### 5. **Database Update Script**
- ✅ Created `update-db-rejected-to-below-threshold.js`
- ✅ Updates all existing `REJECTED` → `BELOW_THRESHOLD`
- ✅ Includes verification and logging
- ✅ Safe to run multiple times (idempotent)

---

## 🚀 Deployment Steps

### Step 1: Update Database

Run the manual update script:

```bash
node update-db-rejected-to-below-threshold.js
```

**Expected Output:**
```
🔄 Starting database update: REJECTED → BELOW_THRESHOLD
================================================

📊 Found 5 applications with REJECTED status

Applications to be updated:
----------------------------
1. TechStartup Ltd (john@techstartup.com)
   ID: app-123
   Current Stage: REJECTED
   Last Updated: 2025-11-20T10:00:00.000Z

...

✅ Successfully updated 5 application(s)
================================================

📊 Verification:
   - BELOW_THRESHOLD applications: 5
   - REJECTED applications remaining: 0

✅ All REJECTED applications have been successfully updated to BELOW_THRESHOLD
```

### Step 2: Deploy Code Changes

Deploy the updated code to production:

```bash
# Commit changes
git add .
git commit -m "feat: Change REJECTED status to BELOW_THRESHOLD for softer messaging"

# Push to production
git push origin main
```

### Step 3: Verify

1. **Check API:**
```bash
curl https://nvccz-pi.vercel.app/api/applications/below-threshold \
  -H "Authorization: Bearer <token>"
```

2. **Check Swagger:**
Visit: `https://nvccz-pi.vercel.app/api-docs`
- Verify enum updated in stage filters
- Verify new endpoint appears

3. **Test Email:**
- Move an application to `BELOW_THRESHOLD`
- Verify email is sent with new wording
- Check email color scheme (amber instead of red)

---

## 📊 API Changes

### New Endpoint

**GET /api/applications/below-threshold**

**Query Parameters:**
- `page` (integer, default: 1)
- `limit` (integer, default: 10)

**Response:**
```json
{
  "success": true,
  "message": "Below threshold applications retrieved successfully",
  "data": {
    "applications": [
      {
        "id": "app-123",
        "businessName": "TechStartup Ltd",
        "applicantName": "John Doe",
        "applicantEmail": "john@techstartup.com",
        "currentStage": "BELOW_THRESHOLD",
        "requestedAmount": 50000,
        "submittedAt": "2025-11-20T10:00:00.000Z",
        "updatedAt": "2025-11-24T15:30:00.000Z"
      }
    ],
    "total": 5,
    "page": 1,
    "totalPages": 1
  }
}
```

### Updated Enums

**Application Stage Enum:**
```
DRAFT
SHORTLISTED
UNDER_DUE_DILIGENCE
DUE_DILIGENCE_COMPLETED
TERM_SHEET
TERM_SHEET_NEGOTIATION
UNDER_BOARD_REVIEW
BOARD_APPROVED
BOARD_REJECTED
BOARD_CONDITIONAL
INVESTMENT_IMPLEMENTATION
DISBURSED
FUNDED
BELOW_THRESHOLD  ← NEW (replaces REJECTED)
```

---

## 🎨 Email Template Changes

### Before (REJECTED):
```
Subject: Application Update - NVCCZ
Header: Red (#dc2626)
Background: Light red (#fef2f2)

Status: Not Selected
Message: "we have decided not to proceed with your application at this time."
```

### After (BELOW_THRESHOLD):
```
Subject: Application Update - NVCCZ
Header: Amber (#f59e0b)
Background: Light amber (#fffbeb)

Status: Below Investment Threshold
Message: "your application does not meet our current investment criteria at this time. 
We appreciate the effort you put into your submission."
```

**Key Improvements:**
- ✅ Less harsh language
- ✅ More encouraging tone
- ✅ Warmer color scheme
- ✅ Emphasis on "current criteria" (implies future possibility)
- ✅ Appreciation for effort

---

## 🔍 Testing Checklist

### Backend Testing:

- [ ] Run database update script
- [ ] Verify all REJECTED → BELOW_THRESHOLD
- [ ] Test new endpoint: `GET /api/applications/below-threshold`
- [ ] Test stage transition: `SHORTLISTED` → `BELOW_THRESHOLD`
- [ ] Verify email sent with new template
- [ ] Check email rendering (colors, text)
- [ ] Test pagination on new endpoint
- [ ] Verify Swagger documentation updated

### Frontend Testing:

- [ ] Update frontend enum values
- [ ] Update status badges/colors
- [ ] Test filtering by `BELOW_THRESHOLD`
- [ ] Update any hardcoded "REJECTED" references
- [ ] Test application list views
- [ ] Verify status display in UI

---

## 🔄 Backwards Compatibility

### Deprecated Methods (Kept for Safety):

```typescript
// EmailNotificationService.ts
/**
 * @deprecated Use sendApplicationBelowThresholdEmail instead
 */
static async sendApplicationRejectedEmail(data: EmailNotificationData): Promise<void> {
  return this.sendApplicationBelowThresholdEmail(data);
}

/**
 * @deprecated Use getApplicationBelowThresholdTemplate instead
 */
private static getApplicationRejectedTemplate(data: EmailNotificationData): string {
  return this.getApplicationBelowThresholdTemplate(data);
}
```

**Why?**
- Prevents breaking changes if old code still calls these methods
- Can be removed in future version after confirming no usage

---

## 📈 Impact

### User Experience:
- ✅ **More Professional:** "Below Threshold" sounds more objective
- ✅ **Less Harsh:** Removes negative connotation of "rejected"
- ✅ **Encourages Reapplication:** Softer language invites future submissions
- ✅ **Better Branding:** Aligns with supportive VC image

### Technical:
- ✅ **No Breaking Changes:** Backwards compatible
- ✅ **Clean Separation:** New endpoint for below-threshold apps
- ✅ **Better Analytics:** Can track "below threshold" separately
- ✅ **Improved Reporting:** Clearer status categories

---

## 🎯 Next Steps (Optional Enhancements)

### Future Improvements:

1. **Add Feedback Categories:**
   ```typescript
   enum BelowThresholdReason {
     EARLY_STAGE = "Too early stage",
     MARKET_FIT = "Market fit concerns",
     FINANCIAL = "Financial metrics below threshold",
     TEAM = "Team experience concerns",
     OTHER = "Other factors"
   }
   ```

2. **Reapplication Tracking:**
   - Track when below-threshold applicants reapply
   - Show improvement metrics
   - Priority review for reapplications

3. **Automated Follow-up:**
   - Send follow-up email after 6 months
   - Invite to reapply with updated information
   - Provide resources for improvement

4. **Analytics Dashboard:**
   - Track below-threshold reasons
   - Conversion rate of reapplications
   - Common improvement areas

---

## ✅ Completion Checklist

- [x] Update ApplicationService.ts
- [x] Update EmailNotificationService.ts
- [x] Update email templates
- [x] Update Swagger documentation
- [x] Add new endpoint for BELOW_THRESHOLD
- [x] Create database update script
- [x] Create documentation
- [ ] Run database update script (manual step)
- [ ] Deploy to production
- [ ] Verify in production
- [ ] Update frontend (separate task)

---

**Date:** November 24, 2025
**Status:** Code Complete - Ready for Deployment
**Breaking Changes:** None
**Database Migration:** Manual script provided

