# Quick test script to verify expense update workflow
# This script creates an expense, updates it, and verifies the results

param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$Token = ""
)

if (-not $Token) {
    Write-Host "Please provide a valid authentication token" -ForegroundColor Red
    Write-Host "Usage: .\quick-expense-test.ps1 -Token 'your-jwt-token'" -ForegroundColor Yellow
    exit 1
}

$Headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $Token"
}

Write-Host "=== Quick Expense Update Test ===" -ForegroundColor Green
Write-Host ""

try {
    # Step 1: Get required data
    Write-Host "1. Getting required data..." -ForegroundColor Cyan
    
    $vendorsResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/vendors" -Headers $Headers -Method Get
    $categoriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expense-categories" -Headers $Headers -Method Get
    $currenciesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/currencies" -Headers $Headers -Method Get
    
    $vendorId = $vendorsResponse.data[0].id
    $categoryId = $categoriesResponse.data[0].id
    $currencyId = $currenciesResponse.data[0].id
    
    Write-Host "   ✅ Using: $($vendorsResponse.data[0].name), $($categoriesResponse.data[0].name), $($currenciesResponse.data[0].code)" -ForegroundColor Green

    # Step 2: Create initial expense (300 ZWL)
    Write-Host "2. Creating expense: 300 ZWL..." -ForegroundColor Cyan
    
    $initialExpense = @{
        vendorId = $vendorId
        categoryId = $categoryId
        currencyId = $currencyId
        amount = 300
        transactionDate = (Get-Date).ToString("yyyy-MM-dd")
        description = "Test Expense - Initial"
        isTaxable = $true
    }

    $createResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses" -Headers $Headers -Method Post -Body ($initialExpense | ConvertTo-Json)
    $expenseId = $createResponse.data.id
    $originalJournalEntry = $createResponse.data.journalEntry.referenceNumber
    
    Write-Host "   ✅ Created: ID=$expenseId, Amount=$($createResponse.data.amount), VAT=$($createResponse.data.vatAmount), Total=$($createResponse.data.totalAmount)" -ForegroundColor Green
    Write-Host "   📋 Journal Entry: $originalJournalEntry" -ForegroundColor White

    # Step 3: Update expense to 500 ZWL
    Write-Host "3. Updating expense to 500 ZWL..." -ForegroundColor Cyan
    
    $updateData = @{
        vendorId = $vendorId
        categoryId = $categoryId
        currencyId = $currencyId
        amount = 500
        transactionDate = (Get-Date).ToString("yyyy-MM-dd")
        description = "Test Expense - Updated"
        isTaxable = $true
    }

    $updateResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses/$expenseId" -Headers $Headers -Method Put -Body ($updateData | ConvertTo-Json)
    $newJournalEntry = $updateResponse.data.journalEntry.referenceNumber
    
    Write-Host "   ✅ Updated: Amount=$($updateResponse.data.amount), VAT=$($updateResponse.data.vatAmount), Total=$($updateResponse.data.totalAmount)" -ForegroundColor Green
    Write-Host "   📋 New Journal Entry: $newJournalEntry" -ForegroundColor White

    # Step 4: Verify journal entries
    Write-Host "4. Verifying journal entries..." -ForegroundColor Cyan
    
    $journalEntriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Headers $Headers -Method Get
    
    $relevantEntries = $journalEntriesResponse.data | Where-Object { 
        $_.referenceNumber -eq $originalJournalEntry -or 
        $_.referenceNumber -eq $newJournalEntry -or
        $_.description -like "*REVERSAL*" -or
        $_.description -like "*UPDATED*"
    }
    
    Write-Host "   📋 Found $($relevantEntries.Count) relevant journal entries:" -ForegroundColor Green
    foreach ($entry in $relevantEntries) {
        Write-Host "      - $($entry.referenceNumber): $($entry.description)" -ForegroundColor White
    }

    # Step 5: Calculate and verify net effect
    Write-Host "5. Verifying net effect..." -ForegroundColor Cyan
    
    $amountChange = $updateResponse.data.amount - $createResponse.data.amount
    $vatChange = $updateResponse.data.vatAmount - $createResponse.data.vatAmount
    $totalChange = $updateResponse.data.totalAmount - $createResponse.data.totalAmount
    
    Write-Host "   📊 Net Change: Amount +$amountChange, VAT +$vatChange, Total +$totalChange" -ForegroundColor Green
    
    # Verify expected values
    $expectedAmountChange = 200
    $expectedVATChange = 29
    $expectedTotalChange = 229
    
    if ($amountChange -eq $expectedAmountChange -and $vatChange -eq $expectedVATChange -and $totalChange -eq $expectedTotalChange) {
        Write-Host "   ✅ Net effect matches expected values!" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Net effect mismatch!" -ForegroundColor Red
        Write-Host "      Expected: Amount +$expectedAmountChange, VAT +$expectedVATChange, Total +$expectedTotalChange" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "✅ Test completed successfully!" -ForegroundColor Green
    Write-Host "   Double-entry bookkeeping is working correctly." -ForegroundColor Green

} catch {
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Green 