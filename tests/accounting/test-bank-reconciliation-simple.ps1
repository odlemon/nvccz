# Simple Bank Reconciliation Test
$baseUrl = "http://localhost:3000"

Write-Host "=== SIMPLE BANK RECONCILIATION TEST ===" -ForegroundColor Green

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

# 2. Test summary endpoint first
Write-Host "`n2. Testing summary endpoint..." -ForegroundColor Yellow
try {
    $summaryResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation/summary" -Method GET -Headers $headers
    $summary = $summaryResponse.data
    Write-Host "Summary endpoint working!" -ForegroundColor Green
    Write-Host "   Total Reconciliations: $($summary.totalReconciliations)" -ForegroundColor Cyan
    Write-Host "   Completed: $($summary.completedReconciliations)" -ForegroundColor Cyan
    Write-Host "   Pending: $($summary.pendingReconciliations)" -ForegroundColor Cyan
} catch {
    Write-Host "Summary endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Test get all reconciliations
Write-Host "`n3. Testing get all reconciliations..." -ForegroundColor Yellow
try {
    $allResponse = Invoke-RestMethod -Uri "$baseUrl/api/accounting/bank-reconciliation" -Method GET -Headers $headers
    $allReconciliations = $allResponse.data.reconciliations
    Write-Host "Get all reconciliations working!" -ForegroundColor Green
    Write-Host "   Total Count: $($allResponse.data.total)" -ForegroundColor Cyan
    
    if ($allReconciliations -and $allReconciliations.Length -gt 0) {
        foreach ($rec in $allReconciliations) {
            Write-Host "     $($rec.id): $($rec.fileName) - $($rec.status)" -ForegroundColor White
        }
    } else {
        Write-Host "   No reconciliations found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Get all reconciliations failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. Create test CSV file
Write-Host "`n4. Creating test CSV file..." -ForegroundColor Yellow

$csvContent = @"
TransactionDate,Description,Amount,Reference
2024-06-01,Office Supplies Purchase,-1500.00,REF001
2024-06-02,Customer Payment,2500.00,REF002
2024-06-03,Bank Charges,-50.00,REF003
"@

$csvPath = "test_bank_statement.csv"
$csvContent | Out-File -FilePath $csvPath -Encoding UTF8
Write-Host "Test CSV file created: $csvPath" -ForegroundColor Green

# 5. Test file upload using .NET WebClient
Write-Host "`n5. Testing file upload..." -ForegroundColor Yellow

try {
    Add-Type -AssemblyName System.Web
    
    $boundary = [System.Guid]::NewGuid().ToString()
    $LF = "`r`n"
    $fileContent = [System.IO.File]::ReadAllBytes($csvPath)
    
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$csvPath`"",
        "Content-Type: text/csv",
        "",
        [System.Text.Encoding]::UTF8.GetString($fileContent),
        "--$boundary--"
    )
    
    $body = $bodyLines -join $LF
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    
    $webClient = New-Object System.Net.WebClient
    $webClient.Headers.Add("Authorization", "Bearer $token")
    $webClient.Headers.Add("Content-Type", "multipart/form-data; boundary=$boundary")
    
    $response = $webClient.UploadData("$baseUrl/api/accounting/bank-reconciliation/upload", $bodyBytes)
    $responseText = [System.Text.Encoding]::UTF8.GetString($response)
    $responseObj = $responseText | ConvertFrom-Json
    
    if ($responseObj.success) {
        $reconciliation = $responseObj.data
        Write-Host "File upload successful!" -ForegroundColor Green
        Write-Host "   Reconciliation ID: $($reconciliation.id)" -ForegroundColor Cyan
        Write-Host "   File Name: $($reconciliation.fileName)" -ForegroundColor Cyan
        Write-Host "   Status: $($reconciliation.status)" -ForegroundColor Cyan
        Write-Host "   Total Transactions: $($reconciliation.totalTransactions)" -ForegroundColor Cyan
    } else {
        Write-Host "File upload failed: $($responseObj.message)" -ForegroundColor Red
    }
} catch {
    Write-Host "File upload failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 6. Clean up test file
Write-Host "`n6. Cleaning up test file..." -ForegroundColor Yellow
if (Test-Path $csvPath) {
    Remove-Item $csvPath
    Write-Host "Test CSV file removed" -ForegroundColor Green
}

Write-Host "`n=== SIMPLE BANK RECONCILIATION TEST COMPLETED ===" -ForegroundColor Green 