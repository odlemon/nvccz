# Complete Expense Workflow Test
$baseUrl = "http://localhost:3000"

Write-Host "=== COMPLETE EXPENSE WORKFLOW TEST ===" -ForegroundColor Green

# 1. Login
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    $token = $login.token
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
    Write-Host "✅ Authentication successful" -ForegroundColor Green
} catch {
    Write-Host "❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 2. Get test data
Write-Host "`n2. Getting test data..." -ForegroundColor Yellow

# Get active currency
$currencies = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers $headers
$activeCurrency = $currencies.data | Where-Object { $_.isActive -eq $true } | Select-Object -First 1

# Get vendor
$vendors = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
$testVendor = $vendors.data | Select-Object -First 1

# Get category
$categories = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expense-categories" -Method GET -Headers $headers
$testCategory = $categories.data | Where-Object { $_.parentId -eq $null } | Select-Object -First 1

Write-Host "✅ Using currency: $($activeCurrency.code)" -ForegroundColor Green
Write-Host "✅ Using vendor: $($testVendor.name)" -ForegroundColor Green
Write-Host "✅ Using category: $($testCategory.name)" -ForegroundColor Green

# 3. Create a taxable expense
Write-Host "`n3. Creating taxable expense..." -ForegroundColor Yellow
$expensePayload = @{
    description = "Office supplies with VAT"
    amount = 1000.00
    currencyId = $activeCurrency.id
    vendorId = $testVendor.id
    categoryId = $testCategory.id
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    receiptNumber = "VAT-001"
    isTaxable = $true
    paymentMethod = "BANK"
}

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method POST -Headers $headers -Body ($expensePayload | ConvertTo-Json)
    $expense = $response.data
    Write-Host "✅ Expense created successfully!" -ForegroundColor Green
    Write-Host "   Expense ID: $($expense.id)" -ForegroundColor Cyan
    Write-Host "   Status: $($expense.status)" -ForegroundColor Cyan
    Write-Host "   Amount: $($expense.amount)" -ForegroundColor Cyan
    Write-Host "   VAT Amount: $($expense.vatAmount)" -ForegroundColor Cyan
    Write-Host "   Total: $($expense.totalAmount)" -ForegroundColor Cyan
    Write-Host "   Journal Entry ID: $($expense.journalEntry.id)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create expense: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 4. Get journal entry details
Write-Host "`n4. Getting journal entry details..." -ForegroundColor Yellow
try {
    $journalResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries/$($expense.journalEntry.id)" -Method GET -Headers $headers
    $journalEntry = $journalResponse.data
    Write-Host "✅ Journal entry retrieved!" -ForegroundColor Green
    Write-Host "   Reference: $($journalEntry.referenceNumber)" -ForegroundColor Cyan
    Write-Host "   Status: $($journalEntry.status)" -ForegroundColor Cyan
    Write-Host "   Date: $($journalEntry.transactionDate)" -ForegroundColor Cyan
    
    Write-Host "`n   Journal Entry Lines:" -ForegroundColor Yellow
    $totalDebits = 0
    $totalCredits = 0
    
    foreach ($line in $journalEntry.journalEntryLines) {
        $debit = [double]$line.debitAmount
        $credit = [double]$line.creditAmount
        $accountName = $line.chartOfAccount.accountName
        $description = $line.description
        
        $totalDebits += $debit
        $totalCredits += $credit
        
        if ($debit -gt 0) {
            Write-Host "     Dr $accountName`: $debit ($description)" -ForegroundColor Green
        } elseif ($credit -gt 0) {
            Write-Host "     Cr $accountName`: $credit ($description)" -ForegroundColor Red
        }
    }
    
    Write-Host "`n   Balance Check:" -ForegroundColor Yellow
    Write-Host "     Total Debits: $totalDebits" -ForegroundColor Cyan
    Write-Host "     Total Credits: $totalCredits" -ForegroundColor Cyan
    $balance = [math]::Abs($totalDebits - $totalCredits)
    if ($balance -lt 0.01) {
        Write-Host "     ✅ Journal entry is balanced!" -ForegroundColor Green
    } else {
        Write-Host "     ❌ Journal entry is NOT balanced!" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Failed to get journal entry: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Update the expense (should create reversal journal entry)
Write-Host "`n5. Updating expense (should create reversal journal entry)..." -ForegroundColor Yellow
$updatePayload = @{
    description = "Updated office supplies with VAT"
    amount = 1200.00
    receiptNumber = "VAT-001-UPDATED"
}

try {
    $updateResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses/$($expense.id)" -Method PUT -Headers $headers -Body ($updatePayload | ConvertTo-Json)
    $updatedExpense = $updateResponse.data
    Write-Host "✅ Expense updated successfully!" -ForegroundColor Green
    Write-Host "   New Amount: $($updatedExpense.amount)" -ForegroundColor Cyan
    Write-Host "   New VAT Amount: $($updatedExpense.vatAmount)" -ForegroundColor Cyan
    Write-Host "   New Total: $($updatedExpense.totalAmount)" -ForegroundColor Cyan
    Write-Host "   New Journal Entry ID: $($updatedExpense.journalEntry.id)" -ForegroundColor Cyan
    
    # Check if reversal journal entry was created
    if ($updatedExpense.journalEntry.id -ne $expense.journalEntry.id) {
        Write-Host "   ✅ Reversal journal entry created!" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  No reversal journal entry created (same ID)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to update expense: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Get all journal entries to see the reversal
Write-Host "`n6. Getting all journal entries..." -ForegroundColor Yellow
try {
    $allJournals = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($allJournals.data.Count) journal entries" -ForegroundColor Green
    
    foreach ($journal in $allJournals.data) {
        Write-Host "   - $($journal.referenceNumber): $($journal.description) (Status: $($journal.status))" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get journal entries: $($_.Exception.Message)" -ForegroundColor Red
}

# 7. Delete the expense (should void the journal entry)
Write-Host "`n7. Deleting expense (should void journal entry)..." -ForegroundColor Yellow
try {
    $deleteResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses/$($updatedExpense.id)" -Method DELETE -Headers $headers
    Write-Host "✅ Expense deleted successfully!" -ForegroundColor Green
    
    # Check if the expense is now inactive
    $checkResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method GET -Headers $headers
    $activeExpenses = $checkResponse.data | Where-Object { $_.isActive -eq $true }
    Write-Host "   Active expenses remaining: $($activeExpenses.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to delete expense: $($_.Exception.Message)" -ForegroundColor Red
}

# 8. Final verification
Write-Host "`n8. Final verification..." -ForegroundColor Yellow
try {
    $finalExpenses = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method GET -Headers $headers
    $finalJournals = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries" -Method GET -Headers $headers
    
    Write-Host "✅ Final Status:" -ForegroundColor Green
    Write-Host "   Active expenses: $($finalExpenses.data.Count)" -ForegroundColor Cyan
    Write-Host "   Total journal entries: $($finalJournals.data.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get final status: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== WORKFLOW TEST COMPLETE ===" -ForegroundColor Green 