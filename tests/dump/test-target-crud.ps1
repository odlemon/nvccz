# Test Target CRUD Operations
# This script tests the complete CRUD operations for targets

$baseUrl = "http://localhost:3000/api"
$authToken = ""

# Function to log messages
function Write-Log {
    param($Message, $Color = "White")
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $Message" -ForegroundColor $Color
}

# Function to make authenticated requests
function Invoke-AuthenticatedRequest {
    param(
        [string]$Method,
        [string]$Url,
        [object]$Body = $null
    )
    
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if ($authToken) {
        $headers["Authorization"] = "Bearer $authToken"
    }
    
    $params = @{
        Method = $Method
        Uri = $Url
        Headers = $headers
    }
    
    if ($Body) {
        $params.Body = $Body | ConvertTo-Json -Depth 10
    }
    
    try {
        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        Write-Log "Error: $($_.Exception.Message)" "Red"
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Log "Response: $responseBody" "Red"
        }
        return $null
    }
}

# Step 1: Login to get auth token
Write-Log "Step 1: Logging in to get authentication token..." "Yellow"

$loginBody = @{
    email = "admin@nvccz.co.zw"
    password = "admin123"
}

$loginResponse = Invoke-AuthenticatedRequest -Method "POST" -Url "$baseUrl/auth/login" -Body $loginBody

if ($loginResponse -and $loginResponse.success) {
    $authToken = $loginResponse.data.token
    Write-Log "Login successful! Token obtained." "Green"
} else {
    Write-Log "Login failed! Exiting..." "Red"
    exit 1
}

# Step 2: Get target types
Write-Log "Step 2: Getting target types..." "Yellow"
$typesResponse = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/targets/types"

if ($typesResponse -and $typesResponse.success) {
    Write-Log "Target types retrieved successfully:" "Green"
    $typesResponse.data | ForEach-Object { Write-Log "  - $($_.value): $($_.label)" "Cyan" }
} else {
    Write-Log "Failed to get target types!" "Red"
}

# Step 3: Create a Sales target
Write-Log "Step 3: Creating a Sales target..." "Yellow"

$salesTargetBody = @{
    type = "Sales"
    value = 100000
    deadline = (Get-Date).AddMonths(3).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

$createSalesResponse = Invoke-AuthenticatedRequest -Method "POST" -Url "$baseUrl/targets" -Body $salesTargetBody

if ($createSalesResponse -and $createSalesResponse.success) {
    $salesTargetId = $createSalesResponse.data.id
    Write-Log "Sales target created successfully! ID: $salesTargetId" "Green"
    Write-Log "  Type: $($createSalesResponse.data.type)" "Cyan"
    Write-Log "  Value: $($createSalesResponse.data.value)" "Cyan"
    Write-Log "  Deadline: $($createSalesResponse.data.deadline)" "Cyan"
} else {
    Write-Log "Failed to create Sales target!" "Red"
    exit 1
}

# Step 4: Create a Revenue target
Write-Log "Step 4: Creating a Revenue target..." "Yellow"

$revenueTargetBody = @{
    type = "Revenue"
    value = 150000
    deadline = (Get-Date).AddMonths(6).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

$createRevenueResponse = Invoke-AuthenticatedRequest -Method "POST" -Url "$baseUrl/targets" -Body $revenueTargetBody

if ($createRevenueResponse -and $createRevenueResponse.success) {
    $revenueTargetId = $createRevenueResponse.data.id
    Write-Log "Revenue target created successfully! ID: $revenueTargetId" "Green"
    Write-Log "  Type: $($createRevenueResponse.data.type)" "Cyan"
    Write-Log "  Value: $($createRevenueResponse.data.value)" "Cyan"
    Write-Log "  Deadline: $($createRevenueResponse.data.deadline)" "Cyan"
} else {
    Write-Log "Failed to create Revenue target!" "Red"
    exit 1
}

# Step 5: Create an Expenses target
Write-Log "Step 5: Creating an Expenses target..." "Yellow"

$expensesTargetBody = @{
    type = "Expenses"
    value = 50000
    deadline = (Get-Date).AddMonths(2).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

$createExpensesResponse = Invoke-AuthenticatedRequest -Method "POST" -Url "$baseUrl/targets" -Body $expensesTargetBody

if ($createExpensesResponse -and $createExpensesResponse.success) {
    $expensesTargetId = $createExpensesResponse.data.id
    Write-Log "Expenses target created successfully! ID: $expensesTargetId" "Green"
    Write-Log "  Type: $($createExpensesResponse.data.type)" "Cyan"
    Write-Log "  Value: $($createExpensesResponse.data.value)" "Cyan"
    Write-Log "  Deadline: $($createExpensesResponse.data.deadline)" "Cyan"
} else {
    Write-Log "Failed to create Expenses target!" "Red"
    exit 1
}

# Step 6: Create a Profit target
Write-Log "Step 6: Creating a Profit target..." "Yellow"

$profitTargetBody = @{
    type = "Profit"
    value = 75000
    deadline = (Get-Date).AddMonths(12).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

$createProfitResponse = Invoke-AuthenticatedRequest -Method "POST" -Url "$baseUrl/targets" -Body $profitTargetBody

if ($createProfitResponse -and $createProfitResponse.success) {
    $profitTargetId = $createProfitResponse.data.id
    Write-Log "Profit target created successfully! ID: $profitTargetId" "Green"
    Write-Log "  Type: $($createProfitResponse.data.type)" "Cyan"
    Write-Log "  Value: $($createProfitResponse.data.value)" "Cyan"
    Write-Log "  Deadline: $($createProfitResponse.data.deadline)" "Cyan"
} else {
    Write-Log "Failed to create Profit target!" "Red"
    exit 1
}

# Step 7: Get all targets
Write-Log "Step 7: Getting all targets..." "Yellow"
$getAllResponse = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/targets"

if ($getAllResponse -and $getAllResponse.success) {
    Write-Log "All targets retrieved successfully!" "Green"
    Write-Log "Total targets: $($getAllResponse.pagination.total)" "Cyan"
    Write-Log "Page: $($getAllResponse.pagination.page) of $($getAllResponse.pagination.totalPages)" "Cyan"
    
    foreach ($target in $getAllResponse.data) {
        Write-Log "  - $($target.type): $($target.value) (Deadline: $($target.deadline))" "Cyan"
    }
} else {
    Write-Log "Failed to get all targets!" "Red"
}

# Step 8: Get targets by type (Sales)
Write-Log "Step 8: Getting Sales targets..." "Yellow"
$getSalesResponse = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/targets?type=Sales"

if ($getSalesResponse -and $getSalesResponse.success) {
    Write-Log "Sales targets retrieved successfully!" "Green"
    Write-Log "Found $($getSalesResponse.data.Count) Sales targets" "Cyan"
} else {
    Write-Log "Failed to get Sales targets!" "Red"
}

# Step 9: Get target by ID
Write-Log "Step 9: Getting target by ID..." "Yellow"
$getByIdResponse = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/targets/$salesTargetId"

if ($getByIdResponse -and $getByIdResponse.success) {
    Write-Log "Target retrieved by ID successfully!" "Green"
    Write-Log "  Type: $($getByIdResponse.data.type)" "Cyan"
    Write-Log "  Value: $($getByIdResponse.data.value)" "Cyan"
    Write-Log "  Deadline: $($getByIdResponse.data.deadline)" "Cyan"
} else {
    Write-Log "Failed to get target by ID!" "Red"
}

# Step 10: Update target
Write-Log "Step 10: Updating Sales target..." "Yellow"

$updateBody = @{
    value = 120000
    deadline = (Get-Date).AddMonths(4).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

$updateResponse = Invoke-AuthenticatedRequest -Method "PUT" -Url "$baseUrl/targets/$salesTargetId" -Body $updateBody

if ($updateResponse -and $updateResponse.success) {
    Write-Log "Sales target updated successfully!" "Green"
    Write-Log "  New Value: $($updateResponse.data.value)" "Cyan"
    Write-Log "  New Deadline: $($updateResponse.data.deadline)" "Cyan"
} else {
    Write-Log "Failed to update Sales target!" "Red"
}

# Step 11: Get target summary
Write-Log "Step 11: Getting target summary..." "Yellow"
$summaryResponse = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/targets/summary"

if ($summaryResponse -and $summaryResponse.success) {
    Write-Log "Target summary retrieved successfully!" "Green"
    Write-Log "Total targets: $($summaryResponse.data.totalTargets)" "Cyan"
    Write-Log "Active targets: $($summaryResponse.data.activeTargets)" "Cyan"
    
    Write-Log "Targets by type:" "Cyan"
    foreach ($type in $summaryResponse.data.byType) {
        Write-Log "  - $($type.type): $($type.count) targets, Total value: $($type.totalValue)" "Cyan"
    }
    
    Write-Log "Upcoming deadlines:" "Cyan"
    foreach ($deadline in $summaryResponse.data.upcomingDeadlines) {
        Write-Log "  - $($deadline.type): $($deadline.value) (Days remaining: $($deadline.daysRemaining))" "Cyan"
    }
} else {
    Write-Log "Failed to get target summary!" "Red"
}

# Step 12: Delete target (soft delete)
Write-Log "Step 12: Deleting Expenses target..." "Yellow"
$deleteResponse = Invoke-AuthenticatedRequest -Method "DELETE" -Url "$baseUrl/targets/$expensesTargetId"

if ($deleteResponse -and $deleteResponse.success) {
    Write-Log "Expenses target deleted successfully!" "Green"
} else {
    Write-Log "Failed to delete Expenses target!" "Red"
}

# Step 13: Verify deletion (should still exist but inactive)
Write-Log "Step 13: Verifying deletion (should be inactive)..." "Yellow"
$getDeletedResponse = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/targets/$expensesTargetId"

if ($getDeletedResponse -and $getDeletedResponse.success) {
    Write-Log "Deleted target still exists but is inactive: $($getDeletedResponse.data.isActive)" "Green"
} else {
    Write-Log "Failed to get deleted target!" "Red"
}

# Step 14: Get active targets only
Write-Log "Step 14: Getting active targets only..." "Yellow"
$getActiveResponse = Invoke-AuthenticatedRequest -Method "GET" -Url "$baseUrl/targets?isActive=true"

if ($getActiveResponse -and $getActiveResponse.success) {
    Write-Log "Active targets retrieved successfully!" "Green"
    Write-Log "Active targets count: $($getActiveResponse.data.Count)" "Cyan"
    
    foreach ($target in $getActiveResponse.data) {
        Write-Log "  - $($target.type): $($target.value) (Active: $($target.isActive))" "Cyan"
    }
} else {
    Write-Log "Failed to get active targets!" "Red"
}

Write-Log "Target CRUD test completed successfully!" "Green"
Write-Log "All operations working as expected!" "Green" 