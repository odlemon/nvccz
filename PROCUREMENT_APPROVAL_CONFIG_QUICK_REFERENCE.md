# ⚡ PROCUREMENT APPROVAL CONFIG - QUICK REFERENCE

**Quick reference for creating and testing approval workflow configurations**

---

## 📋 **CONFIGURATION STRUCTURE**

### **Basic Structure:**

```json
{
  "name": "Workflow Name",
  "description": "Description",
  "department": "Procurement",  // Optional: null = general config
  "isActive": true,
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION | PURCHASE_ORDER | INVOICE | GRN",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Step Name",
          "stepType": "ROLE",  // or USER, DEPARTMENT, AMOUNT_THRESHOLD
          "roleCode": "PROC_MGR",  // Hardcoded role code
          "isRequired": true,
          "canDelegate": false,
          "autoApprove": false,
          "approvalOrder": "SEQUENTIAL"  // or PARALLEL
        }
        // Add more steps...
      ]
    }
    // Add more stages...
  ]
}
```

---

## 🔧 **EXAMPLE: PROCUREMENT DEPARTMENT CONFIG**

### **2-Step Requisition + 3-Step Invoice + 1-Step PO**

```json
{
  "name": "Procurement Department Approval Workflow",
  "description": "Multi-step approval for Procurement department",
  "department": "Procurement",
  "isActive": true,
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Manager Approval",
          "stepType": "ROLE",
          "roleCode": "PROC_MGR",
          "isRequired": true,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 2,
          "stepName": "Officer Approval",
          "stepType": "ROLE",
          "roleCode": "PROC_OFF",
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
          "stepName": "Buyer Review",
          "stepType": "ROLE",
          "roleCode": "BUYER",
          "isRequired": true,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 2,
          "stepName": "Coordinator Verification",
          "stepType": "ROLE",
          "roleCode": "PROC_COORD",
          "isRequired": true,
          "approvalOrder": "SEQUENTIAL"
        },
        {
          "stepNumber": 3,
          "stepName": "Manager Final Approval",
          "stepType": "ROLE",
          "roleCode": "PROC_MGR",
          "isRequired": true,
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
          "approvalOrder": "SEQUENTIAL"
        }
      ]
    }
  ]
}
```

---

## 🎯 **AVAILABLE ROLE CODES**

### **Procurement Roles (5):**

| Role Code | Name | Level |
|-----------|------|-------|
| `PROC_MGR` | Procurement Manager | 5 |
| `PROC_OFF` | Procurement Officer | 4 |
| `BUYER` | Buyer | 3 |
| `PROC_COORD` | Procurement Coordinator | 2 |
| `PROC_MEM` | Procurement Member | 1 |

### **Finance Roles (for cross-department approvals):**

| Role Code | Name | Level |
|-----------|------|-------|
| `FIN_MGR` | Finance Manager | 5 |
| `FIN_OFF` | Finance Officer | 4 |
| `ACCOUNTANT` | Accountant | 3 |

**Get all roles:**
```bash
GET /api/hardcoded-roles/departments-with-roles
```

---

## 🚀 **QUICK TEST FLOW**

### **1. Admin Creates Config**

```bash
POST /api/procurement-approval-configs
Authorization: Bearer ADMIN_TOKEN
{
  "name": "Procurement Workflow",
  "department": "Procurement",
  "isActive": true,
  "stages": [...]  // Use example above
}
```

### **2. User Creates Requisition**

```bash
POST /api/procurement/requisitions
Authorization: Bearer USER_TOKEN
{
  "title": "Test Requisition",
  "department": "Procurement",
  "items": [...]
}
```

**Result:** 
- ✅ Requisition created
- ✅ Status: `PENDING_APPROVAL`
- ✅ Approval request created
- ✅ Approval assigned to Step 1 approver (PROC_MGR)

### **3. Step 1 Approver Approves**

```bash
PUT /api/procurement-approval-configs/requests/{requestId}/stages/{stageId}/approve
Authorization: Bearer STEP1_APPROVER_TOKEN
{
  "status": "APPROVED",
  "comments": "Approved"
}
```

**Result:**
- ✅ Step 1 completed
- ✅ Moved to Step 2
- ✅ Approval assigned to Step 2 approver (PROC_OFF)

### **4. Step 2 Approver Approves**

```bash
PUT /api/procurement-approval-configs/requests/{requestId}/stages/{stageId}/approve
Authorization: Bearer STEP2_APPROVER_TOKEN
{
  "status": "APPROVED",
  "comments": "Final approval"
}
```

**Result:**
- ✅ All steps completed
- ✅ Approval request: `APPROVED`
- ✅ Requisition status: `APPROVED`

---

## 📊 **CONFIGURATION SUMMARY**

### **What Gets Created:**

| Stage | Steps | Approvers |
|-------|-------|-----------|
| PURCHASE_REQUISITION | 2 | PROC_MGR → PROC_OFF |
| INVOICE | 3 | BUYER → PROC_COORD → PROC_MGR |
| PURCHASE_ORDER | 1 | PROC_MGR |

### **Flow:**

```
Requisition Created
  ↓
Step 1: PROC_MGR approves
  ↓
Step 2: PROC_OFF approves
  ↓
✅ REQUISITION APPROVED
  ↓
[RFQ Process...]
  ↓
Invoice Created
  ↓
Step 1: BUYER approves
  ↓
Step 2: PROC_COORD approves
  ↓
Step 3: PROC_MGR approves (final)
  ↓
✅ INVOICE APPROVED (Journal Entry Created)
```

---

## ✅ **VERIFICATION**

### **Check Config:**
```bash
GET /api/procurement-approval-configs
GET /api/procurement-approval-configs/active
GET /api/procurement-approval-configs/stages/PURCHASE_REQUISITION/steps
```

### **Check Pending Approvals:**
```bash
GET /api/procurement-approval-configs/requests/my?status=PENDING
```

### **Check Approval History:**
```bash
GET /api/procurement-approval-configs/requests/{requestId}
```

---

**Last Updated:** January 2025  
**Quick Reference for:** Testing approval workflow configuration

