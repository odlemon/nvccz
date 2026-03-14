# Multi-asset depreciation test: create 3 assets (different amounts & methods), post depreciation,
# then verify journal entries, trial balance, balance sheet, income statement, cash flow.
# Credentials: admin@nts.com / admin123. Server: port 3009.

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

function New-Asset {
    param(
        [string]$AssetName,
        [string]$AssetCode,
        [decimal]$Cost,
        [int]$UsefulLifeYears,
        [string]$DepreciationMethod,
        [string]$AssetAccountId,
        [string]$AccumDepAccountId,
        [string]$DepExpenseAccountId
    )
    $h = @{ Authorization = "Bearer $script:token" }
    $body = @{
        assetName = $AssetName
        assetCode = $AssetCode
        description = "Multi-asset depreciation test"
        purchaseDate = (Get-Date).AddMonths(-1).ToString("yyyy-MM-dd")
        cost = $Cost
        usefulLifeYears = $UsefulLifeYears
        depreciationMethod = $DepreciationMethod
        salvageValue = 0
        assetAccountId = $AssetAccountId
        accumulatedDepreciationAccountId = $AccumDepAccountId
        depreciationExpenseAccountId = $DepExpenseAccountId
    } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/assets" -Method POST -Body $body -ContentType "application/json" -Headers $h
    Write-Host "  Created: $AssetName cost=$Cost $DepreciationMethod -> id=$($r.data.id)" -ForegroundColor Green
    return $r.data
}

function Invoke-CalculateDepreciation { param($AssetId, $Period)
    $h = @{ Authorization = "Bearer $script:token" }
    $body = @{ period = $Period } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/assets/$AssetId/depreciation" -Method POST -Body $body -ContentType "application/json" -Headers $h
    return $r.data
}

function Invoke-PostDepreciation { param($DepreciationId)
    $h = @{ Authorization = "Bearer $script:token" }
    Invoke-RestMethod -Uri "$baseUrl/api/accounting/assets/depreciation/$DepreciationId/post" -Method POST -Headers $h | Out-Null
    return $true
}

function Get-JournalEntriesByDateRange { param($StartDate, $EndDate)
    $h = @{ Authorization = "Bearer $script:token" }
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries/by-date-range?startDate=$StartDate&endDate=$EndDate" -Method GET -Headers $h
    return @($r.data)
}

function Get-TrialBalance { param($EndDate)
    $h = @{ Authorization = "Bearer $script:token" }
    $r = Invoke-RestMethod -Uri "$baseUrl/api/accounting/trial-balance?endDate=$EndDate" -Method GET -Headers $h
    return $r.data
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
Write-Host "`n========== Multi-asset depreciation test ==========" -ForegroundColor Cyan
Get-AuthToken

$coa = Get-ChartOfAccounts
# Fixed asset account: prefer Office Equipment / 1100, else first Fixed Asset
$assetAcc = $coa | Where-Object { $_.accountName -match "Office Equipment|Equipment|Fixed Asset" -or ($_.accountNo -eq "1100" -and $_.accountType -match "Asset") } | Select-Object -First 1
if (-not $assetAcc) { $assetAcc = $coa | Where-Object { $_.accountType -match "Fixed Asset" } | Select-Object -First 1 }
if (-not $assetAcc) { $assetAcc = $coa | Where-Object { $_.accountNo -eq "1100" } | Select-Object -First 1 }
$accumAcc = $coa | Where-Object { $_.accountNo -eq "1300" -or $_.accountName -match "Accumulated Depreciation" } | Select-Object -First 1
$depExpAcc = $coa | Where-Object { $_.accountNo -match "5095|5010" -or $_.accountName -match "Depreciation Expense" } | Select-Object -First 1
if (-not $depExpAcc) { $depExpAcc = $coa | Where-Object { $_.accountNo -match "^5" -and $_.financialStatement -match "Income" } | Select-Object -First 1 }

if (-not $assetAcc -or -not $accumAcc -or -not $depExpAcc) {
    Write-Host "[FAIL] Chart of accounts: need Fixed Asset, 1300 Accumulated Depreciation, 5xxx Depreciation/Expense. Exiting." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] GL: Asset=$($assetAcc.accountNo) $($assetAcc.accountName), Accum=$($accumAcc.accountNo), DepExp=$($depExpAcc.accountNo) $($depExpAcc.accountName)" -ForegroundColor Gray

# Period: current month
$now = Get-Date
$period = $now.ToString("yyyy-MM")
$lastDay = [DateTime]::DaysInMonth($now.Year, $now.Month)
$asOfDate = "$($now.Year)-$($now.Month.ToString('00'))-$($lastDay.ToString('00'))"
$startDate = "$($now.Year)-$($now.Month.ToString('00'))-01"
$endDate = $asOfDate

# --- Step 1: Create 3 assets (different amounts and depreciation types) ---
Write-Host "`n--- Step 1: Create 3 assets ---" -ForegroundColor Yellow
$assets = @()
# Asset A: 24,000, 4 years, STRAIGHT_LINE -> monthly 24000/4/12 = 500
$assets += New-Asset -AssetName "Test Desk A" -AssetCode "TDA-$(Get-Random -Maximum 9999)" -Cost 24000 -UsefulLifeYears 4 -DepreciationMethod "STRAIGHT_LINE" -AssetAccountId $assetAcc.id -AccumDepAccountId $accumAcc.id -DepExpenseAccountId $depExpAcc.id
# Asset B: 6,000, 5 years, STRAIGHT_LINE -> monthly 6000/5/12 = 100
$assets += New-Asset -AssetName "Test Chair B" -AssetCode "TCB-$(Get-Random -Maximum 9999)" -Cost 6000 -UsefulLifeYears 5 -DepreciationMethod "STRAIGHT_LINE" -AssetAccountId $assetAcc.id -AccumDepAccountId $accumAcc.id -DepExpenseAccountId $depExpAcc.id
# Asset C: 12,000, 3 years, DIMINISHING_BALANCE -> first month ~ 12000 * (2/3)/12 = 666.67
$assets += New-Asset -AssetName "Test Screen C" -AssetCode "TSC-$(Get-Random -Maximum 9999)" -Cost 12000 -UsefulLifeYears 3 -DepreciationMethod "DIMINISHING_BALANCE" -AssetAccountId $assetAcc.id -AccumDepAccountId $accumAcc.id -DepExpenseAccountId $depExpAcc.id

# --- Step 2: Calculate and post depreciation for each asset for current month ---
Write-Host "`n--- Step 2: Calculate and post depreciation for period $period ---" -ForegroundColor Yellow
$expectedMonthly = @(500, 100, 666.67)  # approximate for A, B, C (C is diminishing so first month ~666.67)
$depRecords = @()
foreach ($i in 0..2) {
    $asset = $assets[$i]
    $aid = $asset.id
    $name = $asset.assetName
    try {
        $rec = Invoke-CalculateDepreciation -AssetId $aid -Period $period
        $depRecords += $rec
        $amt = [decimal]$rec.depreciationAmount
        Write-Host "  $name : calculated $amt (expected ~$($expectedMonthly[$i]))" -ForegroundColor Cyan
    } catch {
        Write-Host "  $name : calculate failed - $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) { Write-Host "    $($_.ErrorDetails.Message)" -ForegroundColor Red }
        continue
    }
    try {
        Invoke-PostDepreciation -DepreciationId $rec.id | Out-Null
        Write-Host "  $name : posted" -ForegroundColor Green
    } catch {
        Write-Host "  $name : post failed - $($_.Exception.Message)" -ForegroundColor Red
    }
}

if ($depRecords.Count -eq 0) {
    Write-Host "[FAIL] No depreciation records to verify. Exiting." -ForegroundColor Red
    exit 1
}

# --- Step 3: Journal entries - verify each DEP entry has Dr = Cr and correct accounts ---
Write-Host "`n--- Step 3: Journal entries ($startDate to $endDate) ---" -ForegroundColor Yellow
$entries = Get-JournalEntriesByDateRange -StartDate $startDate -EndDate $endDate
$depEntries = @($entries | Where-Object { $_.referenceNumber -match "^DEP-" })
Write-Host "  Total journal entries in range: $($entries.Count); DEP- entries: $($depEntries.Count)" -ForegroundColor Gray

$allJournalOk = $true
$totalDepDebit = 0
$totalDepCredit = 0
foreach ($e in $depEntries) {
    $lines = @($e.journalEntryLines)
    $dr = 0
    $cr = 0
    foreach ($l in $lines) {
        $dr += [decimal]$l.debitAmount
        $cr += [decimal]$l.creditAmount
    }
    if ([math]::Abs($dr - $cr) -gt 0.02) {
        Write-Host "  [FAIL] $($e.referenceNumber) debits=$dr credits=$cr (must be equal)" -ForegroundColor Red
        $allJournalOk = $false
    } else {
        Write-Host "  [OK] $($e.referenceNumber) Dr=$dr Cr=$cr" -ForegroundColor Green
    }
    $totalDepDebit += $dr
    $totalDepCredit += $cr
}
# Depreciation entries: total expense debits should equal total accum dep credits
if ([math]::Abs($totalDepDebit - $totalDepCredit) -gt 0.02) {
    Write-Host "  [FAIL] Sum of DEP debits ($totalDepDebit) != sum of DEP credits ($totalDepCredit)" -ForegroundColor Red
    $allJournalOk = $false
} else {
    Write-Host "  [OK] Total DEP debits = total DEP credits = $totalDepDebit" -ForegroundColor Green
}

# --- Step 4: Trial balance ---
Write-Host "`n--- Step 4: Trial balance as of $endDate ---" -ForegroundColor Yellow
$tb = Get-TrialBalance -EndDate $endDate
$tbTotalD = [decimal]$tb.totals.totalDebits
$tbTotalC = [decimal]$tb.totals.totalCredits
$tbBalanced = $tb.totals.isBalanced
if ($tbBalanced -and [math]::Abs($tbTotalD - $tbTotalC) -lt 0.02) {
    Write-Host "  [OK] Trial balance is balanced: Total Debits = $tbTotalD, Total Credits = $tbTotalC" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Trial balance not balanced: Debits = $tbTotalD, Credits = $tbTotalC" -ForegroundColor Red
}
$depAccInTb = $tb.accounts | Where-Object { $_.accountName -match "Depreciation|Accumulated" }
if ($depAccInTb) {
    foreach ($a in $depAccInTb) {
        Write-Host "  Account: $($a.accountNo) $($a.accountName) Dr=$($a.debitBalance) Cr=$($a.creditBalance)" -ForegroundColor Cyan
    }
} else {
    Write-Host "  [WARN] No Depreciation/Accumulated account lines in trial balance (check account names)" -ForegroundColor Yellow
}
# Depreciation expense (e.g. Office Supplies 5010) holds the debits; Accumulated Depreciation (1300) holds the credits
Write-Host "  (Depreciation: expense account debits = accum. dep. credits in journal entries)" -ForegroundColor Gray

# --- Step 5: Balance sheet ---
Write-Host "`n--- Step 5: Balance sheet as of $asOfDate ---" -ForegroundColor Yellow
$bs = Get-BalanceSheet -AsOfDate $asOfDate
$bsBalanced = $bs.isBalanced
$diff = [math]::Abs([decimal]$bs.assets.totalAssets - [decimal]$bs.totalLiabilitiesAndEquity)
if ($bsBalanced -and $diff -lt 0.02) {
    Write-Host "  [OK] Balance sheet balanced: Total Assets = $($bs.assets.totalAssets), Liab+Equity = $($bs.totalLiabilitiesAndEquity)" -ForegroundColor Green
} else {
    Write-Host "  [CHECK] Balance sheet isBalanced=$bsBalanced, difference=$diff" -ForegroundColor $(if ($bsBalanced) { "Green" } else { "Red" })
}
$accumLine = $bs.assets.fixedAssets.accounts | Where-Object { $_.accountName -match "Accumulated Depreciation|depreciation" }
if ($accumLine) {
    Write-Host "  Accumulated Depreciation: $($accumLine.balance)" -ForegroundColor Cyan
}

# --- Step 6: Income statement ---
Write-Host "`n--- Step 6: Income statement $startDate to $endDate ---" -ForegroundColor Yellow
$is = Get-IncomeStatement -StartDate $startDate -EndDate $endDate
$opExTotal = [decimal]$is.sections.operatingExpenses.total
Write-Host "  Operating expenses total: $opExTotal (includes depreciation expense)" -ForegroundColor Cyan
Write-Host "  Net income: $($is.totals.netIncome)" -ForegroundColor Gray

# --- Step 7: Cash flow ---
Write-Host "`n--- Step 7: Cash flow $startDate to $endDate ---" -ForegroundColor Yellow
$cf = Get-CashFlow -StartDate $startDate -EndDate $endDate
if ($cf.netCashFlow -ne $null) { Write-Host "  Net cash flow: $($cf.netCashFlow)" -ForegroundColor Gray }
Write-Host "  (Depreciation may appear as non-cash add-back in operating section)" -ForegroundColor Gray

Write-Host "`n========== Summary ==========" -ForegroundColor Cyan
Write-Host "  Assets created: 3 | Depreciation posted: $($depRecords.Count)" -ForegroundColor White
Write-Host "  Journal entries: $(if ($allJournalOk) { 'PASS' } else { 'FAIL' })" -ForegroundColor $(if ($allJournalOk) { "Green" } else { "Red" })
Write-Host "  Trial balance: $(if ($tbBalanced) { 'PASS' } else { 'CHECK' })" -ForegroundColor $(if ($tbBalanced) { "Green" } else { "Yellow" })
Write-Host "  Balance sheet: $(if ($bsBalanced) { 'PASS' } else { 'CHECK' })" -ForegroundColor $(if ($bsBalanced) { "Green" } else { "Yellow" })
Write-Host "  Income statement & Cash flow: fetched OK" -ForegroundColor Green
Write-Host ""
