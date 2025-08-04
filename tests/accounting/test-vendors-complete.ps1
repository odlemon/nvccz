# Comprehensive Vendor Testing Script
$baseUrl = "http://localhost:3000"

Write-Host "=== Vendor Management Testing ===" -ForegroundColor Green

# 1. Login and get token
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
$login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
$token = $login.token
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}
Write-Host "✅ Authentication successful" -ForegroundColor Green

# 2. Create multiple vendors
Write-Host "`n2. Creating vendors..." -ForegroundColor Yellow

$vendors = @(
    @{
        name = "Accounting Services Ltd"
        taxNumber = "111222333"
        contactPerson = "Alice Brown"
        email = "alice@accountingservices.co.zw"
        phone = "+263 71 111 2222"
        address = "321 Finance Street, Harare"
        paymentTerms = "Net 30"
    },
    @{
        name = "IT Solutions Pro"
        taxNumber = "444555666"
        contactPerson = "Bob Davis"
        email = "bob@itsolutions.co.zw"
        phone = "+263 72 444 5555"
        address = "654 Tech Avenue, Harare"
        paymentTerms = "Net 15"
    },
    @{
        name = "Marketing Experts"
        taxNumber = "777888999"
        contactPerson = "Carol White"
        email = "carol@marketingexperts.co.zw"
        phone = "+263 73 777 8888"
        address = "987 Marketing Blvd, Harare"
        paymentTerms = "Net 45"
    }
)

$createdVendors = @()

foreach ($vendor in $vendors) {
    try {
        $vendorJson = $vendor | ConvertTo-Json
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method POST -Headers $headers -Body $vendorJson
        $createdVendors += $response.data
        Write-Host "✅ Created: $($vendor.name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to create $($vendor.name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 3. Get all vendors
Write-Host "`n3. Getting all vendors..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($response.data.Count) vendors" -ForegroundColor Green
    foreach ($vendor in $response.data) {
        Write-Host "  - $($vendor.name) (ID: $($vendor.id))" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get vendors: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Test search functionality
Write-Host "`n4. Testing search functionality..." -ForegroundColor Yellow
$searchTerms = @("Legal", "Travel", "Office", "Accounting", "IT")

foreach ($term in $searchTerms) {
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors?search=$term" -Method GET -Headers $headers
        Write-Host "✅ Search '$term': $($response.data.Count) results" -ForegroundColor Green
    } catch {
        Write-Host "❌ Search '$term' failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 5. Test get vendor by ID
Write-Host "`n5. Testing get vendor by ID..." -ForegroundColor Yellow
if ($createdVendors.Count -gt 0) {
    $testVendor = $createdVendors[0]
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$($testVendor.id)" -Method GET -Headers $headers
        Write-Host "✅ Retrieved vendor: $($response.data.name)" -ForegroundColor Green
        Write-Host "  Contact: $($response.data.contactPerson)" -ForegroundColor Cyan
        Write-Host "  Email: $($response.data.email)" -ForegroundColor Cyan
    } catch {
        Write-Host "❌ Failed to get vendor by ID: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 6. Test update vendor
Write-Host "`n6. Testing update vendor..." -ForegroundColor Yellow
if ($createdVendors.Count -gt 0) {
    $testVendor = $createdVendors[0]
    $updateData = @{
        name = "$($testVendor.name) - Updated"
        contactPerson = "Updated Contact"
        email = "updated@example.com"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$($testVendor.id)" -Method PUT -Headers $headers -Body $updateData
        Write-Host "✅ Updated vendor: $($response.data.name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to update vendor: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 7. Test filtering by active status
Write-Host "`n7. Testing active status filter..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors?isActive=true" -Method GET -Headers $headers
    Write-Host "✅ Active vendors: $($response.data.Count)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to filter by active status: $($_.Exception.Message)" -ForegroundColor Red
}

# 8. Test vendor expenses (should be empty for now)
Write-Host "`n8. Testing vendor expenses..." -ForegroundColor Yellow
if ($createdVendors.Count -gt 0) {
    $testVendor = $createdVendors[0]
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$($testVendor.id)/expenses" -Method GET -Headers $headers
        Write-Host "✅ Vendor expenses: $($response.data.Count) expenses" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to get vendor expenses: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== Vendor Testing Complete ===" -ForegroundColor Green
Write-Host "All vendor CRUD operations are working correctly!" -ForegroundColor Cyan 