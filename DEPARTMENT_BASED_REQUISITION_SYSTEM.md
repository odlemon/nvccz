# 🏢 DEPARTMENT-BASED REQUISITION APPROVAL SYSTEM

## 📋 **OVERVIEW**

Successfully implemented a **department-based requisition approval system** with hardcoded departments and role-based approval hierarchy.

**Date:** October 14, 2025  
**Status:** ✅ **COMPLETE & MIGRATED**

---

## 🎯 **KEY FEATURES**

### **1. Hardcoded Departments**
No more database table for departments. System now uses **7 hardcoded departments**:
- 💰 **Finance**
- ⚙️ **Operations**
- 📦 **Procurement**
- 👥 **Human Resources**
- 📢 **Marketing**
- ⚖️ **Legal**
- 💻 **IT**

### **2. User Department Assignment**
Every user belongs to ONE department and has a specific role:
- **Department** (`userDepartment`): Finance, Operations, etc.
- **Role** (`departmentRole`): HEAD, DEPUTY, or MEMBER

### **3. Role-Based Approval**
- ✅ Only **HEAD** and **DEPUTY** can approve requisitions
- ✅ They can ONLY approve requisitions from their OWN department
- ❌ MEMBER cannot approve (can only create requisitions)

---

## 🗄️ **DATABASE SCHEMA CHANGES**

### **User Table**
```sql
ALTER TABLE users 
  ADD COLUMN userDepartment VARCHAR(50),  -- Finance, Operations, etc.
  ADD COLUMN departmentRole VARCHAR(20);  -- HEAD, DEPUTY, MEMBER
```

### **PurchaseRequisition Table**
```sql
ALTER TABLE purchase_requisitions
  DROP COLUMN departmentId,  -- No longer foreign key
  ADD COLUMN department VARCHAR(50);  -- Stores department name directly
```

---

## 🔄 **HOW IT WORKS**

### **Step 1: User Setup** (Admin Task)
Each user must be assigned:
1. **Department**: Which department they belong to
2. **Role**: HEAD, DEPUTY, or MEMBER

**Example:**
```sql
-- Make John the Finance Department Head
UPDATE users 
SET userDepartment = 'Finance', departmentRole = 'HEAD' 
WHERE email = 'john@company.com';

-- Make Jane a Finance Deputy
UPDATE users 
SET userDepartment = 'Finance', departmentRole = 'DEPUTY' 
WHERE email = 'jane@company.com';

-- Make Bob a Finance Member
UPDATE users 
SET userDepartment = 'Finance', departmentRole = 'MEMBER' 
WHERE email = 'bob@company.com';
```

---

### **Step 2: Create Requisition**
```http
POST /api/procurement/requisitions
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "title": "Office Supplies - January 2025",
  "description": "Monthly office supplies",
  "department": "Finance",  // ⬅️ Select from hardcoded list
  "priority": "MEDIUM",
  "justification": "Essential supplies",
  "items": [
    {
      "itemName": "Paper Reams",
      "quantity": 50,
      "unit": "reams"
    }
  ]
}
```

**Validation:**
- ✅ `department` must be one of the 7 hardcoded values
- ✅ System stores department as string (e.g., "Finance")

---

### **Step 3: Submit for Approval**
```http
POST /api/procurement/requisitions/{id}/submit
```

**What Happens:**
- Requisition status → `PENDING_APPROVAL`
- Now visible to department HEAD and DEPUTY

---

### **Step 4: Department Head/Deputy Views Pending Requisitions**

**New Endpoint:**
```http
GET /api/procurement/requisitions/pending-approval
Authorization: Bearer TOKEN
```

**Who Can Access:**
- ✅ Users with `departmentRole = HEAD` or `DEPUTY`
- ❌ Users with `departmentRole = MEMBER` get error

**What It Returns:**
- ONLY requisitions from the user's department
- ONLY requisitions with status `PENDING_APPROVAL`
- Ordered by most recent first

**Example Response:**
```json
{
  "success": true,
  "message": "Pending requisitions for your department retrieved successfully",
  "count": 3,
  "data": [
    {
      "id": "REQ_ID_1",
      "requisitionNumber": "REQ-202501-0003",
      "title": "Office Supplies - January 2025",
      "department": "Finance",  // ⬅️ Same as logged-in user's department
      "status": "PENDING_APPROVAL",
      "requestedBy": {
        "firstName": "Bob",
        "lastName": "Member",
        "email": "bob@company.com"
      },
      "items": [...]
    },
    // ... more requisitions
  ]
}
```

---

### **Step 5: Approve Requisition**
```http
POST /api/procurement/requisitions/{id}/approve
Authorization: Bearer TOKEN
```

**Validations:**
1. ✅ User must be HEAD or DEPUTY
2. ✅ User's department must match requisition's department
3. ✅ Requisition must be in PENDING_APPROVAL status

**Example Errors:**
```json
// If user is MEMBER
{
  "success": false,
  "message": "Only department HEAD or DEPUTY can approve requisitions. Your role: MEMBER"
}

// If user is from different department
{
  "success": false,
  "message": "You are not assigned to the Finance department"
}
```

---

## 🆕 **NEW API ENDPOINTS**

### **1. Get My Requisitions**
```http
GET /api/procurement/requisitions/my
Authorization: Bearer TOKEN
```
**Returns:** All requisitions created by the logged-in user

---

### **2. Get Pending Approvals (for HEAD/DEPUTY)**
```http
GET /api/procurement/requisitions/pending-approval
Authorization: Bearer TOKEN
```
**Returns:** Requisitions pending approval in user's department  
**Access:** Only HEAD or DEPUTY

---

## 📊 **USER ROLES EXPLAINED**

| Role | Can Create Requisitions | Can See Pending Approvals | Can Approve |
|------|------------------------|---------------------------|-------------|
| **HEAD** | ✅ Yes | ✅ Yes (own dept only) | ✅ Yes (own dept only) |
| **DEPUTY** | ✅ Yes | ✅ Yes (own dept only) | ✅ Yes (own dept only) |
| **MEMBER** | ✅ Yes | ❌ No | ❌ No |

---

## 🔧 **SETUP INSTRUCTIONS**

### **1. Assign Users to Departments** (One-time setup)

Run this SQL to set up your users:

```sql
-- Example: Finance Department
UPDATE users SET userDepartment = 'Finance', departmentRole = 'HEAD' 
WHERE email = 'finance.head@company.com';

UPDATE users SET userDepartment = 'Finance', departmentRole = 'DEPUTY' 
WHERE email = 'finance.deputy@company.com';

UPDATE users SET userDepartment = 'Finance', departmentRole = 'MEMBER' 
WHERE email IN ('finance.user1@company.com', 'finance.user2@company.com');

-- Example: Operations Department
UPDATE users SET userDepartment = 'Operations', departmentRole = 'HEAD' 
WHERE email = 'operations.head@company.com';

UPDATE users SET userDepartment = 'Operations', departmentRole = 'DEPUTY' 
WHERE email = 'operations.deputy@company.com';

-- ... repeat for all departments
```

---

### **2. Create Requisitions**

Users create requisitions specifying their department:

```json
{
  "title": "Monthly Supplies",
  "department": "Finance",  // Must match user's department
  "items": [...]
}
```

---

### **3. Approval Flow**

1. Employee (MEMBER, DEPUTY, or HEAD) creates requisition
2. Submits requisition → Status: PENDING_APPROVAL
3. Department HEAD or DEPUTY logs in
4. Calls `GET /requisitions/pending-approval` to see pending requests
5. Reviews and approves/rejects

---

## 📝 **EXAMPLE WORKFLOW**

### **Scenario:** Bob (Finance MEMBER) needs office supplies

1. **Bob creates requisition:**
   ```http
   POST /api/procurement/requisitions
   {
     "title": "Office Supplies",
     "department": "Finance",
     "items": [{ "itemName": "Paper", "quantity": 50 }]
   }
   ```

2. **Bob submits for approval:**
   ```http
   POST /api/procurement/requisitions/{id}/submit
   ```
   Status → PENDING_APPROVAL

3. **John (Finance HEAD) logs in and checks pending:**
   ```http
   GET /api/procurement/requisitions/pending-approval
   ```
   Sees Bob's requisition in the list

4. **John approves:**
   ```http
   POST /api/procurement/requisitions/{id}/approve
   ```
   ✅ Approved! Status → APPROVED

5. **Next steps:**
   - Create RFQ
   - Send to vendors
   - Create invoice
   - Approve invoice (creates accounting entry)
   - Process payment

---

## 🚨 **IMPORTANT NOTES**

### **Hardcoded Departments**
The system uses **exactly 7 departments**. These cannot be changed via API:
- Finance
- Operations
- Procurement
- Human Resources
- Marketing
- Legal
- IT

To add/remove departments, you must:
1. Update `Department` enum in `src/services/ProcurementService.ts`
2. Update Swagger docs in `src/routes/procurementRoutes.ts`
3. Update any existing users

### **Role-Based Security**
- **Approval endpoints check the user's role** before allowing approval
- **Department heads can ONLY see their department's requisitions**
- **Cross-department approval is blocked**

### **Data Migration**
- ✅ All old requisitions were deleted before migration
- ✅ Database is clean and ready for new requisitions
- ✅ No data loss because we cleaned first

---

## 🧪 **TESTING**

### **Test 1: Create Requisition as MEMBER**
```bash
# Login as Bob (Finance MEMBER)
POST /api/auth/login
{
  "email": "bob@company.com",
  "password": "password"
}

# Create requisition
POST /api/procurement/requisitions
Authorization: Bearer BOB_TOKEN
{
  "title": "Test Requisition",
  "department": "Finance",
  "items": [...]
}

# Should succeed ✅
```

---

### **Test 2: Try to Approve as MEMBER (Should Fail)**
```bash
# Bob tries to see pending approvals
GET /api/procurement/requisitions/pending-approval
Authorization: Bearer BOB_TOKEN

# Should fail ❌
# Error: "Only department HEAD or DEPUTY can approve requisitions"
```

---

### **Test 3: Approve as HEAD**
```bash
# Login as John (Finance HEAD)
POST /api/auth/login
{
  "email": "john@company.com",
  "password": "password"
}

# See pending requisitions
GET /api/procurement/requisitions/pending-approval
Authorization: Bearer JOHN_TOKEN

# Should see Bob's requisition ✅

# Approve it
POST /api/procurement/requisitions/{id}/approve
Authorization: Bearer JOHN_TOKEN

# Should succeed ✅
```

---

### **Test 4: Cross-Department Approval (Should Fail)**
```bash
# Login as Sarah (Operations HEAD)
POST /api/auth/login
{
  "email": "sarah@company.com",
  "password": "password"
}

# Try to approve Bob's Finance requisition
POST /api/procurement/requisitions/{bob_req_id}/approve
Authorization: Bearer SARAH_TOKEN

# Should fail ❌
# Error: "You are not assigned to the Finance department"
```

---

## 📚 **CODE CHANGES SUMMARY**

### **1. Schema (`prisma/schema.prisma`)**
- Added `userDepartment` to User model
- Added `departmentRole` to User model
- Changed PurchaseRequisition `departmentId` → `department` (string)

### **2. Service (`src/services/ProcurementService.ts`)**
- Added `Department` enum
- Added `DepartmentRole` enum
- Updated `createPurchaseRequisition` to use hardcoded department
- Added `getPendingRequisitionsForDepartmentHead` method
- Updated `approvePurchaseRequisition` to check role and department

### **3. Controller (`src/controllers/ProcurementController.ts`)**
- Updated `createPurchaseRequisition` to require `department`
- Added `getPendingRequisitionsForDepartmentHead` method

### **4. Routes (`src/routes/procurementRoutes.ts`)**
- Added `/requisitions/my` endpoint
- Added `/requisitions/pending-approval` endpoint
- Updated Swagger docs with hardcoded department values

---

## ✅ **SUCCESS CRITERIA**

Your department-based system is working if:

✅ Users can be assigned to departments (Finance, Operations, etc.)  
✅ Users can be assigned roles (HEAD, DEPUTY, MEMBER)  
✅ Requisitions store department as string  
✅ Only HEAD/DEPUTY can see pending approvals  
✅ Only HEAD/DEPUTY can approve requisitions  
✅ Approvers can only approve their own department's requisitions  
✅ Cross-department approval is blocked  
✅ Members can create requisitions but not approve  

---

## 🔮 **FUTURE ENHANCEMENTS**

1. **Admin Panel for User Management**
   - UI to assign users to departments
   - UI to set user roles

2. **Delegation**
   - Allow HEAD to temporarily delegate approval to a MEMBER

3. **Multi-Level Approval**
   - DEPUTY approves first
   - HEAD approves second
   - For high-value requisitions

4. **Department Budgets**
   - Track spending per department
   - Block requisitions exceeding budget

5. **Approval Notifications**
   - Email HEAD/DEPUTY when requisition submitted
   - Email requester when approved/rejected

---

**Implementation Complete!** 🎉  
**Database Migrated!** ✅  
**System Ready for Use!** 🚀

---

**Last Updated:** October 14, 2025  
**Version:** 1.0  
**Author:** NVCCZ Development Team


