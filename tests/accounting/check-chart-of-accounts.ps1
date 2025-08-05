# Check Chart of Accounts
$baseUrl = "http://localhost:3000"

Write-Host "=== CHECKING CHART OF ACCOUNTS ===" -ForegroundColor Green

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

# 2. Get all Chart of Accounts
Write-Host "`n2. Getting all Chart of Accounts..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($response.data.Count) Chart of Accounts entries" -ForegroundColor Green
    
    Write-Host "`nChart of Accounts:" -ForegroundColor Cyan
    foreach ($account in $response.data) {
        Write-Host "   - $($account.accountNo): $($account.accountName) ($($account.accountType))" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Failed to get Chart of Accounts: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Check for specific account types needed for expenses
Write-Host "`n3. Checking for expense-related accounts..." -ForegroundColor Yellow

# Check for Expense accounts
try {
    $expenseAccounts = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts?accountType=Expense" -Method GET -Headers $headers
    Write-Host "✅ Found $($expenseAccounts.data.Count) Expense accounts" -ForegroundColor Green
    foreach ($account in $expenseAccounts.data) {
        Write-Host "   - $($account.accountNo): $($account.accountName)" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Failed to get Expense accounts: $($_.Exception.Message)" -ForegroundColor Red
}

# Check for Current Asset accounts (for Bank/Cash)
try {
    $assetAccounts = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts?accountType=Current Asset" -Method GET -Headers $headers
    Write-Host "✅ Found $($assetAccounts.data.Count) Current Asset accounts" -ForegroundColor Green
    foreach ($account in $assetAccounts.data) {
        Write-Host "   - $($account.accountNo): $($account.accountName)" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Failed to get Current Asset accounts: $($_.Exception.Message)" -ForegroundColor Red
}

# Check for Current Liability accounts (for VAT Input)
try {
    $liabilityAccounts = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts?accountType=Current Liability" -Method GET -Headers $headers
    Write-Host "✅ Found $($liabilityAccounts.data.Count) Current Liability accounts" -ForegroundColor Green
    foreach ($account in $liabilityAccounts.data) {
        Write-Host "   - $($account.accountNo): $($account.accountName)" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Failed to get Current Liability accounts: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== CHECK COMPLETE ===" -ForegroundColor Green 