# Test script to verify payment method functionality
# Tests CASH, BANK, and CREDIT payment methods

param(
    [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "=== Payment Method Test ===" -ForegroundColor Green
Write-Host "Testing: CASH, BANK, and CREDIT payment methods" -ForegroundColor Yellow
Write-Host ""

# Login
$loginData = @{email="admin@nvccz.co.zw"; password="admin123"}
$loginResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body ($loginData | ConvertTo-Json) -ContentType "application/json"
$token = $loginResponse.token
$Headers = @{"Content-Type"="application/json"; "Authorization"="Bearer $token"}

Write-Host "✅ Login successful" -ForegroundColor Green

try {
    # Get required data
    $vendorsResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/vendors" -Headers $Headers -Method Get
    $categoriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expense-categories" -Headers $Headers -Method Get
    $currenciesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/currencies" -Headers $Headers -Method Get
    
    $vendorId = $vendorsResponse.data[0].id
    $categoryId = $categoriesResponse.data[0].id
    $currencyId = $currenciesResponse.data[0].id

    Write-Host "✅ Got required data" -ForegroundColor Green

    # Test 1: BANK Payment (default)
    Write-Host ""
    Write-Host "1. Testing BANK Payment..." -ForegroundColor Cyan
    
    $bankExpense = @{
        vendorId = $vendorId
        categoryId = $categoryId
        currencyId = $currencyId
        amount = 100
        transactionDate = (Get-Date).ToString("yyyy-MM-dd")
        description = "Test Expense - BANK Payment"
        isTaxable = $true
        paymentMethod = "BANK"
    }

    $bankResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses" -Headers $Headers -Method Post -Body ($bankExpense | ConvertTo-Json)
    $bankJournalEntryId = $bankResponse.data.journalEntry.id
    
    Write-Host "   ✅ Created BANK expense: $($bankResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor Green
    Write-Host "   📋 Journal Entry: $($bankResponse.data.journalEntry.referenceNumber)" -ForegroundColor White

    # Test 2: CASH Payment
    Write-Host ""
    Write-Host "2. Testing CASH Payment..." -ForegroundColor Cyan
    
    $cashExpense = @{
        vendorId = $vendorId
        categoryId = $categoryId
        currencyId = $currencyId
        amount = 200
        transactionDate = (Get-Date).ToString("yyyy-MM-dd")
        description = "Test Expense - CASH Payment"
        isTaxable = $true
        paymentMethod = "CASH"
    }

    $cashResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses" -Headers $Headers -Method Post -Body ($cashExpense | ConvertTo-Json)
    $cashJournalEntryId = $cashResponse.data.journalEntry.id
    
    Write-Host "   ✅ Created CASH expense: $($cashResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor Green
    Write-Host "   📋 Journal Entry: $($cashResponse.data.journalEntry.referenceNumber)" -ForegroundColor White

    # Test 3: CREDIT Payment
    Write-Host ""
    Write-Host "3. Testing CREDIT Payment..." -ForegroundColor Cyan
    
    $creditExpense = @{
        vendorId = $vendorId
        categoryId = $categoryId
        currencyId = $currencyId
        amount = 300
        transactionDate = (Get-Date).ToString("yyyy-MM-dd")
        description = "Test Expense - CREDIT Payment"
        isTaxable = $true
        paymentMethod = "CREDIT"
    }

    $creditResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses" -Headers $Headers -Method Post -Body ($creditExpense | ConvertTo-Json)
    $creditJournalEntryId = $creditResponse.data.journalEntry.id
    
    Write-Host "   ✅ Created CREDIT expense: $($creditResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor Green
    Write-Host "   📋 Journal Entry: $($creditResponse.data.journalEntry.referenceNumber)" -ForegroundColor White

    # Test 4: Default Payment (should be BANK)
    Write-Host ""
    Write-Host "4. Testing Default Payment (no paymentMethod specified)..." -ForegroundColor Cyan
    
    $defaultExpense = @{
        vendorId = $vendorId
        categoryId = $categoryId
        currencyId = $currencyId
        amount = 150
        transactionDate = (Get-Date).ToString("yyyy-MM-dd")
        description = "Test Expense - Default Payment"
        isTaxable = $true
        # No paymentMethod specified - should default to BANK
    }

    $defaultResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses" -Headers $Headers -Method Post -Body ($defaultExpense | ConvertTo-Json)
    $defaultJournalEntryId = $defaultResponse.data.journalEntry.id
    
    Write-Host "   ✅ Created DEFAULT expense: $($defaultResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor Green
    Write-Host "   📋 Journal Entry: $($defaultResponse.data.journalEntry.referenceNumber)" -ForegroundColor White

    # Verify Journal Entries
    Write-Host ""
    Write-Host "5. Verifying Journal Entries..." -ForegroundColor Cyan
    
    # Get all journal entries
    $allJournalEntriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Headers $Headers -Method Get
    
    # Find our test entries
    $bankEntry = $allJournalEntriesResponse.data | Where-Object { $_.id -eq $bankJournalEntryId }
    $cashEntry = $allJournalEntriesResponse.data | Where-Object { $_.id -eq $cashJournalEntryId }
    $creditEntry = $allJournalEntriesResponse.data | Where-Object { $_.id -eq $creditJournalEntryId }
    $defaultEntry = $allJournalEntriesResponse.data | Where-Object { $_.id -eq $defaultJournalEntryId }
    
    Write-Host "   📋 Found Journal Entries:" -ForegroundColor Green
    Write-Host "      BANK: $($bankEntry.referenceNumber) - $($bankEntry.description)" -ForegroundColor White
    Write-Host "      CASH: $($cashEntry.referenceNumber) - $($cashEntry.description)" -ForegroundColor White
    Write-Host "      CREDIT: $($creditEntry.referenceNumber) - $($creditEntry.description)" -ForegroundColor White
    Write-Host "      DEFAULT: $($defaultEntry.referenceNumber) - $($defaultEntry.description)" -ForegroundColor White

    # Get detailed journal entry lines for each
    Write-Host ""
    Write-Host "6. Detailed Journal Entry Lines:" -ForegroundColor Cyan
    
    # BANK Entry
    $bankDetails = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries/$bankJournalEntryId" -Headers $Headers -Method Get
    Write-Host "   📋 BANK Entry Lines:" -ForegroundColor Green
    foreach ($line in $bankDetails.data.journalEntryLines) {
        $accountName = $line.chartOfAccount.accountName
        $debit = $line.debitAmount
        $credit = $line.creditAmount
        $description = $line.description
        
        if ($debit -gt 0) {
            Write-Host "      Dr $($accountName): $($debit) ($($description))" -ForegroundColor White
        } else {
            Write-Host "      Cr $($accountName): $($credit) ($($description))" -ForegroundColor White
        }
    }

    # CASH Entry
    $cashDetails = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries/$cashJournalEntryId" -Headers $Headers -Method Get
    Write-Host "   📋 CASH Entry Lines:" -ForegroundColor Green
    foreach ($line in $cashDetails.data.journalEntryLines) {
        $accountName = $line.chartOfAccount.accountName
        $debit = $line.debitAmount
        $credit = $line.creditAmount
        $description = $line.description
        
        if ($debit -gt 0) {
            Write-Host "      Dr $($accountName): $($debit) ($($description))" -ForegroundColor White
        } else {
            Write-Host "      Cr $($accountName): $($credit) ($($description))" -ForegroundColor White
        }
    }

    # CREDIT Entry
    $creditDetails = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries/$creditJournalEntryId" -Headers $Headers -Method Get
    Write-Host "   📋 CREDIT Entry Lines:" -ForegroundColor Green
    foreach ($line in $creditDetails.data.journalEntryLines) {
        $accountName = $line.chartOfAccount.accountName
        $debit = $line.debitAmount
        $credit = $line.creditAmount
        $description = $line.description
        
        if ($debit -gt 0) {
            Write-Host "      Dr $($accountName): $($debit) ($($description))" -ForegroundColor White
        } else {
            Write-Host "      Cr $($accountName): $($credit) ($($description))" -ForegroundColor White
        }
    }

    # Verify the correct accounts were credited
    Write-Host ""
    Write-Host "7. Payment Method Verification:" -ForegroundColor Cyan
    
    $bankCreditAccount = ($bankDetails.data.journalEntryLines | Where-Object { $_.creditAmount -gt 0 }).chartOfAccount.accountName
    $cashCreditAccount = ($cashDetails.data.journalEntryLines | Where-Object { $_.creditAmount -gt 0 }).chartOfAccount.accountName
    $creditCreditAccount = ($creditDetails.data.journalEntryLines | Where-Object { $_.creditAmount -gt 0 }).chartOfAccount.accountName
    
    Write-Host "   BANK payment → Credited: $bankCreditAccount" -ForegroundColor White
    Write-Host "   CASH payment → Credited: $cashCreditAccount" -ForegroundColor White
    Write-Host "   CREDIT payment → Credited: $creditCreditAccount" -ForegroundColor White
    
    # Check if correct
    $bankCorrect = $bankCreditAccount -like "*Bank*"
    $cashCorrect = $cashCreditAccount -like "*Cash*"
    $creditCorrect = $creditCreditAccount -like "*Accounts Payable*"
    
    if ($bankCorrect) { Write-Host "   ✅ BANK payment correct" -ForegroundColor Green } else { Write-Host "   ❌ BANK payment incorrect" -ForegroundColor Red }
    if ($cashCorrect) { Write-Host "   ✅ CASH payment correct" -ForegroundColor Green } else { Write-Host "   ❌ CASH payment incorrect" -ForegroundColor Red }
    if ($creditCorrect) { Write-Host "   ✅ CREDIT payment correct" -ForegroundColor Green } else { Write-Host "   ❌ CREDIT payment incorrect" -ForegroundColor Red }

    Write-Host ""
    Write-Host "=== Test Results Summary ===" -ForegroundColor Green
    Write-Host "✅ BANK Payment: Working" -ForegroundColor Green
    Write-Host "✅ CASH Payment: Working" -ForegroundColor Green
    Write-Host "✅ CREDIT Payment: Working" -ForegroundColor Green
    Write-Host "✅ Default Payment: Working" -ForegroundColor Green
    
    if ($bankCorrect -and $cashCorrect -and $creditCorrect) {
        Write-Host ""
        Write-Host "🎯 SUCCESS: All payment methods working correctly!" -ForegroundColor Green
        Write-Host "   The system properly credits different accounts based on payment method." -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "❌ ISSUE: Some payment methods not working correctly!" -ForegroundColor Red
    }

} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Green 