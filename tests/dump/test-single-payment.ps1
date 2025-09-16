# Test single payment method and check journal entries
$baseUrl = "http://localhost:3000/api"

# Login
$loginData = @{
    email = "admin@nvccz.co.zw"
    password = "admin123"
}

$loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body ($loginData | ConvertTo-Json) -ContentType "application/json"
$token = $loginResponse.token

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Get test data
$customersResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/customers" -Method GET -Headers $headers
$customer = $customersResponse.data.customers[0]

$currenciesResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/currencies" -Method GET -Headers $headers
$currency = $currenciesResponse.data[0]

# Create invoice
$invoiceData = @{
    customerId = $customer.id
    currencyId = $currency.id
    amount = 500.00
    transactionDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    description = "Test invoice for CASH payment"
    isTaxable = $true
}

$createResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/invoices" -Method POST -Body ($invoiceData | ConvertTo-Json) -Headers $headers
$invoice = $createResponse.data
Write-Host "Invoice created: $($invoice.invoiceNumber)" -ForegroundColor Green

# Send invoice
$sendResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/invoices/$($invoice.id)/send" -Method PATCH -Headers $headers
$sentInvoice = $sendResponse.data
Write-Host "Invoice sent: Status = $($sentInvoice.status)" -ForegroundColor Green

# Mark as paid with CASH
$payData = @{
    paymentMethod = "CASH"
}

Write-Host "Marking as paid with CASH..." -ForegroundColor Yellow
$payResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/invoices/$($invoice.id)/mark-as-paid" -Method PATCH -Body ($payData | ConvertTo-Json) -Headers $headers
$paidInvoice = $payResponse.data

Write-Host "Successfully marked as paid with CASH" -ForegroundColor Green
Write-Host "Status: $($paidInvoice.status)" -ForegroundColor White
Write-Host "Payment Method: $($paidInvoice.paymentMethod)" -ForegroundColor White
Write-Host "Total Amount: $($paidInvoice.totalAmount)" -ForegroundColor White

# Check journal entries
Write-Host "Checking journal entries..." -ForegroundColor Yellow
$journalResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/journal-entries" -Method GET -Headers $headers

Write-Host "Total journal entries: $($journalResponse.data.Count)" -ForegroundColor Green

# Find payment entries
$paymentEntries = $journalResponse.data | Where-Object { 
    $_.description -like "*Payment*" -and $_.totalAmount -eq $paidInvoice.totalAmount 
}

if ($paymentEntries) {
    Write-Host "Found $($paymentEntries.Count) payment journal entries:" -ForegroundColor Green
    foreach ($entry in $paymentEntries) {
        Write-Host "ID: $($entry.id)" -ForegroundColor Gray
        Write-Host "Description: $($entry.description)" -ForegroundColor Gray
        Write-Host "Amount: $($entry.totalAmount)" -ForegroundColor Gray
        Write-Host "Status: $($entry.status)" -ForegroundColor Gray
        Write-Host "---" -ForegroundColor Gray
    }
} else {
    Write-Host "No payment journal entries found" -ForegroundColor Red
} 