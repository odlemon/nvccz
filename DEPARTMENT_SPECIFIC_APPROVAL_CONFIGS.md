# ✨ Department-Specific Approval Configurations

## 🎯 **What Changed?**

We've added **department-specific approval configurations!** Each department can now have its own approval workflow.

---

## 🔧 **How It Works**

### **Before:**
- Only **ONE** approval config for all departments
- All departments shared the same approval rules

### **After:**
- **Multiple** approval configs - one per department!
- Each department has custom approval rules
- **Fallback** to general config if department-specific doesn't exist

---

## 📊 **Config Selection Logic**

When a requisition or invoice is created, the system:

1. **Looks for department-specific config first**
   ```sql
   WHERE isActive = true AND department = 'Finance'
   ```

2. **Falls back to general config if not found**
   ```sql
   WHERE isActive = true AND department IS NULL
   ```

3. **Throws error if neither exists**

---

## 💡 **Example Configs**

### **Finance Department Config**
```json
{
  "name": "Finance Approval Workflow",
  "description": "Approval flow for Finance department",
  "department": "Finance",  // ← Department-specific!
  "isActive": true,
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Finance Head Approval",
          "stepType": "ROLE",
          "roleCode": "FIN_MGR",
          "isRequired": true
        }
      ]
    },
    {
      "stageType": "INVOICE",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Finance Manager Approval",
          "stepType": "ROLE",
          "roleCode": "FIN_MGR",  // ← Use Finance Manager
          "isRequired": true
        },
        {
          "stepNumber": 2,
          "stepName": "CFO Approval",
          "stepType": "ROLE",
          "roleCode": "FIN_OFF",  // ← Then Finance Officer
          "isRequired": true
        }
      ]
    }
  ]
}
```

### **Operations Department Config**
```json
{
  "name": "Operations Approval Workflow",
  "description": "Approval flow for Operations department",
  "department": "Operations",  // ← Different department!
  "isActive": true,
  "stages": [
    {
      "stageType": "PURCHASE_REQUISITION",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Operations Manager Approval",
          "stepType": "ROLE",
          "roleCode": "OPS_MGR",
          "isRequired": true
        }
      ]
    },
    {
      "stageType": "INVOICE",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Operations Manager Approval Only",
          "stepType": "ROLE",
          "roleCode": "OPS_MGR",  // ← Only Ops Manager needed
          "isRequired": true
        }
      ]
    }
  ]
}
```

### **General/Default Config (Fallback)**
```json
{
  "name": "Default Approval Workflow",
  "description": "Default workflow for departments without specific config",
  "department": null,  // ← No department = general config
  "isActive": true,
  "stages": [
    {
      "stageType": "INVOICE",
      "steps": [
        {
          "stepNumber": 1,
          "stepName": "Any Manager Approval",
          "stepType": "ROLE",
          "roleCode": "FIN_MGR",  // ← Basic approval
          "isRequired": true
        }
      ]
    }
  ]
}
```

---

## 🔍 **Real-World Example**

### **Scenario:**
- Finance user creates an invoice
- Operations user creates an invoice

### **What Happens:**

**Finance Invoice:**
```typescript
// Invoice created by Finance department user
{
  "department": "Finance",
  "amount": 10000
}

// System looks for config:
1. WHERE department = "Finance" AND isActive = true  ✅ FOUND!
2. Uses Finance-specific config
3. Requires FIN_MGR → FIN_OFF approval
```

**Operations Invoice:**
```typescript
// Invoice created by Operations department user
{
  "department": "Operations",
  "amount": 5000
}

// System looks for config:
1. WHERE department = "Operations" AND isActive = true  ✅ FOUND!
2. Uses Operations-specific config
3. Requires only OPS_MGR approval (simpler!)
```

**Legal Invoice (no specific config):**
```typescript
// Invoice created by Legal department user
{
  "department": "Legal",
  "amount": 3000
}

// System looks for config:
1. WHERE department = "Legal" AND isActive = true  ❌ NOT FOUND
2. WHERE department IS NULL AND isActive = true  ✅ FOUND (fallback)
3. Uses general/default config
4. Requires FIN_MGR approval
```

---

## 🚀 **Creating Department Configs**

### **Step 1: Create Finance Config**
```bash
POST /api/procurement-approval-configs
{
  "name": "Finance Approval Workflow",
  "department": "Finance",
  "isActive": true,
  "stages": [...]
}
```

### **Step 2: Create Operations Config**
```bash
POST /api/procurement-approval-configs
{
  "name": "Operations Approval Workflow",
  "department": "Operations",
  "isActive": true,
  "stages": [...]
}
```

### **Step 3: Create Default Config (Optional)**
```bash
POST /api/procurement-approval-configs
{
  "name": "Default Approval Workflow",
  "department": null,  // ← No department = fallback
  "isActive": true,
  "stages": [...]
}
```

---

## 📋 **Valid Departments**

```
- Finance
- Operations
- Procurement
- Human Resources
- Marketing
- Legal
- IT
```

**Or `null` for general/default config**

---

## ⚙️ **Approval Flow**

```
User creates requisition/invoice
         ↓
System gets user's department (e.g., "Finance")
         ↓
Query: WHERE isActive=true AND department='Finance'
         ↓
    Found?
    ├─ YES → Use Finance-specific config
    └─ NO  → Query: WHERE isActive=true AND department IS NULL
               ├─ FOUND → Use general config
               └─ NOT FOUND → Error!
         ↓
Apply approval stages
         ↓
Create approval requests
```

---

## 🎯 **Benefits**

1. **Flexibility** - Each department can have its own rules
2. **Scalability** - Easy to add new departments
3. **Fallback** - General config for departments without specific rules
4. **Maintainability** - Update one department without affecting others

---

## ⚠️ **Important Notes**

### **1. Department Field is Optional**
- If you don't specify `department`, config applies to all departments (fallback)
- Only ONE active general config (department = null) should exist

### **2. Priority**
- Department-specific configs always take priority over general config
- If both exist, department-specific is used

### **3. Multiple Active Configs**
- You can have multiple active configs (one per department)
- Each department config must have `isActive: true`
- Only one active general config recommended

---

## 📚 **Related Documentation**

- `QUICK_PROCUREMENT_CONFIG_SETUP.md` - Setup guide
- `HARDCODED_ROLES_FINAL_SUMMARY.md` - Role codes reference
- `PROCUREMENT_ROLES_SYSTEM_EXPLAINED.md` - Roles system

---

**Now each department can have its own approval workflow! 🎉**

