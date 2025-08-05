# Add Missing Chart of Accounts
$baseUrl = "http://localhost:3000"

Write-Host "Adding missing chart of accounts..." -ForegroundColor Green

# Login
Write-Host "1. Logging in..." -ForegroundColor Yellow
$login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
$token = $login.token
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}
Write-Host "Login successful" -ForegroundColor Green

# Add Bank Account
Write-Host "2. Adding Bank Account..." -ForegroundColor Yellow
$bankData = @{
    accountNo = "1015"
    accountName = "Bank Account"
    accountType = "Current Asset"
    financialStatement = "Balance Sheet"
    notes = "Bank account balances"
    isActive = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts" -Method POST -Headers $headers -Body $bankData
    Write-Host "Bank Account added successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to add Bank Account: $($_.Exception.Message)" -ForegroundColor Red
}

# Add Credit Card Receivable Account
Write-Host "3. Adding Credit Card Receivable Account..." -ForegroundColor Yellow
$creditCardData = @{
    accountNo = "1020"
    accountName = "Credit Card Receivable"
    accountType = "Current Asset"
    financialStatement = "Balance Sheet"
    notes = "Credit card payments receivable"
    isActive = $true
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts" -Method POST -Headers $headers -Body $creditCardData
    Write-Host "Credit Card Receivable Account added successfully" -ForegroundColor Green
} catch {
    Write-Host "Failed to add Credit Card Receivable Account: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Chart of accounts setup completed!" -ForegroundColor Green 