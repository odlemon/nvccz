# Test Swagger Invoice Documentation
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== TEST SWAGGER INVOICE DOCUMENTATION ===" -ForegroundColor Cyan

try {
    # Test Swagger UI endpoint
    Write-Host "`n1. Testing Swagger UI endpoint..." -ForegroundColor Yellow
    $swaggerResponse = Invoke-WebRequest -Uri "$BaseUrl/api-docs" -Method Get
    
    Write-Host "Swagger UI Status: $($swaggerResponse.StatusCode)" -ForegroundColor Green
    Write-Host "Content Length: $($swaggerResponse.Content.Length)" -ForegroundColor White
    
    # Test Swagger JSON endpoint
    Write-Host "`n2. Testing Swagger JSON endpoint..." -ForegroundColor Yellow
    $swaggerJsonResponse = Invoke-WebRequest -Uri "$BaseUrl/api-docs.json" -Method Get
    
    Write-Host "Swagger JSON Status: $($swaggerJsonResponse.StatusCode)" -ForegroundColor Green
    $swaggerJson = $swaggerJsonResponse.Content | ConvertFrom-Json
    
    # Check if invoice paths exist
    Write-Host "`n3. Checking invoice endpoints in Swagger..." -ForegroundColor Yellow
    
    $invoicePaths = @(
        "/api/accounting/invoices",
        "/api/accounting/invoices/{id}",
        "/api/accounting/invoices/summary"
    )
    
    $foundPaths = @()
    $missingPaths = @()
    
    foreach ($path in $invoicePaths) {
        if ($swaggerJson.paths.$path) {
            $foundPaths += $path
            Write-Host "  ✓ Found: $path" -ForegroundColor Green
        } else {
            $missingPaths += $path
            Write-Host "  ✗ Missing: $path" -ForegroundColor Red
        }
    }
    
    # Check invoice schemas
    Write-Host "`n4. Checking invoice schemas..." -ForegroundColor Yellow
    
    $invoiceSchemas = @(
        "Invoice",
        "CreateInvoiceRequest", 
        "UpdateInvoiceRequest",
        "Customer",
        "CreateCustomerRequest",
        "UpdateCustomerRequest"
    )
    
    $foundSchemas = @()
    $missingSchemas = @()
    
    foreach ($schema in $invoiceSchemas) {
        if ($swaggerJson.components.schemas.$schema) {
            $foundSchemas += $schema
            Write-Host "  ✓ Found schema: $schema" -ForegroundColor Green
        } else {
            $missingSchemas += $schema
            Write-Host "  ✗ Missing schema: $schema" -ForegroundColor Red
        }
    }
    
    # Test invoice tags
    Write-Host "`n5. Checking invoice tags..." -ForegroundColor Yellow
    $invoiceTags = @()
    
    foreach ($pathKey in $swaggerJson.paths.PSObject.Properties.Name) {
        if ($pathKey -like "*invoice*") {
            $path = $swaggerJson.paths.$pathKey
            foreach ($method in $path.PSObject.Properties.Name) {
                $operation = $path.$method
                if ($operation.tags) {
                    $invoiceTags += $operation.tags
                }
            }
        }
    }
    
    $uniqueTags = $invoiceTags | Sort-Object | Get-Unique
    Write-Host "  Invoice-related tags found: $($uniqueTags -join ', ')" -ForegroundColor White
    
    # Summary
    Write-Host "`n" + ("="*80) -ForegroundColor Cyan
    Write-Host "SWAGGER INVOICE DOCUMENTATION SUMMARY" -ForegroundColor Green
    Write-Host ("="*80) -ForegroundColor Cyan
    
    Write-Host "`nPaths Found: $($foundPaths.Count) / $($invoicePaths.Count)" -ForegroundColor White
    foreach ($path in $foundPaths) {
        Write-Host "  ✓ $path" -ForegroundColor Green
    }
    foreach ($path in $missingPaths) {
        Write-Host "  ✗ $path" -ForegroundColor Red
    }
    
    Write-Host "`nSchemas Found: $($foundSchemas.Count) / $($invoiceSchemas.Count)" -ForegroundColor White
    foreach ($schema in $foundSchemas) {
        Write-Host "  ✓ $schema" -ForegroundColor Green
    }
    foreach ($schema in $missingSchemas) {
        Write-Host "  ✗ $schema" -ForegroundColor Red
    }
    
    $allFound = ($missingPaths.Count -eq 0) -and ($missingSchemas.Count -eq 0)
    
    Write-Host "`nOVERALL STATUS:" -ForegroundColor Yellow
    if ($allFound) {
        Write-Host "✅ ALL INVOICE ENDPOINTS AND SCHEMAS DOCUMENTED IN SWAGGER!" -ForegroundColor Green
        Write-Host "Swagger documentation is production-ready for invoices." -ForegroundColor Green
    } else {
        Write-Host "⚠️  Some invoice documentation is missing from Swagger." -ForegroundColor Yellow
        Write-Host "Missing paths: $($missingPaths.Count)" -ForegroundColor Red
        Write-Host "Missing schemas: $($missingSchemas.Count)" -ForegroundColor Red
    }
    
    Write-Host "`nSwagger UI URL: $BaseUrl/api-docs" -ForegroundColor Cyan
    Write-Host "Swagger JSON URL: $BaseUrl/api-docs.json" -ForegroundColor Cyan

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}