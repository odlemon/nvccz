# Verify Journal Entries Balance Script
param(
    [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "=== JOURNAL ENTRIES BALANCE VERIFICATION ===" -ForegroundColor Cyan

# Function to authenticate and get token
function Get-AuthToken {
    try {
        $loginData = @{
            email = "admin@nvccz.co.zw"
            password = "admin123"
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
        return $response.token
    }
    catch {
        Write-Host "❌ Authentication failed - $_" -ForegroundColor Red
        exit 1
    }
}

# Function to get all journal entries
function Get-AllJournalEntries($token) {
    try {
        $headers = @{ Authorization = "Bearer $token" }
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Method Get -Headers $headers
        return $response.data
    }
    catch {
        Write-Host "❌ Failed to get journal entries - $_" -ForegroundColor Red
        return @()
    }
}

# Function to get journal entry lines for a specific entry
function Get-JournalEntryLines($journalEntryId, $token) {
    try {
        $headers = @{ Authorization = "Bearer $token" }
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries/$journalEntryId" -Method Get -Headers $headers
        return $response.lines
    }
    catch {
        Write-Host "❌ Failed to get journal entry lines for $journalEntryId - $_" -ForegroundColor Red
        return @()
    }
}

# Main execution
try {
    Write-Host "1. Authenticating..." -ForegroundColor Yellow
    $token = Get-AuthToken
    Write-Host "✅ Authentication successful" -ForegroundColor Green

    Write-Host "`n2. Getting all journal entries..." -ForegroundColor Yellow
    $journalEntries = Get-AllJournalEntries $token
    
    if ($journalEntries.Count -eq 0) {
        Write-Host "❌ No journal entries found" -ForegroundColor Red
        exit 0
    }

    Write-Host "✅ Retrieved $($journalEntries.Count) journal entries" -ForegroundColor Green

    Write-Host "`n3. Verifying balance for each journal entry..." -ForegroundColor Yellow
    
    $totalImbalanced = 0
    $totalBalanced = 0
    $overallDebitTotal = 0
    $overallCreditTotal = 0

    foreach ($je in $journalEntries) {
        Write-Host "`n--- Journal Entry: $($je.referenceNumber) ---" -ForegroundColor Cyan
        Write-Host "   ID: $($je.id)"
        Write-Host "   Description: $($je.description)"
        Write-Host "   Date: $($je.transactionDate)"
        Write-Host "   Status: $($je.status)"

        # Get the lines from the journal entry (they're already included)
        $lines = $je.journalEntryLines
        
        if ($lines.Count -eq 0) {
            Write-Host "   ❌ No lines found for this journal entry" -ForegroundColor Red
            continue
        }

        $debitTotal = 0
        $creditTotal = 0

        Write-Host "   Lines:" -ForegroundColor White
        foreach ($line in $lines) {
            $accountName = if ($line.chartOfAccount) { $line.chartOfAccount.accountName } else { "Unknown Account" }
            $debitAmount = if ($line.debitAmount) { [decimal]$line.debitAmount } else { 0 }
            $creditAmount = if ($line.creditAmount) { [decimal]$line.creditAmount } else { 0 }
            
            $debitTotal += $debitAmount
            $creditTotal += $creditAmount

            if ($debitAmount -gt 0) {
                Write-Host "     Dr $accountName`: $debitAmount ($($line.description))" -ForegroundColor Green
            }
            if ($creditAmount -gt 0) {
                Write-Host "     Cr $accountName`: $creditAmount ($($line.description))" -ForegroundColor Magenta
            }
        }

        # Check if this journal entry balances
        $isBalanced = [Math]::Abs($debitTotal - $creditTotal) -lt 0.01  # Allow for small rounding differences
        
        Write-Host "   Balance Check:" -ForegroundColor White
        Write-Host "     Total Debits: $debitTotal" -ForegroundColor Green
        Write-Host "     Total Credits: $creditTotal" -ForegroundColor Magenta
        
        if ($isBalanced) {
            Write-Host "     ✅ BALANCED" -ForegroundColor Green
            $totalBalanced++
        } else {
            Write-Host "     ❌ IMBALANCED (Difference: $([Math]::Abs($debitTotal - $creditTotal)))" -ForegroundColor Red
            $totalImbalanced++
        }

        $overallDebitTotal += $debitTotal
        $overallCreditTotal += $creditTotal
    }

    # Overall summary
    Write-Host "`n=== OVERALL SUMMARY ===" -ForegroundColor Cyan
    Write-Host "Total Journal Entries: $($journalEntries.Count)"
    Write-Host "Balanced Entries: $totalBalanced" -ForegroundColor Green
    Write-Host "Imbalanced Entries: $totalImbalanced" -ForegroundColor $(if ($totalImbalanced -eq 0) { "Green" } else { "Red" })
    Write-Host "Overall Debit Total: $overallDebitTotal" -ForegroundColor Green
    Write-Host "Overall Credit Total: $overallCreditTotal" -ForegroundColor Magenta
    
    $overallIsBalanced = [Math]::Abs($overallDebitTotal - $overallCreditTotal) -lt 0.01
    if ($overallIsBalanced) {
        Write-Host "✅ OVERALL SYSTEM IS BALANCED" -ForegroundColor Green
    } else {
        Write-Host "❌ OVERALL SYSTEM IS IMBALANCED (Difference: $([Math]::Abs($overallDebitTotal - $overallCreditTotal)))" -ForegroundColor Red
    }

    Write-Host "`n=== VERIFICATION COMPLETE ===" -ForegroundColor Cyan

} catch {
    Write-Host "❌ Error during verification - $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
}