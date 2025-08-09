# Debug Authentication Test
$baseUrl = "http://localhost:3000"

Write-Host "=== DEBUG AUTHENTICATION TEST ===" -ForegroundColor Green

# 1. Login
Write-Host "`n1. Testing login..." -ForegroundColor Yellow
try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    
    Write-Host "Login response:" -ForegroundColor Cyan
    Write-Host ($loginResponse | ConvertTo-Json -Depth 3) -ForegroundColor White
    
    if ($loginResponse.success) {
        $token = $loginResponse.data.token
        Write-Host "`nToken extracted: $($token.Substring(0, 50))..." -ForegroundColor Green
        
        $headers = @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        }
        
        # 2. Test a simple endpoint first
        Write-Host "`n2. Testing currencies endpoint..." -ForegroundColor Yellow
        try {
            $currenciesResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers $headers
            Write-Host "Currencies endpoint working!" -ForegroundColor Green
            Write-Host "Response: $($currenciesResponse.success)" -ForegroundColor Cyan
        } catch {
            Write-Host "Currencies endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        # 3. Test bank reconciliation summary
        Write-Host "`n3. Testing bank reconciliation summary..." -ForegroundColor Yellow
        try {
            $summaryResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/summary" -Method GET -Headers $headers
            Write-Host "Summary endpoint working!" -ForegroundColor Green
            Write-Host "Response: $($summaryResponse.success)" -ForegroundColor Cyan
        } catch {
            Write-Host "Summary endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
        }
        
    } else {
        Write-Host "Login failed: $($loginResponse.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "Login failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== DEBUG TEST COMPLETED ===" -ForegroundColor Green 