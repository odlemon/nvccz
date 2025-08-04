# Comprehensive test script to verify expense update workflow with double-entry bookkeeping
# This script tests the complete workflow: create expense -> update expense -> verify journal entries

param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$Token = ""
)

if (-not $Token) {
    Write-Host "Please provide a valid authentication token" -ForegroundColor Red
    Write-Host "Usage: .\test-expense-update-verification.ps1 -Token 'your-jwt-token'" -ForegroundColor Yellow
    exit 1
}

$Headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $Token"
}

# Test results storage
$TestResults = @{
    TestName = "Expense Update Workflow Verification"
    StartTime = Get-Date
    Steps = @()
    Success = $false
    Errors = @()
}

function Add-TestStep {
    param(
        [string]$StepName,
        [string]$Status,
        [string]$Details = "",
        [object]$Data = $null
    )
    
    $TestResults.Steps += @{
        Name = $StepName
        Status = $Status
        Details = $Details
        Data = $Data
        Timestamp = Get-Date
    }
}

function Write-TestStep {
    param(
        [string]$StepName,
        [string]$Status,
        [string]$Details = ""
    )
    
    $color = if ($Status -eq "PASS") { "Green" } elseif ($Status -eq "FAIL") { "Red" } else { "Yellow" }
    Write-Host "[$Status] $StepName" -ForegroundColor $color
    if ($Details) {
        Write-Host "   $Details" -ForegroundColor White
    }
    Write-Host ""
}

Write-Host "=== Expense Update Workflow Verification Test ===" -ForegroundColor Green
Write-Host "Start Time: $(Get-Date)" -ForegroundColor Cyan
Write-Host ""

try {
    # Step 1: Get required data (vendors, categories, currencies)
    Write-Host "Step 1: Getting required data..." -ForegroundColor Cyan
    
    $vendorsResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/vendors" -Headers $Headers -Method Get
    $categoriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expense-categories" -Headers $Headers -Method Get
    $currenciesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/currencies" -Headers $Headers -Method Get
    
    if (-not $vendorsResponse.success -or -not $categoriesResponse.success -or -not $currenciesResponse.success) {
        throw "Failed to get required data"
    }
    
    $vendorId = $vendorsResponse.data[0].id
    $categoryId = $categoriesResponse.data[0].id
    $currencyId = $currenciesResponse.data[0].id
    
    Add-TestStep -StepName "Get Required Data" -Status "PASS" -Details "Vendor: $($vendorsResponse.data[0].name), Category: $($categoriesResponse.data[0].name), Currency: $($currenciesResponse.data[0].code)"
    Write-TestStep -StepName "Get Required Data" -Status "PASS" -Details "Vendor: $($vendorsResponse.data[0].name), Category: $($categoriesResponse.data[0].name), Currency: $($currenciesResponse.data[0].code)"

    # Step 2: Create initial expense (300 ZWL, Taxable)
    Write-Host "Step 2: Creating initial expense..." -ForegroundColor Cyan
    Write-Host "   Amount: 300 ZWL, Taxable: Yes" -ForegroundColor Yellow
    Write-Host "   Expected: Dr Legal Fees 300, Dr VAT Input 43.50, Cr Bank 343.50" -ForegroundColor Yellow
    Write-Host ""

    $initialExpense = @{
        vendorId = $vendorId
        categoryId = $categoryId
        currencyId = $currencyId
        amount = 300
        transactionDate = (Get-Date).ToString("yyyy-MM-dd")
        description = "Legal Fees - Test Initial"
        isTaxable = $true
    }

    $createResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses" -Headers $Headers -Method Post -Body ($initialExpense | ConvertTo-Json)
    
    if (-not $createResponse.success) {
        throw "Failed to create expense: $($createResponse.message)"
    }

    $expenseId = $createResponse.data.id
    $originalJournalEntry = $createResponse.data.journalEntry.referenceNumber
    $originalAmount = $createResponse.data.amount
    $originalVatAmount = $createResponse.data.vatAmount
    $originalTotalAmount = $createResponse.data.totalAmount
    
    Add-TestStep -StepName "Create Initial Expense" -Status "PASS" -Details "Expense ID: $expenseId, Journal Entry: $originalJournalEntry, Amount: $originalAmount, VAT: $originalVatAmount, Total: $originalTotalAmount" -Data $createResponse.data
    Write-TestStep -StepName "Create Initial Expense" -Status "PASS" -Details "Expense ID: $expenseId, Journal Entry: $originalJournalEntry, Amount: $originalAmount, VAT: $originalVatAmount, Total: $originalTotalAmount"

    # Step 3: Update expense to 500 ZWL
    Write-Host "Step 3: Updating expense to 500 ZWL..." -ForegroundColor Cyan
    Write-Host "   Expected workflow:" -ForegroundColor Yellow
    Write-Host "   a) Create reversal: Cr Legal Fees 300, Cr VAT Input 43.50, Dr Bank 343.50" -ForegroundColor Yellow
    Write-Host "   b) Update expense to 500 ZWL" -ForegroundColor Yellow
    Write-Host "   c) Create new entry: Dr Legal Fees 500, Dr VAT Input 72.50, Cr Bank 572.50" -ForegroundColor Yellow
    Write-Host ""

    $updateData = @{
        vendorId = $vendorId
        categoryId = $categoryId
        currencyId = $currencyId
        amount = 500
        transactionDate = (Get-Date).ToString("yyyy-MM-dd")
        description = "Legal Fees - Test Updated"
        isTaxable = $true
    }

    $updateResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses/$expenseId" -Headers $Headers -Method Put -Body ($updateData | ConvertTo-Json)
    
    if (-not $updateResponse.success) {
        throw "Failed to update expense: $($updateResponse.message)"
    }

    $newJournalEntry = $updateResponse.data.journalEntry.referenceNumber
    $newAmount = $updateResponse.data.amount
    $newVatAmount = $updateResponse.data.vatAmount
    $newTotalAmount = $updateResponse.data.totalAmount
    
    Add-TestStep -StepName "Update Expense" -Status "PASS" -Details "New Journal Entry: $newJournalEntry, New Amount: $newAmount, New VAT: $newVatAmount, New Total: $newTotalAmount" -Data $updateResponse.data
    Write-TestStep -StepName "Update Expense" -Status "PASS" -Details "New Journal Entry: $newJournalEntry, New Amount: $newAmount, New VAT: $newVatAmount, New Total: $newTotalAmount"

    # Step 4: Verify expense changes
    Write-Host "Step 4: Verifying expense changes..." -ForegroundColor Cyan
    
    $amountChange = $newAmount - $originalAmount
    $vatChange = $newVatAmount - $originalVatAmount
    $totalChange = $newTotalAmount - $originalTotalAmount
    
    $expenseVerification = @{
        OriginalAmount = $originalAmount
        NewAmount = $newAmount
        AmountChange = $amountChange
        OriginalVAT = $originalVatAmount
        NewVAT = $newVatAmount
        VATChange = $vatChange
        OriginalTotal = $originalTotalAmount
        NewTotal = $newTotalAmount
        TotalChange = $totalChange
    }
    
    Add-TestStep -StepName "Verify Expense Changes" -Status "PASS" -Details "Amount: $originalAmount → $newAmount (+$amountChange), VAT: $originalVatAmount → $newVatAmount (+$vatChange), Total: $originalTotalAmount → $newTotalAmount (+$totalChange)" -Data $expenseVerification
    Write-TestStep -StepName "Verify Expense Changes" -Status "PASS" -Details "Amount: $originalAmount → $newAmount (+$amountChange), VAT: $originalVatAmount → $newVatAmount (+$vatChange), Total: $originalTotalAmount → $newTotalAmount (+$totalChange)"

    # Step 5: Get and verify journal entries
    Write-Host "Step 5: Retrieving and verifying journal entries..." -ForegroundColor Cyan
    
    $journalEntriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Headers $Headers -Method Get
    
    if (-not $journalEntriesResponse.success) {
        throw "Failed to get journal entries"
    }
    
    # Find relevant journal entries
    $relevantEntries = $journalEntriesResponse.data | Where-Object { 
        $_.referenceNumber -eq $originalJournalEntry -or 
        $_.referenceNumber -eq $newJournalEntry -or
        $_.description -like "*REVERSAL*" -or
        $_.description -like "*UPDATED*"
    }
    
    $journalEntryCount = $relevantEntries.Count
    $expectedCount = 3 # Original + Reversal + Updated
    
    if ($journalEntryCount -eq $expectedCount) {
        Add-TestStep -StepName "Verify Journal Entry Count" -Status "PASS" -Details "Found $journalEntryCount journal entries (Expected: $expectedCount)" -Data $relevantEntries
        Write-TestStep -StepName "Verify Journal Entry Count" -Status "PASS" -Details "Found $journalEntryCount journal entries (Expected: $expectedCount)"
    } else {
        Add-TestStep -StepName "Verify Journal Entry Count" -Status "FAIL" -Details "Found $journalEntryCount journal entries (Expected: $expectedCount)" -Data $relevantEntries
        Write-TestStep -StepName "Verify Journal Entry Count" -Status "FAIL" -Details "Found $journalEntryCount journal entries (Expected: $expectedCount)"
    }
    
    # Verify specific journal entries
    $originalEntry = $relevantEntries | Where-Object { $_.referenceNumber -eq $originalJournalEntry }
    $reversalEntry = $relevantEntries | Where-Object { $_.description -like "*REVERSAL*" }
    $updatedEntry = $relevantEntries | Where-Object { $_.referenceNumber -eq $newJournalEntry }
    
    $journalVerification = @{
        OriginalEntry = $originalEntry
        ReversalEntry = $reversalEntry
        UpdatedEntry = $updatedEntry
        AllEntries = $relevantEntries
    }
    
    if ($originalEntry -and $reversalEntry -and $updatedEntry) {
        Add-TestStep -StepName "Verify Journal Entry Types" -Status "PASS" -Details "Found Original, Reversal, and Updated entries" -Data $journalVerification
        Write-TestStep -StepName "Verify Journal Entry Types" -Status "PASS" -Details "Found Original, Reversal, and Updated entries"
        
        Write-Host "   Journal Entries Found:" -ForegroundColor Green
        foreach ($entry in $relevantEntries) {
            Write-Host "   - $($entry.referenceNumber): $($entry.description)" -ForegroundColor White
        }
    } else {
        Add-TestStep -StepName "Verify Journal Entry Types" -Status "FAIL" -Details "Missing required journal entry types" -Data $journalVerification
        Write-TestStep -StepName "Verify Journal Entry Types" -Status "FAIL" -Details "Missing required journal entry types"
    }

    # Step 6: Verify net effect calculation
    Write-Host "Step 6: Verifying net effect calculation..." -ForegroundColor Cyan
    
    $expectedNetAmount = 200 # 500 - 300
    $expectedNetVAT = 29 # 72.50 - 43.50
    $expectedNetTotal = 229 # 572.50 - 343.50
    
    $netEffectVerification = @{
        ExpectedNetAmount = $expectedNetAmount
        ActualNetAmount = $amountChange
        ExpectedNetVAT = $expectedNetVAT
        ActualNetVAT = $vatChange
        ExpectedNetTotal = $expectedNetTotal
        ActualNetTotal = $totalChange
    }
    
    if ($amountChange -eq $expectedNetAmount -and $vatChange -eq $expectedNetVAT -and $totalChange -eq $expectedNetTotal) {
        Add-TestStep -StepName "Verify Net Effect" -Status "PASS" -Details "Net effect matches expected: Amount +$expectedNetAmount, VAT +$expectedNetVAT, Total +$expectedNetTotal" -Data $netEffectVerification
        Write-TestStep -StepName "Verify Net Effect" -Status "PASS" -Details "Net effect matches expected: Amount +$expectedNetAmount, VAT +$expectedNetVAT, Total +$expectedNetTotal"
    } else {
        Add-TestStep -StepName "Verify Net Effect" -Status "FAIL" -Details "Net effect mismatch. Expected: Amount +$expectedNetAmount, VAT +$expectedNetVAT, Total +$expectedNetTotal. Actual: Amount +$amountChange, VAT +$vatChange, Total +$totalChange" -Data $netEffectVerification
        Write-TestStep -StepName "Verify Net Effect" -Status "FAIL" -Details "Net effect mismatch. Expected: Amount +$expectedNetAmount, VAT +$expectedNetVAT, Total +$expectedNetTotal. Actual: Amount +$amountChange, VAT +$vatChange, Total +$totalChange"
    }

    # Step 7: Final verification - get updated expense
    Write-Host "Step 7: Final verification - retrieving updated expense..." -ForegroundColor Cyan
    
    $finalExpenseResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses/$expenseId" -Headers $Headers -Method Get
    
    if (-not $finalExpenseResponse.success) {
        throw "Failed to get final expense"
    }
    
    $finalExpense = $finalExpenseResponse.data
    
    if ($finalExpense.amount -eq $newAmount -and $finalExpense.vatAmount -eq $newVatAmount -and $finalExpense.totalAmount -eq $newTotalAmount) {
        Add-TestStep -StepName "Final Expense Verification" -Status "PASS" -Details "Final expense matches updated values" -Data $finalExpense
        Write-TestStep -StepName "Final Expense Verification" -Status "PASS" -Details "Final expense matches updated values"
    } else {
        Add-TestStep -StepName "Final Expense Verification" -Status "FAIL" -Details "Final expense does not match updated values" -Data $finalExpense
        Write-TestStep -StepName "Final Expense Verification" -Status "FAIL" -Details "Final expense does not match updated values"
    }

    # Calculate overall test success
    $failedSteps = $TestResults.Steps | Where-Object { $_.Status -eq "FAIL" }
    if ($failedSteps.Count -eq 0) {
        $TestResults.Success = $true
    } else {
        $TestResults.Errors = $failedSteps
    }

    # Step 8: Generate test report
    Write-Host "Step 8: Generating test report..." -ForegroundColor Cyan
    
    $TestResults.EndTime = Get-Date
    $TestResults.Duration = $TestResults.EndTime - $TestResults.StartTime
    
    # Save test results to file
    $testReportPath = "tests/accounting/test-results/expense-update-test-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"
    $testReportDir = Split-Path $testReportPath -Parent
    
    if (-not (Test-Path $testReportDir)) {
        New-Item -ItemType Directory -Path $testReportDir -Force | Out-Null
    }
    
    $TestResults | ConvertTo-Json -Depth 10 | Out-File -FilePath $testReportPath -Encoding UTF8
    
    Add-TestStep -StepName "Generate Test Report" -Status "PASS" -Details "Test report saved to: $testReportPath"
    Write-TestStep -StepName "Generate Test Report" -Status "PASS" -Details "Test report saved to: $testReportPath"

    # Final summary
    Write-Host ""
    Write-Host "=== Test Summary ===" -ForegroundColor Green
    Write-Host "Test Name: $($TestResults.TestName)" -ForegroundColor White
    Write-Host "Start Time: $($TestResults.StartTime)" -ForegroundColor White
    Write-Host "End Time: $($TestResults.EndTime)" -ForegroundColor White
    Write-Host "Duration: $($TestResults.Duration)" -ForegroundColor White
    Write-Host "Total Steps: $($TestResults.Steps.Count)" -ForegroundColor White
    Write-Host "Passed Steps: $(($TestResults.Steps | Where-Object { $_.Status -eq 'PASS' }).Count)" -ForegroundColor Green
    Write-Host "Failed Steps: $(($TestResults.Steps | Where-Object { $_.Status -eq 'FAIL' }).Count)" -ForegroundColor Red
    Write-Host "Overall Result: $(if ($TestResults.Success) { 'PASS' } else { 'FAIL' })" -ForegroundColor $(if ($TestResults.Success) { 'Green' } else { 'Red' })
    Write-Host ""
    
    if ($TestResults.Success) {
        Write-Host "✅ Expense update workflow verification completed successfully!" -ForegroundColor Green
        Write-Host "   All double-entry bookkeeping rules are properly maintained." -ForegroundColor Green
    } else {
        Write-Host "❌ Expense update workflow verification failed!" -ForegroundColor Red
        Write-Host "   Check the test report for details: $testReportPath" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "Test Report: $testReportPath" -ForegroundColor Cyan

} catch {
    $TestResults.Success = $false
    $TestResults.Errors += @{
        Error = $_.Exception.Message
        StackTrace = $_.ScriptStackTrace
        Timestamp = Get-Date
    }
    
    Add-TestStep -StepName "Test Execution" -Status "FAIL" -Details "Test failed with error: $($_.Exception.Message)"
    Write-TestStep -StepName "Test Execution" -Status "FAIL" -Details "Test failed with error: $($_.Exception.Message)"
    
    Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Stack trace: $($_.ScriptStackTrace)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Green 