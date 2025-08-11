# Comprehensive Target Test
$baseUrl = "http://localhost:3000"

Write-Host "=== COMPREHENSIVE TARGET TEST ===" -ForegroundColor Green

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

# 2. Test creating targets for all types
Write-Host "`n2. Testing target creation for all types..." -ForegroundColor Yellow

$targetTypes = @("Sales", "Revenue", "Expenses", "Profit")
$createdTargets = @()

foreach ($type in $targetTypes) {
    $targetPayload = @{
        type = $type
        value = (100000 + ($targetTypes.IndexOf($type) * 25000))
        deadline = (Get-Date).AddMonths(3 + $targetTypes.IndexOf($type)).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    }

    Write-Host "Creating $type target..." -ForegroundColor Cyan
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/targets" -Method POST -Headers $headers -Body ($targetPayload | ConvertTo-Json)
        Write-Host "✅ $type target created! ID: $($response.data.id)" -ForegroundColor Green
        $createdTargets += @{Id = $response.data.id; Type = $type}
    } catch {
        Write-Host "❌ Failed to create $type target: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 3. Test getting all targets
Write-Host "`n3. Testing get all targets..." -ForegroundColor Yellow
try {
    $targets = Invoke-RestMethod -Uri "$baseUrl/api/targets" -Method GET -Headers $headers
    Write-Host "✅ Targets retrieved successfully!" -ForegroundColor Green
    Write-Host "Total targets: $($targets.pagination.total)" -ForegroundColor Cyan
    Write-Host "Page: $($targets.pagination.page) of $($targets.pagination.totalPages)" -ForegroundColor Cyan
    
    foreach ($target in $targets.data) {
        Write-Host "  - $($target.type): $($target.value) (Deadline: $($target.deadline))" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get targets: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Test filtering by type
Write-Host "`n4. Testing filtering by type..." -ForegroundColor Yellow
foreach ($type in $targetTypes) {
    try {
        $filteredTargets = Invoke-RestMethod -Uri "$baseUrl/api/targets?type=$type" -Method GET -Headers $headers
        Write-Host "✅ $type targets: $($filteredTargets.data.Count) found" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to filter $type targets: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 5. Test getting target by ID
Write-Host "`n5. Testing get target by ID..." -ForegroundColor Yellow
if ($createdTargets.Count -gt 0) {
    $firstTarget = $createdTargets[0]
    try {
        $target = Invoke-RestMethod -Uri "$baseUrl/api/targets/$($firstTarget.Id)" -Method GET -Headers $headers
        Write-Host "✅ Target retrieved by ID successfully!" -ForegroundColor Green
        Write-Host "Type: $($target.data.type)" -ForegroundColor Cyan
        Write-Host "Value: $($target.data.value)" -ForegroundColor Cyan
        Write-Host "Deadline: $($target.data.deadline)" -ForegroundColor Cyan
    } catch {
        Write-Host "❌ Failed to get target by ID: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 6. Test updating target
Write-Host "`n6. Testing target update..." -ForegroundColor Yellow
if ($createdTargets.Count -gt 0) {
    $firstTarget = $createdTargets[0]
    $updatePayload = @{
        value = 150000
        deadline = (Get-Date).AddMonths(6).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    }

    try {
        $updateResponse = Invoke-RestMethod -Uri "$baseUrl/api/targets/$($firstTarget.Id)" -Method PUT -Headers $headers -Body ($updatePayload | ConvertTo-Json)
        Write-Host "✅ Target updated successfully!" -ForegroundColor Green
        Write-Host "New Value: $($updateResponse.data.value)" -ForegroundColor Cyan
        Write-Host "New Deadline: $($updateResponse.data.deadline)" -ForegroundColor Cyan
    } catch {
        Write-Host "❌ Failed to update target: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 7. Test target summary
Write-Host "`n7. Testing target summary..." -ForegroundColor Yellow
try {
    $summary = Invoke-RestMethod -Uri "$baseUrl/api/targets/summary" -Method GET -Headers $headers
    Write-Host "✅ Target summary retrieved successfully!" -ForegroundColor Green
    Write-Host "Total targets: $($summary.data.totalTargets)" -ForegroundColor Cyan
    Write-Host "Active targets: $($summary.data.activeTargets)" -ForegroundColor Cyan
    
    Write-Host "Targets by type:" -ForegroundColor Yellow
    foreach ($type in $summary.data.byType) {
        Write-Host "  - $($type.type): $($type.count) targets, Total value: $($type.totalValue)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get target summary: $($_.Exception.Message)" -ForegroundColor Red
}

# 8. Test deleting targets
Write-Host "`n8. Testing target deletion..." -ForegroundColor Yellow
foreach ($target in $createdTargets) {
    try {
        $deleteResponse = Invoke-RestMethod -Uri "$baseUrl/api/targets/$($target.Id)" -Method DELETE -Headers $headers
        Write-Host "✅ $($target.Type) target deleted successfully!" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to delete $($target.Type) target: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 9. Verify deletion by checking summary
Write-Host "`n9. Verifying deletion..." -ForegroundColor Yellow
try {
    $finalSummary = Invoke-RestMethod -Uri "$baseUrl/api/targets/summary" -Method GET -Headers $headers
    Write-Host "✅ Final summary:" -ForegroundColor Green
    Write-Host "Total targets: $($finalSummary.data.totalTargets)" -ForegroundColor Cyan
    Write-Host "Active targets: $($finalSummary.data.activeTargets)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get final summary: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== COMPREHENSIVE TEST COMPLETE ===" -ForegroundColor Green 