# 🧪 PROCUREMENT APPROVAL WORKFLOW - TESTING GUIDE

**Date:** January 2025  
**Purpose:** Test the complete approval workflow configuration and flow

---

## 🎯 **OVERVIEW**

This guide walks through:
1. ✅ Creating approval workflow configuration (Admin task)
2. ✅ Setting up multiple steps for each stage
3. ✅ Defining which roles approve at each step
4. ✅ Testing the complete approval flow

---

## 👤 **TEST USERS**

We have 5 procurement test users ready (see `PROCUREMENT_TEST_USERS.md`):

| User | Email | Role Code | Dept Role | Can Approve Req? |
|------|-------|-----------|-----------|------------------|
| Manager | `proc.manager@testnvccz.com` | `PROC_MGR` | HEAD | ✅ Yes |
| Officer | `proc.officer@testnvccz.com` | `PROC_OFF` | DEPUTY | ✅ Yes |
| Buyer | `proc.buyer@testnvccz.com` | `BUYER` | MEMBER | ❌ No |
| Coordinator | `proc.coordinator@testnvccz.com` | `PROC_COORD` | MEMBER | ❌ No |
| Member | `proc.member@testnvccz.com` | `PROC_MEM` | MEMBER | ❌ No |

**Password for all:** `TestPass123!`

---

## 🔐 **STEP 0: LOGIN AS ADMIN**

First, you need to login as an admin user to create the approval configuration.

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@nvccz.co.zw",
  "password": "YOUR_ADMIN_PASSWORD"
}
```

**Save the response token as:** `ADMIN_TOKEN`

**Expected Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "admin@nvccz.co.zw",
    "roleCode": "..."
  }
}
```

---

## 📋 **STEP 1: CREATE APPROVAL WORKFLOW CONFIGURATION**

**Admin Task:** Create approval configuration with multiple steps for each stage.

### **1.1: Create Procurement Department Approval Config**

```bash
POST http://localhost:3000/api/procurement-approval-configs
Authorization: Bearer ADMIN_TOKEN
Content-Type: application/json

{
  "name": "Procurement Department Approval Workflow",
  "description": "Multi-step approval workflow for Procurement department",
  "department": "Procurement",
  "isActive": true,
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Department Head Approval",
          "stepType": "ROLE",
          "roleCode": "PROC_MGR",
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 2,
          "stepName": "Deputy Head Approval",
          "stepType": "ROLE",
          "roleCode": "PROC_OFF",
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
          "stepName": "Buyer Review",
          "stepType": "ROLE",
          "roleCode": "BUYER",
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 2,
          "stepName": "Coordinator Verification",
          "stepType": "ROLE",
          "roleCode": "PROC_COORD",
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 3,
          "stepName": "Manager Final Approval",
          "stepType": "ROLE",
          "roleCode": "PROC_MGR",
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
          "stepName": "Manager Approval",
          "stepType": "ROLE",
          "roleCode": "PROC_MGR",
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
  "message": "Procurement approval configuration created successfully",
  "data": {
    "id": "CONFIG_ID_HERE",
    "name": "Procurement Department Approval Workflow",
    "department": "Procurement",
    "isActive": true,
    "stages": [
      {
        "id": "STAGE_1_ID",
        "stageType": "PURCHASE_REQUISITION",
        "stepNumber": 1,
        "stepName": "Department Head Approval",
        "stepType": "ROLE",
        "roleCode": "PROC_MGR",
        "isRequired": true,
        "approvalOrder": "SEQUENTIAL"
      },
      {
        "id": "STAGE_2_ID",
        "stageType": "PURCHASE_REQUISITION",
        "stepNumber": 2,
        "stepName": "Deputy Head Approval",
        "stepType": "ROLE",
        "roleCode": "PROC_OFF",
        "isRequired": true,
        "approvalOrder": "SEQUENTIAL"
      },
      {
        "id": "STAGE_3_ID",
        "stageType": "INVOICE",
        "stepNumber": 1,
        "stepName": "Buyer Review",
        "stepType": "ROLE",
        "roleCode": "BUYER",
        "isRequired": true,
        "approvalOrder": "SEQUENTIAL"
      },
      {
        "id": "STAGE_4_ID",
        "stageType": "INVOICE",
        "stepNumber": 2,
        "stepName": "Coordinator Verification",
        "stepType": "ROLE",
        "roleCode": "PROC_COORD",
        "isRequired": true,
        "approvalOrder": "SEQUENTIAL"
      },
      {
        "id": "STAGE_5_ID",
        "stageType": "INVOICE",
        "stepNumber": 3,
        "stepName": "Manager Final Approval",
        "stepType": "ROLE",
        "roleCode": "PROC_MGR",
        "isRequired": true,
        "approvalOrder": "SEQUENTIAL"
      },
      {
        "id": "STAGE_6_ID",
        "stageType": "PURCHASE_ORDER",
        "stepNumber": 1,
        "stepName": "Manager Approval",
        "stepType": "ROLE",
        "roleCode": "PROC_MGR",
        "isRequired": true,
        "approvalOrder": "SEQUENTIAL"
      }
    ]
  }
}
```

**📝 SAVE:** Copy the `id` field - this is your `CONFIG_ID`

**✅ What This Creates:**
- **PURCHASE_REQUISITION Stage:** 2-step approval
  - Step 1: PROC_MGR (Manager) must approve first
  - Step 2: PROC_OFF (Officer) must approve second
- **INVOICE Stage:** 3-step approval
  - Step 1: BUYER must approve first
  - Step 2: PROC_COORD must approve second
  - Step 3: PROC_MGR must approve third (final)
- **PURCHASE_ORDER Stage:** 1-step approval
  - Step 1: PROC_MGR must approve

---

### **1.2: Verify Configuration Was Created**

```bash
GET http://localhost:3000/api/procurement-approval-configs
Authorization: Bearer ADMIN_TOKEN
```

**Or get active config:**
```bash
GET http://localhost:3000/api/procurement-approval-configs/active
Authorization: Bearer ADMIN_TOKEN
```

---

## 🧪 **STEP 2: TEST PURCHASE REQUISITION APPROVAL FLOW**

Now let's test the complete approval flow using the test users.

### **2.1: Login as Buyer (MEMBER - Cannot Approve Reqs)**

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "proc.buyer@testnvccz.com",
  "password": "TestPass123!"
}
```

**Save token as:** `BUYER_TOKEN`

---

### **2.2: Create Purchase Requisition (as Buyer)**

```bash
POST http://localhost:3000/api/procurement/requisitions
Authorization: Bearer BUYER_TOKEN
Content-Type: application/json

{
  "title": "Test Requisition - Office Supplies Q1 2025",
  "description": "Testing approval workflow with office supplies requisition",
  "department": "Procurement",
  "priority": "HIGH",
  "justification": "Essential supplies for Q1 operations",
  "items": [
    {
      "itemName": "Printer Paper - A4",
      "description": "Standard A4 printer paper, 500 sheets per ream",
      "quantity": 10,
      "unit": "reams"
    },
    {
      "itemName": "Office Pens",
      "description": "Blue ink ballpoint pens, 12-pack",
      "quantity": 5,
      "unit": "packs"
    },
    {
      "itemName": "Staples",
      "description": "Standard office staples",
      "quantity": 2,
      "unit": "boxes"
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
    "id": "REQ_ID_HERE",
    "requisitionNumber": "REQ-1729012456-789",
    "status": "PENDING_APPROVAL",
    "department": "Procurement",
    "totalAmount": 0,
    "createdBy": {
      "firstName": "Procurement",
      "lastName": "Buyer",
      "userDepartment": "Procurement",
      "departmentRole": "MEMBER",
      "roleCode": "BUYER"
    },
    "items": [
      {
        "itemName": "Printer Paper - A4",
        "quantity": "10",
        "unitPrice": "0"
      }
    ]
  }
}
```

**📝 SAVE:** Copy the `id` field - this is your `REQ_ID`

**✅ What Happened:**
- Requisition created successfully
- Status automatically set to `PENDING_APPROVAL`
- Approval request created automatically
- Approval records created for Step 1 (PROC_MGR - Manager)

**Expected Console Logs:**
```
════════════════════════════════════════════════════════════════
📝 CREATING APPROVAL REQUEST
════════════════════════════════════════════════════════════════
🔖 Stage Type: PURCHASE_REQUISITION
🆔 Entity ID: REQ_ID_HERE
👤 Requested By: proc.buyer@testnvccz.com
🏢 Department: Procurement

✅ Using approval config: "Procurement Department Approval Workflow"
   Config Department: Procurement

📋 Found 2 approval stage(s) configured

✅ Approval request created: APPROVAL_REQUEST_ID

   📋 Found 1 user(s) with roleCode="PROC_MGR"
      - Procurement Manager (proc.manager@testnvccz.com) [PROC_MGR]
   ✅ Approval created for user MANAGER_USER_ID at step 1

════════════════════════════════════════════════════════════════
✅ Created 1 approval record(s)
════════════════════════════════════════════════════════════════
```

---

### **2.3: View Pending Approvals (as Manager)**

Login as Manager to see pending approvals:

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "proc.manager@testnvccz.com",
  "password": "TestPass123!"
}
```

**Save token as:** `MANAGER_TOKEN`

**Get pending approvals:**
```bash
GET http://localhost:3000/api/procurement-approval-configs/requests/my?status=PENDING
Authorization: Bearer MANAGER_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Approval requests retrieved successfully",
  "data": [
    {
      "id": "APPROVAL_REQUEST_ID",
      "stageType": "PURCHASE_REQUISITION",
      "entityId": "REQ_ID_HERE",
      "status": "PENDING",
      "currentStep": 1,
      "totalSteps": 2,
      "requestedBy": {
        "firstName": "Procurement",
        "lastName": "Buyer"
      },
      "approvals": [
        {
          "id": "APPROVAL_ID",
          "status": "PENDING",
          "stage": {
            "stepNumber": 1,
            "stepName": "Department Head Approval",
            "stepType": "ROLE",
            "roleCode": "PROC_MGR"
          }
        }
      ]
    }
  ]
}
```

---

### **2.4: Approve Step 1 (as Manager - PROC_MGR)**

```bash
PUT http://localhost:3000/api/procurement-approval-configs/requests/APPROVAL_REQUEST_ID/stages/STAGE_1_ID/approve
Authorization: Bearer MANAGER_TOKEN
Content-Type: application/json

{
  "status": "APPROVED",
  "comments": "Approved - Office supplies are essential for operations"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Approval approved successfully",
  "data": {
    "id": "APPROVAL_ID",
    "status": "APPROVED",
    "approvedAt": "2025-01-16T10:30:00.000Z",
    "comments": "Approved - Office supplies are essential for operations",
    "stage": {
      "stepNumber": 1,
      "stepName": "Department Head Approval"
    }
  }
}
```

**✅ What Happened:**
- Step 1 approved by Manager (PROC_MGR)
- Approval request moved to Step 2
- Approval records created for Step 2 (PROC_OFF - Officer)

**Expected Console Logs:**
```
✅ Step 1 completed
🔄 Moving to next step: Step 2
✅ Approval records created for Step 2
   📋 Found 1 user(s) with roleCode="PROC_OFF"
      - Procurement Officer (proc.officer@testnvccz.com) [PROC_OFF]
   ✅ Approval created for user OFFICER_USER_ID at step 2
```

---

### **2.5: Approve Step 2 (as Officer - PROC_OFF)**

Login as Officer:

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "proc.officer@testnvccz.com",
  "password": "TestPass123!"
}
```

**Save token as:** `OFFICER_TOKEN`

**Get pending approvals:**
```bash
GET http://localhost:3000/api/procurement-approval-configs/requests/my?status=PENDING
Authorization: Bearer OFFICER_TOKEN
```

**Approve Step 2:**
```bash
PUT http://localhost:3000/api/procurement-approval-configs/requests/APPROVAL_REQUEST_ID/stages/STAGE_2_ID/approve
Authorization: Bearer OFFICER_TOKEN
Content-Type: application/json

{
  "status": "APPROVED",
  "comments": "Final approval granted - Proceed with RFQ process"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Approval approved successfully",
  "data": {
    "id": "APPROVAL_ID_2",
    "status": "APPROVED",
    "approvedAt": "2025-01-16T10:35:00.000Z",
    "comments": "Final approval granted - Proceed with RFQ process",
    "stage": {
      "stepNumber": 2,
      "stepName": "Deputy Head Approval"
    }
  }
}
```

**✅ What Happened:**
- Step 2 approved by Officer (PROC_OFF)
- All steps completed for PURCHASE_REQUISITION stage
- Approval request status changed to `APPROVED`
- Requisition status updated to `APPROVED`

**Expected Console Logs:**
```
✅ Step 2 completed
✅ All steps completed for PURCHASE_REQUISITION
✅ Approval request status: APPROVED
✅ Requisition status updated to: APPROVED
```

---

### **2.6: Verify Requisition Status**

```bash
GET http://localhost:3000/api/procurement/requisitions/REQ_ID
Authorization: Bearer BUYER_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "REQ_ID",
    "requisitionNumber": "REQ-1729012456-789",
    "status": "APPROVED",
    "department": "Procurement",
    "approvedAt": "2025-01-16T10:35:00.000Z"
  }
}
```

**✅ Success!** Requisition fully approved after 2 steps.

---

## 🧪 **STEP 3: TEST INVOICE APPROVAL FLOW (3 STEPS)**

Now let's test the invoice approval flow with 3 steps.

### **3.1: Create Invoice (as Buyer)**

```bash
POST http://localhost:3000/api/procurement/invoices
Authorization: Bearer BUYER_TOKEN
Content-Type: application/json

{
  "vendorId": "VENDOR_ID_HERE",
  "invoiceDate": "2025-01-15",
  "dueDate": "2025-02-15",
  "currencyId": "USD_CURRENCY_ID",
  "items": [
    {
      "itemName": "Printer Paper - A4",
      "description": "Standard A4 printer paper",
      "quantity": 10,
      "unitPrice": 25.00,
      "accountId": "OFFICE_SUPPLIES_ACCOUNT_ID"
    },
    {
      "itemName": "Office Pens",
      "description": "Blue ink ballpoint pens",
      "quantity": 5,
      "unitPrice": 12.00,
      "accountId": "OFFICE_SUPPLIES_ACCOUNT_ID"
    }
  ],
  "taxRate": 14.5
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Procurement invoice created successfully",
  "data": {
    "id": "INVOICE_ID",
    "invoiceNumber": "INV-1729012456-790",
    "status": "PENDING_APPROVAL",
    "department": "Procurement",
    "subtotal": 310.00,
    "taxAmount": 44.95,
    "totalAmount": 354.95
  }
}
```

**📝 SAVE:** Copy the `id` field - this is your `INVOICE_ID`

**✅ What Happened:**
- Invoice created successfully
- Status automatically set to `PENDING_APPROVAL`
- Approval request created automatically
- Approval records created for Step 1 (BUYER - but wait, buyer created it!)

**Note:** The system should create approval for Step 1 (BUYER role), but since the buyer created it, we need a different buyer or the system might skip them.

---

### **3.2: Submit Invoice for Approval**

If invoice needs to be submitted separately:

```bash
POST http://localhost:3000/api/procurement/invoices/INVOICE_ID/submit
Authorization: Bearer BUYER_TOKEN
```

---

### **3.3: View Pending Approvals (Step 1 - Buyer)**

**Note:** Since Buyer created the invoice, approval might skip to Step 2, or another buyer needs to approve.

**If there's another buyer with BUYER roleCode, use them. Otherwise, proceed with Step 2.**

---

### **3.4: Approve Step 1 (as Coordinator - PROC_COORD)**

Actually, Step 1 should be BUYER. But if no other buyer exists, let's check the approval config:

**Get approval steps for INVOICE:**
```bash
GET http://localhost:3000/api/procurement-approval-configs/stages/INVOICE/steps
Authorization: Bearer ADMIN_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "STAGE_3_ID",
      "stepNumber": 1,
      "stepName": "Buyer Review",
      "stepType": "ROLE",
      "roleCode": "BUYER"
    },
    {
      "id": "STAGE_4_ID",
      "stepNumber": 2,
      "stepName": "Coordinator Verification",
      "stepType": "ROLE",
      "roleCode": "PROC_COORD"
    },
    {
      "id": "STAGE_5_ID",
      "stepNumber": 3,
      "stepName": "Manager Final Approval",
      "stepType": "ROLE",
      "roleCode": "PROC_MGR"
    }
  ]
}
```

**For testing, we can approve Step 1 as the buyer who created it, or skip to Step 2:**

**Approve Step 1 (if possible):**
```bash
PUT http://localhost:3000/api/procurement-approval-configs/requests/INVOICE_APPROVAL_REQUEST_ID/stages/STAGE_3_ID/approve
Authorization: Bearer BUYER_TOKEN
Content-Type: application/json

{
  "status": "APPROVED",
  "comments": "Invoice reviewed and verified"
}
```

---

### **3.5: Approve Step 2 (as Coordinator - PROC_COORD)**

Login as Coordinator:

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "proc.coordinator@testnvccz.com",
  "password": "TestPass123!"
}
```

**Save token as:** `COORDINATOR_TOKEN`

**Get pending approvals:**
```bash
GET http://localhost:3000/api/procurement-approval-configs/requests/my?status=PENDING
Authorization: Bearer COORDINATOR_TOKEN
```

**Approve Step 2:**
```bash
PUT http://localhost:3000/api/procurement-approval-configs/requests/INVOICE_APPROVAL_REQUEST_ID/stages/STAGE_4_ID/approve
Authorization: Bearer COORDINATOR_TOKEN
Content-Type: application/json

{
  "status": "APPROVED",
  "comments": "Coordinator verification completed - Amounts and details verified"
}
```

---

### **3.6: Approve Step 3 - Final (as Manager - PROC_MGR)**

```bash
PUT http://localhost:3000/api/procurement-approval-configs/requests/INVOICE_APPROVAL_REQUEST_ID/stages/STAGE_5_ID/approve
Authorization: Bearer MANAGER_TOKEN
Content-Type: application/json

{
  "status": "APPROVED",
  "comments": "Final approval granted - Invoice approved for payment processing"
}
```

**✅ What Happened:**
- All 3 steps completed for INVOICE stage
- Approval request status changed to `APPROVED`
- Invoice status updated to `APPROVED`
- **Journal Entry Created Automatically:**
  - Dr. Office Supplies $310.00
  - Dr. VAT Input $44.95
  - Cr. Accounts Payable $354.95

---

## 📊 **SUMMARY OF APPROVAL CONFIGURATION**

### **Configuration Created:**

| Stage | Steps | Step 1 Role | Step 2 Role | Step 3 Role |
|-------|-------|-------------|-------------|-------------|
| **PURCHASE_REQUISITION** | 2 | PROC_MGR (Manager) | PROC_OFF (Officer) | - |
| **INVOICE** | 3 | BUYER | PROC_COORD (Coordinator) | PROC_MGR (Manager) |
| **PURCHASE_ORDER** | 1 | PROC_MGR (Manager) | - | - |

---

## ✅ **VERIFICATION CHECKLIST**

After testing, verify:

- [ ] Approval config created successfully
- [ ] PURCHASE_REQUISITION has 2 steps
- [ ] INVOICE has 3 steps
- [ ] PURCHASE_ORDER has 1 step
- [ ] Each step has correct roleCode assigned
- [ ] Requisition approval flow works (2 steps)
- [ ] Invoice approval flow works (3 steps)
- [ ] Approvers are assigned correctly based on roleCode
- [ ] Status updates correctly after each step
- [ ] Final approval updates requisition/invoice status to APPROVED

---

## 🔍 **TROUBLESHOOTING**

### **Issue: No approvers found for role**

**Cause:** No users have the required roleCode

**Solution:**
```sql
SELECT email, "roleCode", "userDepartment", "departmentRole"
FROM "User"
WHERE "userDepartment" = 'Procurement';
```

Verify users have correct roleCode assigned.

### **Issue: Approval doesn't move to next step**

**Cause:** Step not marked as completed or approval order issue

**Solution:** Check approval request status:
```bash
GET http://localhost:3000/api/procurement-approval-configs/requests/APPROVAL_REQUEST_ID
Authorization: Bearer TOKEN
```

### **Issue: Wrong approver assigned**

**Cause:** roleCode mismatch or no users with that roleCode

**Solution:** Verify approval config and users have matching roleCodes.

---

**Last Updated:** January 2025  
**Status:** ✅ Ready for Testing  
**Next Step:** Test the complete flow using the steps above

