# Test Single Journal Entry Script
param(
    [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "=== TEST SINGLE JOURNAL ENTRY ===" -ForegroundColor Cyan

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

# Main execution
try {
    Write-Host "1. Authenticating..." -ForegroundColor Yellow
    $token = Get-AuthToken
    Write-Host "✅ Authentication successful" -ForegroundColor Green

    Write-Host "`n2. Getting first journal entry details..." -ForegroundColor Yellow
    $headers = @{ Authorization = "Bearer $token" }
    
    # Get all journal entries first
    $allJournalEntries = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Method Get -Headers $headers
    $firstJE = $allJournalEntries.data[0]
    
    Write-Host "First Journal Entry ID: $($firstJE.id)"
    Write-Host "Reference: $($firstJE.referenceNumber)"
    
    # Get the detailed journal entry
    $detailedJE = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries/$($firstJE.id)" -Method Get -Headers $headers
    
    Write-Host "`n3. Full Response Structure:" -ForegroundColor Yellow
    Write-Host ($detailedJE | ConvertTo-Json -Depth 10)

} catch {
    Write-Host "❌ Error - $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
}