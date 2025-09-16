# Debug Stage Change Test
$baseUrl = "http://localhost:3000"

Write-Host "=== DEBUG STAGE CHANGE TEST ===" -ForegroundColor Green

# Step 1: Login
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'

if ($loginResponse.success) {
    $token = $loginResponse.token
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "✅ Authentication successful" -ForegroundColor Green
} else {
    Write-Host "❌ Login failed: $($loginResponse.message)" -ForegroundColor Red
    exit 1
}

# Step 2: Get an existing application
Write-Host "`n2. Getting existing applications..." -ForegroundColor Yellow
try {
    $appsResponse = Invoke-RestMethod -Uri "$baseUrl/api/applications?limit=5" -Method GET -Headers $headers
    if ($appsResponse.data.applications.Count -gt 0) {
        $applicationId = $appsResponse.data.applications[0].id
        $currentStage = $appsResponse.data.applications[0].currentStage
        Write-Host "✅ Found application: $applicationId" -ForegroundColor Green
        Write-Host "📋 Current stage: $currentStage" -ForegroundColor Cyan
    } else {
        Write-Host "❌ No applications found" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Failed to get applications: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Test stage change
Write-Host "`n3. Testing stage change..." -ForegroundColor Yellow
$stageChangeBody = @{
    newStage = "DUE_DILIGENCE"
    notes = "Moving to due diligence for testing"
}

try {
    $stageResponse = Invoke-RestMethod -Uri "$baseUrl/api/applications/$applicationId/change-stage" -Method POST -Headers $headers -Body ($stageChangeBody | ConvertTo-Json -Depth 10)
    Write-Host "✅ Stage change successful!" -ForegroundColor Green
    Write-Host "📋 New stage: $($stageResponse.data.currentStage)" -ForegroundColor Cyan
    Write-Host "Response: $($stageResponse | ConvertTo-Json -Depth 3)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Stage change failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        $reader.Close()
        Write-Host "Error Body: $errorBody" -ForegroundColor Red
    }
}

Write-Host "`n=== DEBUG TEST COMPLETED ===" -ForegroundColor Green

