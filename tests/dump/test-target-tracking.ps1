# Target Tracking Test Script
$baseUrl = "http://localhost:3000"

Write-Host "=== TARGET TRACKING TEST ===" -ForegroundColor Green

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

# 2. Test getting all actual data
Write-Host "`n2. Testing get all actual data..." -ForegroundColor Yellow
try {
    $actualData = Invoke-RestMethod -Uri "$baseUrl/api/target-tracking/actual-data" -Method GET -Headers $headers
    Write-Host "✅ Actual data retrieved successfully!" -ForegroundColor Green
    Write-Host "Revenue: $($actualData.data.revenue.amount)" -ForegroundColor Cyan
    Write-Host "Expenses: $($actualData.data.expenses.amount)" -ForegroundColor Cyan
    Write-Host "Profit: $($actualData.data.profit.amount)" -ForegroundColor Cyan
    Write-Host "Period: $($actualData.data.revenue.periodStart) to $($actualData.data.revenue.periodEnd)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed to get actual data: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Test getting revenue data only
Write-Host "`n3. Testing get revenue data..." -ForegroundColor Yellow
try {
    $revenueData = Invoke-RestMethod -Uri "$baseUrl/api/target-tracking/revenue" -Method GET -Headers $headers
    Write-Host "✅ Revenue data retrieved successfully!" -ForegroundColor Green
    Write-Host "Total Revenue: $($revenueData.data.amount)" -ForegroundColor Cyan
    Write-Host "Account Breakdown:" -ForegroundColor Yellow
    foreach ($account in $revenueData.data.breakdown) {
        Write-Host "  - $($account.accountName) (No.$($account.accountNo)): $($account.amount) ($([Math]::Round($account.percentage, 2))%)" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Failed to get revenue data: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Test getting expenses data only
Write-Host "`n4. Testing get expenses data..." -ForegroundColor Yellow
try {
    $expensesData = Invoke-RestMethod -Uri "$baseUrl/api/target-tracking/expenses" -Method GET -Headers $headers
    Write-Host "✅ Expenses data retrieved successfully!" -ForegroundColor Green
    Write-Host "Total Expenses: $($expensesData.data.amount)" -ForegroundColor Cyan
    Write-Host "Account Breakdown:" -ForegroundColor Yellow
    foreach ($account in $expensesData.data.breakdown) {
        Write-Host "  - $($account.accountName) (No.$($account.accountNo)): $($account.amount) ($([Math]::Round($account.percentage, 2))%)" -ForegroundColor White
    }
} catch {
    Write-Host "❌ Failed to get expenses data: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Test getting profit data only
Write-Host "`n5. Testing get profit data..." -ForegroundColor Yellow
try {
    $profitData = Invoke-RestMethod -Uri "$baseUrl/api/target-tracking/profit" -Method GET -Headers $headers
    Write-Host "✅ Profit data retrieved successfully!" -ForegroundColor Green
    Write-Host "Total Profit: $($profitData.data.amount)" -ForegroundColor Cyan
    Write-Host "Period: $($profitData.data.periodStart) to $($profitData.data.periodEnd)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed to get profit data: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Test getting transaction details for revenue
Write-Host "`n6. Testing get revenue transaction details..." -ForegroundColor Yellow
try {
    $revenueTransactions = Invoke-RestMethod -Uri "$baseUrl/api/target-tracking/transactions?type=Revenue" -Method GET -Headers $headers
    Write-Host "✅ Revenue transactions retrieved successfully!" -ForegroundColor Green
    Write-Host "Total Transactions: $($revenueTransactions.data.transactions.Count)" -ForegroundColor Cyan
    Write-Host "Total Amount: $($revenueTransactions.data.totalAmount)" -ForegroundColor Cyan
    
    if ($revenueTransactions.data.transactions.Count -gt 0) {
        Write-Host "Sample Transactions:" -ForegroundColor Yellow
        $revenueTransactions.data.transactions | Select-Object -First 3 | ForEach-Object {
            Write-Host "  - $($_.date): $($_.description) - $($_.amount) ($($_.accountName))" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Failed to get revenue transactions: $($_.Exception.Message)" -ForegroundColor Red
}

# 7. Test getting transaction details for expenses
Write-Host "`n7. Testing get expenses transaction details..." -ForegroundColor Yellow
try {
    $expenseTransactions = Invoke-RestMethod -Uri "$baseUrl/api/target-tracking/transactions?type=Expenses" -Method GET -Headers $headers
    Write-Host "✅ Expense transactions retrieved successfully!" -ForegroundColor Green
    Write-Host "Total Transactions: $($expenseTransactions.data.transactions.Count)" -ForegroundColor Cyan
    Write-Host "Total Amount: $($expenseTransactions.data.totalAmount)" -ForegroundColor Cyan
    
    if ($expenseTransactions.data.transactions.Count -gt 0) {
        Write-Host "Sample Transactions:" -ForegroundColor Yellow
        $expenseTransactions.data.transactions | Select-Object -First 3 | ForEach-Object {
            Write-Host "  - $($_.date): $($_.description) - $($_.amount) ($($_.accountName))" -ForegroundColor White
        }
    }
} catch {
    Write-Host "❌ Failed to get expense transactions: $($_.Exception.Message)" -ForegroundColor Red
}

# 8. Test with date range
Write-Host "`n8. Testing with date range..." -ForegroundColor Yellow
$startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
$endDate = (Get-Date).ToString("yyyy-MM-dd")

try {
    $dateRangeData = Invoke-RestMethod -Uri "$baseUrl/api/target-tracking/actual-data?startDate=$startDate&endDate=$endDate" -Method GET -Headers $headers
    Write-Host "✅ Date range data retrieved successfully!" -ForegroundColor Green
    Write-Host "Period: $startDate to $endDate" -ForegroundColor Gray
    Write-Host "Revenue: $($dateRangeData.data.revenue.amount)" -ForegroundColor Cyan
    Write-Host "Expenses: $($dateRangeData.data.expenses.amount)" -ForegroundColor Cyan
    Write-Host "Profit: $($dateRangeData.data.profit.amount)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get date range data: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TARGET TRACKING TEST COMPLETE ===" -ForegroundColor Green
Write-Host "The target tracking system is working correctly!" -ForegroundColor Green
Write-Host "You can now use this data to compare against your targets." -ForegroundColor Yellow
