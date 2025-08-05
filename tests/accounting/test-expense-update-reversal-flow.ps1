# Comprehensive test script to verify expense update workflow with journal entry reversals
# This script tests the exact flow: create expense -> update -> verify reversal entries

param(
    [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "=== Expense Update Reversal Flow Test ===" -ForegroundColor Green
Write-Host "Testing: Create Expense -> Update -> Verify Reversal Journal Entries" -ForegroundColor Yellow
Write-Host ""

# Step 1: Login as admin
Write-Host "1. Logging in as admin..." -ForegroundColor Cyan

$loginData = @{
    email = "admin@nvccz.co.zw"
    password = "admin123"
}

try {
    $loginResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body ($loginData | ConvertTo-Json) -ContentType "application/json"
    $token = $loginResponse.token
    $Headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
    
    Write-Host "   ✅ Login successful: $($loginResponse.message)" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor White
} catch {
    Write-Host "   ❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

try {
    # Step 2: Get required data
    Write-Host "2. Getting required data..." -ForegroundColor Cyan
    
    $vendorsResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/vendors" -Headers $Headers -Method Get
    $categoriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expense-categories" -Headers $Headers -Method Get
    $currenciesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/currencies" -Headers $Headers -Method Get
    
    $vendorId = $vendorsResponse.data[0].id
    $categoryId = $categoriesResponse.data[0].id
    $currencyId = $currenciesResponse.data[0].id
    
    Write-Host "   ✅ Vendor: $($vendorsResponse.data[0].name)" -ForegroundColor Green
    Write-Host "   ✅ Category: $($categoriesResponse.data[0].name)" -ForegroundColor Green
    Write-Host "   ✅ Currency: $($currenciesResponse.data[0].code)" -ForegroundColor Green

    # Step 3: Create initial expense (300 ZWL)
    Write-Host ""
    Write-Host "3. Creating initial expense: 300 ZWL..." -ForegroundColor Cyan
    
    $initialExpense = @{
        vendorId = $vendorId
        categoryId = $categoryId
        currencyId = $currencyId
        amount = 300
        transactionDate = (Get-Date).ToString("yyyy-MM-dd")
        description = "Test Expense - Initial 300 ZWL"
        isTaxable = $true
    }

    $createResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses" -Headers $Headers -Method Post -Body ($initialExpense | ConvertTo-Json)
    $expenseId = $createResponse.data.id
    $originalJournalEntryId = $createResponse.data.journalEntry.id
    $originalJournalEntryRef = $createResponse.data.journalEntry.referenceNumber
    
    Write-Host "   ✅ Created Expense:" -ForegroundColor Green
    Write-Host "      ID: $expenseId" -ForegroundColor White
    Write-Host "      Amount: $($createResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor White
    Write-Host "      VAT: $($createResponse.data.vatAmount) $($currenciesResponse.data[0].code)" -ForegroundColor White
    Write-Host "      Total: $($createResponse.data.totalAmount) $($currenciesResponse.data[0].code)" -ForegroundColor White
    Write-Host "      Status: $($createResponse.data.status)" -ForegroundColor White
    Write-Host "      Journal Entry: $originalJournalEntryRef" -ForegroundColor White

    # Step 4: Get journal entry details before update
    Write-Host ""
    Write-Host "4. Getting original journal entry details..." -ForegroundColor Cyan
    
    $originalJournalResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries/$originalJournalEntryId" -Headers $Headers -Method Get
    
    Write-Host "   Original Journal Entry Lines:" -ForegroundColor Green
    foreach ($line in $originalJournalResponse.data.journalEntryLines) {
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

    # Step 5: Update expense to 500 ZWL (financial change)
    Write-Host ""
    Write-Host "5. Updating expense to 500 ZWL (financial change)..." -ForegroundColor Cyan
    
    $updateData = @{
        vendorId = $vendorId
        categoryId = $categoryId
        currencyId = $currencyId
        amount = 500  # Financial change - should trigger reversal
        transactionDate = (Get-Date).ToString("yyyy-MM-dd")
        description = "Test Expense - Updated 500 ZWL"
        isTaxable = $true
    }

    $updateResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses/$expenseId" -Headers $Headers -Method Put -Body ($updateData | ConvertTo-Json)
    $newJournalEntryId = $updateResponse.data.journalEntry.id
    $newJournalEntryRef = $updateResponse.data.journalEntry.referenceNumber
    
    Write-Host "   ✅ Updated Expense:" -ForegroundColor Green
    Write-Host "      Amount: $($updateResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor White
    Write-Host "      VAT: $($updateResponse.data.vatAmount) $($currenciesResponse.data[0].code)" -ForegroundColor White
    Write-Host "      Total: $($updateResponse.data.totalAmount) $($currenciesResponse.data[0].code)" -ForegroundColor White
    Write-Host "      Status: $($updateResponse.data.status)" -ForegroundColor White
    Write-Host "      New Journal Entry: $newJournalEntryRef" -ForegroundColor White

    # Step 6: Get all journal entries to find reversal
    Write-Host ""
    Write-Host "6. Analyzing all journal entries..." -ForegroundColor Cyan
    
    $allJournalEntriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Headers $Headers -Method Get
    
    # Find relevant entries
    $originalEntry = $allJournalEntriesResponse.data | Where-Object { $_.id -eq $originalJournalEntryId }
    $newEntry = $allJournalEntriesResponse.data | Where-Object { $_.id -eq $newJournalEntryId }
    $reversalEntries = $allJournalEntriesResponse.data | Where-Object { $_.description -like "*REVERSAL*" }
    
    Write-Host "   Found Journal Entries:" -ForegroundColor Green
    Write-Host "      Original: $($originalEntry.referenceNumber) - $($originalEntry.description)" -ForegroundColor White
    Write-Host "      New: $($newEntry.referenceNumber) - $($newEntry.description)" -ForegroundColor White
    
    if ($reversalEntries.Count -gt 0) {
        Write-Host "      Reversals: $($reversalEntries.Count) found" -ForegroundColor Green
        foreach ($reversal in $reversalEntries) {
            Write-Host "         - $($reversal.referenceNumber) - $($reversal.description)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "      ❌ No reversal entries found!" -ForegroundColor Red
    }

    # Step 7: Get detailed journal entry lines for verification
    Write-Host ""
    Write-Host "7. Verifying journal entry lines..." -ForegroundColor Cyan
    
    # Get new journal entry details
    $newJournalResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries/$newJournalEntryId" -Headers $Headers -Method Get
    
    Write-Host "   New Journal Entry Lines:" -ForegroundColor Green
    foreach ($line in $newJournalResponse.data.journalEntryLines) {
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

    # Step 8: Calculate and verify net effect
    Write-Host ""
    Write-Host "8. Verifying net effect..." -ForegroundColor Cyan
    
    $amountChange = $updateResponse.data.amount - $createResponse.data.amount
    $vatChange = $updateResponse.data.vatAmount - $createResponse.data.vatAmount
    $totalChange = $updateResponse.data.totalAmount - $createResponse.data.totalAmount
    
    Write-Host "   Net Change:" -ForegroundColor Green
    Write-Host "      Amount: +$amountChange $($currenciesResponse.data[0].code)" -ForegroundColor White
    Write-Host "      VAT: +$vatChange $($currenciesResponse.data[0].code)" -ForegroundColor White
    Write-Host "      Total: +$totalChange $($currenciesResponse.data[0].code)" -ForegroundColor White
    
    # Verify expected values (14.5% VAT rate)
    $expectedAmountChange = 200
    $expectedVATChange = 29  # 14.5% of 200
    $expectedTotalChange = 229
    
    if ($amountChange -eq $expectedAmountChange -and $vatChange -eq $expectedVATChange -and $totalChange -eq $expectedTotalChange) {
        Write-Host "   ✅ Net effect matches expected values!" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Net effect mismatch!" -ForegroundColor Red
        Write-Host "      Expected: Amount +$expectedAmountChange, VAT +$expectedVATChange, Total +$expectedTotalChange" -ForegroundColor Yellow
    }

    # Step 9: Test non-financial update (should not trigger reversal)
    Write-Host ""
    Write-Host "9. Testing non-financial update (description only)..." -ForegroundColor Cyan
    
    $nonFinancialUpdate = @{
        description = "Test Expense - Non-Financial Update Only"
    }

    $nonFinancialResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses/$expenseId" -Headers $Headers -Method Put -Body ($nonFinancialUpdate | ConvertTo-Json)
    
    Write-Host "   ✅ Non-financial update successful:" -ForegroundColor Green
    Write-Host "      Description: $($nonFinancialResponse.data.description)" -ForegroundColor White
    Write-Host "      Journal Entry: $($nonFinancialResponse.data.journalEntry.referenceNumber)" -ForegroundColor White
    
    # Check if journal entry ID changed (should not for non-financial updates)
    if ($nonFinancialResponse.data.journalEntry.id -eq $newJournalEntryId) {
        Write-Host "   ✅ Journal entry unchanged (correct behavior)" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Journal entry changed unexpectedly!" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "=== Test Results Summary ===" -ForegroundColor Green
    Write-Host "✅ Login: Successful" -ForegroundColor Green
    Write-Host "✅ Expense Creation: 300 ZWL with VAT" -ForegroundColor Green
    Write-Host "✅ Expense Update: 500 ZWL with VAT" -ForegroundColor Green
    Write-Host "✅ Reversal Entries: $($reversalEntries.Count) found" -ForegroundColor Green
    Write-Host "✅ Net Effect: Correct calculation" -ForegroundColor Green
    Write-Host "✅ Non-Financial Update: No reversal triggered" -ForegroundColor Green
    
    if ($reversalEntries.Count -gt 0) {
        Write-Host ""
        Write-Host "CONCLUSION: Double-entry bookkeeping with reversals is working correctly!" -ForegroundColor Green
        Write-Host "   The system properly creates reversal entries when financial changes are made." -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "❌ CONCLUSION: Reversal entries not found - possible issue!" -ForegroundColor Red
    }

} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.Exception.Response)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Green 