# 🔄 PROCUREMENT APPROVAL WORKFLOW SYSTEM - COMPLETE GUIDE

## 📋 **OVERVIEW**

Complete **multi-step approval workflow system** for procurement module integrated with **hard coded departments** and **role-based filtering**.

**Date:** October 14, 2025  
**Status:** ✅ **READY TO CONFIGURE**

---

## 🎯 **KEY FEATURES**

### **1. Configurable Multi-Step Approvals**
- ✅ Define approval steps for each procurement stage
- ✅ Sequential or parallel approval flows
- ✅ Multiple approval types: USER, ROLE, DEPARTMENT, AMOUNT_THRESHOLD

### **2. Department & Role Integration**
- ✅ Filter users by hardcoded department (Finance, Operations, etc.)
- ✅ Filter users by role (HEAD, DEPUTY, MEMBER)
- ✅ Ensure only authorized personnel can approve

### **3. Approval Stages**
- **PURCHASE_REQUISITION** - When requisition is submitted
- **PURCHASE_ORDER** - When PO is created
- **INVOICE** - When invoice is approved
- **GRN** - When goods are received

---

## 🏗️ **SYSTEM ARCHITECTURE**

### **Models**

```
ProcurementApprovalConfig (Top-level configuration)
  └─> ProcurementApprovalStage[] (Multiple steps for each stage type)
       - stageType: PURCHASE_REQUISITION | PURCHASE_ORDER | INVOICE | GRN
       - stepType: USER | ROLE | DEPARTMENT | AMOUNT_THRESHOLD
       - requiredUserDepartment: Finance, Operations, etc.
       - requiredDepartmentRole: HEAD, DEPUTY, MEMBER

When requisition submitted:
  └─> ApprovalRequest (Created)
       └─> Approval[] (One for each step, assigned to users)
```

---

## 🛠️ **STEP 1: CONFIGURE APPROVAL WORKFLOW**

### **API Endpoint**
```http
POST /api/procurement-approval-configs
Authorization: Bearer TOKEN
Content-Type: application/json
```

### **Request Body**

```json
{
  "name": "Main Procurement Approval Workflow",
  "description": "Multi-step approval for all procurement stages",
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Department Head Approval",
          "stepType": "USER",
          "userId": "USER_ID_OF_DEPT_HEAD",
          "requiredUserDepartment": "Finance",  // ⬅️ NEW! User must be from Finance
          "requiredDepartmentRole": "HEAD",     // ⬅️ NEW! User must be HEAD
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 2,
          "stepName": "Finance Manager Approval",
          "stepType": "USER",
          "userId": "USER_ID_OF_FINANCE_MANAGER",
          "requiredUserDepartment": "Finance",
          "requiredDepartmentRole": "DEPUTY",  // ⬅️ Finance DEPUTY can approve
          "isRequired": true,
          "canDelegate": true,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 3,
          "stepName": "CEO Approval (High Value)",
          "stepType": "AMOUNT_THRESHOLD",
          "userId": "CEO_USER_ID",
          "amountThreshold": 10000,  // ⬅️ Only if amount > $10,000
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    },
    {
      "stageType": "PURCHASE_ORDER",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Procurement Head Approval",
          "stepType": "USER",
          "userId": "PROCUREMENT_HEAD_USER_ID",
          "requiredUserDepartment": "Procurement",
          "requiredDepartmentRole": "HEAD",
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    },
    {
      "stageType": "INVOICE",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Finance Team Approval",
          "stepType": "ROLE",
          "roleId": "FINANCE_ROLE_ID",  // ⬅️ Anyone with Finance role
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

### **Response**
```json
{
  "success": true,
  "message": "Procurement approval configuration created successfully",
  "data": {
    "id": "CONFIG_ID",
    "name": "Main Procurement Approval Workflow",
    "isActive": true,
    "stages": [...]
  }
}
```

---

## 🧑‍💼 **STEP 2: GET USERS FOR APPROVAL CONFIGURATION**

### **NEW ENDPOINT!** Get Users Filtered by Department & Role

```http
GET /api/users/by-department?department=Finance&departmentRole=HEAD
Authorization: Bearer TOKEN
```

### **Query Parameters**
- `department` (optional): Finance, Operations, Procurement, Human Resources, Marketing, Legal, IT
- `departmentRole` (optional): HEAD, DEPUTY, MEMBER

### **Examples**

#### **Example 1: Get all Finance department HEADs**
```http
GET /api/users/by-department?department=Finance&departmentRole=HEAD
```

**Response:**
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "count": 2,
  "data": [
    {
      "id": "USER_1",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@company.com",
      "userDepartment": "Finance",
      "departmentRole": "HEAD",
      "role": {
        "id": "ROLE_1",
        "name": "Finance Manager"
      }
    },
    {
      "id": "USER_2",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane.smith@company.com",
      "userDepartment": "Finance",
      "departmentRole": "HEAD",
      "role": {
        "id": "ROLE_2",
        "name": "Director"
      }
    }
  ]
}
```

#### **Example 2: Get all users in Operations department**
```http
GET /api/users/by-department?department=Operations
```

#### **Example 3: Get all DEPUTYs across all departments**
```http
GET /api/users/by-department?departmentRole=DEPUTY
```

#### **Example 4: Get ALL users**
```http
GET /api/users/by-department
```

---

## 🔄 **STEP 3: COMPLETE APPROVAL FLOW**

### **Scenario:** Bob (Finance MEMBER) creates a requisition

### **Step 3.1: Create Requisition**
```http
POST /api/procurement/requisitions
Authorization: Bearer BOB_TOKEN

{
  "title": "Office Supplies - January 2025",
  "department": "Finance",
  "priority": "MEDIUM",
  "items": [...]
}
```

**Result:** Requisition created with status `DRAFT`

---

### **Step 3.2: Submit for Approval**
```http
POST /api/procurement/requisitions/{requisitionId}/submit
Authorization: Bearer BOB_TOKEN
```

**What Happens:**
1. ✅ System finds the active `ProcurementApprovalConfig`
2. ✅ System looks for steps with `stageType = "PURCHASE_REQUISITION"`
3. ✅ Creates an `ApprovalRequest` record
4. ✅ Creates `Approval` records for each step:
   - Step 1: Assigned to Finance HEAD
   - Step 2: Assigned to Finance DEPUTY (pending Step 1)
   - Step 3: Assigned to CEO (only if amount > $10,000)

**Result:** 
- Requisition status → `PENDING_APPROVAL`
- Approval requests created and assigned

---

### **Step 3.3: View Pending Approvals (Approver's View)**

**✅ IMPLEMENTED!**
```http
GET /api/approvals/my-pending
Authorization: Bearer APPROVER_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "Pending approvals retrieved successfully",
  "count": 1,
  "data": [
    {
      "id": "APPROVAL_ID",
      "status": "PENDING",
      "request": {
        "id": "REQUEST_ID",
        "stageType": "PURCHASE_REQUISITION",
        "entityId": "REQUISITION_ID",
        "requestedBy": {
          "firstName": "Bob",
          "lastName": "Member"
        }
      },
      "stage": {
        "stepNumber": 1,
        "stepName": "Department Head Approval",
        "stepType": "USER"
      },
      "entity": {
        "title": "Office Supplies - January 2025",
        "department": "Finance",
        "totalAmount": 5000,
        "items": [...]
      }
    }
  ]
}
```

---

### **Step 3.4: Approve/Reject**

**✅ IMPLEMENTED!**
```http
POST /api/approvals/{approvalId}/approve
Authorization: Bearer APPROVER_TOKEN

{
  "comments": "Approved for processing",
  "signatureData": "base64_signature_image"  // Optional
}
```

**What Happens:**
1. ✅ Approval record updated: status → `APPROVED`
2. ✅ Check if all steps in current approval order are complete
3. ✅ If yes, move to next step (assign to next approver)
4. ✅ If all steps complete, requisition status → `APPROVED`

**Or Reject:**
```http
POST /api/approvals/{approvalId}/reject
Authorization: Bearer APPROVER_TOKEN

{
  "comments": "Budget not available"
}
```

---

## 📊 **STEP TYPES EXPLAINED**

### **1. USER - Assign to specific user**
```json
{
  "stepType": "USER",
  "userId": "SPECIFIC_USER_ID",
  "requiredUserDepartment": "Finance",  // Optional: Validate user is from Finance
  "requiredDepartmentRole": "HEAD"      // Optional: Validate user is HEAD
}
```

**Use Case:** CEO must approve, Finance HEAD must approve, etc.

---

### **2. ROLE - Assign to anyone with a role**
```json
{
  "stepType": "ROLE",
  "roleId": "FINANCE_MANAGER_ROLE_ID"
}
```

**Use Case:** Any Finance Manager can approve (first one to act wins)

---

### **3. DEPARTMENT - Assign to department**
```json
{
  "stepType": "DEPARTMENT",
  "departmentId": "DEPARTMENT_TABLE_ID"
}
```

**Use Case:** Any member of Finance Department can approve

---

### **4. AMOUNT_THRESHOLD - Conditional approval**
```json
{
  "stepType": "AMOUNT_THRESHOLD",
  "userId": "CEO_USER_ID",
  "amountThreshold": 10000
}
```

**Use Case:** CEO approval only needed if amount > $10,000

---

## ✅ **APPROVAL SETTINGS**

### **isRequired**
- `true`: Step must be completed before moving forward
- `false`: Step can be skipped

### **canDelegate**
- `true`: Approver can delegate to another user
- `false`: Must approve personally

### **autoApprove**
- `true`: Automatically approve (for testing or specific scenarios)
- `false`: Requires manual approval

### **approvalOrder**
- `SEQUENTIAL`: Steps must be completed in order (1 → 2 → 3)
- `PARALLEL`: All steps can be completed simultaneously

---

## 🔍 **VALIDATION RULES**

When creating approval configuration:

### **Rule 1: Department & Role Match**
If `stepType = "USER"` and `requiredUserDepartment` is set:
- ✅ System validates that the specified `userId` belongs to that department
- ❌ Error if user is not in the required department

### **Rule 2: Role Validation**
If `requiredDepartmentRole` is set:
- ✅ System validates that the user has that role
- ❌ Error if user doesn't have the required role

### **Rule 3: Step Numbers**
- ✅ Must be sequential (1, 2, 3...)
- ❌ Cannot skip numbers

### **Rule 4: Amount Threshold**
If `stepType = "AMOUNT_THRESHOLD"`:
- ✅ Must provide `amountThreshold` value
- ✅ Must provide `userId` or `roleId` for who approves

---

## 🧪 **TESTING SCENARIOS**

### **Scenario 1: Simple 2-Step Approval**

**Configuration:**
1. Step 1: Finance HEAD approves
2. Step 2: Procurement DEPUTY approves

**Flow:**
1. Bob creates requisition → Status: DRAFT
2. Bob submits → Status: PENDING_APPROVAL
3. John (Finance HEAD) approves Step 1 → Still PENDING_APPROVAL
4. Sarah (Procurement DEPUTY) approves Step 2 → Status: APPROVED ✅

---

### **Scenario 2: Amount-Based Conditional Approval**

**Configuration:**
1. Step 1: Finance HEAD approves (always)
2. Step 2: CEO approves (only if amount > $10,000)

**Flow A (Amount = $5,000):**
1. Submit requisition
2. Finance HEAD approves
3. **No Step 2** (amount < threshold)
4. Status: APPROVED ✅

**Flow B (Amount = $15,000):**
1. Submit requisition
2. Finance HEAD approves Step 1
3. CEO must approve Step 2 (amount > threshold)
4. CEO approves
5. Status: APPROVED ✅

---

### **Scenario 3: Parallel Approvals**

**Configuration:**
1. Step 1 (PARALLEL): Finance HEAD AND Operations HEAD both approve

**Flow:**
1. Submit requisition
2. Both Finance HEAD and Operations HEAD receive approval request
3. Finance HEAD approves first
4. Operations HEAD approves second
5. Both complete → Status: APPROVED ✅

---

## 📝 **EXISTING ENDPOINTS**

### **Configuration Management**

```http
# Create configuration
POST /api/procurement-approval-configs

# Get all configurations
GET /api/procurement-approval-configs

# Get configuration by ID
GET /api/procurement-approval-configs/{id}

# Get active configuration
GET /api/procurement-approval-configs/active

# Update configuration
PUT /api/procurement-approval-configs/{id}

# Delete configuration
DELETE /api/procurement-approval-configs/{id}

# Activate configuration
POST /api/procurement-approval-configs/{id}/activate
```

### **NEW Helper Endpoints**

```http
# Get users for configuration (filtered by dept/role)
GET /api/users/by-department?department=Finance&departmentRole=HEAD
```

---

## 🚧 **ENDPOINTS TO IMPLEMENT**

These endpoints need to be created for the full workflow:

```http
# Get my pending approvals
GET /api/approvals/my-pending

# Get approval details
GET /api/approvals/{id}

# Approve an approval
POST /api/approvals/{id}/approve
{
  "comments": "Approved",
  "signatureData": "base64_image"  // Optional
}

# Reject an approval
POST /api/approvals/{id}/reject
{
  "comments": "Reason for rejection"
}

# Delegate an approval
POST /api/approvals/{id}/delegate
{
  "delegatedToId": "USER_ID",
  "comments": "Delegating while on leave"
}

# Get approval history for an entity
GET /api/approvals/history/{stageType}/{entityId}
```

---

## 💡 **BEST PRACTICES**

### **1. Configuration**
- ✅ Create ONE main configuration for all stages
- ✅ Use descriptive step names
- ✅ Test configuration before activating

### **2. Department & Role Assignment**
- ✅ Ensure all users have `userDepartment` and `departmentRole` set
- ✅ Use `requiredUserDepartment` to enforce department matching
- ✅ Use `requiredDepartmentRole` to ensure right authority level

### **3. Approval Steps**
- ✅ Keep steps simple and clear
- ✅ Use SEQUENTIAL for most workflows
- ✅ Use PARALLEL only when truly needed
- ✅ Use AMOUNT_THRESHOLD for high-value items

### **4. Security**
- ✅ Validate approver has permission
- ✅ Check user belongs to required department
- ✅ Verify user has required role
- ✅ Log all approval actions

---

## 🎯 **IMPLEMENTATION STATUS**

1. ✅ **Schema updated** with `requiredUserDepartment` and `requiredDepartmentRole`
2. ✅ **Migration applied**
3. ✅ **User filter endpoint created** (`/api/users/by-department`)
4. ✅ **Implemented approval endpoints:**
   - ✅ `GET /api/approvals/my-pending` - View pending approvals
   - ✅ `POST /api/approvals/{id}/approve` - Approve an approval
   - ✅ `POST /api/approvals/{id}/reject` - Reject an approval
   - ⏳ `POST /api/approvals/{id}/delegate` - (Optional future enhancement)
5. ✅ **Integrated with requisition creation:**
   - ✅ Automatically creates `ApprovalRequest` when requisition is created
   - ✅ Automatically creates `Approval` records for each configured step
   - ✅ Updates requisition status to PENDING_APPROVAL or APPROVED based on workflow
6. ✅ **Procurement service updated:**
   - ✅ Automatic approval workflow triggering
   - ✅ Requisition status updates based on approval completion
   - ⏳ Email notifications to approvers (Future enhancement)

---

## 📚 **SUMMARY**

✅ **Configured:** Schema and user filtering  
✅ **IMPLEMENTATION COMPLETE!**  
✅ All approval endpoints and workflow integration are now live!  

**System is ready for approval configuration!** 🚀

---

**Last Updated:** October 14, 2025  
**Version:** 1.0  
**Author:** NVCCZ Development Team

