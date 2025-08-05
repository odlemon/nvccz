# Create Test Customer Script
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== CREATE TEST CUSTOMER ===" -ForegroundColor Cyan

# Function to authenticate and get token
function Get-AuthToken {
    try {
        $loginData = @{
            email = "admin@nvccz.co.zw"
            password = "admin123"
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
        return $response.token
    }
    catch {
        Write-Host "Authentication failed: $_" -ForegroundColor Red
        exit 1
    }
}

try {
    Write-Host "1. Authenticating..." -ForegroundColor Yellow
    $token = Get-AuthToken
    Write-Host "Authentication successful" -ForegroundColor Green

    $headers = @{ Authorization = "Bearer $token" }

    Write-Host "`n2. Checking existing customers..." -ForegroundColor Yellow
    try {
        $customers = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers" -Method Get -Headers $headers
        Write-Host "Found $($customers.data.Count) existing customers" -ForegroundColor White
        foreach ($customer in $customers.data) {
            Write-Host "  - $($customer.name) (ID: $($customer.id))" -ForegroundColor Gray
        }
    }
    catch {
        Write-Host "Failed to get customers: $_" -ForegroundColor Red
    }

    Write-Host "`n3. Creating test customer..." -ForegroundColor Yellow
    
    $customerData = @{
        name = "ABC Portfolio Company"
        taxNumber = "12345678"
        contactPerson = "John Smith"
        email = "john@abccompany.com"
        phone = "+263123456789"
        address = "123 Business Street, Harare"
        paymentTerms = "Net 30"
    } | ConvertTo-Json

    Write-Host "Customer data:" -ForegroundColor Gray
    Write-Host $customerData -ForegroundColor DarkGray

    $customer = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers" -Method Post -Body $customerData -Headers $headers -ContentType "application/json"
    
    Write-Host "Customer created successfully!" -ForegroundColor Green
    Write-Host "  Name: $($customer.name)" -ForegroundColor White
    Write-Host "  ID: $($customer.id)" -ForegroundColor White
    Write-Host "  Contact: $($customer.contactPerson)" -ForegroundColor White
    Write-Host "  Email: $($customer.email)" -ForegroundColor White

    Write-Host "`n4. Verifying customer creation..." -ForegroundColor Yellow
    $verifyCustomers = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/customers" -Method Get -Headers $headers
    Write-Host "Now have $($verifyCustomers.data.Count) customers total" -ForegroundColor White

} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Full error: $_" -ForegroundColor Red
}