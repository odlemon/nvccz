# Verify Revenue Journal Entries
$baseUrl = "http://localhost:3000"

# Login
$login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
$token = $login.token
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $token"
}

Write-Host "=== REVENUE JOURNAL ENTRIES VERIFICATION ===" -ForegroundColor Green

# Get all journal entries
$journals = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries" -Headers $headers -Method Get
$revenueJournals = $journals.data | Where-Object { $_.description -like "*Revenue*" }

Write-Host "Found $($revenueJournals.Count) revenue journal entries" -ForegroundColor Yellow

foreach ($journal in $revenueJournals) {
    Write-Host "`nJournal Entry: $($journal.referenceNumber) - $($journal.description)" -ForegroundColor Cyan
    Write-Host "Status: $($journal.status), Date: $($journal.transactionDate)" -ForegroundColor White
    
    # Get journal entry with lines
    $journalDetail = Invoke-RestMethod -Uri "$baseUrl/api/accounting/journal-entries/$($journal.id)" -Headers $headers -Method Get
    
    $totalDebit = 0
    $totalCredit = 0
    
    if ($journalDetail.data.journalEntryLines) {
        foreach ($line in $journalDetail.data.journalEntryLines) {
            $debit = [double]$line.debitAmount
            $credit = [double]$line.creditAmount
            $accountName = $line.chartOfAccount.accountName
            $description = $line.description
            
            $totalDebit += $debit
            $totalCredit += $credit
            
            if ($debit -gt 0) {
                Write-Host "  Dr $accountName`: $debit - $description" -ForegroundColor Green
            } else {
                Write-Host "  Cr $accountName`: $credit - $description" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "  No journal entry lines found" -ForegroundColor Yellow
    }
    
    Write-Host "  Total Debit: $totalDebit, Total Credit: $totalCredit" -ForegroundColor Yellow
    
    if ($totalDebit -eq $totalCredit) {
        Write-Host "  ✅ Balanced" -ForegroundColor Green
    } else {
        Write-Host "  ❌ NOT Balanced" -ForegroundColor Red
    }
    
    Write-Host "---" -ForegroundColor Gray
}

Write-Host "`n=== VERIFICATION COMPLETE ===" -ForegroundColor Green 