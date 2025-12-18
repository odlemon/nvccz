# Payroll-Performance Management Integration Analysis

## Problem Statement

**Issue:** Performance management isn't communicating with payroll. There's $2000 in payroll but it hasn't been factored into the target of $5000 in performance management.

**Example:**
- Goal: "Payroll control" with target of $5000
- Actual payroll processed: $2000
- Expected: Goal should show 2000/5000 = 40% progress
- Current: Goal shows 0% progress (not synced)

---

## Current Architecture

### Payroll Module
- **PayrollRun** stores:
  - `totalGrossPay` - Total payroll expense (what we need)
  - `totalDeductions` - Total deductions
  - `totalNetPay` - Net pay after deductions
  - `startDate` / `endDate` - Payroll period
  - `status` - DRAFT, PROCESSING, COMPLETED, CANCELLED

- **Process Flow:**
  1. `processPayrollRun()` calculates payroll for all employees
  2. Stores `totalGrossPay` in PayrollRun
  3. Creates journal entries
  4. **MISSING:** No sync to performance goals

### Performance Module
- **PerformanceGoal** stores:
  - `targetValue` - Target amount (e.g., 5000)
  - `currentValue` - Current progress (should be from payroll)
  - `monetaryValueAchieved` - Achieved monetary value
  - `kpiId` - Links to KPI (e.g., "Payroll Expense" KPI)
  - `startDate` / `endDate` - Goal period
  - `progressPercentage` - Calculated progress

- **KPI:**
  - "Payroll Expense" KPI ID: `cmh3c033z000funlc8rljw86d`
  - Code: `PAYROLL_EXPENSE`
  - Department: Human Resources
  - Account: 5030 (Salaries and Wages)

---

## Solution Design

### Integration Point
**Location:** `src/services/PayrollService.ts` → `processPayrollRun()` method

**After payroll processing completes:**
1. Find "Payroll Expense" KPI
2. Find all active performance goals linked to this KPI
3. For each goal:
   - Sum `totalGrossPay` from all COMPLETED payroll runs within goal's date range
   - Update goal's `currentValue` and `monetaryValueAchieved`
   - Recalculate `progressPercentage`
   - Update status if completed

### Implementation Steps

1. **Create sync method** in `PerformanceGoalService`:
   ```typescript
   static async syncPayrollToGoals(payrollRunId: string, totalGrossPay: Decimal)
   ```

2. **Call sync method** in `PayrollService.processPayrollRun()`:
   - After payroll run is marked COMPLETED
   - Before journal entry creation (or after, doesn't matter)

3. **Sync Logic:**
   - Get "Payroll Expense" KPI ID
   - Find goals with matching `kpiId` and status = "active"
   - For each goal:
     - Query all COMPLETED payroll runs where:
       - `endDate >= goal.startDate`
       - `endDate <= goal.endDate`
     - Sum all `totalGrossPay` values
     - Update goal with sum

---

## Data Flow

```
Payroll Run Processed
    ↓
totalGrossPay = $2000
    ↓
Find "Payroll Expense" KPI
    ↓
Find Goals with kpiId = Payroll Expense KPI
    ↓
For each goal:
  - Sum payroll runs in goal date range
  - Update currentValue = $2000
  - Calculate progressPercentage = (2000/5000) * 100 = 40%
  - Update monetaryValueAchieved = $2000
    ↓
Goal Updated: 2000/5000 (40%)
```

---

## Edge Cases

1. **Multiple Payroll Runs in Same Period:**
   - Sum all runs within goal date range
   - Example: If 3 runs of $500 each, total = $1500

2. **Goal Date Range:**
   - Only count payroll runs where `endDate` falls within `goal.startDate` to `goal.endDate`

3. **Currency Mismatch:**
   - All payroll runs should use same currency as goal
   - Or convert currencies if needed

4. **Goal Already Completed:**
   - Still update if new payroll runs come in
   - May exceed target (show >100% if needed)

5. **Payroll Run Cancelled:**
   - Don't count cancelled runs
   - Only count COMPLETED runs

---

## Files to Modify

1. **src/services/PayrollService.ts**
   - Add call to sync method after payroll processing

2. **src/services/PerformanceGoalService.ts**
   - Add `syncPayrollToGoals()` method

---

## Testing Scenarios

1. **Basic Sync:**
   - Create goal with target $5000
   - Process payroll run with $2000
   - Verify goal shows 40% progress

2. **Multiple Runs:**
   - Process 3 payroll runs: $1000, $1500, $500
   - Verify goal shows $3000 total (60% progress)

3. **Date Range Filtering:**
   - Goal: Jan 1 - Dec 31
   - Payroll runs: Dec 15 (in range), Jan 15 next year (out of range)
   - Verify only Dec 15 run is counted

4. **Multiple Goals:**
   - Two goals with same KPI but different date ranges
   - Verify each goal only counts relevant payroll runs

