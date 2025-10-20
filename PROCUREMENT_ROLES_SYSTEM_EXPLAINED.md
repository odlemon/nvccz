# ✨ PROCUREMENT ROLES SYSTEM - COMPLETE EXPLANATION (UPDATED!)

## 🎯 **OVERVIEW**

The procurement system now uses **TWO SIMPLE TYPES of roles** that work together:

1. **Hardcoded Department Roles** (HEAD/DEPUTY/MEMBER) - For requisition approvals
2. **Hardcoded System Role Codes** (35 roles like FIN_MGR) - For invoice/PO approvals

**✨ NEW:** No more database roles for approvals! Everything is hardcoded now!

---

## 📊 **THE TWO ROLE SYSTEMS**

### **1. Hardcoded Department Roles (3 Values)**

```
HEAD    - Department head, can approve requisitions
DEPUTY  - Deputy head, can approve requisitions  
MEMBER  - Regular member, CANNOT approve requisitions
```

**Purpose:** Requisition approval authority within department  
**Field:** `user.departmentRole` (string)  
**Used For:**
- **Requisition Approvals** - Only HEAD and DEPUTY can approve
- Department hierarchy

**Code Implementation:**
```typescript
// From ProcurementService.ts
if (!approver.departmentRole || 
    (approver.departmentRole !== DepartmentRole.HEAD && 
     approver.departmentRole !== DepartmentRole.DEPUTY)) {
  throw new Error("Only department HEAD or DEPUTY can approve requisitions");
}
```

**Example:**
```json
{
  "user": "John Doe",
  "userDepartment": "Finance",     // ← Which department
  "departmentRole": "HEAD"         // ← Can approve Finance requisitions
}
```

---

### **2. Hardcoded System Role Codes (35 Roles)** ✨ **NEW!**

```
Finance:     FIN_MGR, FIN_OFF, ACCOUNTANT, FIN_ASST, FIN_MEM
Operations:  OPS_MGR, OPS_OFF, OPS_COORD, OPS_ANALYST, OPS_MEM
Procurement: PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM
HR:          HR_MGR, HR_OFF, RECRUITER, HR_COORD, HR_MEM
Marketing:   MKT_MGR, MKT_OFF, CONTENT_CREATOR, SOCIAL_MEDIA_MGR, MKT_MEM
Legal:       LEGAL_MGR, LEGAL_OFF, COMPLIANCE_OFF, LEGAL_ADVISOR, LEGAL_MEM
IT:          IT_MGR, SYSADMIN, DEVELOPER, IT_SUPPORT, IT_MEM
```

**Purpose:** Invoice/PO approval configurations, user display  
**Field:** `user.roleCode` (string)  
**Used For:**
- **Approval Configurations** - Defining who can approve invoices, POs, GRNs
- Displaying user's position in UI
- User profiles
- HR purposes

**Location:** `src/config/hardcodedRoles.ts`

**Code Implementation:**
```typescript
// In ProcurementApprovalConfigService.ts
case 'ROLE':
  if (stage.roleCode) {
    const users = await prisma.user.findMany({
      where: { roleCode: stage.roleCode },  // ← Match by role code!
      select: { id: true }
    });
    approvers.push(...users.map(u => u.id));
  }
  break;
```

**Example:**
```json
{
  "user": "John Doe",
  "roleCode": "FIN_MGR"  // ← Can approve based on approval config
}
```

---

## 🔗 **HOW THEY WORK TOGETHER**

### **Complete User Setup:**
```json
{
  "user": "John Doe",
  "email": "john@company.com",
  
  // For requisition approvals:
  "userDepartment": "Finance",     // ← Which department
  "departmentRole": "HEAD",        // ← Can approve Finance requisitions
  
  // For invoice/PO approvals (via approval configs):
  "roleCode": "FIN_MGR"            // ← Can approve based on approval config
}
```

---

## 📋 **APPROVAL CONFIGURATION EXAMPLE**

### **Setup:**
```bash
POST /api/procurement-approval-configs
{
  "name": "Standard Procurement",
  "description": "Standard approval workflow",
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
    },
    {
      "stageType": "PURCHASE_ORDER",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Procurement Manager Approval",
          "stepType": "ROLE",
          "roleCode": "PROC_MGR"  // ← Use hardcoded role code!
        }
      ]
    }
  ]
}
```

### **Result:**
- Any user with `roleCode = "FIN_MGR"` can approve invoices
- Any user with `roleCode = "PROC_MGR"` can approve purchase orders

---

## 🎬 **COMPLETE WORKFLOW EXAMPLE**

### **1. User Creation:**
```bash
POST /api/users
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@company.com",
  "password": "password123",
  "userDepartment": "Finance",
  "departmentRole": "HEAD",
  "roleCode": "FIN_MGR"
}
```

### **2. Create Requisition:**
```typescript
// John creates a requisition
POST /api/purchase-requisitions
{
  "items": [...],
  "justification": "Need office supplies",
  "department": "Finance"  // ← Must match John's userDepartment
}
```

**Result:** Requisition created with status `PENDING_APPROVAL`

### **3. Approve Requisition:**
```typescript
// Jane (Finance DEPUTY) approves
POST /api/purchase-requisitions/:id/approve
```

**Check:**
- ✅ Jane has `userDepartment = "Finance"` (matches requisition department)
- ✅ Jane has `departmentRole = "DEPUTY"` (can approve)

**Result:** Requisition approved, becomes Purchase Order

### **4. Approve Invoice:**
```typescript
// Invoice approval uses approval config
// Config says: "FIN_MGR" can approve invoices

POST /api/procurement-invoices/:id/approve
```

**Check:**
- ✅ User has `roleCode = "FIN_MGR"` (matches approval config)

**Result:** Invoice approved!

---

## 📊 **COMPARISON TABLE**

| Aspect | Department Role | System Role Code |
|--------|----------------|------------------|
| **Field** | `departmentRole` | `roleCode` |
| **Values** | HEAD, DEPUTY, MEMBER | FIN_MGR, PROC_MGR, etc. (35 total) |
| **Purpose** | Requisition approvals | Invoice/PO approvals |
| **Hardcoded?** | ✅ Yes | ✅ Yes |
| **Needs DB setup?** | ❌ No | ❌ No |
| **Used in approval config?** | ❌ No | ✅ Yes |

---

## 🚀 **API ENDPOINTS**

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
      "roles": [...]
    }
    // ... 6 more departments
  ]
}
```

---

## 💡 **COMMON PATTERNS**

### **Finance Manager (Can approve everything):**
```typescript
{
  "userDepartment": "Finance",
  "departmentRole": "HEAD",     // ← Can approve Finance requisitions
  "roleCode": "FIN_MGR"         // ← Can approve invoices (if config allows)
}
```

### **Procurement Officer (Can approve POs only):**
```typescript
{
  "userDepartment": "Procurement",
  "departmentRole": "MEMBER",   // ← CANNOT approve requisitions
  "roleCode": "PROC_OFF"        // ← Can approve POs (if config allows)
}
```

### **Operations Member (Can only create):**
```typescript
{
  "userDepartment": "Operations",
  "departmentRole": "MEMBER",   // ← CANNOT approve requisitions
  "roleCode": "OPS_MEM"         // ← Probably won't be in approval configs
}
```

---

## 🔍 **KEY DIFFERENCES**

### **Requisition Approval (Department-Based):**
```typescript
// Automatic - no configuration needed
// Rules:
// 1. Must be in same department as requisition
// 2. Must be HEAD or DEPUTY

if (user.userDepartment === requisition.department && 
    (user.departmentRole === 'HEAD' || user.departmentRole === 'DEPUTY')) {
  // Can approve
}
```

### **Invoice/PO Approval (Config-Based):**
```typescript
// Must match approval configuration
// Rules:
// 1. Config must exist
// 2. User's roleCode must match config's roleCode

if (user.roleCode === approvalStep.roleCode) {
  // Can approve
}
```

---

## 📁 **FILE LOCATIONS**

### **Schema:**
- `prisma/schema.prisma` - User model with `roleCode` field

### **Hardcoded Roles:**
- `src/config/hardcodedRoles.ts` - All 35 role definitions

### **Services:**
- `src/services/ProcurementService.ts` - Requisition approvals (uses `departmentRole`)
- `src/services/ProcurementApprovalConfigService.ts` - Invoice/PO approvals (uses `roleCode`)

### **API:**
- `src/routes/hardcodedRoleRoutes.ts` - Role endpoints
- `src/controllers/HardcodedRoleController.ts` - Role controller

---

## ✅ **QUICK CHECKLIST**

When setting up a user for procurement:

1. ✅ Assign `userDepartment` (e.g., "Finance")
2. ✅ Assign `departmentRole` (HEAD/DEPUTY/MEMBER)
3. ✅ Assign `roleCode` (e.g., "FIN_MGR")
4. ✅ Create approval config using `roleCode` for invoice/PO approvals

---

## 🎉 **BENEFITS OF NEW SYSTEM**

1. **Simple** - No need to create roles in database
2. **Clear** - Easy to understand who can approve what
3. **No IDs** - Just use role codes directly
4. **Consistent** - All departments have same structure
5. **Type-Safe** - Role codes are hardcoded strings

---

## 📚 **RELATED DOCUMENTATION**

- `HARDCODED_ROLES_API_DOCUMENTATION.md` - API endpoints
- `HARDCODED_ROLES_MIGRATION_COMPLETE.md` - Migration details
- `QUICK_PROCUREMENT_CONFIG_SETUP.md` - Setup guide
- `PROCUREMENT_END_TO_END_TESTING_GUIDE.md` - Testing guide

---

**Everything is now using hardcoded roles! 🚀 No more database role IDs needed!**
