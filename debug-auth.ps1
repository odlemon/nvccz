# Debug Authentication
$baseUrl = "http://localhost:3000/api"
$adminEmail = "admin@nvccz.co.zw"
$adminPassword = "admin123"

Write-Host "🔍 Debugging Authentication" -ForegroundColor Green
Write-Host "===========================" -ForegroundColor Green

# Step 1: Test server is running
Write-Host "`n1. Testing server connection..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body '{"email":"test","password":"test"}' -ContentType "application/json"
    Write-Host "✅ Server is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Server connection failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# Step 2: Login to get token
Write-Host "`n2. Logging in as admin..." -ForegroundColor Yellow
$loginBody = @{
    email = $adminEmail
    password = $adminPassword
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.data.token
    Write-Host "✅ Login successful" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor Cyan
} catch {
    Write-Host "❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.Exception.Response)" -ForegroundColor Red
    exit
}

# Step 3: Test token with a simple endpoint
Write-Host "`n3. Testing token with user profile..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    $profileResponse = Invoke-RestMethod -Uri "$baseUrl/users/profile" -Method GET -Headers $headers
    Write-Host "✅ Token works with user profile" -ForegroundColor Green
    Write-Host "   User: $($profileResponse.data.firstName) $($profileResponse.data.lastName)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Token test failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.Exception.Response)" -ForegroundColor Red
}

# Step 4: Test mini-KYC endpoint
Write-Host "`n4. Testing mini-KYC endpoint..." -ForegroundColor Yellow
try {
    $kycResponse = Invoke-RestMethod -Uri "$baseUrl/mini-kyc" -Method GET -Headers $headers
    Write-Host "✅ Mini-KYC endpoint accessible" -ForegroundColor Green
    Write-Host "   Response: $($kycResponse | ConvertTo-Json -Depth 2)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Mini-KYC endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.Exception.Response)" -ForegroundColor Red
}

Write-Host "`n🔍 Debug complete!" -ForegroundColor Green 