# Simple Revenue Test
$baseUrl = "http://localhost:3000"

Write-Host "=== SIMPLE REVENUE TEST ===" -ForegroundColor Green

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

# 2. Create Revenue Source
Write-Host "`n2. Creating Revenue Source..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$sourcePayload = @{
    name = "Service Sales $timestamp"
    description = "Revenue from service provision"
    isActive = $true
}

try {
    $sourceResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-sources" -Method POST -Headers $headers -Body ($sourcePayload | ConvertTo-Json)
    $sourceId = $sourceResponse.data.id
    Write-Host "✅ Revenue Source created successfully!" -ForegroundColor Green
    Write-Host "Source ID: $sourceId" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create revenue source: $($_.Exception.Message)" -ForegroundColor Red
    # Try to get existing source
    try {
        $sources = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-sources" -Method GET -Headers $headers
        $sourceId = $sources.data[0].id
        Write-Host "✅ Using existing revenue source: $($sources.data[0].name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Could not get existing revenue sources" -ForegroundColor Red
        exit
    }
}

# 3. Create Revenue Category
Write-Host "`n3. Creating Revenue Category..." -ForegroundColor Yellow
$categoryPayload = @{
    name = "Consulting Services $timestamp"
    description = "Revenue from consulting activities"
    isActive = $true
}

try {
    $categoryResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-categories" -Method POST -Headers $headers -Body ($categoryPayload | ConvertTo-Json)
    $categoryId = $categoryResponse.data.id
    Write-Host "✅ Revenue Category created successfully!" -ForegroundColor Green
    Write-Host "Category ID: $categoryId" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create revenue category: $($_.Exception.Message)" -ForegroundColor Red
    # Try to get existing category
    try {
        $categories = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-categories" -Method GET -Headers $headers
        $categoryId = $categories.data[0].id
        Write-Host "✅ Using existing revenue category: $($categories.data[0].name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Could not get existing revenue categories" -ForegroundColor Red
        exit
    }
}

# 4. Get test data
Write-Host "`n4. Getting test data..." -ForegroundColor Yellow

# Get active currency
$currencies = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers $headers
$activeCurrency = $currencies.data | Where-Object { $_.isActive -eq $true } | Select-Object -First 1

Write-Host "✅ Using currency: $($activeCurrency.code)" -ForegroundColor Green

# 5. Test revenue creation (Taxable)
Write-Host "`n5. Testing taxable revenue creation..." -ForegroundColor Yellow
$revenuePayload = @{
    sourceId = $sourceId
    categoryId = $categoryId
    amount = 1000.00
    currencyId = $activeCurrency.id
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    description = "Consulting services for Q1 2024"
    isTaxable = $true
    paymentMethod = "BANK"
}

Write-Host "Payload:" -ForegroundColor Yellow
$revenuePayload | ConvertTo-Json | Write-Host

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method POST -Headers $headers -Body ($revenuePayload | ConvertTo-Json)
    Write-Host "✅ Taxable Revenue created successfully!" -ForegroundColor Green
    Write-Host "Revenue ID: $($response.data.id)" -ForegroundColor Cyan
    Write-Host "Amount: $($response.data.amount)" -ForegroundColor Cyan
    Write-Host "VAT Amount: $($response.data.vatAmount)" -ForegroundColor Cyan
    Write-Host "Total: $($response.data.totalAmount)" -ForegroundColor Cyan
    Write-Host "Status: $($response.data.status)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create taxable revenue: $($_.Exception.Message)" -ForegroundColor Red
    
    # Get detailed error
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

# 6. Test revenue creation (Non-Taxable)
Write-Host "`n6. Testing non-taxable revenue creation..." -ForegroundColor Yellow
$revenuePayload2 = @{
    sourceId = $sourceId
    categoryId = $categoryId
    amount = 500.00
    currencyId = $activeCurrency.id
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    description = "Non-taxable service fee"
    isTaxable = $false
    paymentMethod = "CASH"
}

try {
    $response2 = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method POST -Headers $headers -Body ($revenuePayload2 | ConvertTo-Json)
    Write-Host "✅ Non-Taxable Revenue created successfully!" -ForegroundColor Green
    Write-Host "Revenue ID: $($response2.data.id)" -ForegroundColor Cyan
    Write-Host "Amount: $($response2.data.amount)" -ForegroundColor Cyan
    Write-Host "VAT Amount: $($response2.data.vatAmount)" -ForegroundColor Cyan
    Write-Host "Total: $($response2.data.totalAmount)" -ForegroundColor Cyan
    Write-Host "Status: $($response2.data.status)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create non-taxable revenue: $($_.Exception.Message)" -ForegroundColor Red
}

# 7. Test revenue retrieval
Write-Host "`n7. Testing revenue retrieval..." -ForegroundColor Yellow
try {
    $revenues = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($revenues.data.length) revenues" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to retrieve revenues: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== REVENUE TEST COMPLETE ===" -ForegroundColor Green 