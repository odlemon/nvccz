# Create and Fetch Mini-KYC Data
$baseUrl = "http://localhost:3000"

Write-Host "Creating and Fetching Mini-KYC Data" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green

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

# 2. Create KYC data
Write-Host "2. Creating KYC data..." -ForegroundColor Yellow
$kycPayload = @{
    data = @{
        businessType = "Technology"
        companySize = "25-50"
        preferredCurrency = "USD"
        taxId = "TAX123456789"
        industry = "Software Development"
        annualRevenue = "2000000-5000000"
        contactPerson = "John Smith"
        phoneNumber = "+1234567890"
        businessAddress = "456 Tech Avenue, San Francisco, CA 94105"
        website = "https://techcompany.com"
        foundedYear = "2020"
        employeeCount = "35"
        businessLicense = "BL-2020-001"
        bankAccount = "1234567890"
        paymentMethods = @("Credit Card", "Bank Transfer", "PayPal")
        timezone = "PST"
        language = "English"
        customField1 = "This is a custom field"
        customField2 = "Another dynamic field"
    }
    isCompleted = $true
}

Write-Host "Creating KYC with payload:" -ForegroundColor Cyan
$kycPayload | ConvertTo-Json -Depth 3 | Write-Host

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method POST -Headers $headers -Body ($kycPayload | ConvertTo-Json -Depth 3)
    Write-Host "KYC created successfully!" -ForegroundColor Green
    Write-Host "KYC ID: $($createResponse.data.id)" -ForegroundColor Cyan
} catch {
    Write-Host "Failed to create KYC: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 3. Fetch the created KYC data
Write-Host "3. Fetching created KYC data..." -ForegroundColor Yellow
try {
    $kycResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method GET -Headers $headers
    
    Write-Host "KYC data retrieved successfully!" -ForegroundColor Green
    Write-Host "KYC Details:" -ForegroundColor Cyan
    Write-Host "  ID: $($kycResponse.data.id)" -ForegroundColor White
    Write-Host "  User ID: $($kycResponse.data.userId)" -ForegroundColor White
    Write-Host "  Is Completed: $($kycResponse.data.isCompleted)" -ForegroundColor White
    Write-Host "  Created At: $($kycResponse.data.createdAt)" -ForegroundColor White
    Write-Host "  Updated At: $($kycResponse.data.updatedAt)" -ForegroundColor White
    
    Write-Host "KYC Data Fields:" -ForegroundColor Cyan
    $kycResponse.data.data.PSObject.Properties | ForEach-Object {
        if ($_.Value -is [array]) {
            Write-Host "  $($_.Name): [$($_.Value -join ', ')]" -ForegroundColor White
        } else {
            Write-Host "  $($_.Name): $($_.Value)" -ForegroundColor White
        }
    }
} catch {
    Write-Host "Failed to fetch KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Get all KYC records (admin view)
Write-Host "4. Fetching all KYC records (admin view)..." -ForegroundColor Yellow
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
                if ($_.Value -is [array]) {
                    Write-Host "    $($_.Name): [$($_.Value -join ', ')]" -ForegroundColor Gray
                } else {
                    Write-Host "    $($_.Name): $($_.Value)" -ForegroundColor Gray
                }
            }
        }
    }
} catch {
    Write-Host "Failed to fetch all KYC: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Get KYC status
Write-Host "5. Fetching KYC status..." -ForegroundColor Yellow
try {
    $statusResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc/status" -Method GET -Headers $headers
    
    Write-Host "KYC Status:" -ForegroundColor Green
    Write-Host "  Is Completed: $($statusResponse.data.isCompleted)" -ForegroundColor White
    Write-Host "  User ID: $($statusResponse.data.userId)" -ForegroundColor White
} catch {
    Write-Host "Failed to fetch KYC status: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Create and fetch complete!" -ForegroundColor Green 