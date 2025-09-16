# Fetch Mini-KYC Data
$baseUrl = "http://localhost:3000"

Write-Host "Fetching Mini-KYC Data" -ForegroundColor Green
Write-Host "======================" -ForegroundColor Green

# 1. Login
Write-Host "1. Authenticating..." -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    $token = $login.token
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
    Write-Host "Authentication successful" -ForegroundColor Green
} catch {
    Write-Host "Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 2. Get current user's KYC
Write-Host "2. Fetching current user's KYC..." -ForegroundColor Yellow
try {
    $kycResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method GET -Headers $headers
    
    if ($kycResponse.data -eq $null) {
        Write-Host "No KYC data found for current user" -ForegroundColor Yellow
    } else {
        Write-Host "KYC data found!" -ForegroundColor Green
        Write-Host "KYC Details:" -ForegroundColor Cyan
        Write-Host "  ID: $($kycResponse.data.id)" -ForegroundColor White
        Write-Host "  User ID: $($kycResponse.data.userId)" -ForegroundColor White
        Write-Host "  Is Completed: $($kycResponse.data.isCompleted)" -ForegroundColor White
        Write-Host "  Created At: $($kycResponse.data.createdAt)" -ForegroundColor White
        Write-Host "  Updated At: $($kycResponse.data.updatedAt)" -ForegroundColor White
        
        Write-Host "KYC Data Fields:" -ForegroundColor Cyan
        $kycResponse.data.data.PSObject.Properties | ForEach-Object {
            Write-Host "  $($_.Name): $($_.Value)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "Failed to fetch KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Get all KYC records (admin view)
Write-Host "3. Fetching all KYC records (admin view)..." -ForegroundColor Yellow
try {
    $allKycResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc/all" -Method GET -Headers $headers
    
    Write-Host "Found $($allKycResponse.data.Length) KYC records" -ForegroundColor Green
    
    if ($allKycResponse.data.Length -gt 0) {
        Write-Host "All KYC Records:" -ForegroundColor Cyan
        $allKycResponse.data | ForEach-Object {
            Write-Host "--- KYC Record ---" -ForegroundColor Yellow
            Write-Host "  ID: $($_.id)" -ForegroundColor White
            Write-Host "  User: $($_.user.firstName) $($_.user.lastName) ($($_.user.email))" -ForegroundColor White
            Write-Host "  Is Completed: $($_.isCompleted)" -ForegroundColor White
            Write-Host "  Created At: $($_.createdAt)" -ForegroundColor White
            Write-Host "  Updated At: $($_.updatedAt)" -ForegroundColor White
            
            Write-Host "  Data Fields:" -ForegroundColor White
            $_.data.PSObject.Properties | ForEach-Object {
                Write-Host "    $($_.Name): $($_.Value)" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "Failed to fetch all KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Get KYC status
Write-Host "4. Fetching KYC status..." -ForegroundColor Yellow
try {
    $statusResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc/status" -Method GET -Headers $headers
    
    Write-Host "KYC Status:" -ForegroundColor Green
    Write-Host "  Is Completed: $($statusResponse.data.isCompleted)" -ForegroundColor White
    Write-Host "  User ID: $($statusResponse.data.userId)" -ForegroundColor White
} catch {
    Write-Host "Failed to fetch KYC status: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Data fetch complete!" -ForegroundColor Green 