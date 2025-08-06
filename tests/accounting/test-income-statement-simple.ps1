# Simple Income Statement Test
$baseUrl = "http://localhost:3000"

Write-Host "=== INCOME STATEMENT TEST ===" -ForegroundColor Green

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

# 2. Test basic income statement generation
Write-Host "`n2. Testing income statement generation..." -ForegroundColor Yellow

$currentDate = Get-Date
$startDate = (Get-Date -Year $currentDate.Year -Month $currentDate.Month -Day 1).ToString("yyyy-MM-dd")
$endDate = $currentDate.ToString("yyyy-MM-dd")

$incomeStatementPayload = @{
    startDate = $startDate
    endDate = $endDate
}

Write-Host "Period: $startDate to $endDate" -ForegroundColor Cyan
Write-Host "Payload:" -ForegroundColor Yellow
$incomeStatementPayload | ConvertTo-Json | Write-Host

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/generate" -Method POST -Headers $headers -Body ($incomeStatementPayload | ConvertTo-Json)
    Write-Host "✅ Income Statement generated successfully!" -ForegroundColor Green
    Write-Host "Revenue Total: $($response.data.revenue.total)" -ForegroundColor Cyan
    Write-Host "Expense Total: $($response.data.expenses.total)" -ForegroundColor Cyan
    Write-Host "Net Income: $($response.data.netIncome)" -ForegroundColor Cyan
    Write-Host "Revenue Accounts: $($response.data.revenue.accounts.Count)" -ForegroundColor Cyan
    Write-Host "Expense Accounts: $($response.data.expenses.accounts.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to generate income statement: $($_.Exception.Message)" -ForegroundColor Red
    
    # Get detailed error
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

# 3. Test detailed income statement
Write-Host "`n3. Testing detailed income statement..." -ForegroundColor Yellow

try {
    $detailedResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/detailed" -Method POST -Headers $headers -Body ($incomeStatementPayload | ConvertTo-Json)
    Write-Host "✅ Detailed income statement retrieved successfully!" -ForegroundColor Green
    Write-Host "Revenue Accounts with transactions: $($detailedResponse.data.revenue.accounts.Count)" -ForegroundColor Cyan
    Write-Host "Expense Accounts with transactions: $($detailedResponse.data.expenses.accounts.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get detailed income statement: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Test summary income statement
Write-Host "`n4. Testing summary income statement..." -ForegroundColor Yellow

try {
    $summaryResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/summary" -Method POST -Headers $headers -Body ($incomeStatementPayload | ConvertTo-Json)
    Write-Host "✅ Summary income statement retrieved successfully!" -ForegroundColor Green
    Write-Host "Revenue Total: $($summaryResponse.data.revenue.total)" -ForegroundColor Cyan
    Write-Host "Expense Total: $($summaryResponse.data.expenses.total)" -ForegroundColor Cyan
    Write-Host "Net Income: $($summaryResponse.data.netIncome)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get summary income statement: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Test GET endpoint with query parameters
Write-Host "`n5. Testing GET endpoint with query parameters..." -ForegroundColor Yellow

$queryParams = "startDate=$startDate&endDate=$endDate&type=summary"
try {
    $getResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement?$queryParams" -Method GET -Headers $headers
    Write-Host "✅ GET income statement retrieved successfully!" -ForegroundColor Green
    Write-Host "Revenue Total: $($getResponse.data.revenue.total)" -ForegroundColor Cyan
    Write-Host "Expense Total: $($getResponse.data.expenses.total)" -ForegroundColor Cyan
    Write-Host "Net Income: $($getResponse.data.netIncome)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get income statement via GET: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Test comparative income statement
Write-Host "`n6. Testing comparative income statement..." -ForegroundColor Yellow

$comparativePayload = @{
    periods = @(
        @{
            startDate = "2024-01-01"
            endDate = "2024-01-31"
        },
        @{
            startDate = "2024-02-01"
            endDate = "2024-02-29"
        }
    )
}

try {
    $comparativeResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/comparative" -Method POST -Headers $headers -Body ($comparativePayload | ConvertTo-Json)
    Write-Host "✅ Comparative income statement retrieved successfully!" -ForegroundColor Green
    Write-Host "Periods compared: $($comparativeResponse.data.periods.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get comparative income statement: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== INCOME STATEMENT TEST COMPLETE ===" -ForegroundColor Green 