# 🧪 APPROVAL WORKFLOW - END-TO-END TESTING GUIDE

## 📋 **OVERVIEW**

This guide walks you through testing the complete approval workflow system from configuration to approval completion.

**Date:** October 14, 2025  
**Status:** ✅ **READY TO TEST**

---

## 🎯 **WHAT WE'RE TESTING**

1. ✅ Approval workflow configuration
2. ✅ User department and role filtering
3. ✅ Requisition creation with automatic approval workflow triggering
4. ✅ Viewing pending approvals
5. ✅ Approving approvals
6. ✅ Rejecting approvals
7. ✅ Multi-step sequential approval flow

---

## 🚀 **PREREQUISITES**

### **1. Create Test Users**

You need users with different department assignments:

```http
POST /api/users (or update existing users)

User 1: Finance HEAD
{
  "firstName": "Jane",
  "lastName": "Finance-Head",
  "email": "jane.head@company.com",
  "userDepartment": "Finance",
  "departmentRole": "HEAD"
}

User 2: Finance DEPUTY
{
  "firstName": "John",
  "lastName": "Finance-Deputy",
  "email": "john.deputy@company.com",
  "userDepartment": "Finance",
  "departmentRole": "DEPUTY"
}

User 3: Finance MEMBER (Requester)
{
  "firstName": "Bob",
  "lastName": "Finance-Member",
  "email": "bob.member@company.com",
  "userDepartment": "Finance",
  "departmentRole": "MEMBER"
}
```

---

## 📝 **TEST SCENARIO: FINANCE REQUISITION WITH 2-STEP APPROVAL**

### **STEP 1: Get List of Finance HEADs for Configuration**

```http
GET /api/users/by-department?department=Finance&departmentRole=HEAD
Authorization: Bearer ADMIN_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "USER_ID_JANE",
      "firstName": "Jane",
      "lastName": "Finance-Head",
      "email": "jane.head@company.com",
      "userDepartment": "Finance",
      "departmentRole": "HEAD"
    }
  ]
}
```

**Action:** Copy Jane's `USER_ID_JANE` for next step

---

### **STEP 2: Get List of Finance DEPUTYs**

```http
GET /api/users/by-department?department=Finance&departmentRole=DEPUTY
Authorization: Bearer ADMIN_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "USER_ID_JOHN",
      "firstName": "John",
      "lastName": "Finance-Deputy",
      "email": "john.deputy@company.com",
      "userDepartment": "Finance",
      "departmentRole": "DEPUTY"
    }
  ]
}
```

**Action:** Copy John's `USER_ID_JOHN` for next step

---

### **STEP 3: Configure Approval Workflow**

```http
POST /api/procurement-approval-configs
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{
  "name": "Finance Department 2-Step Approval",
  "description": "Finance HEAD → Finance DEPUTY approval flow",
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Finance Head Approval",
          "stepType": "USER",
          "userId": "USER_ID_JANE",
          "requiredUserDepartment": "Finance",
          "requiredDepartmentRole": "HEAD",
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 2,
          "stepName": "Finance Deputy Approval",
          "stepType": "USER",
          "userId": "USER_ID_JOHN",
          "requiredUserDepartment": "Finance",
          "requiredDepartmentRole": "DEPUTY",
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    }
  ]
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Approval configuration created successfully",
  "data": {
    "id": "CONFIG_ID",
    "name": "Finance Department 2-Step Approval",
    "isActive": true,
    "stages": [...]
  }
}
```

**✅ Checkpoint:** Approval workflow is now configured!

---

### **STEP 4: Create Purchase Requisition (As Finance MEMBER)**

```http
POST /api/procurement/requisitions
Authorization: Bearer BOB_MEMBER_TOKEN
Content-Type: application/json

{
  "title": "Office Equipment - Q1 2025",
  "description": "Laptops and monitors for new hires",
  "department": "Finance",
  "priority": "HIGH",
  "justification": "New team members starting next week",
  "items": [
    {
      "itemName": "Dell Laptop",
      "description": "Dell XPS 15, 16GB RAM, 512GB SSD",
      "quantity": 3,
      "unit": "units",
      "specifications": {
        "model": "XPS 15",
        "ram": "16GB",
        "storage": "512GB SSD"
      }
    },
    {
      "itemName": "Monitor",
      "description": "27-inch 4K Monitor",
      "quantity": 6,
      "unit": "units"
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
    "id": "REQUISITION_ID",
    "requisitionNumber": "REQ-1729000000-123",
    "title": "Office Equipment - Q1 2025",
    "department": "Finance",
    "status": "PENDING_APPROVAL",  // ⬅️ Automatically set!
    "totalAmount": 0,
    "items": [...]
  }
}
```

**What Happened Behind the Scenes:**
1. ✅ Requisition created with status `DRAFT`
2. ✅ System found active approval configuration for Finance department
3. ✅ Created `ApprovalRequest` record
4. ✅ Created 2 `Approval` records:
   - Approval 1: Assigned to Jane (Finance HEAD) - Status: PENDING
   - Approval 2: Assigned to John (Finance DEPUTY) - Status: PENDING
5. ✅ Updated requisition status to `PENDING_APPROVAL`

**✅ Checkpoint:** Requisition is now awaiting approval!

---

### **STEP 5: View Pending Approvals (As Finance HEAD - Jane)**

```http
GET /api/approvals/my-pending
Authorization: Bearer JANE_HEAD_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Pending approvals retrieved successfully",
  "count": 1,
  "data": [
    {
      "id": "APPROVAL_1_ID",
      "status": "PENDING",
      "createdAt": "2025-10-14T10:00:00Z",
      "request": {
        "id": "REQUEST_ID",
        "stageType": "PURCHASE_REQUISITION",
        "entityId": "REQUISITION_ID",
        "entityData": {
          "requisitionNumber": "REQ-1729000000-123",
          "title": "Office Equipment - Q1 2025",
          "department": "Finance",
          "totalAmount": "0",
          "itemCount": 2
        },
        "requestedBy": {
          "id": "USER_ID_BOB",
          "firstName": "Bob",
          "lastName": "Finance-Member",
          "email": "bob.member@company.com"
        },
        "requestDate": "2025-10-14T10:00:00Z",
        "status": "PENDING",
        "currentStep": 1,
        "totalSteps": 2
      },
      "stage": {
        "stepNumber": 1,
        "stepName": "Finance Head Approval",
        "stageType": "PURCHASE_REQUISITION",
        "requiredUserDepartment": "Finance",
        "requiredDepartmentRole": "HEAD"
      }
    }
  ]
}
```

**✅ Checkpoint:** Jane can see Bob's requisition waiting for her approval!

---

### **STEP 6: Approve as Finance HEAD (Jane)**

```http
POST /api/approvals/APPROVAL_1_ID/approve
Authorization: Bearer JANE_HEAD_TOKEN
Content-Type: application/json

{
  "comments": "Approved - Necessary for new team members",
  "signatureData": null
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Approval approved successfully",
  "data": {
    "approval": {
      "id": "APPROVAL_1_ID",
      "status": "APPROVED",
      "approvedAt": "2025-10-14T10:15:00Z",
      "comments": "Approved - Necessary for new team members"
    },
    "request": {
      "id": "REQUEST_ID",
      "status": "PENDING",  // ⬅️ Still pending because step 2 remains
      "currentStep": 2,      // ⬅️ Moved to step 2!
      "totalSteps": 2,
      "completedAt": null
    }
  }
}
```

**What Happened:**
1. ✅ Approval 1 (Jane's) marked as APPROVED
2. ✅ Request moved to step 2 (currentStep: 2)
3. ✅ Requisition status still PENDING_APPROVAL (waiting for John)
4. ✅ John (Finance DEPUTY) now sees this approval in his pending list

**✅ Checkpoint:** Step 1 approved, moving to step 2!

---

### **STEP 7: View Pending Approvals (As Finance DEPUTY - John)**

```http
GET /api/approvals/my-pending
Authorization: Bearer JOHN_DEPUTY_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "id": "APPROVAL_2_ID",
      "status": "PENDING",
      "stage": {
        "stepNumber": 2,
        "stepName": "Finance Deputy Approval"
      },
      "request": {
        "currentStep": 2,
        "totalSteps": 2,
        "entityData": {
          "requisitionNumber": "REQ-1729000000-123",
          "title": "Office Equipment - Q1 2025"
        }
      }
    }
  ]
}
```

**✅ Checkpoint:** John can now see the approval waiting for him!

---

### **STEP 8: Approve as Finance DEPUTY (John)**

```http
POST /api/approvals/APPROVAL_2_ID/approve
Authorization: Bearer JOHN_DEPUTY_TOKEN
Content-Type: application/json

{
  "comments": "Final approval granted - proceed with procurement"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Approval approved successfully",
  "data": {
    "approval": {
      "id": "APPROVAL_2_ID",
      "status": "APPROVED",
      "approvedAt": "2025-10-14T10:30:00Z"
    },
    "request": {
      "id": "REQUEST_ID",
      "status": "APPROVED",      // ⬅️ NOW APPROVED!
      "currentStep": 2,
      "totalSteps": 2,
      "completedAt": "2025-10-14T10:30:00Z"  // ⬅️ Marked as complete!
    }
  }
}
```

**What Happened:**
1. ✅ Approval 2 (John's) marked as APPROVED
2. ✅ All steps complete (2 of 2)
3. ✅ `ApprovalRequest` status → APPROVED
4. ✅ **REQUISITION STATUS → APPROVED**
5. ✅ Requisition can now proceed to next stage (PO creation)

**✅ Checkpoint:** FULL APPROVAL COMPLETE! 🎉

---

### **STEP 9: Verify Requisition is Approved**

```http
GET /api/procurement/requisitions/REQUISITION_ID
Authorization: Bearer BOB_MEMBER_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "REQUISITION_ID",
    "requisitionNumber": "REQ-1729000000-123",
    "title": "Office Equipment - Q1 2025",
    "department": "Finance",
    "status": "APPROVED",  // ⬅️ ✅ APPROVED!
    "items": [...]
  }
}
```

**✅ SUCCESS!** Requisition is fully approved and ready for PO creation!

---

## ❌ **TEST SCENARIO 2: REJECTION FLOW**

### **STEP 1: Create Another Requisition**

```http
POST /api/procurement/requisitions
Authorization: Bearer BOB_MEMBER_TOKEN

{
  "title": "Luxury Office Furniture",
  "department": "Finance",
  "priority": "LOW",
  "items": [
    {
      "itemName": "Executive Desk",
      "quantity": 1
    }
  ]
}
```

**Result:** New requisition created with `PENDING_APPROVAL` status

---

### **STEP 2: Reject as Finance HEAD (Jane)**

```http
POST /api/approvals/NEW_APPROVAL_ID/reject
Authorization: Bearer JANE_HEAD_TOKEN
Content-Type: application/json

{
  "comments": "Budget constraints - not essential for business operations"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Approval rejected successfully",
  "data": {
    "approval": {
      "id": "NEW_APPROVAL_ID",
      "status": "REJECTED",
      "rejectedAt": "2025-10-14T11:00:00Z",
      "comments": "Budget constraints - not essential for business operations"
    },
    "request": {
      "id": "NEW_REQUEST_ID",
      "status": "REJECTED",   // ⬅️ Entire request rejected!
      "rejectedAt": "2025-10-14T11:00:00Z",
      "rejectionReason": "Budget constraints - not essential for business operations"
    }
  }
}
```

**What Happened:**
1. ✅ Approval marked as REJECTED
2. ✅ Entire ApprovalRequest marked as REJECTED (workflow stops)
3. ✅ **REQUISITION STATUS → REJECTED**
4. ✅ No further approvals needed (workflow terminated)

---

### **STEP 3: Verify Requisition is Rejected**

```http
GET /api/procurement/requisitions/NEW_REQUISITION_ID
Authorization: Bearer BOB_MEMBER_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "NEW_REQUISITION_ID",
    "status": "REJECTED",  // ⬅️ ❌ REJECTED!
    "rejectionReason": "Budget constraints - not essential for business operations"
  }
}
```

---

## 📊 **TESTING CHECKLIST**

Use this checklist to verify all functionality:

### **Configuration Testing**
- [ ] Can create approval configuration
- [ ] Can set department filtering (requiredUserDepartment)
- [ ] Can set role filtering (requiredDepartmentRole)
- [ ] Can configure multiple steps
- [ ] Can update configuration
- [ ] Can deactivate/activate configuration

### **User Filtering**
- [ ] `/api/users/by-department?department=Finance` returns Finance users
- [ ] `/api/users/by-department?departmentRole=HEAD` returns all HEADs
- [ ] `/api/users/by-department?department=Finance&departmentRole=HEAD` returns Finance HEADs only
- [ ] Invalid department/role values return error

### **Approval Workflow Triggering**
- [ ] Creating requisition auto-creates ApprovalRequest
- [ ] Creating requisition auto-creates Approval records for each step
- [ ] Requisition status changes to PENDING_APPROVAL
- [ ] If no approval config → status changes to APPROVED (auto-approve)

### **Viewing Approvals**
- [ ] `/api/approvals/my-pending` shows only my pending approvals
- [ ] Only shows approvals for current or previous steps (not future steps)
- [ ] Returns all necessary data (request, stage, requester info)

### **Approving**
- [ ] Can approve approval assigned to me
- [ ] Cannot approve someone else's approval
- [ ] Approval status changes to APPROVED
- [ ] If last step → Request status changes to APPROVED
- [ ] If last step → Entity (requisition) status changes to APPROVED
- [ ] If not last step → currentStep increments
- [ ] Next step approver can now see approval in their pending list

### **Rejecting**
- [ ] Can reject approval assigned to me
- [ ] Comments are required for rejection
- [ ] Approval status changes to REJECTED
- [ ] Request status changes to REJECTED (stops workflow)
- [ ] Entity (requisition) status changes to REJECTED
- [ ] No further approvals can be made

### **Error Handling**
- [ ] Cannot approve already-approved approval
- [ ] Cannot approve already-rejected approval
- [ ] Cannot approve without authentication
- [ ] Cannot approve if not the assigned approver
- [ ] Cannot reject without comments

---

## 🎯 **EXPECTED CONSOLE LOGS**

When testing, you should see comprehensive logs like:

### **Requisition Creation:**
```
════════════════════════════════════════════════════════════════
📝 CREATING PURCHASE REQUISITION
════════════════════════════════════════════════════════════════
📋 Title: Office Equipment - Q1 2025
🏢 Department: Finance
📦 Items: 2

✅ Purchase Requisition created successfully
🆔 Requisition ID: cmXXXXXXX

🔄 Initiating approval workflow...

════════════════════════════════════════════════════════════════
📝 CREATING APPROVAL REQUEST
════════════════════════════════════════════════════════════════
🔖 Stage Type: PURCHASE_REQUISITION
🆔 Entity ID: cmXXXXXXX
👤 Requested By: USER_ID_BOB
🏢 Department: Finance

📋 Found 2 approval stage(s) configured

✅ Approval request created: REQUEST_ID
   ✅ Approval created for user USER_ID_JANE at step 1
   ✅ Approval created for user USER_ID_JOHN at step 2

✅ Created 2 approval record(s)
✅ Requisition status updated to PENDING_APPROVAL
════════════════════════════════════════════════════════════════
```

### **Approval:**
```
════════════════════════════════════════════════════════════════
✅ APPROVING APPROVAL
════════════════════════════════════════════════════════════════
🆔 Approval ID: APPROVAL_1_ID
👤 Approver ID: USER_ID_JANE
💬 Comments: Approved - Necessary for new team members

✅ Approval APPROVAL_1_ID marked as APPROVED
📊 Current step: 1 / 2
📊 Approvals up to current step: 1
📊 All current step approved: true
➡️  Moving to next step: 2
════════════════════════════════════════════════════════════════
```

---

## 🚀 **READY TO TEST!**

Follow the steps above to test the complete approval workflow system. All endpoints are live and ready!

**Questions?** Check `APPROVAL_WORKFLOW_SYSTEM_COMPLETE_GUIDE.md` for detailed API documentation.

---

**Last Updated:** October 14, 2025  
**Status:** ✅ **IMPLEMENTATION COMPLETE & READY TO TEST**


