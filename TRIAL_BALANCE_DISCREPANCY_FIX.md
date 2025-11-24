# Trial Balance Discrepancy Fix

## Issue Summary

When calling the trial balance endpoints for November 2025 using period filters, two different totals were being returned:

- **Detailed Endpoint** (`GET /api/accounting/trial-balance?periodType=month&periodValue=2025-11`):
  - Total Debits: $193,881.50
  - Total Credits: $193,881.50

- **Summary Endpoint** (`GET /api/accounting/trial-balance/summary?periodType=month&periodValue=2025-11`):
  - Total Debits: $254,131.50
  - Total Credits: $254,131.50

**Discrepancy**: $60,250.00

## Root Cause

The **summary endpoint** was not correctly handling period filters (month/quarter/year):

### Before the Fix:

1. **Detailed Endpoint** (✅ Correct):
   - Extracted **both** `startDate` and `endDate` from the period filter
   - Passed them to the service: `generateTrialBalance(trialBalanceDate, start, end)`
   - Correctly calculated transactions from **Nov 1, 2025 to Nov 30, 2025**

2. **Summary Endpoint** (❌ Incorrect):
   - Only extracted `endDate` from the period filter
   - Passed only one parameter: `getTrialBalanceSummary(trialBalanceDate)`
   - Fell back to legacy behavior: calculated from **beginning of time to Nov 30, 2025**
   - This included all historical transactions, not just November

## Files Changed

### 1. `src/controllers/TrialBalanceController.ts`

#### `getTrialBalanceSummary()` method:
- **Added**: `start` and `end` date variables
- **Changed**: Extracts both `startDate` and `endDate` from period filter
- **Changed**: Passes `start` and `end` to the service method

#### `getTrialBalanceByAccountType()` method:
- **Added**: Same fix to ensure consistency across all trial balance endpoints

### 2. `src/services/TrialBalanceService.ts`

#### `getTrialBalanceSummary()` method:
- **Added**: `startDate?: Date` and `endDate?: Date` parameters
- **Changed**: Passes these parameters to `generateTrialBalance()`

#### `getTrialBalanceByAccountType()` method:
- **Added**: Same fix for consistency

## What This Fixes

✅ **Summary endpoint** now correctly calculates totals for the specified period only
✅ **Both endpoints** now return the same totals when called with the same period filter
✅ **Maintains backward compatibility** with legacy date format (single date without period filter)
✅ **All trial balance endpoints** now consistently handle period filters

## Testing

To verify the fix, call both endpoints with the same period filter:

```bash
# Detailed Trial Balance
GET /api/accounting/trial-balance?periodType=month&periodValue=2025-11

# Summary Trial Balance
GET /api/accounting/trial-balance/summary?periodType=month&periodValue=2025-11
```

Both should now return:
- `totalDebits: 193881.5`
- `totalCredits: 193881.5`
- `isBalanced: true`

## Impact

- **High**: This was a critical accounting discrepancy that could have led to incorrect financial reporting
- **No Breaking Changes**: The fix maintains backward compatibility with existing API usage
- **Improved Consistency**: All trial balance endpoints now behave consistently

---

**Date Fixed**: November 24, 2025
**Issue Type**: Period Filter Date Range Bug
**Severity**: Critical (Financial Data Accuracy)

