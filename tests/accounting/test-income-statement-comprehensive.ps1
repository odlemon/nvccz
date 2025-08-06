# Comprehensive Income Statement Test
$baseUrl = "http://localhost:3000"

Write-Host "=== COMPREHENSIVE INCOME STATEMENT TEST ===" -ForegroundColor Green

# 1. Login
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    $token = $login.token
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
    Write-Host "✅ Authentication successful" -ForegroundColor Green
} catch {
    Write-Host "❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 2. Test comprehensive detailed income statement
Write-Host "`n2. Testing comprehensive detailed income statement..." -ForegroundColor Yellow

$currentDate = Get-Date
$startDate = (Get-Date -Year $currentDate.Year -Month $currentDate.Month -Day 1).ToString("yyyy-MM-dd")
$endDate = $currentDate.ToString("yyyy-MM-dd")

$comprehensivePayload = @{
    startDate = $startDate
    endDate = $endDate
}

Write-Host "Period: $startDate to $endDate" -ForegroundColor Cyan
Write-Host "Payload:" -ForegroundColor Yellow
$comprehensivePayload | ConvertTo-Json | Write-Host

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/comprehensive" -Method POST -Headers $headers -Body ($comprehensivePayload | ConvertTo-Json)
    Write-Host "✅ Comprehensive Income Statement Retrieved Successfully!" -ForegroundColor Green
    
    # Display summary information
    Write-Host "`n📊 SUMMARY:" -ForegroundColor Cyan
    Write-Host "Revenue Total: $($response.data.summary.revenue.total)" -ForegroundColor Green
    Write-Host "Expense Total: $($response.data.summary.expenses.total)" -ForegroundColor Green
    Write-Host "Net Income: $($response.data.summary.netIncome)" -ForegroundColor Green
    Write-Host "Revenue Accounts: $($response.data.summary.revenue.accountCount)" -ForegroundColor Cyan
    Write-Host "Expense Accounts: $($response.data.summary.expenses.accountCount)" -ForegroundColor Cyan
    
    # Display statistics
    Write-Host "`n📈 STATISTICS:" -ForegroundColor Cyan
    Write-Host "Total Journal Entries: $($response.data.statistics.totalJournalEntries)" -ForegroundColor Yellow
    Write-Host "Total Transactions: $($response.data.statistics.totalTransactions)" -ForegroundColor Yellow
    Write-Host "Total Debit Amount: $($response.data.statistics.totalDebitAmount)" -ForegroundColor Yellow
    Write-Host "Total Credit Amount: $($response.data.statistics.totalCreditAmount)" -ForegroundColor Yellow
    Write-Host "Total VAT Amount: $($response.data.statistics.totalVatAmount)" -ForegroundColor Yellow
    Write-Host "Unique Vendors: $($response.data.statistics.uniqueVendors)" -ForegroundColor Yellow
    Write-Host "Unique Customers: $($response.data.statistics.uniqueCustomers)" -ForegroundColor Yellow
    
    # Display detailed transactions by type
    Write-Host "`n📋 DETAILED TRANSACTIONS BY TYPE:" -ForegroundColor Cyan
    Write-Host "Expenses: $($response.data.detailedTransactions.byType.expenses.Count)" -ForegroundColor Yellow
    Write-Host "Invoices: $($response.data.detailedTransactions.byType.invoices.Count)" -ForegroundColor Yellow
    Write-Host "Other: $($response.data.detailedTransactions.byType.other.Count)" -ForegroundColor Yellow
    
    # Display all journal entries
    Write-Host "`n📝 ALL JOURNAL ENTRIES ($($response.data.detailedTransactions.allEntries.Count) entries):" -ForegroundColor Cyan
    foreach ($entry in $response.data.detailedTransactions.allEntries) {
        Write-Host "  Entry ID: $($entry.id)" -ForegroundColor White
        Write-Host "  Date: $($entry.transactionDate)" -ForegroundColor White
        Write-Host "  Reference: $($entry.referenceNumber)" -ForegroundColor White
        Write-Host "  Description: $($entry.description)" -ForegroundColor White
        Write-Host "  Status: $($entry.status)" -ForegroundColor White
        
        if ($entry.vendor) {
            Write-Host "  Vendor: $($entry.vendor.name)" -ForegroundColor Green
        }
        if ($entry.customer) {
            Write-Host "  Customer: $($entry.customer.name)" -ForegroundColor Blue
        }
        if ($entry.expense) {
            Write-Host "  Expense: $($entry.expense.description) - Amount: $($entry.expense.amount)" -ForegroundColor Red
        }
        if ($entry.invoice) {
            Write-Host "  Invoice: $($entry.invoice.invoiceNumber)" -ForegroundColor Magenta
        }
        Write-Host "  Lines: $($entry.lines.Count)" -ForegroundColor Gray
        Write-Host "  ---" -ForegroundColor DarkGray
    }
    
    # Display detailed account information
    Write-Host "`n💰 DETAILED ACCOUNT INFORMATION:" -ForegroundColor Cyan
    Write-Host "Revenue Accounts:" -ForegroundColor Green
    foreach ($account in $response.data.summary.revenue.accounts) {
        Write-Host "  Account: $($account.accountName) ($($account.accountNo))" -ForegroundColor Green
        Write-Host "    Net Amount: $($account.netAmount)" -ForegroundColor Green
        Write-Host "    Transaction Count: $($account.transactionCount)" -ForegroundColor Green
        Write-Host "    Total Debit: $($account.totalDebitAmount)" -ForegroundColor Green
        Write-Host "    Total Credit: $($account.totalCreditAmount)" -ForegroundColor Green
        Write-Host "    Total VAT: $($account.totalVatAmount)" -ForegroundColor Green
        Write-Host "    Journal Entries: $($account.journalEntries.Count)" -ForegroundColor Green
    }
    
    Write-Host "`nExpense Accounts:" -ForegroundColor Red
    foreach ($account in $response.data.summary.expenses.accounts) {
        Write-Host "  Account: $($account.accountName) ($($account.accountNo))" -ForegroundColor Red
        Write-Host "    Net Amount: $($account.netAmount)" -ForegroundColor Red
        Write-Host "    Transaction Count: $($account.transactionCount)" -ForegroundColor Red
        Write-Host "    Total Debit: $($account.totalDebitAmount)" -ForegroundColor Red
        Write-Host "    Total Credit: $($account.totalCreditAmount)" -ForegroundColor Red
        Write-Host "    Total VAT: $($account.totalVatAmount)" -ForegroundColor Red
        Write-Host "    Journal Entries: $($account.journalEntries.Count)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Failed to get comprehensive income statement: $($_.Exception.Message)" -ForegroundColor Red
    
    # Get detailed error
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

Write-Host "`n=== COMPREHENSIVE INCOME STATEMENT TEST COMPLETE ===" -ForegroundColor Green 