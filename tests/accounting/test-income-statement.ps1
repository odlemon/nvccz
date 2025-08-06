# Test Income Statement API Endpoints
# This script tests the income statement functionality

$baseUrl = "http://localhost:3000/api"
$token = ""

# Function to get auth token
function Get-AuthToken {
    $loginData = @{
        email = "admin@example.com"
        password = "admin123"
    } | ConvertTo-Json

    $response = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body $loginData -ContentType "application/json"
    return $response.data.token
}

# Function to test income statement generation
function Test-IncomeStatement {
    param($token, $startDate, $endDate)
    
    $body = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    try {
        $headers = @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        }

        Write-Host "Testing Income Statement Generation..." -ForegroundColor Yellow
        Write-Host "Period: $startDate to $endDate" -ForegroundColor Cyan

        # Test basic income statement generation
        $response = Invoke-RestMethod -Uri "$baseUrl/accounting/income-statement/generate" -Method POST -Body $body -Headers $headers
        Write-Host "✅ Income Statement Generated Successfully" -ForegroundColor Green
        Write-Host "Revenue Total: $($response.data.revenue.total)" -ForegroundColor Green
        Write-Host "Expense Total: $($response.data.expenses.total)" -ForegroundColor Green
        Write-Host "Net Income: $($response.data.netIncome)" -ForegroundColor Green
        Write-Host "Revenue Accounts: $($response.data.revenue.accounts.Count)" -ForegroundColor Cyan
        Write-Host "Expense Accounts: $($response.data.expenses.accounts.Count)" -ForegroundColor Cyan

        # Test detailed income statement
        $detailedResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/income-statement/detailed" -Method POST -Body $body -Headers $headers
        Write-Host "✅ Detailed Income Statement Retrieved Successfully" -ForegroundColor Green

        # Test summary income statement
        $summaryResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/income-statement/summary" -Method POST -Body $body -Headers $headers
        Write-Host "✅ Income Statement Summary Retrieved Successfully" -ForegroundColor Green

        # Test GET endpoint with query parameters
        $queryParams = "startDate=$startDate&endDate=$endDate&type=summary"
        $getResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/income-statement?$queryParams" -Method GET -Headers $headers
        Write-Host "✅ GET Income Statement Retrieved Successfully" -ForegroundColor Green

        return $true
    }
    catch {
        Write-Host "❌ Error testing income statement: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response: $responseBody" -ForegroundColor Red
        }
        return $false
    }
}

# Function to test comparative income statement
function Test-ComparativeIncomeStatement {
    param($token)
    
    $body = @{
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
    } | ConvertTo-Json

    try {
        $headers = @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        }

        Write-Host "Testing Comparative Income Statement..." -ForegroundColor Yellow
        $response = Invoke-RestMethod -Uri "$baseUrl/accounting/income-statement/comparative" -Method POST -Body $body -Headers $headers
        Write-Host "✅ Comparative Income Statement Retrieved Successfully" -ForegroundColor Green
        Write-Host "Periods compared: $($response.data.periods.Count)" -ForegroundColor Cyan

        return $true
    }
    catch {
        Write-Host "❌ Error testing comparative income statement: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response: $responseBody" -ForegroundColor Red
        }
        return $false
    }
}

# Main test execution
try {
    Write-Host "🚀 Starting Income Statement API Tests" -ForegroundColor Green
    Write-Host "=====================================" -ForegroundColor Green

    # Get authentication token
    Write-Host "Getting authentication token..." -ForegroundColor Yellow
    $token = Get-AuthToken
    if (-not $token) {
        Write-Host "❌ Failed to get authentication token" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Authentication successful" -ForegroundColor Green

    # Test current month
    $currentDate = Get-Date
    $startDate = (Get-Date -Year $currentDate.Year -Month $currentDate.Month -Day 1).ToString("yyyy-MM-dd")
    $endDate = $currentDate.ToString("yyyy-MM-dd")

    $success1 = Test-IncomeStatement -token $token -startDate $startDate -endDate $endDate

    # Test previous month
    $previousMonth = $currentDate.AddMonths(-1)
    $prevStartDate = (Get-Date -Year $previousMonth.Year -Month $previousMonth.Month -Day 1).ToString("yyyy-MM-dd")
    $prevEndDate = (Get-Date -Year $previousMonth.Year -Month $previousMonth.Month -Day ([DateTime]::DaysInMonth($previousMonth.Year, $previousMonth.Month))).ToString("yyyy-MM-dd")

    $success2 = Test-IncomeStatement -token $token -startDate $prevStartDate -endDate $prevEndDate

    # Test comparative income statement
    $success3 = Test-ComparativeIncomeStatement -token $token

    # Summary
    Write-Host "`n📊 Test Summary:" -ForegroundColor Green
    Write-Host "===============" -ForegroundColor Green
    Write-Host "Current Month Test: $(if ($success1) { '✅ PASSED' } else { '❌ FAILED' })" -ForegroundColor $(if ($success1) { 'Green' } else { 'Red' })
    Write-Host "Previous Month Test: $(if ($success2) { '✅ PASSED' } else { '❌ FAILED' })" -ForegroundColor $(if ($success2) { 'Green' } else { 'Red' })
    Write-Host "Comparative Test: $(if ($success3) { '✅ PASSED' } else { '❌ FAILED' })" -ForegroundColor $(if ($success3) { 'Green' } else { 'Red' })

    if ($success1 -and $success2 -and $success3) {
        Write-Host "`n🎉 All Income Statement tests passed!" -ForegroundColor Green
    } else {
        Write-Host "`n⚠️ Some tests failed. Check the output above for details." -ForegroundColor Yellow
    }
}
catch {
    Write-Host "❌ Test execution failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} 