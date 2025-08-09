# Test Swagger Documentation for New Endpoints
$baseUrl = "http://localhost:3000"

Write-Host "Testing Swagger Documentation for New Endpoints" -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Green

# 1. Check if Swagger is accessible
Write-Host "1. Checking Swagger documentation accessibility..." -ForegroundColor Yellow
try {
    $swaggerResponse = Invoke-RestMethod -Uri "$baseUrl/api-docs" -Method GET
    Write-Host "Swagger documentation is accessible" -ForegroundColor Green
} catch {
    Write-Host "Failed to access Swagger documentation: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 2. Check if new endpoints are documented
Write-Host "2. Checking for new endpoints in Swagger..." -ForegroundColor Yellow

# Check for Mini-KYC endpoints
$miniKycEndpoints = @(
    "/mini-kyc",
    "/mini-kyc/status", 
    "/mini-kyc/all"
)

Write-Host "Checking Mini-KYC endpoints:" -ForegroundColor Cyan
foreach ($endpoint in $miniKycEndpoints) {
    if ($swaggerResponse.paths.PSObject.Properties.Name -contains $endpoint) {
        Write-Host "  ✅ $endpoint - Found" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $endpoint - Not found" -ForegroundColor Red
    }
}

# Check for Company Profile endpoints
$companyProfileEndpoints = @(
    "/company-profile",
    "/company-profile/upsert"
)

Write-Host "Checking Company Profile endpoints:" -ForegroundColor Cyan
foreach ($endpoint in $companyProfileEndpoints) {
    if ($swaggerResponse.paths.PSObject.Properties.Name -contains $endpoint) {
        Write-Host "  ✅ $endpoint - Found" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $endpoint - Not found" -ForegroundColor Red
    }
}

# 3. Check if new schemas are documented
Write-Host "3. Checking for new schemas in Swagger..." -ForegroundColor Yellow

$newSchemas = @(
    "MiniKyc",
    "CreateMiniKycRequest", 
    "UpdateMiniKycRequest",
    "CompanyProfile",
    "CreateCompanyProfileRequest",
    "UpdateCompanyProfileRequest"
)

Write-Host "Checking new schemas:" -ForegroundColor Cyan
foreach ($schema in $newSchemas) {
    if ($swaggerResponse.components.schemas.PSObject.Properties.Name -contains $schema) {
        Write-Host "  ✅ $schema - Found" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $schema - Not found" -ForegroundColor Red
    }
}

# 4. Check if User schema includes backgroundImage
Write-Host "4. Checking User schema for backgroundImage field..." -ForegroundColor Yellow
if ($swaggerResponse.components.schemas.User.properties.backgroundImage) {
    Write-Host "  ✅ User schema includes backgroundImage field" -ForegroundColor Green
} else {
    Write-Host "  ❌ User schema missing backgroundImage field" -ForegroundColor Red
}

# 5. Check if CreateUserRequest and UpdateUserRequest include backgroundImage
Write-Host "5. Checking User request schemas for backgroundImage field..." -ForegroundColor Yellow

if ($swaggerResponse.components.schemas.CreateUserRequest.properties.backgroundImage) {
    Write-Host "  ✅ CreateUserRequest includes backgroundImage field" -ForegroundColor Green
} else {
    Write-Host "  ❌ CreateUserRequest missing backgroundImage field" -ForegroundColor Red
}

if ($swaggerResponse.components.schemas.UpdateUserRequest.properties.backgroundImage) {
    Write-Host "  ✅ UpdateUserRequest includes backgroundImage field" -ForegroundColor Green
} else {
    Write-Host "  ❌ UpdateUserRequest missing backgroundImage field" -ForegroundColor Red
}

# 6. Test actual API endpoints to ensure they work
Write-Host "6. Testing actual API endpoints..." -ForegroundColor Yellow

# Login first
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    $token = $login.token
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
    Write-Host "  ✅ Authentication successful" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# Test Mini-KYC endpoint
try {
    $kycResponse = Invoke-RestMethod -Uri "$baseUrl/api/mini-kyc" -Method GET -Headers $headers
    Write-Host "  ✅ Mini-KYC GET endpoint working" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Mini-KYC GET endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test Company Profile endpoint
try {
    $profileResponse = Invoke-RestMethod -Uri "$baseUrl/api/company-profile" -Method GET -Headers $headers
    Write-Host "  ✅ Company Profile GET endpoint working" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Company Profile GET endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Swagger documentation test complete!" -ForegroundColor Green
Write-Host "Check the results above to ensure all new endpoints and schemas are properly documented." -ForegroundColor Yellow 