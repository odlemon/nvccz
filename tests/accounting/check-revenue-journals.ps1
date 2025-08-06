# Simple script to check revenue journal entries

$loginData = @{
    email = "admin@nvccz.co.zw"
    password = "admin123"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
$token = $response.token

$headers = @{
    'Authorization' = "Bearer $token"
    'Content-Type' = 'application/json'
}

Write-Host "=== Revenue Journal Entries Check ===" -ForegroundColor Green

# Get all journal entries
$journalResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/journal-entries" -Headers $headers -Method Get

Write-Host "`nRecent Journal Entries:" -ForegroundColor Yellow
$journalResponse.data | Select-Object -First 5 | Format-Table id, entryDate, description, totalDebit, totalCredit -AutoSize

# Find revenue-related journal entries
$revenueEntries = $journalResponse.data | Where-Object { $_.description -like "*Revenue*" }

if ($revenueEntries) {
    Write-Host "`n=== Revenue Journal Entries Found ===" -ForegroundColor Green
    foreach ($entry in $revenueEntries) {
        Write-Host "`nEntry ID: $($entry.id)" -ForegroundColor Cyan
        Write-Host "Description: $($entry.description)" -ForegroundColor White
        Write-Host "Total Debit: $($entry.totalDebit)" -ForegroundColor White
        Write-Host "Total Credit: $($entry.totalCredit)" -ForegroundColor White
        
        # Get journal entry lines
        $linesResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/journal-entries/$($entry.id)/lines" -Headers $headers -Method Get
        
        Write-Host "`nJournal Entry Lines:" -ForegroundColor Yellow
        $linesResponse.data | Format-Table accountName, debit, credit, description -AutoSize
        
        # Check if debits equal credits
        $totalDebit = ($linesResponse.data | Measure-Object -Property debit -Sum).Sum
        $totalCredit = ($linesResponse.data | Measure-Object -Property credit -Sum).Sum
        
        Write-Host "`nAccuracy Check:" -ForegroundColor Magenta
        Write-Host "Total Debit: $totalDebit" -ForegroundColor White
        Write-Host "Total Credit: $totalCredit" -ForegroundColor White
        
        if ($totalDebit -eq $totalCredit) {
            Write-Host "✓ Debits equal Credits - CORRECT" -ForegroundColor Green
        } else {
            Write-Host "✗ Debits do not equal Credits - ERROR" -ForegroundColor Red
        }
        
        Write-Host "`n" + ("=" * 50) -ForegroundColor Gray
    }
} else {
    Write-Host "No revenue journal entries found" -ForegroundColor Red
} 