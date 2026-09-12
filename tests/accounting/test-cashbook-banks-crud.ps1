# Test all cashbook bank endpoints: Create, Get one, Get list, Update, Soft delete.
# Credentials: admin@nts.com / admin123. Base: http://localhost:3009

$baseUrl = "http://localhost:3009"
$ErrorActionPreference = "Stop"

$login = @{ email = "admin@nts.com"; password = "admin123" } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $login -ContentType "application/json"
$token = $r.token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "`n=== Cashbook Banks CRUD Test ===" -ForegroundColor Cyan

# --- 1) GET banks (list) ---
Write-Host "`n1. GET /api/cashbook/banks (list)" -ForegroundColor Yellow
$list0 = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks" -Method GET -Headers $headers
$banks0 = @($list0.data)
Write-Host "   OK - Count: $($banks0.Count)" -ForegroundColor Green

# --- 2) Create bank: need currencyId + glAccountId (unused). Get from existing bank + GL available for bank.
$currencyId = $banks0[0].currencyId
if (-not $currencyId) { $currencyId = $banks0[0].currency.id }
$glList = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/gl-accounts?availableForBank=true" -Method GET -Headers $headers
$glAccounts = @($glList.data)
if ($glAccounts.Count -eq 0) {
    Write-Host "   [SKIP CREATE] No unused GL account for new bank. Use chart-of-accounts to add an asset account not linked to a bank." -ForegroundColor Yellow
    $createdBank = $null
} else {
    $glId = $glAccounts[0].id
    $accountNo = $glAccounts[0].accountNo
    $uniqueNum = [int](Get-Date -UFormat %s) % 100000
    $newBank = @{
        name = "Test Bank CRUD $uniqueNum"
        accountNumber = "CRUD-TEST-$uniqueNum"
        currencyId = $currencyId
        glAccountId = $glId
        isActive = $true
    } | ConvertTo-Json

    Write-Host "`n2. POST /api/cashbook/banks (create)" -ForegroundColor Yellow
    try {
        $createRes = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks" -Method POST -Body $newBank -ContentType "application/json" -Headers $headers
        $createdBank = $createRes.data
        Write-Host "   OK - Created: $($createdBank.name) id=$($createdBank.id)" -ForegroundColor Green
    } catch {
        Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) { Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor Red }
        $createdBank = $null
    }
}

# --- 3) GET bank by ID ---
if ($createdBank) {
    $bid = $createdBank.id
    Write-Host "`n3. GET /api/cashbook/banks/$bid (get one)" -ForegroundColor Yellow
    $oneRes = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks/$bid" -Method GET -Headers $headers
    Write-Host "   OK - $($oneRes.data.name) $($oneRes.data.accountNumber)" -ForegroundColor Green
} else {
    $bid = $banks0[0].id
    Write-Host "`n3. GET /api/cashbook/banks/$bid (get one, using existing)" -ForegroundColor Yellow
    $oneRes = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks/$bid" -Method GET -Headers $headers
    Write-Host "   OK - $($oneRes.data.name)" -ForegroundColor Green
}

# --- 4) PUT update bank ---
Write-Host "`n4. PUT /api/cashbook/banks/$bid (update name)" -ForegroundColor Yellow
$updatedName = "Test Bank CRUD (Updated)"
$putBody = @{ name = $updatedName } | ConvertTo-Json
try {
    $putRes = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks/$bid" -Method PUT -Body $putBody -ContentType "application/json" -Headers $headers
    Write-Host "   OK - Name now: $($putRes.data.name)" -ForegroundColor Green
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
}

# --- 5) GET list again (should include updated name) ---
Write-Host "`n5. GET /api/cashbook/banks (list after update)" -ForegroundColor Yellow
$list1 = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks" -Method GET -Headers $headers
$found = $list1.data | Where-Object { $_.id -eq $bid } | Select-Object -First 1
if ($found -and $found.name -eq $updatedName) {
    Write-Host "   OK - List shows updated name" -ForegroundColor Green
} else {
    Write-Host "   List count: $($list1.data.Count)" -ForegroundColor Gray
}

# --- 6) DELETE (soft delete) ---
Write-Host "`n6. DELETE /api/cashbook/banks/$bid (soft delete)" -ForegroundColor Yellow
try {
    $delRes = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks/$bid" -Method DELETE -Headers $headers
    Write-Host "   OK - Bank deactivated: isActive=$($delRes.data.isActive)" -ForegroundColor Green
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
}

# --- 7) GET list (soft-deleted bank should NOT appear) ---
Write-Host "`n7. GET /api/cashbook/banks (list; soft-deleted should be excluded)" -ForegroundColor Yellow
$list2 = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks" -Method GET -Headers $headers
$stillInList = $list2.data | Where-Object { $_.id -eq $bid } | Select-Object -First 1
if (-not $stillInList) {
    Write-Host "   OK - Deleted bank no longer in default list" -ForegroundColor Green
} else {
    Write-Host "   FAIL - Deleted bank still in list" -ForegroundColor Red
}

# --- 8) GET with includeInactive (soft-deleted bank SHOULD appear) ---
Write-Host "`n8. GET /api/cashbook/banks?includeInactive=true" -ForegroundColor Yellow
$list3 = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks?includeInactive=true" -Method GET -Headers $headers
$inactiveFound = $list3.data | Where-Object { $_.id -eq $bid } | Select-Object -First 1
if ($inactiveFound -and $inactiveFound.isActive -eq $false) {
    Write-Host "   OK - Soft-deleted bank appears with isActive=false" -ForegroundColor Green
} else {
    Write-Host "   Inactive list count: $($list3.data.Count)" -ForegroundColor Gray
}

# --- 9) Reactivate (PUT isActive: true) ---
Write-Host "`n9. PUT /api/cashbook/banks/$bid (reactivate isActive=true)" -ForegroundColor Yellow
$reactivateBody = @{ isActive = $true } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks/$bid" -Method PUT -Body $reactivateBody -ContentType "application/json" -Headers $headers | Out-Null
    Write-Host "   OK - Reactivated" -ForegroundColor Green
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
}

# --- 10) GET list again (reactivated bank should appear) ---
Write-Host "`n10. GET /api/cashbook/banks (reactivated bank back in list)" -ForegroundColor Yellow
$list4 = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks" -Method GET -Headers $headers
$backInList = $list4.data | Where-Object { $_.id -eq $bid } | Select-Object -First 1
if ($backInList) {
    Write-Host "   OK - Bank back in list" -ForegroundColor Green
} else {
    Write-Host "   FAIL - Reactivated bank not in list" -ForegroundColor Red
}

# If we created a test bank, soft-delete again and optionally leave it inactive for cleanup
if ($createdBank) {
    Invoke-RestMethod -Uri "$baseUrl/api/cashbook/banks/$bid" -Method DELETE -Headers $headers | Out-Null
    Write-Host "`n(Test bank soft-deleted again for cleanup)" -ForegroundColor Gray
}

Write-Host "`n=== Banks CRUD test done ===" -ForegroundColor Cyan
Write-Host ""
