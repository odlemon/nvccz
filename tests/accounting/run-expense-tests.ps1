# Test runner script for expense update workflow
# This script runs all expense-related tests and saves results

param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$Token = "",
    [string]$TestType = "quick" # "quick" or "full"
)

if (-not $Token) {
    Write-Host "Please provide a valid authentication token" -ForegroundColor Red
    Write-Host "Usage: .\run-expense-tests.ps1 -Token 'your-jwt-token' [-TestType 'quick'|'full']" -ForegroundColor Yellow
    exit 1
}

# Create test results directory
$testResultsDir = "tests/accounting/test-results"
if (-not (Test-Path $testResultsDir)) {
    New-Item -ItemType Directory -Path $testResultsDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$testResultsFile = "$testResultsDir/expense-test-results-$timestamp.json"

Write-Host "=== Expense Update Workflow Test Runner ===" -ForegroundColor Green
Write-Host "Start Time: $(Get-Date)" -ForegroundColor Cyan
Write-Host "Test Type: $TestType" -ForegroundColor Cyan
Write-Host "Results File: $testResultsFile" -ForegroundColor Cyan
Write-Host ""

# Test results storage
$TestResults = @{
    TestRun = @{
        StartTime = Get-Date
        TestType = $TestType
        BaseUrl = $BaseUrl
        Token = "***HIDDEN***"
    }
    Tests = @()
    Summary = @{
        TotalTests = 0
        PassedTests = 0
        FailedTests = 0
        Success = $false
    }
}

function Run-Test {
    param(
        [string]$TestName,
        [string]$TestScript,
        [string]$Description
    )
    
    Write-Host "Running: $TestName" -ForegroundColor Yellow
    Write-Host "Description: $Description" -ForegroundColor White
    Write-Host ""
    
    $testStartTime = Get-Date
    
    try {
        # Run the test script
        $testOutput = & $TestScript -BaseUrl $BaseUrl -Token $Token 2>&1
        
        $testEndTime = Get-Date
        $testDuration = $testEndTime - $testStartTime
        
        $testResult = @{
            Name = $TestName
            Script = $TestScript
            Description = $Description
            StartTime = $testStartTime
            EndTime = $testEndTime
            Duration = $testDuration
            Status = "PASS"
            Output = $testOutput
            Error = $null
        }
        
        Write-Host "✅ $TestName completed successfully" -ForegroundColor Green
        Write-Host "   Duration: $testDuration" -ForegroundColor White
        
    } catch {
        $testEndTime = Get-Date
        $testDuration = $testEndTime - $testStartTime
        
        $testResult = @{
            Name = $TestName
            Script = $TestScript
            Description = $Description
            StartTime = $testStartTime
            EndTime = $testEndTime
            Duration = $testDuration
            Status = "FAIL"
            Output = $null
            Error = $_.Exception.Message
        }
        
        Write-Host "❌ $TestName failed" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Duration: $testDuration" -ForegroundColor White
    }
    
    $TestResults.Tests += $testResult
    $TestResults.Summary.TotalTests++
    
    if ($testResult.Status -eq "PASS") {
        $TestResults.Summary.PassedTests++
    } else {
        $TestResults.Summary.FailedTests++
    }
    
    Write-Host ""
    return $testResult
}

# Run tests based on type
if ($TestType -eq "quick") {
    # Quick test - basic functionality
    Run-Test -TestName "Quick Expense Update Test" -TestScript ".\quick-expense-test.ps1" -Description "Creates expense, updates it, and verifies basic functionality"
    
} elseif ($TestType -eq "full") {
    # Full test suite - comprehensive testing
    Run-Test -TestName "Quick Expense Update Test" -TestScript ".\quick-expense-test.ps1" -Description "Basic expense update functionality"
    Run-Test -TestName "Comprehensive Expense Update Test" -TestScript ".\test-expense-update-verification.ps1" -Description "Comprehensive expense update workflow verification"
    
} else {
    Write-Host "❌ Invalid test type: $TestType" -ForegroundColor Red
    Write-Host "Valid options: 'quick' or 'full'" -ForegroundColor Yellow
    exit 1
}

# Calculate overall results
$TestResults.Summary.Success = ($TestResults.Summary.FailedTests -eq 0)
$TestResults.TestRun.EndTime = Get-Date
$TestResults.TestRun.Duration = $TestResults.TestRun.EndTime - $TestResults.TestRun.StartTime

# Save test results
$TestResults | ConvertTo-Json -Depth 10 | Out-File -FilePath $testResultsFile -Encoding UTF8

# Display summary
Write-Host "=== Test Summary ===" -ForegroundColor Green
Write-Host "Total Tests: $($TestResults.Summary.TotalTests)" -ForegroundColor White
Write-Host "Passed: $($TestResults.Summary.PassedTests)" -ForegroundColor Green
Write-Host "Failed: $($TestResults.Summary.FailedTests)" -ForegroundColor Red
Write-Host "Overall Result: $(if ($TestResults.Summary.Success) { 'PASS' } else { 'FAIL' })" -ForegroundColor $(if ($TestResults.Summary.Success) { 'Green' } else { 'Red' })
Write-Host "Duration: $($TestResults.TestRun.Duration)" -ForegroundColor White
Write-Host "Results File: $testResultsFile" -ForegroundColor Cyan
Write-Host ""

if ($TestResults.Summary.Success) {
    Write-Host "🎉 All tests passed! Expense update workflow is working correctly." -ForegroundColor Green
} else {
    Write-Host "⚠️  Some tests failed. Check the results file for details." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Test Run Complete ===" -ForegroundColor Green 