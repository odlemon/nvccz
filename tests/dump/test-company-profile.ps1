# Test Company Profile CRUD Operations
$baseUrl = "http://localhost:3000"

Write-Host "Testing Company Profile CRUD Operations" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green

# 1. Login
Write-Host "1. Authenticating..." -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    $token = $login.token
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
    Write-Host "Authentication successful" -ForegroundColor Green
} catch {
    Write-Host "Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 2. Check if company profile exists
Write-Host "2. Checking if company profile exists..." -ForegroundColor Yellow
try {
    $profileResponse = Invoke-RestMethod -Uri "$baseUrl/api/company-profile" -Method GET -Headers $headers
    
    Write-Host "Company profile found!" -ForegroundColor Green
    Write-Host "  ID: $($profileResponse.data.id)" -ForegroundColor White
    Write-Host "  Twitter: $($profileResponse.data.twitter)" -ForegroundColor White
    Write-Host "  Facebook: $($profileResponse.data.facebook)" -ForegroundColor White
    Write-Host "  LinkedIn: $($profileResponse.data.linkedin)" -ForegroundColor White
    Write-Host "  Instagram: $($profileResponse.data.instagram)" -ForegroundColor White
    Write-Host "  Created At: $($profileResponse.data.createdAt)" -ForegroundColor White
    Write-Host "  Updated At: $($profileResponse.data.updatedAt)" -ForegroundColor White
    
    $profileExists = $true
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "No company profile found (404)" -ForegroundColor Yellow
        $profileExists = $false
    } else {
        Write-Host "Error checking profile: $($_.Exception.Message)" -ForegroundColor Red
        exit
    }
}

# 3. Create or Update company profile
Write-Host "3. Creating/Updating company profile..." -ForegroundColor Yellow
$profilePayload = @{
    twitter = "https://twitter.com/nvccz"
    facebook = "https://facebook.com/nvccz"
    linkedin = "https://linkedin.com/company/nvccz"
    instagram = "https://instagram.com/nvccz"
}

try {
    if ($profileExists) {
        # Update existing profile
        $response = Invoke-RestMethod -Uri "$baseUrl/api/company-profile" -Method PUT -Headers $headers -Body ($profilePayload | ConvertTo-Json)
        Write-Host "Company profile updated successfully!" -ForegroundColor Green
    } else {
        # Create new profile
        $response = Invoke-RestMethod -Uri "$baseUrl/api/company-profile" -Method POST -Headers $headers -Body ($profilePayload | ConvertTo-Json)
        Write-Host "Company profile created successfully!" -ForegroundColor Green
    }
    
    Write-Host "Profile Details:" -ForegroundColor Cyan
    Write-Host "  ID: $($response.data.id)" -ForegroundColor White
    Write-Host "  Twitter: $($response.data.twitter)" -ForegroundColor White
    Write-Host "  Facebook: $($response.data.facebook)" -ForegroundColor White
    Write-Host "  LinkedIn: $($response.data.linkedin)" -ForegroundColor White
    Write-Host "  Instagram: $($response.data.instagram)" -ForegroundColor White
} catch {
    Write-Host "Failed to create/update profile: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 4. Test upsert endpoint
Write-Host "4. Testing upsert endpoint..." -ForegroundColor Yellow
$upsertPayload = @{
    twitter = "https://twitter.com/nvccz_updated"
    facebook = "https://facebook.com/nvccz_updated"
    linkedin = "https://linkedin.com/company/nvccz_updated"
    instagram = "https://instagram.com/nvccz_updated"
}

try {
    $upsertResponse = Invoke-RestMethod -Uri "$baseUrl/api/company-profile/upsert" -Method POST -Headers $headers -Body ($upsertPayload | ConvertTo-Json)
    
    Write-Host "Upsert successful!" -ForegroundColor Green
    Write-Host "Message: $($upsertResponse.message)" -ForegroundColor White
    Write-Host "Updated Profile:" -ForegroundColor Cyan
    Write-Host "  Twitter: $($upsertResponse.data.twitter)" -ForegroundColor White
    Write-Host "  Facebook: $($upsertResponse.data.facebook)" -ForegroundColor White
    Write-Host "  LinkedIn: $($upsertResponse.data.linkedin)" -ForegroundColor White
    Write-Host "  Instagram: $($upsertResponse.data.instagram)" -ForegroundColor White
} catch {
    Write-Host "Failed to upsert profile: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Get updated profile
Write-Host "5. Getting updated profile..." -ForegroundColor Yellow
try {
    $getResponse = Invoke-RestMethod -Uri "$baseUrl/api/company-profile" -Method GET -Headers $headers
    
    Write-Host "Retrieved Profile:" -ForegroundColor Green
    Write-Host "  ID: $($getResponse.data.id)" -ForegroundColor White
    Write-Host "  Twitter: $($getResponse.data.twitter)" -ForegroundColor White
    Write-Host "  Facebook: $($getResponse.data.facebook)" -ForegroundColor White
    Write-Host "  LinkedIn: $($getResponse.data.linkedin)" -ForegroundColor White
    Write-Host "  Instagram: $($getResponse.data.instagram)" -ForegroundColor White
    Write-Host "  Updated At: $($getResponse.data.updatedAt)" -ForegroundColor White
} catch {
    Write-Host "Failed to get profile: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Test partial update
Write-Host "6. Testing partial update..." -ForegroundColor Yellow
$partialPayload = @{
    twitter = "https://twitter.com/nvccz_partial"
    # Only updating Twitter, leaving others unchanged
}

try {
    $partialResponse = Invoke-RestMethod -Uri "$baseUrl/api/company-profile" -Method PUT -Headers $headers -Body ($partialPayload | ConvertTo-Json)
    
    Write-Host "Partial update successful!" -ForegroundColor Green
    Write-Host "Updated Profile:" -ForegroundColor Cyan
    Write-Host "  Twitter: $($partialResponse.data.twitter)" -ForegroundColor White
    Write-Host "  Facebook: $($partialResponse.data.facebook)" -ForegroundColor White
    Write-Host "  LinkedIn: $($partialResponse.data.linkedin)" -ForegroundColor White
    Write-Host "  Instagram: $($partialResponse.data.instagram)" -ForegroundColor White
} catch {
    Write-Host "Failed to partially update profile: $($_.Exception.Message)" -ForegroundColor Red
}

# 7. Test delete (optional - uncomment if you want to test deletion)
Write-Host "7. Testing delete functionality..." -ForegroundColor Yellow
Write-Host "Note: Delete test is commented out to preserve data" -ForegroundColor Yellow
Write-Host "Uncomment the delete section in the script if you want to test deletion" -ForegroundColor Yellow

# Uncomment the following lines to test deletion:
# try {
#     $deleteResponse = Invoke-RestMethod -Uri "$baseUrl/api/company-profile" -Method DELETE -Headers $headers
#     Write-Host "Profile deleted successfully!" -ForegroundColor Green
#     Write-Host "Message: $($deleteResponse.message)" -ForegroundColor White
# } catch {
#     Write-Host "Failed to delete profile: $($_.Exception.Message)" -ForegroundColor Red
# }

Write-Host "Company profile CRUD test complete!" -ForegroundColor Green 