# Debug script to examine all journal entries in detail
param(
    [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "=== Debug Journal Entries ===" -ForegroundColor Green

# Login
$loginData = @{email="admin@nvccz.co.zw"; password="admin123"}
$loginResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body ($loginData | ConvertTo-Json) -ContentType "application/json"
$token = $loginResponse.token
$Headers = @{"Content-Type"="application/json"; "Authorization"="Bearer $token"}

# Get all journal entries
$journalEntriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Headers $Headers -Method Get

Write-Host "Total Journal Entries: $($journalEntriesResponse.data.Count)" -ForegroundColor Cyan

# Display all journal entries with details
foreach ($entry in $journalEntriesResponse.data) {
    Write-Host ""
    Write-Host "Journal Entry: $($entry.referenceNumber)" -ForegroundColor Yellow
    Write-Host "  Description: $($entry.description)" -ForegroundColor White
    Write-Host "  Date: $($entry.transactionDate)" -ForegroundColor White
    Write-Host "  Total Amount: $($entry.totalAmount)" -ForegroundColor White
    Write-Host "  Status: $($entry.status)" -ForegroundColor White
    
    # Get detailed lines for this entry
    $entryDetails = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries/$($entry.id)" -Headers $Headers -Method Get
    
    Write-Host "  Lines:" -ForegroundColor Cyan
    foreach ($line in $entryDetails.data.journalEntryLines) {
        $accountName = $line.chartOfAccount.accountName
        $debit = $line.debitAmount
        $credit = $line.creditAmount
        $description = $line.description
        
        if ($debit -gt 0) {
            Write-Host "    Dr $($accountName): $($debit) ($($description))" -ForegroundColor White
        } else {
            Write-Host "    Cr $($accountName): $($credit) ($($description))" -ForegroundColor White
        }
    }
}

Write-Host ""
Write-Host "=== Debug Complete ===" -ForegroundColor Green 