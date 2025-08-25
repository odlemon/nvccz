# Debug Application Creation Test
$baseUrl = "http://localhost:3000"

Write-Host "=== DEBUG APPLICATION CREATION TEST ===" -ForegroundColor Green

# Test application creation
Write-Host "`n1. Testing application creation..." -ForegroundColor Yellow

$testAppBody = @{
    applicantName = "John Smith"
    applicantEmail = "john.smith@techstartup.com"
    applicantPhone = "+263771234567"
    applicantAddress = "123 Innovation Street, Harare, Zimbabwe"
    businessName = "TechStart Solutions"
    businessDescription = "A cutting-edge technology company specializing in renewable energy solutions and smart grid management systems for African markets"
    industry = "Technology"
    businessStage = "STARTUP"
    foundingDate = "2022-06-15"
    requestedAmount = 250000
    documents = @(
        @{
            documentType = "BUSINESS_PLAN"
            fileName = "techstart-business-plan-2024.pdf"
            fileUrl = "https://drive.google.com/file/d/1ABC123DEF456/view"
            fileSize = 3145728
            isRequired = $true
        },
        @{
            documentType = "PROOF_OF_CONCEPT"
            fileName = "smart-grid-prototype-demo.pdf"
            fileUrl = "https://dropbox.com/s/xyz789/prototype-demo.pdf"
            fileSize = 2097152
            isRequired = $true
        },
        @{
            documentType = "MARKET_RESEARCH"
            fileName = "african-energy-market-analysis-2024.pdf"
            fileUrl = "https://example.com/market-research/africa-energy-2024.pdf"
            fileSize = 1572864
            isRequired = $true
        },
        @{
            documentType = "PROJECTED_CASH_FLOWS"
            fileName = "financial-projections-5-year.pdf"
            fileUrl = "https://example.com/financials/projections-2024-2029.pdf"
            fileSize = 1048576
            isRequired = $true
        },
        @{
            documentType = "HISTORICAL_FINANCIALS"
            fileName = "historical-financials-2022-2023.pdf"
            fileUrl = "https://example.com/financials/historical-2022-2023.pdf"
            fileSize = 786432
            isRequired = $false
        }
    )
}

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/applications" -Method POST -ContentType "application/json" -Body ($testAppBody | ConvertTo-Json -Depth 10)
    Write-Host "✅ Application created successfully!" -ForegroundColor Green
    Write-Host "Response: $($response | ConvertTo-Json -Depth 3)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ Application creation failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        $reader.Close()
        Write-Host "Error Body: $errorBody" -ForegroundColor Red
    }
}

Write-Host "`n=== DEBUG TEST COMPLETED ===" -ForegroundColor Green
