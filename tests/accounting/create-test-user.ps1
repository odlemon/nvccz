# Create Test User
$baseUrl = "http://localhost:3000"

Write-Host "=== CREATING TEST USER ===" -ForegroundColor Magenta
Write-Host ""

# Create test user
$userData = @{
    firstName = "Test"
    lastName = "User"
    email = "test@example.com"
    password = "password123"
    roleId = "admin-role"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "$baseUrl/api/auth/register" -Method POST -ContentType "application/json" -Body $userData

if ($response.success) {
    Write-Host "✓ Test user created successfully" -ForegroundColor Green
    Write-Host "  Email: test@example.com" -ForegroundColor White
    Write-Host "  Password: password123" -ForegroundColor White
} else {
    Write-Host "✗ Error creating test user: $($response.message)" -ForegroundColor Red
}

Write-Host "`n=== USER CREATION COMPLETED ===" -ForegroundColor Magenta 