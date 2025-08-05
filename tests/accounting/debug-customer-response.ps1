# Debug Customer Response Script
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== DEBUG CUSTOMER RESPONSE ===" -ForegroundColor Cyan

try {
    # Authenticate
    $loginData = @{
        email = "admin@nvccz.co.zw"
        password = "admin123"
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
    $headers = @{ Authorization = "Bearer $($authResponse.token)" }
    
    Write-Host "Authentication successful" -ForegroundColor Green

    # Create customer and capture full response
    Write-Host "`nCreating customer..." -ForegroundColor Yellow
    
    $customerData = @{
        name = "Debug Test Company"
        email = "debug@test.com"
        contactPerson = "Debug User"
        phone = "+263123456789"
    } | ConvertTo-Json

    # Use Invoke-WebRequest to get more detailed response info
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/accounting/customers" -Method Post -Body $customerData -Headers $headers -ContentType "application/json"
    
    Write-Host "Response Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response Headers:" -ForegroundColor Yellow
    $response.Headers | Format-Table
    
    Write-Host "Raw Response Content:" -ForegroundColor Yellow
    Write-Host $response.Content -ForegroundColor White
    
    # Parse the JSON response
    $customerResponse = $response.Content | ConvertFrom-Json
    Write-Host "`nParsed Response Structure:" -ForegroundColor Yellow
    Write-Host "Success: $($customerResponse.success)" -ForegroundColor White
    Write-Host "Message: $($customerResponse.message)" -ForegroundColor White
    Write-Host "Data Type: $($customerResponse.data.GetType().Name)" -ForegroundColor White
    
    if ($customerResponse.data) {
        Write-Host "Customer Data:" -ForegroundColor Yellow
        Write-Host "  ID: $($customerResponse.data.id)" -ForegroundColor White
        Write-Host "  Name: $($customerResponse.data.name)" -ForegroundColor White
        Write-Host "  Email: $($customerResponse.data.email)" -ForegroundColor White
        Write-Host "  Is Active: $($customerResponse.data.isActive)" -ForegroundColor White
    } else {
        Write-Host "No data in response!" -ForegroundColor Red
    }

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}