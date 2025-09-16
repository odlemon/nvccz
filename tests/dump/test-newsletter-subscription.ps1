# Newsletter Subscription Test Script
# This script tests the complete newsletter subscription flow with double opt-in

$baseUrl = "http://localhost:3000"
$apiUrl = "$baseUrl/api"

Write-Host "📧 Testing Newsletter Subscription System" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

# Test 1: Get available topics
Write-Host "`n1️⃣ Testing: Get available topics" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$apiUrl/newsletter/topics" -Method GET
    Write-Host "✅ Available topics:" -ForegroundColor Green
    $response.data.topics | ForEach-Object { Write-Host "   • $_" -ForegroundColor Cyan }
} catch {
    Write-Host "❌ Error getting topics: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Subscribe to newsletter
Write-Host "`n2️⃣ Testing: Subscribe to newsletter" -ForegroundColor Yellow
$subscribeData = @{
    email = "test@example.com"
    firstName = "John"
    lastName = "Doe"
    topics = @("Company Updates", "Industry News")
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/newsletter/subscribe" -Method POST -Body $subscribeData -ContentType "application/json"
    Write-Host "✅ Subscription request successful:" -ForegroundColor Green
    Write-Host "   Message: $($response.message)" -ForegroundColor Cyan
    Write-Host "   Email: $($response.data.email)" -ForegroundColor Cyan
    Write-Host "   Topics: $($response.data.topics -join ', ')" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error subscribing: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $errorResponse = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($errorResponse)
        $errorBody = $reader.ReadToEnd()
        Write-Host "   Error details: $errorBody" -ForegroundColor Red
    }
}

# Test 3: Check subscription status
Write-Host "`n3️⃣ Testing: Check subscription status" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$apiUrl/newsletter/status?email=test@example.com" -Method GET
    Write-Host "✅ Subscription status:" -ForegroundColor Green
    Write-Host "   Subscribed: $($response.data.subscribed)" -ForegroundColor Cyan
    Write-Host "   Status: $($response.data.status)" -ForegroundColor Cyan
    if ($response.data.topics) {
        Write-Host "   Topics: $($response.data.topics -join ', ')" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Error checking status: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Try to subscribe with invalid email
Write-Host "`n4️⃣ Testing: Subscribe with invalid email" -ForegroundColor Yellow
$invalidData = @{
    email = "invalid-email"
    firstName = "Test"
    topics = @("Company Updates")
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/newsletter/subscribe" -Method POST -Body $invalidData -ContentType "application/json"
    Write-Host "❌ Should have failed with invalid email" -ForegroundColor Red
} catch {
    Write-Host "✅ Correctly rejected invalid email: $($_.Exception.Message)" -ForegroundColor Green
}

# Test 5: Try to subscribe with invalid topics
Write-Host "`n5️⃣ Testing: Subscribe with invalid topics" -ForegroundColor Yellow
$invalidTopicsData = @{
    email = "test2@example.com"
    topics = @("Invalid Topic", "Another Invalid")
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/newsletter/subscribe" -Method POST -Body $invalidTopicsData -ContentType "application/json"
    Write-Host "❌ Should have failed with invalid topics" -ForegroundColor Red
} catch {
    Write-Host "✅ Correctly rejected invalid topics: $($_.Exception.Message)" -ForegroundColor Green
}

# Test 6: Subscribe again with same email (should resend confirmation)
Write-Host "`n6️⃣ Testing: Resubscribe with same email" -ForegroundColor Yellow
$resubscribeData = @{
    email = "test@example.com"
    topics = @("Product Announcements")
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/newsletter/subscribe" -Method POST -Body $resubscribeData -ContentType "application/json"
    Write-Host "✅ Resubscription successful:" -ForegroundColor Green
    Write-Host "   Message: $($response.message)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error resubscribing: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Unsubscribe
Write-Host "`n7️⃣ Testing: Unsubscribe" -ForegroundColor Yellow
$unsubscribeData = @{
    email = "test@example.com"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/newsletter/unsubscribe" -Method POST -Body $unsubscribeData -ContentType "application/json"
    Write-Host "✅ Unsubscribe successful:" -ForegroundColor Green
    Write-Host "   Message: $($response.message)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error unsubscribing: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 8: Check status after unsubscribe
Write-Host "`n8️⃣ Testing: Check status after unsubscribe" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$apiUrl/newsletter/status?email=test@example.com" -Method GET
    Write-Host "✅ Status after unsubscribe:" -ForegroundColor Green
    Write-Host "   Subscribed: $($response.data.subscribed)" -ForegroundColor Cyan
    Write-Host "   Status: $($response.data.status)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Error checking status: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n🎉 Newsletter subscription testing completed!" -ForegroundColor Green
Write-Host "`n📝 Notes:" -ForegroundColor Yellow
Write-Host "   • The confirmation email is logged to console (not actually sent)" -ForegroundColor White
Write-Host "   • In production, integrate with a real email service like SendGrid or AWS SES" -ForegroundColor White
Write-Host "   • The confirmation token expires after 24 hours" -ForegroundColor White
Write-Host "   • Rate limiting is applied (10 requests per 15 minutes)" -ForegroundColor White


