# Create Customer and Verify Script
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== CREATE CUSTOMER AND VERIFY ===" -ForegroundColor Cyan

try {
    # 1. Authenticate
    Write-Host "1. Authenticating..." -ForegroundColor Yellow
    $loginData = @{
        email = "admin@nvccz.co.zw"
        password = "admin123"
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
    $token = $authResponse.token
    $headers = @{ Authorization = "Bearer $token" }
    
    Write-Host "✅ Authentication successful" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor Gray

    # 2. Check existing customers
    Write-Host "`n2. Checking existing customers..." -ForegroundColor Yellow
    $existingCustomers = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers" -Method Get -Headers $headers
    Write-Host "✅ Found $($existingCustomers.data.Count) existing customers" -ForegroundColor Green
    
    if ($existingCustomers.data.Count -gt 0) {
        Write-Host "   Existing customers:" -ForegroundColor Gray
        foreach ($customer in $existingCustomers.data) {
            Write-Host "   - $($customer.name) (ID: $($customer.id), Active: $($customer.isActive))" -ForegroundColor Gray
        }
    }

    # 3. Create new customer
    Write-Host "`n3. Creating new customer..." -ForegroundColor Yellow
    
    $customerData = @{
        name = "Test Portfolio Company"
        taxNumber = "TAX123456"
        contactPerson = "Jane Smith"
        email = "jane@testportfolio.com"
        phone = "+263777123456"
        address = "456 Investment Street, Harare, Zimbabwe"
        paymentTerms = "Net 30"
    } | ConvertTo-Json

    Write-Host "   Sending customer data:" -ForegroundColor Gray
    Write-Host $customerData -ForegroundColor DarkGray

    $newCustomer = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers" -Method Post -Body $customerData -Headers $headers -ContentType "application/json"
    
    Write-Host "✅ Customer created successfully!" -ForegroundColor Green
    Write-Host "   Customer Details:" -ForegroundColor White
    Write-Host "   - ID: $($newCustomer.id)" -ForegroundColor White
    Write-Host "   - Name: $($newCustomer.name)" -ForegroundColor White
    Write-Host "   - Tax Number: $($newCustomer.taxNumber)" -ForegroundColor White
    Write-Host "   - Contact Person: $($newCustomer.contactPerson)" -ForegroundColor White
    Write-Host "   - Email: $($newCustomer.email)" -ForegroundColor White
    Write-Host "   - Phone: $($newCustomer.phone)" -ForegroundColor White
    Write-Host "   - Address: $($newCustomer.address)" -ForegroundColor White
    Write-Host "   - Payment Terms: $($newCustomer.paymentTerms)" -ForegroundColor White
    Write-Host "   - Is Active: $($newCustomer.isActive)" -ForegroundColor White
    Write-Host "   - Created At: $($newCustomer.createdAt)" -ForegroundColor White

    # 4. Verify by fetching the customer by ID
    Write-Host "`n4. Verifying customer by fetching it back..." -ForegroundColor Yellow
    $fetchedCustomer = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers/$($newCustomer.id)" -Method Get -Headers $headers
    
    Write-Host "✅ Customer verification successful!" -ForegroundColor Green
    Write-Host "   Fetched Customer:" -ForegroundColor White
    Write-Host "   - ID: $($fetchedCustomer.id)" -ForegroundColor White
    Write-Host "   - Name: $($fetchedCustomer.name)" -ForegroundColor White
    Write-Host "   - Email: $($fetchedCustomer.email)" -ForegroundColor White

    # 5. List all customers to confirm
    Write-Host "`n5. Final customer count..." -ForegroundColor Yellow
    $finalCustomers = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers" -Method Get -Headers $headers
    Write-Host "✅ Total customers now: $($finalCustomers.data.Count)" -ForegroundColor Green

    # 6. Return the created customer data for use in other scripts
    Write-Host "`n=== CUSTOMER CREATION COMPLETE ===" -ForegroundColor Cyan
    Write-Host "Created customer ID: $($newCustomer.id)" -ForegroundColor Green
    Write-Host "Created customer name: $($newCustomer.name)" -ForegroundColor Green
    
    # Output the customer in a format that can be used by other scripts
    Write-Host "`nCustomer JSON for reuse:" -ForegroundColor Yellow
    $customerForReuse = @{
        id = $newCustomer.id
        name = $newCustomer.name
        email = $newCustomer.email
        isActive = $newCustomer.isActive
    } | ConvertTo-Json
    Write-Host $customerForReuse -ForegroundColor Green

} catch {
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
    
    Write-Host "Full Exception: $_" -ForegroundColor Red
}