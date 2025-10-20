# 📋 PROCUREMENT MODULE - HARDCODED VALUES REFERENCE

## 🎯 **QUICK REFERENCE**

This document lists ALL hardcoded values in the procurement system that you can use directly without looking up IDs.

---

## 🏢 **HARDCODED DEPARTMENTS** (7 Values)

Use these EXACT strings in the `userDepartment` field:

```
Finance
Operations
Procurement
Human Resources
Marketing
Legal
IT
```

**Example:**
```json
{
  "userDepartment": "Finance"
}
```

---

## 👔 **HARDCODED DEPARTMENT ROLES** (3 Values)

Use these EXACT strings in the `departmentRole` field:

```
HEAD
DEPUTY
MEMBER
```

**Permissions:**
- ✅ **HEAD** - Can approve requisitions from their department
- ✅ **DEPUTY** - Can approve requisitions from their department
- ❌ **MEMBER** - Can only create requisitions, CANNOT approve

**Example:**
```json
{
  "departmentRole": "HEAD"
}
```

---

## 🔐 **SYSTEM ROLES** (Database - NOT Hardcoded)

System roles are stored in the database and need to be created/queried:

**Default from seed:**
- `admin` - Full system access

**You need to create:**
- `finance_manager`
- `procurement_manager`
- `operations_manager`
- `ceo`
- etc.

**To get role IDs:**
```bash
GET /api/roles
```

**To create new role:**
```bash
POST /api/roles
{
  "name": "finance_manager",
  "description": "Finance Manager Role",
  "permissions": [...]
}
```

---

## 📊 **COMPARISON TABLE**

| Field | Type | Values | Where Used |
|-------|------|--------|------------|
| `userDepartment` | Hardcoded String | Finance, Operations, Procurement, Human Resources, Marketing, Legal, IT | User profile |
| `departmentRole` | Hardcoded String | HEAD, DEPUTY, MEMBER | User profile |
| `roleId` | Database ID | cm2x..., (various) | User profile + Approval configs |

---

## 💡 **COMPLETE USER SETUP EXAMPLE**

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@company.com",
  "roleId": "cm2xfinmgr123",          // ← From database (GET /api/roles)
  "userDepartment": "Finance",         // ← Hardcoded (copy from list above)
  "departmentRole": "HEAD"             // ← Hardcoded (copy from list above)
}
```

**SQL Example:**
```sql
UPDATE users 
SET 
  roleId = 'cm2xfinmgr123',      -- From database
  userDepartment = 'Finance',     -- Hardcoded string
  departmentRole = 'HEAD'         -- Hardcoded string
WHERE email = 'john@company.com';
```

---

## 🏗️ **APPROVAL CONFIGURATION STEP TYPES**

When creating approval configs, you can use these `stepType` values:

### **1. ROLE** (Uses System Role ID from database)
```json
{
  "stepType": "ROLE",
  "roleId": "cm2xroleid123"
}
```

### **2. USER** (Uses User ID from database)
```json
{
  "stepType": "USER",
  "userId": "cm2xuserid456"
}
```

### **3. DEPARTMENT** (Uses Department ID from database)
```json
{
  "stepType": "DEPARTMENT",
  "departmentId": "cm2xdeptid789"
}
```

### **4. AMOUNT_THRESHOLD** (Auto-approve below amount)
```json
{
  "stepType": "AMOUNT_THRESHOLD",
  "thresholdAmount": 1000.00
}
```

---

## 📝 **REQUISITION CREATION EXAMPLE**

When creating a requisition, use the hardcoded department:

```bash
POST /api/procurement/requisitions
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "title": "Office Supplies",
  "description": "Monthly supplies",
  "department": "Finance",          // ← Hardcoded department
  "priority": "MEDIUM",
  "items": [
    {
      "itemName": "Paper Reams",
      "quantity": 50,
      "unit": "reams"
    }
  ]
}
```

---

## ✅ **APPROVAL WORKFLOW**

### **Who Can Approve Requisitions?**
1. User must have `departmentRole` = `HEAD` or `DEPUTY`
2. User must belong to the SAME department as the requisition
3. Requisition must be in `PENDING_APPROVAL` status

**Example:**
- John is **Finance HEAD** → ✅ Can approve Finance requisitions
- Jane is **Operations DEPUTY** → ✅ Can approve Operations requisitions  
- Bob is **Finance MEMBER** → ❌ Cannot approve anything

### **Who Can Approve Invoices?**
Based on the approval configuration:
- If config uses `stepType: "ROLE"` with `roleId: "finance_manager_id"`
- Then users with that system role can approve

---

## 🎯 **TESTING CHECKLIST**

### **Setup:**
- [ ] Created system roles (finance_manager, etc.)
- [ ] Assigned users' `roleId` (from database)
- [ ] Assigned users' `userDepartment` (hardcoded string)
- [ ] Assigned users' `departmentRole` (hardcoded string)
- [ ] Created approval configuration

### **Test Cases:**
- [ ] Finance HEAD can approve Finance requisitions ✅
- [ ] Finance MEMBER cannot approve Finance requisitions ❌
- [ ] Finance HEAD cannot approve Operations requisitions ❌
- [ ] User with finance_manager role can approve invoices ✅

---

## 🚨 **COMMON MISTAKES**

### ❌ **WRONG - Using IDs for hardcoded values:**
```json
{
  "userDepartment": "dept_123",        // ❌ NO! Don't use IDs
  "departmentRole": "role_456"         // ❌ NO! Don't use IDs
}
```

### ✅ **CORRECT - Using hardcoded strings:**
```json
{
  "userDepartment": "Finance",         // ✅ YES! Use exact string
  "departmentRole": "HEAD"             // ✅ YES! Use exact string
}
```

### ❌ **WRONG - Case sensitivity:**
```json
{
  "userDepartment": "finance",         // ❌ NO! Lowercase
  "departmentRole": "Head"             // ❌ NO! Wrong case
}
```

### ✅ **CORRECT - Exact case:**
```json
{
  "userDepartment": "Finance",         // ✅ YES! Capital F
  "departmentRole": "HEAD"             // ✅ YES! All caps
}
```

---

## 📚 **RELATED DOCUMENTATION**

- `QUICK_PROCUREMENT_CONFIG_SETUP.md` - Configuration setup guide
- `PROCUREMENT_SETUP_AND_TESTING_GUIDE.md` - Complete testing guide
- `DEPARTMENT_BASED_REQUISITION_SYSTEM.md` - Department system details

---

**Version:** 1.0.0  
**Last Updated:** October 16, 2025  
**Status:** ✅ Complete Reference






