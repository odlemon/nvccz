# Test Swagger Endpoints Visibility
$baseUrl = "http://localhost:3000"

Write-Host "Testing Swagger Endpoints Visibility" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green

# 1. Check if Swagger is accessible
Write-Host "1. Checking Swagger documentation accessibility..." -ForegroundColor Yellow
try {
    $swaggerResponse = Invoke-RestMethod -Uri "$baseUrl/api-docs" -Method GET
    Write-Host "Swagger documentation is accessible" -ForegroundColor Green
} catch {
    Write-Host "Failed to access Swagger documentation: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 2. Check if endpoints are in the paths
Write-Host "2. Checking for endpoints in Swagger paths..." -ForegroundColor Yellow

# Get all available paths
$availablePaths = $swaggerResponse.paths.PSObject.Properties.Name
Write-Host "Available paths in Swagger:" -ForegroundColor Cyan
$availablePaths | Sort-Object | ForEach-Object {
    Write-Host "  - $_" -ForegroundColor White
}

# 3. Check specifically for our new endpoints
Write-Host "3. Checking for new endpoints..." -ForegroundColor Yellow

$miniKycEndpoints = @(
    "/mini-kyc",
    "/mini-kyc/status", 
    "/mini-kyc/all"
)

Write-Host "Checking Mini-KYC endpoints:" -ForegroundColor Cyan
foreach ($endpoint in $miniKycEndpoints) {
    if ($availablePaths -contains $endpoint) {
        Write-Host "  ✅ $endpoint - Found" -ForegroundColor Green
        
        # Check what methods are available
        $methods = $swaggerResponse.paths.$endpoint.PSObject.Properties.Name
        Write-Host "    Methods: $($methods -join ', ')" -ForegroundColor Gray
    } else {
        Write-Host "  ❌ $endpoint - Not found" -ForegroundColor Red
    }
}

$companyProfileEndpoints = @(
    "/company-profile",
    "/company-profile/upsert"
)

Write-Host "Checking Company Profile endpoints:" -ForegroundColor Cyan
foreach ($endpoint in $companyProfileEndpoints) {
    if ($availablePaths -contains $endpoint) {
        Write-Host "  ✅ $endpoint - Found" -ForegroundColor Green
        
        # Check what methods are available
        $methods = $swaggerResponse.paths.$endpoint.PSObject.Properties.Name
        Write-Host "    Methods: $($methods -join ', ')" -ForegroundColor Gray
    } else {
        Write-Host "  ❌ $endpoint - Not found" -ForegroundColor Red
    }
}

# 4. Test if we can access the Swagger UI
Write-Host "4. Testing Swagger UI accessibility..." -ForegroundColor Yellow
try {
    $swaggerUIResponse = Invoke-WebRequest -Uri "$baseUrl/api-docs" -Method GET
    if ($swaggerUIResponse.StatusCode -eq 200) {
        Write-Host "  ✅ Swagger UI is accessible" -ForegroundColor Green
        Write-Host "  📖 You can view the full documentation at: $baseUrl/api-docs" -ForegroundColor Cyan
    } else {
        Write-Host "  ❌ Swagger UI returned status: $($swaggerUIResponse.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "  ❌ Failed to access Swagger UI: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Swagger endpoints test complete!" -ForegroundColor Green
Write-Host "If endpoints are found above, they should be visible in the Swagger UI." -ForegroundColor Yellow 