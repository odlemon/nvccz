# ✨ Hardcoded Roles Migration - Complete!

## 🎯 **What Changed?**

We've migrated from **database roles** to **hardcoded role codes** for approval configurations!

---

## 📊 **BEFORE vs AFTER**

### **BEFORE (Database Roles)** ❌
```typescript
// User model
{
  roleId: "cm2x_finance_manager_role_id",  // ← Database FK
  userDepartment: "Finance",
  departmentRole: "HEAD"
}

// Approval config
{
  stepType: "ROLE",
  roleId: "cm2x_finance_manager_role_id"   // ← Database FK
}
```

**Problems:**
- Need to create roles in database first
- Need to track role IDs
- More complex setup

---

### **AFTER (Hardcoded Roles)** ✅
```typescript
// User model
{
  roleCode: "FIN_MGR",        // ← Hardcoded string!
  userDepartment: "Finance",
  departmentRole: "HEAD"
}

// Approval config
{
  stepType: "ROLE",
  roleCode: "FIN_MGR"          // ← Hardcoded string!
}
```

**Benefits:**
- ✅ No need to create roles in database
- ✅ No IDs to track
- ✅ Simpler setup
- ✅ Clear, readable code

---

## 🔧 **Schema Changes**

### **Added Fields:**

**1. User Model:**
```prisma
model User {
  // ... existing fields
  roleCode String? // NEW! Hardcoded role: FIN_MGR, PROC_OFF, etc.
}
```

**2. ProcurementApprovalStage Model:**
```prisma
model ProcurementApprovalStage {
  // ... existing fields
  roleId   String?  // DEPRECATED - use roleCode instead
  roleCode String?  // NEW! Hardcoded role: FIN_MGR, PROC_OFF, etc.
}
```

---

## 📋 **Available Hardcoded Roles** (35 Total)

### **Finance (5 roles)**
- `FIN_MGR` - Finance Manager (Level 5)
- `FIN_OFF` - Finance Officer (Level 4)
- `ACCOUNTANT` - Accountant (Level 3)
- `FIN_ASST` - Finance Assistant (Level 2)
- `FIN_MEM` - Finance Member (Level 1)

### **Procurement (5 roles)**
- `PROC_MGR` - Procurement Manager (Level 5)
- `PROC_OFF` - Procurement Officer (Level 4)
- `BUYER` - Buyer (Level 3)
- `PROC_COORD` - Procurement Coordinator (Level 2)
- `PROC_MEM` - Procurement Member (Level 1)

### **Operations (5 roles)**
- `OPS_MGR` - Operations Manager (Level 5)
- `OPS_OFF` - Operations Officer (Level 4)
- `OPS_COORD` - Operations Coordinator (Level 3)
- `OPS_ANALYST` - Operations Analyst (Level 2)
- `OPS_MEM` - Operations Member (Level 1)

### **Human Resources (5 roles)**
- `HR_MGR` - HR Manager (Level 5)
- `HR_OFF` - HR Officer (Level 4)
- `RECRUITER` - Recruiter (Level 3)
- `HR_COORD` - HR Coordinator (Level 2)
- `HR_MEM` - HR Member (Level 1)

### **Marketing (5 roles)**
- `MKT_MGR` - Marketing Manager (Level 5)
- `MKT_OFF` - Marketing Officer (Level 4)
- `CONTENT_CREATOR` - Content Creator (Level 3)
- `SOCIAL_MEDIA_MGR` - Social Media Manager (Level 2)
- `MKT_MEM` - Marketing Member (Level 1)

### **Legal (5 roles)**
- `LEGAL_MGR` - Legal Manager (Level 5)
- `LEGAL_OFF` - Legal Officer (Level 4)
- `COMPLIANCE_OFF` - Compliance Officer (Level 3)
- `LEGAL_ADVISOR` - Legal Advisor (Level 2)
- `LEGAL_MEM` - Legal Member (Level 1)

### **IT (5 roles)**
- `IT_MGR` - IT Manager (Level 5)
- `SYSADMIN` - System Administrator (Level 4)
- `DEVELOPER` - Developer (Level 3)
- `IT_SUPPORT` - IT Support (Level 2)
- `IT_MEM` - IT Member (Level 1)

---

## 🔄 **How Approval Logic Works Now**

```typescript
// In ProcurementApprovalConfigService.ts

case 'ROLE':
  // Use hardcoded roleCode (NEW!)
  if (stage.roleCode) {
    const users = await prisma.user.findMany({
      where: { roleCode: stage.roleCode },  // ← Match by role code!
      select: { id: true }
    });
    approvers.push(...users.map(u => u.id));
  } else if (stage.roleId) {
    // DEPRECATED: Fallback for backwards compatibility
    const users = await prisma.user.findMany({
      where: { roleId: stage.roleId },
      select: { id: true }
    });
    approvers.push(...users.map(u => u.id));
  }
  break;
```

---

## 📖 **Two Role Systems in Procurement**

| Type | Purpose | Values | Where Used |
|------|---------|--------|------------|
| **Department Role** | Requisition approval power | HEAD, DEPUTY, MEMBER | `user.departmentRole` |
| **System Role Code** | Invoice/PO approval configs | FIN_MGR, PROC_OFF, etc. | `user.roleCode` + approval configs |

### **Example User:**
```json
{
  "email": "john@company.com",
  
  // For requisition approvals:
  "userDepartment": "Finance",
  "departmentRole": "HEAD",        // ← Can approve Finance requisitions
  
  // For invoice/PO approvals:
  "roleCode": "FIN_MGR"            // ← Can approve based on approval config
}
```

---

## 🚀 **New Endpoints**

### **1. Get All Hardcoded Roles**
```bash
GET /api/hardcoded-roles
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "code": "FIN_MGR",
      "name": "Finance Manager",
      "level": 5,
      "department": "Finance",
      "description": "Head of finance department..."
    }
    // ... 34 more roles
  ]
}
```

### **2. Get Departments with Roles**
```bash
GET /api/hardcoded-roles/departments-with-roles
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "department": "Finance",
      "departmentCode": "FINANCE",
      "description": "Finance Department",
      "roles": [
        {
          "code": "FIN_MGR",
          "name": "Finance Manager",
          "level": 5,
          "department": "Finance",
          "description": "Head of finance department..."
        }
        // ... 4 more finance roles
      ]
    }
    // ... 6 more departments
  ]
}
```

---

## ✅ **Migration Checklist**

- [x] Added `roleCode` field to User model
- [x] Added `roleCode` field to ProcurementApprovalStage model
- [x] Created database migration
- [x] Updated ProcurementApprovalConfigService to use `roleCode`
- [x] Created hardcoded roles configuration (35 roles)
- [x] Created API endpoints for hardcoded roles
- [x] Updated all documentation
- [x] Added Swagger documentation
- [x] Backward compatibility maintained (old `roleId` still works)

---

## 📝 **How to Use**

### **Step 1: Assign Role Code to User**
```bash
PATCH /api/users/:userId
{
  "roleCode": "FIN_MGR",
  "userDepartment": "Finance",
  "departmentRole": "HEAD"
}
```

### **Step 2: Create Approval Config**
```bash
POST /api/procurement-approval-configs
{
  "name": "Standard Procurement",
  "description": "Standard approval flow",
  "stages": [
    {
      "stageType": "INVOICE",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Finance Manager Approval",
          "stepType": "ROLE",
          "roleCode": "FIN_MGR"  // ← Use hardcoded role code!
        }
      ]
    }
  ]
}
```

### **Step 3: Test!**
Any user with `roleCode = "FIN_MGR"` can now approve invoices! 🎉

---

## 🎉 **Benefits**

1. **Simpler Setup** - No need to create roles in database
2. **No ID Tracking** - Just use role codes directly
3. **Better Code Readability** - Clear what each role does
4. **Easier Testing** - No need to query for role IDs
5. **Consistent** - All departments have same role structure

---

## 🔗 **Related Files**

- `src/config/hardcodedRoles.ts` - Role definitions
- `src/controllers/HardcodedRoleController.ts` - API controller
- `src/routes/hardcodedRoleRoutes.ts` - API routes
- `src/services/ProcurementApprovalConfigService.ts` - Updated approval logic
- `prisma/schema.prisma` - Schema changes
- `HARDCODED_ROLES_API_DOCUMENTATION.md` - API docs
- `QUICK_PROCUREMENT_CONFIG_SETUP.md` - Updated setup guide

---

## ⚠️ **Backward Compatibility**

The old `roleId` system still works! The code checks for `roleCode` first, then falls back to `roleId`:

```typescript
if (stage.roleCode) {
  // Use new hardcoded role system
} else if (stage.roleId) {
  // Fallback to old database role system
}
```

---

**Migration complete!** 🚀 Everything is now using hardcoded roles!






