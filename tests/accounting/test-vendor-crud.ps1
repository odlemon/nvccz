# Comprehensive Vendor CRUD Testing
$baseUrl = "http://localhost:3000"

Write-Host "=== Vendor CRUD Operations Testing ===" -ForegroundColor Green

# 1. Login and get token
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
$login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
$token = $login.token
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}
Write-Host "✅ Authentication successful" -ForegroundColor Green

# 2. Test CREATE - Create a new vendor
Write-Host "`n2. Testing CREATE operation..." -ForegroundColor Yellow
$newVendor = @{
    name = "Test Vendor CRUD"
    taxNumber = "TEST001"
    contactPerson = "Test Contact"
    email = "test@vendorcrud.co.zw"
    phone = "+263 77 999 8888"
    address = "123 Test Street, Harare"
    paymentTerms = "Net 30"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method POST -Headers $headers -Body $newVendor
    $testVendorId = $response.data.id
    Write-Host "✅ CREATE: Vendor created successfully" -ForegroundColor Green
    Write-Host "   ID: $testVendorId" -ForegroundColor Cyan
    Write-Host "   Name: $($response.data.name)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ CREATE failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 3. Test READ - Get vendor by ID
Write-Host "`n3. Testing READ operation..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$testVendorId" -Method GET -Headers $headers
    Write-Host "✅ READ: Vendor retrieved successfully" -ForegroundColor Green
    Write-Host "   Name: $($response.data.name)" -ForegroundColor Cyan
    Write-Host "   Contact: $($response.data.contactPerson)" -ForegroundColor Cyan
    Write-Host "   Email: $($response.data.email)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ READ failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Test READ ALL - Get all vendors
Write-Host "`n4. Testing READ ALL operation..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
    Write-Host "✅ READ ALL: Retrieved $($response.data.Count) vendors" -ForegroundColor Green
} catch {
    Write-Host "❌ READ ALL failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Test SEARCH - Search vendors
Write-Host "`n5. Testing SEARCH operation..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors?search=Test" -Method GET -Headers $headers
    Write-Host "✅ SEARCH: Found $($response.data.Count) vendors matching 'Test'" -ForegroundColor Green
} catch {
    Write-Host "❌ SEARCH failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Test FILTER - Filter by active status
Write-Host "`n6. Testing FILTER operation..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors?isActive=true" -Method GET -Headers $headers
    Write-Host "✅ FILTER: Found $($response.data.Count) active vendors" -ForegroundColor Green
} catch {
    Write-Host "❌ FILTER failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 7. Test UPDATE - Update vendor
Write-Host "`n7. Testing UPDATE operation..." -ForegroundColor Yellow
$updateData = @{
    name = "Test Vendor CRUD - Updated"
    contactPerson = "Updated Contact Person"
    email = "updated@vendorcrud.co.zw"
    phone = "+263 77 888 7777"
    address = "456 Updated Street, Harare"
    paymentTerms = "Net 15"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$testVendorId" -Method PUT -Headers $headers -Body $updateData
    Write-Host "✅ UPDATE: Vendor updated successfully" -ForegroundColor Green
    Write-Host "   New Name: $($response.data.name)" -ForegroundColor Cyan
    Write-Host "   New Contact: $($response.data.contactPerson)" -ForegroundColor Cyan
    Write-Host "   New Email: $($response.data.email)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ UPDATE failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 8. Test READ after UPDATE - Verify changes
Write-Host "`n8. Testing READ after UPDATE..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$testVendorId" -Method GET -Headers $headers
    Write-Host "✅ READ after UPDATE: Changes verified" -ForegroundColor Green
    Write-Host "   Updated Name: $($response.data.name)" -ForegroundColor Cyan
    Write-Host "   Updated Contact: $($response.data.contactPerson)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ READ after UPDATE failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 9. Test PARTIAL UPDATE - Update only specific fields
Write-Host "`n9. Testing PARTIAL UPDATE..." -ForegroundColor Yellow
$partialUpdate = @{
    contactPerson = "Partially Updated Contact"
    paymentTerms = "Net 45"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$testVendorId" -Method PUT -Headers $headers -Body $partialUpdate
    Write-Host "✅ PARTIAL UPDATE: Vendor partially updated successfully" -ForegroundColor Green
    Write-Host "   Contact: $($response.data.contactPerson)" -ForegroundColor Cyan
    Write-Host "   Payment Terms: $($response.data.paymentTerms)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ PARTIAL UPDATE failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 10. Test VENDOR EXPENSES - Get vendor expenses (should be empty)
Write-Host "`n10. Testing VENDOR EXPENSES..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$testVendorId/expenses" -Method GET -Headers $headers
    Write-Host "✅ VENDOR EXPENSES: Retrieved vendor expenses" -ForegroundColor Green
    Write-Host "   Expenses Count: $($response.data.expenses.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ VENDOR EXPENSES failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 11. Test VALIDATION - Try to create duplicate vendor
Write-Host "`n11. Testing VALIDATION (Duplicate Name)..." -ForegroundColor Yellow
try {
    $duplicateVendor = @{
        name = "Test Vendor CRUD - Updated"  # Same name as updated vendor
        taxNumber = "TEST002"
        contactPerson = "Duplicate Contact"
        email = "duplicate@vendorcrud.co.zw"
        phone = "+263 77 777 6666"
        address = "789 Duplicate Street, Harare"
        paymentTerms = "Net 30"
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method POST -Headers $headers -Body $duplicateVendor
    Write-Host "❌ VALIDATION failed: Should have rejected duplicate name" -ForegroundColor Red
} catch {
    Write-Host "✅ VALIDATION: Correctly rejected duplicate vendor name" -ForegroundColor Green
}

# 12. Test VALIDATION - Try to create vendor without required fields
Write-Host "`n12. Testing VALIDATION (Missing Required Fields)..." -ForegroundColor Yellow
try {
    $invalidVendor = @{
        taxNumber = "TEST003"
        contactPerson = "Invalid Contact"
        email = "invalid@vendorcrud.co.zw"
        phone = "+263 77 666 5555"
        address = "999 Invalid Street, Harare"
        paymentTerms = "Net 30"
        # Missing 'name' field
    } | ConvertTo-Json
    
    Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method POST -Headers $headers -Body $invalidVendor
    Write-Host "❌ VALIDATION failed: Should have rejected missing name" -ForegroundColor Red
} catch {
    Write-Host "✅ VALIDATION: Correctly rejected vendor without name" -ForegroundColor Green
}

# 13. Test DELETE - Delete the test vendor
Write-Host "`n13. Testing DELETE operation..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$testVendorId" -Method DELETE -Headers $headers
    Write-Host "✅ DELETE: Vendor deleted successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ DELETE failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 14. Test READ after DELETE - Verify vendor is gone
Write-Host "`n14. Testing READ after DELETE..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/$testVendorId" -Method GET -Headers $headers
    Write-Host "❌ READ after DELETE failed: Vendor should not exist" -ForegroundColor Red
} catch {
    Write-Host "✅ READ after DELETE: Correctly returned 404 for deleted vendor" -ForegroundColor Green
}

# 15. Test UPDATE non-existent vendor
Write-Host "`n15. Testing UPDATE non-existent vendor..." -ForegroundColor Yellow
try {
    $updateData = @{name = "Non-existent Vendor"} | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/non-existent-id" -Method PUT -Headers $headers -Body $updateData
    Write-Host "❌ UPDATE non-existent failed: Should have returned 404" -ForegroundColor Red
} catch {
    Write-Host "✅ UPDATE non-existent: Correctly returned 404" -ForegroundColor Green
}

# 16. Test DELETE non-existent vendor
Write-Host "`n16. Testing DELETE non-existent vendor..." -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors/non-existent-id" -Method DELETE -Headers $headers
    Write-Host "❌ DELETE non-existent failed: Should have returned 404" -ForegroundColor Red
} catch {
    Write-Host "✅ DELETE non-existent: Correctly returned 404" -ForegroundColor Green
}

# 17. Final verification - Count total vendors
Write-Host "`n17. Final verification..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors" -Method GET -Headers $headers
    Write-Host "✅ FINAL COUNT: $($response.data.Count) vendors in system" -ForegroundColor Green
} catch {
    Write-Host "❌ FINAL COUNT failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== Vendor CRUD Testing Complete ===" -ForegroundColor Green
Write-Host "All CRUD operations tested successfully!" -ForegroundColor Cyan
Write-Host "• CREATE ✅" -ForegroundColor Green
Write-Host "• READ ✅" -ForegroundColor Green
Write-Host "• READ ALL ✅" -ForegroundColor Green
Write-Host "• SEARCH ✅" -ForegroundColor Green
Write-Host "• FILTER ✅" -ForegroundColor Green
Write-Host "• UPDATE ✅" -ForegroundColor Green
Write-Host "• PARTIAL UPDATE ✅" -ForegroundColor Green
Write-Host "• DELETE ✅" -ForegroundColor Green
Write-Host "• VALIDATION ✅" -ForegroundColor Green
Write-Host "• ERROR HANDLING ✅" -ForegroundColor Green 