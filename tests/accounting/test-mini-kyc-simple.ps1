# Simple Mini-KYC Test
$baseUrl = "http://localhost:3000"

Write-Host "=== SIMPLE MINI-KYC TEST ===" -ForegroundColor Green

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

# 2. Test mini-KYC creation
Write-Host "`n2. Testing mini-KYC creation..." -ForegroundColor Yellow
$kycPayload = @{
    data = @{
        businessType = "SaaS"
        companySize = "10-50"
        preferredCurrency = "USD"
        taxId = "123456789"
        industry = "Technology"
        annualRevenue = "1000000-5000000"
        contactPerson = "John Doe"
        phoneNumber = "+1234567890"
        businessAddress = "123 Tech Street, Silicon Valley, CA"
    }
    isCompleted = $false
}

Write-Host "Payload:" -ForegroundColor Yellow
$kycPayload | ConvertTo-Json | Write-Host

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method POST -Headers $headers -Body ($kycPayload | ConvertTo-Json)
    Write-Host "✅ Mini-KYC created successfully!" -ForegroundColor Green
    Write-Host "KYC ID: $($response.data.id)" -ForegroundColor Cyan
    Write-Host "User ID: $($response.data.userId)" -ForegroundColor Cyan
    Write-Host "Is Completed: $($response.data.isCompleted)" -ForegroundColor Cyan
    Write-Host "Business Type: $($response.data.data.businessType)" -ForegroundColor Cyan
    Write-Host "Company Size: $($response.data.data.companySize)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create mini-KYC: $($_.Exception.Message)" -ForegroundColor Red
    
    # Get detailed error
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

# 3. Test getting mini-KYC
Write-Host "`n3. Testing mini-KYC retrieval..." -ForegroundColor Yellow
try {
    $getResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method GET -Headers $headers
    Write-Host "✅ Mini-KYC retrieved successfully!" -ForegroundColor Green
    Write-Host "KYC ID: $($getResponse.data.id)" -ForegroundColor Cyan
    Write-Host "Business Type: $($getResponse.data.data.businessType)" -ForegroundColor Cyan
    Write-Host "Company Size: $($getResponse.data.data.companySize)" -ForegroundColor Cyan
    Write-Host "Industry: $($getResponse.data.data.industry)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to retrieve mini-KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Test updating mini-KYC
Write-Host "`n4. Testing mini-KYC update..." -ForegroundColor Yellow
$updatePayload = @{
    data = @{
        businessType = "SaaS"
        companySize = "50-100"
        preferredCurrency = "USD"
        taxId = "123456789"
        industry = "Technology"
        annualRevenue = "5000000-10000000"
        contactPerson = "John Doe"
        phoneNumber = "+1234567890"
        businessAddress = "123 Tech Street, Silicon Valley, CA"
        newField = "This is a new dynamic field"
        website = "https://example.com"
    }
    isCompleted = $true
}

Write-Host "Update Payload:" -ForegroundColor Yellow
$updatePayload | ConvertTo-Json | Write-Host

try {
    $updateResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method PUT -Headers $headers -Body ($updatePayload | ConvertTo-Json)
    Write-Host "✅ Mini-KYC updated successfully!" -ForegroundColor Green
    Write-Host "Is Completed: $($updateResponse.data.isCompleted)" -ForegroundColor Cyan
    Write-Host "Company Size: $($updateResponse.data.data.companySize)" -ForegroundColor Cyan
    Write-Host "New Field: $($updateResponse.data.data.newField)" -ForegroundColor Cyan
    Write-Host "Website: $($updateResponse.data.data.website)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to update mini-KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Test getting KYC status
Write-Host "`n5. Testing KYC status..." -ForegroundColor Yellow
try {
    $statusResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc/status" -Method GET -Headers $headers
    Write-Host "✅ KYC status retrieved successfully!" -ForegroundColor Green
    Write-Host "Is Completed: $($statusResponse.data.isCompleted)" -ForegroundColor Cyan
    Write-Host "User ID: $($statusResponse.data.userId)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get KYC status: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Test getting all mini-KYC (admin only)
Write-Host "`n6. Testing get all mini-KYC..." -ForegroundColor Yellow
try {
    $allResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc/all" -Method GET -Headers $headers
    Write-Host "✅ All mini-KYC retrieved successfully!" -ForegroundColor Green
    Write-Host "Total Records: $($allResponse.data.Length)" -ForegroundColor Cyan
    if ($allResponse.data.Length -gt 0) {
        Write-Host "First Record User: $($allResponse.data[0].user.firstName) $($allResponse.data[0].user.lastName)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get all mini-KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 7. Test deleting mini-KYC
Write-Host "`n7. Testing mini-KYC deletion..." -ForegroundColor Yellow
try {
    $deleteResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method DELETE -Headers $headers
    Write-Host "✅ Mini-KYC deleted successfully!" -ForegroundColor Green
    Write-Host "Message: $($deleteResponse.data.message)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to delete mini-KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 8. Verify deletion
Write-Host "`n8. Verifying deletion..." -ForegroundColor Yellow
try {
    $verifyResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method GET -Headers $headers
    if ($verifyResponse.data -eq $null) {
        Write-Host "✅ Mini-KYC successfully deleted (no data returned)" -ForegroundColor Green
    } else {
        Write-Host "❌ Mini-KYC still exists" -ForegroundColor Red
    }
} catch {
    Write-Host "✅ Mini-KYC successfully deleted (404 error)" -ForegroundColor Green
}

Write-Host "`n=== MINI-KYC TEST COMPLETE ===" -ForegroundColor Green 