# Income Statement Formula Analysis

## Current Formula Implementation

```typescript
// Step 1: Net Income Before Taxes
netIncomeBeforeTaxes = revenue.total - operatingExpenses.total;

// Step 2: Income From Continuing Operations
incomeFromContinuingOperations = netIncomeBeforeTaxes - incomeTaxExpense;

// Step 3: Net Income
netIncome = incomeFromContinuingOperations + belowTheLineTotal;
```

## Account Balance Calculations

### Revenue Accounts (4xxx range)
- **Formula**: `netAmount = totalCredits - totalDebits`
- **Reason**: Revenue accounts have natural credit balance. Credits increase revenue, debits decrease revenue.
- **Status**: ✅ **CORRECT**

### Expense Accounts (5xxx range - Operating Expenses)
- **Formula**: `netAmount = totalDebits - totalCredits`
- **Reason**: Expense accounts have natural debit balance. Debits increase expenses, credits decrease expenses.
- **Status**: ✅ **CORRECT**

### Income Tax Accounts (6100-6199 range)
- **Formula**: `netAmount = totalDebits - totalCredits` (same as expenses)
- **Reason**: Income tax is an expense. Debits increase tax expense, credits decrease tax expense.
- **Status**: ✅ **CORRECT**

### Below-the-Line Accounts (6200-6999 range)
- **Formula**: 
  - For Expense type: `amount = baseLine.amount * -1` (makes it negative)
  - For Revenue type: `amount = baseLine.amount` (stays positive)
- **Reason**: Below-the-line can be income (positive) or expense (negative). The logic correctly handles both.
- **Status**: ✅ **CORRECT**

## Net Income Formula Verification

### Standard Accounting Formula:
```
Net Income = Revenue - Operating Expenses - Income Tax + Below-the-Line Items
```

### Current Implementation:
```
Step 1: netIncomeBeforeTaxes = revenue - operatingExpenses
Step 2: incomeFromContinuingOperations = netIncomeBeforeTaxes - incomeTax
Step 3: netIncome = incomeFromContinuingOperations + belowTheLine
```

### Expanded:
```
netIncome = (revenue - operatingExpenses - incomeTax) + belowTheLine
```

### Verification:
- ✅ Revenue is added (positive)
- ✅ Operating Expenses are subtracted (positive value, subtracted)
- ✅ Income Tax is subtracted (positive value, subtracted)
- ✅ Below-the-Line is added (can be positive for income or negative for expense)

**Status**: ✅ **FORMULA IS CORRECT**

## Potential Issues to Check

1. **Below-the-Line Sign Convention**: 
   - Current: Expense type accounts are multiplied by -1, Revenue type accounts stay positive
   - This means: Expense below-the-line = negative (reduces net income), Revenue below-the-line = positive (increases net income)
   - **Status**: ✅ **CORRECT**

2. **Section Totals**:
   - Revenue section: Sums all `baseLine.amount` (which is `netAmount` = credits - debits) ✅
   - Operating Expenses section: Sums all `baseLine.amount` (which is `netAmount` = debits - credits) ✅
   - Income Tax section: Sums all `baseLine.amount` (which is `netAmount` = debits - credits) ✅
   - Below-the-Line section: Sums all `line.amount` (which may be negative for expenses) ✅

3. **Account Type Handling**:
   - Revenue accounts (4000-4099): Uses `netAmount` directly ✅
   - Contra Revenue (4100-4199): Multiplies by -1 (correct for returns/allowances) ✅
   - Operating Expenses (5000-5999): Uses `netAmount` directly ✅
   - Income Tax (6100-6199): Uses `netAmount` directly ✅
   - Below-the-Line (6200-6999): Adjusts sign based on account type ✅

## Conclusion

✅ **All formulas are correct!**

The Income Statement formula correctly:
1. Calculates revenue as Credits - Debits
2. Calculates expenses as Debits - Credits
3. Subtracts expenses from revenue
4. Subtracts income tax
5. Adds below-the-line items (which can be positive or negative)


