# 👥 PROCUREMENT MODULE - TEST USERS

**Date Created:** January 2025  
**Purpose:** Test users for procurement module testing with different roles

---

## 🔐 **CREDENTIALS**

**⚠️ IMPORTANT:** All test users share the same password for easy testing:

```
Password: TestPass123!
```

---

## 📦 **PROCUREMENT TEST USERS (5 Users)**

### **1. Procurement Manager (HEAD)**

**Role:** `PROC_MGR` - Procurement Manager (Level 5)  
**Department Role:** `HEAD`  
**Can Approve:** ✅ Yes (Requisitions & Invoices/POs via approval config)

| Field | Value |
|-------|-------|
| **First Name** | Procurement |
| **Last Name** | Manager |
| **Email** | `proc.manager@testnvccz.com` |
| **Password** | `TestPass123!` |
| **User ID** | `cmi1giv140001unm8e66xumx6` |
| **Role Code** | `PROC_MGR` |
| **Department** | `Procurement` |
| **Department Role** | `HEAD` |

**Permissions:**
- ✅ Can approve requisitions from Procurement department
- ✅ Can approve invoices/POs (if approval config includes `PROC_MGR`)
- ✅ Full access to procurement module

---

### **2. Procurement Officer (DEPUTY)**

**Role:** `PROC_OFF` - Procurement Officer (Level 4)  
**Department Role:** `DEPUTY`  
**Can Approve:** ✅ Yes (Requisitions & Invoices/POs via approval config)

| Field | Value |
|-------|-------|
| **First Name** | Procurement |
| **Last Name** | Officer |
| **Email** | `proc.officer@testnvccz.com` |
| **Password** | `TestPass123!` |
| **User ID** | `cmi1giwn60003unm86iiyyk9m` |
| **Role Code** | `PROC_OFF` |
| **Department** | `Procurement` |
| **Department Role** | `DEPUTY` |

**Permissions:**
- ✅ Can approve requisitions from Procurement department
- ✅ Can approve invoices/POs (if approval config includes `PROC_OFF`)
- ✅ Full access to procurement module

---

### **3. Procurement Buyer (MEMBER)**

**Role:** `BUYER` - Buyer (Level 3)  
**Department Role:** `MEMBER`  
**Can Approve:** ❌ No (Requisitions), ✅ Yes (Invoices/POs via approval config)

| Field | Value |
|-------|-------|
| **First Name** | Procurement |
| **Last Name** | Buyer |
| **Email** | `proc.buyer@testnvccz.com` |
| **Password** | `TestPass123!` |
| **User ID** | `cmi1gixxs0005unm8q6mgy9gn` |
| **Role Code** | `BUYER` |
| **Department** | `Procurement` |
| **Department Role** | `MEMBER` |

**Permissions:**
- ❌ Cannot approve requisitions (MEMBER role)
- ✅ Can approve invoices/POs (if approval config includes `BUYER`)
- ✅ Can create requisitions
- ✅ Can create RFQs
- ✅ Can create invoices

---

### **4. Procurement Coordinator (MEMBER)**

**Role:** `PROC_COORD` - Procurement Coordinator (Level 2)  
**Department Role:** `MEMBER`  
**Can Approve:** ❌ No (Requisitions), ✅ Yes (Invoices/POs via approval config)

| Field | Value |
|-------|-------|
| **First Name** | Procurement |
| **Last Name** | Coordinator |
| **Email** | `proc.coordinator@testnvccz.com` |
| **Password** | `TestPass123!` |
| **User ID** | `cmi1giz840007unm8anh2wody` |
| **Role Code** | `PROC_COORD` |
| **Department** | `Procurement` |
| **Department Role** | `MEMBER` |

**Permissions:**
- ❌ Cannot approve requisitions (MEMBER role)
- ✅ Can approve invoices/POs (if approval config includes `PROC_COORD`)
- ✅ Can create requisitions
- ✅ Can coordinate procurement activities

---

### **5. Procurement Member (MEMBER)**

**Role:** `PROC_MEM` - Procurement Member (Level 1)  
**Department Role:** `MEMBER`  
**Can Approve:** ❌ No (Requisitions), ✅ Yes (Invoices/POs via approval config)

| Field | Value |
|-------|-------|
| **First Name** | Procurement |
| **Last Name** | Member |
| **Email** | `proc.member@testnvccz.com` |
| **Password** | `TestPass123!` |
| **User ID** | `cmi1gj0hz0009unm82jt9dpsa` |
| **Role Code** | `PROC_MEM` |
| **Department** | `Procurement` |
| **Department Role** | `MEMBER` |

**Permissions:**
- ❌ Cannot approve requisitions (MEMBER role)
- ✅ Can approve invoices/POs (if approval config includes `PROC_MEM`)
- ✅ Can create requisitions
- ✅ Basic procurement tasks

---

## 📊 **QUICK REFERENCE TABLE**

| User | Email | Role Code | Dept Role | Can Approve Req? | Can Approve Inv/PO? |
|------|-------|-----------|-----------|------------------|---------------------|
| Manager | `proc.manager@testnvccz.com` | `PROC_MGR` | HEAD | ✅ Yes | ✅ Yes* |
| Officer | `proc.officer@testnvccz.com` | `PROC_OFF` | DEPUTY | ✅ Yes | ✅ Yes* |
| Buyer | `proc.buyer@testnvccz.com` | `BUYER` | MEMBER | ❌ No | ✅ Yes* |
| Coordinator | `proc.coordinator@testnvccz.com` | `PROC_COORD` | MEMBER | ❌ No | ✅ Yes* |
| Member | `proc.member@testnvccz.com` | `PROC_MEM` | MEMBER | ❌ No | ✅ Yes* |

**\* Depends on approval configuration - user's roleCode must be included in the approval config steps.**

---

## 🧪 **TESTING SCENARIOS**

### **Scenario 1: Create Requisition**

**User:** Any procurement user (Manager, Officer, Buyer, Coordinator, Member)  
**Login:** Use any email above with password `TestPass123!`  
**Action:** Create a new purchase requisition  
**Expected:** ✅ Requisition created successfully

---

### **Scenario 2: Approve Requisition**

**User:** Manager or Officer (HEAD or DEPUTY role)  
**Login:** 
- `proc.manager@testnvccz.com` (HEAD)
- `proc.officer@testnvccz.com` (DEPUTY)

**Action:** Approve a submitted requisition  
**Expected:** ✅ Requisition approved successfully

**User:** Buyer, Coordinator, or Member (MEMBER role)  
**Login:** 
- `proc.buyer@testnvccz.com`
- `proc.coordinator@testnvccz.com`
- `proc.member@testnvccz.com`

**Action:** Try to approve a submitted requisition  
**Expected:** ❌ Error: "Only department HEAD or DEPUTY can approve requisitions"

---

### **Scenario 3: Approve Invoice/PO (Via Approval Config)**

**Setup:** Create approval config with `stepType: "ROLE"` and `roleCode: "BUYER"`

**User:** Buyer (`proc.buyer@testnvccz.com`)  
**Action:** Approve an invoice  
**Expected:** ✅ Invoice approved successfully (if approval config includes `BUYER`)

**User:** Member (`proc.member@testnvccz.com`)  
**Action:** Approve an invoice with config requiring `PROC_MGR`  
**Expected:** ❌ Cannot approve (roleCode doesn't match)

---

## 🔄 **ROLE-BASED ACCESS CONTROL (WHO SEES WHAT)**

### **⚠️ IMPORTANT: No `authorize` Middleware Used!**

**Role-based access control is enforced on the frontend, NOT through backend middleware.**

### **How It Works:**

1. ✅ **Frontend controls UI access** - Who sees what is enforced on the frontend based on user roles
2. ✅ **Backend only verifies authentication** - Routes use `authenticate` middleware only (NO `authorize` middleware)
3. ✅ **No role checking in routes** - Backend does NOT check user roles/permissions
4. ✅ **Approval workflow handles authorization** - The approval config system (roleCode-based) determines who can approve what

### **What This Means:**

- ✅ **Backend is role-agnostic** - Routes don't check roles
- ✅ **Frontend decides access** - Frontend shows/hides UI based on `roleCode` and `departmentRole`
- ✅ **Approval config handles approvals** - System determines who can approve based on approval configuration
- ✅ **Requisition approvals** - Controlled by `departmentRole` (HEAD/DEPUTY only) in business logic, not middleware

### **Backend Routes:**

```typescript
// procurementApprovalConfigRoutes.ts
router.use(authenticate);  // ✅ Only authentication, NO authorize

// procurementRoutes.ts
router.use(authenticate);  // ✅ Only authentication, NO authorize
```

### **Frontend Should Check:**

- User's `roleCode` (PROC_MGR, PROC_OFF, BUYER, etc.)
- User's `departmentRole` (HEAD, DEPUTY, MEMBER)
- User's `userDepartment` (Procurement, Finance, etc.)

### **Who Can See/Do What:**

| Action | Who Can Do It | Based On |
|--------|---------------|----------|
| Create Requisition | Any user | All authenticated users |
| Approve Requisition | HEAD or DEPUTY | `departmentRole` in same department |
| Create RFQ | Any user | All authenticated users |
| Create Invoice | Any user | All authenticated users |
| Approve Invoice/PO | Users with matching `roleCode` | Approval config `roleCode` |
| View Requisitions | Frontend decides | Frontend role-based UI |

**Note:** All role-based access control is handled on the frontend. Backend only verifies the user is authenticated.

---

## 🚀 **CREATING THESE USERS**

### **Option 1: Run the Script**

```bash
node scripts/create-procurement-test-users.js
```

This script will:
- ✅ Create all 5 users if they don't exist
- ✅ Skip if users already exist
- ✅ Use password: `TestPass123!`
- ✅ Set correct roleCode and departmentRole

### **Option 2: Use API**

```bash
POST /api/users
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{
  "firstName": "Procurement",
  "lastName": "Manager",
  "email": "proc.manager@testnvccz.com",
  "department": "Procurement",
  "roleCode": "PROC_MGR",
  "departmentRole": "HEAD"
}
```

---

## 📝 **LOGIN EXAMPLES**

### **Example 1: Login as Procurement Manager**

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "proc.manager@testnvccz.com",
  "password": "TestPass123!"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cm2x...",
    "firstName": "Procurement",
    "lastName": "Manager",
    "email": "proc.manager@testnvccz.com",
    "userDepartment": "Procurement",
    "departmentRole": "HEAD",
    "roleCode": "PROC_MGR"
  }
}
```

---

## ✅ **VERIFICATION CHECKLIST**

Before testing, verify:

- [ ] All 5 users exist in database
- [ ] Each user has correct `roleCode` assigned
- [ ] Each user has correct `departmentRole` assigned
- [ ] Each user belongs to `Procurement` department
- [ ] All users can login with password `TestPass123!`
- [ ] Approval configs are created (if testing invoice/PO approvals)

---

## 🔍 **CHECKING USERS**

### **Query All Procurement Users:**

```sql
SELECT 
  id,
  "firstName",
  "lastName",
  email,
  "userDepartment",
  "departmentRole",
  "roleCode"
FROM "User"
WHERE "userDepartment" = 'Procurement'
ORDER BY 
  CASE "roleCode"
    WHEN 'PROC_MGR' THEN 1
    WHEN 'PROC_OFF' THEN 2
    WHEN 'BUYER' THEN 3
    WHEN 'PROC_COORD' THEN 4
    WHEN 'PROC_MEM' THEN 5
  END;
```

---

## 🎯 **TESTING WORKFLOW**

1. **Create Approval Config** (using any of these roleCodes)
2. **Create Requisition** (using any user)
3. **Submit for Approval** (automatically assigned based on config)
4. **Approve Requisition** (using Manager or Officer - HEAD/DEPUTY)
5. **Create RFQ** (using any user)
6. **Create Invoice** (using any user)
7. **Approve Invoice** (using user with matching roleCode from config)

---

**Last Updated:** January 2025  
**Status:** ✅ Ready for Testing  
**Password:** `TestPass123!` (all users)

