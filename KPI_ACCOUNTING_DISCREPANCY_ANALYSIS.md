# 🔍 KPI ACCOUNTING DISCREPANCY ANALYSIS

## 📊 Issue Summary

KPI values under performance management (e.g., Accounts Payable Outstanding) do not match the accounting module figures.

---

## 🔎 Root Cause Analysis

### **1. Date Filtering Discrepancy**

**Performance Module** (`EnhancedGoalTrackingService.getChartOfAccountsMetric`):
- ❌ **No date filtering** - Gets ALL historical journal entries
- Only filters by: `status: 'POSTED'`

**Accounting Module** (`BalanceSheetService.getAccountsPayableBalance`):
- ✅ **Filters by transaction date**: `transactionDate: { lte: asOfDate }`
- Also filters by: `status: 'POSTED'`

**Impact**: Performance module shows cumulative balance from all time, while accounting shows balance up to a specific date.

### **2. Currency Filtering Discrepancy**

**Performance Module**:
- ❌ **No currency filtering** - Gets entries in all currencies

**Accounting Module**:
- ✅ **Filters by currency**: `currencyId` if provided

**Impact**: Performance module may show multi-currency totals, while accounting shows single currency.

### **3. Precision/Arithmetic Discrepancy**

**Performance Module**:
- Uses simple JavaScript `number` arithmetic
- Risk of floating-point precision errors

**Accounting Module**:
- Uses `Decimal` arithmetic (`new Decimal()`)
- Maintains precision

**Impact**: Rounding errors can accumulate, especially with large numbers or many transactions.

### **4. Account Lookup Method**

**Performance Module** (`getChartOfAccountsMetric`):
- Looks up by account number directly
- Relies on `glAccount.accountNo` matching

**Accounting Module** (`getAccountsPayableBalance`):
- More flexible lookup:
  - Account number: `'2000'`
  - Account name: `'Creditors Control'` or `'Accounts Payable'`
  - Account type: `'Current Liability'`

**Impact**: If account naming is inconsistent, performance module might miss the account.

---

## 🔧 Specific Issues Found

### **Issue 1: Missing Date Filter in Performance Module**

**File**: `src/services/EnhancedGoalTrackingService.ts`
**Method**: `getChartOfAccountsMetric()`
**Line**: ~365-377

```typescript
// CURRENT (INCORRECT):
const accountEntries = await prisma.journalEntryLine.findMany({
  where: {
    journalEntry: {
      status: 'POSTED'  // ❌ No date filter
    },
    glAccount: {
      accountNo: accountNumber
    }
  }
});
```

**Should be**:
```typescript
// NEEDS: Date and currency filtering like accounting module
const accountEntries = await prisma.journalEntryLine.findMany({
  where: {
    journalEntry: {
      status: 'POSTED',
      transactionDate: { lte: asOfDate },  // ✅ Add date filter
      ...(currencyId && { currencyId })     // ✅ Add currency filter
    },
    glAccount: {
      accountNo: accountNumber
    }
  }
});
```

### **Issue 2: No Decimal Arithmetic**

**Current**: Uses number arithmetic
```typescript
const balance = accountEntries.reduce((sum, line) => {
  return sum + (line.creditAmount || 0) - (line.debitAmount || 0);
}, 0);
```

**Should be**: Uses Decimal arithmetic
```typescript
let balance = new Decimal(0);
for (const line of journalLines) {
  balance = balance.plus(line.creditAmount).minus(line.debitAmount);
}
return balance.toNumber();
```

### **Issue 3: No Synchronization Mechanism**

**Current State**:
- KPI values stored in `performanceGoal.currentValue`
- Only updated manually or through `updateGoalProgress()`
- No automatic sync from accounting module

**Should Have**:
- Automatic sync from accounting when viewing KPIs
- Or scheduled job to sync KPI values from accounting data
- Real-time calculation when requested

---

## 📋 Affected KPIs

All financial KPIs that pull from accounting module:

1. ✅ **ACCOUNTS_PAYABLE_OUTSTANDING** (Account 2000)
2. ✅ **ACCOUNTS_RECEIVABLE_OUTSTANDING** (Account 1200)
3. ✅ **CASH_BALANCE** (Account 1000)
4. ✅ **TOTAL_REVENUE** (Account 4000)
5. ✅ **NET_PROFIT** (Various accounts)
6. ✅ **OPERATING_EXPENSES** (Various expense accounts)
7. ✅ **TOTAL_LIABILITIES** (Multiple liability accounts)
8. ✅ **SHAREHOLDERS_EQUITY** (Account 3000)

**Total**: All 22 financial KPIs are affected

---

## 🎯 Recommended Fixes

### **Fix 1: Update `getChartOfAccountsMetric` Method**

Add date and currency filtering, use Decimal arithmetic:

```typescript
static async getChartOfAccountsMetric(
  metric: string, 
  asOfDate?: Date, 
  currencyId?: string
): Promise<number> {
  // ... existing code ...
  
  // Add date and currency filters
  const journalEntryWhere: any = {
    status: 'POSTED'
  };
  
  if (asOfDate) {
    journalEntryWhere.transactionDate = { lte: asOfDate };
  }
  
  if (currencyId) {
    journalEntryWhere.currencyId = currencyId;
  }
  
  const accountEntries = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        is: journalEntryWhere  // ✅ Use filtered where clause
      },
      glAccount: {
        accountNo: accountNumber
      }
    },
    include: {
      glAccount: true
    }
  });
  
  // Use Decimal arithmetic
  let balance = new Decimal(0);
  for (const line of accountEntries) {
    const isDebitAccount = ['Current Asset', 'Fixed Asset', 'Expense'].includes(account.accountType);
    if (isDebitAccount) {
      balance = balance.plus(line.debitAmount || 0).minus(line.creditAmount || 0);
    } else {
      balance = balance.plus(line.creditAmount || 0).minus(line.debitAmount || 0);
    }
  }
  
  return balance.toNumber();
}
```

### **Fix 2: Create Unified Account Balance Service**

Create a shared service that both modules use:

```typescript
// src/services/AccountBalanceService.ts
export class AccountBalanceService {
  static async getAccountBalance(
    accountNumber: string,
    asOfDate?: Date,
    currencyId?: string
  ): Promise<number> {
    // Unified calculation logic used by both modules
  }
}
```

### **Fix 3: Sync KPI Values from Accounting**

Update performance goals to sync from accounting:

```typescript
static async syncKPIFromAccounting(goalId: string): Promise<void> {
  const goal = await prisma.performanceGoal.findUnique({
    where: { id: goalId },
    include: { kpi: true }
  });
  
  if (!goal?.kpi) return;
  
  const { HARDCODED_KPIS } = await import("../config/hardcodedKPIs");
  const kpiConfig = HARDCODED_KPIS.find(k => k.code === goal.kpi.code);
  
  if (kpiConfig?.accountNumber) {
    const currentValue = await AccountBalanceService.getAccountBalance(
      kpiConfig.accountNumber,
      new Date(), // Current date
      'USD' // Or default currency
    );
    
    await prisma.performanceGoal.update({
      where: { id: goalId },
      data: { currentValue }
    });
  }
}
```

---

## 🚨 Priority

**HIGH** - This affects financial reporting accuracy and could lead to incorrect business decisions.

---

## 📝 Next Steps

1. ✅ Document discrepancies (this file)
2. ⏳ Fix `getChartOfAccountsMetric` method
3. ⏳ Add date and currency parameters to goal tracking
4. ⏳ Create unified account balance service
5. ⏳ Test with real data to verify fixes
6. ⏳ Update all affected KPI calculations

