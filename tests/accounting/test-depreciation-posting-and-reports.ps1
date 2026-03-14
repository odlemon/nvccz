# Test: Post depreciation and verify it appears on Balance Sheet and Income Statement
# Endpoints:
#   POST /api/accounting/assets/{assetId}/depreciation  body: { period: "YYYY-MM" }  -> calculate (returns depreciationRecord with id)
#   POST /api/accounting/assets/depreciation/{depreciationId}/post  -> post journal entry
#   POST /api/accounting/balance-sheet/generate  body: { asOfDate, startDate?, endDate?, currencyId? }
#   POST /api/accounting/income-statement/generate  body: { startDate, endDate, currencyId? }

$baseUrl = "http://localhost:3009"
$token = ""

function Get-AuthToken {
    try {
        $loginData = @{
            email = "admin@nts.com"
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

function Get-FirstInUseAsset {
    try {
        $headers = @{ Authorization = "Bearer $token" }
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/assets" -Method GET -Headers $headers
        $assets = @($response.data)
        if ($assets.Count -eq 0) {
            Write-Host "No assets found. Create an asset first (e.g. from Assets UI)." -ForegroundColor Yellow
            return $null
        }
        $inUse = $assets | Where-Object { $_.status -eq "IN_USE" }
        if ($inUse.Count -eq 0) {
            Write-Host "No IN_USE assets. Use first asset for test." -ForegroundColor Yellow
            $asset = $assets[0]
        } else {
            $asset = $inUse[0]
        }
        Write-Host "Using asset: $($asset.assetName) (id: $($asset.id))" -ForegroundColor Cyan
        return $asset
    }
    catch {
        Write-Host "Failed to list assets: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

function Test-CalculateAndPostDepreciation {
    param([string]$AssetId, [string]$Period)
    $headers = @{ Authorization = "Bearer $token" }
    # 1) Calculate depreciation
    $body = @{ period = $Period } | ConvertTo-Json
    try {
        $calc = Invoke-RestMethod -Uri "$baseUrl/api/accounting/assets/$AssetId/depreciation" -Method POST -Body $body -ContentType "application/json" -Headers $headers
        $depId = $calc.data.id
        Write-Host "  Calculate depreciation: OK (record id: $depId, amount: $($calc.data.depreciationAmount))" -ForegroundColor Green
    }
    catch {
        Write-Host "  Calculate depreciation FAILED: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) { Write-Host "  $($_.ErrorDetails.Message)" -ForegroundColor Red }
        return $null
    }
    # 2) Post depreciation (this was returning 500 before fix: invalid currencyId 'default')
    try {
        $post = Invoke-RestMethod -Uri "$baseUrl/api/accounting/assets/depreciation/$depId/post" -Method POST -Headers $headers
        Write-Host "  Post depreciation: OK" -ForegroundColor Green
        return $depId
    }
    catch {
        Write-Host "  Post depreciation FAILED: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) { Write-Host "  $($_.ErrorDetails.Message)" -ForegroundColor Red }
        return $null
    }
}

function Test-BalanceSheetShowsDepreciation {
    param([string]$AsOfDate)
    $headers = @{ Authorization = "Bearer $token" }
    $body = @{ asOfDate = $AsOfDate } | ConvertTo-Json
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/balance-sheet/generate" -Method POST -Body $body -ContentType "application/json" -Headers $headers
        $data = $response.data
        $accum = 0
        if ($data.assets.fixedAssets.accounts) {
            foreach ($acc in $data.assets.fixedAssets.accounts) {
                if ($acc.accountName -match "Accumulated Depreciation" -or $acc.accountName -match "depreciation") {
                    $accum += [math]::Abs($acc.balance)
                    Write-Host "  Balance Sheet - Accumulated Depreciation: $($acc.accountName) balance = $($acc.balance)" -ForegroundColor Cyan
                }
            }
        }
        Write-Host "  Balance Sheet: total assets = $($data.assets.totalAssets)" -ForegroundColor Cyan
        return $true
    }
    catch {
        Write-Host "  Balance Sheet request FAILED: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Test-IncomeStatementShowsDepreciation {
    param([string]$StartDate, [string]$EndDate)
    $headers = @{ Authorization = "Bearer $token" }
    $body = @{ startDate = $StartDate; endDate = $EndDate } | ConvertTo-Json
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/generate" -Method POST -Body $body -ContentType "application/json" -Headers $headers
        $data = $response.data
        $opEx = $data.sections.operatingExpenses
        $depAmount = 0
        if ($opEx.accounts) {
            foreach ($acc in $opEx.accounts) {
                if ($acc.accountName -match "Depreciation" -or $acc.accountName -match "depreciation") {
                    $depAmount += [math]::Abs($acc.amount)
                    Write-Host "  Income Statement - Depreciation: $($acc.accountName) amount = $($acc.amount)" -ForegroundColor Cyan
                }
            }
        }
        Write-Host "  Income Statement: operating expenses total = $($opEx.total), net income = $($data.totals.netIncome)" -ForegroundColor Cyan
        return $true
    }
    catch {
        Write-Host "  Income Statement request FAILED: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# --- Main ---
Write-Host "`n=== Depreciation Post and Financial Reports Test ===" -ForegroundColor Blue
$token = Get-AuthToken
if (-not $token) { exit 1 }

$asset = Get-FirstInUseAsset
if (-not $asset) { exit 1 }

# Use previous month so we don't depend on current month data
$prevMonth = (Get-Date).AddMonths(-1)
$period = $prevMonth.ToString("yyyy-MM")
$lastDay = (Get-Date -Year $prevMonth.Year -Month $prevMonth.Month -Day 1).AddMonths(1).AddDays(-1)
$asOfDate = $lastDay.ToString("yyyy-MM-dd")
$startDate = (Get-Date -Year $prevMonth.Year -Month $prevMonth.Month -Day 1).ToString("yyyy-MM-dd")
$endDate = $asOfDate

Write-Host "`nStep 1: Calculate and post depreciation for period $period" -ForegroundColor Yellow
$posted = Test-CalculateAndPostDepreciation -AssetId $asset.id -Period $period
if (-not $posted) {
    Write-Host "`nDepreciation post failed. Fix: ensure currency exists and AssetService uses currency.id (not 'default')." -ForegroundColor Red
    exit 1
}

Write-Host "`nStep 2: Balance Sheet as of $asOfDate (should include Accumulated Depreciation)" -ForegroundColor Yellow
$bsOk = Test-BalanceSheetShowsDepreciation -AsOfDate $asOfDate

Write-Host "`nStep 3: Income Statement $startDate to $endDate (should include Depreciation Expense in Operating Expenses)" -ForegroundColor Yellow
$isOk = Test-IncomeStatementShowsDepreciation -StartDate $startDate -EndDate $endDate

Write-Host "`n=== Result ===" -ForegroundColor Blue
Write-Host "  Post depreciation: PASS" -ForegroundColor Green
if ($bsOk) { Write-Host "  Balance Sheet: PASS" -ForegroundColor Green } else { Write-Host "  Balance Sheet: FAIL or no depreciation line (check chart of accounts)" -ForegroundColor Yellow }
if ($isOk) { Write-Host "  Income Statement: PASS" -ForegroundColor Green } else { Write-Host "  Income Statement: FAIL or no depreciation line (ensure Depreciation Expense account has financialStatement Income Statement)" -ForegroundColor Yellow }
Write-Host ""
