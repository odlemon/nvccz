# Comprehensive Payment Method Test Script
# Tests CASH, CREDIT, BANK scenarios and expense editing

Write-Host "Starting Comprehensive Payment Method Test..." -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Yellow

# Login
$loginData = @{email="admin@nvccz.co.zw"; password="admin123"}
$loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body ($loginData | ConvertTo-Json) -ContentType "application/json"
$token = $loginResponse.token
$Headers = @{"Content-Type"="application/json"; "Authorization"="Bearer $token"}

Write-Host "Login successful" -ForegroundColor Green

# Get required data
$vendorsResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/vendors" -Headers $Headers -Method Get
$categoriesResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories" -Headers $Headers -Method Get
$currenciesResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/currencies" -Headers $Headers -Method Get

$vendorId = $vendorsResponse.data[0].id
$categoryId = $categoriesResponse.data[0].id
$currencyId = $currenciesResponse.data[0].id

Write-Host "Got required data" -ForegroundColor Green
Write-Host "Vendor: $($vendorsResponse.data[0].name)" -ForegroundColor White
Write-Host "Category: $($categoriesResponse.data[0].name)" -ForegroundColor White
Write-Host "Currency: $($currenciesResponse.data[0].code)" -ForegroundColor White

# Test 1: CASH Payment
Write-Host "`nTest 1: CASH Payment" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan

$cashExpense = @{
    vendorId = $vendorId
    categoryId = $categoryId
    currencyId = $currencyId
    amount = 1000
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    description = "Test CASH Payment - Office Supplies"
    isTaxable = $true
    paymentMethod = "CASH"
}

$cashResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expenses" -Headers $Headers -Method Post -Body ($cashExpense | ConvertTo-Json)
$cashExpenseId = $cashResponse.data.id

Write-Host "Created CASH expense: $($cashResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor Green
Write-Host "Journal Entry: $($cashResponse.data.journalEntry.referenceNumber)" -ForegroundColor White
Write-Host "Payment Method: $($cashResponse.data.paymentMethod)" -ForegroundColor White

# Test 2: BANK Payment
Write-Host "`nTest 2: BANK Payment" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan

$bankExpense = @{
    vendorId = $vendorId
    categoryId = $categoryId
    currencyId = $currencyId
    amount = 2500
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    description = "Test BANK Payment - Equipment Purchase"
    isTaxable = $true
    paymentMethod = "BANK"
}

$bankResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expenses" -Headers $Headers -Method Post -Body ($bankExpense | ConvertTo-Json)
$bankExpenseId = $bankResponse.data.id

Write-Host "Created BANK expense: $($bankResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor Green
Write-Host "Journal Entry: $($bankResponse.data.journalEntry.referenceNumber)" -ForegroundColor White
Write-Host "Payment Method: $($bankResponse.data.paymentMethod)" -ForegroundColor White

# Test 3: CREDIT Payment
Write-Host "`nTest 3: CREDIT Payment" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan

$creditExpense = @{
    vendorId = $vendorId
    categoryId = $categoryId
    currencyId = $currencyId
    amount = 5000
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    description = "Test CREDIT Payment - Professional Services"
    isTaxable = $true
    paymentMethod = "CREDIT"
}

$creditResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expenses" -Headers $Headers -Method Post -Body ($creditExpense | ConvertTo-Json)
$creditExpenseId = $creditResponse.data.id

Write-Host "Created CREDIT expense: $($creditResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor Green
Write-Host "Journal Entry: $($creditResponse.data.journalEntry.referenceNumber)" -ForegroundColor White
Write-Host "Payment Method: $($creditResponse.data.paymentMethod)" -ForegroundColor White

# Test 4: Edit CASH Expense
Write-Host "`nTest 4: Edit CASH Expense" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan

$editCashExpense = @{
    vendorId = $vendorId
    categoryId = $categoryId
    currencyId = $currencyId
    amount = 1200
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    description = "Updated CASH Payment - Office Supplies (Revised)"
    isTaxable = $true
    paymentMethod = "CASH"
}

$editCashResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expenses/$cashExpenseId" -Headers $Headers -Method Put -Body ($editCashExpense | ConvertTo-Json)

Write-Host "Updated CASH expense: $($editCashResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor Green
Write-Host "New Journal Entry: $($editCashResponse.data.journalEntry.referenceNumber)" -ForegroundColor White

# Test 5: Edit BANK Expense to CREDIT
Write-Host "`nTest 5: Edit BANK Expense to CREDIT" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

$editBankToCredit = @{
    vendorId = $vendorId
    categoryId = $categoryId
    currencyId = $currencyId
    amount = 3000
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    description = "Updated BANK to CREDIT - Equipment Purchase (On Credit)"
    isTaxable = $true
    paymentMethod = "CREDIT"
}

$editBankResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expenses/$bankExpenseId" -Headers $Headers -Method Put -Body ($editBankToCredit | ConvertTo-Json)

Write-Host "Updated BANK to CREDIT expense: $($editBankResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor Green
Write-Host "New Journal Entry: $($editBankResponse.data.journalEntry.referenceNumber)" -ForegroundColor White
Write-Host "New Payment Method: $($editBankResponse.data.paymentMethod)" -ForegroundColor White

# Test 6: Delete CREDIT Expense
Write-Host "`nTest 6: Delete CREDIT Expense" -ForegroundColor Cyan
Write-Host "=============================" -ForegroundColor Cyan

$deleteResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expenses/$creditExpenseId" -Headers $Headers -Method Delete

Write-Host "Deleted CREDIT expense successfully" -ForegroundColor Green

# Verification: Get all journal entries
Write-Host "`nVerification: All Journal Entries" -ForegroundColor Yellow
Write-Host "=================================" -ForegroundColor Yellow

$journalEntriesResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/journal-entries" -Headers $Headers -Method Get

Write-Host "Total Journal Entries: $($journalEntriesResponse.data.length)" -ForegroundColor White

foreach ($entry in $journalEntriesResponse.data) {
    Write-Host "`nJournal Entry: $($entry.referenceNumber)" -ForegroundColor Cyan
    Write-Host "Date: $($entry.transactionDate)" -ForegroundColor White
    Write-Host "Description: $($entry.description)" -ForegroundColor White
    Write-Host "Status: $($entry.status)" -ForegroundColor White
    
    # Get journal entry details
    $entryDetails = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/journal-entries/$($entry.id)" -Headers $Headers -Method Get
    
    Write-Host "Journal Entry Lines:" -ForegroundColor Yellow
    foreach ($line in $entryDetails.data.journalEntryLines) {
        $accountName = $line.chartOfAccount.accountName
        $debit = $line.debitAmount
        $credit = $line.creditAmount
        
        if ($debit -gt 0) {
            Write-Host "  Dr $($accountName): $($debit)" -ForegroundColor White
        } else {
            Write-Host "  Cr $($accountName): $($credit)" -ForegroundColor White
        }
    }
}

# Verification: Get all expenses
Write-Host "`nVerification: All Expenses" -ForegroundColor Yellow
Write-Host "===========================" -ForegroundColor Yellow

$expensesResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expenses" -Headers $Headers -Method Get

Write-Host "Total Expenses: $($expensesResponse.data.length)" -ForegroundColor White

foreach ($expense in $expensesResponse.data) {
    Write-Host "`nExpense: $($expense.description)" -ForegroundColor Cyan
    Write-Host "Amount: $($expense.amount) $($currenciesResponse.data[0].code)" -ForegroundColor White
    Write-Host "Payment Method: $($expense.paymentMethod)" -ForegroundColor White
    Write-Host "VAT Amount: $($expense.vatAmount) $($currenciesResponse.data[0].code)" -ForegroundColor White
    Write-Host "Total Amount: $($expense.totalAmount) $($currenciesResponse.data[0].code)" -ForegroundColor White
    Write-Host "Journal Entry: $($expense.journalEntry.referenceNumber)" -ForegroundColor White
}

Write-Host "`nComprehensive test completed!" -ForegroundColor Green
Write-Host "Check the journal entries above to verify accounting accuracy." -ForegroundColor Yellow 