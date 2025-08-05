# Verify Invoice Accounting Details
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== VERIFY INVOICE ACCOUNTING DETAILS ===" -ForegroundColor Cyan

try {
    # Authenticate
    $loginData = @{
        email = "admin@nvccz.co.zw"
        password = "admin123"
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
    $headers = @{ Authorization = "Bearer $($authResponse.token)" }
    Write-Host "Authentication successful" -ForegroundColor Green

    # Get all journal entries that contain "Invoice" to find the recent ones
    Write-Host "`n1. Getting recent invoice journal entries..." -ForegroundColor Yellow
    $journalEntries = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Method Get -Headers $headers
    $recentInvoiceJEs = $journalEntries.data | Where-Object { $_.description -like "*Invoice*" } | Sort-Object createdAt -Descending | Select-Object -First 5

    Write-Host "Found $($recentInvoiceJEs.Count) recent invoice journal entries" -ForegroundColor Green

    foreach ($je in $recentInvoiceJEs) {
        Write-Host "`n" + ("="*60) -ForegroundColor Cyan
        Write-Host "JOURNAL ENTRY: $($je.referenceNumber)" -ForegroundColor Yellow
        Write-Host ("="*60) -ForegroundColor Cyan
        Write-Host "Description: $($je.description)" -ForegroundColor White
        Write-Host "Total Amount: $($je.totalAmount) $($je.currency.code)" -ForegroundColor White
        Write-Host "Status: $($je.status)" -ForegroundColor White
        
        # Get detailed journal entry with lines
        Write-Host "`nGetting detailed journal entry..." -ForegroundColor Gray
        $detailedJE = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries/$($je.id)" -Method Get -Headers $headers
        
        Write-Host "Lines available in response: $($detailedJE.journalEntryLines.Count)" -ForegroundColor Gray
        
        if ($detailedJE.journalEntryLines.Count -gt 0) {
            Write-Host "`nDETAILED ACCOUNTING ENTRIES:" -ForegroundColor Yellow
            
            $totalDebits = 0
            $totalCredits = 0
            $accountsReceivable = 0
            $incomeTotal = 0
            $vatOutput = 0
            
            foreach ($line in $detailedJE.journalEntryLines) {
                $accountName = $line.chartOfAccount.accountName
                $accountNo = $line.chartOfAccount.accountNo
                $accountType = $line.chartOfAccount.accountType
                $debitAmt = [decimal]$line.debitAmount
                $creditAmt = [decimal]$line.creditAmount
                $description = $line.description
                
                $totalDebits += $debitAmt
                $totalCredits += $creditAmt
                
                Write-Host "  Line ID: $($line.id)" -ForegroundColor DarkGray
                Write-Host "  Account: $accountName (No. $accountNo)" -ForegroundColor White
                Write-Host "  Type: $accountType" -ForegroundColor Gray
                Write-Host "  Description: $description" -ForegroundColor Gray
                
                if ($debitAmt -gt 0) {
                    Write-Host "  DEBIT: $debitAmt" -ForegroundColor Green
                    if ($accountName -like "*Receivable*") {
                        $accountsReceivable += $debitAmt
                    }
                }
                
                if ($creditAmt -gt 0) {
                    Write-Host "  CREDIT: $creditAmt" -ForegroundColor Magenta
                    if ($accountName -like "*Income*" -or $accountName -like "*Revenue*") {
                        $incomeTotal += $creditAmt
                    }
                    if ($accountName -like "*VAT Output*") {
                        $vatOutput += $creditAmt
                    }
                }
                Write-Host "  ---" -ForegroundColor DarkGray
            }
            
            Write-Host "`nSUMMARY FOR THIS JOURNAL ENTRY:" -ForegroundColor Yellow
            Write-Host "Total Debits: $totalDebits" -ForegroundColor Green
            Write-Host "Total Credits: $totalCredits" -ForegroundColor Magenta
            Write-Host "Accounts Receivable (Dr): $accountsReceivable" -ForegroundColor White
            Write-Host "Income/Revenue (Cr): $incomeTotal" -ForegroundColor White
            Write-Host "VAT Output (Cr): $vatOutput" -ForegroundColor White
            
            # Balance check
            $balanced = [Math]::Abs($totalDebits - $totalCredits) -lt 0.01
            Write-Host "BALANCED: $(if ($balanced) { "YES" } else { "NO" })" -ForegroundColor $(if ($balanced) { "Green" } else { "Red" })
            
            # Determine invoice type
            $isTaxable = $vatOutput -gt 0
            $baseAmount = $incomeTotal
            $totalExpected = $accountsReceivable
            
            Write-Host "`nACCOUNTING VERIFICATION:" -ForegroundColor Yellow
            Write-Host "Invoice Type: $(if ($isTaxable) { "TAXABLE" } else { "NON-TAXABLE" })" -ForegroundColor White
            
            if ($isTaxable) {
                $expectedVAT = [Math]::Round($baseAmount * 0.145, 2)
                $expectedTotal = $baseAmount + $expectedVAT
                Write-Host "Expected VAT (14.5%): $expectedVAT" -ForegroundColor Gray
                Write-Host "Actual VAT: $vatOutput" -ForegroundColor White
                Write-Host "VAT Correct: $(if ([Math]::Abs($vatOutput - $expectedVAT) -lt 0.01) { "YES" } else { "NO" })" -ForegroundColor $(if ([Math]::Abs($vatOutput - $expectedVAT) -lt 0.01) { "Green" } else { "Red" })
                Write-Host "Expected Total: $expectedTotal" -ForegroundColor Gray
                Write-Host "Actual Total: $totalExpected" -ForegroundColor White
                Write-Host "Total Correct: $(if ([Math]::Abs($totalExpected - $expectedTotal) -lt 0.01) { "YES" } else { "NO" })" -ForegroundColor $(if ([Math]::Abs($totalExpected - $expectedTotal) -lt 0.01) { "Green" } else { "Red" })
            } else {
                Write-Host "Base Amount: $baseAmount" -ForegroundColor White
                Write-Host "Total Amount: $totalExpected" -ForegroundColor White
                Write-Host "Amounts Match: $(if ([Math]::Abs($baseAmount - $totalExpected) -lt 0.01) { "YES" } else { "NO" })" -ForegroundColor $(if ([Math]::Abs($baseAmount - $totalExpected) -lt 0.01) { "Green" } else { "Red" })
            }
            
            # Double-entry verification
            $debitCreditMatch = [Math]::Abs($totalDebits - $totalCredits) -lt 0.01
            $accountingLogicCorrect = if ($isTaxable) {
                ([Math]::Abs($accountsReceivable - ($incomeTotal + $vatOutput)) -lt 0.01)
            } else {
                ([Math]::Abs($accountsReceivable - $incomeTotal) -lt 0.01)
            }
            
            Write-Host "`nOVERALL ASSESSMENT:" -ForegroundColor Yellow
            Write-Host "Double-Entry Balanced: $(if ($debitCreditMatch) { "PASS" } else { "FAIL" })" -ForegroundColor $(if ($debitCreditMatch) { "Green" } else { "Red" })
            Write-Host "Accounting Logic: $(if ($accountingLogicCorrect) { "PASS" } else { "FAIL" })" -ForegroundColor $(if ($accountingLogicCorrect) { "Green" } else { "Red" })
            Write-Host "Overall Result: $(if ($debitCreditMatch -and $accountingLogicCorrect) { "PASS" } else { "FAIL" })" -ForegroundColor $(if ($debitCreditMatch -and $accountingLogicCorrect) { "Green" } else { "Red" })
            
        } else {
            Write-Host "ERROR: No journal entry lines found!" -ForegroundColor Red
        }
    }

    Write-Host "`n" + ("="*80) -ForegroundColor Cyan
    Write-Host "INVOICE ACCOUNTING VERIFICATION COMPLETE" -ForegroundColor Green
    Write-Host ("="*80) -ForegroundColor Cyan

} catch {
    Write-Host "ERROR occurred: $($_.Exception.Message)" -ForegroundColor Red
}