# Delete Sales Targets Script
$baseUrl = "http://localhost:3000"

Write-Host "=== DELETE SALES TARGETS SCRIPT ===" -ForegroundColor Red

# 1. Login
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    $token = $login.token
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
    Write-Host "✅ Authentication successful" -ForegroundColor Green
} catch {
    Write-Host "❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 2. Get all targets
Write-Host "`n2. Fetching all targets..." -ForegroundColor Yellow
try {
    $targets = Invoke-RestMethod -Uri "$baseUrl/api/targets" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($targets.data.length) targets" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get targets: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 3. Filter Sales targets
$salesTargets = $targets.data | Where-Object { $_.type -eq "Sales" }
Write-Host "`n3. Found $($salesTargets.length) Sales targets to delete" -ForegroundColor Yellow

if ($salesTargets.length -eq 0) {
    Write-Host "✅ No Sales targets found to delete" -ForegroundColor Green
    exit
}

# 4. Display Sales targets before deletion
Write-Host "`n4. Sales targets to be deleted:" -ForegroundColor Yellow
foreach ($target in $salesTargets) {
    Write-Host "   - ID: $($target.id), Type: $($target.type), Amount: $($target.amount), Deadline: $($target.deadline)" -ForegroundColor Cyan
}

# 5. Confirm deletion
Write-Host "`n5. Confirming deletion..." -ForegroundColor Yellow
$confirmation = Read-Host "Are you sure you want to delete these $($salesTargets.length) Sales targets? (yes/no)"
if ($confirmation -ne "yes") {
    Write-Host "❌ Deletion cancelled by user" -ForegroundColor Red
    exit
}

# 6. Delete Sales targets
Write-Host "`n6. Deleting Sales targets..." -ForegroundColor Yellow
$deletedCount = 0
$failedCount = 0

foreach ($target in $salesTargets) {
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/targets/$($target.id)" -Method DELETE -Headers $headers
        Write-Host "   ✅ Deleted target: $($target.id)" -ForegroundColor Green
        $deletedCount++
    } catch {
        Write-Host "   ❌ Failed to delete target $($target.id): $($_.Exception.Message)" -ForegroundColor Red
        $failedCount++
    }
}

# 7. Summary
Write-Host "`n=== DELETION SUMMARY ===" -ForegroundColor Yellow
Write-Host "Total Sales targets found: $($salesTargets.length)" -ForegroundColor White
Write-Host "Successfully deleted: $deletedCount" -ForegroundColor Green
Write-Host "Failed to delete: $failedCount" -ForegroundColor Red

if ($deletedCount -gt 0) {
    Write-Host "`n✅ Sales targets deletion completed!" -ForegroundColor Green
} else {
    Write-Host "`n❌ No Sales targets were deleted" -ForegroundColor Red
}
