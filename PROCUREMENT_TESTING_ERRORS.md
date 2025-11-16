# 🐛 PROCUREMENT TESTING - ERRORS AND FIXES

**Date:** January 2025  
**Purpose:** Document errors found during procurement approval workflow testing

---

## ✅ **ERRORS FOUND AND FIXED**

### **ERROR #1: Approval Request Not Created on Requisition Submit**

**Date:** January 2025  
**Status:** ✅ FIXED

**Problem:**
- When a requisition was created in `DRAFT` status and then submitted, the status changed to `PENDING_APPROVAL` but no approval request was created.
- Manager couldn't see pending approvals because no approval request existed.

**Root Cause:**
- The `submitPurchaseRequisition` method in `ProcurementService.ts` only updated the status but didn't trigger the approval workflow.
- Approval requests were only created during requisition creation, not during submission.

**Fix Applied:**
- Updated `submitPurchaseRequisition` method to:
  1. Call `ApprovalService.createApprovalRequest()` when submitting
  2. Create approval request with proper stage type and entity data
  3. Update status to `PENDING_APPROVAL` only if approval request is created successfully
  4. Keep as `DRAFT` if no approval stages are configured

**File Modified:**
- `src/services/ProcurementService.ts` - `submitPurchaseRequisition` method

**Code Changes:**
```typescript
// Added approval workflow trigger
const approvalResult = await ApprovalService.createApprovalRequest({
  stageType: "PURCHASE_REQUISITION",
  entityId: requisition.id,
  entityData: {
    requisitionNumber: requisition.requisitionNumber,
    title: requisition.title,
    department: requisition.department,
    totalAmount: requisition.totalAmount.toString(),
    itemCount: requisition.items.length
  },
  requestedById: submittedById,
  department: requisition.department as any
});

// Update status only if approval request was created
if (approvalResult) {
  // Update to PENDING_APPROVAL
}
```

**Testing:**
- ✅ Error handling added to catch approval creation errors
- ✅ Better logging added to debug approval request creation
- ⏳ Still testing - approval request may not be created correctly

---

## 📋 **TEST RESULTS**

### **Test 1: Create and Submit Requisition**

**Expected:**
- ✅ Requisition created in DRAFT status
- ✅ Requisition submitted successfully
- ✅ Approval request created automatically
- ✅ Status changed to PENDING_APPROVAL
- ✅ Manager can see pending approval

**Actual (Before Fix):**
- ✅ Requisition created in DRAFT status
- ✅ Requisition submitted successfully
- ❌ Approval request NOT created
- ❌ Status remained DRAFT (should be PENDING_APPROVAL)
- ❌ Manager cannot see pending approval

**Actual (After Fix):**
- ✅ Requisition created in DRAFT status
- ✅ Requisition submitted successfully  
- ⚠️  Approval request creation attempted but may still be failing
- ⚠️  Status still showing DRAFT (investigating)

**Issue:** Approval request creation is being attempted but may be failing silently. Need to check server console logs to see actual error.

---

### **ERROR #2: Filtering Stages by Department**

**Date:** January 2025  
**Status:** ✅ FIXED

**Problem:**
- ApprovalService was filtering stages by `requiredUserDepartment` which may not match the config's department
- This could cause stages not to be found even when config exists

**Fix Applied:**
- Removed `requiredUserDepartment` filter from stage query
- Stages are now only filtered by `stageType`
- Config itself is already filtered by department, so stages don't need additional filtering

**File Modified:**
- `src/services/ApprovalService.ts` - Stage query filter

---

### **ERROR #3: Approval Processing Query Error**

**Date:** January 2025  
**Status:** ✅ FIXED

---

### **ERROR #4: Duplicate Approval Records on Step Transition**

**Date:** January 2025  
**Status:** ✅ FIXED

**Problem:**
- When Step 1 is approved and system tries to move to Step 2, it attempts to create approval records for Step 2
- But approval records for ALL steps are already created when the approval request is first created
- This causes `Unique constraint failed on approvals_requestId_stageId_approverId_key`

**Root Cause:**
- `ApprovalService.createApprovalRequest` creates approval records for ALL stages at once
- `ProcurementApprovalConfigService.moveToNextStep` then tries to create Step 2 records again using `createApprovalRecords`

**Fix Applied:**
- Updated `createApprovalRecords` to check for existing approval records before creating new ones
- Only creates approval records for approvers that don't already have records
- Uses `skipDuplicates: true` as a safety measure
- Logs when all records already exist

**File Modified:**
- `src/services/ProcurementApprovalConfigService.ts` - `createApprovalRecords` method

**Code Changes:**
```typescript
// Check which approval records already exist
const existingApprovals = await prisma.approval.findMany({
  where: { requestId, stageId: stage.id },
  select: { approverId: true }
});

const existingApproverIds = new Set(existingApprovals.map(a => a.approverId));
const newApprovers = approvers.filter(approverId => !existingApproverIds.has(approverId));

if (newApprovers.length === 0) {
  // All records already exist - skip creation
  return existingApprovals;
}

// Create only new approval records
await prisma.approval.createMany({
  data: approvalRecords,
  skipDuplicates: true
});
```

---

**Problem:**
- `processApproval` method had invalid Prisma query with async promise in where clause
- Query tried to use `prisma.approvalRequest.findUnique().then()` inside a where clause
- Caused `Invalid prisma.approval.findUnique() invocation` error

**Root Cause:**
- Incorrect use of async operation inside Prisma query where clause
- Cannot use promises/async operations in Prisma query filters

**Fix Applied:**
- Split query into two steps:
  1. First get the approval request to retrieve `stageType`
  2. Then use the `stageType` in the approval query
- Fixed the include query to use static `stageType` value instead of async promise

**File Modified:**
- `src/services/ProcurementApprovalConfigService.ts` - `processApproval` method

**Code Changes:**
```typescript
// Before (BROKEN):
const approval = await prisma.approval.findUnique({
  where: { ... },
  include: {
    config: {
      include: {
        stages: {
          where: { stageType: { equals: prisma.approvalRequest.findUnique({ where: { id: requestId } }).then(r => r?.stageType) } }
        }
      }
    }
  }
});

// After (FIXED):
const request = await prisma.approvalRequest.findUnique({
  where: { id: requestId },
  select: { stageType: true }
});

const approval = await prisma.approval.findUnique({
  where: { ... },
  include: {
    config: {
      include: {
        stages: {
          where: { stageType: request.stageType } // Use static value
        }
      }
    }
  }
});
```

---

## 📋 **TEST RESULTS**

### **Test 1: Create and Submit Requisition**

**Expected:**
- ✅ Requisition created in DRAFT status
- ✅ Requisition submitted successfully
- ✅ Approval request created automatically
- ✅ Status changed to PENDING_APPROVAL
- ✅ Manager can see pending approval

**Actual (Current):**
- ✅ Requisition created in DRAFT status
- ✅ Requisition submitted successfully  
- ✅ Approval request created successfully
- ✅ Status changed to PENDING_APPROVAL
- ✅ Manager can see pending approval (2 approvals found)

**Status:** ✅ WORKING

---

### **Test 2: Approve Step 1 (Manager)**

**Expected:**
- ✅ Manager can approve Step 1
- ✅ Approval status changed to APPROVED
- ✅ Approval request moves to Step 2
- ✅ Officer can see Step 2 approval

**Actual (After Fix):**
- ✅ Manager found pending approval
- ✅ Approval processing query fixed
- ⏳ Testing in progress...

---

## 🔄 **NEXT STEPS**

1. ✅ Fix ERROR #1 - Approval request creation on submit
2. ✅ Fix ERROR #2 - Stage filtering issue
3. ✅ Fix ERROR #3 - Approval processing query error
4. ⏳ Complete full approval workflow test
5. ⏳ Test Step 1 approval (Manager) 
6. ⏳ Test Step 2 approval (Officer)
7. ⏳ Verify requisition status after all approvals

---

**Last Updated:** January 2025

