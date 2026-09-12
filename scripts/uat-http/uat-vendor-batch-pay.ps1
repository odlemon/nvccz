# HTTP UAT: batch-pay vendor bills via POST /api/accounting/purchase-invoices/batch-pay
# Picks up to 10 POSTED CREDIT bills (PENDING/PARTIALLY_PAID, outstanding > 0, no cashbookEntryId),
# same currency, with a matching bank from /purchase-invoices/banks.
#
#   .\scripts\uat-http\uat-vendor-batch-pay.ps1
#
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$here\uat-common.ps1"

function Test-EligibleBatchBill {
    param($inv)
    if (-not $inv) { return $false }
    if ($inv.status -ne 'POSTED') { return $false }
    if ($inv.paymentMethod -ne 'CREDIT') { return $false }
    if ($inv.paymentStatus -eq 'PAID') { return $false }
    $out = 0
    try { $out = [decimal]$inv.outstandingAmount } catch { return $false }
    if ($out -le 0) { return $false }
    if ($inv.cashbookEntryId) { return $false }
    if (-not $inv.journalEntryId) { return $false }
    return $true
}

$base = Get-UatBaseUrl
Write-Host "NVCCZ HTTP UAT vendor batch pay - BASE $base"

$token = Get-UatAuthToken -BaseUrl $base
$headers = Get-UatAuthHeaders -Token $token

$banksResp = Invoke-RestMethod -Uri "$base/api/accounting/purchase-invoices/banks" -Headers $headers -Method Get
if (-not $banksResp.success) { throw "banks: $($banksResp.message)" }
$banks = @($banksResp.data)
if ($banks.Count -lt 1) { throw 'No banks returned — cannot batch pay' }

$eligible = @()
$page = 1
$limit = 50
while ($eligible.Count -lt 10 -and $page -le 20) {
    $url = "$base/api/accounting/purchase-invoices?page=$page`&limit=$limit`&status=POSTED`&paymentStatus=PENDING"
    $r = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    if (-not $r.success) { throw "list page $page : $($r.message)" }
    $rows = @($r.data.invoices)
    if ($rows.Count -eq 0) { break }
    foreach ($inv in $rows) {
        if ((Test-EligibleBatchBill $inv) -and ($eligible.Count -lt 10)) {
            $eligible += $inv
        }
    }
    if ($rows.Count -lt $limit) { break }
    $page++
}

# PARTIALLY_PAID pages
$page = 1
while ($eligible.Count -lt 10 -and $page -le 20) {
    $url = "$base/api/accounting/purchase-invoices?page=$page`&limit=$limit`&status=POSTED`&paymentStatus=PARTIALLY_PAID"
    $r = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    if (-not $r.success) { break }
    $rows = @($r.data.invoices)
    if ($rows.Count -eq 0) { break }
    foreach ($inv in $rows) {
        if ((Test-EligibleBatchBill $inv) -and ($eligible.Count -lt 10)) {
            $dup = $false
            foreach ($e in $eligible) { if ($e.id -eq $inv.id) { $dup = $true; break } }
            if (-not $dup) { $eligible += $inv }
        }
    }
    if ($rows.Count -lt $limit) { break }
    $page++
}

if ($eligible.Count -lt 1) {
    Write-Host 'SKIP: No eligible vendor bills for batch pay (need POSTED CREDIT, outstanding, no cashbookEntryId).'
    exit 2
}

$currencyId = $eligible[0].currencyId
$group = @($eligible | Where-Object { $_.currencyId -eq $currencyId } | Select-Object -First 10)
if ($group.Count -lt 1) { throw 'Internal: empty group' }

$bank = $banks | Where-Object { $_.currency -and $_.currency.id -eq $currencyId } | Select-Object -First 1
if (-not $bank) {
    throw "No bank in currency $currencyId — link a bank or use db:uat:multicurrency-banks"
}

$ids = @($group | ForEach-Object { $_.id })
$payBody = @{
    invoiceIds       = $ids
    paymentMethod    = 'BANK'
    bankId           = $bank.id
    paymentDate      = (Get-Date).ToUniversalTime().ToString('o')
    paymentReference = "BATCH-PS1-$(Get-Date -Format 'yyyyMMddHHmmss')"
    notes            = 'uat-vendor-batch-pay.ps1'
} | ConvertTo-Json -Depth 6

Write-Host "POST batch-pay: $($ids.Count) bills, bank $($bank.name) ($($bank.id))"
$batch = Invoke-RestMethod -Uri "$base/api/accounting/purchase-invoices/batch-pay" -Headers $headers -Method Post -Body $payBody -ContentType 'application/json; charset=utf-8'

if (-not $batch.success) {
    throw "batch-pay failed: $($batch.message)"
}

$d = $batch.data
Write-Host "OK cashbookEntryId=$($d.cashbookEntryId) journalEntryId=$($d.journalEntryId) totalAmount=$($d.totalAmount)"
Write-Host 'VENDOR BATCH PAY UAT PASS'
exit 0
