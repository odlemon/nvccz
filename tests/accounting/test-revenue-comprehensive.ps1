# Comprehensive Revenue Test Script
# Tests Revenue Sources, Categories, and Revenue Creation with Journal Entries

$baseUrl = "http://localhost:3000"

# Colors for output
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"
$Cyan = "Cyan"

function Write-TestHeader {
    param([string]$Title)
    Write-Host "`n" -NoNewline
    Write-Host "=" * 50 -ForegroundColor $Cyan
    Write-Host " $Title" -ForegroundColor $Cyan
    Write-Host "=" * 50 -ForegroundColor $Cyan
}

function Write-TestResult {
    param([string]$TestName, [bool]$Success, [string]$Message = "")
    $color = if ($Success) { $Green } else { $Red }
    $status = if ($Success) { "PASS" } else { "FAIL" }
    Write-Host "[$status] $TestName" -ForegroundColor $color
    if ($Message -and -not $Success) {
        Write-Host "  Error: $Message" -ForegroundColor $Red
    }
}

function Get-AuthToken {
    try {
        $loginData = @{
            email = "admin@nvccz.co.zw"
            password = "admin123"
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $loginData -ContentType "application/json"
        return $response.token
    }
    catch {
        Write-Host "Authentication failed: $($_.Exception.Message)" -ForegroundColor $Red
        return $null
    }
}

function Test-ServerConnection {
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method GET -TimeoutSec 5
        return $true
    }
    catch {
        return $false
    }
}

function Test-RevenueSources {
    param([string]$token)
    
    Write-TestHeader "Testing Revenue Sources"
    
    # Test 1: Create Revenue Source
    try {
        $sourceData = @{
            name = "Service Sales"
            description = "Revenue from service provision"
            isActive = $true
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-sources" -Method POST -Headers @{Authorization = "Bearer $token"} -Body $sourceData -ContentType "application/json"
        $sourceId = $response.id
        Write-TestResult "Create Revenue Source" $true
    }
    catch {
        Write-TestResult "Create Revenue Source" $false $_.Exception.Message
        return $null
    }

    # Test 2: Get All Revenue Sources
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-sources" -Method GET -Headers @{Authorization = "Bearer $token"}
        Write-TestResult "Get All Revenue Sources" $true "Found $($response.length) sources"
    }
    catch {
        Write-TestResult "Get All Revenue Sources" $false $_.Exception.Message
    }

    # Test 3: Get Revenue Source by ID
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-sources/$sourceId" -Method GET -Headers @{Authorization = "Bearer $token"}
        Write-TestResult "Get Revenue Source by ID" $true
    }
    catch {
        Write-TestResult "Get Revenue Source by ID" $false $_.Exception.Message
    }

    return $sourceId
}

function Test-RevenueCategories {
    param([string]$token)
    
    Write-TestHeader "Testing Revenue Categories"
    
    # Test 1: Create Revenue Category
    try {
        $categoryData = @{
            name = "Consulting Services"
            description = "Revenue from consulting activities"
            isActive = $true
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-categories" -Method POST -Headers @{Authorization = "Bearer $token"} -Body $categoryData -ContentType "application/json"
        $categoryId = $response.id
        Write-TestResult "Create Revenue Category" $true
    }
    catch {
        Write-TestResult "Create Revenue Category" $false $_.Exception.Message
        return $null
    }

    # Test 2: Get All Revenue Categories
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-categories" -Method GET -Headers @{Authorization = "Bearer $token"}
        Write-TestResult "Get All Revenue Categories" $true "Found $($response.length) categories"
    }
    catch {
        Write-TestResult "Get All Revenue Categories" $false $_.Exception.Message
    }

    # Test 3: Get Revenue Category by ID
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenue-categories/$categoryId" -Method GET -Headers @{Authorization = "Bearer $token"}
        Write-TestResult "Get Revenue Category by ID" $true
    }
    catch {
        Write-TestResult "Get Revenue Category by ID" $false $_.Exception.Message
    }

    return $categoryId
}

function Test-Currencies {
    param([string]$token)
    
    Write-TestHeader "Testing Currencies"
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies" -Method GET -Headers @{Authorization = "Bearer $token"}
        $currency = $response | Where-Object { $_.code -eq "ZWL" } | Select-Object -First 1
        if ($currency) {
            Write-TestResult "Get ZWL Currency" $true
            return $currency.id
        } else {
            Write-TestResult "Get ZWL Currency" $false "ZWL currency not found"
            return $null
        }
    }
    catch {
        Write-TestResult "Get ZWL Currency" $false $_.Exception.Message
        return $null
    }
}

function Test-Customers {
    param([string]$token)
    
    Write-TestHeader "Testing Customers"
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/customers" -Method GET -Headers @{Authorization = "Bearer $token"}
        $customer = $response | Select-Object -First 1
        if ($customer) {
            Write-TestResult "Get Customer" $true "Using customer: $($customer.name)"
            return $customer.id
        } else {
            Write-TestResult "Get Customer" $false "No customers found"
            return $null
        }
    }
    catch {
        Write-TestResult "Get Customer" $false $_.Exception.Message
        return $null
    }
}

function Test-RevenueCreation {
    param([string]$token, [string]$sourceId, [string]$categoryId, [string]$currencyId, [string]$customerId)
    
    Write-TestHeader "Testing Revenue Creation"
    
    # Test 1: Create Revenue Entry (Taxable)
    try {
        $revenueData = @{
            customerId = $customerId
            sourceId = $sourceId
            categoryId = $categoryId
            amount = 1000.00
            currencyId = $currencyId
            transactionDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            description = "Consulting services for Q1 2024"
            invoiceNumber = "INV-2024-001"
            isTaxable = $true
            paymentMethod = "BANK"
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method POST -Headers @{Authorization = "Bearer $token"} -Body $revenueData -ContentType "application/json"
        $revenueId = $response.id
        Write-TestResult "Create Taxable Revenue" $true "Revenue ID: $revenueId"
        
        # Verify VAT calculation (14.5%)
        $expectedVat = 1000.00 * 0.145
        $actualVat = $response.vatAmount
        if ([math]::Abs($actualVat - $expectedVat) -lt 0.01) {
            Write-TestResult "VAT Calculation" $true "VAT: $actualVat (14.5%)"
        } else {
            Write-TestResult "VAT Calculation" $false "Expected: $expectedVat, Got: $actualVat"
        }
        
        # Verify total amount
        $expectedTotal = 1000.00 + $expectedVat
        $actualTotal = $response.totalAmount
        if ([math]::Abs($actualTotal - $expectedTotal) -lt 0.01) {
            Write-TestResult "Total Amount Calculation" $true "Total: $actualTotal"
        } else {
            Write-TestResult "Total Amount Calculation" $false "Expected: $expectedTotal, Got: $actualTotal"
        }
    }
    catch {
        Write-TestResult "Create Taxable Revenue" $false $_.Exception.Message
        return $null
    }

    # Test 2: Create Revenue Entry (Non-Taxable)
    try {
        $revenueData2 = @{
            customerId = $customerId
            sourceId = $sourceId
            categoryId = $categoryId
            amount = 500.00
            currencyId = $currencyId
            transactionDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            description = "Non-taxable service fee"
            invoiceNumber = "INV-2024-002"
            isTaxable = $false
            paymentMethod = "CASH"
        } | ConvertTo-Json

        $response2 = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method POST -Headers @{Authorization = "Bearer $token"} -Body $revenueData2 -ContentType "application/json"
        $revenueId2 = $response2.id
        Write-TestResult "Create Non-Taxable Revenue" $true "Revenue ID: $revenueId2"
        
        # Verify no VAT for non-taxable
        if ($response2.vatAmount -eq 0) {
            Write-TestResult "Non-Taxable VAT Check" $true "VAT: $($response2.vatAmount)"
        } else {
            Write-TestResult "Non-Taxable VAT Check" $false "Expected: 0, Got: $($response2.vatAmount)"
        }
    }
    catch {
        Write-TestResult "Create Non-Taxable Revenue" $false $_.Exception.Message
    }

    return @($revenueId, $revenueId2)
}

function Test-RevenueRetrieval {
    param([string]$token, [string[]]$revenueIds)
    
    Write-TestHeader "Testing Revenue Retrieval"
    
    # Test 1: Get All Revenues
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues" -Method GET -Headers @{Authorization = "Bearer $token"}
        Write-TestResult "Get All Revenues" $true "Found $($response.length) revenues"
    }
    catch {
        Write-TestResult "Get All Revenues" $false $_.Exception.Message
    }

    # Test 2: Get Revenue by ID
    if ($revenueIds -and $revenueIds.Length -gt 0) {
        try {
            $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/revenues/$($revenueIds[0])" -Method GET -Headers @{Authorization = "Bearer $token"}
            Write-TestResult "Get Revenue by ID" $true "Revenue: $($response.description)"
        }
        catch {
            Write-TestResult "Get Revenue by ID" $false $_.Exception.Message
        }
    }
}

function Test-JournalEntries {
    param([string]$token, [string[]]$revenueIds)
    
    Write-TestHeader "Testing Journal Entries for Revenue"
    
    if ($revenueIds -and $revenueIds.Length -gt 0) {
        try {
            $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries" -Method GET -Headers @{Authorization = "Bearer $token"}
            $revenueJournals = $response | Where-Object { $_.revenueId -in $revenueIds }
            Write-TestResult "Check Revenue Journal Entries" $true "Found $($revenueJournals.Length) journal entries for revenues"
            
            foreach ($journal in $revenueJournals) {
                Write-Host "  Journal Entry ID: $($journal.id)" -ForegroundColor $Cyan
                Write-Host "  Description: $($journal.description)" -ForegroundColor $Cyan
                Write-Host "  Total Debit: $($journal.totalDebit)" -ForegroundColor $Cyan
                Write-Host "  Total Credit: $($journal.totalCredit)" -ForegroundColor $Cyan
            }
        }
        catch {
            Write-TestResult "Check Revenue Journal Entries" $false $_.Exception.Message
        }
    }
}

# Main execution
Write-Host "Starting Comprehensive Revenue Test" -ForegroundColor $Yellow
Write-Host "=====================================" -ForegroundColor $Yellow

# Check server connection
if (-not (Test-ServerConnection)) {
    Write-Host "Server is not running. Please start the server first." -ForegroundColor $Red
    exit 1
}

# Get authentication token
$token = Get-AuthToken
if (-not $token) {
    Write-Host "Failed to authenticate. Exiting." -ForegroundColor $Red
    exit 1
}

Write-Host "Authentication successful!" -ForegroundColor $Green

# Run tests
$sourceId = Test-RevenueSources -token $token
$categoryId = Test-RevenueCategories -token $token
$currencyId = Test-Currencies -token $token
$customerId = Test-Customers -token $token

if ($sourceId -and $categoryId -and $currencyId -and $customerId) {
    $revenueIds = Test-RevenueCreation -token $token -sourceId $sourceId -categoryId $categoryId -currencyId $currencyId -customerId $customerId
    Test-RevenueRetrieval -token $token -revenueIds $revenueIds
    Test-JournalEntries -token $token -revenueIds $revenueIds
} else {
    Write-Host "Skipping revenue creation tests due to missing prerequisites." -ForegroundColor $Yellow
}

Write-Host "`nRevenue Test Complete!" -ForegroundColor $Green 