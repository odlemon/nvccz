# Test Single Invoice with Different Payment Methods
# This script creates one invoice and tests marking it as paid with different payment methods

$baseUrl = "http://localhost:3000/api"

Write-Host "🧪 Testing Single Invoice Payment Methods..." -ForegroundColor Green
Write-Host ""

# Step 1: Get test data
Write-Host "1️⃣ Getting test data..." -ForegroundColor Yellow

try {
    # Get first customer
    $customersResponse = Invoke-RestMethod -Uri "$baseUrl/customers" -Method GET
    $customer = $customersResponse.data.customers[0]
    Write-Host "✅ Customer: $($customer.name)" -ForegroundColor Green

    # Get first currency
    $currenciesResponse = Invoke-RestMethod -Uri "$baseUrl/currencies" -Method GET
    $currency = $currenciesResponse.data.currencies[0]
    Write-Host "✅ Currency: $($currency.code)" -ForegroundColor Green

} catch {
    Write-Host "❌ Failed to get test data: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Create test invoice
Write-Host ""
Write-Host "2️⃣ Creating test invoice..." -ForegroundColor Yellow

$invoiceData = @{
    customerId = $customer.id
    currencyId = $currency.id
    amount = 2000.00
    transactionDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    description = "Test invoice for payment method verification"
    isTaxable = $true
}

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/invoices" -Method POST -Body ($invoiceData | ConvertTo-Json) -ContentType "application/json"
    $invoice = $createResponse.data
    Write-Host "✅ Invoice created: $($invoice.invoiceNumber)" -ForegroundColor Green
    Write-Host "   Amount: $($invoice.amount), Total: $($invoice.totalAmount), Status: $($invoice.status)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed to create invoice: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Send the invoice
Write-Host ""
Write-Host "3️⃣ Sending invoice..." -ForegroundColor Yellow

try {
    $sendResponse = Invoke-RestMethod -Uri "$baseUrl/invoices/$($invoice.id)/send" -Method PATCH
    $sentInvoice = $sendResponse.data
    Write-Host "✅ Invoice sent: Status = $($sentInvoice.status)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to send invoice: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Test payment methods
Write-Host ""
Write-Host "4️⃣ Testing payment methods..." -ForegroundColor Yellow

$paymentMethods = @("CASH", "BANK", "CREDIT")

foreach ($paymentMethod in $paymentMethods) {
    Write-Host ""
    Write-Host "   💳 Testing $paymentMethod payment..." -ForegroundColor Cyan
    
    try {
        $payData = @{
            paymentMethod = $paymentMethod
        }
        
        $payResponse = Invoke-RestMethod -Uri "$baseUrl/invoices/$($invoice.id)/mark-as-paid" -Method PATCH -Body ($payData | ConvertTo-Json) -ContentType "application/json"
        $paidInvoice = $payResponse.data
        
        Write-Host "   ✅ Successfully marked as paid with $paymentMethod" -ForegroundColor Green
        Write-Host "      Status: $($paidInvoice.status)" -ForegroundColor Gray
        Write-Host "      Payment Method: $($paidInvoice.paymentMethod)" -ForegroundColor Gray
        Write-Host "      Total Amount: $($paidInvoice.totalAmount)" -ForegroundColor Gray
        
        # Check if journal entry was created
        Write-Host "   📊 Checking journal entry..." -ForegroundColor Cyan
        
        try {
            $journalEntriesResponse = Invoke-RestMethod -Uri "$baseUrl/journal-entries" -Method GET
            $paymentEntries = $journalEntriesResponse.data.journalEntries | Where-Object { 
                $_.description -like "*Payment*" -and $_.totalAmount -eq $paidInvoice.totalAmount 
            } | Select-Object -First 1
            
            if ($paymentEntries) {
                $entry = $paymentEntries
                Write-Host "   📋 Found payment journal entry:" -ForegroundColor Green
                Write-Host "      Reference: $($entry.referenceNumber)" -ForegroundColor Gray
                Write-Host "      Description: $($entry.description)" -ForegroundColor Gray
                Write-Host "      Amount: $($entry.totalAmount)" -ForegroundColor Gray
                Write-Host "      Status: $($entry.status)" -ForegroundColor Gray
                
                # Get the journal entry lines
                try {
                    $entryLinesResponse = Invoke-RestMethod -Uri "$baseUrl/journal-entries/$($entry.id)/lines" -Method GET
                    $lines = $entryLinesResponse.data.journalEntryLines
                    
                    Write-Host "      Journal Entry Lines:" -ForegroundColor Gray
                    foreach ($line in $lines) {
                        $accountName = $line.chartOfAccount.accountName
                        $debit = $line.debitAmount
                        $credit = $line.creditAmount
                        
                        if ($debit -gt 0) {
                            Write-Host "        Dr. $accountName`: $debit" -ForegroundColor Gray
                        } else {
                            Write-Host "        Cr. $accountName`: $credit" -ForegroundColor Gray
                        }
                    }
                } catch {
                    Write-Host "      ⚠️ Could not retrieve journal entry lines" -ForegroundColor Yellow
                }
            } else {
                Write-Host "   ⚠️ No payment journal entry found" -ForegroundColor Yellow
            }
            
        } catch {
            Write-Host "   ⚠️ Could not check journal entries: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "   ❌ Failed to mark as paid with $paymentMethod`: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🎉 Payment method testing completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Expected Journal Entries:" -ForegroundColor Cyan
Write-Host "   CASH: Dr. Cash, Cr. Accounts Receivable" -ForegroundColor Gray
Write-Host "   BANK: Dr. Bank Account, Cr. Accounts Receivable" -ForegroundColor Gray
Write-Host "   CREDIT`: Dr. Credit Card Receivable, Cr. Accounts Receivable" -ForegroundColor Gray 