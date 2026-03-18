# Test currencyId query param on GET endpoints. Base: http://localhost:3009
$baseUrl = "http://localhost:3009"
$ErrorActionPreference = "Stop"

$login = @{ email = "admin@nts.com"; password = "admin123" } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $login -ContentType "application/json"
$token = $r.token
$h = @{ Authorization = "Bearer $token" }

$cur = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies?limit=1" -Method GET -Headers $h
$cid = $cur.data[0].id
if (-not $cid) { Write-Host "No currency - skip"; exit 1 }
Write-Host "Using currencyId=$cid" -ForegroundColor Cyan

$ok = 0; $fail = 0
function Test-Url($name, $url) {
    try {
        $res = Invoke-RestMethod -Uri $url -Method GET -Headers $h
        Write-Host "OK  $name" -ForegroundColor Green
        $script:ok++
    } catch {
        Write-Host "FAIL $name - $($_.Exception.Message)" -ForegroundColor Red
        $script:fail++
    }
}

Test-Url "Journal entries" "$baseUrl/api/accounting/journal-entries?currencyId=$cid"
Test-Url "Journal entries by date" "$baseUrl/api/accounting/journal-entries/by-date-range?startDate=2020-01-01&endDate=2030-12-31&currencyId=$cid"
Test-Url "Trial balance" "$baseUrl/api/accounting/trial-balance?date=2025-12-31&currencyId=$cid"
Test-Url "Trial balance summary" "$baseUrl/api/accounting/trial-balance/summary?date=2025-12-31&currencyId=$cid"
Test-Url "Trial balance by type" "$baseUrl/api/accounting/trial-balance/by-account-type?date=2025-12-31&currencyId=$cid"
Test-Url "Cashbook entries" "$baseUrl/api/cashbook/entries?currencyId=$cid&limit=5"
Test-Url "Cashbook batches" "$baseUrl/api/cashbook/batches?page=1&limit=5&currencyId=$cid"
Test-Url "Transfers" "$baseUrl/api/cashbook/transfers?page=1&limit=5&currencyId=$cid"
Test-Url "Entry types" "$baseUrl/api/cashbook/entry-types?currencyId=$cid"
Test-Url "Periods" "$baseUrl/api/cashbook/periods?currencyId=$cid"
Test-Url "Contra all-entries" "$baseUrl/api/cashbook/contra/all-entries?currencyId=$cid&limit=10"
Test-Url "Bank reconciliation list" "$baseUrl/api/accounting/bank-reconciliation?currencyId=$cid&limit=5"
Test-Url "Purchase invoices" "$baseUrl/api/accounting/purchase-invoices?currencyId=$cid&limit=5"

Write-Host "`nPassed: $ok  Failed: $fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Yellow" })
exit $(if ($fail -eq 0) { 0 } else { 1 })
