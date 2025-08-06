# Complete Revenue Workflow Test
$baseUrl = "http://localhost:3000"

Write-Host "=== COMPLETE REVENUE WORKFLOW TEST ===" -ForegroundColor Green

# 1. Login
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    $token = $login.token
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
    Write-Host "✅ Authentication successful" -ForegroundColor Green
} catch {
    Write-Host "❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 2. Test Revenue Categories CRUD
Write-Host "`n2. Testing Revenue Categories CRUD..." -ForegroundColor Yellow

# Create revenue category
$categoryPayload = @{
    name = "Test Revenue Category $(Get-Date -Format 'yyyyMMdd-HHmmss')"
    description = "Test category for revenue workflow"
    isActive = $true
}

try {
    $categoryResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-categories" -Method POST -Headers $headers -Body ($categoryPayload | ConvertTo-Json)
    $testCategory = $categoryResponse.data
    Write-Host "✅ Revenue category created: $($testCategory.name)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to create revenue category: $($_.Exception.Message)" -ForegroundColor Red
    # Try to get existing category
    try {
        $categories = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-categories" -Method GET -Headers $headers
        $testCategory = $categories.data | Select-Object -First 1
        Write-Host "✅ Using existing category: $($testCategory.name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to get existing categories" -ForegroundColor Red
        exit
    }
}

# Get all categories
try {
    $allCategories = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-categories" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($allCategories.data.Count) revenue categories" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get categories: $($_.Exception.Message)" -ForegroundColor Red
}

# Update category
try {
    $updateCategoryPayload = @{
        name = "Updated Revenue Category $(Get-Date -Format 'yyyyMMdd-HHmmss')"
        description = "Updated test category"
    }
    $updateCategoryResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-categories/$($testCategory.id)" -Method PUT -Headers $headers -Body ($updateCategoryPayload | ConvertTo-Json)
    Write-Host "✅ Revenue category updated: $($updateCategoryResponse.data.name)" -ForegroundColor Green
    $testCategory = $updateCategoryResponse.data
} catch {
    Write-Host "❌ Failed to update category: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Test Revenue Sources CRUD
Write-Host "`n3. Testing Revenue Sources CRUD..." -ForegroundColor Yellow

# Create revenue source
$sourcePayload = @{
    name = "Test Revenue Source $(Get-Date -Format 'yyyyMMdd-HHmmss')"
    description = "Test source for revenue workflow"
    isActive = $true
}

try {
    $sourceResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-sources" -Method POST -Headers $headers -Body ($sourcePayload | ConvertTo-Json)
    $testSource = $sourceResponse.data
    Write-Host "✅ Revenue source created: $($testSource.name)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to create revenue source: $($_.Exception.Message)" -ForegroundColor Red
    # Try to get existing source
    try {
        $sources = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-sources" -Method GET -Headers $headers
        $testSource = $sources.data | Select-Object -First 1
        Write-Host "✅ Using existing source: $($testSource.name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Failed to get existing sources" -ForegroundColor Red
        exit
    }
}

# Get all sources
try {
    $allSources = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-sources" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($allSources.data.Count) revenue sources" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to get sources: $($_.Exception.Message)" -ForegroundColor Red
}

# Update source
try {
    $updateSourcePayload = @{
        name = "Updated Revenue Source $(Get-Date -Format 'yyyyMMdd-HHmmss')"
        description = "Updated test source"
    }
    $updateSourceResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-sources/$($testSource.id)" -Method PUT -Headers $headers -Body ($updateSourcePayload | ConvertTo-Json)
    Write-Host "✅ Revenue source updated: $($updateSourceResponse.data.name)" -ForegroundColor Green
    $testSource = $updateSourceResponse.data
} catch {
    Write-Host "❌ Failed to update source: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Get test data for revenue creation
Write-Host "`n4. Getting test data for revenue creation..." -ForegroundColor Yellow

# Get active currency
$currencies = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers $headers
$activeCurrency = $currencies.data | Where-Object { $_.isActive -eq $true } | Select-Object -First 1

Write-Host "✅ Using currency: $($activeCurrency.code)" -ForegroundColor Green
Write-Host "✅ Using category: $($testCategory.name)" -ForegroundColor Green
Write-Host "✅ Using source: $($testSource.name)" -ForegroundColor Green

# 5. Create a taxable revenue entry
Write-Host "`n5. Creating taxable revenue entry..." -ForegroundColor Yellow
$revenuePayload = @{
    sourceId = $testSource.id
    categoryId = $testCategory.id
    amount = 2000.00
    currencyId = $activeCurrency.id
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    description = "Consulting services with VAT"
    isTaxable = $true
    paymentMethod = "BANK"
}

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method POST -Headers $headers -Body ($revenuePayload | ConvertTo-Json)
    $revenue = $response.data
    Write-Host "✅ Revenue created successfully!" -ForegroundColor Green
    Write-Host "   Revenue ID: $($revenue.id)" -ForegroundColor Cyan
    Write-Host "   Status: $($revenue.status)" -ForegroundColor Cyan
    Write-Host "   Amount: $($revenue.amount)" -ForegroundColor Cyan
    Write-Host "   VAT Amount: $($revenue.vatAmount)" -ForegroundColor Cyan
    Write-Host "   Total: $($revenue.totalAmount)" -ForegroundColor Cyan
    Write-Host "   Journal Entry ID: $($revenue.journalEntry.id)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create revenue: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 6. Get journal entry details for the revenue
Write-Host "`n6. Getting journal entry details for revenue..." -ForegroundColor Yellow
try {
    $journalResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries/$($revenue.journalEntry.id)" -Method GET -Headers $headers
    $journalEntry = $journalResponse.data
    Write-Host "✅ Journal entry retrieved!" -ForegroundColor Green
    Write-Host "   Reference: $($journalEntry.referenceNumber)" -ForegroundColor Cyan
    Write-Host "   Status: $($journalEntry.status)" -ForegroundColor Cyan
    Write-Host "   Date: $($journalEntry.transactionDate)" -ForegroundColor Cyan
    
    Write-Host "`n   Journal Entry Lines:" -ForegroundColor Yellow
    $totalDebits = 0
    $totalCredits = 0
    
    foreach ($line in $journalEntry.journalEntryLines) {
        $debit = [double]$line.debitAmount
        $credit = [double]$line.creditAmount
        $accountName = $line.chartOfAccount.accountName
        $description = $line.description
        
        $totalDebits += $debit
        $totalCredits += $credit
        
        if ($debit -gt 0) {
            Write-Host "     Dr $accountName`: $debit ($description)" -ForegroundColor Green
        } elseif ($credit -gt 0) {
            Write-Host "     Cr $accountName`: $credit ($description)" -ForegroundColor Red
        }
    }
    
    Write-Host "`n   Balance Check:" -ForegroundColor Yellow
    Write-Host "     Total Debits: $totalDebits" -ForegroundColor Cyan
    Write-Host "     Total Credits: $totalCredits" -ForegroundColor Cyan
    $balance = [math]::Abs($totalDebits - $totalCredits)
    if ($balance -lt 0.01) {
        Write-Host "     ✅ Journal entry is balanced!" -ForegroundColor Green
    } else {
        Write-Host "     ❌ Journal entry is NOT balanced!" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Failed to get journal entry: $($_.Exception.Message)" -ForegroundColor Red
}

# 7. Create a non-taxable revenue entry
Write-Host "`n7. Creating non-taxable revenue entry..." -ForegroundColor Yellow
$revenuePayload2 = @{
    sourceId = $testSource.id
    categoryId = $testCategory.id
    amount = 1500.00
    currencyId = $activeCurrency.id
    transactionDate = (Get-Date).ToString("yyyy-MM-dd")
    description = "Non-taxable consulting services"
    isTaxable = $false
    paymentMethod = "CASH"
}

try {
    $response2 = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method POST -Headers $headers -Body ($revenuePayload2 | ConvertTo-Json)
    $revenue2 = $response2.data
    Write-Host "✅ Non-taxable revenue created successfully!" -ForegroundColor Green
    Write-Host "   Revenue ID: $($revenue2.id)" -ForegroundColor Cyan
    Write-Host "   Amount: $($revenue2.amount)" -ForegroundColor Cyan
    Write-Host "   VAT Amount: $($revenue2.vatAmount)" -ForegroundColor Cyan
    Write-Host "   Total: $($revenue2.totalAmount)" -ForegroundColor Cyan
    Write-Host "   Journal Entry ID: $($revenue2.journalEntry.id)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to create non-taxable revenue: $($_.Exception.Message)" -ForegroundColor Red
}

# 8. Update the first revenue entry (should create reversal journal entry)
Write-Host "`n8. Updating revenue entry (should create reversal journal entry)..." -ForegroundColor Yellow
$updateRevenuePayload = @{
    description = "Updated consulting services with VAT"
    amount = 2500.00
}

try {
    $updateResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues/$($revenue.id)" -Method PUT -Headers $headers -Body ($updateRevenuePayload | ConvertTo-Json)
    $updatedRevenue = $updateResponse.data
    Write-Host "✅ Revenue updated successfully!" -ForegroundColor Green
    Write-Host "   New Amount: $($updatedRevenue.amount)" -ForegroundColor Cyan
    Write-Host "   New VAT Amount: $($updatedRevenue.vatAmount)" -ForegroundColor Cyan
    Write-Host "   New Total: $($updatedRevenue.totalAmount)" -ForegroundColor Cyan
    Write-Host "   New Journal Entry ID: $($updatedRevenue.journalEntry.id)" -ForegroundColor Cyan
    
    # Check if reversal journal entry was created
    if ($updatedRevenue.journalEntry.id -ne $revenue.journalEntry.id) {
        Write-Host "   ✅ Reversal journal entry created!" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  No reversal journal entry created (same ID)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to update revenue: $($_.Exception.Message)" -ForegroundColor Red
}

# 9. Get all journal entries to see the reversals
Write-Host "`n9. Getting all journal entries..." -ForegroundColor Yellow
try {
    $allJournals = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($allJournals.data.Count) journal entries" -ForegroundColor Green
    
    $revenueJournals = $allJournals.data | Where-Object { $_.description -like "*Revenue*" -or $_.description -like "*revenue*" }
    Write-Host "   Revenue-related journal entries: $($revenueJournals.Count)" -ForegroundColor Cyan
    
    foreach ($journal in $revenueJournals) {
        Write-Host "   - $($journal.referenceNumber): $($journal.description) (Status: $($journal.status))" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get journal entries: $($_.Exception.Message)" -ForegroundColor Red
}

# 10. Get all revenues
Write-Host "`n10. Getting all revenues..." -ForegroundColor Yellow
try {
    $allRevenues = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method GET -Headers $headers
    Write-Host "✅ Retrieved $($allRevenues.data.Count) revenue entries" -ForegroundColor Green
    
    foreach ($rev in $allRevenues.data) {
        Write-Host "   - $($rev.id): $($rev.description) - $($rev.amount) (Status: $($rev.status))" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Failed to get revenues: $($_.Exception.Message)" -ForegroundColor Red
}

# 11. Delete the first revenue entry (should void the journal entry)
Write-Host "`n11. Deleting revenue entry (should void journal entry)..." -ForegroundColor Yellow
try {
    $deleteResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues/$($updatedRevenue.id)" -Method DELETE -Headers $headers
    Write-Host "✅ Revenue deleted successfully!" -ForegroundColor Green
    
    # Check if the revenue is now inactive
    $checkResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method GET -Headers $headers
    $activeRevenues = $checkResponse.data | Where-Object { $_.isActive -eq $true }
    Write-Host "   Active revenues remaining: $($activeRevenues.Count)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Failed to delete revenue: $($_.Exception.Message)" -ForegroundColor Red
}

# 12. Final verification of all journal entries
Write-Host "`n12. Final verification of journal entries..." -ForegroundColor Yellow
try {
    $finalJournals = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries" -Method GET -Headers $headers
    $revenueJournals = $finalJournals.data | Where-Object { $_.description -like "*Revenue*" -or $_.description -like "*revenue*" }
    
    Write-Host "✅ Final Journal Entry Status:" -ForegroundColor Green
    Write-Host "   Total journal entries: $($finalJournals.data.Count)" -ForegroundColor Cyan
    Write-Host "   Revenue-related entries: $($revenueJournals.Count)" -ForegroundColor Cyan
    
    foreach ($journal in $revenueJournals) {
        Write-Host "   - $($journal.referenceNumber): $($journal.description)" -ForegroundColor Cyan
        Write-Host "     Status: $($journal.status), Debit: $($journal.totalDebit), Credit: $($journal.totalCredit)" -ForegroundColor White
        
        # Check if journal entry is balanced
        if ($journal.totalDebit -eq $journal.totalCredit) {
            Write-Host "     ✅ Balanced" -ForegroundColor Green
        } else {
            Write-Host "     ❌ NOT Balanced" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "❌ Failed to get final journal entries: $($_.Exception.Message)" -ForegroundColor Red
}

# 13. Test soft delete for categories and sources
Write-Host "`n13. Testing soft delete for categories and sources..." -ForegroundColor Yellow

# Soft delete category
try {
    $deleteCategoryResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-categories/$($testCategory.id)" -Method DELETE -Headers $headers
    Write-Host "✅ Revenue category soft deleted successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to soft delete category: $($_.Exception.Message)" -ForegroundColor Red
}

# Soft delete source
try {
    $deleteSourceResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-sources/$($testSource.id)" -Method DELETE -Headers $headers
    Write-Host "✅ Revenue source soft deleted successfully!" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to soft delete source: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== REVENUE WORKFLOW TEST COMPLETE ===" -ForegroundColor Green 