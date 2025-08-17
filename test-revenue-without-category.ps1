# Test Revenue Creation Without Category
$baseUrl = "http://localhost:3000"

Write-Host "=== TEST REVENUE WITHOUT CATEGORY ===" -ForegroundColor Green

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

# 2. Get currencies first
Write-Host "`n2. Getting currencies..." -ForegroundColor Yellow
try {
    $currencies = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers $headers
    $zwlCurrency = $currencies.data | Where-Object { $_.code -eq "ZWL" } | Select-Object -First 1
    $usdCurrency = $currencies.data | Where-Object { $_.code -eq "USD" } | Select-Object -First 1
    
    if (-not $zwlCurrency) {
        Write-Host "❌ ZWL currency not found" -ForegroundColor Red
        exit
    }
    Write-Host "✅ Found ZWL currency: $($zwlCurrency.id)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get currencies: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 3. Get revenue sources
Write-Host "`n3. Getting revenue sources..." -ForegroundColor Yellow
try {
    $sources = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-sources" -Method GET -Headers $headers
    $source = $sources.data | Select-Object -First 1
    
    if (-not $source) {
        Write-Host "❌ No revenue sources found" -ForegroundColor Red
        exit
    }
    Write-Host "✅ Found revenue source: $($source.id)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get revenue sources: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 4. Test creating revenue WITHOUT categoryId
Write-Host "`n4. Testing revenue creation WITHOUT categoryId..." -ForegroundColor Yellow
try {
    $revenueData = @{
        sourceId = $source.id
        amount = 1000.00
        currencyId = $zwlCurrency.id
        transactionDate = "2024-01-15"
        description = "Test revenue without category"
        isTaxable = $false
        paymentMethod = "BANK"
    }
    
    $revenue = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method POST -Headers $headers -Body ($revenueData | ConvertTo-Json)
    Write-Host "✅ Revenue created successfully WITHOUT categoryId!" -ForegroundColor Green
    Write-Host "Revenue ID: $($revenue.data.id)" -ForegroundColor Cyan
    Write-Host "Amount: $($revenue.data.amount)" -ForegroundColor Cyan
    Write-Host "CategoryId: $($revenue.data.categoryId)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create revenue without categoryId: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $errorResponse = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($errorResponse)
        $errorBody = $reader.ReadToEnd()
        Write-Host "Error details: $errorBody" -ForegroundColor Red
    }
}

# 5. Test creating revenue WITH categoryId (if categories exist)
Write-Host "`n5. Testing revenue creation WITH categoryId..." -ForegroundColor Yellow
try {
    $categories = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-categories" -Method GET -Headers $headers
    $category = $categories.data | Select-Object -First 1
    
    if ($category) {
        $revenueDataWithCategory = @{
            sourceId = $source.id
            categoryId = $category.id
            amount = 1500.00
            currencyId = $zwlCurrency.id
            transactionDate = "2024-01-15"
            description = "Test revenue with category"
            isTaxable = $true
            paymentMethod = "BANK"
        }
        
        $revenueWithCategory = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method POST -Headers $headers -Body ($revenueDataWithCategory | ConvertTo-Json)
        Write-Host "✅ Revenue created successfully WITH categoryId!" -ForegroundColor Green
        Write-Host "Revenue ID: $($revenueWithCategory.data.id)" -ForegroundColor Cyan
        Write-Host "Amount: $($revenueWithCategory.data.amount)" -ForegroundColor Cyan
        Write-Host "CategoryId: $($revenueWithCategory.data.categoryId)" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️ No revenue categories found, skipping test with categoryId" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to create revenue with categoryId: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Green
