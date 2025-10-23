# 📈 **PERFORMANCE MODULE KPI STRUCTURE & SEEDERS**

## 📋 **OVERVIEW**

This document explains how KPIs are structured in the performance module and provides comprehensive seeders for departments, roles, and KPIs.

---

## 🏗️ **KPI STRUCTURE IN PERFORMANCE MODULE**

### **1. Hardcoded KPIs (Configuration)**
- **Location**: `src/config/hardcodedKPIs.ts`
- **Purpose**: Define KPI metadata and accounting integration
- **Fields**:
  - `code`: Unique KPI identifier (e.g., "TOTAL_REVENUE")
  - `name`: Human-readable name (e.g., "Total Revenue")
  - `department`: Hardcoded department name (e.g., "Finance")
  - `description`: KPI description
  - `accountType`: Revenue, Expense, Asset, Liability, or Equity
  - `accountNumber`: Chart of accounts mapping (e.g., "4000")
  - `journalEntryType`: Debit or Credit
  - `isFinancial`: Whether it affects financial statements

### **2. Database KPIs (Storage)**
- **Model**: `KPI` in Prisma schema
- **Purpose**: Store KPI records for performance tracking
- **Fields**:
  - `id`: Unique identifier
  - `name`: KPI name
  - `type`: "Metric" or "Percentage"
  - `departmentId`: Link to department
  - `weightValue`: Importance weight (0.0-1.0)
  - `hasUnit`: Whether KPI has units
  - `unitCategory`: Currency, percentage, count, etc.
  - `unit`: Unit name (USD, %, Count)
  - `unitSymbol`: Display symbol ($, %, #)
  - `unitPosition`: "prefix" or "suffix"
  - `isActive`: Whether KPI is active

### **3. KPI Integration Flow**
```
Hardcoded KPIs → Database KPIs → Performance Goals → Tasks → Accounting
```

---

## 🌱 **SEEDERS CREATED**

### **1. Hardcoded Departments & Roles Reference**
- **File**: `scripts/seed-hardcoded-departments-and-roles.ts`
- **Purpose**: Display hardcoded departments, roles, and KPIs
- **Usage**: `npx ts-node scripts/seed-hardcoded-departments-and-roles.ts`

### **2. Department & KPI Seeder**
- **File**: `scripts/seed-kpis.ts`
- **Purpose**: Create database KPIs from hardcoded configuration
- **Features**:
  - Creates missing departments
  - Maps hardcoded KPIs to database KPIs
  - Sets up unit information and weights
  - Links KPIs to departments

### **3. Complete Performance Module Seeder**
- **File**: `scripts/seed-performance-module-complete.ts`
- **Purpose**: Comprehensive performance module setup
- **Features**:
  - Ensures all departments exist
  - Seeds all KPIs with proper configuration
  - Displays comprehensive summary
  - Shows accounting integration setup

---

## 📊 **KPI CATEGORIES & ACCOUNTING INTEGRATION**

### **💰 Financial KPIs (Generate Journal Entries)**
| Department | KPI | Account | Type | Journal Entry |
|------------|-----|---------|------|---------------|
| Finance | Total Revenue | 4000 | Revenue | Credit |
| Finance | Net Profit | 3200 | Equity | Credit |
| Finance | Operating Expenses | 5090 | Expense | Debit |
| Sales | Sales Revenue | 4000 | Revenue | Credit |
| Sales | Marketing Expense | 5060 | Expense | Debit |
| HR | Payroll Expense | 5030 | Expense | Debit |
| Procurement | Procurement Spend | 5090 | Expense | Debit |

### **📊 Non-Financial KPIs (No Journal Entries)**
| Department | KPI | Purpose |
|------------|-----|---------|
| Finance | Budget Utilisation | Track budget usage |
| Sales | Promotional Budget Utilisation | Marketing budget tracking |
| HR | HR Budget Utilisation | HR budget tracking |
| Procurement | Procurement Budget Utilisation | Procurement budget tracking |

---

## 🎯 **KPI USAGE IN PERFORMANCE MODULE**

### **1. Goal Creation**
```typescript
// Create performance goal with KPI
const goal = {
  title: "Increase Revenue",
  departmentName: "Finance", // Hardcoded department
  kpiId: "kpi_id_here", // Database KPI ID
  targetValue: 50000, // Absolute target
  targetUnit: "USD",
  dataSourceModule: "Accounting",
  dataSourceField: "IncomeStatement.TotalRevenue"
};
```

### **2. Task Conversion**
```typescript
// Individual goals become tasks
const task = {
  title: goal.title,
  department: goal.departmentName, // Hardcoded department
  goalId: goal.id,
  isPerformanceTask: true,
  targetValue: goal.targetValue,
  targetUnit: goal.targetUnit
};
```

### **3. Accounting Integration**
```typescript
// When KPI task is completed
if (kpi.isFinancial && task.completed) {
  // Generate journal entry
  const journalEntry = {
    accountNumber: kpi.accountNumber,
    debitAmount: kpi.journalEntryType === 'Debit' ? task.achievedValue : 0,
    creditAmount: kpi.journalEntryType === 'Credit' ? task.achievedValue : 0
  };
}
```

---

## 🚀 **USAGE EXAMPLES**

### **Run Complete Performance Module Seeder**
```bash
npx ts-node scripts/seed-performance-module-complete.ts
```

### **Check Hardcoded Configuration**
```bash
npx ts-node scripts/seed-hardcoded-departments-and-roles.ts
```

### **Create Performance Goals**
```bash
POST /api/performance/goals
{
  "title": "Increase Sales Revenue",
  "departmentName": "Sales",
  "targetValue": 100000,
  "targetUnit": "USD",
  "kpiId": "kpi_id_from_database"
}
```

### **Convert Goals to Tasks**
```bash
POST /api/performance/individual-goals/:goalId/convert-to-tasks
```

---

## 📈 **KPI TRACKING & REPORTING**

### **1. Real-time KPI Tracking**
- **Data Source**: Accounting module (JournalEntryLine)
- **Calculation**: Sum of account balances
- **Frequency**: Based on trackingFrequency (Daily, Weekly, Monthly)

### **2. Performance Scorecards**
- **User Scorecards**: Individual performance metrics
- **Department Scorecards**: Department-wide performance
- **Company Scorecards**: Overall organizational performance

### **3. Accounting Integration**
- **Automatic Journal Entries**: When financial KPIs are achieved
- **Chart of Accounts Mapping**: Direct account number mapping
- **Double-Entry Bookkeeping**: Proper debit/credit handling

---

## 🔧 **CONFIGURATION FILES**

### **Hardcoded Departments & Roles**
- **File**: `src/config/hardcodedRoles.ts`
- **Departments**: 8 hardcoded departments
- **Roles**: 40 hardcoded roles (5 per department)
- **Levels**: 5 hierarchical levels (Manager to Member)

### **Hardcoded KPIs**
- **File**: `src/config/hardcodedKPIs.ts`
- **KPIs**: 27 hardcoded KPIs
- **Departments**: 6 departments with KPIs
- **Financial**: 22 financial KPIs (generate journal entries)
- **Non-Financial**: 5 non-financial KPIs (tracking only)

---

## 📊 **CURRENT SYSTEM STATUS**

### **✅ COMPLETED**
- ✅ 8 hardcoded departments created in database
- ✅ 9 KPIs seeded in database
- ✅ Accounting integration configured
- ✅ Performance module structure ready
- ✅ Goal-to-task conversion ready
- ✅ Scorecard system ready

### **📈 STATISTICS**
- **Departments**: 8 (Finance, Sales, Operations, Procurement, HR, Marketing, Legal, IT)
- **KPIs**: 9 database KPIs (27 hardcoded KPIs available)
- **Users**: 0 (ready for user assignment)
- **Goals**: 0 (ready for goal creation)
- **Tasks**: 0 (ready for task conversion)

---

## 🎯 **NEXT STEPS**

### **1. Create Performance Goals**
- Use hardcoded departments for goal assignment
- Link KPIs to goals for accounting integration
- Set absolute value targets (not percentages)

### **2. User Assignment**
- Assign users to hardcoded departments
- Create individual goals for users
- Convert goals to tasks

### **3. Performance Tracking**
- Monitor KPI progress in real-time
- Generate performance scorecards
- Track accounting integration

### **4. Reporting & Analytics**
- Department performance reports
- Individual performance tracking
- Financial impact analysis

---

## 💡 **KEY FEATURES**

### **🎯 Hardcoded Structure**
- **Departments**: 8 predefined departments
- **Roles**: 40 hierarchical roles
- **KPIs**: 27 predefined KPIs with accounting integration

### **💰 Accounting Integration**
- **Financial KPIs**: Generate journal entries when achieved
- **Chart of Accounts**: Direct mapping to account numbers
- **Double-Entry**: Proper debit/credit handling

### **📊 Performance Tracking**
- **Real-time Updates**: Automatic goal progress updates
- **Scorecards**: User and department performance metrics
- **Reporting**: Comprehensive performance analytics

### **🔄 Workflow Automation**
- **Goal Creation**: Company → Department → Individual
- **Task Conversion**: Individual goals become tasks
- **Progress Updates**: Task updates affect goal progress
- **Accounting**: KPI completion triggers journal entries

---

**🎉 The Performance Module is now fully seeded and ready for use!**

**📈 All KPIs are properly configured with accounting integration!**

**🚀 Ready to create performance goals and start tracking!**
