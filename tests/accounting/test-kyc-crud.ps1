# KYC CRUD Test
$baseUrl = "http://localhost:3000"

Write-Host "=== KYC CRUD TEST ===" -ForegroundColor Green

# 1. Login
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    $token = $login.token
    $userID = $login.user.id
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
    Write-Host "✅ Authentication successful" -ForegroundColor Green
    Write-Host "   User ID: $userID" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 2. Test CREATE/UPDATE KYC
Write-Host "`n2. Creating/Updating KYC..." -ForegroundColor Yellow
$kycPayload = @{
    ID = $userID
    Preferences = @("preference1", "preference2", "preference3")
}

Write-Host "Payload:" -ForegroundColor Yellow
$kycPayload | ConvertTo-Json | Write-Host

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method POST -Headers $headers -Body ($kycPayload | ConvertTo-Json)
    Write-Host "✅ KYC created/updated successfully!" -ForegroundColor Green
    Write-Host "   KYC ID: $($response.data.id)" -ForegroundColor Cyan
    Write-Host "   User ID: $($response.data.userId)" -ForegroundColor Cyan
    Write-Host "   Preferences: $($response.data.preferences | ConvertTo-Json)" -ForegroundColor Cyan
    Write-Host "   Created: $($response.data.createdAt)" -ForegroundColor Cyan
    Write-Host "   Updated: $($response.data.updatedAt)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create/update KYC: $($_.Exception.Message)" -ForegroundColor Red
    
    # Get detailed error
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

# 3. Test GET KYC
Write-Host "`n3. Getting KYC..." -ForegroundColor Yellow
try {
    $getResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc?userId=$userID" -Method GET -Headers $headers
    if ($getResponse.data) {
        Write-Host "✅ KYC retrieved successfully!" -ForegroundColor Green
        Write-Host "   KYC ID: $($getResponse.data.id)" -ForegroundColor Cyan
        Write-Host "   User ID: $($getResponse.data.userId)" -ForegroundColor Cyan
        Write-Host "   Preferences: $($getResponse.data.preferences | ConvertTo-Json)" -ForegroundColor Cyan
        Write-Host "   Created: $($getResponse.data.createdAt)" -ForegroundColor Cyan
        Write-Host "   Updated: $($getResponse.data.updatedAt)" -ForegroundColor Cyan
    } else {
        Write-Host "ℹ️ No KYC found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to get KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Test UPDATE KYC
Write-Host "`n4. Updating KYC..." -ForegroundColor Yellow
$updatePayload = @{
    ID = $userID
    Preferences = @("updated-preference1", "updated-preference2", "new-preference4", "preference5")
}

Write-Host "Update Payload:" -ForegroundColor Yellow
$updatePayload | ConvertTo-Json | Write-Host

try {
    $updateResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method PUT -Headers $headers -Body ($updatePayload | ConvertTo-Json)
    Write-Host "✅ KYC updated successfully!" -ForegroundColor Green
    Write-Host "   KYC ID: $($updateResponse.data.id)" -ForegroundColor Cyan
    Write-Host "   User ID: $($updateResponse.data.userId)" -ForegroundColor Cyan
    Write-Host "   Updated Preferences: $($updateResponse.data.preferences | ConvertTo-Json)" -ForegroundColor Cyan
    Write-Host "   Updated: $($updateResponse.data.updatedAt)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to update KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Verify UPDATE
Write-Host "`n5. Verifying update..." -ForegroundColor Yellow
try {
    $verifyResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc?userId=$userID" -Method GET -Headers $headers
    if ($verifyResponse.data) {
        Write-Host "✅ Update verified successfully!" -ForegroundColor Green
        Write-Host "   Current Preferences: $($verifyResponse.data.preferences | ConvertTo-Json)" -ForegroundColor Cyan
        Write-Host "   Last Updated: $($verifyResponse.data.updatedAt)" -ForegroundColor Cyan
    } else {
        Write-Host "ℹ️ No KYC found after update" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to verify update: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Test DELETE KYC
Write-Host "`n6. Deleting KYC..." -ForegroundColor Yellow
try {
    $deleteResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc?userId=$userID" -Method DELETE -Headers $headers
    Write-Host "✅ KYC deleted successfully!" -ForegroundColor Green
    Write-Host "   Response: $($deleteResponse.message)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to delete KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 7. Verify DELETION
Write-Host "`n7. Verifying deletion..." -ForegroundColor Yellow
try {
    $finalResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc?userId=$userID" -Method GET -Headers $headers
    if ($finalResponse.data) {
        Write-Host "⚠️ KYC still exists after deletion" -ForegroundColor Yellow
        Write-Host "   Data: $($finalResponse.data | ConvertTo-Json)" -ForegroundColor Cyan
    } else {
        Write-Host "✅ KYC successfully deleted (no data returned)" -ForegroundColor Green
    }
} catch {
    Write-Host "✅ KYC deletion verified (expected error if deleted)" -ForegroundColor Green
}

# 8. Test validation - Missing ID
Write-Host "`n8. Testing validation - Missing ID..." -ForegroundColor Yellow
$invalidPayload1 = @{
    Preferences = @("preference1", "preference2")
}

try {
    $validationResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method POST -Headers $headers -Body ($invalidPayload1 | ConvertTo-Json)
    Write-Host "⚠️ Validation failed - should have rejected missing ID" -ForegroundColor Yellow
} catch {
    Write-Host "✅ Validation working correctly - rejected missing ID" -ForegroundColor Green
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Cyan
}

# 9. Test validation - Missing Preferences
Write-Host "`n9. Testing validation - Missing Preferences..." -ForegroundColor Yellow
$invalidPayload2 = @{
    ID = $userID
}

try {
    $validationResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method POST -Headers $headers -Body ($invalidPayload2 | ConvertTo-Json)
    Write-Host "⚠️ Validation failed - should have rejected missing Preferences" -ForegroundColor Yellow
} catch {
    Write-Host "✅ Validation working correctly - rejected missing Preferences" -ForegroundColor Green
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Cyan
}

# 10. Test validation - Preferences not array
Write-Host "`n10. Testing validation - Preferences not array..." -ForegroundColor Yellow
$invalidPayload3 = @{
    ID = $userID
    Preferences = "not-an-array"
}

try {
    $validationResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method POST -Headers $headers -Body ($invalidPayload3 | ConvertTo-Json)
    Write-Host "⚠️ Validation failed - should have rejected non-array Preferences" -ForegroundColor Yellow
} catch {
    Write-Host "✅ Validation working correctly - rejected non-array Preferences" -ForegroundColor Green
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Cyan
}

Write-Host "`n=== KYC CRUD TEST COMPLETE ===" -ForegroundColor Green
