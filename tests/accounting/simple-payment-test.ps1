# Simple test for payment method feature

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

# Test CREDIT payment
$creditExpense = @{
    vendorId = $vendorId
    categoryId = $categoryId
    currencyId = $currencyId
    amount = 500
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    description = "Test CREDIT Payment"
    isTaxable = $true
    paymentMethod = "CREDIT"
}

$creditResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expenses" -Headers $Headers -Method Post -Body ($creditExpense | ConvertTo-Json)

Write-Host "Created CREDIT expense: $($creditResponse.data.amount) $($currenciesResponse.data[0].code)" -ForegroundColor Green
Write-Host "Journal Entry: $($creditResponse.data.journalEntry.referenceNumber)" -ForegroundColor White
Write-Host "Payment Method: $($creditResponse.data.paymentMethod)" -ForegroundColor White

# Get journal entry details
$journalDetails = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/journal-entries/$($creditResponse.data.journalEntry.id)" -Headers $Headers -Method Get

Write-Host "Journal Entry Lines:" -ForegroundColor Cyan
foreach ($line in $journalDetails.data.journalEntryLines) {
    $accountName = $line.chartOfAccount.accountName
    $debit = $line.debitAmount
    $credit = $line.creditAmount
    
    if ($debit -gt 0) {
        Write-Host "  Dr $($accountName): $($debit)" -ForegroundColor White
    } else {
        Write-Host "  Cr $($accountName): $($credit)" -ForegroundColor White
    }
}

Write-Host "Test completed!" -ForegroundColor Green 