# Test Background Image Field
$baseUrl = "http://localhost:3000"

Write-Host "Testing Background Image Field" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green

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

# 2. Get current user to see if backgroundImage field exists
Write-Host "2. Getting current user profile..." -ForegroundColor Yellow

# Decode JWT token to get user ID
$tokenParts = $token.Split('.')
$payload = $tokenParts[1]
$payload = $payload.PadRight([math]::Ceiling($payload.Length / 4) * 4, '=')
$payload = $payload.Replace('-', '+').Replace('_', '/')
$decodedBytes = [System.Convert]::FromBase64String($payload)
$decodedString = [System.Text.Encoding]::UTF8.GetString($decodedBytes)
$decodedToken = $decodedString | ConvertFrom-Json
$userId = $decodedToken.userId

Write-Host "Current user ID from token: $userId" -ForegroundColor Cyan

try {
    $userResponse = Invoke-RestMethod -Uri "$baseUrl/api/users/$userId" -Method GET -Headers $headers
    
    Write-Host "Current user profile:" -ForegroundColor Green
    Write-Host "  ID: $($userResponse.data.id)" -ForegroundColor White
    Write-Host "  Name: $($userResponse.data.firstName) $($userResponse.data.lastName)" -ForegroundColor White
    Write-Host "  Email: $($userResponse.data.email)" -ForegroundColor White
    Write-Host "  Background Image: $($userResponse.data.backgroundImage)" -ForegroundColor White
    
    if ($userResponse.data.backgroundImage -eq $null) {
        Write-Host "  Background Image: null (not set)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Failed to get user profile: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Update user with background image
Write-Host "3. Updating user with background image..." -ForegroundColor Yellow
$updatePayload = @{
    backgroundImage = "https://example.com/backgrounds/tech-background.jpg"
}

try {
    $updateResponse = Invoke-RestMethod -Uri "$baseUrl/api/users/$($userResponse.data.id)" -Method PUT -Headers $headers -Body ($updatePayload | ConvertTo-Json)
    
    Write-Host "User updated successfully!" -ForegroundColor Green
    Write-Host "Updated Background Image: $($updateResponse.data.backgroundImage)" -ForegroundColor White
} catch {
    Write-Host "Failed to update user: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Get all users to see backgroundImage field
Write-Host "4. Getting all users..." -ForegroundColor Yellow
try {
    $allUsersResponse = Invoke-RestMethod -Uri "$baseUrl/api/users" -Method GET -Headers $headers
    
    Write-Host "Found $($allUsersResponse.data.Length) users" -ForegroundColor Green
    
    $allUsersResponse.data | ForEach-Object {
        Write-Host "--- User ---" -ForegroundColor Yellow
        Write-Host "  ID: $($_.id)" -ForegroundColor White
        Write-Host "  Name: $($_.firstName) $($_.lastName)" -ForegroundColor White
        Write-Host "  Email: $($_.email)" -ForegroundColor White
        Write-Host "  Background Image: $($_.backgroundImage)" -ForegroundColor White
    }
} catch {
    Write-Host "Failed to get all users: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Test creating a new user with background image
Write-Host "5. Testing user creation with background image..." -ForegroundColor Yellow
$newUserPayload = @{
    firstName = "Test"
    lastName = "User"
    email = "testuser@example.com"
    password = "testpass123"
    roleId = $userResponse.data.role.id
    backgroundImage = "https://example.com/backgrounds/new-user-bg.jpg"
}

try {
    $createResponse = Invoke-RestMethod -Uri "$baseUrl/api/users" -Method POST -Headers $headers -Body ($newUserPayload | ConvertTo-Json)
    
    Write-Host "New user created successfully!" -ForegroundColor Green
    Write-Host "  ID: $($createResponse.data.id)" -ForegroundColor White
    Write-Host "  Name: $($createResponse.data.firstName) $($createResponse.data.lastName)" -ForegroundColor White
    Write-Host "  Background Image: $($createResponse.data.backgroundImage)" -ForegroundColor White
    
    # Clean up - delete the test user
    Write-Host "6. Cleaning up test user..." -ForegroundColor Yellow
    Invoke-RestMethod -Uri "$baseUrl/api/users/$($createResponse.data.id)" -Method DELETE -Headers $headers | Out-Null
    Write-Host "Test user deleted" -ForegroundColor Green
    
} catch {
    Write-Host "Failed to create test user: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Background image field test complete!" -ForegroundColor Green 