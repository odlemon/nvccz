# What Was Removed from Income Statement

## Summary

I removed **separate sections** for accounts outside the 4xxx and 5xxx ranges, as per the guide requirement: *"The system automatically pulls only the accounts in the Revenue (4xxx) and Expense (5xxx) ranges."*

## What Was Removed

### 1. **Separate "Income Tax" Section**
- **Before**: Had a separate section for accounts in range 6100-6199
- **After**: Removed this section
- **Reason**: Guide states only 4xxx and 5xxx ranges should appear on Income Statement
- **Note**: If you have income tax accounts in the 5xxx range (e.g., 5100-5999), they would still appear as expenses

### 2. **Separate "Below-the-Line" Section**
- **Before**: Had a separate section for accounts in range 6200-6999
- **After**: Removed this section
- **Reason**: Guide states only 4xxx and 5xxx ranges should appear on Income Statement
- **Note**: If you have below-the-line accounts in the 5xxx range, they would still appear as expenses

### 3. **Complex Net Income Calculation**
- **Before**: 
  ```typescript
  netIncomeBeforeTaxes = revenue - operatingExpenses
  incomeTaxExpense = incomeTax.total
  incomeFromContinuingOperations = netIncomeBeforeTaxes - incomeTaxExpense
  netIncome = incomeFromContinuingOperations + belowTheLineTotal
  ```
- **After**: 
  ```typescript
  netIncome = revenue.total - expenses.total
  ```
- **Reason**: Guide states: *"Net Income = Total Revenue - Total Expenses"*

## What Was NOT Removed

✅ **All accounts in 4xxx range** - Still included as Revenue
✅ **All accounts in 5xxx range** - Still included as Expenses
✅ **All transaction data** - No data was deleted, only the categorization changed
✅ **All journal entries** - All transactions are still included

## Important Clarification

**If you have income tax or below-the-line accounts in the 5xxx range**, they will still appear on the Income Statement as expenses. I only removed accounts that were in ranges **outside** 4xxx and 5xxx (specifically 6100-6199 and 6200-6999).

## Example

**Before:**
- Revenue: 4xxx accounts
- Operating Expenses: 5xxx accounts (5000-5999)
- Income Tax: 6100-6199 accounts (separate section)
- Below-the-Line: 6200-6999 accounts (separate section)

**After:**
- Revenue: 4xxx accounts
- Expenses: 5xxx accounts (5000-5999)
- Accounts in 6100-6199: **Excluded** (not in 4xxx or 5xxx)
- Accounts in 6200-6999: **Excluded** (not in 4xxx or 5xxx)

## If You Need Income Tax or Below-the-Line Items

If you need income tax or below-the-line items on the Income Statement, you have two options:

1. **Move those accounts to the 5xxx range** - They will appear as expenses
2. **Modify the guide** - If the guide should include these ranges, we can update both the guide and the code

Would you like me to restore these sections, or do you want to move those accounts to the 5xxx range?


