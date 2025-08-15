# Simple KYC CRUD Test
$baseUrl = "http://localhost:3000"

Write-Host "=== Testing KYC CRUD Operations ===" -ForegroundColor Green

# Step 1: Login
Write-Host "`n1. Logging in..." -ForegroundColor Yellow
try {
    $loginBody = '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
    
    Write-Host "Login successful!" -ForegroundColor Green
    $token = $loginResponse.data.token
    $userID = $loginResponse.data.user.id
    
    Write-Host "Token: $($token.Substring(0, 50))..." -ForegroundColor Cyan
    Write-Host "User ID: $userID" -ForegroundColor Cyan
    
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
} catch {
    Write-Host "Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Create KYC
Write-Host "`n2. Creating KYC..." -ForegroundColor Yellow
try {
    $createBody = @{
        ID = $userID
        Preferences = @("preference1", "preference2", "preference3")
    } | ConvertTo-Json
    
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method POST -Headers $headers -Body $createBody
    Write-Host "Create successful!" -ForegroundColor Green
    Write-Host "Response: $($createResponse | ConvertTo-Json)" -ForegroundColor White
} catch {
    Write-Host "Create failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 3: Get KYC
Write-Host "`n3. Getting KYC..." -ForegroundColor Yellow
try {
    $getResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc?userId=$userID" -Method GET -Headers $headers
    Write-Host "Get successful!" -ForegroundColor Green
    Write-Host "Response: $($getResponse | ConvertTo-Json)" -ForegroundColor White
} catch {
    Write-Host "Get failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 4: Update KYC
Write-Host "`n4. Updating KYC..." -ForegroundColor Yellow
try {
    $updateBody = @{
        ID = $userID
        Preferences = @("updated-preference1", "updated-preference2", "new-preference4")
    } | ConvertTo-Json
    
    $updateResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method PUT -Headers $headers -Body $updateBody
    Write-Host "Update successful!" -ForegroundColor Green
    Write-Host "Response: $($updateResponse | ConvertTo-Json)" -ForegroundColor White
} catch {
    Write-Host "Update failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 5: Verify Update
Write-Host "`n5. Verifying update..." -ForegroundColor Yellow
try {
    $verifyResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc?userId=$userID" -Method GET -Headers $headers
    Write-Host "Verify successful!" -ForegroundColor Green
    Write-Host "Response: $($verifyResponse | ConvertTo-Json)" -ForegroundColor White
} catch {
    Write-Host "Verify failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 6: Delete KYC
Write-Host "`n6. Deleting KYC..." -ForegroundColor Yellow
try {
    $deleteResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc?userId=$userID" -Method DELETE -Headers $headers
    Write-Host "Delete successful!" -ForegroundColor Green
    Write-Host "Response: $($deleteResponse | ConvertTo-Json)" -ForegroundColor White
} catch {
    Write-Host "Delete failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 7: Verify Deletion
Write-Host "`n7. Verifying deletion..." -ForegroundColor Yellow
try {
    $finalResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc?userId=$userID" -Method GET -Headers $headers
    Write-Host "Final check response: $($finalResponse | ConvertTo-Json)" -ForegroundColor White
} catch {
    Write-Host "Final check failed (expected if deleted): $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "`n=== CRUD Test Completed ===" -ForegroundColor Green 