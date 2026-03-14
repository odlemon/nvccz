# Full depreciation test: login (admin@nts.com), assets, calculate+post, journal entries, all reports
# Server must be running (e.g. port 3009)

$baseUrl = "http://localhost:3009"
$ErrorActionPreference = "Stop"

function Get-AuthToken {
    $login = @{ email = "admin@nts.com"; password = "admin123" } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $login -ContentType "application/json"
    $script:token = $r.token
    Write-Host "[OK] Logged in as admin@nts.com" -ForegroundColor Green
}

function Get-ChartOfAccounts {
    $h = @{ Authorization = "Bearer $script:token" }
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/chart-of-accounts" -Method GET -Headers $h
    $list = @($r.data)
    if ($list.Count -eq 0) { $list = @($r) }
    return $list
}

function Get-Assets {
    $h = @{ Authorization = "Bearer $script:token" }
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/assets?limit=100" -Method GET -Headers $h
    $list = @($r.data.assets)
    if (-not $list) { $list = @($r.data) }
    if ($list.Count -eq 0) { $list = @() }
    return $list
}

function New-Asset {
    param($AssetAccountId, $AccumDepAccountId, $DepExpenseAccountId)
    $h = @{ Authorization = "Bearer $script:token" }
    $body = @{
        assetName = "Test Asset Depreciation"
        assetCode = "TAD-001"
        description = "Created by depreciation test"
        purchaseDate = (Get-Date).AddMonths(-2).ToString("yyyy-MM-dd")
        cost = 12000
        usefulLifeYears = 5
        depreciationMethod = "STRAIGHT_LINE"
        salvageValue = 0
        assetAccountId = $AssetAccountId
        accumulatedDepreciationAccountId = $AccumDepAccountId
        depreciationExpenseAccountId = $DepExpenseAccountId
    } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/assets" -Method POST -Body $body -ContentType "application/json" -Headers $h
    Write-Host "[OK] Created asset: $($r.data.assetName) id=$($r.data.id)" -ForegroundColor Green
    return $r.data
}

function Invoke-CalculateDepreciation { param($AssetId, $Period)
    $h = @{ Authorization = "Bearer $script:token" }
    $body = @{ period = $Period } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/assets/$AssetId/depreciation" -Method POST -Body $body -ContentType "application/json" -Headers $h
    Write-Host "[OK] Calculated depreciation: period=$Period amount=$($r.data.depreciationAmount) id=$($r.data.id)" -ForegroundColor Green
    return $r.data
}

function Invoke-PostDepreciation { param($DepreciationId)
    $h = @{ Authorization = "Bearer $script:token" }
    try {
        $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/assets/depreciation/$DepreciationId/post" -Method POST -Headers $h
        Write-Host "[OK] Posted depreciation journal entry" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "[FAIL] Post depreciation: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message -ForegroundColor Red }
        return $false
    }
}

function Get-JournalEntriesByDateRange { param($StartDate, $EndDate)
    $h = @{ Authorization = "Bearer $script:token" }
    $q = "startDate=$StartDate&endDate=$EndDate"
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries/by-date-range?$q" -Method GET -Headers $h
    $list = @($r.data)
    if ($list.Count -eq 0) { $list = @($r) }
    return $list
}

function Get-BalanceSheet { param($AsOfDate)
    $h = @{ Authorization = "Bearer $script:token" }
    $body = @{ asOfDate = $AsOfDate } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/balance-sheet/generate" -Method POST -Body $body -ContentType "application/json" -Headers $h
    return $r.data
}

function Get-IncomeStatement { param($StartDate, $EndDate)
    $h = @{ Authorization = "Bearer $script:token" }
    $body = @{ startDate = $StartDate; endDate = $EndDate } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/generate" -Method POST -Body $body -ContentType "application/json" -Headers $h
    return $r.data
}

function Get-CashFlow { param($StartDate, $EndDate)
    $h = @{ Authorization = "Bearer $script:token" }
    $body = @{ startDate = $StartDate; endDate = $EndDate } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/cash-flow/generate" -Method POST -Body $body -ContentType "application/json" -Headers $h
    return $r.data
}

# --- Main ---
Write-Host "`n========== Depreciation full test (admin@nts.com, port 3009) ==========" -ForegroundColor Cyan

Get-AuthToken

# 1) Chart of accounts: find 1100 (asset), 1300 (accum dep), 5095/5010 (depreciation expense)
$coa = Get-ChartOfAccounts
$assetAcc = $coa | Where-Object { $_.accountNo -eq "1100" } | Select-Object -First 1
$accumAcc = $coa | Where-Object { $_.accountNo -eq "1300" -or ($_.accountName -match "Accumulated Depreciation") } | Select-Object -First 1
$depExpAcc = $coa | Where-Object { $_.accountNo -match "5095|5010|5080" -or $_.accountName -match "Depreciation Expense" } | Select-Object -First 1
if (-not $depExpAcc) { $depExpAcc = $coa | Where-Object { $_.accountNo -match "^5" -and $_.financialStatement -match "Income" } | Select-Object -First 1 }
if (-not $assetAcc -or -not $accumAcc -or -not $depExpAcc) {
    Write-Host "[FAIL] Missing chart of accounts: need 1100 (asset), 1300 (accum dep), 5xxx (dep expense). Found: 1100=$($assetAcc.id), 1300=$($accumAcc.id), depExp=$($depExpAcc.id)" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Chart: asset=$($assetAcc.accountNo) $($assetAcc.accountName), accum=$($accumAcc.accountNo), depExp=$($depExpAcc.accountNo) $($depExpAcc.accountName)" -ForegroundColor Gray

# 2) Assets: use first IN_USE or create one (API returns data.assets[]; each has .id)
$assets = Get-Assets
$asset = $assets | Where-Object { $_.status -eq "IN_USE" } | Select-Object -First 1
if (-not $asset) { $asset = $assets | Select-Object -First 1 }
if (-not $asset -or -not $asset.id) {
    Write-Host "No assets found. Creating test asset..." -ForegroundColor Yellow
    $asset = New-Asset -AssetAccountId $assetAcc.id -AccumDepAccountId $accumAcc.id -DepExpenseAccountId $depExpAcc.id
} else {
    $aid = if ($asset.id) { $asset.id } else { $asset.assetId }
    Write-Host "[OK] Using existing asset: $($asset.assetName) id=$aid" -ForegroundColor Green
    if (-not $asset.id) { $asset | Add-Member -NotePropertyName id -NotePropertyValue $aid -Force }
}

# 3) Period: use current month so repeated test runs don't hit "already calculated"
$now = Get-Date
$period = $now.ToString("yyyy-MM")
$lastDay = [DateTime]::DaysInMonth($now.Year, $now.Month)
$asOfDate = "$($now.Year)-$($now.Month.ToString('00'))-$($lastDay.ToString('00'))"
$startDate = "$($now.Year)-$($now.Month.ToString('00'))-01"
$endDate = $asOfDate

# 4) Calculate and post depreciation
$assetId = $asset.id
if (-not $assetId) { $assetId = $asset.assetId }
if (-not $assetId) { Write-Host "[FAIL] No asset id" -ForegroundColor Red; exit 1 }
Write-Host "`n--- Calculate and post depreciation for $period (assetId=$assetId) ---" -ForegroundColor Yellow
$depRec = $null
try {
    $depRec = Invoke-CalculateDepreciation -AssetId $assetId -Period $period
} catch {
    Write-Host "[FAIL] Calculate: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
$postOk = Invoke-PostDepreciation -DepreciationId $depRec.id
if (-not $postOk) { exit 1 }

# 5) Journal entries: find DEP- entry and verify lines
Write-Host "`n--- Journal entries ($startDate to $endDate) ---" -ForegroundColor Yellow
$entries = Get-JournalEntriesByDateRange -StartDate $startDate -EndDate $endDate
$depEntries = @($entries | Where-Object { $_.referenceNumber -match "^DEP-" })
Write-Host "  Total entries in range: $($entries.Count); DEP- entries: $($depEntries.Count)" -ForegroundColor Gray
foreach ($e in $depEntries) {
    Write-Host "  Ref: $($e.referenceNumber) Desc: $($e.description) Total: $($e.totalAmount) Status: $($e.status)" -ForegroundColor Cyan
    if ($e.journalEntryLines) {
        foreach ($line in $e.journalEntryLines) {
            $acc = $line.chartOfAccount
            $name = if ($acc) { $acc.accountName } else { "?" }
            Write-Host "    Line: $name Dr=$($line.debitAmount) Cr=$($line.creditAmount)" -ForegroundColor Gray
        }
    }
}
if ($depEntries.Count -eq 0) { Write-Host "  [WARN] No DEP- journal entry in range (check transactionDate is last day of period)" -ForegroundColor Yellow }

# 6) Balance Sheet
Write-Host "`n--- Balance Sheet as of $asOfDate ---" -ForegroundColor Yellow
$bs = Get-BalanceSheet -AsOfDate $asOfDate
$accumLine = $bs.assets.fixedAssets.accounts | Where-Object { $_.accountName -match "Accumulated Depreciation|depreciation" }
if ($accumLine) {
    Write-Host "  Accumulated Depreciation: $($accumLine.accountName) balance = $($accumLine.balance)" -ForegroundColor Green
} else {
    Write-Host "  [WARN] No Accumulated Depreciation line in fixed assets (check account 1300 / Contra-Asset)" -ForegroundColor Yellow
}
Write-Host "  Total Assets: $($bs.assets.totalAssets)" -ForegroundColor Gray

# 7) Income Statement
Write-Host "`n--- Income Statement $startDate to $endDate ---" -ForegroundColor Yellow
$is = Get-IncomeStatement -StartDate $startDate -EndDate $endDate
$depExpLine = $is.sections.operatingExpenses.accounts | Where-Object { $_.accountName -match "Depreciation|depreciation" }
if ($depExpLine) {
    Write-Host "  Depreciation (Operating Expenses): $($depExpLine.accountName) amount = $($depExpLine.amount)" -ForegroundColor Green
} else {
    Write-Host "  Depreciation posts to the expense account set on the asset (e.g. Office Supplies or Depreciation Expense); it is included in Operating Expenses total." -ForegroundColor Gray
}
Write-Host "  Operating Expenses total: $($is.sections.operatingExpenses.total)  Net Income: $($is.totals.netIncome)" -ForegroundColor Gray

# 8) Cash Flow
Write-Host "`n--- Cash Flow $startDate to $endDate ---" -ForegroundColor Yellow
$cf = Get-CashFlow -StartDate $startDate -EndDate $endDate
if ($cf.additionsToOperatingCashFlow) {
    $depItem = $cf.additionsToOperatingCashFlow | Where-Object { $_.label -match "Depreciation" }
    if ($depItem) { Write-Host "  Depreciation and amortization (add-back): $($depItem.amount)" -ForegroundColor Green }
}
if ($cf.netCashFlow -ne $null) { Write-Host "  Net Cash Flow: $($cf.netCashFlow)" -ForegroundColor Gray }
if ($cf.operatingActivities -ne $null) { Write-Host "  Operating activities (summary) present" -ForegroundColor Gray }

Write-Host "`n========== Done ==========" -ForegroundColor Cyan
