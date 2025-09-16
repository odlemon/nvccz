# Quick check for journal entries
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

Write-Host "Total journal entries: $($journalResponse.data.journalEntries.Count)" -ForegroundColor Green

# Show recent entries
$recentEntries = $journalResponse.data.journalEntries | Sort-Object createdAt -Descending | Select-Object -First 10

Write-Host "Recent journal entries:" -ForegroundColor Cyan
foreach ($entry in $recentEntries) {
    Write-Host "ID: $($entry.id)" -ForegroundColor Gray
    Write-Host "Description: $($entry.description)" -ForegroundColor Gray
    Write-Host "Amount: $($entry.totalAmount)" -ForegroundColor Gray
    Write-Host "Status: $($entry.status)" -ForegroundColor Gray
    Write-Host "Created: $($entry.createdAt)" -ForegroundColor Gray
    Write-Host "---" -ForegroundColor Gray
} 