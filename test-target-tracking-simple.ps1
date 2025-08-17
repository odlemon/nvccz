# Simple Target Tracking Test
$baseUrl = "http://localhost:3000"

Write-Host "=== SIMPLE TARGET TRACKING TEST ===" -ForegroundColor Green

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

# 2. Test getting actual data
Write-Host "`n2. Testing get actual data..." -ForegroundColor Yellow
try {
    $actualData = Invoke-RestMethod -Uri "$baseUrl/api/target-tracking/actual-data" -Method GET -Headers $headers
    Write-Host "✅ Actual data retrieved successfully!" -ForegroundColor Green
    Write-Host "Revenue: $($actualData.data.revenue.amount)" -ForegroundColor Cyan
    Write-Host "Expenses: $($actualData.data.expenses.amount)" -ForegroundColor Cyan
    Write-Host "Profit: $($actualData.data.profit.amount)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get actual data: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $errorResponse = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($errorResponse)
        $errorBody = $reader.ReadToEnd()
        Write-Host "Error details: $errorBody" -ForegroundColor Red
    }
}

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Green
