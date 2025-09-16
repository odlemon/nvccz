# Add Currencies to Database
$baseUrl = "http://localhost:3000"

Write-Host "Adding currencies to database..." -ForegroundColor Green

# Login
Write-Host "1. Logging in..." -ForegroundColor Yellow
$login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
$token = $login.token
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}
Write-Host "Login successful" -ForegroundColor Green

# Add ZWL currency
Write-Host "2. Adding ZWL currency..." -ForegroundColor Yellow
$zwlData = @{
    code = "ZWL"
    name = "Zimbabwe Dollar"
    symbol = "$"
    isActive = $true
    isDefault = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method POST -Headers $headers -Body $zwlData
    Write-Host "ZWL currency added successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to add ZWL: $($_.Exception.Message)" -ForegroundColor Red
}

# Add USD currency
Write-Host "3. Adding USD currency..." -ForegroundColor Yellow
$usdData = @{
    code = "USD"
    name = "US Dollar"
    symbol = "$"
    isActive = $true
    isDefault = $false
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method POST -Headers $headers -Body $usdData
    Write-Host "USD currency added successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to add USD: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Currency setup completed!" -ForegroundColor Green 