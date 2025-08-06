# Vertical Income Statement Test
$baseUrl = "http://localhost:3000"

Write-Host "=== VERTICAL INCOME STATEMENT TEST ===" -ForegroundColor Green

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

# 2. Test vertical income statement
Write-Host "`n2. Testing vertical income statement..." -ForegroundColor Yellow

$currentDate = Get-Date
$startDate = (Get-Date -Year $currentDate.Year -Month $currentDate.Month -Day 1).ToString("yyyy-MM-dd")
$endDate = $currentDate.ToString("yyyy-MM-dd")

$verticalPayload = @{
    startDate = $startDate
    endDate = $endDate
}

Write-Host "Period: $startDate to $endDate" -ForegroundColor Cyan
Write-Host "Payload:" -ForegroundColor Yellow
$verticalPayload | ConvertTo-Json | Write-Host

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/accounting/income-statement/vertical" -Method POST -Headers $headers -Body ($verticalPayload | ConvertTo-Json)
    Write-Host "✅ Vertical Income Statement Retrieved Successfully!" -ForegroundColor Green

    # Display the vertical income statement in traditional format
    Write-Host "`nVERTICAL INCOME STATEMENT" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    
    # Income Section
    Write-Host "`nINCOME:" -ForegroundColor Green
    Write-Host "Sales: $($response.data.income.sales)" -ForegroundColor White
    Write-Host "Less: Sales Returns: ($($response.data.income.salesReturns))" -ForegroundColor White
    Write-Host "Net Sales: $($response.data.income.netSales)" -ForegroundColor Green
    
    # Cost of Goods Sold Section
    Write-Host "`nCOST OF GOODS SOLD (COGS):" -ForegroundColor Yellow
    Write-Host "Operating Stock: $($response.data.costOfGoodsSold.operatingStock)" -ForegroundColor White
    Write-Host "Add:" -ForegroundColor White
    Write-Host "  Purchases: $($response.data.costOfGoodsSold.purchases)" -ForegroundColor White
    Write-Host "  Wages: $($response.data.costOfGoodsSold.wages)" -ForegroundColor White
    Write-Host "  Carriage Inward: $($response.data.costOfGoodsSold.carriageInward)" -ForegroundColor White
    Write-Host "  Direct Expenses: $($response.data.costOfGoodsSold.directExpenses)" -ForegroundColor White
    Write-Host "Less: Closing Stock: ($($response.data.costOfGoodsSold.closingStock))" -ForegroundColor White
    Write-Host "Net Cost of Goods Sold: $($response.data.costOfGoodsSold.netCostOfGoodsSold)" -ForegroundColor Yellow
    
    # Gross Profit
    Write-Host "`nGROSS PROFIT (Net Sales - Cost of Goods Sold):" -ForegroundColor Green
    Write-Host "Gross Profit: $($response.data.grossProfit)" -ForegroundColor Green
    
    # Operating Expenses
    Write-Host "`nOPERATING EXPENSES:" -ForegroundColor Red
    Write-Host "Administrative Expenses: $($response.data.operatingExpenses.administrativeExpenses)" -ForegroundColor White
    Write-Host "Finance Expenses: $($response.data.operatingExpenses.financeExpenses)" -ForegroundColor White
    Write-Host "Selling Expenses: $($response.data.operatingExpenses.sellingExpenses)" -ForegroundColor White
    Write-Host "Total Operating Expenses: $($response.data.operatingExpenses.totalOperatingExpenses)" -ForegroundColor Red
    
    # Operating Profit
    Write-Host "`nOPERATING PROFIT (Gross Profit - Operating Expenses):" -ForegroundColor Green
    Write-Host "Operating Profit: $($response.data.operatingProfit)" -ForegroundColor Green
    
    # Non-operating Items
    Write-Host "`nNON-OPERATING ITEMS:" -ForegroundColor Cyan
    Write-Host "Add: Non-operating Income: $($response.data.nonOperatingItems.nonOperatingIncome)" -ForegroundColor White
    Write-Host "Less: Non-operating Expenses: ($($response.data.nonOperatingItems.nonOperatingExpenses))" -ForegroundColor White
    Write-Host "Net Profit Before Tax: $($response.data.nonOperatingItems.netProfitBeforeTax)" -ForegroundColor Cyan
    
    # Tax
    Write-Host "`nTAX:" -ForegroundColor Magenta
    Write-Host "Less: Tax: ($($response.data.tax.taxAmount))" -ForegroundColor White
    Write-Host "Net Profit After Tax: $($response.data.tax.netProfitAfterTax)" -ForegroundColor Magenta
    
    # Summary
    Write-Host "`nSUMMARY:" -ForegroundColor Cyan
    Write-Host "Period: $($response.data.period.startDate) to $($response.data.period.endDate)" -ForegroundColor White
    Write-Host "Currency: $($response.data.currency.name) ($($response.data.currency.code))" -ForegroundColor White
    Write-Host "Generated At: $($response.data.generatedAt)" -ForegroundColor White

} catch {
    Write-Host "❌ Failed to get vertical income statement: $($_.Exception.Message)" -ForegroundColor Red

    # Get detailed error
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Error details: $responseBody" -ForegroundColor Red
    }
}

Write-Host "`n=== VERTICAL INCOME STATEMENT TEST COMPLETE ===" -ForegroundColor Green 