# 🏢 HARDCODED DEPARTMENTS AND ROLES - CONSOLIDATED REFERENCE

## 📋 **OVERVIEW**

This document consolidates ALL hardcoded departments and roles used throughout the system. These are the definitive values that should be used for:
- Performance module KPIs
- Task creation and assignment
- User department assignment
- System organization

---

## 🏢 **HARDCODED DEPARTMENTS** (8 Total)

### **Complete Department List:**
```typescript
const DEPARTMENTS = [
  "Finance",
  "Sales",
  "Operations", 
  "Procurement",
  "Human Resources",
  "Marketing",
  "Legal",
  "IT"
] as const;
```

### **Department Details:**
1. **💰 Finance** - Financial operations, accounting, budgeting
2. **💼 Sales** - Sales operations, revenue generation, client relationships
3. **⚙️ Operations** - Daily operations, process management, production
4. **📦 Procurement** - Purchasing, vendor management, requisitions
5. **👥 Human Resources** - Employee management, recruitment, HR policies
6. **📢 Marketing** - Branding, campaigns, content creation
7. **⚖️ Legal** - Legal compliance, contracts, risk management
8. **💻 IT** - Technology, systems, infrastructure

---

## 👔 **HARDCODED ROLES** (40 Total)

### **Role Structure:**
Each department has 5 roles with hierarchical levels:
- **Level 5** - Manager (Department Head)
- **Level 4** - Officer/Specialist (Senior Role)
- **Level 3** - Coordinator/Analyst (Mid-Level)
- **Level 2** - Assistant/Support (Junior Role)
- **Level 1** - Member (Entry Level)

---

## 💰 **FINANCE DEPARTMENT** (5 Roles)

| Code | Name | Level | Description |
|------|------|-------|-------------|
| `FIN_MGR` | Finance Manager | 5 | Head of finance department, oversees all financial operations |
| `FIN_OFF` | Finance Officer | 4 | Senior finance role, handles transactions and processes payments |
| `ACCOUNTANT` | Accountant | 3 | Manages accounting entries, reconciliations, and financial records |
| `FIN_ASST` | Finance Assistant | 2 | Supports finance operations and assists senior staff |
| `FIN_MEM` | Finance Member | 1 | Basic finance access, view and create only |

---

## 💼 **SALES DEPARTMENT** (5 Roles)

| Code | Name | Level | Description |
|------|------|-------|-------------|
| `SALES_MGR` | Sales Manager | 5 | Head of sales department, oversees all sales operations and revenue generation |
| `SALES_OFF` | Sales Officer | 4 | Senior sales role, manages sales processes and client relationships |
| `SALES_REP` | Sales Representative | 3 | Handles direct sales, client acquisition, and revenue generation |
| `SALES_COORD` | Sales Coordinator | 2 | Coordinates sales activities and supports sales team |
| `SALES_MEM` | Sales Member | 1 | Basic sales tasks and support |

---

## ⚙️ **OPERATIONS DEPARTMENT** (5 Roles)

| Code | Name | Level | Description |
|------|------|-------|-------------|
| `OPS_MGR` | Operations Manager | 5 | Head of operations department, oversees all operational activities |
| `OPS_OFF` | Operations Officer | 4 | Manages daily operations and coordinates activities |
| `OPS_COORD` | Operations Coordinator | 3 | Coordinates operational tasks and processes |
| `OPS_ANALYST` | Operations Analyst | 2 | Analyzes operational data and provides insights |
| `OPS_MEM` | Operations Member | 1 | Basic operational tasks and support |

---

## 📦 **PROCUREMENT DEPARTMENT** (5 Roles)

| Code | Name | Level | Description |
|------|------|-------|-------------|
| `PROC_MGR` | Procurement Manager | 5 | Head of procurement, oversees all purchasing activities |
| `PROC_OFF` | Procurement Officer | 4 | Handles procurement processes and vendor management |
| `BUYER` | Buyer | 3 | Creates requisitions, manages vendors, and negotiates purchases |
| `PROC_COORD` | Procurement Coordinator | 2 | Coordinates procurement activities and documentation |
| `PROC_MEM` | Procurement Member | 1 | Basic procurement tasks and support |

---

## 👥 **HUMAN RESOURCES DEPARTMENT** (5 Roles)

| Code | Name | Level | Description |
|------|------|-------|-------------|
| `HR_MGR` | HR Manager | 5 | Head of HR department, oversees all HR operations |
| `HR_OFF` | HR Officer | 4 | Manages HR processes, employee relations, and policies |
| `RECRUITER` | Recruiter | 3 | Handles recruitment, hiring, and onboarding processes |
| `HR_COORD` | HR Coordinator | 2 | Coordinates HR activities and employee services |
| `HR_MEM` | HR Member | 1 | Basic HR tasks and administrative support |

---

## 📢 **MARKETING DEPARTMENT** (5 Roles)

| Code | Name | Level | Description |
|------|------|-------|-------------|
| `MKT_MGR` | Marketing Manager | 5 | Head of marketing, oversees all marketing initiatives |
| `MKT_OFF` | Marketing Officer | 4 | Manages marketing campaigns and strategies |
| `CONTENT_CREATOR` | Content Creator | 3 | Creates marketing content and brand materials |
| `SOCIAL_MEDIA_MGR` | Social Media Manager | 2 | Manages social media platforms and online presence |
| `MKT_MEM` | Marketing Member | 1 | Basic marketing tasks and support |

---

## ⚖️ **LEGAL DEPARTMENT** (5 Roles)

| Code | Name | Level | Description |
|------|------|-------|-------------|
| `LEGAL_MGR` | Legal Manager | 5 | Head of legal department, oversees all legal matters |
| `LEGAL_OFF` | Legal Officer | 4 | Handles legal processes and documentation |
| `COMPLIANCE_OFF` | Compliance Officer | 3 | Ensures regulatory compliance and risk management |
| `LEGAL_ADVISOR` | Legal Advisor | 2 | Provides legal advice and guidance |
| `LEGAL_MEM` | Legal Member | 1 | Basic legal support and documentation |

---

## 💻 **IT DEPARTMENT** (5 Roles)

| Code | Name | Level | Description |
|------|------|-------|-------------|
| `IT_MGR` | IT Manager | 5 | Head of IT department, oversees all technology operations |
| `SYSADMIN` | System Administrator | 4 | Manages systems, infrastructure, and network |
| `DEVELOPER` | Developer | 3 | Develops and maintains applications and systems |
| `IT_SUPPORT` | IT Support Specialist | 2 | Provides technical support to users |
| `IT_MEM` | IT Member | 1 | Basic IT tasks and support |

---

## 📊 **HARDCODED KPIs** (25 Total)

### **KPI Structure:**
Each KPI is assigned to a department and includes:
- **Account Type** - Revenue, Expense, Asset, Liability, or Equity
- **Account Number** - Chart of accounts mapping
- **Journal Entry Type** - Debit or Credit
- **Financial Impact** - Whether it affects financial statements

---

## 💰 **FINANCE & ACCOUNTING KPIs** (10 KPIs)

| Code | Name | Account Type | Account Number | Description |
|------|------|--------------|----------------|-------------|
| `TOTAL_REVENUE` | Total Revenue | Revenue | 4000 | Total revenue generated by the company |
| `NET_PROFIT` | Net Profit | Equity | 3200 | Net profit after all expenses |
| `OPERATING_EXPENSES` | Operating Expenses | Expense | 5090 | Total operating expenses incurred |
| `CASH_FLOW_NET` | Cash Flow (Net) | Asset | 1000 | Net cash flow from operations |
| `BUDGET_UTILISATION` | Budget Utilisation | Expense | - | Percentage of budget utilized |
| `ACCOUNTS_RECEIVABLE_OUTSTANDING` | Accounts Receivable Outstanding | Asset | 1200 | Outstanding receivables from customers |
| `ACCOUNTS_PAYABLE_OUTSTANDING` | Accounts Payable Outstanding | Liability | 2000 | Outstanding payables to suppliers |
| `TOTAL_LIABILITIES` | Total Liabilities | Liability | - | Total company liabilities |
| `SHAREHOLDERS_EQUITY` | Shareholders' Equity | Equity | 3000 | Total shareholders' equity |
| `CASH_BALANCE` | Cash Balance | Asset | 1000 | Current cash balance |

---

## 💼 **SALES & MARKETING KPIs** (5 KPIs)

| Code | Name | Account Type | Account Number | Description |
|------|------|--------------|----------------|-------------|
| `SALES_REVENUE` | Sales Revenue | Revenue | 4000 | Revenue generated from sales activities |
| `MARKETING_EXPENSE` | Marketing Expense | Expense | 5060 | Total marketing expenses incurred |
| `SALES_COMMISSION_EXPENSE` | Sales Commission Expense | Expense | 5030 | Commissions paid to sales staff |
| `ADVERTISING_SPEND` | Advertising Spend | Expense | 5060 | Total advertising expenditure |
| `PROMOTIONAL_BUDGET_UTILISATION` | Promotional Budget Utilisation | Expense | 5060 | Percentage of promotional budget utilized |

---

## 👥 **HUMAN RESOURCES KPIs** (5 KPIs)

| Code | Name | Account Type | Account Number | Description |
|------|------|--------------|----------------|-------------|
| `PAYROLL_EXPENSE` | Payroll Expense | Expense | 5030 | Total payroll expenses for all employees |
| `STAFF_WELFARE_EXPENSE` | Staff Welfare Expense | Expense | 5090 | Employee welfare and benefits expenses |
| `TRAINING_EXPENSE` | Training Expense | Expense | 5090 | Employee training and development costs |
| `RECRUITMENT_COST` | Recruitment Cost | Expense | 5090 | Costs associated with recruitment activities |
| `HR_BUDGET_UTILISATION` | HR Budget Utilisation | Expense | - | Percentage of HR budget utilized |

---

## 📦 **PROCUREMENT & PURCHASING KPIs** (5 KPIs)

| Code | Name | Account Type | Account Number | Description |
|------|------|--------------|----------------|-------------|
| `PROCUREMENT_SPEND` | Procurement Spend | Expense | 5090 | Total procurement expenditure |
| `SUPPLIER_PAYMENTS_MADE` | Supplier Payments Made | Asset | 1000 | Total payments made to suppliers |
| `OUTSTANDING_SUPPLIER_INVOICES` | Outstanding Supplier Invoices | Liability | 2000 | Unpaid supplier invoices |
| `COST_PER_PURCHASE_ORDER` | Cost per Purchase Order | Expense | 5090 | Average cost per purchase order processed |
| `PROCUREMENT_BUDGET_UTILISATION` | Procurement Budget Utilisation | Expense | - | Percentage of procurement budget utilized |

---

## ⚙️ **OPERATIONS / PRODUCTION KPIs** (2 KPIs)

| Code | Name | Account Type | Account Number | Description |
|------|------|--------------|----------------|-------------|
| `PRODUCTION_EXPENSE` | Production Expense | Expense | 5090 | Total production-related expenses |
| `RAW_MATERIAL_COST` | Raw Material Cost | Expense | 5090 | Cost of raw materials used in production |

---

## 🔧 **USAGE IN PERFORMANCE MODULE**

### **For KPI Assignment:**
```typescript
// Each KPI should be assigned to a department
const kpiDepartment = "Finance"; // Use exact department name
const kpiCode = "TOTAL_REVENUE"; // Use exact KPI code
```

### **For Task Creation:**
```typescript
// Use hardcoded departments instead of database departments
const taskDepartment = "Operations"; // Use exact department name
```

### **For Role Assignment:**
```typescript
// Use hardcoded role codes
const userRole = "FIN_MGR"; // Use exact role code
```

### **For Accounting Integration:**
```typescript
// When KPI tasks are completed, generate journal entries
const kpi = getKPIByCode("TOTAL_REVENUE");
// This will create journal entries based on KPI account mapping
```

---

## 📊 **API ENDPOINTS**

### **Get All Departments:**
```bash
GET /api/hardcoded-roles/departments
```

### **Get All Roles:**
```bash
GET /api/hardcoded-roles
```

### **Get Department with Roles:**
```bash
GET /api/hardcoded-roles/departments-with-roles
```

### **Get All KPIs:**
```bash
GET /api/hardcoded-kpis
```

### **Get KPIs by Department:**
```bash
GET /api/hardcoded-kpis/department/{department}
```

### **Get Financial KPIs Only:**
```bash
GET /api/hardcoded-kpis/financial
```

---

## ✅ **VALIDATION FUNCTIONS**

### **Check if Department Exists:**
```typescript
import { DEPARTMENTS } from './src/config/hardcodedRoles';
const isValidDepartment = DEPARTMENTS.includes("Finance"); // true
```

### **Check if Role Code Exists:**
```typescript
import { isValidRoleCode } from './src/config/hardcodedRoles';
const isValidRole = isValidRoleCode("FIN_MGR"); // true
```

### **Check if Role Belongs to Department:**
```typescript
import { rolebelongsToDepartment } from './src/config/hardcodedRoles';
const belongsToDept = rolebelongsToDepartment("FIN_MGR", "Finance"); // true
```

### **Check if KPI Code Exists:**
```typescript
import { isValidKPICode } from './src/config/hardcodedKPIs';
const isValidKPI = isValidKPICode("TOTAL_REVENUE"); // true
```

### **Get KPI by Code:**
```typescript
import { getKPIByCode } from './src/config/hardcodedKPIs';
const kpi = getKPIByCode("TOTAL_REVENUE");
```

### **Get Financial KPIs Only:**
```typescript
import { getFinancialKPIs } from './src/config/hardcodedKPIs';
const financialKPIs = getFinancialKPIs();
```

---

## 🎯 **FOR PERFORMANCE MODULE IMPLEMENTATION**

1. **KPI Assignment:** Each KPI should be assigned to one of the 8 hardcoded departments
2. **Task Department:** Use hardcoded departments when creating tasks
3. **Role-based Access:** Use hardcoded role codes for permissions
4. **Accounting Integration:** Map KPI completions to journal entries based on KPI account mappings
5. **Financial Impact:** Only financial KPIs generate journal entries when tasks are completed

---

## 📝 **QUICK REFERENCE**

### **Department Names (Exact Strings):**
- `"Finance"`
- `"Sales"`
- `"Operations"`
- `"Procurement"`
- `"Human Resources"`
- `"Marketing"`
- `"Legal"`
- `"IT"`

### **Common Role Codes:**
- Finance: `FIN_MGR`, `FIN_OFF`, `ACCOUNTANT`, `FIN_ASST`, `FIN_MEM`
- Sales: `SALES_MGR`, `SALES_OFF`, `SALES_REP`, `SALES_COORD`, `SALES_MEM`
- Operations: `OPS_MGR`, `OPS_OFF`, `OPS_COORD`, `OPS_ANALYST`, `OPS_MEM`
- Procurement: `PROC_MGR`, `PROC_OFF`, `BUYER`, `PROC_COORD`, `PROC_MEM`
- HR: `HR_MGR`, `HR_OFF`, `RECRUITER`, `HR_COORD`, `HR_MEM`
- Marketing: `MKT_MGR`, `MKT_OFF`, `CONTENT_CREATOR`, `SOCIAL_MEDIA_MGR`, `MKT_MEM`
- Legal: `LEGAL_MGR`, `LEGAL_OFF`, `COMPLIANCE_OFF`, `LEGAL_ADVISOR`, `LEGAL_MEM`
- IT: `IT_MGR`, `SYSADMIN`, `DEVELOPER`, `IT_SUPPORT`, `IT_MEM`

### **Common KPI Codes:**
- Finance: `TOTAL_REVENUE`, `NET_PROFIT`, `OPERATING_EXPENSES`, `CASH_FLOW_NET`, `BUDGET_UTILISATION`
- Sales: `SALES_REVENUE`, `MARKETING_EXPENSE`, `SALES_COMMISSION_EXPENSE`, `ADVERTISING_SPEND`
- HR: `PAYROLL_EXPENSE`, `STAFF_WELFARE_EXPENSE`, `TRAINING_EXPENSE`, `RECRUITMENT_COST`
- Procurement: `PROCUREMENT_SPEND`, `SUPPLIER_PAYMENTS_MADE`, `OUTSTANDING_SUPPLIER_INVOICES`
- Operations: `PRODUCTION_EXPENSE`, `RAW_MATERIAL_COST`

---

**📁 File Locations:** 
- `src/config/hardcodedRoles.ts` (Departments & Roles)
- `src/config/hardcodedKPIs.ts` (KPIs)
**🔗 Related Files:** 
- `src/routes/hardcodedRoleRoutes.ts`
- `src/routes/hardcodedKPIRoutes.ts` (To be created)
