# Master Financial Statements Test Script
# This script tests both Income Statement and Cash Flow Statement endpoints

$baseUrl = "http://localhost:3000"
$token = ""

# Function to get auth token
function Get-AuthToken {
    try {
        $loginData = @{
            email = "admin@nvccz.co.zw"
            password = "admin123"
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $loginData -ContentType "application/json"
        return $response.token
    }
    catch {
        Write-Host "Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to test Income Statement endpoints
function Test-IncomeStatementEndpoints {
    Write-Host "`nTesting Income Statement Endpoints..." -ForegroundColor Blue
    Write-Host "=====================================" -ForegroundColor Blue
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $incomeData = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    $endpoints = @(
        @{ name = "Generate"; url = "/api/accounting/income-statement/generate" },
        @{ name = "Detailed"; url = "/api/accounting/income-statement/detailed" },
        @{ name = "Summary"; url = "/api/accounting/income-statement/summary" },
        @{ name = "Comprehensive"; url = "/api/accounting/income-statement/comprehensive" },
        @{ name = "Vertical"; url = "/api/accounting/income-statement/vertical" }
    )
    
    $results = @()
    
    foreach ($endpoint in $endpoints) {
        Write-Host "Testing $($endpoint.name)..." -ForegroundColor Cyan
        
        try {
            $response = Invoke-RestMethod -Uri "$baseUrl$($endpoint.url)" -Method POST -Body $incomeData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
            
            Write-Host "✅ $($endpoint.name) Test PASSED" -ForegroundColor Green
            if ($response.data.netIncome) {
                Write-Host "  Net Income: $($response.data.netIncome)" -ForegroundColor White
            }
            
            $results += @{ endpoint = $endpoint.name; success = $true }
        }
        catch {
            Write-Host "❌ $($endpoint.name) Test FAILED" -ForegroundColor Red
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
            
            $results += @{ endpoint = $endpoint.name; success = $false; error = $_.Exception.Message }
        }
    }
    
    return $results
}

# Function to test Cash Flow endpoints
function Test-CashFlowEndpoints {
    Write-Host "`nTesting Cash Flow Statement Endpoints..." -ForegroundColor Blue
    Write-Host "=========================================" -ForegroundColor Blue
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $cashFlowData = @{
        startDate = $startDate
        endDate = $endDate
    } | ConvertTo-Json

    $endpoints = @(
        @{ name = "Generate"; url = "/api/accounting/cash-flow/generate" },
        @{ name = "Detailed"; url = "/api/accounting/cash-flow/detailed" },
        @{ name = "Summary"; url = "/api/accounting/cash-flow/summary" },
        @{ name = "Comprehensive"; url = "/api/accounting/cash-flow/comprehensive" }
    )
    
    $results = @()
    
    foreach ($endpoint in $endpoints) {
        Write-Host "Testing $($endpoint.name)..." -ForegroundColor Cyan
        
        try {
            $response = Invoke-RestMethod -Uri "$baseUrl$($endpoint.url)" -Method POST -Body $cashFlowData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
            
            Write-Host "✅ $($endpoint.name) Test PASSED" -ForegroundColor Green
            if ($response.data.netCashFlow) {
                Write-Host "  Net Cash Flow: $($response.data.netCashFlow)" -ForegroundColor White
            }
            
            $results += @{ endpoint = $endpoint.name; success = $true }
        }
        catch {
            Write-Host "❌ $($endpoint.name) Test FAILED" -ForegroundColor Red
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
            
            $results += @{ endpoint = $endpoint.name; success = $false; error = $_.Exception.Message }
        }
    }
    
    return $results
}

# Function to test comparative statements
function Test-ComparativeStatements {
    Write-Host "`nTesting Comparative Statements..." -ForegroundColor Blue
    Write-Host "=================================" -ForegroundColor Blue
    
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
    
    $comparativeData = @{
        periods = $periods
    } | ConvertTo-Json

    $results = @()
    
    # Test Income Statement Comparative
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/comparative" -Method POST -Body $comparativeData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Income Statement Comparative Test PASSED" -ForegroundColor Green
        Write-Host "  Periods: $($response.data.periods.Count)" -ForegroundColor White
        
        $results += @{ statement = "Income Statement"; success = $true }
    }
    catch {
        Write-Host "❌ Income Statement Comparative Test FAILED" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        
        $results += @{ statement = "Income Statement"; success = $false; error = $_.Exception.Message }
    }
    
    # Test Cash Flow Comparative
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/cash-flow/comparative" -Method POST -Body $comparativeData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Cash Flow Comparative Test PASSED" -ForegroundColor Green
        Write-Host "  Periods: $($response.data.periods.Count)" -ForegroundColor White
        
        $results += @{ statement = "Cash Flow"; success = $true }
    }
    catch {
        Write-Host "❌ Cash Flow Comparative Test FAILED" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        
        $results += @{ statement = "Cash Flow"; success = $false; error = $_.Exception.Message }
    }
    
    return $results
}

# Function to test GET endpoints
function Test-GetEndpoints {
    Write-Host "`nTesting GET Endpoints..." -ForegroundColor Blue
    Write-Host "=========================" -ForegroundColor Blue
    
    $startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
    $endDate = (Get-Date).ToString("yyyy-MM-dd")
    
    $results = @()
    
    # Test Income Statement GET
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement?startDate=$startDate&endDate=$endDate&type=summary" -Method GET -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Income Statement GET Test PASSED" -ForegroundColor Green
        Write-Host "  Net Income: $($response.data.netIncome)" -ForegroundColor White
        
        $results += @{ statement = "Income Statement"; success = $true }
    }
    catch {
        Write-Host "❌ Income Statement GET Test FAILED" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        
        $results += @{ statement = "Income Statement"; success = $false; error = $_.Exception.Message }
    }
    
    # Test Cash Flow GET
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/cash-flow?startDate=$startDate&endDate=$endDate&type=summary" -Method GET -Headers @{Authorization = "Bearer $token"}
        
        Write-Host "✅ Cash Flow GET Test PASSED" -ForegroundColor Green
        Write-Host "  Net Cash Flow: $($response.data.netCashFlow)" -ForegroundColor White
        
        $results += @{ statement = "Cash Flow"; success = $true }
    }
    catch {
        Write-Host "❌ Cash Flow GET Test FAILED" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        
        $results += @{ statement = "Cash Flow"; success = $false; error = $_.Exception.Message }
    }
    
    return $results
}

# Function to test different periods
function Test-MultiplePeriods {
    Write-Host "`nTesting Multiple Periods..." -ForegroundColor Blue
    Write-Host "=============================" -ForegroundColor Blue
    
    $periods = @(
        @{ name = "Current Month"; startDate = (Get-Date -Day 1).ToString("yyyy-MM-dd"); endDate = (Get-Date).ToString("yyyy-MM-dd") },
        @{ name = "Previous Month"; startDate = (Get-Date -Day 1).AddMonths(-1).ToString("yyyy-MM-dd"); endDate = (Get-Date -Day 1).AddDays(-1).ToString("yyyy-MM-dd") },
        @{ name = "Last 7 Days"; startDate = (Get-Date).AddDays(-7).ToString("yyyy-MM-dd"); endDate = (Get-Date).ToString("yyyy-MM-dd") }
    )
    
    $results = @()
    
    foreach ($period in $periods) {
        Write-Host "Testing $($period.name)..." -ForegroundColor Cyan
        
        # Test Income Statement
        $incomeData = @{
            startDate = $period.startDate
            endDate = $period.endDate
        } | ConvertTo-Json

        try {
            $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/generate" -Method POST -Body $incomeData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
            
            Write-Host "✅ $($period.name) - Income Statement PASSED" -ForegroundColor Green
            Write-Host "  Net Income: $($response.data.netIncome)" -ForegroundColor White
            
            $results += @{ period = $period.name; statement = "Income Statement"; success = $true; netIncome = $response.data.netIncome }
        }
        catch {
            Write-Host "❌ $($period.name) - Income Statement FAILED" -ForegroundColor Red
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
            
            $results += @{ period = $period.name; statement = "Income Statement"; success = $false; error = $_.Exception.Message }
        }
        
        # Test Cash Flow
        $cashFlowData = @{
            startDate = $period.startDate
            endDate = $period.endDate
        } | ConvertTo-Json

        try {
            $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/cash-flow/generate" -Method POST -Body $cashFlowData -ContentType "application/json" -Headers @{Authorization = "Bearer $token"}
            
            Write-Host "✅ $($period.name) - Cash Flow PASSED" -ForegroundColor Green
            Write-Host "  Net Cash Flow: $($response.data.netCashFlow)" -ForegroundColor White
            
            $results += @{ period = $period.name; statement = "Cash Flow"; success = $true; netCashFlow = $response.data.netCashFlow }
        }
        catch {
            Write-Host "❌ $($period.name) - Cash Flow FAILED" -ForegroundColor Red
            Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
            
            $results += @{ period = $period.name; statement = "Cash Flow"; success = $false; error = $_.Exception.Message }
        }
    }
    
    return $results
}

# Main execution
Write-Host "Starting Master Financial Statements Tests..." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

# Get authentication token
Write-Host "Getting authentication token..." -ForegroundColor Yellow
$token = Get-AuthToken
if (-not $token) {
    Write-Host "❌ Failed to get authentication token. Exiting." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Authentication successful" -ForegroundColor Green

# Run all tests
$incomeResults = Test-IncomeStatementEndpoints
$cashFlowResults = Test-CashFlowEndpoints
$comparativeResults = Test-ComparativeStatements
$getResults = Test-GetEndpoints
$periodResults = Test-MultiplePeriods

# Summary
Write-Host "`nMaster Test Summary:" -ForegroundColor Green
Write-Host "=====================" -ForegroundColor Green

# Income Statement Summary
$incomePassed = ($incomeResults | Where-Object { $_.success }).Count
$incomeTotal = $incomeResults.Count
Write-Host "Income Statement Tests: $incomePassed/$incomeTotal passed" -ForegroundColor $(if ($incomePassed -eq $incomeTotal) { "Green" } else { "Red" })

# Cash Flow Summary
$cashFlowPassed = ($cashFlowResults | Where-Object { $_.success }).Count
$cashFlowTotal = $cashFlowResults.Count
Write-Host "Cash Flow Tests: $cashFlowPassed/$cashFlowTotal passed" -ForegroundColor $(if ($cashFlowPassed -eq $cashFlowTotal) { "Green" } else { "Red" })

# Comparative Summary
$comparativePassed = ($comparativeResults | Where-Object { $_.success }).Count
$comparativeTotal = $comparativeResults.Count
Write-Host "Comparative Tests: $comparativePassed/$comparativeTotal passed" -ForegroundColor $(if ($comparativePassed -eq $comparativeTotal) { "Green" } else { "Red" })

# GET Summary
$getPassed = ($getResults | Where-Object { $_.success }).Count
$getTotal = $getResults.Count
Write-Host "GET Tests: $getPassed/$getTotal passed" -ForegroundColor $(if ($getPassed -eq $getTotal) { "Green" } else { "Red" })

# Period Summary
$periodPassed = ($periodResults | Where-Object { $_.success }).Count
$periodTotal = $periodResults.Count
Write-Host "Period Tests: $periodPassed/$periodTotal passed" -ForegroundColor $(if ($periodPassed -eq $periodTotal) { "Green" } else { "Red" })

# Overall Summary
$totalPassed = $incomePassed + $cashFlowPassed + $comparativePassed + $getPassed + $periodPassed
$totalTests = $incomeTotal + $cashFlowTotal + $comparativeTotal + $getTotal + $periodTotal

Write-Host "`nOverall Results:" -ForegroundColor Blue
Write-Host "=================" -ForegroundColor Blue
Write-Host "Total Tests: $totalTests" -ForegroundColor White
Write-Host "Total Passed: $totalPassed" -ForegroundColor Green
Write-Host "Total Failed: $($totalTests - $totalPassed)" -ForegroundColor Red

if ($totalPassed -eq $totalTests) {
    Write-Host "`nAll Financial Statement tests passed!" -ForegroundColor Green
} else {
    Write-Host "`nSome tests failed. Please check the errors above." -ForegroundColor Yellow
}

Write-Host "`nMaster Financial Statements testing completed!" -ForegroundColor Green 