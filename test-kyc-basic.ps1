# Basic KYC Test - Get, Update, Delete
$baseUrl = "http://localhost:3000"

Write-Host "=== BASIC KYC TEST ===" -ForegroundColor Green

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

# 2. Get current KYC (if exists)
Write-Host "`n2. Getting current KYC..." -ForegroundColor Yellow
try {
    $kyc = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method GET -Headers $headers
    if ($kyc.data) {
        Write-Host "✅ KYC found:" -ForegroundColor Green
        Write-Host "ID: $($kyc.data.id)" -ForegroundColor Cyan
        Write-Host "User ID: $($kyc.data.userId)" -ForegroundColor Cyan
        Write-Host "Preferences: $($kyc.data.preferences | ConvertTo-Json)" -ForegroundColor Cyan
    } else {
        Write-Host "ℹ️ No KYC found for this user" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to get KYC: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

# 3. Create/Update KYC with new simplified structure
Write-Host "`n3. Creating/Updating KYC with simplified structure..." -ForegroundColor Yellow
$kycData = @{
    preferences = @{
        theme = "dark"
        language = "en"
        notifications = @{
            email = $true
            sms = $false
            push = $true
        }
        privacy = @{
            shareData = $false
            marketingEmails = $true
        }
    }
}

Write-Host "Payload:" -ForegroundColor Yellow
$kycData | ConvertTo-Json | Write-Host

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method POST -Headers $headers -Body ($kycData | ConvertTo-Json)
    Write-Host "✅ KYC created/updated successfully!" -ForegroundColor Green
    Write-Host "ID: $($response.data.id)" -ForegroundColor Cyan
    Write-Host "User ID: $($response.data.userId)" -ForegroundColor Cyan
    Write-Host "Preferences: $($response.data.preferences | ConvertTo-Json)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create/update KYC: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

# 4. Get updated KYC
Write-Host "`n4. Getting updated KYC..." -ForegroundColor Yellow
try {
    $updatedKyc = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method GET -Headers $headers
    if ($updatedKyc.data) {
        Write-Host "✅ Updated KYC retrieved:" -ForegroundColor Green
        Write-Host "ID: $($updatedKyc.data.id)" -ForegroundColor Cyan
        Write-Host "User ID: $($updatedKyc.data.userId)" -ForegroundColor Cyan
        Write-Host "Preferences: $($updatedKyc.data.preferences | ConvertTo-Json)" -ForegroundColor Cyan
    } else {
        Write-Host "ℹ️ No KYC found after update" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to get updated KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Update KYC with new preferences
Write-Host "`n5. Updating KYC with new preferences..." -ForegroundColor Yellow
$updateData = @{
    preferences = @{
        theme = "light"
        language = "en"
        notifications = @{
            email = $true
            sms = $true
            push = $false
        }
        privacy = @{
            shareData = $true
            marketingEmails = $false
        }
        newPreference = "updated_value"
    }
}

Write-Host "Update payload:" -ForegroundColor Yellow
$updateData | ConvertTo-Json | Write-Host

try {
    $updateResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method PUT -Headers $headers -Body ($updateData | ConvertTo-Json)
    Write-Host "✅ KYC updated successfully!" -ForegroundColor Green
    Write-Host "ID: $($updateResponse.data.id)" -ForegroundColor Cyan
    Write-Host "User ID: $($updateResponse.data.userId)" -ForegroundColor Cyan
    Write-Host "Updated Preferences: $($updateResponse.data.preferences | ConvertTo-Json)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to update KYC: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

# 6. Delete KYC
Write-Host "`n6. Deleting KYC..." -ForegroundColor Yellow
try {
    $deleteResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method DELETE -Headers $headers
    Write-Host "✅ KYC deleted successfully!" -ForegroundColor Green
    Write-Host "Response: $($deleteResponse.message)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to delete KYC: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

# 7. Verify deletion
Write-Host "`n7. Verifying deletion..." -ForegroundColor Yellow
try {
    $verifyKyc = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method GET -Headers $headers
    if ($verifyKyc.data -eq $null) {
        Write-Host "✅ Deletion verified - No KYC data found" -ForegroundColor Green
    } else {
        Write-Host "⚠️ KYC still exists after deletion" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to verify deletion: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Green
