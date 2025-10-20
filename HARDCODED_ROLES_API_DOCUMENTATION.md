# 🎯 HARDCODED ROLES - API DOCUMENTATION

## 📋 **OVERVIEW**

This document contains the API documentation for the hardcoded roles endpoints. These endpoints provide access to system roles grouped by department.

---

## 🔐 **Authentication**

All endpoints require authentication with Bearer token:
```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

## 📌 **ENDPOINTS**

### **1. Get All Hardcoded Roles**

**Endpoint:** `GET /api/hardcoded-roles`

**Description:** Retrieve all 35 hardcoded system roles across all 7 departments.

**Request:**
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
    {
      "code": "ACCOUNTANT",
      "name": "Accountant",
      "level": 3,
      "department": "Finance",
      "description": "Manages accounting entries, reconciliations, and financial records"
    },
    {
      "code": "FIN_ASST",
      "name": "Finance Assistant",
      "level": 2,
      "department": "Finance",
      "description": "Supports finance operations and assists senior staff"
    },
    {
      "code": "FIN_MEM",
      "name": "Finance Member",
      "level": 1,
      "department": "Finance",
      "description": "Basic finance access, view and create only"
    },
    {
      "code": "OPS_MGR",
      "name": "Operations Manager",
      "level": 5,
      "department": "Operations",
      "description": "Head of operations department, oversees all operational activities"
    },
    // ... 29 more roles
  ],
  "count": 35
}
```

**Response Codes:**
- `200` - Success
- `401` - Unauthorized (missing or invalid token)

---

### **2. Get All Departments with Their Roles** ⭐ **RECOMMENDED**

**Endpoint:** `GET /api/hardcoded-roles/departments-with-roles`

**Description:** Retrieve all 7 departments grouped with their respective roles. This is the preferred endpoint for getting the complete role structure organized by department.

**Request:**
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
          "description": "Head of finance department, oversees all financial operations"
        },
        {
          "code": "FIN_OFF",
          "name": "Finance Officer",
          "level": 4,
          "department": "Finance",
          "description": "Senior finance role, handles transactions and processes payments"
        },
        {
          "code": "ACCOUNTANT",
          "name": "Accountant",
          "level": 3,
          "department": "Finance",
          "description": "Manages accounting entries, reconciliations, and financial records"
        },
        {
          "code": "FIN_ASST",
          "name": "Finance Assistant",
          "level": 2,
          "department": "Finance",
          "description": "Supports finance operations and assists senior staff"
        },
        {
          "code": "FIN_MEM",
          "name": "Finance Member",
          "level": 1,
          "department": "Finance",
          "description": "Basic finance access, view and create only"
        }
      ]
    },
    {
      "department": "Operations",
      "departmentCode": "OPERATIONS",
      "description": "Operations Department",
      "roles": [
        {
          "code": "OPS_MGR",
          "name": "Operations Manager",
          "level": 5,
          "department": "Operations",
          "description": "Head of operations department, oversees all operational activities"
        },
        {
          "code": "OPS_OFF",
          "name": "Operations Officer",
          "level": 4,
          "department": "Operations",
          "description": "Manages daily operations and coordinates activities"
        },
        {
          "code": "OPS_COORD",
          "name": "Operations Coordinator",
          "level": 3,
          "department": "Operations",
          "description": "Coordinates operational tasks and processes"
        },
        {
          "code": "OPS_ANALYST",
          "name": "Operations Analyst",
          "level": 2,
          "department": "Operations",
          "description": "Analyzes operational data and provides insights"
        },
        {
          "code": "OPS_MEM",
          "name": "Operations Member",
          "level": 1,
          "department": "Operations",
          "description": "Basic operational tasks and support"
        }
      ]
    },
    {
      "department": "Procurement",
      "departmentCode": "PROCUREMENT",
      "description": "Procurement Department",
      "roles": [
        {
          "code": "PROC_MGR",
          "name": "Procurement Manager",
          "level": 5,
          "department": "Procurement",
          "description": "Head of procurement, oversees all purchasing activities"
        },
        {
          "code": "PROC_OFF",
          "name": "Procurement Officer",
          "level": 4,
          "department": "Procurement",
          "description": "Handles procurement processes and vendor management"
        },
        {
          "code": "BUYER",
          "name": "Buyer",
          "level": 3,
          "department": "Procurement",
          "description": "Creates requisitions, manages vendors, and negotiates purchases"
        },
        {
          "code": "PROC_COORD",
          "name": "Procurement Coordinator",
          "level": 2,
          "department": "Procurement",
          "description": "Coordinates procurement activities and documentation"
        },
        {
          "code": "PROC_MEM",
          "name": "Procurement Member",
          "level": 1,
          "department": "Procurement",
          "description": "Basic procurement tasks and support"
        }
      ]
    },
    {
      "department": "Human Resources",
      "departmentCode": "HUMAN_RESOURCES",
      "description": "Human Resources Department",
      "roles": [
        {
          "code": "HR_MGR",
          "name": "HR Manager",
          "level": 5,
          "department": "Human Resources",
          "description": "Head of HR department, oversees all HR operations"
        },
        {
          "code": "HR_OFF",
          "name": "HR Officer",
          "level": 4,
          "department": "Human Resources",
          "description": "Manages HR processes, employee relations, and policies"
        },
        {
          "code": "RECRUITER",
          "name": "Recruiter",
          "level": 3,
          "department": "Human Resources",
          "description": "Handles recruitment, hiring, and onboarding processes"
        },
        {
          "code": "HR_COORD",
          "name": "HR Coordinator",
          "level": 2,
          "department": "Human Resources",
          "description": "Coordinates HR activities and employee services"
        },
        {
          "code": "HR_MEM",
          "name": "HR Member",
          "level": 1,
          "department": "Human Resources",
          "description": "Basic HR tasks and administrative support"
        }
      ]
    },
    {
      "department": "Marketing",
      "departmentCode": "MARKETING",
      "description": "Marketing Department",
      "roles": [
        {
          "code": "MKT_MGR",
          "name": "Marketing Manager",
          "level": 5,
          "department": "Marketing",
          "description": "Head of marketing, oversees all marketing initiatives"
        },
        {
          "code": "MKT_OFF",
          "name": "Marketing Officer",
          "level": 4,
          "department": "Marketing",
          "description": "Manages marketing campaigns and strategies"
        },
        {
          "code": "CONTENT_CREATOR",
          "name": "Content Creator",
          "level": 3,
          "department": "Marketing",
          "description": "Creates marketing content and brand materials"
        },
        {
          "code": "SOCIAL_MEDIA_MGR",
          "name": "Social Media Manager",
          "level": 2,
          "department": "Marketing",
          "description": "Manages social media platforms and online presence"
        },
        {
          "code": "MKT_MEM",
          "name": "Marketing Member",
          "level": 1,
          "department": "Marketing",
          "description": "Basic marketing tasks and support"
        }
      ]
    },
    {
      "department": "Legal",
      "departmentCode": "LEGAL",
      "description": "Legal Department",
      "roles": [
        {
          "code": "LEGAL_MGR",
          "name": "Legal Manager",
          "level": 5,
          "department": "Legal",
          "description": "Head of legal department, oversees all legal matters"
        },
        {
          "code": "LEGAL_OFF",
          "name": "Legal Officer",
          "level": 4,
          "department": "Legal",
          "description": "Handles legal processes and documentation"
        },
        {
          "code": "COMPLIANCE_OFF",
          "name": "Compliance Officer",
          "level": 3,
          "department": "Legal",
          "description": "Ensures regulatory compliance and risk management"
        },
        {
          "code": "LEGAL_ADVISOR",
          "name": "Legal Advisor",
          "level": 2,
          "department": "Legal",
          "description": "Provides legal advice and guidance"
        },
        {
          "code": "LEGAL_MEM",
          "name": "Legal Member",
          "level": 1,
          "department": "Legal",
          "description": "Basic legal support and documentation"
        }
      ]
    },
    {
      "department": "IT",
      "departmentCode": "IT",
      "description": "IT Department",
      "roles": [
        {
          "code": "IT_MGR",
          "name": "IT Manager",
          "level": 5,
          "department": "IT",
          "description": "Head of IT department, oversees all technology operations"
        },
        {
          "code": "SYSADMIN",
          "name": "System Administrator",
          "level": 4,
          "department": "IT",
          "description": "Manages systems, infrastructure, and network"
        },
        {
          "code": "DEVELOPER",
          "name": "Developer",
          "level": 3,
          "department": "IT",
          "description": "Develops and maintains applications and systems"
        },
        {
          "code": "IT_SUPPORT",
          "name": "IT Support Specialist",
          "level": 2,
          "department": "IT",
          "description": "Provides technical support to users"
        },
        {
          "code": "IT_MEM",
          "name": "IT Member",
          "level": 1,
          "department": "IT",
          "description": "Basic IT tasks and support"
        }
      ]
    }
  ],
  "count": 7
}
```

**Response Codes:**
- `200` - Success
- `401` - Unauthorized (missing or invalid token)

---

## 📊 **DATA STRUCTURE**

### **Role Object**
```typescript
{
  code: string;          // Unique role code (e.g., "FIN_MGR")
  name: string;          // Display name (e.g., "Finance Manager")
  level: number;         // Hierarchy level 1-5 (5 = highest)
  department: string;    // Department name
  description: string;   // Role description
}
```

### **Department with Roles Object**
```typescript
{
  department: string;       // Department name (e.g., "Finance")
  departmentCode: string;   // Department code (e.g., "FINANCE")
  description: string;      // Department description
  roles: Role[];           // Array of role objects
}
```

---

## 📋 **COMPLETE ROLE LIST**

### **💰 Finance (5 roles)**
- `FIN_MGR` - Finance Manager (Level 5)
- `FIN_OFF` - Finance Officer (Level 4)
- `ACCOUNTANT` - Accountant (Level 3)
- `FIN_ASST` - Finance Assistant (Level 2)
- `FIN_MEM` - Finance Member (Level 1)

### **⚙️ Operations (5 roles)**
- `OPS_MGR` - Operations Manager (Level 5)
- `OPS_OFF` - Operations Officer (Level 4)
- `OPS_COORD` - Operations Coordinator (Level 3)
- `OPS_ANALYST` - Operations Analyst (Level 2)
- `OPS_MEM` - Operations Member (Level 1)

### **📦 Procurement (5 roles)**
- `PROC_MGR` - Procurement Manager (Level 5)
- `PROC_OFF` - Procurement Officer (Level 4)
- `BUYER` - Buyer (Level 3)
- `PROC_COORD` - Procurement Coordinator (Level 2)
- `PROC_MEM` - Procurement Member (Level 1)

### **👥 Human Resources (5 roles)**
- `HR_MGR` - HR Manager (Level 5)
- `HR_OFF` - HR Officer (Level 4)
- `RECRUITER` - Recruiter (Level 3)
- `HR_COORD` - HR Coordinator (Level 2)
- `HR_MEM` - HR Member (Level 1)

### **📢 Marketing (5 roles)**
- `MKT_MGR` - Marketing Manager (Level 5)
- `MKT_OFF` - Marketing Officer (Level 4)
- `CONTENT_CREATOR` - Content Creator (Level 3)
- `SOCIAL_MEDIA_MGR` - Social Media Manager (Level 2)
- `MKT_MEM` - Marketing Member (Level 1)

### **⚖️ Legal (5 roles)**
- `LEGAL_MGR` - Legal Manager (Level 5)
- `LEGAL_OFF` - Legal Officer (Level 4)
- `COMPLIANCE_OFF` - Compliance Officer (Level 3)
- `LEGAL_ADVISOR` - Legal Advisor (Level 2)
- `LEGAL_MEM` - Legal Member (Level 1)

### **💻 IT (5 roles)**
- `IT_MGR` - IT Manager (Level 5)
- `SYSADMIN` - System Administrator (Level 4)
- `DEVELOPER` - Developer (Level 3)
- `IT_SUPPORT` - IT Support Specialist (Level 2)
- `IT_MEM` - IT Member (Level 1)

---

## 💡 **USAGE EXAMPLES**

### **Example 1: Get all roles as a flat list**
```bash
curl -X GET "http://localhost:3000/api/hardcoded-roles" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **Example 2: Get departments grouped with roles** ⭐ **Recommended**
```bash
curl -X GET "http://localhost:3000/api/hardcoded-roles/departments-with-roles" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **Example 3: Use in frontend dropdown**
```javascript
// Fetch departments with roles
const response = await fetch('/api/hardcoded-roles/departments-with-roles', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const { data: departments } = await response.json();

// Build dropdown
departments.forEach(dept => {
  console.log(`Department: ${dept.department}`);
  dept.roles.forEach(role => {
    console.log(`  - ${role.name} (${role.code})`);
  });
});
```

---

## 🎯 **NOTES**

- All 35 roles are hardcoded in `src/config/hardcodedRoles.ts`
- No database queries needed - instant response
- Roles are grouped by 7 departments
- Each department has exactly 5 roles (Level 1-5)
- Role codes are unique across all departments
- These roles are for system users (not applicants)

---

**Version:** 1.0.0  
**Last Updated:** October 16, 2025  
**File:** `src/routes/hardcodedRoleRoutes.ts`






