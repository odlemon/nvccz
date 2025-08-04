# Test Vendor Endpoints
$baseUrl = "http://localhost:3000"
$token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbWR1OGsydjIwMDAyZ..."

$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

Write-Host "=== Testing Vendor Endpoints ===" -ForegroundColor Green

# 1. Create a vendor
Write-Host "`n1. Creating a vendor..." -ForegroundColor Yellow
$vendorData = @{
    name = "Legal Associates"
    taxNumber = "123456789"
    contactPerson = "John Doe"
    email = "contact@legalassociates.com"
    phone = "+263 77 123 4567"
    address = "123 Main Street, Harare"
    paymentTerms = "Net 30"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method POST -Headers $headers -Body $vendorData
    Write-Host "✅ Vendor created successfully" -ForegroundColor Green
    Write-Host "Vendor ID: $($response.data.id)" -ForegroundColor Cyan
    $vendorId = $response.data.id
} catch {
    Write-Host "❌ Failed to create vendor: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 2. Get all vendors
Write-Host "`n2. Getting all vendors..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($response.data.Count) vendors" -ForegroundColor Green
    foreach ($vendor in $response.data) {
        Write-Host "  - $($vendor.name) (ID: $($vendor.id))" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get vendors: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Get vendor by ID
Write-Host "`n3. Getting vendor by ID..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$vendorId" -Method GET -Headers $headers
    Write-Host "✅ Retrieved vendor: $($response.data.name)" -ForegroundColor Green
    Write-Host "  Contact: $($response.data.contactPerson)" -ForegroundColor Cyan
    Write-Host "  Email: $($response.data.email)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get vendor by ID: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Update vendor
Write-Host "`n4. Updating vendor..." -ForegroundColor Yellow
$updateData = @{
    name = "Legal Associates Updated"
    contactPerson = "Jane Smith"
    email = "jane@legalassociates.com"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$vendorId" -Method PUT -Headers $headers -Body $updateData
    Write-Host "✅ Vendor updated successfully" -ForegroundColor Green
    Write-Host "  New name: $($response.data.name)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to update vendor: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Search vendors
Write-Host "`n5. Searching vendors..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors?search=Legal" -Method GET -Headers $headers
    Write-Host "✅ Search results: $($response.data.Count) vendors found" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to search vendors: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Vendor Testing Complete ===" -ForegroundColor Green 