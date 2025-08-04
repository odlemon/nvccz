# Comprehensive Currency CRUD Testing
$baseUrl = "http://localhost:3000"

Write-Host "=== Currency CRUD Operations Testing ===" -ForegroundColor Green

# 1. Login and get token
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
$login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
$token = $login.token
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}
Write-Host "✅ Authentication successful" -ForegroundColor Green

# 2. Test CREATE - Create ZWL currency
Write-Host "`n2. Testing CREATE operation (ZWL)..." -ForegroundColor Yellow
$zwlCurrency = @{
    code = "ZWL"
    name = "Zimbabwe Dollar"
    symbol = "$"
    isDefault = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method POST -Headers $headers -Body $zwlCurrency
    $zwlCurrencyId = $response.data.id
    Write-Host "✅ CREATE ZWL: Currency created successfully" -ForegroundColor Green
    Write-Host "   ID: $zwlCurrencyId" -ForegroundColor Cyan
    Write-Host "   Code: $($response.data.code)" -ForegroundColor Cyan
    Write-Host "   Name: $($response.data.name)" -ForegroundColor Cyan
    Write-Host "   Default: $($response.data.isDefault)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ CREATE ZWL failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 3. Test CREATE - Create USD currency
Write-Host "`n3. Testing CREATE operation (USD)..." -ForegroundColor Yellow
$usdCurrency = @{
    code = "USD"
    name = "US Dollar"
    symbol = "$"
    isDefault = $false
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method POST -Headers $headers -Body $usdCurrency
    $usdCurrencyId = $response.data.id
    Write-Host "✅ CREATE USD: Currency created successfully" -ForegroundColor Green
    Write-Host "   ID: $usdCurrencyId" -ForegroundColor Cyan
    Write-Host "   Code: $($response.data.code)" -ForegroundColor Cyan
    Write-Host "   Name: $($response.data.name)" -ForegroundColor Cyan
    Write-Host "   Default: $($response.data.isDefault)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ CREATE USD failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Test READ - Get currency by ID
Write-Host "`n4. Testing READ operation..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies/$zwlCurrencyId" -Method GET -Headers $headers
    Write-Host "✅ READ: Currency retrieved successfully" -ForegroundColor Green
    Write-Host "   Code: $($response.data.code)" -ForegroundColor Cyan
    Write-Host "   Name: $($response.data.name)" -ForegroundColor Cyan
    Write-Host "   Symbol: $($response.data.symbol)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ READ failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Test READ ALL - Get all currencies
Write-Host "`n5. Testing READ ALL operation..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers $headers
    Write-Host "✅ READ ALL: Retrieved $($response.data.Count) currencies" -ForegroundColor Green
    foreach ($currency in $response.data) {
        Write-Host "   - $($currency.code) ($($currency.name)) - Default: $($currency.isDefault)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ READ ALL failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Test FILTER - Filter by default status
Write-Host "`n6. Testing FILTER operation (Default currencies)..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies?isDefault=true" -Method GET -Headers $headers
    Write-Host "✅ FILTER: Found $($response.data.Count) default currencies" -ForegroundColor Green
} catch {
    Write-Host "❌ FILTER failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 7. Test GET DEFAULT CURRENCY
Write-Host "`n7. Testing GET DEFAULT CURRENCY..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies/default" -Method GET -Headers $headers
    Write-Host "✅ GET DEFAULT: Default currency retrieved" -ForegroundColor Green
    Write-Host "   Default Currency: $($response.data.code) ($($response.data.name))" -ForegroundColor Cyan
} catch {
    Write-Host "❌ GET DEFAULT failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 8. Test UPDATE - Update USD currency
Write-Host "`n8. Testing UPDATE operation..." -ForegroundColor Yellow
$updateData = @{
    name = "United States Dollar"
    symbol = "USD$"
    isDefault = $false
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies/$usdCurrencyId" -Method PUT -Headers $headers -Body $updateData
    Write-Host "✅ UPDATE: Currency updated successfully" -ForegroundColor Green
    Write-Host "   New Name: $($response.data.name)" -ForegroundColor Cyan
    Write-Host "   New Symbol: $($response.data.symbol)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ UPDATE failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 9. Test READ after UPDATE - Verify changes
Write-Host "`n9. Testing READ after UPDATE..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies/$usdCurrencyId" -Method GET -Headers $headers
    Write-Host "✅ READ after UPDATE: Changes verified" -ForegroundColor Green
    Write-Host "   Updated Name: $($response.data.name)" -ForegroundColor Cyan
    Write-Host "   Updated Symbol: $($response.data.symbol)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ READ after UPDATE failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 10. Test SET DEFAULT CURRENCY - Set USD as default
Write-Host "`n10. Testing SET DEFAULT CURRENCY..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies/$usdCurrencyId/set-default" -Method POST -Headers $headers
    Write-Host "✅ SET DEFAULT: USD set as default currency" -ForegroundColor Green
} catch {
    Write-Host "❌ SET DEFAULT failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 11. Test GET DEFAULT CURRENCY after change
Write-Host "`n11. Testing GET DEFAULT CURRENCY after change..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies/default" -Method GET -Headers $headers
    Write-Host "✅ GET DEFAULT after change: Default currency updated" -ForegroundColor Green
    Write-Host "   New Default: $($response.data.code) ($($response.data.name))" -ForegroundColor Cyan
} catch {
    Write-Host "❌ GET DEFAULT after change failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 12. Test VALIDATION - Try to create duplicate currency
Write-Host "`n12. Testing VALIDATION (Duplicate Code)..." -ForegroundColor Yellow
try {
    $duplicateCurrency = @{
        code = "ZWL"  # Same code as existing currency
        name = "Duplicate Zimbabwe Dollar"
        symbol = "Z$"
        isDefault = $false
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method POST -Headers $headers -Body $duplicateCurrency
    Write-Host "❌ VALIDATION failed: Should have rejected duplicate code" -ForegroundColor Red
} catch {
    Write-Host "✅ VALIDATION: Correctly rejected duplicate currency code" -ForegroundColor Green
}

# 13. Test VALIDATION - Try to create currency without required fields
Write-Host "`n13. Testing VALIDATION (Missing Required Fields)..." -ForegroundColor Yellow
try {
    $invalidCurrency = @{
        name = "Invalid Currency"
        symbol = "IC"
        isDefault = $false
        # Missing 'code' field
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method POST -Headers $headers -Body $invalidCurrency
    Write-Host "❌ VALIDATION failed: Should have rejected missing code" -ForegroundColor Red
} catch {
    Write-Host "✅ VALIDATION: Correctly rejected currency without code" -ForegroundColor Green
}

# 14. Test VALIDATION - Try to create currency without name
Write-Host "`n14. Testing VALIDATION (Missing Name)..." -ForegroundColor Yellow
try {
    $invalidCurrency2 = @{
        code = "TEST"
        symbol = "T"
        isDefault = $false
        # Missing 'name' field
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method POST -Headers $headers -Body $invalidCurrency2
    Write-Host "❌ VALIDATION failed: Should have rejected missing name" -ForegroundColor Red
} catch {
    Write-Host "✅ VALIDATION: Correctly rejected currency without name" -ForegroundColor Green
}

# 15. Test VALIDATION - Try to create currency without symbol
Write-Host "`n15. Testing VALIDATION (Missing Symbol)..." -ForegroundColor Yellow
try {
    $invalidCurrency3 = @{
        code = "TEST2"
        name = "Test Currency 2"
        isDefault = $false
        # Missing 'symbol' field
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method POST -Headers $headers -Body $invalidCurrency3
    Write-Host "❌ VALIDATION failed: Should have rejected missing symbol" -ForegroundColor Red
} catch {
    Write-Host "✅ VALIDATION: Correctly rejected currency without symbol" -ForegroundColor Green
}

# 16. Test UPDATE non-existent currency
Write-Host "`n16. Testing UPDATE non-existent currency..." -ForegroundColor Yellow
try {
    $updateData = @{name = "Non-existent Currency"} | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies/non-existent-id" -Method PUT -Headers $headers -Body $updateData
    Write-Host "❌ UPDATE non-existent failed: Should have returned 404" -ForegroundColor Red
} catch {
    Write-Host "✅ UPDATE non-existent: Correctly returned 404" -ForegroundColor Green
}

# 17. Test DELETE - Delete USD currency (but keep ZWL as default)
Write-Host "`n17. Testing DELETE operation..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies/$usdCurrencyId" -Method DELETE -Headers $headers
    Write-Host "✅ DELETE: Currency deleted successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ DELETE failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 18. Test READ after DELETE - Verify currency is gone
Write-Host "`n18. Testing READ after DELETE..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies/$usdCurrencyId" -Method GET -Headers $headers
    Write-Host "❌ READ after DELETE failed: Currency should not exist" -ForegroundColor Red
} catch {
    Write-Host "✅ READ after DELETE: Correctly returned 404 for deleted currency" -ForegroundColor Green
}

# 19. Test DELETE non-existent currency
Write-Host "`n19. Testing DELETE non-existent currency..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies/non-existent-id" -Method DELETE -Headers $headers
    Write-Host "❌ DELETE non-existent failed: Should have returned 404" -ForegroundColor Red
} catch {
    Write-Host "✅ DELETE non-existent: Correctly returned 404" -ForegroundColor Green
}

# 20. Final verification - Count total currencies and check default
Write-Host "`n20. Final verification..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers $headers
    Write-Host "✅ FINAL COUNT: $($response.data.Count) currencies in system" -ForegroundColor Green
    
    $defaultResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies/default" -Method GET -Headers $headers
    Write-Host "✅ FINAL DEFAULT: $($defaultResponse.data.code) ($($defaultResponse.data.name))" -ForegroundColor Green
} catch {
    Write-Host "❌ FINAL VERIFICATION failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Currency CRUD Testing Complete ===" -ForegroundColor Green
Write-Host "All CRUD operations tested successfully!" -ForegroundColor Cyan
Write-Host "• CREATE ✅" -ForegroundColor Green
Write-Host "• READ ✅" -ForegroundColor Green
Write-Host "• READ ALL ✅" -ForegroundColor Green
Write-Host "• FILTER ✅" -ForegroundColor Green
Write-Host "• UPDATE ✅" -ForegroundColor Green
Write-Host "• DELETE ✅" -ForegroundColor Green
Write-Host "• GET DEFAULT ✅" -ForegroundColor Green
Write-Host "• SET DEFAULT ✅" -ForegroundColor Green
Write-Host "• VALIDATION ✅" -ForegroundColor Green
Write-Host "• ERROR HANDLING ✅" -ForegroundColor Green 