# Post All Journal Entries Script
param(
    [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "=== POST ALL JOURNAL ENTRIES ===" -ForegroundColor Cyan

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

# Function to update journal entry status to POSTED
function Post-JournalEntry($journalEntryId, $token) {
    try {
        $headers = @{ Authorization = "Bearer $token" }

        $response = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries/$journalEntryId/post" -Method Patch -Headers $headers
        return $response
    }
    catch {
        Write-Host "❌ Failed to post journal entry $journalEntryId - $_" -ForegroundColor Red
        return $null
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

    Write-Host "`n3. Posting all PENDING journal entries..." -ForegroundColor Yellow
    
    $postedCount = 0
    $skippedCount = 0
    $errorCount = 0

    foreach ($je in $journalEntries) {
        Write-Host "`n--- Processing Journal Entry: $($je.referenceNumber) ---" -ForegroundColor Cyan
        Write-Host "   ID: $($je.id)"
        Write-Host "   Current Status: $($je.status)"
        Write-Host "   Description: $($je.description)"

        if ($je.status -eq "PENDING") {
            Write-Host "   🔄 Posting journal entry..." -ForegroundColor Yellow
            
            $result = Post-JournalEntry $je.id $token
            
            if ($result) {
                Write-Host "   ✅ Successfully posted!" -ForegroundColor Green
                $postedCount++
            } else {
                Write-Host "   ❌ Failed to post!" -ForegroundColor Red
                $errorCount++
            }
        } else {
            Write-Host "   ⏭️  Already posted, skipping..." -ForegroundColor Gray
            $skippedCount++
        }
    }

    # Summary
    Write-Host "`n=== POSTING SUMMARY ===" -ForegroundColor Cyan
    Write-Host "Total Journal Entries: $($journalEntries.Count)"
    Write-Host "Posted: $postedCount" -ForegroundColor Green
    Write-Host "Skipped (already posted): $skippedCount" -ForegroundColor Gray
    Write-Host "Errors: $errorCount" -ForegroundColor $(if ($errorCount -eq 0) { "Green" } else { "Red" })

    if ($errorCount -eq 0) {
        Write-Host "`n✅ ALL JOURNAL ENTRIES SUCCESSFULLY PROCESSED!" -ForegroundColor Green
    } else {
        Write-Host "`n⚠️  Some journal entries failed to post. Check errors above." -ForegroundColor Yellow
    }

    Write-Host "`n=== POSTING COMPLETE ===" -ForegroundColor Cyan

} catch {
    Write-Host "❌ Error during posting - $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
}