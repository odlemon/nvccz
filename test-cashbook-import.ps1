# Test Cashbook CSV Import
$baseUrl = "http://localhost:3000"

# Step 1: Login
Write-Host "🔐 Logging in..." -ForegroundColor Cyan
$loginBody = @{
    email = "admin@nvccz.co.zw"
    password = "admin123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.token
    Write-Host "✅ Login successful" -ForegroundColor Green
} catch {
    Write-Host "❌ Login failed: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
}

# Step 2: Get Template
Write-Host "`n📥 Getting CSV template..." -ForegroundColor Cyan
try {
    $templateResponse = Invoke-WebRequest -Uri "$baseUrl/api/cashbook/batches/import/template" -Method GET -Headers $headers
    $templateResponse.Content | Out-File -FilePath "cashbook_template.csv" -Encoding UTF8
    Write-Host "✅ Template downloaded to cashbook_template.csv" -ForegroundColor Green
    Write-Host "Template preview:" -ForegroundColor Yellow
    Get-Content "cashbook_template.csv" -Head 5
} catch {
    Write-Host "❌ Failed to get template: $_" -ForegroundColor Red
}

# Step 3: Test Import with sample CSV
Write-Host "`n📤 Testing CSV import..." -ForegroundColor Cyan
$csvFile = "sample-cashbook-transactions.csv"

if (Test-Path $csvFile) {
    $fileBytes = [System.IO.File]::ReadAllBytes($csvFile)
    $boundary = [System.Guid]::NewGuid().ToString()
    $fileContent = [System.Text.Encoding]::GetEncoding('iso-8859-1').GetString($fileBytes)
    
    $bodyLines = @(
        "--$boundary",
        "Content-Disposition: form-data; name=`"file`"; filename=`"$csvFile`"",
        "Content-Type: text/csv",
        "",
        $fileContent,
        "--$boundary--"
    )
    $body = $bodyLines -join "`r`n"
    $bodyBytes = [System.Text.Encoding]::GetEncoding('iso-8859-1').GetBytes($body)
    
    try {
        $importResponse = Invoke-RestMethod -Uri "$baseUrl/api/cashbook/batches/import" -Method POST -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "multipart/form-data; boundary=$boundary"
        } -Body $bodyBytes
        
        Write-Host "✅ Import successful!" -ForegroundColor Green
        Write-Host "Import Result:" -ForegroundColor Yellow
        $importResponse | ConvertTo-Json -Depth 5
        
        if ($importResponse.data.batchId) {
            Write-Host "`n📊 Batch ID: $($importResponse.data.batchId)" -ForegroundColor Cyan
            Write-Host "Total Transactions: $($importResponse.data.totalTransactions)" -ForegroundColor Cyan
            Write-Host "Valid Transactions: $($importResponse.data.validTransactions)" -ForegroundColor Green
            Write-Host "Invalid Transactions: $($importResponse.data.invalidTransactions)" -ForegroundColor Red
            
            if ($importResponse.data.errors -and $importResponse.data.errors.Count -gt 0) {
                Write-Host "`n❌ Errors:" -ForegroundColor Red
                $importResponse.data.errors | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
            }
        }
    } catch {
        Write-Host "❌ Import failed: $_" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response: $responseBody" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "❌ CSV file not found: $csvFile" -ForegroundColor Red
}

Write-Host "`n✅ Test complete!" -ForegroundColor Green

