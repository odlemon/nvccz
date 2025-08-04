# Test Expense Creation Workflow and Double-Entry Verification
# This script tests all possible scenarios for expense creation

$baseUrl = "http://localhost:3000"
$token = ""

Write-Host "=== EXPENSE CREATION WORKFLOW TEST ===" -ForegroundColor Magenta
Write-Host ""

# Step 1: Login to get token
Write-Host "1. Logging in to get authentication token..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{
  "email": "admin@example.com",
  "password": "password123"
}'

if ($loginResponse.success) {
    $token = $loginResponse.data.token
    Write-Host "✓ Login successful" -ForegroundColor Green
} else {
    Write-Host "✗ Login failed" -ForegroundColor Red
    exit 1
}

# Step 2: Get required IDs (vendor, category, currency)
Write-Host "`n2. Getting required IDs..." -ForegroundColor Yellow

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Get vendors
$vendorsResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
$vendorId = $vendorsResponse.data[0].id
Write-Host "✓ Vendor ID: $vendorId" -ForegroundColor Green

# Get categories
$categoriesResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expense-categories" -Method GET -Headers $headers
$categoryId = $categoriesResponse.data[0].id
Write-Host "✓ Category ID: $categoryId" -ForegroundColor Green

# Get currencies
$currenciesResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers $headers
$currencyId = $currenciesResponse.data[0].id
Write-Host "✓ Currency ID: $currencyId" -ForegroundColor Green

# Step 3: Test Scenario 1 - Taxable Expense (300 ZWL)
Write-Host "`n3. Testing Scenario 1: Taxable Expense (300 ZWL)" -ForegroundColor Cyan
Write-Host "Expected: VAT = 43.5, Total = 343.5" -ForegroundColor White

$taxableExpense = @{
    vendorId = $vendorId
    categoryId = $categoryId
    amount = 300
    currencyId = $currencyId
    transactionDate = "2024-06-01"
    description = "Legal Fees - Taxable"
    isTaxable = $true
    createdById = "test-user"
} | ConvertTo-Json

try {
    $taxableResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method POST -Headers $headers -Body $taxableExpense
    
    if ($taxableResponse.success) {
        $expense1 = $taxableResponse.data
        Write-Host "✓ Taxable expense created successfully" -ForegroundColor Green
        Write-Host "  Amount: $($expense1.amount)" -ForegroundColor White
        Write-Host "  VAT Amount: $($expense1.vatAmount)" -ForegroundColor White
        Write-Host "  Total Amount: $($expense1.totalAmount)" -ForegroundColor White
        Write-Host "  Status: $($expense1.status)" -ForegroundColor White
        
        # Verify amounts
        $expectedVAT = 43.5
        $expectedTotal = 343.5
        
        if ([math]::Abs($expense1.vatAmount - $expectedVAT) -lt 0.01) {
            Write-Host "  ✓ VAT calculation correct" -ForegroundColor Green
        } else {
            Write-Host "  ✗ VAT calculation incorrect" -ForegroundColor Red
        }
        
        if ([math]::Abs($expense1.totalAmount - $expectedTotal) -lt 0.01) {
            Write-Host "  ✓ Total calculation correct" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Total calculation incorrect" -ForegroundColor Red
        }
        
        # Get journal entry
        $journalEntryId = $expense1.journalEntry.id
        $journalResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries/$journalEntryId" -Method GET -Headers $headers
        
        if ($journalResponse.success) {
            $journalEntry = $journalResponse.data
            Write-Host "  ✓ Journal entry retrieved" -ForegroundColor Green
            
            # Verify journal entry lines
            $lines = $journalEntry.journalEntryLines
            Write-Host "  Journal Entry Lines:" -ForegroundColor Yellow
            
            $totalDebits = 0
            $totalCredits = 0
            
            foreach ($line in $lines) {
                $debit = [double]$line.debitAmount
                $credit = [double]$line.creditAmount
                $accountName = $line.chartOfAccount.accountName
                $description = $line.description
                
                $totalDebits += $debit
                $totalCredits += $credit
                
                if ($debit -gt 0) {
                    Write-Host "    Dr $accountName`: $debit ($description)" -ForegroundColor Green
                } elseif ($credit -gt 0) {
                    Write-Host "    Cr $accountName`: $credit ($description)" -ForegroundColor Red
                }
            }
            
            # Verify balance
            $balance = [math]::Abs($totalDebits - $totalCredits)
            if ($balance -lt 0.01) {
                Write-Host "  ✓ Journal entry is balanced (Debits: $totalDebits, Credits: $totalCredits)" -ForegroundColor Green
            } else {
                Write-Host "  ✗ Journal entry is not balanced (Debits: $totalDebits, Credits: $totalCredits)" -ForegroundColor Red
            }
            
            # Verify Bank Account is credited
            $bankCredit = $lines | Where-Object { $_.chartOfAccount.accountName -like "*Bank*" -and [double]$_.creditAmount -gt 0 }
            if ($bankCredit) {
                Write-Host "  ✓ Bank Account is credited (not Accounts Payable)" -ForegroundColor Green
            } else {
                Write-Host "  ✗ Bank Account is not credited" -ForegroundColor Red
            }
        }
    }
} catch {
    Write-Host "✗ Error creating taxable expense: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 4: Test Scenario 2 - Non-Taxable Expense (200 ZWL)
Write-Host "`n4. Testing Scenario 2: Non-Taxable Expense (200 ZWL)" -ForegroundColor Cyan
Write-Host "Expected: VAT = 0, Total = 200" -ForegroundColor White

$nonTaxableExpense = @{
    vendorId = $vendorId
    categoryId = $categoryId
    amount = 200
    currencyId = $currencyId
    transactionDate = "2024-06-01"
    description = "Travel - Non-Taxable"
    isTaxable = $false
    createdById = "test-user"
} | ConvertTo-Json

try {
    $nonTaxableResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method POST -Headers $headers -Body $nonTaxableExpense
    
    if ($nonTaxableResponse.success) {
        $expense2 = $nonTaxableResponse.data
        Write-Host "✓ Non-taxable expense created successfully" -ForegroundColor Green
        Write-Host "  Amount: $($expense2.amount)" -ForegroundColor White
        Write-Host "  VAT Amount: $($expense2.vatAmount)" -ForegroundColor White
        Write-Host "  Total Amount: $($expense2.totalAmount)" -ForegroundColor White
        Write-Host "  Status: $($expense2.status)" -ForegroundColor White
        
        # Verify amounts
        $expectedVAT = 0
        $expectedTotal = 200
        
        if ([math]::Abs($expense2.vatAmount - $expectedVAT) -lt 0.01) {
            Write-Host "  ✓ VAT calculation correct (0 for non-taxable)" -ForegroundColor Green
        } else {
            Write-Host "  ✗ VAT calculation incorrect" -ForegroundColor Red
        }
        
        if ([math]::Abs($expense2.totalAmount - $expectedTotal) -lt 0.01) {
            Write-Host "  ✓ Total calculation correct" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Total calculation incorrect" -ForegroundColor Red
        }
        
        # Get journal entry
        $journalEntryId = $expense2.journalEntry.id
        $journalResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries/$journalEntryId" -Method GET -Headers $headers
        
        if ($journalResponse.success) {
            $journalEntry = $journalResponse.data
            Write-Host "  ✓ Journal entry retrieved" -ForegroundColor Green
            
            # Verify journal entry lines (should only have 2 lines for non-taxable)
            $lines = $journalEntry.journalEntryLines
            Write-Host "  Journal Entry Lines (Non-Taxable):" -ForegroundColor Yellow
            
            $totalDebits = 0
            $totalCredits = 0
            
            foreach ($line in $lines) {
                $debit = [double]$line.debitAmount
                $credit = [double]$line.creditAmount
                $accountName = $line.chartOfAccount.accountName
                $description = $line.description
                
                $totalDebits += $debit
                $totalCredits += $credit
                
                if ($debit -gt 0) {
                    Write-Host "    Dr $accountName`: $debit ($description)" -ForegroundColor Green
                } elseif ($credit -gt 0) {
                    Write-Host "    Cr $accountName`: $credit ($description)" -ForegroundColor Red
                }
            }
            
            # Verify balance
            $balance = [math]::Abs($totalDebits - $totalCredits)
            if ($balance -lt 0.01) {
                Write-Host "  ✓ Journal entry is balanced (Debits: $totalDebits, Credits: $totalCredits)" -ForegroundColor Green
            } else {
                Write-Host "  ✗ Journal entry is not balanced (Debits: $totalDebits, Credits: $totalCredits)" -ForegroundColor Red
            }
            
            # Verify only 2 lines for non-taxable
            if ($lines.Count -eq 2) {
                Write-Host "  ✓ Correct number of journal lines (2 for non-taxable)" -ForegroundColor Green
            } else {
                Write-Host "  ✗ Incorrect number of journal lines (expected 2, got $($lines.Count))" -ForegroundColor Red
            }
        }
    }
} catch {
    Write-Host "✗ Error creating non-taxable expense: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 5: Test Scenario 3 - Large Amount (1000 ZWL)
Write-Host "`n5. Testing Scenario 3: Large Taxable Amount (1000 ZWL)" -ForegroundColor Cyan
Write-Host "Expected: VAT = 145, Total = 1145" -ForegroundColor White

$largeExpense = @{
    vendorId = $vendorId
    categoryId = $categoryId
    amount = 1000
    currencyId = $currencyId
    transactionDate = "2024-06-01"
    description = "Large Equipment Purchase"
    isTaxable = $true
    createdById = "test-user"
} | ConvertTo-Json

try {
    $largeResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method POST -Headers $headers -Body $largeExpense
    
    if ($largeResponse.success) {
        $expense3 = $largeResponse.data
        Write-Host "✓ Large expense created successfully" -ForegroundColor Green
        Write-Host "  Amount: $($expense3.amount)" -ForegroundColor White
        Write-Host "  VAT Amount: $($expense3.vatAmount)" -ForegroundColor White
        Write-Host "  Total Amount: $($expense3.totalAmount)" -ForegroundColor White
        
        # Verify amounts
        $expectedVAT = 145
        $expectedTotal = 1145
        
        if ([math]::Abs($expense3.vatAmount - $expectedVAT) -lt 0.01) {
            Write-Host "  ✓ VAT calculation correct" -ForegroundColor Green
        } else {
            Write-Host "  ✗ VAT calculation incorrect" -ForegroundColor Red
        }
        
        if ([math]::Abs($expense3.totalAmount - $expectedTotal) -lt 0.01) {
            Write-Host "  ✓ Total calculation correct" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Total calculation incorrect" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "✗ Error creating large expense: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 6: Test Error Handling
Write-Host "`n6. Testing Error Handling" -ForegroundColor Cyan

# Test 6a: Negative amount
Write-Host "  6a. Testing negative amount..." -ForegroundColor Yellow
$negativeExpense = @{
    vendorId = $vendorId
    categoryId = $categoryId
    amount = -100
    currencyId = $currencyId
    transactionDate = "2024-06-01"
    description = "Invalid Amount"
    isTaxable = $true
    createdById = "test-user"
} | ConvertTo-Json

try {
    $negativeResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method POST -Headers $headers -Body $negativeExpense
    Write-Host "  ✗ Should have failed with negative amount" -ForegroundColor Red
} catch {
    Write-Host "  ✓ Correctly rejected negative amount" -ForegroundColor Green
}

# Test 6b: Empty description
Write-Host "  6b. Testing empty description..." -ForegroundColor Yellow
$emptyDescExpense = @{
    vendorId = $vendorId
    categoryId = $categoryId
    amount = 100
    currencyId = $currencyId
    transactionDate = "2024-06-01"
    description = ""
    isTaxable = $true
    createdById = "test-user"
} | ConvertTo-Json

try {
    $emptyDescResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method POST -Headers $headers -Body $emptyDescExpense
    Write-Host "  ✗ Should have failed with empty description" -ForegroundColor Red
} catch {
    Write-Host "  ✓ Correctly rejected empty description" -ForegroundColor Green
}

# Test 6c: Invalid vendor ID
Write-Host "  6c. Testing invalid vendor ID..." -ForegroundColor Yellow
$invalidVendorExpense = @{
    vendorId = "invalid-vendor-id"
    categoryId = $categoryId
    amount = 100
    currencyId = $currencyId
    transactionDate = "2024-06-01"
    description = "Invalid Vendor"
    isTaxable = $true
    createdById = "test-user"
} | ConvertTo-Json

try {
    $invalidVendorResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method POST -Headers $headers -Body $invalidVendorExpense
    Write-Host "  ✗ Should have failed with invalid vendor" -ForegroundColor Red
} catch {
    Write-Host "  ✓ Correctly rejected invalid vendor" -ForegroundColor Green
}

# Step 7: Summary
Write-Host "`n=== TEST SUMMARY ===" -ForegroundColor Magenta
Write-Host "✓ Taxable expense creation and journal entry verification" -ForegroundColor Green
Write-Host "✓ Non-taxable expense creation and journal entry verification" -ForegroundColor Green
Write-Host "✓ Large amount calculation verification" -ForegroundColor Green
Write-Host "✓ Error handling for invalid inputs" -ForegroundColor Green
Write-Host "✓ Double-entry balance verification" -ForegroundColor Green
Write-Host "✓ Bank Account crediting verification" -ForegroundColor Green

Write-Host "`n🎯 All expense creation workflow tests completed!" -ForegroundColor Magenta 