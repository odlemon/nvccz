# Test Expense Categories CRUD Operations
# This script tests all CRUD operations for expense categories

Write-Host "=== EXPENSE CATEGORIES CRUD TESTING ===" -ForegroundColor Green

# Login and get token
Write-Host "1. Logging in..." -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    $token = $login.token
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
    Write-Host "✅ Login successful" -ForegroundColor Green
} catch {
    Write-Host "❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# Test 1: CREATE - Create root categories
Write-Host "`n2. Testing CREATE - Root Categories..." -ForegroundColor Yellow
$rootCategories = @(
    @{ name = "Office Expenses"; description = "General office-related expenses" },
    @{ name = "Travel & Accommodation"; description = "Business travel and accommodation costs" },
    @{ name = "Marketing & Advertising"; description = "Marketing and advertising expenses" },
    @{ name = "Technology & IT"; description = "Technology and IT-related expenses" },
    @{ name = "Professional Services"; description = "Legal, accounting, consulting fees" }
)

$createdCategories = @()
foreach ($category in $rootCategories) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories" -Method POST -Headers $headers -Body ($category | ConvertTo-Json)
        $createdCategories += $response.data
        Write-Host "✅ Created: $($category.name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to create $($category.name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 2: CREATE - Create sub-categories
Write-Host "`n3. Testing CREATE - Sub-Categories..." -ForegroundColor Yellow
$officeCategory = $createdCategories | Where-Object { $_.name -eq "Office Expenses" } | Select-Object -First 1
$travelCategory = $createdCategories | Where-Object { $_.name -eq "Travel & Accommodation" } | Select-Object -First 1

$subCategories = @(
    @{ name = "Office Supplies"; description = "Pens, paper, stationery"; parentId = $officeCategory.id },
    @{ name = "Office Equipment"; description = "Computers, furniture, equipment"; parentId = $officeCategory.id },
    @{ name = "Air Travel"; description = "Flight tickets and related costs"; parentId = $travelCategory.id },
    @{ name = "Hotel Accommodation"; description = "Hotel bookings and accommodation"; parentId = $travelCategory.id },
    @{ name = "Ground Transportation"; description = "Taxis, car rentals, fuel"; parentId = $travelCategory.id }
)

foreach ($category in $subCategories) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories" -Method POST -Headers $headers -Body ($category | ConvertTo-Json)
        Write-Host "✅ Created sub-category: $($category.name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to create sub-category $($category.name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 3: READ ALL - Get all categories
Write-Host "`n4. Testing READ ALL - Get all categories..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($response.data.Count) categories" -ForegroundColor Green
    foreach ($category in $response.data) {
        $indent = if ($category.parentId) { "  -- " } else { "* " }
        Write-Host "$indent$($category.name)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get categories: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: READ ALL - Get root categories only
Write-Host "`n5. Testing READ ALL - Root categories only..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories?parentId=null" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($response.data.Count) root categories" -ForegroundColor Green
    foreach ($category in $response.data) {
        Write-Host "* $($category.name)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get root categories: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: READ ALL - Get categories with children
Write-Host "`n6. Testing READ ALL - Categories with children..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories?includeChildren=true" -Method GET -Headers $headers
    Write-Host "✅ Retrieved categories with children" -ForegroundColor Green
    foreach ($category in $response.data) {
        Write-Host "* $($category.name)" -ForegroundColor Cyan
        if ($category.children -and $category.children.Count -gt 0) {
            foreach ($child in $category.children) {
                Write-Host "  -- $($child.name)" -ForegroundColor Yellow
            }
        }
    }
} catch {
    Write-Host "❌ Failed to get categories with children: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: READ BY ID - Get specific category
Write-Host "`n7. Testing READ BY ID..." -ForegroundColor Yellow
if ($officeCategory) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories/$($officeCategory.id)" -Method GET -Headers $headers
        Write-Host "✅ Retrieved category: $($response.data.name)" -ForegroundColor Green
        Write-Host "   Description: $($response.data.description)" -ForegroundColor Cyan
        Write-Host "   Parent: $($response.data.parentId)" -ForegroundColor Cyan
    } catch {
        Write-Host "❌ Failed to get category by ID: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 7: UPDATE - Update a category
Write-Host "`n8. Testing UPDATE..." -ForegroundColor Yellow
if ($officeCategory) {
    $updateData = @{
        name = "Office & Administrative Expenses"
        description = "Updated description for office and administrative expenses"
    }
    
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories/$($officeCategory.id)" -Method PUT -Headers $headers -Body ($updateData | ConvertTo-Json)
        Write-Host "✅ Updated category: $($response.data.name)" -ForegroundColor Green
        Write-Host "   New description: $($response.data.description)" -ForegroundColor Cyan
    } catch {
        Write-Host "❌ Failed to update category: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 8: VALIDATION - Test duplicate name
Write-Host "`n9. Testing VALIDATION - Duplicate name..." -ForegroundColor Yellow
$duplicateData = @{
    name = "Office & Administrative Expenses"
    description = "This should fail due to duplicate name"
}

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories" -Method POST -Headers $headers -Body ($duplicateData | ConvertTo-Json)
    Write-Host "❌ Should have failed - duplicate name allowed" -ForegroundColor Red
} catch {
    Write-Host "✅ Correctly rejected duplicate name: $($_.Exception.Message)" -ForegroundColor Green
}

# Test 9: VALIDATION - Test missing required field
Write-Host "`n10. Testing VALIDATION - Missing name..." -ForegroundColor Yellow
$invalidData = @{
    description = "This should fail due to missing name"
}

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories" -Method POST -Headers $headers -Body ($invalidData | ConvertTo-Json)
    Write-Host "❌ Should have failed - missing name allowed" -ForegroundColor Red
} catch {
    Write-Host "✅ Correctly rejected missing name: $($_.Exception.Message)" -ForegroundColor Green
}

# Test 10: VALIDATION - Test invalid parent ID
Write-Host "`n11. Testing VALIDATION - Invalid parent ID..." -ForegroundColor Yellow
$invalidParentData = @{
    name = "Test Category"
    description = "This should fail due to invalid parent ID"
    parentId = "invalid-id-123"
}

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories" -Method POST -Headers $headers -Body ($invalidParentData | ConvertTo-Json)
    Write-Host "❌ Should have failed - invalid parent ID allowed" -ForegroundColor Red
} catch {
    Write-Host "✅ Correctly rejected invalid parent ID: $($_.Exception.Message)" -ForegroundColor Green
}

# Test 11: DELETE - Soft delete a category
Write-Host "`n12. Testing DELETE - Soft delete..." -ForegroundColor Yellow
# Get a category to delete
try {
    $categories = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories" -Method GET -Headers $headers
    $categoryToDelete = $categories.data | Where-Object { $_.name -eq "Marketing & Advertising" } | Select-Object -First 1
    
    if ($categoryToDelete) {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories/$($categoryToDelete.id)" -Method DELETE -Headers $headers
        Write-Host "✅ Soft deleted category: $($response.data.name)" -ForegroundColor Green
        Write-Host "   Active status: $($response.data.isActive)" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️ No category found to delete" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to delete category: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 12: READ ALL - Verify deleted category is not in active list
Write-Host "`n13. Testing READ ALL - Verify deletion..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/expense-categories" -Method GET -Headers $headers
    $deletedCategory = $response.data | Where-Object { $_.name -eq "Marketing & Advertising" }
    
    if ($deletedCategory) {
        Write-Host "❌ Deleted category still appears in active list" -ForegroundColor Red
    } else {
        Write-Host "✅ Deleted category correctly removed from active list" -ForegroundColor Green
    }
    
    Write-Host "Final active categories: $($response.data.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to verify deletion: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== EXPENSE CATEGORIES TESTING COMPLETE ===" -ForegroundColor Green 