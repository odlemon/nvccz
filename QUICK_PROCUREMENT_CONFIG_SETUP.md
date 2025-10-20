# ⚡ QUICK PROCUREMENT CONFIGURATION SETUP

## 🎯 **JUST THE CONFIGURATION - 5 MINUTES**

This guide covers ONLY the approval configuration setup so you can start testing immediately.

---

## 📚 **IMPORTANT: HARDCODED VALUES IN PROCUREMENT**

### **🏢 Hardcoded Departments (User Assignment)**
The procurement system uses **7 hardcoded department names**:

1. 💰 **Finance**
2. ⚙️ **Operations**  
3. 📦 **Procurement**
4. 👥 **Human Resources**
5. 📢 **Marketing**                                                                                             
6. ⚖️ **Legal**
7. 💻 **IT**

These go in the `userDepartment` field (string, not ID).

---

### **👔 Hardcoded Department Roles (User Assignment)**
Users also have a **department role** within their department:

1. **HEAD** - Department head (can approve)
2. **DEPUTY** - Deputy head (can approve)
3. **MEMBER** - Regular member (cannot approve)

These go in the `departmentRole` field (string, not ID).

**Example:**
- John is **Finance HEAD** → Can approve Finance requisitions
- Jane is **Finance DEPUTY** → Can approve Finance requisitions
- Bob is **Finance MEMBER** → Can only create requisitions, cannot approve

---

### **🔐 Hardcoded System Roles (For Approvals!)** ✨ **NEW!**
We have **35 hardcoded roles** like FIN_MGR, PROC_OFF, etc:
- **Purpose:** Approval configurations, display in UI, user organization
- **Used in:** Approval configs via `roleCode` field
- **Get them:** `GET /api/hardcoded-roles/departments-with-roles`

**Examples:**
- Finance: `FIN_MGR`, `FIN_OFF`, `ACCOUNTANT`, `FIN_ASST`, `FIN_MEM`
- Procurement: `PROC_MGR`, `PROC_OFF`, `BUYER`, `PROC_COORD`, `PROC_MEM`
- Operations: `OPS_MGR`, `OPS_OFF`, `OPS_COORD`, `OPS_ANALYST`, `OPS_MEM`

---

### **📦 Database Roles (DEPRECATED)** ⚠️
**These are NO LONGER USED for approval configurations!**
- Only kept for backwards compatibility
- Use `roleCode` (hardcoded roles) instead of `roleId`

---

## 📊 **TWO TYPES OF ROLES - DON'T CONFUSE THEM!**

| Type | Purpose | Values | Where Used |
|------|---------|--------|------------|
| **Department Role** | Requisition approval power | HEAD, DEPUTY, MEMBER | `departmentRole` field |
| **System Role Code** | Invoice/PO approval configs | FIN_MGR, PROC_OFF, etc. | `roleCode` field + approval configs |

**Both work together:**
```json
{
  "user": "John",
  // For requisition approvals:
  "userDepartment": "Finance",          // ← Hardcoded department
  "departmentRole": "HEAD",             // ← Hardcoded (can approve requisitions)
  
  // For invoice/PO approvals (approval configs):
  "roleCode": "FIN_MGR"                 // ← Hardcoded role code (NEW!)
}
```

**No more database roles! Everything is hardcoded! 🎉**

---

## **STEP 1: Login and Get Token**

```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {...}
}
```

**✅ SAVE THIS TOKEN!**

---

## **STEP 2: List Hardcoded Roles**

✨ **NEW!** Fetch all hardcoded roles for approval configurations:

```bash
GET http://localhost:3000/api/hardcoded-roles
Authorization: Bearer YOUR_TOKEN_HERE
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
    },
    {
      "code": "PROC_MGR",
      "name": "Procurement Manager",
      "level": 5,
      "department": "Procurement",
      "description": "Head of procurement department..."
    }
    // ... 33 more roles
  ]
}
```

**Or get roles grouped by department:**
```bash
GET http://localhost:3000/api/hardcoded-roles/departments-with-roles
Authorization: Bearer YOUR_TOKEN_HERE
```

---

## **STEP 2a: Assign Role Codes to Users**

✨ **NEW!** Assign hardcoded `roleCode` to users (no need to create roles!):

```bash
PATCH http://localhost:3000/api/users/:userId
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "roleCode": "FIN_MGR",
  "userDepartment": "Finance",
  "departmentRole": "HEAD"
}
```

**Available Role Codes:** (35 total)
- Finance: `FIN_MGR`, `FIN_OFF`, `ACCOUNTANT`, `FIN_ASST`, `FIN_MEM`
- Procurement: `PROC_MGR`, `PROC_OFF`, `BUYER`, `PROC_COORD`, `PROC_MEM`
- Operations: `OPS_MGR`, `OPS_OFF`, `OPS_COORD`, `OPS_ANALYST`, `OPS_MEM`
- HR: `HR_MGR`, `HR_OFF`, `RECRUITER`, `HR_COORD`, `HR_MEM`
- Marketing: `MKT_MGR`, `MKT_OFF`, `CONTENT_CREATOR`, `SOCIAL_MEDIA_MGR`, `MKT_MEM`
- Legal: `LEGAL_MGR`, `LEGAL_OFF`, `COMPLIANCE_OFF`, `LEGAL_ADVISOR`, `LEGAL_MEM`
- IT: `IT_MGR`, `SYSADMIN`, `DEVELOPER`, `IT_SUPPORT`, `IT_MEM`

**✅ NO IDs TO SAVE! Just use the role codes directly!**

---

## **STEP 3: Get Department IDs (If Using DEPARTMENT Step Type)**

```bash
GET http://localhost:3000/api/departments
Authorization: Bearer YOUR_TOKEN_HERE
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "cm2xdept123",
      "name": "Finance Department",
      "isActive": true
    }
  ]
}
```

**Note:** You may need to create departments if none exist.

**✅ SAVE DEPARTMENT IDs if using DEPARTMENT step type!**

---

## **STEP 4: Create Approval Configuration**

Use the Role IDs you created/saved above:

```bash
POST http://localhost:3000/api/procurement-approval-configs
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json

{
  "name": "Finance Department Approval Config",
  "description": "Approval workflow for Finance department",
  "department": "Finance",  // ← NEW! Department-specific config
  "isActive": true,
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Finance Manager Approval",
          "stepType": "ROLE",
          "roleCode": "FIN_MGR",  // ← Hardcoded role code (NEW!)
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
          "roleCode": "FIN_MGR",  // ← Hardcoded role code
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

### **📝 Step Type Options:**

You can use different `stepType` values:

**1. ROLE (Recommended)** - Requires user with specific role
```json
{
  "stepType": "ROLE",
  "roleCode": "FIN_MGR"  // ← No more IDs! Just use role code
}
```

**2. USER** - Requires specific user
```json
{
  "stepType": "USER",
  "userId": "cm2xuser456"
}
```

**3. DEPARTMENT** - Requires user from specific department
```json
{
  "stepType": "DEPARTMENT",
  "departmentId": "cm2xdept789"
}
```

**4. AMOUNT_THRESHOLD** - Auto-approve below threshold
```json
{
  "stepType": "AMOUNT_THRESHOLD",
  "thresholdAmount": 1000.00
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Procurement approval configuration created successfully",
  "data": {
    "id": "config_123",
    "name": "Main Procurement Approval Config",
    "isActive": true
  }
}
```

---

## **STEP 5: Verify Configuration**

```bash
GET http://localhost:3000/api/procurement-approval-configs/active
Authorization: Bearer YOUR_TOKEN_HERE
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "config_123",
    "name": "Main Procurement Approval Config",
    "isActive": true,
    "stages": [...]
  }
}
```

---

## ✅ **DONE! Configuration is Ready**

Now you can proceed with testing the procurement flow!

See **`PROCUREMENT_SETUP_AND_TESTING_GUIDE.md`** for complete testing instructions.

---

## 🔍 **TROUBLESHOOTING**

### **Error: "Department/Role not found"**
- Make sure you're using valid department/role IDs from Steps 2 & 3

### **Error: "Approval configuration already exists"**
- Check existing configs: `GET /api/procurement-approval-configs`
- Deactivate old config: `PUT /api/procurement-approval-configs/{id}/deactivate`
- Or delete: `DELETE /api/procurement-approval-configs/{id}`

### **Error: "Unauthorized"**
- Your token expired - login again (Step 1)

---

## 📋 **QUICK REFERENCE**

```bash
# Get all configs
GET /api/procurement-approval-configs

# Get active config
GET /api/procurement-approval-configs/active

# Deactivate config
PUT /api/procurement-approval-configs/{id}/deactivate

# Delete config
DELETE /api/procurement-approval-configs/{id}
```

---

## 📝 **COMPLETE REFERENCE GUIDE**

### **🔧 For Approval Configuration - All Hardcoded! ✨**

**No more database IDs needed! Just use strings directly:**

**Departments (7 values):**
- `Finance`, `Operations`, `Procurement`, `Human Resources`, `Marketing`, `Legal`, `IT`

**Department Roles (3 values):**
- `HEAD` - Can approve requisitions  
- `DEPUTY` - Can approve requisitions  
- `MEMBER` - Cannot approve, can only create

**System Role Codes (35 values - for approvals!):**
- Finance: `FIN_MGR`, `FIN_OFF`, `ACCOUNTANT`, `FIN_ASST`, `FIN_MEM`
- Operations: `OPS_MGR`, `OPS_OFF`, `OPS_COORD`, `OPS_ANALYST`, `OPS_MEM`
- Procurement: `PROC_MGR`, `PROC_OFF`, `BUYER`, `PROC_COORD`, `PROC_MEM`
- HR: `HR_MGR`, `HR_OFF`, `RECRUITER`, `HR_COORD`, `HR_MEM`
- Marketing: `MKT_MGR`, `MKT_OFF`, `CONTENT_CREATOR`, `SOCIAL_MEDIA_MGR`, `MKT_MEM`
- Legal: `LEGAL_MGR`, `LEGAL_OFF`, `COMPLIANCE_OFF`, `LEGAL_ADVISOR`, `LEGAL_MEM`
- IT: `IT_MGR`, `SYSADMIN`, `DEVELOPER`, `IT_SUPPORT`, `IT_MEM`

Get full list: `GET /api/hardcoded-roles/departments-with-roles`

### **💡 User Setup Example:**
```json
{
  "user": "John Doe",
  "email": "john@company.com",
  
  // For requisition approvals:
  "userDepartment": "Finance",                // ← Hardcoded string
  "departmentRole": "HEAD",                   // ← Hardcoded string
  
  // For invoice/PO approvals via approval configs: 
  "roleCode": "FIN_MGR"                       // ← Hardcoded role code (NEW!)
}
```

---

## 🎯 **TYPICAL SETUP WORKFLOW**

### **Step-by-Step:**

1. **Create System Roles** (in database)
   - `finance_manager`
   - `procurement_manager`
   - `operations_manager`

2. **Assign Users** (all three fields):
   ```sql
   UPDATE users 
   SET 
     roleCode = 'FIN_MGR',              -- Hardcoded role code (NEW!)
     userDepartment = 'Finance',        -- Hardcoded string
     departmentRole = 'HEAD'            -- Hardcoded string
   WHERE email = 'john@company.com';
   ```

3. **Create Approval Config** using system role IDs

4. **Test:**
   - User with `departmentRole = 'HEAD'` can approve requisitions from their department
   - User with system role matching approval config can approve invoices

### **Common Patterns:**

**Finance Manager (Can approve everything):**
```sql
UPDATE users SET 
  roleCode = 'FIN_MGR',         -- ← Hardcoded role code
  userDepartment = 'Finance',
  departmentRole = 'HEAD';
```

**Operations Member (Can only create requisitions):**
```sql
UPDATE users SET 
  roleCode = 'OPS_MEM',         -- ← Hardcoded role code
  userDepartment = 'Operations',
  departmentRole = 'MEMBER';
```

---

**Next:** Create vendors and test the full procurement flow with vendor quotations!

**Full Guide:** `PROCUREMENT_SETUP_AND_TESTING_GUIDE.md`

