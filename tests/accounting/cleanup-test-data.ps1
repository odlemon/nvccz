# Cleanup script to remove test data from the database
# This script removes expenses and journal entries created during testing

param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$Token = ""
)

if (-not $Token) {
    Write-Host "Please provide a valid authentication token" -ForegroundColor Red
    Write-Host "Usage: .\cleanup-test-data.ps1 -Token 'your-jwt-token'" -ForegroundColor Yellow
    exit 1
}

$Headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer $Token"
}

Write-Host "=== Test Data Cleanup ===" -ForegroundColor Green
Write-Host ""

try {
    # Step 1: Get all expenses with test descriptions
    Write-Host "1. Finding test expenses..." -ForegroundColor Cyan
    
    $expensesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses" -Headers $Headers -Method Get
    
    if (-not $expensesResponse.success) {
        throw "Failed to get expenses"
    }
    
    $testExpenses = $expensesResponse.data | Where-Object { 
        $_.description -like "*Test*" -or 
        $_.description -like "*Initial*" -or 
        $_.description -like "*Updated*"
    }
    
    Write-Host "   Found $($testExpenses.Count) test expenses" -ForegroundColor White
    
    # Step 2: Delete test expenses
    if ($testExpenses.Count -gt 0) {
        Write-Host "2. Deleting test expenses..." -ForegroundColor Cyan
        
        $deletedCount = 0
        foreach ($expense in $testExpenses) {
            try {
                $deleteResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/expenses/$($expense.id)" -Headers $Headers -Method Delete
                
                if ($deleteResponse.success) {
                    $deletedCount++
                    Write-Host "   ✅ Deleted: $($expense.description) (ID: $($expense.id))" -ForegroundColor Green
                } else {
                    Write-Host "   ❌ Failed to delete: $($expense.description) (ID: $($expense.id))" -ForegroundColor Red
                }
            } catch {
                Write-Host "   ❌ Error deleting: $($expense.description) (ID: $($expense.id)) - $($_.Exception.Message)" -ForegroundColor Red
            }
        }
        
        Write-Host "   Successfully deleted $deletedCount out of $($testExpenses.Count) test expenses" -ForegroundColor Green
    } else {
        Write-Host "2. No test expenses found to delete" -ForegroundColor Yellow
    }
    
    # Step 3: Get all journal entries with test descriptions
    Write-Host "3. Finding test journal entries..." -ForegroundColor Cyan
    
    $journalEntriesResponse = Invoke-RestMethod -Uri "$BaseUrl/api/accounting/journal-entries" -Headers $Headers -Method Get
    
    if (-not $journalEntriesResponse.success) {
        Write-Host "   ⚠️  Could not retrieve journal entries (API endpoint may not exist)" -ForegroundColor Yellow
    } else {
        $testJournalEntries = $journalEntriesResponse.data | Where-Object { 
            $_.description -like "*Test*" -or 
            $_.description -like "*REVERSAL*" -or 
            $_.description -like "*UPDATED*"
        }
        
        Write-Host "   Found $($testJournalEntries.Count) test journal entries" -ForegroundColor White
        
        # Note: Journal entries are typically not deleted directly as they are part of the audit trail
        # They are usually soft-deleted or archived instead
        if ($testJournalEntries.Count -gt 0) {
            Write-Host "   ℹ️  Journal entries are preserved for audit trail purposes" -ForegroundColor Yellow
            Write-Host "   ℹ️  To remove them, use database queries directly" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "✅ Cleanup completed successfully!" -ForegroundColor Green
    
    if ($deletedCount -gt 0) {
        Write-Host "   Removed $deletedCount test expenses" -ForegroundColor Green
    }
    
    Write-Host "   Test data cleanup is complete" -ForegroundColor Green

} catch {
    Write-Host "❌ Cleanup failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Cleanup Complete ===" -ForegroundColor Green 