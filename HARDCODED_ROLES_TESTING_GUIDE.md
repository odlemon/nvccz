# 🎯 HARDCODED ROLES - TESTING GUIDE

## ✅ **WHAT WAS IMPLEMENTED**

You now have hardcoded roles grouped by department! Here's what's available:

### **7 Departments, 35 Roles Total:**

1. **Finance** (5 roles)
2. **Operations** (5 roles)
3. **Procurement** (5 roles)
4. **Human Resources** (5 roles)
5. **Marketing** (5 roles)
6. **Legal** (5 roles)
7. **IT** (5 roles)

Each department has this structure:
- **Manager** (Level 5)
- **Officer/Specialist** (Level 4)
- **Coordinator/Analyst/etc** (Level 3)
- **Assistant/Support** (Level 2)
- **Member** (Level 1)

---

## 🚀 **API ENDPOINTS**

### **1. Get All Hardcoded Roles**
```bash
GET http://localhost:3000/api/hardcoded-roles
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "Hardcoded roles retrieved successfully",
  "data": [
    {
      "code": "FIN_MGR",
      "name": "Finance Manager",
      "level": 5,
      "department": "Finance",
      "description": "Head of finance department, oversees all financial operations"
    },
    {
      "code": "FIN_OFF",
      "name": "Finance Officer",
      "level": 4,
      "department": "Finance",
      "description": "Senior finance role, handles transactions and processes payments"
    },
    // ... 33 more roles
  ],
  "count": 35
}
```

---

### **2. Get All Departments**
```bash
GET http://localhost:3000/api/hardcoded-roles/departments
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "All departments retrieved successfully",
  "data": [
    {
      "name": "Finance",
      "code": "FINANCE",
      "description": "Finance Department"
    },
    {
      "name": "Operations",
      "code": "OPERATIONS",
      "description": "Operations Department"
    },
    // ... 5 more departments
  ],
  "count": 7
}
```

---

### **3. Get All Departments with Their Roles** ⭐ **RECOMMENDED**
```bash
GET http://localhost:3000/api/hardcoded-roles/departments-with-roles
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "All departments with roles retrieved successfully",
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
          "description": "Head of finance department"
        },
        {
          "code": "FIN_OFF",
          "name": "Finance Officer",
          "level": 4,
          "department": "Finance",
          "description": "Senior finance role"
        },
        // ... 3 more roles
      ]
    },
    // ... 6 more departments
  ],
  "count": 7
}
```

---

### **4. Get Roles by Department**
```bash
GET http://localhost:3000/api/hardcoded-roles/department/Finance
Authorization: Bearer YOUR_TOKEN
```

**Valid departments:** Finance, Operations, Procurement, Human Resources, Marketing, Legal, IT

**Response:**
```json
{
  "success": true,
  "message": "Roles for Finance department retrieved successfully",
  "data": {
    "department": "Finance",
    "roles": [
      {
        "code": "FIN_MGR",
        "name": "Finance Manager",
        "level": 5,
        "department": "Finance",
        "description": "Head of finance department"
      },
      // ... 4 more roles
    ],
    "count": 5
  }
}
```

---

### **5. Get Department with Roles (Structured)**
```bash
GET http://localhost:3000/api/hardcoded-roles/department/Finance/with-roles
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "Department with roles retrieved successfully",
  "data": {
    "department": "Finance",
    "departmentCode": "FINANCE",
    "description": "Finance Department",
    "roles": [
      {
        "code": "FIN_MGR",
        "name": "Finance Manager",
        "level": 5,
        "department": "Finance",
        "description": "Head of finance department"
      },
      // ... 4 more roles
    ]
  }
}
```

---

### **6. Get Role by Code**
```bash
GET http://localhost:3000/api/hardcoded-roles/role/FIN_MGR
Authorization: Bearer YOUR_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "Role retrieved successfully",
  "data": {
    "code": "FIN_MGR",
    "name": "Finance Manager",
    "level": 5,
    "department": "Finance",
    "description": "Head of finance department, oversees all financial operations"
  }
}
```

---

## 📋 **COMPLETE ROLE LIST**

### **💰 Finance Department**
- `FIN_MGR` - Finance Manager (Level 5)
- `FIN_OFF` - Finance Officer (Level 4)
- `ACCOUNTANT` - Accountant (Level 3)
- `FIN_ASST` - Finance Assistant (Level 2)
- `FIN_MEM` - Finance Member (Level 1)

### **⚙️ Operations Department**
- `OPS_MGR` - Operations Manager (Level 5)
- `OPS_OFF` - Operations Officer (Level 4)
- `OPS_COORD` - Operations Coordinator (Level 3)
- `OPS_ANALYST` - Operations Analyst (Level 2)
- `OPS_MEM` - Operations Member (Level 1)

### **📦 Procurement Department**
- `PROC_MGR` - Procurement Manager (Level 5)
- `PROC_OFF` - Procurement Officer (Level 4)
- `BUYER` - Buyer (Level 3)
- `PROC_COORD` - Procurement Coordinator (Level 2)
- `PROC_MEM` - Procurement Member (Level 1)

### **👥 Human Resources Department**
- `HR_MGR` - HR Manager (Level 5)
- `HR_OFF` - HR Officer (Level 4)
- `RECRUITER` - Recruiter (Level 3)
- `HR_COORD` - HR Coordinator (Level 2)
- `HR_MEM` - HR Member (Level 1)

### **📢 Marketing Department**
- `MKT_MGR` - Marketing Manager (Level 5)
- `MKT_OFF` - Marketing Officer (Level 4)
- `CONTENT_CREATOR` - Content Creator (Level 3)
- `SOCIAL_MEDIA_MGR` - Social Media Manager (Level 2)
- `MKT_MEM` - Marketing Member (Level 1)

### **⚖️ Legal Department**
- `LEGAL_MGR` - Legal Manager (Level 5)
- `LEGAL_OFF` - Legal Officer (Level 4)
- `COMPLIANCE_OFF` - Compliance Officer (Level 3)
- `LEGAL_ADVISOR` - Legal Advisor (Level 2)
- `LEGAL_MEM` - Legal Member (Level 1)

### **💻 IT Department**
- `IT_MGR` - IT Manager (Level 5)
- `SYSADMIN` - System Administrator (Level 4)
- `DEVELOPER` - Developer (Level 3)
- `IT_SUPPORT` - IT Support Specialist (Level 2)
- `IT_MEM` - IT Member (Level 1)

---

## 💡 **HOW TO USE THESE ROLES**

### **1. Assign Role to User**

Update user with role code and department:

```sql
UPDATE users 
SET 
  roleCode = 'FIN_MGR',          -- Hardcoded role code
  userDepartment = 'Finance',     -- Hardcoded department
  departmentRole = 'HEAD'         -- Still using HEAD/DEPUTY/MEMBER for procurement approvals
WHERE email = 'john@company.com';
```

**Note:** You may need to add `roleCode` field to users table if not exists.

### **2. Use in Procurement Approval Config**

```json
{
  "stageType": "INVOICE",
  "steps": [
    {
      "stepNumber": 1,
      "stepName": "Finance Manager Approval",
      "stepType": "ROLE_CODE",
      "roleCode": "FIN_MGR",
      "isRequired": true
    }
  ]
}
```

---

## 🎯 **BENEFITS**

✅ **Hardcoded** - No database queries needed  
✅ **Structured** - Organized by department  
✅ **Hierarchical** - 5 levels per department  
✅ **Fast** - Instant lookups  
✅ **Consistent** - Same roles across deployments  
✅ **Easy to use** - Simple API endpoints  

---

## 📚 **Swagger Documentation**

Visit: `http://localhost:3000/api-docs`

Look for the **"Hardcoded Roles"** section!

---

## ✅ **NEXT STEPS**

1. ✅ Test the endpoints above
2. ✅ Decide if you want to:
   - Add `roleCode` field to users table
   - Use these instead of database roles
   - Update procurement approval config to use `roleCode` instead of `roleId`
3. ✅ Update user assignment logic

---

**Server is running!** Test now: `http://localhost:3000` 🚀






