# Test Vendor Endpoints with Proper Authentication
$baseUrl = "http://localhost:3000"

Write-Host "=== Testing Vendor Endpoints ===" -ForegroundColor Green

# 1. Login and get token
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
$login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
$token = $login.token
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}
Write-Host "✅ Authentication successful" -ForegroundColor Green

# 2. Create a vendor
Write-Host "`n2. Creating a vendor..." -ForegroundColor Yellow
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

# 3. Create another vendor
Write-Host "`n3. Creating another vendor..." -ForegroundColor Yellow
$vendorData2 = @{
    name = "Office Supplies Co."
    taxNumber = "987654321"
    contactPerson = "Mary Johnson"
    email = "orders@officesupplies.co.zw"
    phone = "+263 77 987 6543"
    address = "456 Business Ave, Harare"
    paymentTerms = "Net 15"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method POST -Headers $headers -Body $vendorData2
    Write-Host "✅ Second vendor created successfully" -ForegroundColor Green
    Write-Host "Vendor ID: $($response.data.id)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create second vendor: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Get all vendors
Write-Host "`n4. Getting all vendors..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($response.data.Count) vendors" -ForegroundColor Green
    foreach ($vendor in $response.data) {
        Write-Host "  - $($vendor.name) (ID: $($vendor.id))" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get vendors: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Get vendor by ID
Write-Host "`n5. Getting vendor by ID..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$vendorId" -Method GET -Headers $headers
    Write-Host "✅ Retrieved vendor: $($response.data.name)" -ForegroundColor Green
    Write-Host "  Contact: $($response.data.contactPerson)" -ForegroundColor Cyan
    Write-Host "  Email: $($response.data.email)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to get vendor by ID: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Update vendor
Write-Host "`n6. Updating vendor..." -ForegroundColor Yellow
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

# 7. Search vendors
Write-Host "`n7. Searching vendors..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors?search=Legal" -Method GET -Headers $headers
    Write-Host "✅ Search results: $($response.data.Count) vendors found" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to search vendors: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Vendor Testing Complete ===" -ForegroundColor Green 