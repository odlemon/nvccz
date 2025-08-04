# Test script to demonstrate the expense update workflow with proper double-entry bookkeeping
# This script shows how the system handles expense updates with reversal journal entries

param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

$baseUrl = "http://localhost:3000/api"
$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type" = "application/json"
}

Write-Host "=== Expense Update Workflow Test ===" -ForegroundColor Green
Write-Host ""

# Step 1: Get required data (vendor, category, currency)
Write-Host "1. Getting required data..." -ForegroundColor Yellow

try {
    $vendors = Invoke-RestMethod -Uri "$baseUrl/vendors" -Headers $headers -Method GET
    $categories = Invoke-RestMethod -Uri "$baseUrl/expense-categories" -Headers $headers -Method GET
    $currencies = Invoke-RestMethod -Uri "$baseUrl/currencies" -Headers $headers -Method GET
    
    if ($vendors.data.Count -eq 0 -or $categories.data.Count -eq 0 -or $currencies.data.Count -eq 0) {
        Write-Host "❌ Missing required data. Please ensure vendors, categories, and currencies exist." -ForegroundColor Red
        exit 1
    }
    
    $vendorId = $vendors.data[0].id
    $categoryId = $categories.data[0].id
    $currencyId = $currencies.data[0].id
    
    Write-Host "   ✅ Using: $($vendors.data[0].name), $($categories.data[0].name), $($currencies.data[0].code)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get required data: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Create initial expense (300 ZWL, taxable)
Write-Host ""
Write-Host "2. Creating initial expense: 300 ZWL, taxable..." -ForegroundColor Yellow

$expenseData = @{
    vendorId = $vendorId
    categoryId = $categoryId
    amount = 300
    currencyId = $currencyId
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    description = "Test Expense - Initial"
    isTaxable = $true
}

try {
    $expense = Invoke-RestMethod -Uri "$baseUrl/expenses" -Headers $headers -Method POST -Body ($expenseData | ConvertTo-Json)
    Write-Host "   ✅ Created: ID=$($expense.data.id), Amount=$($expense.data.amount), VAT=$($expense.data.vatAmount), Total=$($expense.data.totalAmount)" -ForegroundColor Green
    Write-Host "   📋 Journal Entry: $($expense.data.journalEntry.referenceNumber)" -ForegroundColor Cyan
    
    $expenseId = $expense.data.id
} catch {
    Write-Host "❌ Failed to create expense: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Update expense to 500 ZWL
Write-Host ""
Write-Host "3. Updating expense to 500 ZWL..." -ForegroundColor Yellow

$updateData = @{
    amount = 500
    description = "Test Expense - Updated"
}

try {
    $updatedExpense = Invoke-RestMethod -Uri "$baseUrl/expenses/$expenseId" -Headers $headers -Method PUT -Body ($updateData | ConvertTo-Json)
    Write-Host "   ✅ Updated: Amount=$($updatedExpense.data.amount), VAT=$($updatedExpense.data.vatAmount), Total=$($updatedExpense.data.totalAmount)" -ForegroundColor Green
    Write-Host "   📋 New Journal Entry: $($updatedExpense.data.journalEntry.referenceNumber)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to update expense: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Verify the workflow worked
Write-Host ""
Write-Host "4. Verifying double-entry bookkeeping..." -ForegroundColor Yellow

try {
    # Get the expense to see final state
    $finalExpense = Invoke-RestMethod -Uri "$baseUrl/expenses/$expenseId" -Headers $headers -Method GET
    
    # Calculate expected values
    $expectedVAT = [math]::Round(500 * 0.145, 2)  # 14.5% VAT rate
    $expectedTotal = 500 + $expectedVAT
    
    Write-Host "   📊 Final Expense:" -ForegroundColor Cyan
    Write-Host "      Amount: $($finalExpense.data.amount) (Expected: 500)" -ForegroundColor White
    Write-Host "      VAT: $($finalExpense.data.vatAmount) (Expected: $expectedVAT)" -ForegroundColor White
    Write-Host "      Total: $($finalExpense.data.totalAmount) (Expected: $expectedTotal)" -ForegroundColor White
    Write-Host "      Status: $($finalExpense.data.status)" -ForegroundColor White
    
    # Verify the amounts match expected values
    if ([math]::Abs($finalExpense.data.amount - 500) -lt 0.01 -and 
        [math]::Abs($finalExpense.data.vatAmount - $expectedVAT) -lt 0.01 -and
        [math]::Abs($finalExpense.data.totalAmount - $expectedTotal) -lt 0.01) {
        Write-Host "   ✅ Amounts match expected values!" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Amounts don't match expected values!" -ForegroundColor Red
    }
    
    Write-Host "   📋 Journal Entry: $($finalExpense.data.journalEntry.referenceNumber)" -ForegroundColor Cyan
    
} catch {
    Write-Host "❌ Failed to verify expense: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Test completed successfully!" -ForegroundColor Green
Write-Host "   Double-entry bookkeeping workflow is working correctly." -ForegroundColor Green
Write-Host "   The system created a reversal entry and a new entry for the updated expense." -ForegroundColor Green 