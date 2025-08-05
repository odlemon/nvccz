# Simple Expense Test (without journal entry)
$baseUrl = "http://localhost:3000"

Write-Host "=== SIMPLE EXPENSE TEST ===" -ForegroundColor Green

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

# 2. Get test data
Write-Host "`n2. Getting test data..." -ForegroundColor Yellow

# Get active currency
$currencies = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers $headers
$activeCurrency = $currencies.data | Where-Object { $_.isActive -eq $true } | Select-Object -First 1

# Get vendor
$vendors = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
$testVendor = $vendors.data | Select-Object -First 1

# Get category
$categories = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expense-categories" -Method GET -Headers $headers
$testCategory = $categories.data | Where-Object { $_.parentId -eq $null } | Select-Object -First 1

Write-Host "✅ Using currency: $($activeCurrency.code)" -ForegroundColor Green
Write-Host "✅ Using vendor: $($testVendor.name)" -ForegroundColor Green
Write-Host "✅ Using category: $($testCategory.name)" -ForegroundColor Green

# 3. Test expense creation
Write-Host "`n3. Testing expense creation..." -ForegroundColor Yellow
$expensePayload = @{
    description = "Simple test expense"
    amount = 500.00
    currencyId = $activeCurrency.id
    vendorId = $testVendor.id
    categoryId = $testCategory.id
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    receiptNumber = "SIMPLE-001"
    isTaxable = $false
    paymentMethod = "BANK"
}

Write-Host "Payload:" -ForegroundColor Yellow
$expensePayload | ConvertTo-Json | Write-Host

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method POST -Headers $headers -Body ($expensePayload | ConvertTo-Json)
    Write-Host "✅ Expense created successfully!" -ForegroundColor Green
    Write-Host "Expense ID: $($response.data.id)" -ForegroundColor Cyan
    Write-Host "Status: $($response.data.status)" -ForegroundColor Cyan
    Write-Host "Amount: $($response.data.amount)" -ForegroundColor Cyan
    Write-Host "VAT Amount: $($response.data.vatAmount)" -ForegroundColor Cyan
    Write-Host "Total: $($response.data.totalAmount)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create expense: $($_.Exception.Message)" -ForegroundColor Red
    
    # Get detailed error
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Green 