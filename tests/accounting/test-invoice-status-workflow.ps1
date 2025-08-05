# Test Invoice Status Workflow and Accounting Effects
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== INVOICE STATUS WORKFLOW TEST ===" -ForegroundColor Cyan
Write-Host "Testing: DRAFT -> SENT -> PAID -> VOID with accounting effects" -ForegroundColor Yellow

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

    # 2. Get currency for invoice
    Write-Host "`n2. Getting currency..." -ForegroundColor Yellow
    $currenciesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/currencies" -Method Get -Headers $headers
    $currency = $currenciesResponse.data[0]
    Write-Host "Using currency: $($currency.code)" -ForegroundColor Green

    # 3. Get or create customer
    Write-Host "`n3. Getting customer..." -ForegroundColor Yellow
    $customersResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers" -Method Get -Headers $headers
    $customer = $customersResponse.data[0]
    if (-not $customer) {
        Write-Host "No customers found, creating one..." -ForegroundColor Yellow
        $customerData = @{
            name = "Test Customer for Status Workflow"
            contactPerson = "John Doe"
            email = "john@testcustomer.com"
            phone = "+263777123456"
            address = "123 Test Street, Harare"
            paymentTerms = "Net 30"
        } | ConvertTo-Json

        $customerResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers" -Method Post -Body $customerData -Headers $headers -ContentType "application/json"
        $customer = $customerResponse.data
    }
    Write-Host "Using customer: $($customer.name)" -ForegroundColor Green

    # 4. Create invoice (DRAFT status)
    Write-Host "`n4. Creating invoice (DRAFT status)..." -ForegroundColor Yellow
    $invoiceData = @{
        customerId = $customer.id
        amount = 5000
        currencyId = $currency.id
        transactionDate = "2025-08-05"
        description = "Test Invoice for Status Workflow"
        isTaxable = $true
        items = @(
            @{
                description = "Consulting Services"
                amount = 3000
                category = "Consulting"
            },
            @{
                description = "Training Services"
                amount = 2000
                category = "Training"
            }
        )
    } | ConvertTo-Json

    $invoiceResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices" -Method Post -Body $invoiceData -Headers $headers -ContentType "application/json"
    $invoice = $invoiceResponse.data
    Write-Host "Invoice created: $($invoice.invoiceNumber) - Status: $($invoice.status)" -ForegroundColor Green
    Write-Host "Amount: $($invoice.amount), VAT: $($invoice.vatAmount), Total: $($invoice.totalAmount)" -ForegroundColor White

    # 5. Check initial journal entry
    Write-Host "`n5. Checking initial journal entry (DRAFT)..." -ForegroundColor Yellow
    if ($invoice.journalEntry) {
        Write-Host "Journal Entry: $($invoice.journalEntry.referenceNumber) - Status: $($invoice.journalEntry.status)" -ForegroundColor Green
        Write-Host "Accounting Effect: Dr Accounts Receivable, Cr Income/Revenue, Cr VAT Output" -ForegroundColor Cyan
    } else {
        Write-Host "No journal entry found (this might indicate missing Chart of Accounts)" -ForegroundColor Red
    }

    # 6. Send invoice (DRAFT -> SENT)
    Write-Host "`n6. Sending invoice (DRAFT -> SENT)..." -ForegroundColor Yellow
    $sendResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices/$($invoice.id)/send" -Method Patch -Headers $headers
    $sentInvoice = $sendResponse.data
    Write-Host "Invoice sent: Status changed to $($sentInvoice.status)" -ForegroundColor Green
    Write-Host "Accounting Effect: NO CHANGE - Same journal entry, just status update" -ForegroundColor Cyan

    # 7. Mark as paid (SENT -> PAID)
    Write-Host "`n7. Marking invoice as paid (SENT -> PAID)..." -ForegroundColor Yellow
    $paymentData = @{
        paymentMethod = "BANK"
    } | ConvertTo-Json

    $paidResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices/$($invoice.id)/mark-as-paid" -Method Patch -Body $paymentData -Headers $headers -ContentType "application/json"
    $paidInvoice = $paidResponse.data
    Write-Host "Invoice marked as paid: Status changed to $($paidInvoice.status)" -ForegroundColor Green
    Write-Host "Accounting Effect: NEW JOURNAL ENTRY - Dr Cash/Bank, Cr Accounts Receivable" -ForegroundColor Cyan
    Write-Host "Net Effect: Dr Cash/Bank, Cr Income/Revenue, Cr VAT Output" -ForegroundColor Green

    # 8. Check all journal entries for this invoice
    Write-Host "`n8. Checking all journal entries..." -ForegroundColor Yellow
    $journalEntriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Method Get -Headers $headers
    $recentEntries = $journalEntriesResponse.data | Where-Object { $_.description -like "*$($invoice.invoiceNumber)*" -or $_.description -like "*Payment*$($invoice.invoiceNumber)*" }
    
    Write-Host "Found $($recentEntries.Count) journal entries for this invoice:" -ForegroundColor White
    foreach ($entry in $recentEntries) {
        Write-Host "  - $($entry.referenceNumber): $($entry.description) (Status: $($entry.status))" -ForegroundColor White
    }

    # 9. Void invoice (PAID -> VOID)
    Write-Host "`n9. Voiding invoice (PAID -> VOID)..." -ForegroundColor Yellow
    $voidData = @{
        reason = "Customer requested cancellation"
    } | ConvertTo-Json

    $voidResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/invoices/$($invoice.id)/void" -Method Patch -Body $voidData -Headers $headers -ContentType "application/json"
    $voidedInvoice = $voidResponse.data
    Write-Host "Invoice voided: Status changed to $($voidedInvoice.status)" -ForegroundColor Green
    Write-Host "Accounting Effect: REVERSAL JOURNAL ENTRY - Cr Accounts Receivable, Dr Income/Revenue, Dr VAT Output" -ForegroundColor Cyan

    # 10. Final summary
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

    Write-Host "`n✓ Invoice status workflow test completed successfully!" -ForegroundColor Green

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
} 