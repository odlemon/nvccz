# Complete Investment Workflow Test (Expense Style)
$baseUrl = "http://localhost:3000"

Write-Host "=== COMPLETE INVESTMENT WORKFLOW TEST ===" -ForegroundColor Magenta
Write-Host ""

# Step 1: Login
Write-Host "1. Logging in..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'

if ($loginResponse.success) {
    $token = $loginResponse.data.token
    Write-Host "✓ Login successful" -ForegroundColor Green
} else {
    Write-Host "✗ Login failed" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Step 2: Create Application (Public - No Auth)
Write-Host "`n2. Creating application..." -ForegroundColor Yellow

$application = @{
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
} | ConvertTo-Json -Depth 10

$appResponse = Invoke-RestMethod -Uri "$baseUrl/api/applications" -Method POST -ContentType "application/json" -Body $application

if ($appResponse.success) {
    $applicationId = $appResponse.data.id
    Write-Host "✓ Application created successfully" -ForegroundColor Green
    Write-Host "  Application ID: $applicationId" -ForegroundColor White
    Write-Host "  Business: $($appResponse.data.businessName)" -ForegroundColor White
    Write-Host "  Stage: $($appResponse.data.currentStage)" -ForegroundColor White
} else {
    Write-Host "✗ Error creating application" -ForegroundColor Red
    exit 1
}

# Step 3: Get All Applications (Authenticated)
Write-Host "`n3. Getting all applications..." -ForegroundColor Yellow
$allAppsResponse = Invoke-RestMethod -Uri "$baseUrl/api/applications" -Method GET -Headers $headers

if ($allAppsResponse.success) {
    Write-Host "✓ Retrieved all applications" -ForegroundColor Green
    Write-Host "  Total applications: $($allAppsResponse.data.total)" -ForegroundColor White
} else {
    Write-Host "✗ Error getting applications" -ForegroundColor Red
}

# Step 4: Get Specific Application (Authenticated)
Write-Host "`n4. Getting specific application..." -ForegroundColor Yellow
$specificAppResponse = Invoke-RestMethod -Uri "$baseUrl/api/applications/$applicationId" -Method GET -Headers $headers

if ($specificAppResponse.success) {
    Write-Host "✓ Retrieved specific application" -ForegroundColor Green
    Write-Host "  Application ID: $($specificAppResponse.data.id)" -ForegroundColor White
    Write-Host "  Current Stage: $($specificAppResponse.data.currentStage)" -ForegroundColor White
} else {
    Write-Host "✗ Error getting specific application" -ForegroundColor Red
}

# Step 5: Initiate Due Diligence (Authenticated)
Write-Host "`n5. Initiating due diligence..." -ForegroundColor Yellow
$initiateResponse = Invoke-RestMethod -Uri "$baseUrl/api/applications/$applicationId/due-diligence/initiate" -Method POST -Headers $headers

if ($initiateResponse.success) {
    Write-Host "✓ Due diligence initiated" -ForegroundColor Green
    Write-Host "  Status: $($initiateResponse.data.status)" -ForegroundColor White
} else {
    Write-Host "✗ Error initiating due diligence" -ForegroundColor Red
}

# Step 6: Update Due Diligence Data - Phase 1 (Authenticated)
Write-Host "`n6. Updating due diligence data (Phase 1)..." -ForegroundColor Yellow

$dueDiligencePhase1 = @{
    marketResearchViable = $true
    marketResearchComments = "Market research shows strong potential in the target market with growing demand for renewable energy solutions. The African energy market is projected to grow 15% annually."
    financialViable = $true
    financialComments = "Financial projections are realistic and show positive cash flow within 18 months. The business model is sustainable with clear revenue streams."
    competitiveOpportunities = $true
    competitiveComments = "Competitive analysis reveals clear market opportunities. Limited competition in the smart grid space for African markets."
} | ConvertTo-Json

$phase1Response = Invoke-RestMethod -Uri "$baseUrl/api/applications/$applicationId/due-diligence" -Method PUT -Headers $headers -Body $dueDiligencePhase1

if ($phase1Response.success) {
    Write-Host "✓ Due diligence Phase 1 updated" -ForegroundColor Green
    Write-Host "  Market Research Viable: $($phase1Response.data.marketResearchViable)" -ForegroundColor White
    Write-Host "  Financial Viable: $($phase1Response.data.financialViable)" -ForegroundColor White
} else {
    Write-Host "✗ Error updating due diligence Phase 1" -ForegroundColor Red
}

# Step 7: Update Due Diligence Data - Phase 2 (Authenticated)
Write-Host "`n7. Updating due diligence data (Phase 2)..." -ForegroundColor Yellow

$dueDiligencePhase2 = @{
    managementTeamQualified = $true
    managementComments = "Management team has strong qualifications and relevant experience in the energy sector. CEO has 10+ years in renewable energy."
    legalCompliant = $true
    legalComments = "All legal requirements are met, proper governance structure in place. Company is properly registered and compliant."
    riskTolerable = $true
    riskComments = "Risk assessment shows acceptable risk levels within tolerable limits. Market risks are mitigated by strong demand."
    recommendation = "APPROVE"
    finalComments = "Overall assessment is positive. The business shows strong potential with qualified management team and viable market opportunity. Recommend approval for investment."
} | ConvertTo-Json

$phase2Response = Invoke-RestMethod -Uri "$baseUrl/api/applications/$applicationId/due-diligence" -Method PUT -Headers $headers -Body $dueDiligencePhase2

if ($phase2Response.success) {
    Write-Host "✓ Due diligence Phase 2 updated" -ForegroundColor Green
    Write-Host "  Recommendation: $($phase2Response.data.recommendation)" -ForegroundColor White
    Write-Host "  Management Team Qualified: $($phase2Response.data.managementTeamQualified)" -ForegroundColor White
} else {
    Write-Host "✗ Error updating due diligence Phase 2" -ForegroundColor Red
}

# Step 8: Get Due Diligence Report (Authenticated)
Write-Host "`n8. Getting due diligence report..." -ForegroundColor Yellow
$reportResponse = Invoke-RestMethod -Uri "$baseUrl/api/applications/$applicationId/due-diligence" -Method GET -Headers $headers

if ($reportResponse.success) {
    Write-Host "✓ Retrieved due diligence report" -ForegroundColor Green
    Write-Host "  Overall Score: $($reportResponse.data.overallScore)" -ForegroundColor White
    Write-Host "  Status: $($reportResponse.data.status)" -ForegroundColor White
} else {
    Write-Host "✗ Error getting due diligence report" -ForegroundColor Red
}

# Step 9: Complete Due Diligence (Authenticated)
Write-Host "`n9. Completing due diligence..." -ForegroundColor Yellow
$completeResponse = Invoke-RestMethod -Uri "$baseUrl/api/applications/$applicationId/due-diligence/complete" -Method POST -Headers $headers

if ($completeResponse.success) {
    Write-Host "✓ Due diligence completed" -ForegroundColor Green
    Write-Host "  New Stage: $($completeResponse.data.application.currentStage)" -ForegroundColor White
    Write-Host "  Completed At: $($completeResponse.data.completedAt)" -ForegroundColor White
} else {
    Write-Host "✗ Error completing due diligence" -ForegroundColor Red
}

# Step 10: Get Applications in UNDER_DUE_DILIGENCE Stage
Write-Host "`n10. Getting applications in UNDER_DUE_DILIGENCE stage..." -ForegroundColor Yellow
$underDueDiligenceResponse = Invoke-RestMethod -Uri "$baseUrl/api/applications?stage=UNDER_DUE_DILIGENCE`&limit=5" -Method GET -Headers $headers

if ($underDueDiligenceResponse.success) {
    Write-Host "✓ Retrieved applications in UNDER_DUE_DILIGENCE stage" -ForegroundColor Green
    Write-Host "  Count: $($underDueDiligenceResponse.data.applications.Count)" -ForegroundColor White
} else {
    Write-Host "✗ Error getting applications in UNDER_DUE_DILIGENCE stage" -ForegroundColor Red
}

# Step 11: Create Board Review (Investment Approved)
Write-Host "`n11. Creating board review (Investment Approved)..." -ForegroundColor Yellow

$boardReview = @{
    investmentApproved = $true
    recommendationReport = "Based on our comprehensive analysis, we recommend approving this investment. The company shows strong market potential, experienced management team, and solid financial projections."
    decisionReason = "Strong market potential, experienced team, and solid financial projections"
    nextSteps = "Proceed to term sheet negotiation"
    overallScore = 85.5
    finalComments = "Strong recommendation for approval based on market analysis and team capabilities"
} | ConvertTo-Json

$boardReviewResponse = Invoke-RestMethod -Uri "$baseUrl/api/board-reviews/$applicationId" -Method POST -Headers $headers -Body $boardReview

if ($boardReviewResponse.success) {
    Write-Host "✓ Board review created (Investment Approved)" -ForegroundColor Green
    Write-Host "  Investment Approved: $($boardReviewResponse.data.investmentApproved)" -ForegroundColor White
    Write-Host "  Status: $($boardReviewResponse.data.status)" -ForegroundColor White
    Write-Host "  Application Stage: $($boardReviewResponse.data.application.currentStage)" -ForegroundColor White
} else {
    Write-Host "✗ Error creating board review" -ForegroundColor Red
}

# Step 12: Get Board Review by Application ID
Write-Host "`n12. Getting board review by application ID..." -ForegroundColor Yellow
$getBoardReviewResponse = Invoke-RestMethod -Uri "$baseUrl/api/board-reviews/$applicationId" -Method GET -Headers $headers

if ($getBoardReviewResponse.success) {
    Write-Host "✓ Retrieved board review" -ForegroundColor Green
    Write-Host "  Overall Score: $($getBoardReviewResponse.data.overallScore)" -ForegroundColor White
    Write-Host "  Decision Reason: $($getBoardReviewResponse.data.decisionReason)" -ForegroundColor White
} else {
    Write-Host "✗ Error getting board review" -ForegroundColor Red
}

# Step 13: Update Board Review
Write-Host "`n13. Updating board review..." -ForegroundColor Yellow

$updateBoardReview = @{
    recommendationReport = "Updated recommendation report with additional analysis..."
    decisionReason = "Updated decision reason with more details"
    nextSteps = "Updated next steps: Proceed to term sheet negotiation and legal review"
    overallScore = 90.0
    finalComments = "Updated final comments with additional insights"
} | ConvertTo-Json

$updateBoardReviewResponse = Invoke-RestMethod -Uri "$baseUrl/api/board-reviews/$applicationId" -Method PUT -Headers $headers -Body $updateBoardReview

if ($updateBoardReviewResponse.success) {
    Write-Host "✓ Board review updated" -ForegroundColor Green
    Write-Host "  Updated Score: $($updateBoardReviewResponse.data.overallScore)" -ForegroundColor White
} else {
    Write-Host "✗ Error updating board review" -ForegroundColor Red
}

# Step 14: Complete Board Review
Write-Host "`n14. Completing board review..." -ForegroundColor Yellow
$completeBoardReviewResponse = Invoke-RestMethod -Uri "$baseUrl/api/board-reviews/$applicationId/complete" -Method POST -Headers $headers

if ($completeBoardReviewResponse.success) {
    Write-Host "✓ Board review completed" -ForegroundColor Green
    Write-Host "  Status: $($completeBoardReviewResponse.data.status)" -ForegroundColor White
    Write-Host "  Completed At: $($completeBoardReviewResponse.data.completedAt)" -ForegroundColor White
    Write-Host "  Final Application Stage: $($completeBoardReviewResponse.data.application.currentStage)" -ForegroundColor White
} else {
    Write-Host "✗ Error completing board review" -ForegroundColor Red
}

# Step 15: Get All Board Reviews
Write-Host "`n15. Getting all board reviews..." -ForegroundColor Yellow
$allBoardReviewsResponse = Invoke-RestMethod -Uri "$baseUrl/api/board-reviews?page=1`&limit=10" -Method GET -Headers $headers

if ($allBoardReviewsResponse.success) {
    Write-Host "✓ Retrieved all board reviews" -ForegroundColor Green
    Write-Host "  Total: $($allBoardReviewsResponse.data.total)" -ForegroundColor White
    Write-Host "  Page: $($allBoardReviewsResponse.data.page)" -ForegroundColor White
} else {
    Write-Host "✗ Error getting all board reviews" -ForegroundColor Red
}

# Step 16: Get My Board Reviews
Write-Host "`n16. Getting my board reviews..." -ForegroundColor Yellow
$myBoardReviewsResponse = Invoke-RestMethod -Uri "$baseUrl/api/board-reviews/my?page=1`&limit=10" -Method GET -Headers $headers

if ($myBoardReviewsResponse.success) {
    Write-Host "✓ Retrieved my board reviews" -ForegroundColor Green
    Write-Host "  My Reviews: $($myBoardReviewsResponse.data.total)" -ForegroundColor White
} else {
    Write-Host "✗ Error getting my board reviews" -ForegroundColor Red
}

Write-Host "`n=== TEST COMPLETED ===" -ForegroundColor Magenta
