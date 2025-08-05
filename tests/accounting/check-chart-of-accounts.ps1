# Check Chart of Accounts for Invoice Journal Entry Creation
param([string]$BaseUrl = "http://localhost:3000")

Write-Host "=== CHECKING CHART OF ACCOUNTS FOR INVOICE JOURNAL ENTRIES ===" -ForegroundColor Cyan

try {
    # Authenticate
    $loginData = @{
        email = "admin@nvccz.co.zw"
        password = "admin123"
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginData -ContentType "application/json"
    $headers = @{ Authorization = "Bearer $($authResponse.token)" }
    Write-Host "Authentication successful" -ForegroundColor Green

    # Get all Chart of Accounts
    Write-Host "`n1. Getting all Chart of Accounts..." -ForegroundColor Yellow
    $coaResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/chart-of-accounts" -Method Get -Headers $headers
    $accounts = $coaResponse.data

    Write-Host "Total accounts found: $($accounts.Count)" -ForegroundColor White

    # Check for required accounts for invoice journal entries
    Write-Host "`n2. Checking required accounts for invoice journal entries..." -ForegroundColor Yellow

    # Check for Income/Revenue accounts
    $incomeAccounts = $accounts | Where-Object { $_.accountType -eq "Revenue" }
    Write-Host "`nINCOME/REVENUE ACCOUNTS:" -ForegroundColor Cyan
    if ($incomeAccounts.Count -gt 0) {
        foreach ($account in $incomeAccounts) {
            $hasManagementFees = $account.accountName -like "*Management Fees*"
            Write-Host "  - $($account.accountName) (No.$($account.accountNo)) - $(if ($hasManagementFees) { "HAS Management Fees" } else { "NO Management Fees" })" -ForegroundColor $(if ($hasManagementFees) { "Green" } else { "Yellow" })
        }
    } else {
        Write-Host "  NO Revenue accounts found!" -ForegroundColor Red
    }

    # Check for VAT Output accounts
    $vatOutputAccounts = $accounts | Where-Object { $_.accountName -like "*VAT Output*" }
    Write-Host "`nVAT OUTPUT ACCOUNTS:" -ForegroundColor Cyan
    if ($vatOutputAccounts.Count -gt 0) {
        foreach ($account in $vatOutputAccounts) {
            Write-Host "  FOUND: $($account.accountName) (No.$($account.accountNo))" -ForegroundColor Green
        }
    } else {
        Write-Host "  NO VAT Output accounts found!" -ForegroundColor Red
    }

    # Check for Accounts Receivable accounts
    $arAccounts = $accounts | Where-Object { $_.accountName -like "*Accounts Receivable*" }
    Write-Host "`nACCOUNTS RECEIVABLE ACCOUNTS:" -ForegroundColor Cyan
    if ($arAccounts.Count -gt 0) {
        foreach ($account in $arAccounts) {
            Write-Host "  FOUND: $($account.accountName) (No.$($account.accountNo))" -ForegroundColor Green
        }
    } else {
        Write-Host "  NO Accounts Receivable accounts found!" -ForegroundColor Red
    }

    # Check for Current Asset accounts (Accounts Receivable should be here)
    $currentAssetAccounts = $accounts | Where-Object { $_.accountType -eq "Current Asset" }
    Write-Host "`nCURRENT ASSET ACCOUNTS:" -ForegroundColor Cyan
    if ($currentAssetAccounts.Count -gt 0) {
        foreach ($account in $currentAssetAccounts) {
            $isAR = $account.accountName -like "*Receivable*"
            Write-Host "  - $($account.accountName) (No.$($account.accountNo)) - $(if ($isAR) { "Accounts Receivable" } else { "Other asset" })" -ForegroundColor $(if ($isAR) { "Green" } else { "White" })
        }
    } else {
        Write-Host "  NO Current Asset accounts found!" -ForegroundColor Red
    }

    # Check for Current Liability accounts (VAT Output should be here)
    $currentLiabilityAccounts = $accounts | Where-Object { $_.accountType -eq "Current Liability" }
    Write-Host "`nCURRENT LIABILITY ACCOUNTS:" -ForegroundColor Cyan
    if ($currentLiabilityAccounts.Count -gt 0) {
        foreach ($account in $currentLiabilityAccounts) {
            $isVATOutput = $account.accountName -like "*VAT Output*"
            Write-Host "  - $($account.accountName) (No.$($account.accountNo)) - $(if ($isVATOutput) { "VAT Output" } else { "Other liability" })" -ForegroundColor $(if ($isVATOutput) { "Green" } else { "White" })
        }
    } else {
        Write-Host "  ✗ NO Current Liability accounts found!" -ForegroundColor Red
    }

    # Summary
    Write-Host "`n" + ("="*80) -ForegroundColor Cyan
    Write-Host "SUMMARY FOR INVOICE JOURNAL ENTRIES" -ForegroundColor Green
    Write-Host ("="*80) -ForegroundColor Cyan

    $hasIncomeAccount = $incomeAccounts.Count -gt 0
    $hasManagementFeesAccount = ($incomeAccounts | Where-Object { $_.accountName -like "*Management Fees*" }).Count -gt 0
    $hasVATOutputAccount = $vatOutputAccounts.Count -gt 0
    $hasARAccount = $arAccounts.Count -gt 0

    Write-Host "Income/Revenue Account: $(if ($hasIncomeAccount) { "FOUND" } else { "MISSING" })" -ForegroundColor $(if ($hasIncomeAccount) { "Green" } else { "Red" })
    Write-Host "Management Fees Account: $(if ($hasManagementFeesAccount) { "FOUND" } else { "MISSING" })" -ForegroundColor $(if ($hasManagementFeesAccount) { "Green" } else { "Red" })
    Write-Host "VAT Output Account: $(if ($hasVATOutputAccount) { "FOUND" } else { "MISSING" })" -ForegroundColor $(if ($hasVATOutputAccount) { "Green" } else { "Red" })
    Write-Host "Accounts Receivable Account: $(if ($hasARAccount) { "FOUND" } else { "MISSING" })" -ForegroundColor $(if ($hasARAccount) { "Green" } else { "Red" })

    $allRequired = $hasIncomeAccount -and $hasVATOutputAccount -and $hasARAccount
    Write-Host "`nAll Required Accounts Present: $(if ($allRequired) { "YES" } else { "NO" })" -ForegroundColor $(if ($allRequired) { "Green" } else { "Red" })

    if (-not $allRequired) {
        Write-Host "`nRECOMMENDATION: Missing accounts are causing journal entry creation to fail." -ForegroundColor Yellow
        Write-Host "This explains why some invoices have journalEntryId: null" -ForegroundColor Yellow
    } else {
        Write-Host "`n✓ All required accounts are present. Journal entries should work correctly." -ForegroundColor Green
    }

} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Error Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
} 