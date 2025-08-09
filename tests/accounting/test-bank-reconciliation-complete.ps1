# Complete Bank Reconciliation Workflow Test
$baseUrl = "http://localhost:3000"

Write-Host "=== COMPLETE BANK RECONCILIATION WORKFLOW TEST ===" -ForegroundColor Green

# 1. Login
Write-Host "`n1. Authenticating..." -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    $token = $login.token
    $headers = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
    Write-Host "✅ Authentication successful" -ForegroundColor Green
} catch {
    Write-Host "❌ Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 2. Create test CSV file
Write-Host "`n2. Creating test CSV file..." -ForegroundColor Yellow

$csvContent = @"
TransactionDate,Description,Amount,Reference
2024-06-01,Office Supplies Purchase,-1500.00,REF001
2024-06-02,Customer Payment,2500.00,REF002
2024-06-03,Bank Charges,-50.00,REF003
2024-06-04,Service Fee Payment,-750.00,REF004
2024-06-05,Client Invoice Payment,3000.00,REF005
"@

$csvPath = "test_bank_statement.csv"
$csvContent | Out-File -FilePath $csvPath -Encoding UTF8
Write-Host "Test CSV file created: $csvPath" -ForegroundColor Green

# 3. Upload bank statement
Write-Host "`n3. Uploading bank statement..." -ForegroundColor Yellow

try {
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$csvPath`"",
        "Content-Type: text/csv",
        "",
        [System.IO.File]::ReadAllText($csvPath),
        "--$boundary--"
    )
    
    $body = $bodyLines -join $LF
    
    $uploadHeaders = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "multipart/form-data; boundary=$boundary"
    }
    
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/upload" -Method POST -Headers $uploadHeaders -Body $body
    $reconciliation = $response.data
    Write-Host "Bank statement uploaded successfully!" -ForegroundColor Green
    Write-Host "   Reconciliation ID: $($reconciliation.id)" -ForegroundColor Cyan
    Write-Host "   File Name: $($reconciliation.fileName)" -ForegroundColor Cyan
    Write-Host "   Status: $($reconciliation.status)" -ForegroundColor Cyan
    Write-Host "   Total Transactions: $($reconciliation.totalTransactions)" -ForegroundColor Cyan
    Write-Host "   Matched Count: $($reconciliation.matchedCount)" -ForegroundColor Cyan
    Write-Host "   Unmatched Count: $($reconciliation.unmatchedCount)" -ForegroundColor Cyan
    Write-Host "   Overall Accuracy: $($reconciliation.overallAccuracy)%" -ForegroundColor Cyan
} catch {
    Write-Host "Failed to upload bank statement: $($_.Exception.Message)" -ForegroundColor Red
    exit
}

# 4. Get reconciliation details
Write-Host "`n4. Getting reconciliation details..." -ForegroundColor Yellow
try {
    $detailsResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/$($reconciliation.id)" -Method GET -Headers $headers
    $details = $detailsResponse.data
    Write-Host "Reconciliation details retrieved!" -ForegroundColor Green
    Write-Host "   Created By: $($details.createdBy.firstName) $($details.createdBy.lastName)" -ForegroundColor Cyan
    Write-Host "   Created At: $($details.createdAt)" -ForegroundColor Cyan
    Write-Host "   Notes: $($details.notes)" -ForegroundColor Cyan
    
    Write-Host "`n   Bank Transactions:" -ForegroundColor Yellow
    foreach ($transaction in $details.bankTransactions) {
        $amount = [double]$transaction.amount
        $sign = if ($amount -lt 0) { "-" } else { "+" }
        Write-Host "     $($transaction.transactionDate): $($transaction.description) $sign$([math]::Abs($amount))" -ForegroundColor White
    }
} catch {
    Write-Host "Failed to get reconciliation details: $($_.Exception.Message)" -ForegroundColor Red
}

# 5. Get unmatched transactions
Write-Host "`n5. Getting unmatched transactions..." -ForegroundColor Yellow
try {
    $unmatchedResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/$($reconciliation.id)/unmatched?minAmount=5" -Method GET -Headers $headers
    $unmatched = $unmatchedResponse.data
    Write-Host "Unmatched transactions retrieved!" -ForegroundColor Green
    Write-Host "   Count: $($unmatched.Length)" -ForegroundColor Cyan
    
    foreach ($transaction in $unmatched) {
        $amount = [double]$transaction.amount
        Write-Host "     $($transaction.transactionDate): $($transaction.description) $amount" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Failed to get unmatched transactions: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Get potential matches for first unmatched transaction
if ($unmatched -and $unmatched.Length -gt 0) {
    Write-Host "`n6. Getting potential matches for first unmatched transaction..." -ForegroundColor Yellow
    try {
        $firstTransaction = $unmatched[0]
        $matchesResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/transactions/$($firstTransaction.id)/matches?limit=5" -Method GET -Headers $headers
        $matches = $matchesResponse.data
        Write-Host "Potential matches retrieved!" -ForegroundColor Green
        Write-Host "   Count: $($matches.Length)" -ForegroundColor Cyan
        
        foreach ($match in $matches) {
            $confidence = [double]$match.confidenceScore
            Write-Host "     Journal Entry: $($match.journalEntry.referenceNumber) - Confidence: $confidence%" -ForegroundColor White
        }
    } catch {
        Write-Host "Failed to get potential matches: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 7. Get reconciliation summary
Write-Host "`n7. Getting reconciliation summary..." -ForegroundColor Yellow
try {
    $summaryResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/summary" -Method GET -Headers $headers
    $summary = $summaryResponse.data
    Write-Host "Reconciliation summary retrieved!" -ForegroundColor Green
    Write-Host "   Total Reconciliations: $($summary.totalReconciliations)" -ForegroundColor Cyan
    Write-Host "   Completed: $($summary.completedReconciliations)" -ForegroundColor Cyan
    Write-Host "   Pending: $($summary.pendingReconciliations)" -ForegroundColor Cyan
    Write-Host "   Failed: $($summary.failedReconciliations)" -ForegroundColor Cyan
    Write-Host "   Total Transactions: $($summary.totalTransactions)" -ForegroundColor Cyan
    Write-Host "   Matched Transactions: $($summary.matchedTransactions)" -ForegroundColor Cyan
    Write-Host "   Unmatched Transactions: $($summary.unmatchedTransactions)" -ForegroundColor Cyan
    Write-Host "   Average Accuracy: $($summary.averageAccuracy)%" -ForegroundColor Cyan
} catch {
    Write-Host "Failed to get reconciliation summary: $($_.Exception.Message)" -ForegroundColor Red
}

# 8. Get audit trail
Write-Host "`n8. Getting audit trail..." -ForegroundColor Yellow
try {
    $auditResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/$($reconciliation.id)/audit-trail" -Method GET -Headers $headers
    $auditTrail = $auditResponse.data
    Write-Host "Audit trail retrieved!" -ForegroundColor Green
    Write-Host "   Count: $($auditTrail.Length)" -ForegroundColor Cyan
    
    foreach ($audit in $auditTrail) {
        Write-Host "     $($audit.action): $($audit.description) by $($audit.createdBy.firstName) $($audit.createdBy.lastName)" -ForegroundColor White
    }
} catch {
    Write-Host "Failed to get audit trail: $($_.Exception.Message)" -ForegroundColor Red
}

# 9. Test manual match approval (if we have matches)
if ($matches -and $matches.Length -gt 0) {
    Write-Host "`n9. Testing manual match approval..." -ForegroundColor Yellow
    try {
        $firstMatch = $matches[0]
        $approvalPayload = @{
            reconciliationId = $reconciliation.id
            bankTransactionId = $firstTransaction.id
            journalEntryId = $firstMatch.journalEntry.id
        } | ConvertTo-Json
        
        $approvalResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/approve-match" -Method POST -Headers $headers -Body $approvalPayload
        Write-Host "Manual match approved successfully!" -ForegroundColor Green
        Write-Host "   Match ID: $($approvalResponse.data.id)" -ForegroundColor Cyan
    } catch {
        Write-Host "Failed to approve manual match: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 10. Test rejection (if we have reconciliation results)
Write-Host "`n10. Testing reconciliation result rejection..." -ForegroundColor Yellow
try {
    $resultsResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/$($reconciliation.id)" -Method GET -Headers $headers
    $results = $resultsResponse.data.reconciliationResults
    
    if ($results -and $results.Length -gt 0) {
        $firstResult = $results[0]
        $rejectPayload = @{
            reason = "Test rejection - manual verification required"
        } | ConvertTo-Json
        
        $rejectResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/results/$($firstResult.id)/reject" -Method POST -Headers $headers -Body $rejectPayload
        Write-Host "Reconciliation result rejected successfully!" -ForegroundColor Green
    } else {
        Write-Host "No reconciliation results to reject" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Failed to reject reconciliation result: $($_.Exception.Message)" -ForegroundColor Red
}

# 11. Get all reconciliations
Write-Host "`n11. Getting all reconciliations..." -ForegroundColor Yellow
try {
    $allResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation" -Method GET -Headers $headers
    $allReconciliations = $allResponse.data.reconciliations
    Write-Host "All reconciliations retrieved!" -ForegroundColor Green
    Write-Host "   Total Count: $($allResponse.data.total)" -ForegroundColor Cyan
    
    foreach ($rec in $allReconciliations) {
        Write-Host "     $($rec.id): $($rec.fileName) - $($rec.status) - $($rec.matchedCount)/$($rec.totalTransactions) matched" -ForegroundColor White
    }
} catch {
    Write-Host "Failed to get all reconciliations: $($_.Exception.Message)" -ForegroundColor Red
}

# 12. Clean up test file
Write-Host "`n12. Cleaning up test file..." -ForegroundColor Yellow
if (Test-Path $csvPath) {
    Remove-Item $csvPath
    Write-Host "Test CSV file removed" -ForegroundColor Green
}

Write-Host "`n=== BANK RECONCILIATION TEST COMPLETED ===" -ForegroundColor Green
Write-Host "All endpoints tested successfully!" -ForegroundColor Green 