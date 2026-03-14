# Test that GET endpoints for invoices and quotations include the auto-generated numbers in the response.
# Creates one of each: customer invoice, purchase invoice, procurement invoice, vendor quotation.
# Then GETs each (by id or list) and verifies invoiceNumber / quotationNumber is in the response body.
# Requires: server running at baseUrl, admin login. Base: http://localhost:3009

$baseUrl = "http://localhost:3009"
$ErrorActionPreference = "Stop"

$login = @{ email = "admin@nts.com"; password = "admin123" } | ConvertTo-Json
$r = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $login -ContentType "application/json"
$token = $r.token
$headers = @{ Authorization = "Bearer $token" }

Write-Host "`n=== Invoice & Quotation Numbers in GET Response ===" -ForegroundColor Cyan

$allPassed = $true

# --- 1) Accounting (customer) invoice: create then GET by id and GET list ---
Write-Host "`n1. Accounting customer invoice" -ForegroundColor Yellow
try {
    $customers = Invoke-RestMethod -Uri "$baseUrl/api/accounting/customers?limit=1" -Method GET -Headers $headers
    $currencies = Invoke-RestMethod -Uri "$baseUrl/api/accounting/currencies?limit=1" -Method GET -Headers $headers
    $customerId = $customers.data.customers[0].id
    $currencyId = $currencies.data[0].id
    if (-not $customerId -or -not $currencyId) { throw "No customer or currency" }

    $invBody = @{
        customerId    = $customerId
        currencyId    = $currencyId
        invoiceDate   = (Get-Date -Format "yyyy-MM-dd")
        isTaxable     = $false
        items         = @(@{ description = "Test item"; quantity = 1; unitPrice = 100 })
    } | ConvertTo-Json -Depth 5

    $create = Invoke-RestMethod -Uri "$baseUrl/api/accounting/invoices" -Method POST -Body $invBody -ContentType "application/json" -Headers $headers
    $invId = $create.data.id
    $createdNum = $create.data.invoiceNumber
    Write-Host "   Created invoice id=$invId invoiceNumber=$createdNum" -ForegroundColor Gray

    $getOne = Invoke-RestMethod -Uri "$baseUrl/api/accounting/invoices/$invId" -Method GET -Headers $headers
    if ($getOne.data.invoiceNumber) {
        Write-Host "   GET /invoices/:id - invoiceNumber in response: $($getOne.data.invoiceNumber)" -ForegroundColor Green
    } else {
        Write-Host "   GET /invoices/:id - MISSING invoiceNumber in response" -ForegroundColor Red
        $allPassed = $false
    }

    $list = Invoke-RestMethod -Uri "$baseUrl/api/accounting/invoices?limit=5" -Method GET -Headers $headers
    $found = $list.data.invoices | Where-Object { $_.id -eq $invId } | Select-Object -First 1
    if ($found -and $found.invoiceNumber) {
        Write-Host "   GET /invoices (list) - invoiceNumber in response: $($found.invoiceNumber)" -ForegroundColor Green
    } else {
        Write-Host "   GET /invoices (list) - MISSING invoiceNumber for created invoice" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor Red }
    $allPassed = $false
}

# --- 2) Accounting purchase invoice: create then GET by id and GET list ---
Write-Host "`n2. Accounting purchase invoice" -ForegroundColor Yellow
try {
    $vendors = Invoke-RestMethod -Uri "$baseUrl/api/accounting/vendors?limit=1" -Method GET -Headers $headers
    $vendorId = $vendors.data[0].id
    if (-not $vendorId) { throw "No vendor" }
    $currencyId = $currencies.data[0].id

    $pInvBody = @{
        vendorId     = $vendorId
        currencyId   = $currencyId
        invoiceDate  = (Get-Date -Format "yyyy-MM-dd")
        items        = @(@{ itemName = "Test"; quantity = 1; unitPrice = 50 })
    } | ConvertTo-Json -Depth 5

    $pCreate = Invoke-RestMethod -Uri "$baseUrl/api/accounting/purchase-invoices" -Method POST -Body $pInvBody -ContentType "application/json" -Headers $headers
    $pInvId = $pCreate.data.id
    $pCreatedNum = $pCreate.data.invoiceNumber
    Write-Host "   Created purchase invoice id=$pInvId invoiceNumber=$pCreatedNum" -ForegroundColor Gray

    $pGetOne = Invoke-RestMethod -Uri "$baseUrl/api/accounting/purchase-invoices/$pInvId" -Method GET -Headers $headers
    if ($pGetOne.data.invoiceNumber) {
        Write-Host "   GET /purchase-invoices/:id - invoiceNumber in response: $($pGetOne.data.invoiceNumber)" -ForegroundColor Green
    } else {
        Write-Host "   GET /purchase-invoices/:id - MISSING invoiceNumber in response" -ForegroundColor Red
        $allPassed = $false
    }

    $pList = Invoke-RestMethod -Uri "$baseUrl/api/accounting/purchase-invoices?limit=5" -Method GET -Headers $headers
    $pFound = $pList.data.invoices | Where-Object { $_.id -eq $pInvId } | Select-Object -First 1
    if ($pFound -and $pFound.invoiceNumber) {
        Write-Host "   GET /purchase-invoices (list) - invoiceNumber in response: $($pFound.invoiceNumber)" -ForegroundColor Green
    } else {
        Write-Host "   GET /purchase-invoices (list) - MISSING invoiceNumber for created invoice" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor Red }
    $allPassed = $false
}

# --- 3) Procurement invoice: create then GET list ---
Write-Host "`n3. Procurement invoice" -ForegroundColor Yellow
try {
    $procBody = @{
        vendorId    = $vendorId
        invoiceDate = (Get-Date -Format "yyyy-MM-dd")
        items       = @(@{ itemName = "Procurement test"; quantity = 2; unitPrice = 25 })
    } | ConvertTo-Json -Depth 5

    $procCreate = Invoke-RestMethod -Uri "$baseUrl/api/procurement/invoices" -Method POST -Body $procBody -ContentType "application/json" -Headers $headers
    $procInvId = $procCreate.data.id
    $procCreatedNum = $procCreate.data.invoiceNumber
    Write-Host "   Created procurement invoice id=$procInvId invoiceNumber=$procCreatedNum" -ForegroundColor Gray

    $procList = Invoke-RestMethod -Uri "$baseUrl/api/procurement/invoices?limit=20" -Method GET -Headers $headers
    $procFound = $procList.data | Where-Object { $_.id -eq $procInvId } | Select-Object -First 1
    if ($procFound -and $procFound.invoiceNumber) {
        Write-Host "   GET /procurement/invoices (list) - invoiceNumber in response: $($procFound.invoiceNumber)" -ForegroundColor Green
    } else {
        Write-Host "   GET /procurement/invoices (list) - MISSING invoiceNumber for created invoice" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor Red }
    $allPassed = $false
}

# --- 4) Vendor quotation: create (public) then GET list and GET by id ---
Write-Host "`n4. Vendor quotation (procurement)" -ForegroundColor Yellow
try {
    $quoteBody = @{
        vendorName   = "Test Vendor"
        vendorEmail  = "test-vendor@example.com"
        companyName  = "Test Co"
        items        = @(@{ itemName = "Quote item"; quantity = 1; unitPrice = 200 })
    } | ConvertTo-Json -Depth 5

    $quoteCreate = Invoke-RestMethod -Uri "$baseUrl/api/vendor-quotations/submit" -Method POST -Body $quoteBody -ContentType "application/json"
    $quoteId = $quoteCreate.data.id
    $quoteNum = $quoteCreate.data.quotationNumber
    Write-Host "   Created quotation id=$quoteId quotationNumber=$quoteNum" -ForegroundColor Gray

    $quoteList = Invoke-RestMethod -Uri "$baseUrl/api/vendor-quotations?limit=20" -Method GET -Headers $headers
    $quoteFound = $quoteList.data | Where-Object { $_.id -eq $quoteId } | Select-Object -First 1
    if ($quoteFound -and $quoteFound.quotationNumber) {
        Write-Host "   GET /vendor-quotations (list) - quotationNumber in response: $($quoteFound.quotationNumber)" -ForegroundColor Green
    } else {
        Write-Host "   GET /vendor-quotations (list) - MISSING quotationNumber for created quotation" -ForegroundColor Red
        $allPassed = $false
    }

    $quoteOne = Invoke-RestMethod -Uri "$baseUrl/api/vendor-quotations/$quoteId" -Method GET -Headers $headers
    if ($quoteOne.data.quotationNumber) {
        Write-Host "   GET /vendor-quotations/:id - quotationNumber in response: $($quoteOne.data.quotationNumber)" -ForegroundColor Green
    } else {
        Write-Host "   GET /vendor-quotations/:id - MISSING quotationNumber in response" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "   FAIL - $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor Red }
    $allPassed = $false
}

# --- Summary ---
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "All checks passed: invoiceNumber / quotationNumber are present in GET responses." -ForegroundColor Green
} else {
    Write-Host "Some checks failed. Review output above." -ForegroundColor Red
}
exit $(if ($allPassed) { 0 } else { 1 })
