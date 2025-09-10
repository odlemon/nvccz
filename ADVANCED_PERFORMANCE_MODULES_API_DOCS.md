    # Advanced Performance Management Modules - API Documentation

    ## Overview
    This document covers the newly implemented advanced performance management modules that extend the core performance management system. These modules implement the missing user stories for comprehensive deal management, research reporting, risk assessment, budget management, portfolio valuation, and turnover analysis.

    ## Module Categories

    ### 1. Deal Management Module
    **Purpose**: Implements deal sourcing target cascading from CEO → Portfolio Manager → Analysts with progress tracking

    ### 2. Research & Analysis Module  
    **Purpose**: Manages research reports with quarterly targets and detailed activity tracking

    ### 3. Risk Assessment Module
    **Purpose**: Comprehensive risk assessment system with sub-tasks and outcome tracking

    ### 4. Budget Management Module
    **Purpose**: Monthly/quarterly budget management with line items and variance reporting

    ### 5. Portfolio Valuation Module
    **Purpose**: Quarterly portfolio valuation process with step-by-step tracking

    ### 6. HR Analytics Module
    **Purpose**: Exit interview management and turnover analysis

    ---

    ## 1. DEAL MANAGEMENT MODULE

    ### Base URL: `/api/deal-sourcing`

    #### 1.1 Deal Sourcing Goals

    **POST** `/api/deal-sourcing/goals`
    - **Purpose**: Create deal sourcing goals with cascading to sub-goals
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, fund_manager
    - **Request Body**:
    ```json
    {
    "title": "Q1 2025 Deal Sourcing Target",
    "description": "Source 10 deals worth $50M in Q1 2025",
    "type": "company",
    "category": "deal_sourcing",
    "departmentId": "dept_123",
    "targetDeals": 10,
    "targetValue": 50000000,
    "targetSectors": ["fintech", "healthtech"],
    "targetStages": ["seed", "series_a"],
    "startDate": "2025-01-01",
    "endDate": "2025-03-31",
    "assignedToId": "user_456",
    "priority": "high"
    }
    ```

    **GET** `/api/deal-sourcing/goals`
    - **Purpose**: Get all deal sourcing goals with filtering
    - **Auth**: Bearer token required
    - **Query Params**: type, category, departmentId, assignedToId, status, priority
    - **Response**: Array of goals with sub-goals and progress

    **GET** `/api/deal-sourcing/goals/:id`
    - **Purpose**: Get specific deal sourcing goal with full details
    - **Auth**: Bearer token required
    - **Response**: Goal with sub-goals, deal progress, and activities

    **PUT** `/api/deal-sourcing/goals/:id`
    - **Purpose**: Update deal sourcing goal
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, fund_manager
    - **Request Body**: Partial update fields

    **DELETE** `/api/deal-sourcing/goals/:id`
    - **Purpose**: Delete deal sourcing goal
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo

    #### 1.2 Deal Progress Tracking

    **POST** `/api/deal-sourcing/progress`
    - **Purpose**: Create deal progress entry
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, fund_manager
    - **Request Body**:
    ```json
    {
    "dealSourcingGoalId": "goal_123",
    "applicationId": "app_456",
    "dealName": "TechCorp Series A",
    "dealValue": 5000000,
    "sector": "fintech",
    "stage": "due_diligence",
    "currentMilestone": "Financial Review",
    "nextMilestone": "Legal Review",
    "estimatedCompletion": "2025-02-15",
    "assignedToId": "user_789",
    "managerId": "user_101"
    }
    ```

    **GET** `/api/deal-sourcing/progress`
    - **Purpose**: Get all deal progress with filtering
    - **Auth**: Bearer token required
    - **Query Params**: dealSourcingGoalId, assignedToId, managerId, stage, status, sector

    **GET** `/api/deal-sourcing/progress/:id`
    - **Purpose**: Get specific deal progress with updates
    - **Auth**: Bearer token required

    **PUT** `/api/deal-sourcing/progress/:id`
    - **Purpose**: Update deal progress
    - **Auth**: Bearer token required

    **POST** `/api/deal-sourcing/progress/:id/update`
    - **Purpose**: Post progress update/activity
    - **Auth**: Bearer token required
    - **Request Body**:
    ```json
    {
    "updateType": "stage_change",
    "title": "Moved to Term Sheet Stage",
    "description": "Completed due diligence, moving to term sheet negotiation",
    "previousStage": "due_diligence",
    "newStage": "term_sheet",
    "previousValue": 5000000,
    "newValue": 5500000
    }
    ```

    **DELETE** `/api/deal-sourcing/progress/:id`
    - **Purpose**: Delete deal progress
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, fund_manager

    ---

    ## 2. RESEARCH & ANALYSIS MODULE

    ### Base URL: `/api/research-reports`

    **POST** `/api/research-reports`
    - **Purpose**: Create research report assignment
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, fund_manager
    - **Request Body**:
    ```json
    {
    "title": "Fintech Market Analysis Q1 2025",
    "description": "Comprehensive analysis of fintech market trends",
    "reportType": "sector_analysis",
    "sector": "fintech",
    "quarter": "Q1 2025",
    "year": 2025,
    "targetCompletionDate": "2025-03-31",
    "assignedToId": "user_123"
    }
    ```

    **GET** `/api/research-reports`
    - **Purpose**: Get all research reports with filtering
    - **Auth**: Bearer token required
    - **Query Params**: reportType, sector, quarter, year, assignedToId, status, currentPhase

    **GET** `/api/research-reports/:id`
    - **Purpose**: Get specific research report with activities
    - **Auth**: Bearer token required

    **PUT** `/api/research-reports/:id`
    - **Purpose**: Update research report
    - **Auth**: Bearer token required

    **DELETE** `/api/research-reports/:id`
    - **Purpose**: Delete research report
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, fund_manager

    **POST** `/api/research-reports/:id/activities`
    - **Purpose**: Log research activity
    - **Auth**: Bearer token required
    - **Request Body**:
    ```json
    {
    "activityType": "pitch_deck_review",
    "title": "Reviewed 5 Fintech Pitch Decks",
    "description": "Analyzed pitch decks from 5 fintech startups",
    "pitchDeckCount": 5,
    "questionsGenerated": [
        "What is your customer acquisition cost?",
        "How do you handle regulatory compliance?"
    ],
    "researchNotes": "Strong market positioning but concerns about scalability"
    }
    ```

    **GET** `/api/research-reports/:id/activities`
    - **Purpose**: Get research report activities
    - **Auth**: Bearer token required

    **GET** `/api/research-reports/summary/quarterly?quarter=Q1 2025&year=2025`
    - **Purpose**: Get quarterly research summary
    - **Auth**: Bearer token required

    ---

    ## 3. RISK ASSESSMENT MODULE

    ### Base URL: `/api/risk-assessments`

    **POST** `/api/risk-assessments`
    - **Purpose**: Create risk assessment
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, fund_manager
    - **Request Body**:
    ```json
    {
    "title": "TechCorp Investment Risk Assessment",
    "description": "Comprehensive risk assessment for TechCorp Series A investment",
    "assessmentType": "startup_investment",
    "companyName": "TechCorp",
    "dealValue": 5000000,
    "sector": "fintech",
    "stage": "series_a",
    "targetCompletionDate": "2025-02-15",
    "assignedToId": "user_123"
    }
    ```

    **GET** `/api/risk-assessments`
    - **Purpose**: Get all risk assessments with filtering
    - **Auth**: Bearer token required
    - **Query Params**: assessmentType, sector, stage, assignedToId, status, riskLevel

    **GET** `/api/risk-assessments/:id`
    - **Purpose**: Get specific risk assessment with sub-tasks
    - **Auth**: Bearer token required

    **PUT** `/api/risk-assessments/:id`
    - **Purpose**: Update risk assessment with scores
    - **Auth**: Bearer token required
    - **Request Body**:
    ```json
    {
    "burnRateRisk": 6.5,
    "marketViabilityRisk": 4.2,
    "ipLegalRisk": 7.8,
    "founderRisk": 5.1,
    "financialRisk": 6.9,
    "operationalRisk": 5.5,
    "recommendation": "proceed_with_conditions",
    "status": "completed"
    }
    ```

    **DELETE** `/api/risk-assessments/:id`
    - **Purpose**: Delete risk assessment
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, fund_manager

    **POST** `/api/risk-assessments/:id/sub-tasks`
    - **Purpose**: Create risk assessment sub-task
    - **Auth**: Bearer token required
    - **Request Body**:
    ```json
    {
    "category": "burn_rate",
    "title": "Monthly Burn Rate Analysis",
    "description": "Analyze company's monthly burn rate and runway",
    "targetCompletionDate": "2025-02-10"
    }
    ```

    **PUT** `/api/risk-assessments/sub-tasks/:id`
    - **Purpose**: Update risk assessment sub-task
    - **Auth**: Bearer token required
    - **Request Body**:
    ```json
    {
    "status": "completed",
    "progressPercentage": 100,
    "riskScore": 6.5,
    "findings": "High burn rate but sufficient runway for 18 months",
    "recommendations": "Monitor monthly burn rate closely"
    }
    ```

    **GET** `/api/risk-assessments/:id/sub-tasks`
    - **Purpose**: Get risk assessment sub-tasks
    - **Auth**: Bearer token required

    **POST** `/api/risk-assessments/:id/history`
    - **Purpose**: Add risk assessment history entry
    - **Auth**: Bearer token required
    - **Request Body**:
    ```json
    {
    "initialRiskScore": 6.5,
    "actualOutcome": "success",
    "actualImpact": "Investment performed well, 2x return",
    "accuracyRating": 8.5,
    "lessonsLearned": "Market timing was crucial",
    "modelImprovements": "Add market timing factor to risk model"
    }
    ```

    **GET** `/api/risk-assessments/:id/history`
    - **Purpose**: Get risk assessment history
    - **Auth**: Bearer token required

    **GET** `/api/risk-assessments/analytics/summary`
    - **Purpose**: Get risk assessment analytics
    - **Auth**: Bearer token required
    - **Query Params**: assessmentType, sector, timeRange

    ---

    ## 4. BUDGET MANAGEMENT MODULE

    ### Base URL: `/api/budget-management`

    **POST** `/api/budget-management`
    - **Purpose**: Create budget with line items
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, cfo
    - **Request Body**:
    ```json
    {
    "name": "Q1 2025 Budget",
    "description": "Quarterly budget for Q1 2025",
    "budgetType": "quarterly",
    "period": "Q1 2025",
    "startDate": "2025-01-01",
    "endDate": "2025-03-31",
    "budgetItems": [
        {
        "category": "salary",
        "subcategory": "engineering",
        "description": "Engineering team salaries",
        "accountCode": "SAL-ENG",
        "budgetedAmount": 500000
        },
        {
        "category": "software_licenses",
        "description": "Software subscriptions",
        "accountCode": "SW-LIC",
        "budgetedAmount": 50000
        }
    ]
    }
    ```

    **GET** `/api/budget-management`
    - **Purpose**: Get all budgets with filtering
    - **Auth**: Bearer token required
    - **Query Params**: budgetType, period, status, isActive

    **GET** `/api/budget-management/:id`
    - **Purpose**: Get specific budget with items
    - **Auth**: Bearer token required

    **PUT** `/api/budget-management/:id`
    - **Purpose**: Update budget
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, cfo

    **DELETE** `/api/budget-management/:id`
    - **Purpose**: Delete budget
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, cfo

    **POST** `/api/budget-management/:budgetId/items`
    - **Purpose**: Create budget item
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, cfo
    - **Request Body**:
    ```json
    {
    "category": "travel",
    "description": "Business travel expenses",
    "accountCode": "TRV-BUS",
    "budgetedAmount": 25000
    }
    ```

    **GET** `/api/budget-management/:budgetId/items`
    - **Purpose**: Get budget items
    - **Auth**: Bearer token required

    **PUT** `/api/budget-management/items/:id`
    - **Purpose**: Update budget item with actual amounts
    - **Auth**: Bearer token required
    - **Request Body**:
    ```json
    {
    "actualAmount": 52000,
    "varianceExplanation": "Higher than expected due to client meetings"
    }
    ```

    **DELETE** `/api/budget-management/items/:id`
    - **Purpose**: Delete budget item
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, cfo

    **POST** `/api/budget-management/variance-reports`
    - **Purpose**: Create variance report
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, cfo
    - **Request Body**:
    ```json
    {
    "budgetId": "budget_123",
    "reportPeriod": "Q1 2025",
    "significantVariances": [
        {
        "category": "travel",
        "variance": 15000,
        "variancePercentage": 60
        }
    ],
    "explanations": {
        "travel": "Increased client meetings and conferences"
    },
    "actionItems": [
        "Review travel policy",
        "Implement travel approval process"
    ]
    }
    ```

    **GET** `/api/budget-management/variance-reports`
    - **Purpose**: Get variance reports
    - **Auth**: Bearer token required
    - **Query Params**: reportPeriod, status

    **GET** `/api/budget-management/analytics/summary`
    - **Purpose**: Get budget analytics
    - **Auth**: Bearer token required
    - **Query Params**: budgetType, timeRange

    ---

    ## 5. PORTFOLIO VALUATION MODULE

    ### Base URL: `/api/portfolio-valuations`

    **POST** `/api/portfolio-valuations`
    - **Purpose**: Create portfolio valuation process
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, cfo
    - **Request Body**:
    ```json
    {
    "title": "Q1 2025 Portfolio Valuation",
    "description": "Quarterly portfolio valuation process",
    "valuationPeriod": "Q1 2025",
    "quarter": 1,
    "year": 2025,
    "targetCompletionDate": "2025-04-15",
    "assignedToId": "user_123"
    }
    ```

    **GET** `/api/portfolio-valuations`
    - **Purpose**: Get all portfolio valuations with filtering
    - **Auth**: Bearer token required
    - **Query Params**: quarter, year, assignedToId, status, currentStep

    **GET** `/api/portfolio-valuations/:id`
    - **Purpose**: Get specific portfolio valuation with activities
    - **Auth**: Bearer token required

    **PUT** `/api/portfolio-valuations/:id`
    - **Purpose**: Update portfolio valuation
    - **Auth**: Bearer token required
    - **Request Body**:
    ```json
    {
    "totalPortfolioValue": 150000000,
    "previousValue": 140000000,
    "status": "in_progress",
    "currentStep": "financials",
    "capTablesObtained": true,
    "financialsReconciled": false
    }
    ```

    **DELETE** `/api/portfolio-valuations/:id`
    - **Purpose**: Delete portfolio valuation
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, cfo

    **POST** `/api/portfolio-valuations/:id/activities`
    - **Purpose**: Log valuation activity
    - **Auth**: Bearer token required
    - **Request Body**:
    ```json
    {
    "activityType": "cap_table_obtained",
    "title": "Obtained Cap Tables from 15 Companies",
    "description": "Successfully collected cap tables from all portfolio companies",
    "companiesProcessed": 15,
    "reconciliationStatus": {
        "company_1": "completed",
        "company_2": "pending"
    }
    }
    ```

    **GET** `/api/portfolio-valuations/:id/activities`
    - **Purpose**: Get valuation activities
    - **Auth**: Bearer token required

    **GET** `/api/portfolio-valuations/summary/quarterly?quarter=1&year=2025`
    - **Purpose**: Get quarterly valuation summary
    - **Auth**: Bearer token required

    **GET** `/api/portfolio-valuations/analytics/summary`
    - **Purpose**: Get valuation analytics
    - **Auth**: Bearer token required
    - **Query Params**: year, timeRange

    ---

    ## 6. HR ANALYTICS MODULE

    ### Base URL: `/api/exit-interviews`

    **POST** `/api/exit-interviews`
    - **Purpose**: Create exit interview
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, hr_manager
    - **Request Body**:
    ```json
    {
    "employeeName": "John Smith",
    "employeeId": "EMP-123",
    "department": "Engineering",
    "position": "Senior Developer",
    "tenure": "2-3 years",
    "interviewDate": "2025-01-15",
    "interviewType": "voluntary",
    "primaryReason": "Better opportunity",
    "secondaryReasons": ["Career growth", "Compensation"],
    "pushFactors": ["Limited growth opportunities", "Work-life balance"],
    "pullFactors": ["Higher salary", "Better benefits"],
    "workEnvironmentRating": 4.0,
    "managementRating": 3.5,
    "compensationRating": 2.5,
    "growthOpportunityRating": 2.0,
    "wouldRecommendCompany": true,
    "suggestionsForImprovement": "Improve career development programs"
    }
    ```

    **GET** `/api/exit-interviews`
    - **Purpose**: Get all exit interviews with filtering
    - **Auth**: Bearer token required
    - **Query Params**: department, position, tenure, interviewType, primaryReason, status, dateFrom, dateTo

    **GET** `/api/exit-interviews/:id`
    - **Purpose**: Get specific exit interview
    - **Auth**: Bearer token required

    **PUT** `/api/exit-interviews/:id`
    - **Purpose**: Update exit interview
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, hr_manager

    **DELETE** `/api/exit-interviews/:id`
    - **Purpose**: Delete exit interview
    - **Auth**: Bearer token required
    - **Roles**: admin, ceo, hr_manager

    **GET** `/api/exit-interviews/analytics/turnover`
    - **Purpose**: Get turnover analysis
    - **Auth**: Bearer token required
    - **Query Params**: department, dateFrom, dateTo

    **GET** `/api/exit-interviews/analytics/summary`
    - **Purpose**: Get turnover analytics
    - **Auth**: Bearer token required
    - **Query Params**: timeRange

    ---

    ## Testing Notes

    ### Authentication
    All endpoints require Bearer token authentication. Include the token in the Authorization header:
    ```
    Authorization: Bearer <your_jwt_token>
    ```

    ### Role-Based Access
    - **admin**: Full access to all endpoints
    - **ceo**: Access to most endpoints except some delete operations
    - **fund_manager**: Access to deal management and research modules
    - **cfo**: Access to budget and portfolio valuation modules
    - **hr_manager**: Access to exit interview module

    ### Error Responses
    All endpoints return consistent error format:
    ```json
    {
    "success": false,
    "message": "Error description",
    "timestamp": "2025-01-15T10:30:00.000Z"
    }
    ```

    ### Success Responses
    All endpoints return consistent success format:
    ```json
    {
    "success": true,
    "message": "Operation completed successfully",
    "data": { ... }
    }
    ```

    ### Testing Workflow
    1. Start with Deal Sourcing Goals (creates cascading sub-goals)
    2. Create Deal Progress entries for active deals
    3. Set up Research Reports with quarterly targets
    4. Create Risk Assessments with sub-tasks
    5. Set up Budget Management with line items
    6. Create Portfolio Valuations for quarterly processes
    7. Conduct Exit Interviews for turnover analysis

    This comprehensive system now supports all the missing user stories while maintaining integration with the existing performance management workflow.
