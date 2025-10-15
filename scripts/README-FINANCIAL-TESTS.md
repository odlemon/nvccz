# 📊 FINANCIAL STATEMENTS TESTING GUIDE

## 📋 **OVERVIEW**

Two comprehensive testing scripts to verify all financial statements are working correctly:

1. **test-financial-statements.js** - Full API testing with authentication
2. **test-statements-simple.js** - Direct database testing (no API calls needed)

---

## 🚀 **QUICK START - SIMPLE TEST (RECOMMENDED)**

This test doesn't require API calls or authentication - it directly tests the database logic:

```bash
node scripts/test-statements-simple.js
```

**What it tests:**
- ✅ Database connectivity
- ✅ Trial Balance calculation and balance verification
- ✅ Balance Sheet generation and balance verification
- ✅ Income Statement calculation
- ✅ Direct Prisma queries (same logic as services)

**Advantages:**
- No authentication needed
- Faster execution
- Direct verification of core logic
- Shows detailed balance information

---

## 🧪 **FULL API TEST (OPTIONAL)**

Tests all endpoints through HTTP API calls:

```bash
node scripts/test-financial-statements.js
```

**Before running, update:**
1. Line 13: `const BASE_URL = 'http://localhost:3000'` (if different)
2. Line 47: Password for test user (default: 'password123')

**What it tests:**
- ✅ Income Statement API (`/api/accounting/income-statement`)
- ✅ Cash Flow Statement API (`/api/accounting/cash-flow/*`)
  - Generate
  - Summary
  - Detailed
  - Comprehensive
- ✅ Balance Sheet API (`/api/accounting/balance-sheet/generate`)
- ✅ Trial Balance API (`/api/accounting/trial-balance`)

---

## 📊 **EXPECTED OUTPUT**

### **Simple Test Output Example:**

```
═════════════════════════════════════════════════════════════════════
  DATABASE CONNECTIVITY CHECK
═════════════════════════════════════════════════════════════════════

✅ Database connection successful

📊 Database Summary:
   Total Journal Entries:  150
   Posted Entries:         145
   Chart of Accounts:      45

═════════════════════════════════════════════════════════════════════
  TEST: TRIAL BALANCE
═════════════════════════════════════════════════════════════════════

📅 Generating trial balance as of: 2025-12-31

⚖️  Trial Balance Results:
   Total Debits:   $125,450.00
   Total Credits:  $125,450.00
   Difference:     $0.00
   Is Balanced:    ✅ YES
   Accounts:       38

✅ Trial Balance is BALANCED

═════════════════════════════════════════════════════════════════════
  TEST: BALANCE SHEET
═════════════════════════════════════════════════════════════════════

📅 Generating balance sheet as of: 2025-12-31

📈 Balance Sheet Results:

   ASSETS:
   Total Assets:                $85,200.00

   LIABILITIES:
   Total Liabilities:           $45,300.00

   EQUITY:
   Equity (excluding retained): $25,000.00
   Retained Earnings:           $14,900.00
   Total Equity:                $39,900.00

   BALANCE CHECK:
   Total Liab. + Equity:        $85,200.00
   Difference:                  $0.00
   Is Balanced:                 ✅ YES

✅ Balance Sheet is BALANCED

...

═════════════════════════════════════════════════════════════════════
  FINAL SUMMARY
═════════════════════════════════════════════════════════════════════

╔════════════════════════════════════════════════════════════════╗
║                      TEST RESULTS                              ║
╚════════════════════════════════════════════════════════════════╝

✅ Trial Balance            PASSED
✅ Balance Sheet            PASSED
✅ Income Statement         PASSED

────────────────────────────────────────────────────────────────────

Total: 3 | Passed: 3 | Failed: 0

⚖️  BALANCE VERIFICATION:
✅ Trial Balance: BALANCED
✅ Balance Sheet: BALANCED

════════════════════════════════════════════════════════════════════

🎉 ALL TESTS PASSED & ALL STATEMENTS BALANCED! 🎉
```

---

## 🔍 **TROUBLESHOOTING**

### **"No POSTED journal entries found"**
**Solution:** Your database has no posted journal entries. Create some transactions first.

```bash
# Create some test journal entries
node scripts/create-test-transactions.js  # (if available)
```

### **"Trial Balance is UNBALANCED"**
**Causes:**
1. Data entry errors in journal entries
2. Missing contra entries
3. Corrupted journal entries

**Fix:**
```bash
# Run audit script to find issues
node scripts/audit-journal-entries.js
```

### **"Balance Sheet is UNBALANCED"**
**Causes:**
1. Trial balance is already unbalanced
2. Incorrect account type classifications
3. Missing retained earnings calculation

**Fix:** First fix trial balance, then re-run balance sheet test

### **"Authentication failed"**
**Solution for API test:** Update the password in `test-financial-statements.js` line 47

### **"Failed to connect to database"**
**Solution:**
1. Check `.env` file has correct `DATABASE_URL`
2. Ensure MySQL is running
3. Run: `npx prisma generate` to regenerate Prisma client

---

## 📝 **WHAT EACH TEST VERIFIES**

### **Trial Balance:**
- ✅ Sum of all debits equals sum of all credits
- ✅ Only includes POSTED entries
- ✅ Calculates balances correctly for all account types

### **Balance Sheet:**
- ✅ Total Assets = Total Liabilities + Total Equity
- ✅ Retained Earnings correctly calculated from Income Statement
- ✅ Accounts properly categorized (Current/Fixed Assets, etc.)
- ✅ Only includes POSTED entries up to as-of date

### **Income Statement:**
- ✅ Net Income = Total Revenue - Total Expenses
- ✅ Revenue accounts increase with credits
- ✅ Expense accounts increase with debits
- ✅ Only includes entries within date range

### **Cash Flow Statement:**
- ✅ Categorizes activities: Operating, Investing, Financing
- ✅ Beginning + Net Cash Flow = Ending Cash Balance
- ✅ Matches bank account movements

---

## 🎯 **INTERPRETATION**

### **ALL BALANCED ✅**
Your accounting data is correct! All double-entry rules are satisfied.

### **UNBALANCED ❌**
Your accounting data has errors. Common causes:
- Missing journal entries
- Incorrect debit/credit assignments
- Voided entries not properly handled
- Corrupted data

**Next Steps:**
1. Run `node scripts/audit-journal-entries.js`
2. Review unbalanced entries
3. Fix or void incorrect entries
4. Re-run this test

---

## 📊 **INTEGRATION WITH CI/CD**

Add to your pipeline:

```yaml
# .github/workflows/test.yml
- name: Test Financial Statements
  run: node scripts/test-statements-simple.js
```

**Exit Codes:**
- `0` - All tests passed
- `1` - One or more tests failed

---

## 📚 **RELATED DOCUMENTATION**

- `ACCOUNTING_MODULE_FIXES_SUMMARY.md` - Recent fixes to accounting endpoints
- `scripts/audit-journal-entries.js` - Audit script for finding data issues
- `scripts/cleanup-bad-journal-entries.js` - Script to fix data issues

---

## 🤝 **SUPPORT**

If tests fail consistently:
1. Check all prerequisites are met
2. Review error messages carefully
3. Run audit scripts to identify specific issues
4. Check server logs for API errors (if using API test)

---

**Last Updated:** October 14, 2025  
**Status:** ✅ **READY TO USE**


