# HTTP UAT: Chart of accounts edit endpoints + validation (real API only).
# - PUT/PATCH /api/accounting/chart-of-accounts/:id (authenticated)
# - 422 when body has no updatable fields
# - 409 when changing accountType or financialStatement if journal lines exist
# - 200 for safe update (notes only) on account with no journal lines
#
#   npm run test:uat:http:chart-of-accounts-edit
#   $env:NVCCZ_BASE_URL = 'http://localhost:3009'
#
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$here\uat-common.ps1"

function Invoke-CoaJson {
    param(
        [ValidateSet('PUT', 'PATCH')]
        [string] $Method,
        [string] $Uri,
        [hashtable] $Headers,
        [string] $Body
    )
    $p = @{
        Uri             = $Uri
        Method          = $Method
        Headers         = $Headers
        UseBasicParsing = $true
        ContentType     = 'application/json; charset=utf-8'
        Body            = $Body
    }
    try {
        $wr = Invoke-WebRequest @p
        $j = $wr.Content | ConvertFrom-Json
        return @{ StatusCode = [int]$wr.StatusCode; Json = $j }
    }
    catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if (-not $resp) { throw $_ }
        $stream = $resp.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
        $j = $null
        try { $j = $text | ConvertFrom-Json } catch { }
        return @{ StatusCode = [int]$resp.StatusCode; Json = $j; Raw = $text }
    }
}

$base = Get-UatBaseUrl
Write-Host "NVCCZ HTTP UAT chart-of-accounts edit - BASE $base"

$token = Get-UatAuthToken -BaseUrl $base
$h = Get-UatAuthHeaders -Token $token
$h['Content-Type'] = 'application/json'

$listUrl = "$base/api/accounting/chart-of-accounts/with-journal-entries"
$coaList = Invoke-RestMethod -Uri $listUrl -Headers $h -Method Get
if (-not $coaList.success) { throw "with-journal-entries: $($coaList.message)" }
$accounts = @($coaList.data)

$withJe = $null
$noJe = $null
foreach ($a in $accounts) {
    $tc = 0
    if ($a.summary -and $null -ne $a.summary.transactionCount) {
        $tc = [int]$a.summary.transactionCount
    }
    elseif ($a.journalEntryLines) {
        $tc = @($a.journalEntryLines).Count
    }
    if ($tc -gt 0 -and -not $withJe) { $withJe = $a }
    if ($tc -eq 0 -and -not $noJe) { $noJe = $a }
    if ($withJe -and $noJe) { break }
}

# 1) Empty updatable fields -> 422
$anyId = if ($withJe) { $withJe.id } elseif ($noJe) { $noJe.id } else { throw 'No chart accounts returned' }
$r0 = Invoke-CoaJson -Method PUT -Uri "$base/api/accounting/chart-of-accounts/$anyId" -Headers $h -Body '{}'
if ($r0.StatusCode -ne 422) {
    throw "Expected 422 for empty body, got $($r0.StatusCode) $($r0.Json | ConvertTo-Json -Compress)"
}
Write-Host "OK PUT empty body -> 422 (validation)"

# 2) Type change with journal history -> 409
if (-not $withJe) {
    Write-Host 'SKIP: no account with journal lines - cannot assert 409 on type change'
}
else {
    $flip = 'Income'
    if ($withJe.accountType -eq 'Income' -or $withJe.accountType -eq 'Revenue') {
        $flip = 'Current Asset'
    }
    $body409 = (@{ accountType = $flip } | ConvertTo-Json -Compress)
    $r1 = Invoke-CoaJson -Method PUT -Uri "$base/api/accounting/chart-of-accounts/$($withJe.id)" -Headers $h -Body $body409
    if ($r1.StatusCode -ne 409) {
        throw "Expected 409 when changing type on posted account $($withJe.accountNo), got $($r1.StatusCode)"
    }
    if (-not $r1.Json.message) {
        throw '409 response missing message'
    }
    Write-Host "OK PUT accountType change on posted account -> 409 ($($withJe.accountNo))"
}

# 3) Safe PATCH (notes only) on account with no JE lines -> 200
if (-not $noJe) {
    Write-Host 'SKIP: no account without journal lines - cannot assert 200 safe update'
}
else {
    $note = "HTTP-UAT-$(Get-Date -Format 'yyyyMMddHHmmss')"
    $body200 = (@{ notes = $note } | ConvertTo-Json -Compress)
    $r2 = Invoke-CoaJson -Method PATCH -Uri "$base/api/accounting/chart-of-accounts/$($noJe.id)" -Headers $h -Body $body200
    if ($r2.StatusCode -ne 200) {
        throw "Expected 200 for notes-only PATCH on $($noJe.accountNo), got $($r2.StatusCode)"
    }
    if (-not $r2.Json.success) {
        throw '200 response success=false'
    }
    Write-Host "OK PATCH notes only on clean account -> 200 ($($noJe.accountNo))"
}

Write-Host 'CHART OF ACCOUNTS EDIT UAT PASS'
exit 0
