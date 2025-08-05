# Test Chart of Accounts Endpoints
# Make sure to run this after logging in and getting a token

$baseUrl = "http://localhost:3000"
$token = "YOUR_TOKEN_HERE" # Replace with actual token after login

Write-Host "Testing Chart of Accounts Endpoints" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Green

# Test 1: Get all chart of accounts
Write-Host "`n1. Testing GET /api/accounting/chart-of-accounts" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts" -Method GET -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "✅ Success: Retrieved chart of accounts" -ForegroundColor Green
    Write-Host "   Count: $($response.data.Count)" -ForegroundColor Cyan
    if ($response.data.Count -gt 0) {
        Write-Host "   First account: $($response.data[0].accountName) ($($response.data[0].accountNo))" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Get chart of accounts by type (Current Asset)
Write-Host "`n2. Testing GET /api/accounting/chart-of-accounts?accountType=Current Asset" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts?accountType=Current Asset" -Method GET -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "✅ Success: Retrieved Current Asset accounts" -ForegroundColor Green
    Write-Host "   Count: $($response.data.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Get chart of accounts by type (Expense)
Write-Host "`n3. Testing GET /api/accounting/chart-of-accounts?accountType=Expense" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts?accountType=Expense" -Method GET -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "✅ Success: Retrieved Expense accounts" -ForegroundColor Green
    Write-Host "   Count: $($response.data.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Get chart of accounts by type (Current Liability)
Write-Host "`n4. Testing GET /api/accounting/chart-of-accounts?accountType=Current Liability" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts?accountType=Current Liability" -Method GET -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "✅ Success: Retrieved Current Liability accounts" -ForegroundColor Green
    Write-Host "   Count: $($response.data.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Get only active accounts
Write-Host "`n5. Testing GET /api/accounting/chart-of-accounts?isActive=true" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts?isActive=true" -Method GET -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "✅ Success: Retrieved active accounts" -ForegroundColor Green
    Write-Host "   Count: $($response.data.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Get top-level accounts (parentId=null)
Write-Host "`n6. Testing GET /api/accounting/chart-of-accounts?parentId=null" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts?parentId=null" -Method GET -Headers @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "✅ Success: Retrieved top-level accounts" -ForegroundColor Green
    Write-Host "   Count: $($response.data.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nChart of Accounts testing completed!" -ForegroundColor Green
Write-Host "Check the Swagger docs at: $baseUrl/api-docs" -ForegroundColor Cyan 