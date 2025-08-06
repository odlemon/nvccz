# Test Cash Flow Statement Endpoints
# This script tests the cash flow statement functionality

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

# Function to test cash flow generation
function Test-CashFlowGeneration {
    Write-Host "Testing Cash Flow Statement Generation..." -ForegroundColor Green
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $cashFlowData = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/cash-flow/generate" -Method POST -Body $cashFlowData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Cash Flow Generation Test PASSED" -ForegroundColor Green
        Write-Host "Operating Activities: $($response.data.operatingActivities.total)" -ForegroundColor Yellow
        Write-Host "Investing Activities: $($response.data.investingActivities.total)" -ForegroundColor Yellow
        Write-Host "Financing Activities: $($response.data.financingActivities.total)" -ForegroundColor Yellow
        Write-Host "Net Cash Flow: $($response.data.netCashFlow)" -ForegroundColor Yellow
        Write-Host "Beginning Cash Balance: $($response.data.beginningCashBalance)" -ForegroundColor Yellow
        Write-Host "Ending Cash Balance: $($response.data.endingCashBalance)" -ForegroundColor Yellow
        
        return $response
    }
    catch {
        Write-Host "❌ Cash Flow Generation Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test cash flow summary
function Test-CashFlowSummary {
    Write-Host "`nTesting Cash Flow Statement Summary..." -ForegroundColor Green
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $cashFlowData = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/cash-flow/summary" -Method POST -Body $cashFlowData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Cash Flow Summary Test PASSED" -ForegroundColor Green
        Write-Host "Net Cash Flow: $($response.data.netCashFlow)" -ForegroundColor Yellow
        Write-Host "Operating Activities Total: $($response.data.operatingActivities.total)" -ForegroundColor Yellow
        Write-Host "Investing Activities Total: $($response.data.investingActivities.total)" -ForegroundColor Yellow
        Write-Host "Financing Activities Total: $($response.data.financingActivities.total)" -ForegroundColor Yellow
        
        return $response
    }
    catch {
        Write-Host "❌ Cash Flow Summary Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test detailed cash flow
function Test-DetailedCashFlow {
    Write-Host "`nTesting Detailed Cash Flow Statement..." -ForegroundColor Green
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $cashFlowData = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/cash-flow/detailed" -Method POST -Body $cashFlowData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Detailed Cash Flow Test PASSED" -ForegroundColor Green
        Write-Host "Operating Accounts: $($response.data.operatingActivities.accounts.Count)" -ForegroundColor Yellow
        Write-Host "Investing Accounts: $($response.data.investingActivities.accounts.Count)" -ForegroundColor Yellow
        Write-Host "Financing Accounts: $($response.data.financingActivities.accounts.Count)" -ForegroundColor Yellow
        
        return $response
    }
    catch {
        Write-Host "❌ Detailed Cash Flow Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test comprehensive cash flow
function Test-ComprehensiveCashFlow {
    Write-Host "`nTesting Comprehensive Cash Flow Statement..." -ForegroundColor Green
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $cashFlowData = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/cash-flow/comprehensive" -Method POST -Body $cashFlowData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Comprehensive Cash Flow Test PASSED" -ForegroundColor Green
        Write-Host "Total Journal Entries: $($response.data.statistics.totalJournalEntries)" -ForegroundColor Yellow
        Write-Host "Total Transactions: $($response.data.statistics.totalTransactions)" -ForegroundColor Yellow
        Write-Host "Operating Accounts: $($response.data.statistics.operatingAccounts)" -ForegroundColor Yellow
        Write-Host "Investing Accounts: $($response.data.statistics.investingAccounts)" -ForegroundColor Yellow
        Write-Host "Financing Accounts: $($response.data.statistics.financingAccounts)" -ForegroundColor Yellow
        
        return $response
    }
    catch {
        Write-Host "❌ Comprehensive Cash Flow Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test comparative cash flow
function Test-ComparativeCashFlow {
    Write-Host "`nTesting Comparative Cash Flow Statement..." -ForegroundColor Green
    
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
    
    $cashFlowData = @{
        periods = $periods
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/cash-flow/comparative" -Method POST -Body $cashFlowData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Comparative Cash Flow Test PASSED" -ForegroundColor Green
        Write-Host "Number of Periods: $($response.data.periods.Count)" -ForegroundColor Yellow
        
        foreach ($period in $response.data.periods) {
            Write-Host "Period: $($period.period.startDate) to $($period.period.endDate)" -ForegroundColor Cyan
            Write-Host "  Net Cash Flow: $($period.netCashFlow)" -ForegroundColor White
        }
        
        return $response
    }
    catch {
        Write-Host "❌ Comparative Cash Flow Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test GET endpoint
function Test-CashFlowGet {
    Write-Host "`nTesting Cash Flow GET Endpoint..." -ForegroundColor Green
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/cash-flow?startDate=$startDate&endDate=$endDate&type=summary" -Method GET -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Cash Flow GET Test PASSED" -ForegroundColor Green
        Write-Host "Net Cash Flow: $($response.data.netCashFlow)" -ForegroundColor Yellow
        
        return $response
    }
    catch {
        Write-Host "❌ Cash Flow GET Test FAILED" -ForegroundColor Red
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Main execution
Write-Host "🚀 Starting Cash Flow Statement Tests..." -ForegroundColor Blue
Write-Host "=========================================" -ForegroundColor Blue

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

$results += Test-CashFlowGeneration
$results += Test-CashFlowSummary
$results += Test-DetailedCashFlow
$results += Test-ComprehensiveCashFlow
$results += Test-ComparativeCashFlow
$results += Test-CashFlowGet

# Summary
Write-Host "`n📊 Test Summary:" -ForegroundColor Blue
Write-Host "===============" -ForegroundColor Blue

$passedTests = ($results | Where-Object { $_ -ne $null }).Count
$totalTests = $results.Count

Write-Host "Total Tests: $totalTests" -ForegroundColor White
Write-Host "Passed: $passedTests" -ForegroundColor Green
Write-Host "Failed: $($totalTests - $passedTests)" -ForegroundColor Red

if ($passedTests -eq $totalTests) {
    Write-Host "`n🎉 All Cash Flow tests passed!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Some tests failed. Please check the errors above." -ForegroundColor Yellow
}

Write-Host "`n✨ Cash Flow Statement testing completed!" -ForegroundColor Blue 