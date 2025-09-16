# Test script for the new Mini-KYC structure
# This script tests the updated KYC endpoints with the new request body structure

$baseUrl = "http://localhost:3000"
$authToken = ""

# Get authentication token
Write-Host "=== Getting Authentication Token ===" -ForegroundColor Green
try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    
    if ($loginResponse.success) {
        $authToken = $loginResponse.data.token
        Write-Host "Authentication successful! Token: $($authToken.Substring(0, 50))..." -ForegroundColor Green
    } else {
        Write-Host "Authentication failed: $($loginResponse.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

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
    
    if ($authToken) {
        $headers["Authorization"] = "Bearer $authToken"
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

# Extract user ID from login response
$userID = $loginResponse.data.user.id
Write-Host "Using User ID: $userID" -ForegroundColor Cyan

# Test 1: Create/Update Mini-KYC with new structure
Write-Host "=== Test 1: Create/Update Mini-KYC ===" -ForegroundColor Green

$kycData = @{
    ID = $userID
    Preferences = @("preference1", "preference2", "preference3")
}

Write-Host "Request Body:"
$kycData | ConvertTo-Json | Write-Host

$response = Invoke-AuthenticatedRequest -Method "POST" -Url "$baseUrl/api/mini-kyc" -Body $kycData

if ($response) {
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10 | Write-Host
} else {
    Write-Host "Failed to create/update KYC" -ForegroundColor Red
}

# Test 2: Get Mini-KYC
Write-Host "`n=== Test 2: Get Mini-KYC ===" -ForegroundColor Green

$response = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/api/mini-kyc?userId=$userID"

if ($response) {
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10 | Write-Host
} else {
    Write-Host "Failed to get KYC" -ForegroundColor Red
}

# Test 3: Update Mini-KYC
Write-Host "`n=== Test 3: Update Mini-KYC ===" -ForegroundColor Green

$updateData = @{
    ID = $userID
    Preferences = @("updated-preference1", "updated-preference2", "new-preference4")
}

Write-Host "Request Body:"
$updateData | ConvertTo-Json | Write-Host

$response = Invoke-AuthenticatedRequest -Method "PUT" -Url "$baseUrl/api/mini-kyc" -Body $updateData

if ($response) {
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10 | Write-Host
} else {
    Write-Host "Failed to update KYC" -ForegroundColor Red
}

# Test 4: Verify the update
Write-Host "`n=== Test 4: Verify Update ===" -ForegroundColor Green

$response = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/api/mini-kyc?userId=$userID"

if ($response) {
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10 | Write-Host
} else {
    Write-Host "Failed to get updated KYC" -ForegroundColor Red
}

# Test 5: Test validation - Missing ID
Write-Host "`n=== Test 5: Validation - Missing ID ===" -ForegroundColor Yellow

$invalidData = @{
    Preferences = @("preference1", "preference2")
}

$response = Invoke-AuthenticatedRequest -Method "POST" -Url "$baseUrl/api/mini-kyc" -Body $invalidData

if ($response) {
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10 | Write-Host
} else {
    Write-Host "Validation working correctly" -ForegroundColor Green
}

# Test 6: Test validation - Missing Preferences
Write-Host "`n=== Test 6: Validation - Missing Preferences ===" -ForegroundColor Yellow

$invalidData2 = @{
    ID = $userID
}

$response = Invoke-AuthenticatedRequest -Method "POST" -Url "$baseUrl/api/mini-kyc" -Body $invalidData2

if ($response) {
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10 | Write-Host
} else {
    Write-Host "Validation working correctly" -ForegroundColor Green
}

# Test 7: Test validation - Preferences not array
Write-Host "`n=== Test 7: Validation - Preferences not array ===" -ForegroundColor Yellow

$invalidData3 = @{
    ID = $userID
    Preferences = "not-an-array"
}

$response = Invoke-AuthenticatedRequest -Method "POST" -Url "$baseUrl/api/mini-kyc" -Body $invalidData3

if ($response) {
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10 | Write-Host
} else {
    Write-Host "Validation working correctly" -ForegroundColor Green
}

# Test 8: Delete Mini-KYC
Write-Host "`n=== Test 8: Delete Mini-KYC ===" -ForegroundColor Green

$response = Invoke-AuthenticatedRequest -Method "DELETE" -Url "$baseUrl/api/mini-kyc?userId=$userID"

if ($response) {
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10 | Write-Host
} else {
    Write-Host "Failed to delete KYC" -ForegroundColor Red
}

# Test 9: Verify deletion
Write-Host "`n=== Test 9: Verify Deletion ===" -ForegroundColor Green

$response = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/api/mini-kyc?userId=$userID"

if ($response) {
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10 | Write-Host
} else {
    Write-Host "KYC successfully deleted (no data returned)" -ForegroundColor Green
}

Write-Host "`n=== All CRUD tests completed ===" -ForegroundColor Green
