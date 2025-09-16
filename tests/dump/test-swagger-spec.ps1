# Test Swagger Spec Content
$baseUrl = "http://localhost:3000"

Write-Host "Testing Swagger Spec Content" -ForegroundColor Green
Write-Host "============================" -ForegroundColor Green

# 1. Check the debug endpoint
Write-Host "1. Checking debug endpoint..." -ForegroundColor Yellow
try {
    $debugResponse = Invoke-RestMethod -Uri "$baseUrl/api-spec" -Method GET
    Write-Host "Debug endpoint accessible" -ForegroundColor Green
    Write-Host "Total paths: $($debugResponse.totalPaths)" -ForegroundColor Cyan
    Write-Host "Environment: $($debugResponse.environment)" -ForegroundColor Cyan
    
    Write-Host "Available paths:" -ForegroundColor Yellow
    $debugResponse.paths | Sort-Object | ForEach-Object {
        Write-Host "  - $_" -ForegroundColor White
    }
} catch {
    Write-Host "Debug endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 2. Check the actual Swagger spec
Write-Host "2. Checking actual Swagger spec..." -ForegroundColor Yellow
try {
    $swaggerResponse = Invoke-RestMethod -Uri "$baseUrl/api-docs" -Method GET
    Write-Host "Swagger spec accessible" -ForegroundColor Green
    
    # Get all paths
    $paths = $swaggerResponse.paths.PSObject.Properties.Name
    Write-Host "Total paths in spec: $($paths.Count)" -ForegroundColor Cyan
    
    # Check for our specific endpoints
    Write-Host "Checking for our endpoints:" -ForegroundColor Yellow
    
    $ourEndpoints = @(
        "/mini-kyc",
        "/mini-kyc/status", 
        "/mini-kyc/all",
        "/company-profile",
        "/company-profile/upsert"
    )
    
    foreach ($endpoint in $ourEndpoints) {
        if ($paths -contains $endpoint) {
            Write-Host "  ✅ $endpoint - Found" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $endpoint - Not found" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "Swagger spec failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Test complete!" -ForegroundColor Green 