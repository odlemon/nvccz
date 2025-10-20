# ⚡ PROCUREMENT SETUP - SIMPLE SUMMARY

## 🎯 **WHAT'S HARDCODED (Just Use These Strings)**

### **Departments (7 options):**
```
Finance
Operations
Procurement
Human Resources
Marketing
Legal
IT
```

### **Department Roles (3 options):**
```
HEAD    - Can approve
DEPUTY  - Can approve
MEMBER  - Cannot approve
```

**NO DATABASE LOOKUP NEEDED** - Just copy these exact strings!

---

## 🔧 **WHAT NEEDS DATABASE IDs**

### **System Roles:**
- Need to create in database: `finance_manager`, `procurement_manager`, etc.
- Need to get IDs: `GET /api/roles`
- Used in approval configurations

---

## ⚡ **QUICK SETUP (3 Steps)**

### **STEP 1: Create System Roles**
```bash
POST /api/roles
Authorization: Bearer TOKEN

{
  "name": "finance_manager",
  "description": "Finance Manager",
  "permissions": [
    {"name": "view_accounting", "value": true},
    {"name": "manage_accounting", "value": true}
  ]
}
```

**Save the role ID you get back!**

---

### **STEP 2: Assign User (All 3 Fields)**
```sql
UPDATE users 
SET 
  roleId = 'cm2xfinmgr123',        -- System role ID (from Step 1)
  userDepartment = 'Finance',       -- Hardcoded string ✅
  departmentRole = 'HEAD'           -- Hardcoded string ✅
WHERE email = 'john@company.com';
```

**User now has:**
- System role for approval configs
- Department for requisition context
- Department role for requisition approval power

---

### **STEP 3: Create Approval Config**
```bash
POST /api/procurement-approval-configs
Authorization: Bearer TOKEN

{
  "name": "Main Config",
  "isActive": true,
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Finance Approval",
          "stepType": "ROLE",
          "roleId": "cm2xfinmgr123",  -- System role ID from Step 1
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
          "stepName": "Finance Approval",
          "stepType": "ROLE",
          "roleId": "cm2xfinmgr123",
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

---

## ✅ **DONE! Now You Can:**

1. **Create Requisition** (any user)
2. **Approve Requisition** (only users with `departmentRole = HEAD` or `DEPUTY` in same department)
3. **Create RFQ** → Send to vendors with quotation link
4. **Vendors submit quotations** (no login needed!)
5. **Accept quotation** → Invoice auto-created
6. **Approve Invoice** (users with matching system role from config)
7. **Pay Invoice** → Vendor gets email confirmation

---

## 🎯 **KEY POINTS**

### **Hardcoded Department Roles:**
- ✅ HEAD - Can approve requisitions from their department
- ✅ DEPUTY - Can approve requisitions from their department  
- ❌ MEMBER - Can only create requisitions, cannot approve

### **System Roles:**
- Used for approval configurations
- Control who can approve invoices, POs, etc.
- You create these in the database

### **Both Work Together:**
```
User = John Doe
├── roleId: "finance_manager_id"    → Can approve invoices (per config)
├── userDepartment: "Finance"       → Works in Finance dept
└── departmentRole: "HEAD"          → Can approve Finance requisitions
```

---

## 📋 **REFERENCE**

**Hardcoded Departments:**
- Finance
- Operations
- Procurement
- Human Resources
- Marketing
- Legal
- IT

**Hardcoded Department Roles:**
- HEAD
- DEPUTY
- MEMBER

**System Roles (Create These):**
- admin (already exists from seed)
- finance_manager (you create)
- procurement_manager (you create)
- operations_manager (you create)
- etc.

---

**Ready to test?** Server is running at `http://localhost:3000` 🚀






