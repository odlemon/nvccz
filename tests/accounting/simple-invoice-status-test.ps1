# Simple Invoice Status Test
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== SIMPLE INVOICE STATUS TEST ===" -ForegroundColor Cyan

try {
    # 1. Authenticate
    Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
    $loginData = @{
        email = "admin@nvccz.co.zw"
        password = "admin123"
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
    $headers = @{ Authorization = "Bearer $($authResponse.token)" }
    Write-Host "Authentication successful" -ForegroundColor Green

    # 2. Get currency and customer
    Write-Host "`n2. Getting currency and customer..." -ForegroundColor Yellow
    $currenciesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/currencies" -Method Get -Headers $headers
    $currency = $currenciesResponse.data[0]
    
    $customersResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers" -Method Get -Headers $headers
    $customer = $customersResponse.data[0]
    
    Write-Host "Using currency: $($currency.code)" -ForegroundColor Green
    Write-Host "Using customer: $($customer.name)" -ForegroundColor Green

    # 3. Create invoice
    Write-Host "`n3. Creating invoice..." -ForegroundColor Yellow
    $invoiceData = @{
        customerId = $customer.id
        amount = 1000
        currencyId = $currency.id
        transactionDate = "2025-08-05"
        description = "Test Invoice Status"
        isTaxable = $true
        items = @(
            @{
                description = "Test Service"
                amount = 1000
                category = "Test"
            }
        )
    } | ConvertTo-Json

    $invoiceResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices" -Method Post -Body $invoiceData -Headers $headers -ContentType "application/json"
    $invoice = $invoiceResponse.data
    Write-Host "Invoice created: $($invoice.invoiceNumber) - Status: $($invoice.status)" -ForegroundColor Green

    # 4. Test send endpoint
    Write-Host "`n4. Testing send endpoint..." -ForegroundColor Yellow
    $sendResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices/$($invoice.id)/send" -Method Patch -Headers $headers
    Write-Host "Send response: $($sendResponse.message)" -ForegroundColor Green

    # 5. Test mark as paid endpoint
    Write-Host "`n5. Testing mark as paid endpoint..." -ForegroundColor Yellow
    $paymentData = @{
        paymentMethod = "BANK"
    } | ConvertTo-Json

    $paidResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices/$($invoice.id)/mark-as-paid" -Method Patch -Body $paymentData -Headers $headers -ContentType "application/json"
    Write-Host "Mark as paid response: $($paidResponse.message)" -ForegroundColor Green

    # 6. Test void endpoint
    Write-Host "`n6. Testing void endpoint..." -ForegroundColor Yellow
    $voidData = @{
        reason = "Test void"
    } | ConvertTo-Json

    $voidResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices/$($invoice.id)/void" -Method Patch -Body $voidData -Headers $headers -ContentType "application/json"
    Write-Host "Void response: $($voidResponse.message)" -ForegroundColor Green

    Write-Host "`n✓ All invoice status endpoints tested successfully!" -ForegroundColor Green

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
} 