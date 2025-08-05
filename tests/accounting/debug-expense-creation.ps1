# Debug Expense Creation Script
$baseUrl = "http://localhost:3000"

Write-Host "=== DEBUGGING EXPENSE CREATION ===" -ForegroundColor Green

# 1. Login and get token
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

# 2. Get currencies and show details
Write-Host "`n2. Getting currencies..." -ForegroundColor Yellow
try {
    $currencies = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($currencies.data.Count) currencies" -ForegroundColor Green
    
    foreach ($currency in $currencies.data) {
        Write-Host "   - $($currency.code) ($($currency.name)) - Default: $($currency.isDefault) - Active: $($currency.isActive)" -ForegroundColor Cyan
    }
    
    $defaultCurrency = $currencies.data | Where-Object { $_.isActive -eq $true } | Select-Object -First 1
    
    if ($defaultCurrency) {
        Write-Host "✅ Found active currency: $($defaultCurrency.code) (ID: $($defaultCurrency.id))" -ForegroundColor Green
    } else {
        Write-Host "❌ No active currency found!" -ForegroundColor Red
        exit
    }
} catch {
    Write-Host "❌ Failed to get currencies: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 3. Get vendors and show details
Write-Host "`n3. Getting vendors..." -ForegroundColor Yellow
try {
    $vendors = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($vendors.data.Count) vendors" -ForegroundColor Green
    
    foreach ($vendor in $vendors.data) {
        Write-Host "   - $($vendor.name) (ID: $($vendor.id))" -ForegroundColor Cyan
    }
    
    $testVendor = $vendors.data | Select-Object -First 1
    
    if ($testVendor) {
        Write-Host "✅ Found test vendor: $($testVendor.name) (ID: $($testVendor.id))" -ForegroundColor Green
    } else {
        Write-Host "❌ No vendors found!" -ForegroundColor Red
        exit
    }
} catch {
    Write-Host "❌ Failed to get vendors: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 4. Get expense categories and show details
Write-Host "`n4. Getting expense categories..." -ForegroundColor Yellow
try {
    $categories = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expense-categories" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($categories.data.Count) categories" -ForegroundColor Green
    
    foreach ($category in $categories.data) {
        Write-Host "   - $($category.name) (ID: $($category.id)) - Parent: $($category.parentId)" -ForegroundColor Cyan
    }
    
    $testCategory = $categories.data | Where-Object { $_.parentId -eq $null } | Select-Object -First 1
    
    if ($testCategory) {
        Write-Host "✅ Found test category: $($testCategory.name) (ID: $($testCategory.id))" -ForegroundColor Green
    } else {
        Write-Host "❌ No root categories found!" -ForegroundColor Red
        exit
    }
} catch {
    Write-Host "❌ Failed to get categories: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 5. Test expense creation with detailed payload
Write-Host "`n5. Testing expense creation..." -ForegroundColor Yellow
$expensePayload = @{
    description = "Test office supplies"
    amount = 1000.00
    currencyId = $defaultCurrency.id
    vendorId = $testVendor.id
    categoryId = $testCategory.id
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    receiptNumber = "TEST-001"
    isTaxable = $true
    paymentMethod = "BANK"
}

Write-Host "Payload being sent:" -ForegroundColor Yellow
$expensePayload | ConvertTo-Json -Depth 3 | Write-Host

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/expenses" -Method POST -Headers $headers -Body ($expensePayload | ConvertTo-Json)
    Write-Host "✅ Expense created successfully!" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 3 | Write-Host
} catch {
    Write-Host "❌ Failed to create expense: $($_.Exception.Message)" -ForegroundColor Red
    
    # Try to get more error details
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error response body: $responseBody" -ForegroundColor Red
    }
}

Write-Host "`n=== DEBUG COMPLETE ===" -ForegroundColor Green 