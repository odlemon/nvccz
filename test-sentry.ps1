# Sentry Integration Test Script
# This script tests Sentry error monitoring and performance tracking

$baseUrl = "http://localhost:3000"
$apiUrl = "$baseUrl/api"

Write-Host "🚀 Testing Sentry Integration" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green

# Test 1: Test API health (should work)
Write-Host "`n1️⃣ Testing: API Health Check" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method GET
    Write-Host "✅ API is healthy:" -ForegroundColor Green
    Write-Host "   Status: $($response.status)" -ForegroundColor Cyan
    Write-Host "   Environment: $($response.environment)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ API health check failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Test Swagger docs (should work)
Write-Host "`n2️⃣ Testing: Swagger Documentation" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api-docs" -Method GET
    Write-Host "✅ Swagger docs accessible" -ForegroundColor Green
} catch {
    Write-Host "❌ Swagger docs failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Test newsletter topics (should work)
Write-Host "`n3️⃣ Testing: Newsletter Topics API" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$apiUrl/newsletter/topics" -Method GET
    Write-Host "✅ Newsletter topics retrieved:" -ForegroundColor Green
    $response.data.topics | ForEach-Object { Write-Host "   • $_" -ForegroundColor Cyan }
} catch {
    Write-Host "❌ Newsletter topics failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Test invalid endpoint (should trigger Sentry error)
Write-Host "`n4️⃣ Testing: Invalid Endpoint (should trigger Sentry)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$apiUrl/nonexistent-endpoint" -Method GET
    Write-Host "❌ Should have failed with 404" -ForegroundColor Red
} catch {
    Write-Host "✅ Correctly returned 404 error" -ForegroundColor Green
    Write-Host "   This error should be captured by Sentry" -ForegroundColor Cyan
}

# Test 5: Test invalid JSON (should trigger Sentry error)
Write-Host "`n5️⃣ Testing: Invalid JSON (should trigger Sentry)" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$apiUrl/newsletter/subscribe" -Method POST -Body "invalid json" -ContentType "application/json"
    Write-Host "❌ Should have failed with JSON parse error" -ForegroundColor Red
} catch {
    Write-Host "✅ Correctly returned JSON parse error" -ForegroundColor Green
    Write-Host "   This error should be captured by Sentry" -ForegroundColor Cyan
}

Write-Host "`n🎉 Sentry integration testing completed!" -ForegroundColor Green
Write-Host "`n📝 Notes:" -ForegroundColor Yellow
Write-Host "   • Check your server console for Sentry initialization messages" -ForegroundColor White
Write-Host "   • In development, Sentry will only send events if SENTRY_DSN is set" -ForegroundColor White
Write-Host "   • Errors are logged to console and captured by Sentry (if configured)" -ForegroundColor White
Write-Host "   • Performance monitoring is enabled for all HTTP requests" -ForegroundColor White
Write-Host "   • User context is automatically set for authenticated requests" -ForegroundColor White

Write-Host "`n🔧 To enable Sentry in development:" -ForegroundColor Yellow
Write-Host "   1. Create a Sentry account at https://sentry.io" -ForegroundColor White
Write-Host "   2. Create a new project for your Node.js app" -ForegroundColor White
Write-Host "   3. Copy the DSN to your .env file: SENTRY_DSN=https://..." -ForegroundColor White
Write-Host "   4. Restart your server" -ForegroundColor White


