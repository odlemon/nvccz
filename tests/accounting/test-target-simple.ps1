# Simple Target Test
$baseUrl = "http://localhost:3000"

Write-Host "=== SIMPLE TARGET TEST ===" -ForegroundColor Green

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

# 2. Test target creation
Write-Host "`n2. Testing target creation..." -ForegroundColor Yellow
$targetPayload = @{
    type = "Sales"
    value = 100000.00
    deadline = (Get-Date).AddMonths(3).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

Write-Host "Payload:" -ForegroundColor Yellow
$targetPayload | ConvertTo-Json | Write-Host

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/targets" -Method POST -Headers $headers -Body ($targetPayload | ConvertTo-Json)
    Write-Host "✅ Target created successfully!" -ForegroundColor Green
    Write-Host "Target ID: $($response.data.id)" -ForegroundColor Cyan
    Write-Host "Type: $($response.data.type)" -ForegroundColor Cyan
    Write-Host "Value: $($response.data.value)" -ForegroundColor Cyan
    Write-Host "Deadline: $($response.data.deadline)" -ForegroundColor Cyan
    Write-Host "Active: $($response.data.isActive)" -ForegroundColor Cyan
    
    $targetId = $response.data.id
} catch {
    Write-Host "❌ Failed to create target: $($_.Exception.Message)" -ForegroundColor Red
    
    # Get detailed error
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
    exit
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

# 4. Test getting target by ID
Write-Host "`n4. Testing get target by ID..." -ForegroundColor Yellow
try {
    $target = Invoke-RestMethod -Uri "$baseUrl/api/targets/$targetId" -Method GET -Headers $headers
    Write-Host "✅ Target retrieved by ID successfully!" -ForegroundColor Green
    Write-Host "Type: $($target.data.type)" -ForegroundColor Cyan
    Write-Host "Value: $($target.data.value)" -ForegroundColor Cyan
    Write-Host "Deadline: $($target.data.deadline)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get target by ID: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Test updating target
Write-Host "`n5. Testing target update..." -ForegroundColor Yellow
$updatePayload = @{
    value = 120000.00
    deadline = (Get-Date).AddMonths(4).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

Write-Host "Update Payload:" -ForegroundColor Yellow
$updatePayload | ConvertTo-Json | Write-Host

try {
    $updateResponse = Invoke-RestMethod -Uri "$baseUrl/api/targets/$targetId" -Method PUT -Headers $headers -Body ($updatePayload | ConvertTo-Json)
    Write-Host "✅ Target updated successfully!" -ForegroundColor Green
    Write-Host "New Value: $($updateResponse.data.value)" -ForegroundColor Cyan
    Write-Host "New Deadline: $($updateResponse.data.deadline)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to update target: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Test target summary
Write-Host "`n6. Testing target summary..." -ForegroundColor Yellow
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

# 7. Test deleting target (soft delete)
Write-Host "`n7. Testing target deletion..." -ForegroundColor Yellow
try {
    $deleteResponse = Invoke-RestMethod -Uri "$baseUrl/api/targets/$targetId" -Method DELETE -Headers $headers
    Write-Host "✅ Target deleted successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to delete target: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Green 