# Test the new simplified Mini-KYC structure
# This script tests the updated KYC endpoints with only id and preferences fields

$baseUrl = "http://localhost:3000/api"
$token = ""

# Function to make authenticated requests
function Invoke-AuthenticatedRequest {
    param(
        [string]$Method,
        [string]$Url,
        [object]$Body = $null
    )
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if ($token) {
        $headers["Authorization"] = "Bearer $token"
    }
    
    $params = @{
        Method = $Method
        Uri = $Url
        Headers = $headers
    }
    
    if ($Body) {
        $params.Body = $Body | ConvertTo-Json -Depth 10
    }
    
    try {
        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        Write-Host "Error: $($_.Exception.Message)"
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response: $responseBody"
        }
        return $null
    }
}

# Step 1: Login to get token
Write-Host "Step 1: Logging in to get authentication token..." -ForegroundColor Green

$loginData = @{
    email = "admin@nvccz.co.zw"
    password = "admin123"
}

$loginResponse = Invoke-AuthenticatedRequest -Method "POST" -Url "$baseUrl/auth/login" -Body $loginData

if ($loginResponse -and $loginResponse.token) {
    $token = $loginResponse.token
    Write-Host "Login successful! Token obtained." -ForegroundColor Green
} else {
    Write-Host "Login failed. Please check your credentials." -ForegroundColor Red
    exit 1
}

# Step 2: Test creating KYC with new simplified structure
Write-Host "`nStep 2: Testing KYC creation with new simplified structure..." -ForegroundColor Green

$kycData = @{
    preferences = @{
        theme = "dark"
        language = "en"
        notifications = @{
            email = $true
            sms = $false
            push = $true
        }
        privacy = @{
            shareData = $false
            marketingEmails = $true
        }
    }
}

Write-Host "Creating KYC with preferences:"
Write-Host ($kycData | ConvertTo-Json -Depth 5)

$createResponse = Invoke-AuthenticatedRequest -Method "POST" -Url "$baseUrl/mini-kyc" -Body $kycData

if ($createResponse -and $createResponse.success) {
    Write-Host "KYC created successfully!" -ForegroundColor Green
    Write-Host "Response:"
    Write-Host ($createResponse | ConvertTo-Json -Depth 5)
} else {
    Write-Host "KYC creation failed!" -ForegroundColor Red
}

# Step 3: Test getting KYC
Write-Host "`nStep 3: Testing KYC retrieval..." -ForegroundColor Green

$getResponse = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/mini-kyc"

if ($getResponse -and $getResponse.success) {
    Write-Host "KYC retrieved successfully!" -ForegroundColor Green
    Write-Host "Response:"
    Write-Host ($getResponse | ConvertTo-Json -Depth 5)
} else {
    Write-Host "KYC retrieval failed!" -ForegroundColor Red
}

# Step 4: Test updating KYC
Write-Host "`nStep 4: Testing KYC update..." -ForegroundColor Green

$updateData = @{
    preferences = @{
        theme = "light"
        language = "en"
        notifications = @{
            email = $true
            sms = $true
            push = $false
        }
        privacy = @{
            shareData = $true
            marketingEmails = $false
        }
        newPreference = "updated_value"
    }
}

Write-Host "Updating KYC with new preferences:"
Write-Host ($updateData | ConvertTo-Json -Depth 5)

$updateResponse = Invoke-AuthenticatedRequest -Method "PUT" -Url "$baseUrl/mini-kyc" -Body $updateData

if ($updateResponse -and $updateResponse.success) {
    Write-Host "KYC updated successfully!" -ForegroundColor Green
    Write-Host "Response:"
    Write-Host ($updateResponse | ConvertTo-Json -Depth 5)
} else {
    Write-Host "KYC update failed!" -ForegroundColor Red
}

# Step 5: Test getting updated KYC
Write-Host "`nStep 5: Testing retrieval of updated KYC..." -ForegroundColor Green

$getUpdatedResponse = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/mini-kyc"

if ($getUpdatedResponse -and $getUpdatedResponse.success) {
    Write-Host "Updated KYC retrieved successfully!" -ForegroundColor Green
    Write-Host "Response:"
    Write-Host ($getUpdatedResponse | ConvertTo-Json -Depth 5)
} else {
    Write-Host "Updated KYC retrieval failed!" -ForegroundColor Red
}

# Step 6: Test admin endpoint to get all KYC records
Write-Host "`nStep 6: Testing admin endpoint to get all KYC records..." -ForegroundColor Green

$getAllResponse = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/mini-kyc/all"

if ($getAllResponse -and $getAllResponse.success) {
    Write-Host "All KYC records retrieved successfully!" -ForegroundColor Green
    Write-Host "Number of records: $($getAllResponse.data.Count)"
    Write-Host "First record:"
    Write-Host ($getAllResponse.data[0] | ConvertTo-Json -Depth 5)
} else {
    Write-Host "All KYC records retrieval failed!" -ForegroundColor Red
}

# Step 7: Test KYC deletion
Write-Host "`nStep 7: Testing KYC deletion..." -ForegroundColor Green

$deleteResponse = Invoke-AuthenticatedRequest -Method "DELETE" -Url "$baseUrl/mini-kyc"

if ($deleteResponse -and $deleteResponse.success) {
    Write-Host "KYC deleted successfully!" -ForegroundColor Green
    Write-Host "Response:"
    Write-Host ($deleteResponse | ConvertTo-Json -Depth 5)
} else {
    Write-Host "KYC deletion failed!" -ForegroundColor Red
}

# Step 8: Verify deletion by trying to get KYC
Write-Host "`nStep 8: Verifying deletion by attempting to retrieve KYC..." -ForegroundColor Green

$verifyDeleteResponse = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/mini-kyc"

if ($verifyDeleteResponse -and $verifyDeleteResponse.success -and $verifyDeleteResponse.data -eq $null) {
    Write-Host "Deletion verified successfully! No KYC data found." -ForegroundColor Green
} else {
    Write-Host "Deletion verification failed or KYC still exists!" -ForegroundColor Red
}

Write-Host "`nTest completed!" -ForegroundColor Yellow
