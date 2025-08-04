# Expense Update Workflow Tests

This directory contains comprehensive tests for the expense update workflow with proper double-entry bookkeeping.

## Overview

The expense update workflow implements proper accounting practices where:
1. **Creating an expense**: Creates a journal entry (Dr Expense, Dr VAT Input, Cr Bank)
2. **Updating a posted expense**: 
   - Creates a reversal journal entry (Cr Expense, Cr VAT Input, Dr Bank)
   - Updates the expense with new amounts
   - Creates a new journal entry with updated amounts

## Test Files

### 1. `quick-expense-test.ps1`
**Quick test for basic functionality**
- Creates an expense (300 ZWL, taxable)
- Updates it to 500 ZWL
- Verifies journal entries and net effect
- **Duration**: ~30 seconds

### 2. `test-expense-update-verification.ps1`
**Comprehensive test with detailed verification**
- Full workflow testing with detailed logging
- Verifies all journal entries and calculations
- Saves detailed test results
- **Duration**: ~2-3 minutes

### 3. `run-expense-tests.ps1`
**Test runner script**
- Runs multiple tests and generates reports
- Saves results to JSON files
- Provides summary statistics

## Prerequisites

Before running the tests, ensure you have:

1. **Server running** on `http://localhost:3000` (or update `$BaseUrl`)
2. **Valid authentication token** (JWT token)
3. **Required data set up**:
   - At least one vendor
   - At least one expense category
   - At least one currency
   - Chart of accounts with:
     - An expense account (e.g., "Legal Fees")
     - A VAT Input account
     - A Bank Account

## How to Run Tests

### Quick Test (Recommended for first run)
```powershell
.\quick-expense-test.ps1 -Token "your-jwt-token-here"
```

### Comprehensive Test
```powershell
.\test-expense-update-verification.ps1 -Token "your-jwt-token-here"
```

### Test Runner (Multiple tests)
```powershell
# Quick test suite
.\run-expense-tests.ps1 -Token "your-jwt-token-here" -TestType "quick"

# Full test suite
.\run-expense-tests.ps1 -Token "your-jwt-token-here" -TestType "full"
```

## Expected Results

### Test Scenario
1. **Create expense**: 300 ZWL, taxable (VAT: 43.50 ZWL)
2. **Update expense**: 500 ZWL, taxable (VAT: 72.50 ZWL)

### Expected Journal Entries
1. **Original Entry**: Dr Legal Fees 300, Dr VAT Input 43.50, Cr Bank 343.50
2. **Reversal Entry**: Cr Legal Fees 300, Cr VAT Input 43.50, Dr Bank 343.50
3. **Updated Entry**: Dr Legal Fees 500, Dr VAT Input 72.50, Cr Bank 572.50

### Expected Net Effect
- **Amount Change**: +200 ZWL (500 - 300)
- **VAT Change**: +29 ZWL (72.50 - 43.50)
- **Total Change**: +229 ZWL (572.50 - 343.50)

## Test Results

Test results are saved in the `test-results/` directory with timestamps:
- `expense-test-results-YYYYMMDD-HHMMSS.json`
- `test-expense-update-test-YYYYMMDD-HHMMSS.json`

### Sample Test Output
```
=== Quick Expense Update Test ===

1. Getting required data...
   ✅ Using: Test Vendor, Legal Fees, ZWL

2. Creating expense: 300 ZWL...
   ✅ Created: ID=abc123, Amount=300, VAT=43.5, Total=343.5
   📋 Journal Entry: JE-1234567890-123

3. Updating expense to 500 ZWL...
   ✅ Updated: Amount=500, VAT=72.5, Total=572.5
   📋 New Journal Entry: JE-1234567890-456

4. Verifying journal entries...
   📋 Found 3 relevant journal entries:
      - JE-1234567890-123: Expense: Test Expense - Initial
      - JE-1234567890-234: REVERSAL: Test Expense - Initial
      - JE-1234567890-456: Expense: Test Expense - Updated

5. Verifying net effect...
   📊 Net Change: Amount +200, VAT +29, Total +229
   ✅ Net effect matches expected values!

✅ Test completed successfully!
   Double-entry bookkeeping is working correctly.
```

## Troubleshooting

### Common Issues

1. **"Failed to get required data"**
   - Ensure vendors, categories, and currencies exist
   - Check authentication token

2. **"No active expense account found"**
   - Set up chart of accounts with required accounts
   - Ensure accounts are marked as active

3. **"Failed to create expense"**
   - Check server is running
   - Verify all required fields are provided
   - Check authentication token

4. **"Net effect mismatch"**
   - Verify VAT rate is set correctly (default: 14.5%)
   - Check calculations in the test

### Debug Mode

To see more detailed output, you can modify the test scripts to include debug information:

```powershell
# Add this to see raw API responses
Write-Host "API Response: $($response | ConvertTo-Json -Depth 5)" -ForegroundColor Gray
```

## Test Data Cleanup

The tests create real data in your database. To clean up:

1. **Delete test expenses**:
   ```sql
   DELETE FROM expenses WHERE description LIKE '%Test%';
   ```

2. **Delete test journal entries**:
   ```sql
   DELETE FROM journal_entries WHERE description LIKE '%Test%';
   ```

3. **Or use the cleanup script** (if available):
   ```powershell
   .\cleanup-test-data.ps1 -Token "your-jwt-token-here"
   ```

## Contributing

When adding new tests:

1. Follow the naming convention: `test-*.ps1`
2. Include proper error handling
3. Add test results to the JSON output
4. Update this README with new test descriptions
5. Ensure tests are idempotent (can be run multiple times)

## Support

If you encounter issues:

1. Check the test results JSON files for detailed error information
2. Verify all prerequisites are met
3. Check server logs for API errors
4. Ensure database schema is up to date 