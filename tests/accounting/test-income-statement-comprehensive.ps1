# Comprehensive Income Statement API Test Script
# This script tests all income statement endpoints with detailed reporting

$baseUrl = "http://localhost:3000"
$token = ""

# Function to get auth token
function Get-AuthToken {
    $loginData = @{
        email = "admin@example.com"
        password = "admin123"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $loginData -ContentType "application/json"
    return $response.data.token
}

# Function to test basic income statement generation
function Test-IncomeStatementGeneration {
    Write-Host "Testing Income Statement Generation..." -ForegroundColor Green
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $incomeData = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/generate" -Method POST -Body $incomeData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Income Statement Generation Test PASSED" -ForegroundColor Green
        Write-Host "Revenue Total: $($response.data.revenue.total)" -ForegroundColor Yellow
        Write-Host "Expense Total: $($response.data.expenses.total)" -ForegroundColor Yellow
        Write-Host "Net Income: $($response.data.netIncome)" -ForegroundColor Yellow
        Write-Host "Revenue Accounts: $($response.data.revenue.accounts.Count)" -ForegroundColor Cyan
        Write-Host "Expense Accounts: $($response.data.expenses.accounts.Count)" -ForegroundColor Cyan
        
        return $response
    }
    catch {
        Write-Host "❌ Income Statement Generation Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test detailed income statement
function Test-DetailedIncomeStatement {
    Write-Host "`nTesting Detailed Income Statement..." -ForegroundColor Green
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $incomeData = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/detailed" -Method POST -Body $incomeData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Detailed Income Statement Test PASSED" -ForegroundColor Green
        Write-Host "Revenue Accounts: $($response.data.revenue.accounts.Count)" -ForegroundColor Yellow
        Write-Host "Expense Accounts: $($response.data.expenses.accounts.Count)" -ForegroundColor Yellow
        Write-Host "Net Income: $($response.data.netIncome)" -ForegroundColor Yellow
        
        return $response
    }
    catch {
        Write-Host "❌ Detailed Income Statement Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test income statement summary
function Test-IncomeStatementSummary {
    Write-Host "`nTesting Income Statement Summary..." -ForegroundColor Green
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $incomeData = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/summary" -Method POST -Body $incomeData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Income Statement Summary Test PASSED" -ForegroundColor Green
        Write-Host "Revenue Total: $($response.data.revenue.total)" -ForegroundColor Yellow
        Write-Host "Expense Total: $($response.data.expenses.total)" -ForegroundColor Yellow
        Write-Host "Net Income: $($response.data.netIncome)" -ForegroundColor Yellow
        
        return $response
    }
    catch {
        Write-Host "❌ Income Statement Summary Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test comprehensive income statement
function Test-ComprehensiveIncomeStatement {
    Write-Host "`nTesting Comprehensive Income Statement..." -ForegroundColor Green
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $incomeData = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/comprehensive" -Method POST -Body $incomeData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Comprehensive Income Statement Test PASSED" -ForegroundColor Green
        Write-Host "Total Journal Entries: $($response.data.statistics.totalJournalEntries)" -ForegroundColor Yellow
        Write-Host "Total Transactions: $($response.data.statistics.totalTransactions)" -ForegroundColor Yellow
        Write-Host "Revenue Accounts: $($response.data.statistics.revenueAccounts)" -ForegroundColor Yellow
        Write-Host "Expense Accounts: $($response.data.statistics.expenseAccounts)" -ForegroundColor Yellow
        
        return $response
    }
    catch {
        Write-Host "❌ Comprehensive Income Statement Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test comparative income statement
function Test-ComparativeIncomeStatement {
    Write-Host "`nTesting Comparative Income Statement..." -ForegroundColor Green
    
    $periods = @(
        @{
            startDate = (Get-Date).AddDays(-60).ToString("yyyy-MM-dd")
            endDate = (Get-Date).AddDays(-31).ToString("yyyy-MM-dd")
        },
        @{
            startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
            endDate = (Get-Date).ToString("yyyy-MM-dd")
        }
    )
    
    $incomeData = @{
        periods = $periods
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/comparative" -Method POST -Body $incomeData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Comparative Income Statement Test PASSED" -ForegroundColor Green
        Write-Host "Number of Periods: $($response.data.periods.Count)" -ForegroundColor Yellow
        
        foreach ($period in $response.data.periods) {
            Write-Host "Period: $($period.period.startDate) to $($period.period.endDate)" -ForegroundColor Cyan
            Write-Host "  Net Income: $($period.netIncome)" -ForegroundColor White
        }
        
        return $response
    }
    catch {
        Write-Host "❌ Comparative Income Statement Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test vertical income statement
function Test-VerticalIncomeStatement {
    Write-Host "`nTesting Vertical Income Statement..." -ForegroundColor Green
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $incomeData = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/vertical" -Method POST -Body $incomeData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Vertical Income Statement Test PASSED" -ForegroundColor Green
        Write-Host "Revenue Percentage: $($response.data.revenue.percentage)%" -ForegroundColor Yellow
        Write-Host "Expense Percentage: $($response.data.expenses.percentage)%" -ForegroundColor Yellow
        Write-Host "Net Income Percentage: $($response.data.netIncomePercentage)%" -ForegroundColor Yellow
        
        return $response
    }
    catch {
        Write-Host "❌ Vertical Income Statement Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test GET endpoint
function Test-IncomeStatementGet {
    Write-Host "`nTesting Income Statement GET Endpoint..." -ForegroundColor Green
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement?startDate=$startDate&endDate=$endDate&type=summary" -Method GET -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Income Statement GET Test PASSED" -ForegroundColor Green
        Write-Host "Net Income: $($response.data.netIncome)" -ForegroundColor Yellow
        
        return $response
    }
    catch {
        Write-Host "❌ Income Statement GET Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test different periods
function Test-MultiplePeriods {
    Write-Host "`nTesting Multiple Periods..." -ForegroundColor Green
    
    $periods = @(
        @{ name = "Current Month"; startDate = (Get-Date -Day 1).ToString("yyyy-MM-dd"); endDate = (Get-Date).ToString("yyyy-MM-dd") },
        @{ name = "Previous Month"; startDate = (Get-Date -Day 1).AddMonths(-1).ToString("yyyy-MM-dd"); endDate = (Get-Date -Day 1).AddDays(-1).ToString("yyyy-MM-dd") },
        @{ name = "Last 7 Days"; startDate = (Get-Date).AddDays(-7).ToString("yyyy-MM-dd"); endDate = (Get-Date).ToString("yyyy-MM-dd") }
    )
    
    $results = @()
    
    foreach ($period in $periods) {
        Write-Host "Testing $($period.name)..." -ForegroundColor Cyan
        
        $incomeData = @{
            startDate = $period.startDate
            endDate = $period.endDate
        } | ConvertTo-Json

        try {
            $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/generate" -Method POST -Body $incomeData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
            
            Write-Host "✅ $($period.name) Test PASSED" -ForegroundColor Green
            Write-Host "  Net Income: $($response.data.netIncome)" -ForegroundColor White
            
            $results += @{ period = $period.name; success = $true; netIncome = $response.data.netIncome }
        }
        catch {
            Write-Host "❌ $($period.name) Test FAILED" -ForegroundColor Red
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
            
            $results += @{ period = $period.name; success = $false; error = $_.Exception.Message }
        }
    }
    
    return $results
}

# Main execution
Write-Host "🚀 Starting Comprehensive Income Statement Tests..." -ForegroundColor Blue
Write-Host "=================================================" -ForegroundColor Blue

# Get authentication token
Write-Host "Getting authentication token..." -ForegroundColor Yellow
$token = Get-AuthToken
if (-not $token) {
    Write-Host "❌ Failed to get authentication token. Exiting." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Authentication successful" -ForegroundColor Green

# Run all tests
$results = @()

$results += Test-IncomeStatementGeneration
$results += Test-DetailedIncomeStatement
$results += Test-IncomeStatementSummary
$results += Test-ComprehensiveIncomeStatement
$results += Test-ComparativeIncomeStatement
$results += Test-VerticalIncomeStatement
$results += Test-IncomeStatementGet

# Test multiple periods
$periodResults = Test-MultiplePeriods

# Summary
Write-Host "`n📊 Test Summary:" -ForegroundColor Blue
Write-Host "===============" -ForegroundColor Blue

$passedTests = ($results | Where-Object { $_ -ne $null }).Count
$totalTests = $results.Count

Write-Host "Total Tests: $totalTests" -ForegroundColor White
Write-Host "Passed: $passedTests" -ForegroundColor Green
Write-Host "Failed: $($totalTests - $passedTests)" -ForegroundColor Red

Write-Host "`n📈 Period Test Results:" -ForegroundColor Blue
Write-Host "=====================" -ForegroundColor Blue

$passedPeriods = ($periodResults | Where-Object { $_.success }).Count
$totalPeriods = $periodResults.Count

Write-Host "Period Tests: $totalPeriods" -ForegroundColor White
Write-Host "Passed: $passedPeriods" -ForegroundColor Green
Write-Host "Failed: $($totalPeriods - $passedPeriods)" -ForegroundColor Red

if ($passedTests -eq $totalTests -and $passedPeriods -eq $totalPeriods) {
    Write-Host "`n🎉 All Income Statement tests passed!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Some tests failed. Please check the errors above." -ForegroundColor Yellow
}

Write-Host "`n✨ Comprehensive Income Statement testing completed!" -ForegroundColor Blue 