# 📊 Payroll Module - Complete Workflow Analysis & Issues

## 🎯 **Module Overview**

The Payroll Module is a comprehensive payroll management system designed for Zimbabwean businesses with:
- Multi-currency support (USD, ZWL)
- Statutory compliance (PAYE, NSSA, AIDS Levy)
- Employee salary structures (allowances)
- Bank file generation for bulk payments
- Employee self-service portal
- Journal entry integration with accounting module

---

## 🔄 **Complete Workflow**

### **1. Setup Phase (One-Time Configuration)**

#### **A. Create Tax Rules**
```
POST /api/payroll/tax-rules
```
- **Purpose**: Configure statutory taxes (PAYE, NSSA, AIDS Levy)
- **Fields**: name, type, rate, threshold, ceiling, effectiveDate, currencyId
- **Example**:
  - PAYE: 20% rate, threshold $700, no ceiling
  - NSSA: 3% rate, ceiling $700
  - AIDS Levy: 1% rate, no threshold/ceiling

#### **B. Create Allowance Types**
```
POST /api/payroll/allowance-types
```
- **Purpose**: Define types of allowances (Housing, Transport, Medical, etc.)
- **Fields**: name, code, description, isTaxable
- **Example**: Housing Allowance, Transport Allowance

#### **C. Create Deduction Types**
```
POST /api/payroll/deduction-types
```
- **Purpose**: Define deduction types (statutory or non-statutory)
- **Fields**: name, code, rate, threshold, ceiling, isStatutory, currencyId
- **Statutory**: Automatically applied to ALL employees
- **Non-Statutory**: Must be assigned to specific employees

#### **D. Create Bank File Templates**
```
POST /api/payroll/bank-templates
```
- **Purpose**: Configure bank-specific CSV formats
- **Fields**: name, bankName, delimiter, hasHeader, columnOrder

---

### **2. Employee Management**

#### **A. Create Employee**
```
POST /api/payroll/employees
```
- **Purpose**: Convert a User to an Employee
- **Fields**: userId, basicSalary, currencyId, bankName, branchCode, accountNumber, idNumber, nextOfKin, address
- **Auto-generates**: employeeNumber (EMP001, EMP002, etc.)

#### **B. Create Salary Structure (Allowances)**
```
POST /api/payroll/salary-structures
```
- **Purpose**: Assign allowances to employees
- **Fields**: employeeId, allowanceTypeId, amount, currencyId, effectiveDate, endDate
- **Note**: Currently only handles ALLOWANCES, not deductions

#### **C. Assign Employee Deductions (Non-Statutory)**
```
PUT /api/payroll/deduction-types/:id/employees
```
- **Purpose**: Assign non-statutory deductions to specific employees
- **Fields**: employeeIds, amount (optional), rate (optional)
- **Example**: Employee Loan, Health Insurance, Pension Fund

---

### **3. Payroll Processing**

#### **A. Create Payroll Run**
```
POST /api/payroll/payroll-runs
```
- **Purpose**: Create a payroll period (e.g., "March 2024")
- **Fields**: name, payPeriod, startDate, endDate, currencyId
- **Status**: DRAFT
- **Validation**: Prevents overlapping periods

#### **B. Process Payroll Run**
```
POST /api/payroll/payroll-runs/:payrollRunId/process
```
- **Purpose**: Calculate payroll for all active employees
- **Status Flow**: DRAFT → PROCESSING → COMPLETED

**Calculation Steps**:
1. **Get Employee Data**: Basic salary + active salary structures (allowances)
2. **Calculate Allowances**: Sum all active allowances for the period
3. **Calculate Gross Pay**: `basicSalary + totalAllowances`
4. **Calculate Employee Deductions**: Non-statutory deductions assigned to employee
5. **Calculate Statutory Deductions**: 
   - Tax Rules (PAYE, NSSA, AIDS Levy) - applied to gross pay
   - Statutory Deduction Types - applied to gross pay
6. **Calculate Net Pay**: `grossPay - totalDeductions`
7. **Create Records**:
   - `EmployeePayroll` (summary per employee)
   - `PayrollAllowance` (breakdown of allowances)
   - `PayrollDeduction` (breakdown of deductions)
   - `Payslip` (employee payslip record)
8. **Create Journal Entry**:
   - DR Salaries Expense (5010) = Total Gross Pay
   - CR PAYE Payable (2150) = Total PAYE
   - CR NSSA/Pension Payable (2160) = Total NSSA + Pension
   - CR Net Wages Payable (2250) = Total Net Pay
9. **Send Payslip Emails**: Email payslips to all employees

#### **C. Process Payroll Payment**
```
POST /api/payroll/payroll-runs/:payrollRunId/payment
```
- **Purpose**: Record actual payment of salaries (Wages Clearing)
- **Fields**: bankId, paymentDate
- **Creates**:
  - Cashbook Entry: DR Net Wages Payable, CR Bank Account
  - Journal Entry: DR Net Wages Payable (2250), CR Bank Account

---

### **4. Bank File Generation**

#### **Generate Bank File**
```
POST /api/payroll/payroll-runs/:payrollRunId/bank-file
```
- **Purpose**: Export CSV file for bulk bank transfer
- **Fields**: bankTemplateId
- **Returns**: CSV file with employee bank details and net pay amounts

---

### **5. Employee Portal**

#### **A. Get Employee Payslips**
```
GET /api/payroll/employee/payslips
```
- **Purpose**: Employee views their own payslips
- **Returns**: Paginated list of payslips with full details

#### **B. Get Employee Payroll Info**
```
GET /api/payroll/employee/portal
```
- **Purpose**: Employee views their salary structure and leave balances

---

## ⚠️ **IDENTIFIED ISSUES & PROBLEMS**

### **🔴 CRITICAL ISSUES**

#### **1. Employee-Specific Deductions Not Applied to Gross Pay**
**Problem**: 
- Employee deductions (loans, advances) are calculated but NOT subtracted from gross pay
- Current logic: `grossPay = basicSalary + allowances`
- Should be: `grossPay = basicSalary + allowances - employeeDeductions`

**Impact**:
- Gross pay is inflated
- Statutory deductions (PAYE, NSSA) are calculated on wrong amount
- Net pay is incorrect

**Location**: `src/services/PayrollService.ts` line 156

**Current Code**:
```typescript
const grossPay = basicSalary.add(totalAllowances);
```

**Should Be**:
```typescript
// Calculate employee deductions first
let totalEmployeeDeductions = new Decimal(0);
for (const employeeDeduction of employeeDeductions) {
  // ... calculate deduction amount ...
  totalEmployeeDeductions = totalEmployeeDeductions.add(deductionAmount);
}

// Gross pay = Basic + Allowances - Employee Deductions
const grossPay = basicSalary.add(totalAllowances).sub(totalEmployeeDeductions);
```

---

#### **2. Employee Deductions Calculated But Not Used**
**Problem**:
- Employee deductions are fetched and calculated (lines 94-108, 166-209)
- But they're added to totalDeductions AFTER gross pay is calculated
- This means statutory deductions are calculated on the wrong base

**Impact**:
- PAYE, NSSA calculated on inflated gross pay
- Employee deductions are double-counted (subtracted from net pay but not from gross)

**Location**: `src/services/PayrollService.ts` lines 156-209

---

#### **3. Salary Structure Only Handles Allowances**
**Problem**:
- `SalaryStructure` model only links to `AllowanceType`
- No way to add employee-specific deductions in salary structure
- Employee deductions must be managed separately via `EmployeeDeduction`

**Impact**:
- Confusing workflow - allowances in one place, deductions in another
- No unified view of employee compensation structure

---

### **🟡 MEDIUM PRIORITY ISSUES**

#### **4. Currency Conversion Not Implemented**
**Problem**:
- Code references `convertCurrency()` method (lines 142, 188)
- But method doesn't exist or is incomplete

**Location**: `src/services/PayrollService.ts` lines 142, 188

**Impact**:
- Multi-currency payroll may fail
- Allowances/deductions in different currencies won't convert

---

#### **5. Inefficient Database Queries**
**Problem**:
- In `processPayrollRun()`, multiple queries inside loops:
  - Line 424-429: Query for `employeePayroll` inside allowance loop
  - Line 447-452: Query for `employeePayroll` inside deduction loop

**Impact**:
- N+1 query problem
- Slow performance for large payrolls

**Fix**: Store `employeePayrollId` after upsert, reuse it

---

#### **6. Missing Error Handling for Journal Entry**
**Problem**:
- Journal entry creation (line 519) is wrapped in try-catch
- Errors are logged but payroll still completes
- No rollback if journal entry fails

**Impact**:
- Payroll completes but accounting entries missing
- Data inconsistency

---

#### **7. Payslip Email Errors Are Silent**
**Problem**:
- Email failures (line 488) are caught and logged
- But payroll continues processing
- No notification to admin about failed emails

**Impact**:
- Employees don't receive payslips
- Admin doesn't know about failures

---

### **🟢 LOW PRIORITY / ENHANCEMENTS**

#### **8. No Payroll Run Validation**
**Problem**:
- No validation that employees have basic salary
- No validation that currency exists
- No validation that tax rules exist for currency

**Impact**:
- Payroll may process with missing data
- Errors only discovered during calculation

---

#### **9. No Payroll Reversal/Cancellation**
**Problem**:
- Once payroll is COMPLETED, cannot be reversed
- Only CANCELLED status exists, but no way to cancel after completion

**Impact**:
- Errors require manual journal entry corrections
- No audit trail for reversals

---

#### **10. Leave Balance Not Integrated**
**Problem**:
- Leave balances exist but not used in payroll calculation
- No deduction for unpaid leave
- No addition for leave pay

**Impact**:
- Leave management disconnected from payroll

---

## 📋 **DATA MODEL SUMMARY**

### **Core Models**

1. **Employee**: Links User to payroll data (basic salary, bank details)
2. **PayrollRun**: Payroll period (start/end dates, status, totals)
3. **EmployeePayroll**: Calculated payroll per employee per run
4. **SalaryStructure**: Employee allowances (amount, effective dates)
5. **AllowanceTypes**: Types of allowances (Housing, Transport, etc.)
6. **DeductionTypes**: Types of deductions (statutory or non-statutory)
7. **EmployeeDeduction**: Employee-specific deduction assignments
8. **TaxRules**: Statutory tax rules (PAYE, NSSA, AIDS Levy)
9. **Payslip**: Employee payslip record
10. **PayrollAllowance**: Breakdown of allowances per payroll
11. **PayrollDeduction**: Breakdown of deductions per payroll

### **Relationships**

```
Employee
  ├── SalaryStructure (Allowances)
  ├── EmployeeDeduction (Non-Statutory Deductions)
  ├── EmployeePayroll (Per Payroll Run)
  └── Payslip

PayrollRun
  ├── EmployeePayroll[]
  ├── Payslip[]
  └── Currency

TaxRules → Applied to ALL employees (by currency)
DeductionTypes (isStatutory=true) → Applied to ALL employees
DeductionTypes (isStatutory=false) → Assigned via EmployeeDeduction
```

---

## 🔧 **RECOMMENDED FIXES**

### **Priority 1: Fix Gross Pay Calculation**
1. Calculate employee deductions BEFORE gross pay
2. Subtract employee deductions from gross pay
3. Apply statutory deductions to corrected gross pay

### **Priority 2: Implement Currency Conversion**
1. Add `convertCurrency()` method
2. Use exchange rates from Currency model
3. Convert all amounts to payroll currency

### **Priority 3: Optimize Database Queries**
1. Store `employeePayrollId` after upsert
2. Reuse ID in allowance/deduction loops
3. Batch create allowances/deductions

### **Priority 4: Improve Error Handling**
1. Rollback payroll if journal entry fails
2. Notify admin of email failures
3. Add validation before processing

### **Priority 5: Enhance Salary Structure**
1. Consider adding deduction support to SalaryStructure
2. Or create unified compensation view
3. Improve UI/UX for managing employee compensation

---

## 📊 **CALCULATION FLOW (CURRENT vs CORRECT)**

### **Current (WRONG)**
```
Basic Salary:        $1,000
Allowances:          +$300
────────────────────────────
Gross Pay:           $1,300  ❌ (Should subtract employee deductions first)

Employee Loan:       -$100   (Added to deductions, but gross already calculated)
PAYE (20%):          -$260   (Calculated on $1,300, should be on $1,200)
NSSA (3%):           -$39    (Calculated on $1,300, should be on $1,200)
────────────────────────────
Net Pay:             $901
```

### **Correct (SHOULD BE)**
```
Basic Salary:        $1,000
Allowances:          +$300
Employee Loan:       -$100
────────────────────────────
Gross Pay:           $1,200  ✅ (After employee deductions)

PAYE (20%):          -$240   (Calculated on $1,200)
NSSA (3%):           -$36    (Calculated on $1,200)
────────────────────────────
Net Pay:             $924
```

---

## 🎯 **NEXT STEPS**

1. **Fix gross pay calculation** (Critical)
2. **Test with real payroll data**
3. **Implement currency conversion**
4. **Optimize database queries**
5. **Add comprehensive error handling**
6. **Create payroll reversal functionality**
7. **Integrate leave balances**

---

**Last Updated**: Based on code review of `src/services/PayrollService.ts` and `src/controllers/PayrollController.ts`





