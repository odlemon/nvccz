# Simple Invoice Test
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== SIMPLE INVOICE TEST ===" -ForegroundColor Cyan

try {
    # Authenticate
    $loginData = @{
        email = "admin@nvccz.co.zw"
        password = "admin123"
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
    $headers = @{ Authorization = "Bearer $($authResponse.token)" }
    Write-Host "Authenticated successfully" -ForegroundColor Green

    # Create customer manually with simple data
    Write-Host "`nCreating customer..." -ForegroundColor Yellow
    $customerData = @{
        name = "Test Company Ltd"
        email = "test@company.com"
    } | ConvertTo-Json

    $customer = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers" -Method Post -Body $customerData -Headers $headers -ContentType "application/json"
    Write-Host "Customer created: $($customer.name) (ID: $($customer.id))" -ForegroundColor Green

    # Get currency
    $currencies = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/currencies" -Method Get -Headers $headers
    $currency = $currencies.data[0]
    Write-Host "Using currency: $($currency.code)" -ForegroundColor Green

    # Create NON-TAXABLE invoice
    Write-Host "`nCreating non-taxable invoice..." -ForegroundColor Yellow
    $invoiceData = @{
        customerId = $customer.id
        amount = 1000
        currencyId = $currency.id
        transactionDate = "2025-08-05"
        description = "Management Fees Q4 2024"
        isTaxable = $false
        items = @(
            @{
                description = "Management Fee"
                amount = 1000
            }
        )
    } | ConvertTo-Json -Depth 3

    $invoice = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices" -Method Post -Body $invoiceData -Headers $headers -ContentType "application/json"
    
    Write-Host "NON-TAXABLE Invoice created:" -ForegroundColor Green
    Write-Host "  Number: $($invoice.invoiceNumber)" -ForegroundColor White
    Write-Host "  Amount: $($invoice.amount)" -ForegroundColor White
    Write-Host "  VAT: $($invoice.vatAmount)" -ForegroundColor White
    Write-Host "  Total: $($invoice.totalAmount)" -ForegroundColor White

    # Create TAXABLE invoice
    Write-Host "`nCreating taxable invoice..." -ForegroundColor Yellow
    $taxableInvoiceData = @{
        customerId = $customer.id
        amount = 1000
        currencyId = $currency.id
        transactionDate = "2025-08-05"
        description = "Professional Services Q4 2024"
        isTaxable = $true
        items = @(
            @{
                description = "Consulting Services"
                amount = 1000
            }
        )
    } | ConvertTo-Json -Depth 3

    $taxableInvoice = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices" -Method Post -Body $taxableInvoiceData -Headers $headers -ContentType "application/json"
    
    Write-Host "TAXABLE Invoice created:" -ForegroundColor Green
    Write-Host "  Number: $($taxableInvoice.invoiceNumber)" -ForegroundColor White
    Write-Host "  Amount: $($taxableInvoice.amount)" -ForegroundColor White
    Write-Host "  VAT: $($taxableInvoice.vatAmount) (should be 145)" -ForegroundColor White
    Write-Host "  Total: $($taxableInvoice.totalAmount) (should be 1145)" -ForegroundColor White

    Write-Host "`nSUCCESS! Both invoice types created successfully!" -ForegroundColor Green
    Write-Host "Non-taxable: $($invoice.totalAmount) (no VAT)" -ForegroundColor White
    Write-Host "Taxable: $($taxableInvoice.totalAmount) (with VAT)" -ForegroundColor White

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
}