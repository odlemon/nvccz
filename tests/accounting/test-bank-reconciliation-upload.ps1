# Bank reconciliation: simulate frontend upload with template format
# Uses the exact template fields: Account Number, Account Currency, Opening/Closing Balance;
# Transaction Date, Value Date, Reference, Description, Debit, Credit, Balance.
# Base: http://localhost:3009 | Login: admin@nts.com / admin123

$baseUrl = "http://localhost:3009"
$ErrorActionPreference = "Stop"

# Login
$login = @{ email = "admin@nts.com"; password = "admin123" } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $login -ContentType "application/json"
$token = $r.token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "`n=== Bank Reconciliation - Template Upload and Full Flow ===" -ForegroundColor Cyan

# 1) Get template from API (same as frontend would)
Write-Host "`n1. GET /api/accounting/bank-reconciliation/template" -ForegroundColor Yellow
try {
    $templateRes = Invoke-WebRequest -Uri "$baseUrl/api/accounting/bank-reconciliation/template" -Method GET -Headers $headers -UseBasicParsing
    $templateCsv = $templateRes.Content
    if ($templateCsv.Length -lt 50) { throw "Template too short" }
    if (-not ($templateCsv -match "Transaction Date" -and $templateCsv -match "Value Date" -and $templateCsv -match "Debit" -and $templateCsv -match "Credit" -and $templateCsv -match "Balance")) {
        throw "Template missing required columns"
    }
    Write-Host "   OK - Template downloaded, length=$($templateCsv.Length)" -ForegroundColor Green
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2) Build CSV in exact template format (fields the frontend would send)
$uploadCsv = @'
Account Number,23572550015
Account Currency,ZWL
Opening Balance,-25741.84
Closing Balance,36218.37

Transaction Date,Value Date,Reference,Description,Debit,Credit,Balance
03-Apr-2020,03-Apr-2020,066ISTP200945403,TRF EX ZIMBABWE ELECTRICITY TRANSMISSION,,107628.00,81248.37
30-Apr-2020,30-Apr-2020,011FTIT201210014,TRF BADORE TRADING TO J MUSIIWA,45000.00,,36248.37
30-Apr-2020,30-Apr-2020,011FTIT201210014,TRANSFER CHARGE,30.00,,36218.37
'@

$csvPath = "bank_statement_upload_test.csv"
[System.IO.File]::WriteAllText((Join-Path (Get-Location) $csvPath), $uploadCsv, [System.Text.Encoding]::UTF8)

# 3) Upload file (simulate frontend multipart)
Write-Host "`n2. POST /api/accounting/bank-reconciliation/upload (file)" -ForegroundColor Yellow
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"
$fileContent = [System.IO.File]::ReadAllText((Resolve-Path $csvPath))
$bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"bank_statement.csv`"",
    "Content-Type: text/csv",
    "",
    $fileContent,
    "--$boundary--$LF"
)
$body = $bodyLines -join $LF
$uploadHeaders = @{
    "Authorization" = "Bearer $token"
    "Content-Type"   = "multipart/form-data; boundary=$boundary"
}

try {
    $uploadRes = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/upload" -Method POST -Headers $uploadHeaders -Body $body
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor Red }
    Remove-Item -Path $csvPath -ErrorAction SilentlyContinue
    exit 1
}

$recon = $uploadRes.data.reconciliation
if (-not $recon) { $recon = $uploadRes.reconciliation }
if (-not $recon) {
    Write-Host "   FAIL - No reconciliation in response" -ForegroundColor Red
    Write-Host ($uploadRes | ConvertTo-Json -Depth 5)
    Remove-Item -Path $csvPath -ErrorAction SilentlyContinue
    exit 1
}

$reconId = $recon.id
Write-Host "   OK - Reconciliation id=$reconId" -ForegroundColor Green
Write-Host "   totalTransactions=$($recon.totalTransactions) status=$($recon.status)" -ForegroundColor Gray
if ($recon.accountNumber) { Write-Host "   accountNumber=$($recon.accountNumber) accountCurrency=$($recon.accountCurrency)" -ForegroundColor Gray }
if ($recon.openingBalance -ne $null) { Write-Host "   openingBalance=$($recon.openingBalance) closingBalance=$($recon.closingBalance)" -ForegroundColor Gray }

# 4) GET reconciliation by id
Write-Host "`n3. GET /api/accounting/bank-reconciliation/$reconId" -ForegroundColor Yellow
try {
    $getRes = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/$reconId" -Method GET -Headers $headers
    $detail = $getRes.data
    if (-not $detail) { throw "No data in response" }
    Write-Host "   OK - status=$($detail.status) bankTransactions=$($detail.bankTransactions.Count)" -ForegroundColor Green
    foreach ($tx in $detail.bankTransactions) {
        Write-Host "     $($tx.transactionDate) | $($tx.description) | amount=$($tx.amount)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
    Remove-Item -Path $csvPath -ErrorAction SilentlyContinue
    exit 1
}

# 5) GET unmatched (reconciliation flow)
Write-Host "`n4. GET /api/accounting/bank-reconciliation/$reconId/unmatched" -ForegroundColor Yellow
try {
    $unmatchedRes = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/$reconId/unmatched" -Method GET -Headers $headers
    $unmatched = $unmatchedRes.data
    if ($null -eq $unmatched) { $unmatched = @() }
    Write-Host "   OK - unmatched count=$($unmatched.Count)" -ForegroundColor Green
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor Red }
    Remove-Item -Path $csvPath -ErrorAction SilentlyContinue
    exit 1
}

# 6) GET summary
Write-Host "`n5. GET /api/accounting/bank-reconciliation/summary" -ForegroundColor Yellow
try {
    $sumRes = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/summary" -Method GET -Headers $headers
    $sum = $sumRes.data
    Write-Host "   OK - totalReconciliations=$($sum.totalReconciliations) totalTransactions=$($sum.totalTransactions)" -ForegroundColor Green
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
    Remove-Item -Path $csvPath -ErrorAction SilentlyContinue
    exit 1
}

Remove-Item -Path $csvPath -ErrorAction SilentlyContinue
Write-Host "`n=== Bank reconciliation (template upload) - all steps OK ===" -ForegroundColor Green
