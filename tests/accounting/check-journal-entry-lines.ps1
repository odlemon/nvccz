# Check Journal Entry Lines Script
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== CHECK JOURNAL ENTRY LINES ===" -ForegroundColor Cyan

try {
    # Authenticate
    $loginData = @{
        email = "admin@nvccz.co.zw"
        password = "admin123"
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
    $headers = @{ Authorization = "Bearer $($authResponse.token)" }
    Write-Host "✅ Authentication successful" -ForegroundColor Green

    # Get all journal entries
    Write-Host "`n1. Getting all journal entries..." -ForegroundColor Yellow
    $journalEntries = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Method Get -Headers $headers
    
    $invoiceJEs = $journalEntries.data | Where-Object { $_.description -like "*Invoice*" } | Select-Object -First 1
    
    if ($invoiceJEs) {
        Write-Host "✅ Found invoice journal entry: $($invoiceJEs.referenceNumber)" -ForegroundColor Green
        Write-Host "   ID: $($invoiceJEs.id)" -ForegroundColor White
        Write-Host "   Description: $($invoiceJEs.description)" -ForegroundColor White
        Write-Host "   Total Amount: $($invoiceJEs.totalAmount)" -ForegroundColor White
        
        # Get detailed journal entry with lines
        Write-Host "`n2. Getting detailed journal entry with lines..." -ForegroundColor Yellow
        $detailedJE = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries/$($invoiceJEs.id)" -Method Get -Headers $headers
        
        Write-Host "✅ Retrieved detailed journal entry" -ForegroundColor Green
        Write-Host "   Lines count: $($detailedJE.journalEntryLines.Count)" -ForegroundColor White
        
        if ($detailedJE.journalEntryLines.Count -gt 0) {
            Write-Host "`n   Journal Entry Lines:" -ForegroundColor Yellow
            foreach ($line in $detailedJE.journalEntryLines) {
                Write-Host "     Line ID: $($line.id)" -ForegroundColor Gray
                Write-Host "     Account: $($line.chartOfAccount.accountName)" -ForegroundColor White
                Write-Host "     Debit: $($line.debitAmount)" -ForegroundColor Green
                Write-Host "     Credit: $($line.creditAmount)" -ForegroundColor Magenta
                Write-Host "     Description: $($line.description)" -ForegroundColor Gray
                Write-Host "     ---" -ForegroundColor Gray
            }
        } else {
            Write-Host "   ❌ No journal entry lines found!" -ForegroundColor Red
            Write-Host "   This indicates the journal entry lines were not created during invoice creation." -ForegroundColor Red
        }
        
        # Check database directly for journal entry lines
        Write-Host "`n3. Checking what the API response structure looks like..." -ForegroundColor Yellow
        Write-Host "   Full response structure:" -ForegroundColor Gray
        $detailedJE | ConvertTo-Json -Depth 3 | Write-Host -ForegroundColor DarkGray
        
    } else {
        Write-Host "❌ No invoice journal entries found!" -ForegroundColor Red
    }

} catch {
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}