# ⚡ PROCUREMENT ROLES - QUICK REFERENCE

## 🎯 **TL;DR - Which Role Does What?**

| Approval Type | Uses Which Field | Values |
|--------------|------------------|--------|
| **Requisition Approval** | `departmentRole` | HEAD, DEPUTY (only these can approve) |
| **Invoice/PO Approval** | `roleId` (database) | From approval config |
| **User Display/UI** | `roleCode` (optional) | FIN_MGR, PROC_OFF, etc. |

---

## 📋 **USER SETUP CHECKLIST**

### **For Requisition Approval Authority:**
```sql
UPDATE users SET
  userDepartment = 'Finance',     -- Which department
  departmentRole = 'HEAD'         -- HEAD or DEPUTY to approve
WHERE email = 'manager@company.com';
```

### **For Invoice/PO Approval Authority:**
```sql
UPDATE users SET
  roleId = 'finance_manager_id'   -- Must match approval config
WHERE email = 'manager@company.com';
```

### **For UI Display (Optional):**
```sql
UPDATE users SET
  roleCode = 'FIN_MGR'             -- Shows "Finance Manager" in UI
WHERE email = 'manager@company.com';
```

---

## 🔄 **COMPLETE SETUP EXAMPLE**

**Goal:** Finance Manager who can:
- Approve Finance requisitions
- Approve invoices
- Display as "Finance Manager"

```sql
-- Step 1: Create database role (one-time)
INSERT INTO roles (name, description, permissions)
VALUES ('finance_manager', 'Finance Manager Role', [...]);

-- Step 2: Assign user (all fields)
UPDATE users SET
  userDepartment = 'Finance',          -- ✅ Requisition approvals
  departmentRole = 'HEAD',             -- ✅ Requisition approval power
  roleCode = 'FIN_MGR',                -- ✅ Display name
  roleId = '<finance_manager_role_id>' -- ✅ Invoice approvals
WHERE email = 'manager@company.com';

-- Step 3: Approval config references roleId
-- (Already done if you have approval configs)
```

---

## 🎯 **HARDCODED VALUES**

### **Departments (7):**
```
Finance
Operations
Procurement
Human Resources
Marketing
Legal
IT
```

### **Department Roles (3):**
```
HEAD    - Can approve requisitions
DEPUTY  - Can approve requisitions
MEMBER  - Cannot approve (can only create)
```

### **System Role Codes (35):**
```
Finance: FIN_MGR, FIN_OFF, ACCOUNTANT, FIN_ASST, FIN_MEM
Operations: OPS_MGR, OPS_OFF, OPS_COORD, OPS_ANALYST, OPS_MEM
Procurement: PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM
HR: HR_MGR, HR_OFF, RECRUITER, HR_COORD, HR_MEM
Marketing: MKT_MGR, MKT_OFF, CONTENT_CREATOR, SOCIAL_MEDIA_MGR, MKT_MEM
Legal: LEGAL_MGR, LEGAL_OFF, COMPLIANCE_OFF, LEGAL_ADVISOR, LEGAL_MEM
IT: IT_MGR, SYSADMIN, DEVELOPER, IT_SUPPORT, IT_MEM
```

Get full list: `GET /api/hardcoded-roles/departments-with-roles`

---

## ⚡ **TESTING QUICK START**

### **1. Setup User**
```bash
# Update via database or API
UPDATE users SET
  userDepartment = 'Finance',
  departmentRole = 'HEAD',
  roleCode = 'FIN_MGR',
  roleId = '<your_role_id>'
WHERE id = '<user_id>';
```

### **2. Test Requisition Approval**
```bash
# Create requisition
POST /api/procurement/requisitions
{
  "department": "Finance",
  "items": [...]
}

# Submit for approval
POST /api/procurement/requisitions/{id}/submit

# Approve (as Finance HEAD/DEPUTY)
POST /api/procurement/requisitions/{id}/approve
```

### **3. Test Invoice Approval**
```bash
# Create invoice
POST /api/procurement/invoices
{...}

# Approve (if roleId matches approval config)
POST /api/procurement/invoices/{id}/approve
```

---

## 🚨 **COMMON MISTAKES**

### ❌ **Wrong: Thinking roleCode affects approvals**
```sql
UPDATE users SET roleCode = 'FIN_MGR';
-- This is ONLY for display, doesn't give approval power!
```

### ✅ **Correct: Use departmentRole for requisitions**
```sql
UPDATE users SET 
  userDepartment = 'Finance',
  departmentRole = 'HEAD'  -- This gives requisition approval power
;
```

### ✅ **Correct: Use roleId for invoices**
```sql
UPDATE users SET 
  roleId = 'finance_manager_role_id'  -- This gives invoice approval power
;
```

---

## 📚 **FULL DOCUMENTATION**

- **Complete Explanation:** `PROCUREMENT_ROLES_SYSTEM_EXPLAINED.md`
- **API Documentation:** `HARDCODED_ROLES_API_DOCUMENTATION.md`
- **Testing Guide:** `PROCUREMENT_SETUP_AND_TESTING_GUIDE.md`

---

**Status:** ✅ System is correctly implemented!  
**Version:** 1.0.0






