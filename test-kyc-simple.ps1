# Simple KYC Test
$baseUrl = "http://localhost:3000"

Write-Host "=== SIMPLE KYC TEST ===" -ForegroundColor Green

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

# 2. Create KYC
Write-Host "`n2. Creating KYC..." -ForegroundColor Yellow

$kycPayload = @{
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
$kycPayload | ConvertTo-Json | Write-Host

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method POST -Headers $headers -Body ($kycPayload | ConvertTo-Json)
    Write-Host "✅ KYC created successfully!" -ForegroundColor Green
    Write-Host "KYC ID: $($response.data.id)" -ForegroundColor Cyan
    Write-Host "User ID: $($response.data.userId)" -ForegroundColor Cyan
    Write-Host "Preferences: $($response.data.preferences | ConvertTo-Json)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create KYC: $($_.Exception.Message)" -ForegroundColor Red
    
    # Get detailed error
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

# 3. Get KYC
Write-Host "`n3. Getting KYC..." -ForegroundColor Yellow
try {
    $getResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method GET -Headers $headers
    if ($getResponse.data) {
        Write-Host "✅ KYC retrieved successfully!" -ForegroundColor Green
        Write-Host "ID: $($getResponse.data.id)" -ForegroundColor Cyan
        Write-Host "User ID: $($getResponse.data.userId)" -ForegroundColor Cyan
        Write-Host "Preferences: $($getResponse.data.preferences | ConvertTo-Json)" -ForegroundColor Cyan
    } else {
        Write-Host "ℹ️ No KYC found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to get KYC: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Green 