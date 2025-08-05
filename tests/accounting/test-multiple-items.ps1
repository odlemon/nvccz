# Test Multiple Items Invoice
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== TEST MULTIPLE ITEMS INVOICE ===" -ForegroundColor Cyan

try {
    # Authenticate
    $loginData = @{
        email = "admin@nvccz.co.zw"
        password = "admin123"
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
    $headers = @{ Authorization = "Bearer $($authResponse.token)" }
    Write-Host "Authentication successful" -ForegroundColor Green

    # Create test customer
    $customerData = @{
        name = "Test Multi Corp"
        email = "test@multi.com"
        contactPerson = "Test Person"
        phone = "+263777999000"
    } | ConvertTo-Json

    $customerResponse = Invoke-WebRequest -Uri "$BaseUrl/api/accounting/customers" -Method Post -Body $customerData -Headers $headers -ContentType "application/json"
    $customer = ($customerResponse.Content | ConvertFrom-Json).data
    Write-Host "Customer created: $($customer.name)" -ForegroundColor Green

    # Get currency
    $currenciesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/currencies" -Method Get -Headers $headers
    $currency = $currenciesResponse.data | Where-Object { $_.isActive -eq $true } | Select-Object -First 1

    # Test 1: 8 Items Non-Taxable
    Write-Host "`n=== Test 1: 8 Items Non-Taxable ===" -ForegroundColor Yellow
    $invoice1Data = @{
        customerId = $customer.id
        amount = 10000
        currencyId = $currency.id
        transactionDate = "2025-08-05"
        description = "8 Item Package"
        items = @(
            @{ description = "Item 1"; amount = 1500; category = "Service" },
            @{ description = "Item 2"; amount = 1200; category = "Service" },
            @{ description = "Item 3"; amount = 1000; category = "Service" },
            @{ description = "Item 4"; amount = 1300; category = "Service" },
            @{ description = "Item 5"; amount = 1100; category = "Service" },
            @{ description = "Item 6"; amount = 1400; category = "Service" },
            @{ description = "Item 7"; amount = 1250; category = "Service" },
            @{ description = "Item 8"; amount = 1250; category = "Service" }
        )
        isTaxable = $false
    } | ConvertTo-Json -Depth 4

    $invoice1Response = Invoke-WebRequest -Uri "$BaseUrl/api/accounting/invoices" -Method Post -Body $invoice1Data -Headers $headers -ContentType "application/json"
    $invoice1 = ($invoice1Response.Content | ConvertFrom-Json).data
    
    Write-Host "Invoice 1 created: $($invoice1.invoiceNumber)" -ForegroundColor Green
    Write-Host "Amount: $($invoice1.amount), VAT: $($invoice1.vatAmount), Total: $($invoice1.totalAmount)" -ForegroundColor White

    # Check journal entry
    $je1Response = Invoke-WebRequest -Uri "$BaseUrl/api/accounting/journal-entries/$($invoice1.journalEntryId)" -Method Get -Headers $headers
    $je1 = ($je1Response.Content | ConvertFrom-Json).data
    
    $debits1 = 0
    $credits1 = 0
    Write-Host "Journal Entry 1 Lines:" -ForegroundColor Cyan
    foreach ($line in $je1.journalEntryLines) {
        $debits1 += [decimal]$line.debitAmount
        $credits1 += [decimal]$line.creditAmount
        if ([decimal]$line.debitAmount -gt 0) {
            Write-Host "  Dr $($line.chartOfAccount.accountName): $($line.debitAmount)" -ForegroundColor Green
        }
        if ([decimal]$line.creditAmount -gt 0) {
            Write-Host "  Cr $($line.chartOfAccount.accountName): $($line.creditAmount)" -ForegroundColor Magenta
        }
    }
    $balanced1 = $debits1 -eq $credits1
    Write-Host "Balanced: $(if ($balanced1) { "YES" } else { "NO" })" -ForegroundColor $(if ($balanced1) { "Green" } else { "Red" })

    # Test 2: 10 Items Taxable
    Write-Host "`n=== Test 2: 10 Items Taxable ===" -ForegroundColor Yellow
    $invoice2Data = @{
        customerId = $customer.id
        amount = 20000
        currencyId = $currency.id
        transactionDate = "2025-08-05"
        description = "10 Item Taxable Package"
        items = @(
            @{ description = "Consulting 1"; amount = 2500; category = "Consulting" },
            @{ description = "Consulting 2"; amount = 2200; category = "Consulting" },
            @{ description = "Technical 1"; amount = 2000; category = "Technical" },
            @{ description = "Technical 2"; amount = 1800; category = "Technical" },
            @{ description = "Analysis 1"; amount = 2100; category = "Analysis" },
            @{ description = "Analysis 2"; amount = 1900; category = "Analysis" },
            @{ description = "Training 1"; amount = 2300; category = "Training" },
            @{ description = "Training 2"; amount = 1700; category = "Training" },
            @{ description = "Support 1"; amount = 1750; category = "Support" },
            @{ description = "Support 2"; amount = 1750; category = "Support" }
        )
        isTaxable = $true
    } | ConvertTo-Json -Depth 4

    $invoice2Response = Invoke-WebRequest -Uri "$BaseUrl/api/accounting/invoices" -Method Post -Body $invoice2Data -Headers $headers -ContentType "application/json"
    $invoice2 = ($invoice2Response.Content | ConvertFrom-Json).data
    
    Write-Host "Invoice 2 created: $($invoice2.invoiceNumber)" -ForegroundColor Green
    Write-Host "Amount: $($invoice2.amount), VAT: $($invoice2.vatAmount), Total: $($invoice2.totalAmount)" -ForegroundColor White

    # Check journal entry
    $je2Response = Invoke-WebRequest -Uri "$BaseUrl/api/accounting/journal-entries/$($invoice2.journalEntryId)" -Method Get -Headers $headers
    $je2 = ($je2Response.Content | ConvertFrom-Json).data
    
    $debits2 = 0
    $credits2 = 0
    Write-Host "Journal Entry 2 Lines:" -ForegroundColor Cyan
    foreach ($line in $je2.journalEntryLines) {
        $debits2 += [decimal]$line.debitAmount
        $credits2 += [decimal]$line.creditAmount
        if ([decimal]$line.debitAmount -gt 0) {
            Write-Host "  Dr $($line.chartOfAccount.accountName): $($line.debitAmount)" -ForegroundColor Green
        }
        if ([decimal]$line.creditAmount -gt 0) {
            Write-Host "  Cr $($line.chartOfAccount.accountName): $($line.creditAmount)" -ForegroundColor Magenta
        }
    }
    $balanced2 = $debits2 -eq $credits2
    Write-Host "Balanced: $(if ($balanced2) { "YES" } else { "NO" })" -ForegroundColor $(if ($balanced2) { "Green" } else { "Red" })

    # Test 3: Large Amount with 5 Items
    Write-Host "`n=== Test 3: Large Amount 5 Items Taxable ===" -ForegroundColor Yellow
    $invoice3Data = @{
        customerId = $customer.id
        amount = 100000
        currencyId = $currency.id
        transactionDate = "2025-08-05"
        description = "Large Enterprise Package"
        items = @(
            @{ description = "Enterprise Setup"; amount = 40000; category = "Enterprise" },
            @{ description = "Integration"; amount = 25000; category = "Integration" },
            @{ description = "Training"; amount = 20000; category = "Training" },
            @{ description = "Support"; amount = 10000; category = "Support" },
            @{ description = "Maintenance"; amount = 5000; category = "Maintenance" }
        )
        isTaxable = $true
    } | ConvertTo-Json -Depth 4

    $invoice3Response = Invoke-WebRequest -Uri "$BaseUrl/api/accounting/invoices" -Method Post -Body $invoice3Data -Headers $headers -ContentType "application/json"
    $invoice3 = ($invoice3Response.Content | ConvertFrom-Json).data
    
    Write-Host "Invoice 3 created: $($invoice3.invoiceNumber)" -ForegroundColor Green
    Write-Host "Amount: $($invoice3.amount), VAT: $($invoice3.vatAmount), Total: $($invoice3.totalAmount)" -ForegroundColor White

    # Check journal entry
    $je3Response = Invoke-WebRequest -Uri "$BaseUrl/api/accounting/journal-entries/$($invoice3.journalEntryId)" -Method Get -Headers $headers
    $je3 = ($je3Response.Content | ConvertFrom-Json).data
    
    $debits3 = 0
    $credits3 = 0
    Write-Host "Journal Entry 3 Lines:" -ForegroundColor Cyan
    foreach ($line in $je3.journalEntryLines) {
        $debits3 += [decimal]$line.debitAmount
        $credits3 += [decimal]$line.creditAmount
        if ([decimal]$line.debitAmount -gt 0) {
            Write-Host "  Dr $($line.chartOfAccount.accountName): $($line.debitAmount)" -ForegroundColor Green
        }
        if ([decimal]$line.creditAmount -gt 0) {
            Write-Host "  Cr $($line.chartOfAccount.accountName): $($line.creditAmount)" -ForegroundColor Magenta
        }
    }
    $balanced3 = $debits3 -eq $credits3
    Write-Host "Balanced: $(if ($balanced3) { "YES" } else { "NO" })" -ForegroundColor $(if ($balanced3) { "Green" } else { "Red" })

    # Summary
    Write-Host "`n" + ("="*60) -ForegroundColor Cyan
    Write-Host "MULTIPLE ITEMS TEST SUMMARY" -ForegroundColor Green
    Write-Host ("="*60) -ForegroundColor Cyan
    
    $allPassed = $balanced1 -and $balanced2 -and $balanced3
    $totalAmount = [decimal]$invoice1.totalAmount + [decimal]$invoice2.totalAmount + [decimal]$invoice3.totalAmount
    
    Write-Host "Test 1 (8 items, non-taxable): $(if ($balanced1) { "PASS" } else { "FAIL" })" -ForegroundColor $(if ($balanced1) { "Green" } else { "Red" })
    Write-Host "Test 2 (10 items, taxable): $(if ($balanced2) { "PASS" } else { "FAIL" })" -ForegroundColor $(if ($balanced2) { "Green" } else { "Red" })
    Write-Host "Test 3 (5 large items, taxable): $(if ($balanced3) { "PASS" } else { "FAIL" })" -ForegroundColor $(if ($balanced3) { "Green" } else { "Red" })
    Write-Host "Total Items Tested: 23 items" -ForegroundColor White
    Write-Host "Total Amount: $totalAmount $($currency.code)" -ForegroundColor White
    Write-Host "All Tests Passed: $(if ($allPassed) { "YES" } else { "NO" })" -ForegroundColor $(if ($allPassed) { "Green" } else { "Red" })
    
    if ($allPassed) {
        Write-Host "`nCONCLUSION: Multiple items invoice system works perfectly!" -ForegroundColor Green
    } else {
        Write-Host "`nCONCLUSION: Some tests failed" -ForegroundColor Red
    }

} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}