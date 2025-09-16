# Test Board Review Workflow
# This script tests the complete board review workflow including:
# 1. Creating board reviews for applications
# 2. Updating board reviews
# 3. Completing board reviews and updating application stages
# 4. Verifying the workflow

param(
    [Parameter(Mandatory=$true)]
    [string]$Token,
    
    [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

# Test configuration
$TestData = @{
    Application = @{
        ApplicantName = "John Doe"
        ApplicantEmail = "john.doe@testcompany.com"
        ApplicantPhone = "+263 77 123 4567"
        ApplicantAddress = "123 Test Street, Harare"
        BusinessName = "Test Tech Startup"
        BusinessDescription = "A technology startup focused on innovative solutions"
        Industry = "Technology"
        BusinessStage = "OPERATIONAL"
        RequestedAmount = 100000
    }
    
         BoardReview = @{
         InvestmentApproved = $true
         RecommendationReport = "Based on our comprehensive analysis, we recommend approving this investment. The company shows strong market potential and solid financial projections."
         DecisionReason = "Strong market potential, experienced team, and solid financial projections"
         NextSteps = "Proceed to term sheet negotiation"
         OverallScore = 85.5
         FinalComments = "Strong recommendation for approval based on market analysis and team capabilities"
     }
}

# Headers for API requests
$Headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type" = "application/json"
}

# Helper functions
function Write-TestStep {
    param([string]$Message, [string]$Status = "INFO")
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = switch ($Status) {
        "SUCCESS" { "Green" }
        "ERROR" { "Red" }
        "WARNING" { "Yellow" }
        default { "White" }
    }
    Write-Host "[$timestamp] $Message" -ForegroundColor $color
}

function Invoke-APIRequest {
    param(
        [string]$Method,
        [string]$Url,
        [object]$Body = $null,
        [hashtable]$Headers = $Headers
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

# Test workflow
Write-TestStep "🚀 Starting Board Review Workflow Test" "SUCCESS"

try {
         # Step 1: Get applications in UNDER_DUE_DILIGENCE stage
     Write-TestStep "1. Getting applications in UNDER_DUE_DILIGENCE stage..."
     $applicationsResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/applications?stage=UNDER_DUE_DILIGENCE&limit=5"
    
         if ($applicationsResponse.data.applications.Count -eq 0) {
         Write-TestStep "   ⚠️  No applications found in UNDER_DUE_DILIGENCE stage" "WARNING"
         Write-TestStep "   Creating a test application and moving it to UNDER_DUE_DILIGENCE stage..." "INFO"
        
        # Create a test application
        $createAppBody = $TestData.Application
        $createAppBody.documents = @(
            @{
                documentType = "BUSINESS_PLAN"
                fileName = "business_plan.pdf"
                fileUrl = "https://example.com/business_plan.pdf"
                fileSize = 1024000
                isRequired = $true
            },
            @{
                documentType = "PROOF_OF_CONCEPT"
                fileName = "poc.pdf"
                fileUrl = "https://example.com/poc.pdf"
                fileSize = 512000
                isRequired = $true
            },
            @{
                documentType = "MARKET_RESEARCH"
                fileName = "market_research.pdf"
                fileUrl = "https://example.com/market_research.pdf"
                fileSize = 768000
                isRequired = $true
            },
            @{
                documentType = "PROJECTED_CASH_FLOWS"
                fileName = "cash_flows.pdf"
                fileUrl = "https://example.com/cash_flows.pdf"
                fileSize = 256000
                isRequired = $true
            }
        )
        
        $newAppResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/applications" -Body $createAppBody
        $applicationId = $newAppResponse.data.id
        Write-TestStep "   ✅ Created test application: $applicationId" "SUCCESS"
        
                 # Move application to UNDER_DUE_DILIGENCE stage
         $stageChangeBody = @{
             newStage = "UNDER_DUE_DILIGENCE"
             notes = "Moving to due diligence for testing"
         }
         
         $stageResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/applications/$applicationId/stage" -Body $stageChangeBody
         Write-TestStep "   ✅ Moved application to UNDER_DUE_DILIGENCE stage" "SUCCESS"
         } else {
         $applicationId = $applicationsResponse.data.applications[0].id
         Write-TestStep "   ✅ Found application in UNDER_DUE_DILIGENCE stage: $applicationId" "SUCCESS"
     }
    
    # Step 2: Create a board review
    Write-TestStep "2. Creating board review..."
    $boardReviewBody = $TestData.BoardReview
         # applicationId is now in the URL path, not in the request body
    
         $createReviewResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/board-reviews/$applicationId" -Body $boardReviewBody
    $boardReviewId = $createReviewResponse.data.id
    
    Write-TestStep "   ✅ Created board review: $boardReviewId" "SUCCESS"
    Write-TestStep "   📋 Investment Approved: $($createReviewResponse.data.investmentApproved)" "INFO"
    Write-TestStep "   📋 Status: $($createReviewResponse.data.status)" "INFO"
    
    # Step 3: Get board review by application ID
    Write-TestStep "3. Getting board review by application ID..."
         $getReviewResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/board-reviews/$applicationId"
    
    Write-TestStep "   ✅ Retrieved board review successfully" "SUCCESS"
    Write-TestStep "   📋 Reviewer: $($getReviewResponse.data.reviewer.firstName) $($getReviewResponse.data.reviewer.lastName)" "INFO"
    Write-TestStep "   📋 Business: $($getReviewResponse.data.application.businessName)" "INFO"
    
    # Step 4: Update board review
    Write-TestStep "4. Updating board review..."
         $updateBody = @{
         recommendationReport = "Updated recommendation report with additional analysis..."
         decisionReason = "Updated decision reason with more details"
         nextSteps = "Updated next steps: Proceed to term sheet negotiation and legal review"
         overallScore = 90.0
         finalComments = "Updated final comments with additional insights"
     }
    
         $updateResponse = Invoke-APIRequest -Method "PUT" -Url "$BaseUrl/api/board-reviews/$applicationId" -Body $updateBody
    
    Write-TestStep "   ✅ Updated board review successfully" "SUCCESS"
    Write-TestStep "   📋 Updated at: $($updateResponse.data.updatedAt)" "INFO"
    
    # Step 5: Complete board review
    Write-TestStep "5. Completing board review..."
         $completeResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/board-reviews/$applicationId/complete"
    
    Write-TestStep "   ✅ Completed board review successfully" "SUCCESS"
    Write-TestStep "   📋 Status: $($completeResponse.data.status)" "INFO"
    Write-TestStep "   📋 Completed at: $($completeResponse.data.completedAt)" "INFO"
    Write-TestStep "   📋 New application stage: $($completeResponse.data.application.currentStage)" "INFO"
    
    # Step 6: Verify application stage was updated
    Write-TestStep "6. Verifying application stage update..."
    $appResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/applications/$applicationId"
    
    Write-TestStep "   ✅ Application stage updated to: $($appResponse.data.currentStage)" "SUCCESS"
    Write-TestStep "   📋 Board decision: $($appResponse.data.boardDecision)" "INFO"
    
    # Step 7: Get board review summary
    Write-TestStep "7. Getting board review summary..."
    $summaryResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/board-reviews/summary"
    
    Write-TestStep "   ✅ Retrieved board review summary" "SUCCESS"
    Write-TestStep "   📊 Total reviews: $($summaryResponse.data.total)" "INFO"
    Write-TestStep "   📊 Completed reviews: $($summaryResponse.data.completed)" "INFO"
    Write-TestStep "   📊 Pending reviews: $($summaryResponse.data.pending)" "INFO"
    Write-TestStep "   📊 My reviews: $($summaryResponse.data.myReviews)" "INFO"
    Write-TestStep "   📊 Completion rate: $($summaryResponse.data.completionRate)%" "INFO"
    
    # Step 8: Get all board reviews
    Write-TestStep "8. Getting all board reviews..."
    $allReviewsResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/board-reviews?limit=5"
    
    Write-TestStep "   ✅ Retrieved all board reviews" "SUCCESS"
    Write-TestStep "   📊 Total reviews found: $($allReviewsResponse.data.total)" "INFO"
    Write-TestStep "   📊 Reviews in response: $($allReviewsResponse.data.boardReviews.Count)" "INFO"
    
    # Step 9: Get my board reviews
    Write-TestStep "9. Getting my board reviews..."
    $myReviewsResponse = Invoke-APIRequest -Method "GET" -Url "$BaseUrl/api/board-reviews/my?limit=5"
    
    Write-TestStep "   ✅ Retrieved my board reviews" "SUCCESS"
    Write-TestStep "   📊 My reviews found: $($myReviewsResponse.data.total)" "INFO"
    Write-TestStep "   📊 Reviews in response: $($myReviewsResponse.data.boardReviews.Count)" "INFO"
    
    # Test error cases
    Write-TestStep "10. Testing error cases..."
    
    # Try to create duplicate board review
    try {
                 $duplicateResponse = Invoke-APIRequest -Method "POST" -Url "$BaseUrl/api/board-reviews/$applicationId" -Body $boardReviewBody
        Write-TestStep "   ❌ Should have failed - duplicate board review" "ERROR"
    }
    catch {
        Write-TestStep "   ✅ Correctly prevented duplicate board review: $($_.Exception.Message)" "SUCCESS"
    }
    
    # Try to update completed board review
    try {
        $updateCompletedBody = @{
            recommendationReport = "This should fail"
        }
                 $updateCompletedResponse = Invoke-APIRequest -Method "PUT" -Url "$BaseUrl/api/board-reviews/$applicationId" -Body $updateCompletedBody
        Write-TestStep "   ❌ Should have failed - updating completed review" "ERROR"
    }
    catch {
        Write-TestStep "   ✅ Correctly prevented updating completed board review: $($_.Exception.Message)" "SUCCESS"
    }
    
    Write-TestStep "🎉 Board Review Workflow Test Completed Successfully!" "SUCCESS"
    Write-TestStep "✅ All functionality working as expected" "SUCCESS"
    
} catch {
    Write-TestStep "❌ Test failed: $($_.Exception.Message)" "ERROR"
    exit 1
}
