# Debug Journal Response Structure
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== DEBUG JOURNAL RESPONSE STRUCTURE ===" -ForegroundColor Cyan

try {
    # Authenticate
    $loginData = @{
        email = "admin@nvccz.co.zw"
        password = "admin123"
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
    $headers = @{ Authorization = "Bearer $($authResponse.token)" }
    Write-Host "Authentication successful" -ForegroundColor Green

    # Get one recent journal entry
    $journalEntries = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Method Get -Headers $headers
    $latestInvoiceJE = $journalEntries.data | Where-Object { $_.description -like "*Invoice*" } | Select-Object -First 1
    
    if ($latestInvoiceJE) {
        Write-Host "`nTesting with Journal Entry: $($latestInvoiceJE.referenceNumber)" -ForegroundColor Yellow
        Write-Host "ID: $($latestInvoiceJE.id)" -ForegroundColor White
        
        # Use Invoke-WebRequest to get the raw response
        Write-Host "`nMaking API call to get detailed journal entry..." -ForegroundColor Yellow
        $response = Invoke-WebRequest -Uri "$BaseUrl/api/accounting/journal-entries/$($latestInvoiceJE.id)" -Method Get -Headers $headers
        
        Write-Host "Response Status: $($response.StatusCode)" -ForegroundColor Green
        Write-Host "Response Content Length: $($response.Content.Length)" -ForegroundColor White
        
        Write-Host "`nRaw Response Content:" -ForegroundColor Yellow
        Write-Host "----------------------------------------" -ForegroundColor Gray
        Write-Host $response.Content -ForegroundColor White
        Write-Host "----------------------------------------" -ForegroundColor Gray
        
        # Parse and examine structure
        $parsedResponse = $response.Content | ConvertFrom-Json
        Write-Host "`nParsed Response Structure:" -ForegroundColor Yellow
        Write-Host "Success: $($parsedResponse.success)" -ForegroundColor White
        Write-Host "Message: $($parsedResponse.message)" -ForegroundColor White
        
        if ($parsedResponse.data) {
            Write-Host "Data structure:" -ForegroundColor Yellow
            Write-Host "  Has journalEntry: $($parsedResponse.data.journalEntry -ne $null)" -ForegroundColor White
            Write-Host "  Has journalEntryLines: $($parsedResponse.data.journalEntryLines -ne $null)" -ForegroundColor White
            
            if ($parsedResponse.data.journalEntryLines) {
                Write-Host "  journalEntryLines count: $($parsedResponse.data.journalEntryLines.Count)" -ForegroundColor White
                Write-Host "  journalEntryLines type: $($parsedResponse.data.journalEntryLines.GetType().Name)" -ForegroundColor White
                
                if ($parsedResponse.data.journalEntryLines.Count -gt 0) {
                    Write-Host "`n  Sample line details:" -ForegroundColor Yellow
                    $firstLine = $parsedResponse.data.journalEntryLines[0]
                    Write-Host "    Line ID: $($firstLine.id)" -ForegroundColor White
                    Write-Host "    Account Name: $($firstLine.chartOfAccount.accountName)" -ForegroundColor White
                    Write-Host "    Debit: $($firstLine.debitAmount)" -ForegroundColor Green
                    Write-Host "    Credit: $($firstLine.creditAmount)" -ForegroundColor Magenta
                }
            }
            
            # Check if lines are nested under journalEntry
            if ($parsedResponse.data.journalEntry -and $parsedResponse.data.journalEntry.journalEntryLines) {
                Write-Host "`n  FOUND: Lines under journalEntry object!" -ForegroundColor Green
                Write-Host "  Count: $($parsedResponse.data.journalEntry.journalEntryLines.Count)" -ForegroundColor White
            }
        }
        
    } else {
        Write-Host "No invoice journal entries found!" -ForegroundColor Red
    }

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}