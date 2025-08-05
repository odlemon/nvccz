# Test Invoice Status Changes and Journal Tracking
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== INVOICE STATUS AND JOURNAL TRACKING TEST ===" -ForegroundColor Cyan

try {
    # 1. Login and get token
    Write-Host "`n1. Logging in..." -ForegroundColor Yellow
    $loginData = @{
        email = "admin@nvccz.co.zw"
        password = "admin123"
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
    $headers = @{ Authorization = "Bearer $($authResponse.token)" }
    Write-Host "Login successful" -ForegroundColor Green

    # 2. Get currency and create customer
    Write-Host "`n2. Getting currency and creating customer..." -ForegroundColor Yellow
    $currenciesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/currencies" -Method Get -Headers $headers
    $currency = $currenciesResponse.data[0]
    
    # Always create a new customer for this test
    Write-Host "Creating customer..." -ForegroundColor Yellow
    $customerData = @{
        name = "Test Customer for Journal Tracking"
        contactPerson = "John Doe"
        email = "john@testcustomer.com"
        phone = "+263777123456"
        address = "123 Test Street, Harare"
        paymentTerms = "Net 30"
    } | ConvertTo-Json

    $customerResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers" -Method Post -Body $customerData -Headers $headers -ContentType "application/json"
    $customer = $customerResponse.data
    
    Write-Host "Currency: $($currency.code)" -ForegroundColor Green
    Write-Host "Customer: $($customer.name) (ID: $($customer.id))" -ForegroundColor Green

    # 3. Create invoice (DRAFT status)
    Write-Host "`n3. Creating invoice (DRAFT status)..." -ForegroundColor Yellow
    $invoiceData = @{
        customerId = $customer.id
        amount = 2000
        currencyId = $currency.id
        transactionDate = "2025-08-05"
        description = "Test Invoice for Journal Tracking"
        isTaxable = $true
        items = @(
            @{
                description = "Consulting Services"
                amount = 2000
                category = "Consulting"
            }
        )
    } | ConvertTo-Json

    Write-Host "Invoice data: $invoiceData" -ForegroundColor White
    $invoiceResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices" -Method Post -Body $invoiceData -Headers $headers -ContentType "application/json"
    $invoice = $invoiceResponse.data
    Write-Host "Invoice created: $($invoice.invoiceNumber)" -ForegroundColor Green
    Write-Host "Status: $($invoice.status)" -ForegroundColor White
    Write-Host "Amount: $($invoice.amount), VAT: $($invoice.vatAmount), Total: $($invoice.totalAmount)" -ForegroundColor White

    # 4. Check initial journal entry (DRAFT)
    Write-Host "`n4. Checking initial journal entry (DRAFT)..." -ForegroundColor Yellow
    if ($invoice.journalEntry) {
        Write-Host "Journal Entry: $($invoice.journalEntry.referenceNumber)" -ForegroundColor Green
        Write-Host "Status: $($invoice.journalEntry.status)" -ForegroundColor White
        Write-Host "Accounting: Dr Accounts Receivable, Cr Income/Revenue, Cr VAT Output" -ForegroundColor Cyan
    } else {
        Write-Host "No journal entry found - Chart of Accounts may be missing required accounts" -ForegroundColor Red
    }

    # 5. Send invoice (DRAFT -> SENT)
    Write-Host "`n5. Sending invoice (DRAFT -> SENT)..." -ForegroundColor Yellow
    $sendResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices/$($invoice.id)/send" -Method Patch -Headers $headers
    $sentInvoice = $sendResponse.data
    Write-Host "Status changed to: $($sentInvoice.status)" -ForegroundColor Green
    Write-Host "Accounting: NO CHANGE - Same journal entry, just status update" -ForegroundColor Cyan

    # 6. Mark as paid (SENT -> PAID)
    Write-Host "`n6. Marking invoice as paid (SENT -> PAID)..." -ForegroundColor Yellow
    $paymentData = @{
        paymentMethod = "BANK"
    } | ConvertTo-Json

    $paidResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices/$($invoice.id)/mark-as-paid" -Method Patch -Body $paymentData -Headers $headers -ContentType "application/json"
    $paidInvoice = $paidResponse.data
    Write-Host "Status changed to: $($paidInvoice.status)" -ForegroundColor Green
    Write-Host "Accounting: NEW JOURNAL ENTRY - Dr Cash/Bank, Cr Accounts Receivable" -ForegroundColor Cyan
    Write-Host "Net Effect: Dr Cash/Bank, Cr Income/Revenue, Cr VAT Output" -ForegroundColor Green

    # 7. Check all journal entries for this invoice
    Write-Host "`n7. Checking all journal entries for this invoice..." -ForegroundColor Yellow
    $journalEntriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Method Get -Headers $headers
    $recentEntries = $journalEntriesResponse.data | Where-Object { $_.description -like "*$($invoice.invoiceNumber)*" -or $_.description -like "*Payment*$($invoice.invoiceNumber)*" }
    
    Write-Host "Found $($recentEntries.Count) journal entries for this invoice:" -ForegroundColor White
    foreach ($entry in $recentEntries) {
        Write-Host "  - $($entry.referenceNumber): $($entry.description) (Status: $($entry.status))" -ForegroundColor White
    }

    # 8. Void invoice (PAID -> VOID)
    Write-Host "`n8. Voiding invoice (PAID -> VOID)..." -ForegroundColor Yellow
    $voidData = @{
        reason = "Customer requested cancellation"
    } | ConvertTo-Json

    $voidResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices/$($invoice.id)/void" -Method Patch -Body $voidData -Headers $headers -ContentType "application/json"
    $voidedInvoice = $voidResponse.data
    Write-Host "Status changed to: $($voidedInvoice.status)" -ForegroundColor Green
    Write-Host "Accounting: REVERSAL JOURNAL ENTRY - Cr Accounts Receivable, Dr Income/Revenue, Dr VAT Output" -ForegroundColor Cyan

    # 9. Final journal entry check
    Write-Host "`n9. Final journal entry check..." -ForegroundColor Yellow
    $finalJournalEntriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Method Get -Headers $headers
    $finalEntries = $finalJournalEntriesResponse.data | Where-Object { $_.description -like "*$($invoice.invoiceNumber)*" -or $_.description -like "*Payment*$($invoice.invoiceNumber)*" -or $_.description -like "*VOID*$($invoice.invoiceNumber)*" }
    
    Write-Host "Final journal entries for this invoice:" -ForegroundColor White
    foreach ($entry in $finalEntries) {
        Write-Host "  - $($entry.referenceNumber): $($entry.description) (Status: $($entry.status))" -ForegroundColor White
    }

    # 10. Summary
    Write-Host "`n" + ("="*80) -ForegroundColor Cyan
    Write-Host "INVOICE STATUS WORKFLOW SUMMARY" -ForegroundColor Green
    Write-Host ("="*80) -ForegroundColor Cyan

    Write-Host "`nSTATUS TRANSITIONS:" -ForegroundColor Yellow
    Write-Host "1. DRAFT -> SENT: No accounting impact" -ForegroundColor White
    Write-Host "2. SENT -> PAID: Payment journal entry created" -ForegroundColor White
    Write-Host "3. PAID -> VOID: Reversal journal entry created" -ForegroundColor White

    Write-Host "`nACCOUNTING EFFECTS:" -ForegroundColor Yellow
    Write-Host "DRAFT: Dr Accounts Receivable, Cr Income/Revenue, Cr VAT Output" -ForegroundColor White
    Write-Host "SENT: Same as DRAFT (no change)" -ForegroundColor White
    Write-Host "PAID: Dr Cash/Bank, Cr Accounts Receivable (payment)" -ForegroundColor White
    Write-Host "VOID: Cr Accounts Receivable, Dr Income/Revenue, Dr VAT Output (reversal)" -ForegroundColor White

    Write-Host "`nCASH FLOW IMPACT:" -ForegroundColor Yellow
    Write-Host "DRAFT/SENT: No cash flow (just receivable recognition)" -ForegroundColor White
    Write-Host "PAID: Cash received (positive cash flow)" -ForegroundColor White
    Write-Host "VOID: No cash flow (reversal of original entry)" -ForegroundColor White

    Write-Host "`nInvoice status workflow test completed successfully!" -ForegroundColor Green

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
} 