# Basic Expense Creation Test
$baseUrl = "http://localhost:3000"

Write-Host "=== EXPENSE CREATION WORKFLOW TEST ===" -ForegroundColor Magenta
Write-Host ""

# Step 1: Login
Write-Host "1. Logging in..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@example.com", "password": "password123"}'

if ($loginResponse.success) {
    $token = $loginResponse.data.token
    Write-Host "✓ Login successful" -ForegroundColor Green
} else {
    Write-Host "✗ Login failed" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Step 2: Get required IDs
Write-Host "`n2. Getting required IDs..." -ForegroundColor Yellow

$vendorsResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
$vendorId = $vendorsResponse.data[0].id

$categoriesResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expense-categories" -Method GET -Headers $headers
$categoryId = $categoriesResponse.data[0].id

$currenciesResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers $headers
$currencyId = $currenciesResponse.data[0].id

Write-Host "✓ Got IDs: Vendor=$vendorId, Category=$categoryId, Currency=$currencyId" -ForegroundColor Green

# Step 3: Test Taxable Expense
Write-Host "`n3. Testing Taxable Expense (300 ZWL)..." -ForegroundColor Cyan

$taxableExpense = @{
    vendorId = $vendorId
    categoryId = $categoryId
    amount = 300
    currencyId = $currencyId
    transactionDate = "2024-06-01"
    description = "Legal Fees - Taxable"
    isTaxable = $true
    createdById = "test-user"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method POST -Headers $headers -Body $taxableExpense

if ($response.success) {
    $expense = $response.data
    Write-Host "✓ Taxable expense created successfully" -ForegroundColor Green
    Write-Host "  Amount: $($expense.amount)" -ForegroundColor White
    Write-Host "  VAT Amount: $($expense.vatAmount)" -ForegroundColor White
    Write-Host "  Total Amount: $($expense.totalAmount)" -ForegroundColor White
    Write-Host "  Status: $($expense.status)" -ForegroundColor White
    
    # Verify amounts
    $expectedVAT = 43.5
    $expectedTotal = 343.5
    
    if ([math]::Abs($expense.vatAmount - $expectedVAT) -lt 0.01) {
        Write-Host "  ✓ VAT calculation correct (43.5)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ VAT calculation incorrect (expected 43.5, got $($expense.vatAmount))" -ForegroundColor Red
    }
    
    if ([math]::Abs($expense.totalAmount - $expectedTotal) -lt 0.01) {
        Write-Host "  ✓ Total calculation correct (343.5)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Total calculation incorrect (expected 343.5, got $($expense.totalAmount))" -ForegroundColor Red
    }
    
    # Get journal entry
    $journalEntryId = $expense.journalEntry.id
    $journalResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries/$journalEntryId" -Method GET -Headers $headers
    
    if ($journalResponse.success) {
        $journalEntry = $journalResponse.data
        Write-Host "  ✓ Journal entry retrieved" -ForegroundColor Green
        
        # Verify journal entry lines
        $lines = $journalEntry.journalEntryLines
        Write-Host "  Journal Entry Lines:" -ForegroundColor Yellow
        
        $totalDebits = 0
        $totalCredits = 0
        
        foreach ($line in $lines) {
            $debit = [double]$line.debitAmount
            $credit = [double]$line.creditAmount
            $accountName = $line.chartOfAccount.accountName
            $description = $line.description
            
            $totalDebits += $debit
            $totalCredits += $credit
            
            if ($debit -gt 0) {
                Write-Host "    Dr $accountName`: $debit ($description)" -ForegroundColor Green
            } elseif ($credit -gt 0) {
                Write-Host "    Cr $accountName`: $credit ($description)" -ForegroundColor Red
            }
        }
        
        # Verify balance
        $balance = [math]::Abs($totalDebits - $totalCredits)
        if ($balance -lt 0.01) {
            Write-Host "  ✓ Journal entry is balanced (Debits: $totalDebits, Credits: $totalCredits)" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Journal entry is not balanced (Debits: $totalDebits, Credits: $totalCredits)" -ForegroundColor Red
        }
        
        # Verify Bank Account is credited
        $bankCredit = $lines | Where-Object { $_.chartOfAccount.accountName -like "*Bank*" -and [double]$_.creditAmount -gt 0 }
        if ($bankCredit) {
            Write-Host "  ✓ Bank Account is credited (not Accounts Payable)" -ForegroundColor Green
        } else {
            Write-Host "  ✗ Bank Account is not credited" -ForegroundColor Red
        }
    }
} else {
    Write-Host "✗ Error creating taxable expense" -ForegroundColor Red
}

Write-Host "`n=== TEST COMPLETED ===" -ForegroundColor Magenta 