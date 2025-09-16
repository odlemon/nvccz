# Debug journal entries
$baseUrl = "http://localhost:3000/api"

# Login
$loginData = @{
    email = "admin@nvccz.co.zw"
    password = "admin123"
}

$loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body ($loginData | ConvertTo-Json) -ContentType "application/json"
$token = $loginResponse.token

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Get all journal entries
Write-Host "Fetching all journal entries..." -ForegroundColor Yellow
$journalResponse = Invoke-RestMethod -Uri "$baseUrl/accounting/journal-entries" -Method GET -Headers $headers

Write-Host "Total journal entries: $($journalResponse.data.Count)" -ForegroundColor Green

# Show the 5 most recent entries with full details
$recentEntries = $journalResponse.data | Sort-Object createdAt -Descending | Select-Object -First 5

Write-Host "5 Most Recent Journal Entries:" -ForegroundColor Cyan
foreach ($entry in $recentEntries) {
    Write-Host "=== Journal Entry ===" -ForegroundColor Yellow
    Write-Host "ID: $($entry.id)" -ForegroundColor Gray
    Write-Host "Reference: $($entry.referenceNumber)" -ForegroundColor Gray
    Write-Host "Description: $($entry.description)" -ForegroundColor Gray
    Write-Host "Amount: $($entry.totalAmount)" -ForegroundColor Gray
    Write-Host "Status: $($entry.status)" -ForegroundColor Gray
    Write-Host "Created: $($entry.createdAt)" -ForegroundColor Gray
    Write-Host "Currency: $($entry.currency.code)" -ForegroundColor Gray
    Write-Host "---" -ForegroundColor Gray
}

# Check for any entries with "Payment" in description
$paymentEntries = $journalResponse.data | Where-Object { $_.description -like "*Payment*" }
Write-Host "Entries with 'Payment' in description: $($paymentEntries.Count)" -ForegroundColor Cyan

foreach ($entry in $paymentEntries) {
    Write-Host "Payment Entry: $($entry.description) - $($entry.totalAmount)" -ForegroundColor Green
} 