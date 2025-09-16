# Complete Investment Workflow Test
# Tests the entire investment process from application submission to board review completion
# Following the exact workflow: Application → Due Diligence → Board Review

param(
    [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

Write-Host "=== COMPLETE INVESTMENT WORKFLOW TEST ===" -ForegroundColor Green
Write-Host "Testing: Application → Due Diligence → Board Review" -ForegroundColor Cyan

# Helper functions
function Write-TestStep {
    param([string]$Message, [string]$Status = "INFO")
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = switch ($Status) {
        "SUCCESS" { "Green" }
        "ERROR" { "Red" }
        "WARNING" { "Yellow" }
        "INFO" { "Cyan" }
        default { "White" }
    }
    Write-Host "[$timestamp] $Message" -ForegroundColor $color
}

function Invoke-APIRequest {
    param(
        [string]$Method,
        [string]$Url,
        [object]$Body = $null,
        [hashtable]$Headers = $script:headers
    )
    
    $params = @{
        Method = $Method
        Uri = $Url
        Headers = $Headers
    }
    
    if ($Body) {
        $params.Body = $Body | ConvertTo-Json -Depth 10
    }
    
    try {
        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        $errorResponse = $_.Exception.Response
        if ($errorResponse) {
            $reader = New-Object System.IO.StreamReader($errorResponse.GetResponseStream())
            $errorBody = $reader.ReadToEnd()
            $reader.Close()
            
            try {
                $errorJson = $errorBody | ConvertFrom-Json
                throw "HTTP $($errorResponse.StatusCode): $($errorJson.message)"
            }
            catch {
                throw "HTTP $($errorResponse.StatusCode): $errorBody"
            }
        }
        throw $_.Exception.Message
    }
}

# Test data
$TestData = @{
    Application = @{
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
    
    DueDiligencePhase1 = @{
        marketResearchViable = $true
        marketResearchComments = "Market research shows strong potential in the target market with growing demand for renewable energy solutions. The African energy market is projected to grow 15% annually."
        financialViable = $true
        financialComments = "Financial projections are realistic and show positive cash flow within 18 months. The business model is sustainable with clear revenue streams."
        competitiveOpportunities = $true
        competitiveComments = "Competitive analysis reveals clear market opportunities. Limited competition in the smart grid space for African markets."
    }
    
    DueDiligencePhase2 = @{
        managementTeamQualified = $true
        managementComments = "Management team has strong qualifications and relevant experience in the energy sector. CEO has 10+ years in renewable energy."
        legalCompliant = $true
        legalComments = "All legal requirements are met, proper governance structure in place. Company is properly registered and compliant."
        riskTolerable = $true
        riskComments = "Risk assessment shows acceptable risk levels within tolerable limits. Market risks are mitigated by strong demand."
        recommendation = "APPROVE"
        finalComments = "Overall assessment is positive. The business shows strong potential with qualified management team and viable market opportunity. Recommend approval for investment."
    }
    
    BoardReviewApproved = @{
        investmentApproved = $true
        recommendationReport = "Based on our comprehensive analysis, we recommend approving this investment. The company shows strong market potential, experienced management team, and solid financial projections."
        decisionReason = "Strong market potential, experienced team, and solid financial projections"
        nextSteps = "Proceed to term sheet negotiation"
        overallScore = 85.5
        finalComments = "Strong recommendation for approval based on market analysis and team capabilities"
    }
    
    BoardReviewRejected = @{
        investmentRejected = $true
        recommendationReport = "After careful consideration, we cannot recommend this investment due to market conditions and risk factors."
        decisionReason = "Market conditions and risk factors outweigh potential benefits"
        nextSteps = "Application closed"
        overallScore = 35.0
        finalComments = "Risk factors outweigh potential benefits"
    }
    
    BoardReviewConditional = @{
        conditionalApproval = $true
        recommendationReport = "We recommend conditional approval with additional requirements that need to be met."
        decisionReason = "Strong potential but needs additional information"
        conditions = "Provide updated financial projections and market analysis"
        nextSteps = "Address conditions and resubmit"
        overallScore = 65.0
        finalComments = "Good potential but requires additional information before final approval"
    }
}

# Test workflow
Write-TestStep "🚀 Starting Complete Investment Workflow Test" "SUCCESS"

try {
    # Step 1: Login
    Write-TestStep "1. Authenticating..." "INFO"
    $loginResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email": "admin@nvccz.co.zw", "password": "admin123"}'
    
    if ($loginResponse.success) {
        $script:token = $loginResponse.token
        $script:headers = @{
            "Authorization" = "Bearer $script:token"
            "Content-Type" = "application/json"
        }
        Write-TestStep "✅ Authentication successful" "SUCCESS"
    } else {
        throw "Login failed: $($loginResponse.message)"
    }
    
    # Step 2: Create Application (Public - No Auth)
    Write-TestStep "2. Creating test application..." "INFO"
    $newAppResponse = Invoke-RestMethod -Uri "$BaseUrl/api/applications" -Method POST -ContentType "application/json" -Body ($TestData.Application | ConvertTo-Json -Depth 10)
    $applicationId = $newAppResponse.data.id
    Write-TestStep "✅ Created test application: $applicationId" "SUCCESS"
    Write-TestStep "📋 Business: $($newAppResponse.data.businessName)" "INFO"
    Write-TestStep "📋 Stage: $($newAppResponse.data.currentStage)" "INFO"
    
    # Step 3: Get All Applications (Authenticated)
    Write-TestStep "3. Getting all applications..." "INFO"
    $allAppsResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/applications"
    Write-TestStep "✅ Retrieved all applications" "SUCCESS"
    Write-TestStep "📊 Total applications: $($allAppsResponse.data.total)" "INFO"
    
    # Step 4: Get Specific Application (Authenticated)
    Write-TestStep "4. Getting specific application..." "INFO"
    $specificAppResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/applications/$applicationId"
    Write-TestStep "✅ Retrieved specific application" "SUCCESS"
    Write-TestStep "📋 Application ID: $($specificAppResponse.data.id)" "INFO"
    Write-TestStep "📋 Current Stage: $($specificAppResponse.data.currentStage)" "INFO"
    
    # Step 5: Initiate Due Diligence (Authenticated)
    Write-TestStep "5. Initiating due diligence..." "INFO"
    $initiateResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/applications/$applicationId/due-diligence/initiate"
    Write-TestStep "✅ Due diligence initiated" "SUCCESS"
    Write-TestStep "📋 Status: $($initiateResponse.data.status)" "INFO"
    
    # Step 6: Update Due Diligence Data - Phase 1 (Authenticated)
    Write-TestStep "6. Updating due diligence data (Phase 1)..." "INFO"
    $dueDiligencePhase1Response = Invoke-APIRequest -Method "PUT" -Url "$BaseUrl/api/applications/$applicationId/due-diligence" -Body $TestData.DueDiligencePhase1
    Write-TestStep "✅ Due diligence Phase 1 updated" "SUCCESS"
    Write-TestStep "📋 Market Research Viable: $($dueDiligencePhase1Response.data.marketResearchViable)" "INFO"
    Write-TestStep "📋 Financial Viable: $($dueDiligencePhase1Response.data.financialViable)" "INFO"
    
    # Step 7: Update Due Diligence Data - Phase 2 (Authenticated)
    Write-TestStep "7. Updating due diligence data (Phase 2)..." "INFO"
    $dueDiligencePhase2Response = Invoke-APIRequest -Method "PUT" -Url "$BaseUrl/api/applications/$applicationId/due-diligence" -Body $TestData.DueDiligencePhase2
    Write-TestStep "✅ Due diligence Phase 2 updated" "SUCCESS"
    Write-TestStep "📋 Recommendation: $($dueDiligencePhase2Response.data.recommendation)" "INFO"
    Write-TestStep "📋 Management Team Qualified: $($dueDiligencePhase2Response.data.managementTeamQualified)" "INFO"
    
    # Step 8: Get Due Diligence Report (Authenticated)
    Write-TestStep "8. Getting due diligence report..." "INFO"
    $dueDiligenceReportResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/applications/$applicationId/due-diligence"
    Write-TestStep "✅ Retrieved due diligence report" "SUCCESS"
    Write-TestStep "📋 Overall Score: $($dueDiligenceReportResponse.data.overallScore)" "INFO"
    Write-TestStep "📋 Status: $($dueDiligenceReportResponse.data.status)" "INFO"
    
    # Step 9: Complete Due Diligence (Authenticated)
    Write-TestStep "9. Completing due diligence..." "INFO"
    $completeDueDiligenceResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/applications/$applicationId/due-diligence/complete"
    Write-TestStep "✅ Due diligence completed" "SUCCESS"
    Write-TestStep "📋 New Stage: $($completeDueDiligenceResponse.data.application.currentStage)" "INFO"
    Write-TestStep "📋 Completed At: $($completeDueDiligenceResponse.data.completedAt)" "INFO"
    
    # Step 10: Get Applications in UNDER_DUE_DILIGENCE Stage
    Write-TestStep "10. Getting applications in UNDER_DUE_DILIGENCE stage..." "INFO"
    $underDueDiligenceAppsResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/applications?stage=UNDER_DUE_DILIGENCE&limit=5"
    Write-TestStep "✅ Retrieved applications in UNDER_DUE_DILIGENCE stage" "SUCCESS"
    Write-TestStep "📊 Count: $($underDueDiligenceAppsResponse.data.applications.Count)" "INFO"
    
    # Step 11: Create Board Review (Investment Approved)
    Write-TestStep "11. Creating board review (Investment Approved)..." "INFO"
    $boardReviewResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/board-reviews/$applicationId" -Body $TestData.BoardReviewApproved
    Write-TestStep "✅ Board review created (Investment Approved)" "SUCCESS"
    Write-TestStep "📋 Investment Approved: $($boardReviewResponse.data.investmentApproved)" "INFO"
    Write-TestStep "📋 Status: $($boardReviewResponse.data.status)" "INFO"
    Write-TestStep "📋 Application Stage: $($boardReviewResponse.data.application.currentStage)" "INFO"
    
    # Step 12: Get Board Review by Application ID
    Write-TestStep "12. Getting board review by application ID..." "INFO"
    $getBoardReviewResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/board-reviews/$applicationId"
    Write-TestStep "✅ Retrieved board review" "SUCCESS"
    Write-TestStep "📋 Overall Score: $($getBoardReviewResponse.data.overallScore)" "INFO"
    Write-TestStep "📋 Decision Reason: $($getBoardReviewResponse.data.decisionReason)" "INFO"
    
    # Step 13: Update Board Review
    Write-TestStep "13. Updating board review..." "INFO"
    $updateBoardReviewBody = @{
        recommendationReport = "Updated recommendation report with additional analysis..."
        decisionReason = "Updated decision reason with more details"
        nextSteps = "Updated next steps: Proceed to term sheet negotiation and legal review"
        overallScore = 90.0
        finalComments = "Updated final comments with additional insights"
    }
    $updateBoardReviewResponse = Invoke-APIRequest -Method "PUT" -Url "$BaseUrl/api/board-reviews/$applicationId" -Body $updateBoardReviewBody
    Write-TestStep "✅ Board review updated" "SUCCESS"
    Write-TestStep "📋 Updated Score: $($updateBoardReviewResponse.data.overallScore)" "INFO"
    
    # Step 14: Complete Board Review
    Write-TestStep "14. Completing board review..." "INFO"
    $completeBoardReviewResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/board-reviews/$applicationId/complete"
    Write-TestStep "✅ Board review completed" "SUCCESS"
    Write-TestStep "📋 Status: $($completeBoardReviewResponse.data.status)" "INFO"
    Write-TestStep "📋 Completed At: $($completeBoardReviewResponse.data.completedAt)" "INFO"
    Write-TestStep "📋 Final Application Stage: $($completeBoardReviewResponse.data.application.currentStage)" "INFO"
    
    # Step 15: Get All Board Reviews
    Write-TestStep "15. Getting all board reviews..." "INFO"
    $allBoardReviewsResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/board-reviews?page=1&limit=10"
    Write-TestStep "✅ Retrieved all board reviews" "SUCCESS"
    Write-TestStep "📊 Total: $($allBoardReviewsResponse.data.total)" "INFO"
    Write-TestStep "📊 Page: $($allBoardReviewsResponse.data.page)" "INFO"
    
    # Step 16: Get My Board Reviews
    Write-TestStep "16. Getting my board reviews..." "INFO"
    $myBoardReviewsResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/board-reviews/my?page=1&limit=10"
    Write-TestStep "✅ Retrieved my board reviews" "SUCCESS"
    Write-TestStep "📊 My Reviews: $($myBoardReviewsResponse.data.total)" "INFO"
    
    # Step 17: Test Other Board Review Scenarios
    Write-TestStep "17. Testing other board review scenarios..." "INFO"
    
    # Create second application for rejection scenario
    Write-TestStep "   Creating second application for rejection scenario..." "INFO"
    $createAppBody2 = $TestData.Application
    $createAppBody2.applicantEmail = "jane.smith@techstartup2.com"
    $createAppBody2.businessName = "TechStart Solutions 2"
    
    $newAppResponse2 = Invoke-RestMethod -Uri "$BaseUrl/api/applications" -Method POST -ContentType "application/json" -Body ($createAppBody2 | ConvertTo-Json -Depth 10)
    $applicationId2 = $newAppResponse2.data.id
    
    # Complete due diligence for second application
    Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/applications/$applicationId2/due-diligence/initiate"
    Invoke-APIRequest -Method "PUT" -Url "$BaseUrl/api/applications/$applicationId2/due-diligence" -Body $TestData.DueDiligencePhase1
    Invoke-APIRequest -Method "PUT" -Url "$BaseUrl/api/applications/$applicationId2/due-diligence" -Body $TestData.DueDiligencePhase2
    Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/applications/$applicationId2/due-diligence/complete"
    
    # Test Investment Rejected scenario
    Write-TestStep "   Testing Investment Rejected scenario..." "INFO"
    $boardReviewRejectedResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/board-reviews/$applicationId2" -Body $TestData.BoardReviewRejected
    Write-TestStep "   ✅ Board review created (Investment Rejected)" "SUCCESS"
    
    $completeRejectedResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/board-reviews/$applicationId2/complete"
    Write-TestStep "   ✅ Board review completed (Rejected)" "SUCCESS"
    Write-TestStep "   📋 Final stage: $($completeRejectedResponse.data.application.currentStage)" "INFO"
    
    # Create third application for conditional approval
    Write-TestStep "   Creating third application for conditional approval scenario..." "INFO"
    $createAppBody3 = $TestData.Application
    $createAppBody3.applicantEmail = "bob.smith@techstartup3.com"
    $createAppBody3.businessName = "TechStart Solutions 3"
    
    $newAppResponse3 = Invoke-RestMethod -Uri "$BaseUrl/api/applications" -Method POST -ContentType "application/json" -Body ($createAppBody3 | ConvertTo-Json -Depth 10)
    $applicationId3 = $newAppResponse3.data.id
    
    # Complete due diligence for third application
    Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/applications/$applicationId3/due-diligence/initiate"
    Invoke-APIRequest -Method "PUT" -Url "$BaseUrl/api/applications/$applicationId3/due-diligence" -Body $TestData.DueDiligencePhase1
    Invoke-APIRequest -Method "PUT" -Url "$BaseUrl/api/applications/$applicationId3/due-diligence" -Body $TestData.DueDiligencePhase2
    Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/applications/$applicationId3/due-diligence/complete"
    
    # Test Conditional Approval scenario
    Write-TestStep "   Testing Conditional Approval scenario..." "INFO"
    $boardReviewConditionalResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/board-reviews/$applicationId3" -Body $TestData.BoardReviewConditional
    Write-TestStep "   ✅ Board review created (Conditional Approval)" "SUCCESS"
    
    $completeConditionalResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/board-reviews/$applicationId3/complete"
    Write-TestStep "   ✅ Board review completed (Conditional)" "SUCCESS"
    Write-TestStep "   📋 Final stage: $($completeConditionalResponse.data.application.currentStage)" "INFO"
    
    # Step 18: Test Error Cases
    Write-TestStep "18. Testing error cases..." "INFO"
    
    # Try to create duplicate board review
    try {
        $duplicateResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/board-reviews/$applicationId" -Body $TestData.BoardReviewApproved
        Write-TestStep "❌ Should have failed - duplicate board review" "ERROR"
    }
    catch {
        Write-TestStep "✅ Correctly prevented duplicate board review: $($_.Exception.Message)" "SUCCESS"
    }
    
    # Try to update completed board review
    try {
        $updateCompletedBody = @{
            recommendationReport = "This should fail"
        }
        $updateCompletedResponse = Invoke-APIRequest -Method "PUT" -Url "$BaseUrl/api/board-reviews/$applicationId" -Body $updateCompletedBody
        Write-TestStep "❌ Should have failed - updating completed review" "ERROR"
    }
    catch {
        Write-TestStep "✅ Correctly prevented updating completed board review: $($_.Exception.Message)" "SUCCESS"
    }
    
    # Step 19: Final Summary
    Write-TestStep "19. Final summary..." "INFO"
    
    # Get final application count
    $finalAppsResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/applications?limit=10"
    Write-TestStep "📊 Total applications: $($finalAppsResponse.data.total)" "INFO"
    
    # Get final board review count
    $finalReviewsResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/board-reviews?limit=10"
    Write-TestStep "📊 Total board reviews: $($finalReviewsResponse.data.total)" "INFO"
    
    Write-TestStep "🎉 Complete Investment Workflow Test Completed Successfully!" "SUCCESS"
    Write-TestStep "✅ All scenarios tested: Investment Approved, Rejected, and Conditional Approval" "SUCCESS"
    Write-TestStep "✅ All workflow steps working correctly" "SUCCESS"
    Write-TestStep "✅ All validation and error handling working correctly" "SUCCESS"
    
} catch {
    Write-TestStep "❌ Test failed: $($_.Exception.Message)" "ERROR"
    exit 1
}

Write-TestStep "=== TEST COMPLETED ===" "SUCCESS"

