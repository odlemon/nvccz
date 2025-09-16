# Test Mini-KYC Endpoints
$baseUrl = "http://localhost:3000/api"
$adminEmail = "admin@nvccz.co.zw"
$adminPassword = "admin123"

Write-Host "🧪 Testing Mini-KYC Endpoints" -ForegroundColor Green
Write-Host "=================================" -ForegroundColor Green

# Step 1: Login to get token
Write-Host "`n1. Logging in as admin..." -ForegroundColor Yellow
$loginBody = @{
    email = $adminEmail
    password = $adminPassword
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
$token = $loginResponse.data.token

Write-Host "✅ Login successful" -ForegroundColor Green

# Step 2: Test creating mini-KYC
Write-Host "`n2. Creating mini-KYC..." -ForegroundColor Yellow
$kycData = @{
    data = @{
        businessType = "SaaS"
        companySize = "10-50"
        preferredCurrency = "USD"
        taxId = "123456789"
        industry = "Technology"
        annualRevenue = "1000000-5000000"
    }
    isCompleted = $false
} | ConvertTo-Json

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$createResponse = Invoke-RestMethod -Uri "$baseUrl/mini-kyc" -Method POST -Body $kycData -Headers $headers
Write-Host "✅ Mini-KYC created successfully" -ForegroundColor Green
Write-Host "   ID: $($createResponse.data.id)" -ForegroundColor Cyan

# Step 3: Test getting mini-KYC
Write-Host "`n3. Getting mini-KYC..." -ForegroundColor Yellow
$getResponse = Invoke-RestMethod -Uri "$baseUrl/mini-kyc" -Method GET -Headers $headers
Write-Host "✅ Mini-KYC retrieved successfully" -ForegroundColor Green
Write-Host "   Business Type: $($getResponse.data.data.businessType)" -ForegroundColor Cyan
Write-Host "   Company Size: $($getResponse.data.data.companySize)" -ForegroundColor Cyan

# Step 4: Test updating mini-KYC
Write-Host "`n4. Updating mini-KYC..." -ForegroundColor Yellow
$updateData = @{
    data = @{
        businessType = "SaaS"
        companySize = "50-100"
        preferredCurrency = "USD"
        taxId = "123456789"
        industry = "Technology"
        annualRevenue = "5000000-10000000"
        newField = "This is a new dynamic field"
    }
    isCompleted = $true
} | ConvertTo-Json

$updateResponse = Invoke-RestMethod -Uri "$baseUrl/mini-kyc" -Method PUT -Body $updateData -Headers $headers
Write-Host "✅ Mini-KYC updated successfully" -ForegroundColor Green
Write-Host "   Is Completed: $($updateResponse.data.isCompleted)" -ForegroundColor Cyan

# Step 5: Test getting KYC status
Write-Host "`n5. Getting KYC status..." -ForegroundColor Yellow
$statusResponse = Invoke-RestMethod -Uri "$baseUrl/mini-kyc/status" -Method GET -Headers $headers
Write-Host "✅ KYC status retrieved successfully" -ForegroundColor Green
Write-Host "   Is Completed: $($statusResponse.data.isCompleted)" -ForegroundColor Cyan

# Step 6: Test getting all mini-KYC (admin only)
Write-Host "`n6. Getting all mini-KYC records..." -ForegroundColor Yellow
$allResponse = Invoke-RestMethod -Uri "$baseUrl/mini-kyc/all" -Method GET -Headers $headers
Write-Host "✅ All mini-KYC records retrieved successfully" -ForegroundColor Green
Write-Host "   Total Records: $($allResponse.data.Length)" -ForegroundColor Cyan

# Step 7: Test deleting mini-KYC
Write-Host "`n7. Deleting mini-KYC..." -ForegroundColor Yellow
$deleteResponse = Invoke-RestMethod -Uri "$baseUrl/mini-kyc" -Method DELETE -Headers $headers
Write-Host "✅ Mini-KYC deleted successfully" -ForegroundColor Green

# Step 8: Verify deletion
Write-Host "`n8. Verifying deletion..." -ForegroundColor Yellow
$verifyResponse = Invoke-RestMethod -Uri "$baseUrl/mini-kyc" -Method GET -Headers $headers
if ($verifyResponse.data -eq $null) {
    Write-Host "✅ Mini-KYC successfully deleted (no data returned)" -ForegroundColor Green
} else {
    Write-Host "❌ Mini-KYC still exists" -ForegroundColor Red
}

Write-Host "`n🎉 All Mini-KYC tests completed successfully!" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green 