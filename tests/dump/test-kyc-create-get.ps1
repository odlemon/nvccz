# Simple KYC Create and Get Test
$baseUrl = "http://localhost:3000"

Write-Host "=== KYC CREATE AND GET TEST ===" -ForegroundColor Green

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

# 2. Create new KYC with simplified structure
Write-Host "`n2. Creating new KYC..." -ForegroundColor Yellow
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
        customSetting = "test_value"
    }
}

Write-Host "Creating KYC with data:" -ForegroundColor Yellow
$kycData | ConvertTo-Json | Write-Host

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method POST -Headers $headers -Body ($kycData | ConvertTo-Json)
    Write-Host "✅ KYC created successfully!" -ForegroundColor Green
    Write-Host "KYC ID: $($createResponse.data.id)" -ForegroundColor Cyan
    Write-Host "User ID: $($createResponse.data.userId)" -ForegroundColor Cyan
    Write-Host "Created at: $($createResponse.data.createdAt)" -ForegroundColor Cyan
    Write-Host "Updated at: $($createResponse.data.updatedAt)" -ForegroundColor Cyan
    Write-Host "Preferences: $($createResponse.data.preferences | ConvertTo-Json)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create KYC: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
    exit
}

# 3. Get the created KYC data
Write-Host "`n3. Getting KYC data..." -ForegroundColor Yellow
try {
    $getResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method GET -Headers $headers
    if ($getResponse.data) {
        Write-Host "✅ KYC data retrieved successfully!" -ForegroundColor Green
        Write-Host "Full KYC object:" -ForegroundColor Yellow
        $getResponse.data | ConvertTo-Json | Write-Host
        
        Write-Host "`nSummary:" -ForegroundColor Yellow
        Write-Host "ID: $($getResponse.data.id)" -ForegroundColor Cyan
        Write-Host "User ID: $($getResponse.data.userId)" -ForegroundColor Cyan
        Write-Host "Created: $($getResponse.data.createdAt)" -ForegroundColor Cyan
        Write-Host "Updated: $($getResponse.data.updatedAt)" -ForegroundColor Cyan
        
        Write-Host "`nPreferences breakdown:" -ForegroundColor Yellow
        $prefs = $getResponse.data.preferences
        Write-Host "Theme: $($prefs.theme)" -ForegroundColor Cyan
        Write-Host "Language: $($prefs.language)" -ForegroundColor Cyan
        Write-Host "Email notifications: $($prefs.notifications.email)" -ForegroundColor Cyan
        Write-Host "SMS notifications: $($prefs.notifications.sms)" -ForegroundColor Cyan
        Write-Host "Push notifications: $($prefs.notifications.push)" -ForegroundColor Cyan
        Write-Host "Share data: $($prefs.privacy.shareData)" -ForegroundColor Cyan
        Write-Host "Marketing emails: $($prefs.privacy.marketingEmails)" -ForegroundColor Cyan
        Write-Host "Custom setting: $($prefs.customSetting)" -ForegroundColor Cyan
    } else {
        Write-Host "ℹ️ No KYC data found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to get KYC: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Green
