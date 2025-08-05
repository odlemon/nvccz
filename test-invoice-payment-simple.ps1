# Simple Invoice Payment Method Test
# Login first, get token, then test payment methods

$baseUrl = "http://localhost:3000/api"

Write-Host "Testing Invoice Payment Methods..." -ForegroundColor Green
Write-Host ""

# Step 1: Login and get token
Write-Host "1. Logging in..." -ForegroundColor Yellow

$loginData = @{
    email = "admin@nvccz.co.zw"
    password = "admin123"
}

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body ($loginData | ConvertTo-Json) -ContentType "application/json"
    $token = $loginResponse.token
    Write-Host "Login successful. Token obtained." -ForegroundColor Green
} catch {
    Write-Host "Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Set headers for authenticated requests
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Step 2: Get test data
Write-Host "2. Getting test data..." -ForegroundColor Yellow

try {
    $customersResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/customers" -Method GET -Headers $headers
    $customer = $customersResponse.data.customers[0]
    Write-Host "Customer: $($customer.name)" -ForegroundColor Green

    $currenciesResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/currencies" -Method GET -Headers $headers
    Write-Host "Currencies response: $($currenciesResponse | ConvertTo-Json -Depth 3)" -ForegroundColor Gray
    $currency = $currenciesResponse.data[0]
    Write-Host "Currency: $($currency.code) (ID: $($currency.id))" -ForegroundColor Green
} catch {
    Write-Host "Failed to get test data: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Create test invoice
Write-Host "3. Creating test invoice..." -ForegroundColor Yellow

$invoiceData = @{
    customerId = $customer.id
    currencyId = $currency.id
    amount = 1000.00
    transactionDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    description = "Test invoice for payment methods"
    isTaxable = $true
}

Write-Host "Invoice data:" -ForegroundColor Gray
Write-Host "Customer ID: $($customer.id)" -ForegroundColor Gray
Write-Host "Currency ID: $($currency.id)" -ForegroundColor Gray
Write-Host "Amount: 1000.00" -ForegroundColor Gray
Write-Host "Description: Test invoice for payment methods" -ForegroundColor Gray

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/invoices" -Method POST -Body ($invoiceData | ConvertTo-Json) -Headers $headers
    $invoice = $createResponse.data
    Write-Host "Invoice created: $($invoice.invoiceNumber)" -ForegroundColor Green
    Write-Host "Amount: $($invoice.amount), Total: $($invoice.totalAmount), Status: $($invoice.status)" -ForegroundColor Gray
} catch {
    Write-Host "Failed to create invoice: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Send the invoice
Write-Host "4. Sending invoice..." -ForegroundColor Yellow

try {
    $sendResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/invoices/$($invoice.id)/send" -Method PATCH -Headers $headers
    $sentInvoice = $sendResponse.data
    Write-Host "Invoice sent: Status = $($sentInvoice.status)" -ForegroundColor Green
} catch {
    Write-Host "Failed to send invoice: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 5: Test payment methods
Write-Host "5. Testing payment methods..." -ForegroundColor Yellow

$paymentMethods = @("CASH", "BANK", "CREDIT")

foreach ($paymentMethod in $paymentMethods) {
    Write-Host ""
    Write-Host "Testing $paymentMethod payment..." -ForegroundColor Cyan
    
    # Create a new invoice for each payment method test
    Write-Host "Creating new invoice for $paymentMethod test..." -ForegroundColor Gray
    
    $newInvoiceData = @{
        customerId = $customer.id
        currencyId = $currency.id
        amount = 1000.00
        transactionDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        description = "Test invoice for $paymentMethod payment"
        isTaxable = $true
    }
    
    try {
        $newCreateResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/invoices" -Method POST -Body ($newInvoiceData | ConvertTo-Json) -Headers $headers
        $newInvoice = $newCreateResponse.data
        Write-Host "New invoice created: $($newInvoice.invoiceNumber)" -ForegroundColor Gray
        
        # Send the new invoice
        $newSendResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/invoices/$($newInvoice.id)/send" -Method PATCH -Headers $headers
        $newSentInvoice = $newSendResponse.data
        Write-Host "Invoice sent: Status = $($newSentInvoice.status)" -ForegroundColor Gray
        
        # Now test payment
        $payData = @{
            paymentMethod = $paymentMethod
        }
        
        $payResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/invoices/$($newInvoice.id)/mark-as-paid" -Method PATCH -Body ($payData | ConvertTo-Json) -Headers $headers
        $paidInvoice = $payResponse.data
        
        Write-Host "Successfully marked as paid with $paymentMethod" -ForegroundColor Green
        Write-Host "Status: $($paidInvoice.status)" -ForegroundColor White
        Write-Host "Payment Method: $($paidInvoice.paymentMethod)" -ForegroundColor White
        Write-Host "Total Amount: $($paidInvoice.totalAmount)" -ForegroundColor White
        
        # Check journal entries
        Write-Host "Checking journal entries..." -ForegroundColor Cyan
        
        try {
            $journalEntriesResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/journal-entries" -Method GET -Headers $headers
            $paymentEntries = $journalEntriesResponse.data | Where-Object { 
                $_.description -like "*Payment*" -and $_.totalAmount -eq $paidInvoice.totalAmount 
            } | Select-Object -First 1
            
            if ($paymentEntries) {
                $entry = $paymentEntries
                Write-Host "Found payment journal entry:" -ForegroundColor Green
                Write-Host "Reference: $($entry.referenceNumber)" -ForegroundColor Gray
                Write-Host "Description: $($entry.description)" -ForegroundColor Gray
                Write-Host "Amount: $($entry.totalAmount)" -ForegroundColor Gray
                Write-Host "Status: $($entry.status)" -ForegroundColor Gray
                
                # Get journal entry lines
                try {
                    $entryLinesResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/journal-entries/$($entry.id)/lines" -Method GET -Headers $headers
                    $lines = $entryLinesResponse.data.journalEntryLines
                    
                    Write-Host "Journal Entry Lines:" -ForegroundColor Gray
                    foreach ($line in $lines) {
                        $accountName = $line.chartOfAccount.accountName
                        $debit = $line.debitAmount
                        $credit = $line.creditAmount
                        
                        if ($debit -gt 0) {
                            Write-Host "  Dr. $accountName`: $debit" -ForegroundColor Gray
                        } else {
                            Write-Host "  Cr. $accountName`: $credit" -ForegroundColor Gray
                        }
                    }
                } catch {
                    Write-Host "Could not retrieve journal entry lines" -ForegroundColor Yellow
                }
            } else {
                Write-Host "No payment journal entry found" -ForegroundColor Yellow
            }
            
        } catch {
            Write-Host "Could not check journal entries: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "Failed to mark as paid with $paymentMethod`: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Error details: $responseBody" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Payment method testing completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Expected Journal Entries:" -ForegroundColor Cyan
Write-Host "CASH: Dr. Cash, Cr. Accounts Receivable" -ForegroundColor Gray
Write-Host "BANK: Dr. Bank Account, Cr. Accounts Receivable" -ForegroundColor Gray
Write-Host "CREDIT`: Dr. Credit Card Receivable, Cr. Accounts Receivable" -ForegroundColor Gray 