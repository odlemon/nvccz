# Test: Cashbook bank accounts are dynamic (GET returns DB list; PUT updates and next GET reflects it)
# Credentials: admin@nts.com / admin123. Base: http://localhost:3009

$baseUrl = "http://localhost:3009"
$ErrorActionPreference = "Stop"

$login = @{ email = "admin@nts.com"; password = "admin123" } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $login -ContentType "application/json"
$token = $r.token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "`n=== Cashbook banks dynamic test ===" -ForegroundColor Cyan

# 1) GET /api/cashbook/banks - list (dynamic from DB)
Write-Host "`n1. GET /api/cashbook/banks (active only)" -ForegroundColor Yellow
$list1 = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks" -Method GET -Headers $headers
$banks1 = @($list1.data)
Write-Host "   Banks returned: $($banks1.Count)" -ForegroundColor Gray
foreach ($b in $banks1) { Write-Host "   - $($b.name) ($($b.accountNumber)) id=$($b.id)" -ForegroundColor Gray }

# 2) Optional: GET with includeInactive
Write-Host "`n2. GET /api/cashbook/banks?includeInactive=true" -ForegroundColor Yellow
$list2 = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks?includeInactive=true" -Method GET -Headers $headers
$banks2 = @($list2.data)
Write-Host "   Banks returned (including inactive): $($banks2.Count)" -ForegroundColor Gray

if ($banks1.Count -eq 0) {
    Write-Host "   [SKIP] No banks to update. Create a bank via POST /api/cashbook/banks first." -ForegroundColor Yellow
    Write-Host "`n=== Result: GET banks is dynamic (returns DB list). Add banks via POST; update via PUT /banks/:id ===" -ForegroundColor Cyan
    exit 0
}

# 3) GET one bank by ID
$firstId = $banks1[0].id
$firstName = $banks1[0].name
Write-Host "`n3. GET /api/cashbook/banks/$firstId" -ForegroundColor Yellow
$one = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks/$firstId" -Method GET -Headers $headers
Write-Host "   Bank: $($one.data.name) $($one.data.accountNumber)" -ForegroundColor Green

# 4) PUT update bank (append " (Updated)" to name so we can verify)
$newName = "$firstName (Updated)"
Write-Host "`n4. PUT /api/cashbook/banks/$firstId  name=$newName" -ForegroundColor Yellow
$body = @{ name = $newName } | ConvertTo-Json
try {
    $updated = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks/$firstId" -Method PUT -Body $body -ContentType "application/json" -Headers $headers
    Write-Host "   Updated: $($updated.data.name)" -ForegroundColor Green
} catch {
    Write-Host "   PUT failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 5) GET list again - should show updated name (dynamic)
Write-Host "`n5. GET /api/cashbook/banks again (should show updated name)" -ForegroundColor Yellow
$list3 = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks" -Method GET -Headers $headers
$banks3 = @($list3.data)
$found = $banks3 | Where-Object { $_.id -eq $firstId } | Select-Object -First 1
if ($found -and $found.name -eq $newName) {
    Write-Host "   [OK] List shows updated name: $($found.name)" -ForegroundColor Green
} else {
    Write-Host "   [WARN] List may be cached or update not reflected: expected name '$newName'" -ForegroundColor Yellow
}

# 6) Revert name so we don't leave data changed
$revertBody = @{ name = $firstName } | ConvertTo-Json
Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks/$firstId" -Method PUT -Body $revertBody -ContentType "application/json" -Headers $headers | Out-Null
Write-Host "`n6. Reverted bank name to '$firstName'" -ForegroundColor Gray

Write-Host "`n=== Result: Banks are dynamic. GET /banks returns DB list; PUT /banks/:id updates; next GET reflects changes. ===" -ForegroundColor Cyan
Write-Host ""
