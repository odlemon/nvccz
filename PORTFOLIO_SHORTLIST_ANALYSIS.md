# 📋 Portfolio Shortlist Module Analysis

## 🎯 Current Implementation

### **Application Workflow Stages**

```
DRAFT → SHORTLISTED → UNDER_DUE_DILIGENCE → DUE_DILIGENCE_COMPLETED → 
TERM_SHEET → TERM_SHEET_NEGOTIATION → UNDER_BOARD_REVIEW → 
BOARD_APPROVED → INVESTMENT_IMPLEMENTATION → DISBURSED → FUNDED → 
PORTFOLIO_MANAGEMENT
```

---

## 🔍 Shortlist Stage Details

### **What Happens at SHORTLISTED Stage:**

1. **Entry Point:**
   - Applications are created in `DRAFT` stage
   - Admin/Fund Manager manually moves them to `SHORTLISTED`
   - Endpoint: `PUT /api/applications/{id}/stage`

2. **Valid Transitions FROM SHORTLISTED:**
   ```typescript
   "SHORTLISTED": ["UNDER_DUE_DILIGENCE", "REJECTED"]
   ```

3. **Actions Triggered:**
   - ✅ Email notification sent to applicant
   - ✅ Application notification created in database
   - ✅ Stage change recorded
   - ❌ **NO automatic due diligence creation**
   - ❌ **NO automatic portfolio company creation**
   - ❌ **NO automatic user account creation**

### **Current Code (ApplicationService.ts:488-572):**

```typescript
static async changeApplicationStage(id: string, newStage: string, notes?: string) {
  // Validate stage transition
  const validTransitions = {
    "SHORTLISTED": ["UNDER_DUE_DILIGENCE", "REJECTED"],
    // ... other stages
  };

  // Update application stage
  const updatedApplication = await prisma.application.update({
    where: { id },
    data: {
      currentStage: newStage,
      updatedAt: new Date()
    }
  });

  // Send email notification
  await this.sendStageChangeNotification(updatedApplication, newStage);

  // Create notification record
  await prisma.applicationNotification.create({
    data: {
      applicationId: id,
      recipientEmail: application.applicantEmail,
      notificationType: "STAGE_CHANGE",
      title: `Application Stage Updated: ${newStage}`,
      message: `Your application has moved to the ${newStage} stage.`
    }
  });

  return updatedApplication;
}
```

---

## 🔧 Due Diligence Initiation

### **Current Requirement:**

Due diligence **MUST** be manually initiated:

```typescript
// DueDiligenceService.ts:57-70
static async initiateDueDiligence(params) {
  // Check if application exists and is in SHORTLISTED stage
  const application = await prisma.application.findUnique({
    where: { id: params.applicationId }
  });

  if (application.currentStage !== 'SHORTLISTED') {
    throw new Error('Due diligence can only be initiated for applications in SHORTLISTED stage');
  }

  // Create due diligence record
  const dueDiligence = await prisma.dueDiligenceReview.create({
    data: {
      applicationId: params.applicationId,
      reviewerId: params.reviewerId,
      status: 'IN_PROGRESS'
    }
  });

  // Update application stage to UNDER_DUE_DILIGENCE
  await prisma.application.update({
    where: { id: params.applicationId },
    data: { currentStage: 'UNDER_DUE_DILIGENCE' }
  });
}
```

### **Endpoint:**
```
POST /api/applications/{id}/due-diligence
{
  "reviewerId": "user-id"
}
```

---

## 📊 Database Schema

### **Application Model:**

```prisma
model Application {
  id                    String   @id @default(cuid())
  applicantName         String
  applicantEmail        String
  applicantPhone        String
  businessName          String
  businessDescription   String
  industry              String
  businessStage         String
  requestedAmount       Decimal
  fundId                String?
  currentStage          String   @default("DRAFT")
  submittedAt           DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  
  fund                  Fund?
  documents             ApplicationDocument[]
  notifications         ApplicationNotification[]
  dueDiligenceReview    DueDiligenceReview?
  boardReview           BoardReview?
  termSheet             TermSheet?
  investmentImplementation InvestmentImplementation?
  tasks                 Task[]
}
```

### **Key Relationships:**

- ✅ **One-to-One**: Application → DueDiligenceReview
- ✅ **One-to-One**: Application → BoardReview
- ✅ **One-to-One**: Application → TermSheet
- ✅ **One-to-One**: Application → InvestmentImplementation
- ✅ **One-to-Many**: Application → Task[]
- ✅ **One-to-Many**: Application → ApplicationDocument[]
- ✅ **One-to-Many**: Application → ApplicationNotification[]

---

## 🎯 Potential Changes Needed

### **Option 1: Automatic Due Diligence on Shortlist**

**Pros:**
- ✅ Streamlines workflow
- ✅ Reduces manual steps
- ✅ Ensures consistency

**Cons:**
- ❌ Requires default reviewer assignment
- ❌ Less flexibility
- ❌ May create unnecessary records

**Implementation:**
```typescript
// In changeApplicationStage() when newStage === "SHORTLISTED"
if (newStage === "SHORTLISTED") {
  // Get default reviewer or assign based on rules
  const defaultReviewer = await getDefaultDueDiligenceReviewer();
  
  // Auto-create due diligence
  await DueDiligenceService.initiateDueDiligence({
    applicationId: id,
    reviewerId: defaultReviewer.id
  });
}
```

### **Option 2: Batch Shortlist with Reviewer Assignment**

**Pros:**
- ✅ More control
- ✅ Can assign different reviewers
- ✅ Can shortlist multiple at once

**Cons:**
- ❌ More complex UI
- ❌ Requires reviewer selection

**Implementation:**
```typescript
POST /api/applications/batch-shortlist
{
  "applications": [
    {
      "applicationId": "app-1",
      "reviewerId": "reviewer-1"
    },
    {
      "applicationId": "app-2",
      "reviewerId": "reviewer-2"
    }
  ]
}
```

### **Option 3: Two-Step Shortlist Process**

**Pros:**
- ✅ Clear separation of concerns
- ✅ Allows review before due diligence
- ✅ More flexible

**Cons:**
- ❌ Extra step
- ❌ More clicks for users

**Workflow:**
```
1. Move to SHORTLISTED (review stage)
2. Assign reviewer
3. Initiate due diligence (auto-moves to UNDER_DUE_DILIGENCE)
```

---

## 📋 Current API Endpoints

### **Application Management:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/applications` | Get all applications (with filters) |
| `GET` | `/api/applications/{id}` | Get single application |
| `PUT` | `/api/applications/{id}/stage` | Change application stage |
| `POST` | `/api/applications/{id}/due-diligence` | Initiate due diligence |

### **Due Diligence:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/applications/{id}/due-diligence` | Initiate due diligence |
| `GET` | `/api/applications/{id}/due-diligence` | Get due diligence details |
| `PUT` | `/api/applications/{id}/due-diligence` | Update due diligence |
| `POST` | `/api/applications/{id}/due-diligence/complete` | Complete due diligence |
| `POST` | `/api/applications/{id}/due-diligence/assign-task` | Assign task |

---

## 🚀 Recommended Changes

Based on typical VC workflows, here are my recommendations:

### **1. Add Shortlist Review Stage**

Create a dedicated shortlist review before due diligence:

```typescript
"DRAFT" → "SUBMITTED" → "INITIAL_REVIEW" → "SHORTLISTED" → 
"UNDER_DUE_DILIGENCE" → ...
```

### **2. Add Reviewer Assignment on Shortlist**

When moving to SHORTLISTED, require reviewer assignment:

```typescript
PUT /api/applications/{id}/shortlist
{
  "reviewerId": "user-id",
  "notes": "Strong team, good market fit"
}
```

### **3. Add Bulk Shortlist Endpoint**

For processing multiple applications:

```typescript
POST /api/applications/bulk-shortlist
{
  "applications": [
    { "id": "app-1", "reviewerId": "rev-1" },
    { "id": "app-2", "reviewerId": "rev-2" }
  ]
}
```

### **4. Add Shortlist Dashboard**

Dedicated view for shortlisted applications:

```typescript
GET /api/applications/shortlisted
Response: {
  "total": 15,
  "pending_review": 5,
  "in_due_diligence": 10,
  "applications": [...]
}
```

### **5. Add Auto-Assignment Rules**

Configure automatic reviewer assignment:

```typescript
// Based on:
- Industry (Tech → Tech Reviewer)
- Amount (>$1M → Senior Reviewer)
- Round-robin distribution
- Workload balancing
```

---

## 🔍 Current Gaps

### **Missing Features:**

1. ❌ **No batch operations** for shortlisting
2. ❌ **No automatic reviewer assignment**
3. ❌ **No shortlist criteria/scoring**
4. ❌ **No shortlist dashboard/view**
5. ❌ **No workload balancing** for reviewers
6. ❌ **No shortlist analytics** (conversion rates, etc.)
7. ❌ **No shortlist notifications** to reviewers
8. ❌ **No deadline tracking** for reviews

### **Existing Features:**

1. ✅ **Stage transition validation**
2. ✅ **Email notifications**
3. ✅ **Application notifications**
4. ✅ **Manual due diligence initiation**
5. ✅ **One-to-one relationships** (no duplicates)

---

## 📊 Workflow Comparison

### **Current Workflow:**

```
1. Admin views application
2. Admin clicks "Move to Shortlisted"
3. Email sent to applicant
4. Admin separately initiates due diligence
5. Admin assigns reviewer
6. Due diligence begins
```

### **Proposed Workflow:**

```
1. Admin views applications in dashboard
2. Admin selects multiple applications
3. Admin assigns reviewers (or auto-assign)
4. Admin clicks "Shortlist & Start Due Diligence"
5. System:
   - Moves to SHORTLISTED
   - Creates due diligence records
   - Assigns reviewers
   - Sends notifications to applicants
   - Sends notifications to reviewers
   - Moves to UNDER_DUE_DILIGENCE
```

---

## 🎯 Next Steps

**Tell me which changes you want to implement:**

1. **Automatic due diligence on shortlist?**
2. **Batch shortlist operations?**
3. **Reviewer auto-assignment?**
4. **Shortlist dashboard?**
5. **Additional stages (INITIAL_REVIEW, etc.)?**
6. **Shortlist scoring/criteria?**
7. **Something else?**

I'm ready to implement whatever changes you need! 🚀

