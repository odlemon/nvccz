# Verify Revenue Journal Entries
# This script checks the accuracy of journal entries created for revenue transactions

function Get-AuthToken {
    $loginData = @{
        email = "admin@nvccz.co.zw"
        password = "admin123"
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
        return $response.token
    }
    catch {
        Write-Host "Login failed: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

function VerifyRevenueJournals {
    $token = Get-AuthToken
    if (-not $token) {
        Write-Host "Failed to get authentication token" -ForegroundColor Red
        return
    }

    $headers = @{
        'Authorization' = "Bearer $token"
        'Content-Type' = 'application/json'
    }

    Write-Host "=== Revenue Journal Entries Verification ===" -ForegroundColor Green

    # Get all journal entries
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/journal-entries" -Headers $headers -Method Get
        
        Write-Host "`nRecent Journal Entries:" -ForegroundColor Yellow
        $response.data | Select-Object -First 10 | Format-Table id, entryDate, reference, description, totalDebit, totalCredit, createdAt -AutoSize

        # Find revenue-related journal entries
        $revenueEntries = $response.data | Where-Object { $_.description -like "*Revenue*" -or $_.description -like "*revenue*" }
        
        if ($revenueEntries) {
            Write-Host "`n=== Revenue Journal Entries Found ===" -ForegroundColor Green
            foreach ($entry in $revenueEntries) {
                Write-Host "`nEntry ID: $($entry.id)" -ForegroundColor Cyan
                Write-Host "Date: $($entry.entryDate)" -ForegroundColor White
                Write-Host "Description: $($entry.description)" -ForegroundColor White
                Write-Host "Total Debit: $($entry.totalDebit)" -ForegroundColor White
                Write-Host "Total Credit: $($entry.totalCredit)" -ForegroundColor White
                
                # Get journal entry lines
                try {
                    $linesResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/accounting/journal-entries/$($entry.id)/lines" -Headers $headers -Method Get
                    
                    Write-Host "`nJournal Entry Lines:" -ForegroundColor Yellow
                    $linesResponse.data | Format-Table accountName, debit, credit, description -AutoSize
                    
                    # Verify accounting accuracy
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
                    
                    # Check for proper revenue accounting
                    $cashAccount = $linesResponse.data | Where-Object { $_.accountName -like "*Cash*" -or $_.accountName -like "*Bank*" }
                    $revenueAccount = $linesResponse.data | Where-Object { $_.accountName -like "*Revenue*" -or $_.accountName -like "*Receivable*" }
                    $vatAccount = $linesResponse.data | Where-Object { $_.accountName -like "*VAT*" }
                    
                    Write-Host "`nAccount Verification:" -ForegroundColor Magenta
                    if ($cashAccount) {
                        Write-Host "✓ Cash/Bank Account Found: $($cashAccount.accountName)" -ForegroundColor Green
                    } else {
                        Write-Host "✗ Cash/Bank Account Missing" -ForegroundColor Red
                    }
                    
                    if ($revenueAccount) {
                        Write-Host "✓ Revenue/Receivable Account Found: $($revenueAccount.accountName)" -ForegroundColor Green
                    } else {
                        Write-Host "✗ Revenue/Receivable Account Missing" -ForegroundColor Red
                    }
                    
                    if ($vatAccount) {
                        Write-Host "✓ VAT Account Found: $($vatAccount.accountName)" -ForegroundColor Green
                    } else {
                        Write-Host "ℹ No VAT Account (may be non-taxable revenue)" -ForegroundColor Yellow
                    }
                    
                } catch {
                    Write-Host "Failed to get journal entry lines: $($_.Exception.Message)" -ForegroundColor Red
                }
                
                Write-Host "`n" + ("=" * 50) -ForegroundColor Gray
            }
        } else {
            Write-Host "No revenue journal entries found" -ForegroundColor Red
        }
        
    } catch {
        Write-Host "Failed to get journal entries: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Run the verification
VerifyRevenueJournals 