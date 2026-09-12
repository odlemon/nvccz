# HTTP UAT smoke: /health + login + one authenticated accounting call.
# Requires: API running (e.g. npm run dev). PowerShell 5.1+.
#   .\scripts\uat-http\uat-smoke.ps1
#   $env:NVCCZ_BASE_URL = 'http://127.0.0.1:4000'; .\scripts\uat-http\uat-smoke.ps1

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$here\uat-common.ps1"

$base = Get-UatBaseUrl
Write-Host "NVCCZ HTTP UAT smoke - BASE $base"

try {
    $health = Invoke-RestMethod -Uri "$base/health" -Method Get -ErrorAction Stop
    Write-Host "OK GET /health"
}
catch {
    throw "GET /health failed (is the server running?). $($_.Exception.Message)"
}

$token = Get-UatAuthToken -BaseUrl $base
$headers = Get-UatAuthHeaders -Token $token

$invUri = "$base/api/accounting/purchase-invoices?page=1`&limit=1"
$list = Invoke-RestMethod -Uri $invUri -Headers $headers -Method Get -ErrorAction Stop
if (-not $list.success) {
    throw "purchase-invoices list: success=false $($list.message)"
}
Write-Host 'OK GET /api/accounting/purchase-invoices (authenticated)'

Write-Host 'SMOKE PASS'
