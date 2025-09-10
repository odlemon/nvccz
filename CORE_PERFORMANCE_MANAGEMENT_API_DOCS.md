# Core Performance Management System - API Documentation

## Overview
This document covers the core performance management system APIs that form the foundation of the organizational performance management workflow. These modules handle KPIs, departments, performance goals, tasks, activity logs, CEO dashboard, stakeholder management, performance reviews, and automated reporting.

## Module Categories

### 1. KPI Management Module
**Purpose**: Define and manage Key Performance Indicators across the organization

### 2. Department Management Module  
**Purpose**: Organize users into departments for hierarchical goal setting

### 3. Performance Goals Module
**Purpose**: Set and track company, department, and individual performance goals

### 4. Task Management Module
**Purpose**: Create and manage tasks with performance tracking and department rules

### 5. Activity Logging Module
**Purpose**: Log activities related to goals, tasks, and KPIs

### 6. CEO Dashboard Module
**Purpose**: Real-time dashboard with drill-down capabilities and key insights

### 7. Stakeholder Management Module
**Purpose**: Manage stakeholder onboarding, engagement, and retention

### 8. Performance Review Module
**Purpose**: Conduct performance reviews with feedback and scoring

### 9. Automated Reporting Module
**Purpose**: Generate variance reports, turnover analysis, and reconciliation reports

---

## 1. KPI MANAGEMENT MODULE

### Base URL: `/api/kpis`

#### 1.1 KPI CRUD Operations

**POST** `/api/kpis`
- **Purpose**: Create a new KPI
- **Auth**: Bearer token required
- **Roles**: admin, ceo, fund_manager
- **Request Body**:
```json
{
  "name": "Deal Conversion Rate",
  "description": "Percentage of deals that convert from initial contact to closed",
  "type": "Percentage",
  "unit": "%",
  "targetValue": 25.0,
  "currentValue": 18.5,
  "category": "sales",
  "frequency": "monthly",
  "departmentId": "dept_123",
  "weightValue": 0.3,
  "isActive": true
}
```

**GET** `/api/kpis`
- **Purpose**: Get all KPIs with filtering
- **Auth**: Bearer token required
- **Query Params**: type, category, departmentId, isActive, frequency
- **Response**: Array of KPIs with department and related data

**GET** `/api/kpis/:id`
- **Purpose**: Get specific KPI by ID
- **Auth**: Bearer token required
- **Response**: KPI with department and activity logs

**PUT** `/api/kpis/:id`
- **Purpose**: Update KPI
- **Auth**: Bearer token required
- **Roles**: admin, ceo, fund_manager
- **Request Body**: Partial update fields

**DELETE** `/api/kpis/:id`
- **Purpose**: Delete KPI
- **Auth**: Bearer token required
- **Roles**: admin, ceo

#### 1.2 KPI Analytics

**GET** `/api/kpis/analytics/summary`
- **Purpose**: Get KPI analytics and summary
- **Auth**: Bearer token required
- **Query Params**: departmentId, category, timeRange
- **Response**: KPI performance metrics, trends, and insights

---

## 2. DEPARTMENT MANAGEMENT MODULE

### Base URL: `/api/departments`

**POST** `/api/departments`
- **Purpose**: Create a new department
- **Auth**: Bearer token required
- **Roles**: admin, ceo
- **Request Body**:
```json
{
  "name": "Investment Team",
  "description": "Team responsible for deal sourcing and portfolio management",
  "branch": "main_office",
  "isActive": true
}
```

**GET** `/api/departments`
- **Purpose**: Get all departments
- **Auth**: Bearer token required
- **Query Params**: isActive, branch
- **Response**: Array of departments with user counts

**GET** `/api/departments/:id`
- **Purpose**: Get specific department by ID
- **Auth**: Bearer token required
- **Response**: Department with users and performance goals

**PUT** `/api/departments/:id`
- **Purpose**: Update department
- **Auth**: Bearer token required
- **Roles**: admin, ceo
- **Request Body**: Partial update fields

**DELETE** `/api/departments/:id`
- **Purpose**: Delete department
- **Auth**: Bearer token required
- **Roles**: admin, ceo

---

## 3. PERFORMANCE GOALS MODULE

### Base URL: `/api/performance/goals`

**POST** `/api/performance/goals`
- **Purpose**: Create performance goal with hierarchical cascading
- **Auth**: Bearer token required
- **Roles**: admin, ceo, fund_manager
- **Request Body**:
```json
{
  "title": "Increase Portfolio Value by 20%",
  "description": "Achieve 20% growth in portfolio valuation by end of year",
  "type": "company",
  "category": "financial",
  "departmentId": "dept_123",
  "monetaryValue": 10000000,
  "percentValue": 20.0,
  "priority": "high",
  "startDate": "2025-01-01",
  "endDate": "2025-12-31",
  "assignedToId": "user_456"
}
```

**GET** `/api/performance/goals`
- **Purpose**: Get all performance goals with filtering
- **Auth**: Bearer token required
- **Query Params**: type, category, departmentId, assignedToId, status, priority
- **Response**: Array of goals with sub-goals and progress

**GET** `/api/performance/goals/:id`
- **Purpose**: Get specific performance goal with full hierarchy
- **Auth**: Bearer token required
- **Response**: Goal with parent, sub-goals, tasks, and activities

**PUT** `/api/performance/goals/:id`
- **Purpose**: Update performance goal
- **Auth**: Bearer token required
- **Roles**: admin, ceo, fund_manager
- **Request Body**: Partial update fields

**DELETE** `/api/performance/goals/:id`
- **Purpose**: Delete performance goal
- **Auth**: Bearer token required
- **Roles**: admin, ceo

#### 3.1 Goal Progress Tracking

**POST** `/api/performance/goals/:id/progress`
- **Purpose**: Update goal progress
- **Auth**: Bearer token required
- **Request Body**:
```json
{
  "progressPercentage": 65.0,
  "monetaryValueAchieved": 6500000,
  "percentValueAchieved": 13.0,
  "notes": "Strong Q1 performance, ahead of schedule"
}
```

**GET** `/api/performance/goals/:id/progress`
- **Purpose**: Get goal progress history
- **Auth**: Bearer token required
- **Response**: Progress updates with timestamps and details

---

## 4. TASK MANAGEMENT MODULE

### Base URL: `/api/tasks`

**POST** `/api/tasks`
- **Purpose**: Create task with performance integration
- **Auth**: Bearer token required
- **Roles**: admin, ceo, fund_manager
- **Request Body**:
```json
{
  "title": "Complete Due Diligence for TechCorp",
  "description": "Conduct comprehensive due diligence for TechCorp Series A investment",
  "category": "investment",
  "priority": "high",
  "startDate": "2025-01-15",
  "endDate": "2025-02-15",
  "assignedToId": "user_789",
  "team": ["user_101", "user_102"],
  "goalId": "goal_123",
  "performanceCategory": "deal_sourcing",
  "isPerformanceTask": true,
  "monetaryValue": 5000000,
  "percentValue": 10.0,
  "kpi": {
    "type": "Metric",
    "target": 5000000,
    "unit": "USD"
  },
  "ruleset": ">="
}
```

**GET** `/api/tasks`
- **Purpose**: Get all tasks with filtering
- **Auth**: Bearer token required
- **Query Params**: category, priority, assignedToId, goalId, status, stage, isPerformanceTask
- **Response**: Array of tasks with assignees, goals, and progress

**GET** `/api/tasks/:id`
- **Purpose**: Get specific task with full details
- **Auth**: Bearer token required
- **Response**: Task with team, goal, activities, and progress

**PUT** `/api/tasks/:id`
- **Purpose**: Update task
- **Auth**: Bearer token required
- **Request Body**: Partial update fields

**DELETE** `/api/tasks/:id`
- **Purpose**: Delete task
- **Auth**: Bearer token required
- **Roles**: admin, ceo, fund_manager

#### 4.1 Task Stage Management

**PUT** `/api/tasks/:id/stage`
- **Purpose**: Update task stage with overdue detection
- **Auth**: Bearer token required
- **Request Body**:
```json
{
  "stage": "in_progress",
  "notes": "Started due diligence process"
}
```

#### 4.2 Task Activity Logging

**POST** `/api/tasks/:id/activity`
- **Purpose**: Log task activity with KPI tracking
- **Auth**: Bearer token required
- **Request Body**:
```json
{
  "activityType": "progress_update",
  "title": "Completed Financial Review",
  "description": "Finished financial due diligence for TechCorp",
  "monetaryValueAchieved": 1000000,
  "percentValueAchieved": 2.0,
  "notes": "Financials look strong, moving to next phase"
}
```

**GET** `/api/tasks/:id/activities`
- **Purpose**: Get task activity history
- **Auth**: Bearer token required
- **Response**: Array of activities with timestamps and details

---

## 5. ACTIVITY LOGGING MODULE

### Base URL: `/api/activity-logs`

**POST** `/api/activity-logs`
- **Purpose**: Create activity log entry
- **Auth**: Bearer token required
- **Request Body**:
```json
{
  "activityType": "goal_update",
  "title": "Updated Q1 Portfolio Goal",
  "description": "Increased target from 15% to 20% based on market conditions",
  "goalId": "goal_123",
  "taskId": "task_456",
  "kpiId": "kpi_789",
  "metadata": {
    "previousValue": 15.0,
    "newValue": 20.0,
    "reason": "market_conditions"
  }
}
```

**GET** `/api/activity-logs`
- **Purpose**: Get all activity logs with filtering
- **Auth**: Bearer token required
- **Query Params**: activityType, goalId, taskId, kpiId, userId, dateFrom, dateTo
- **Response**: Array of activity logs with related entities

**GET** `/api/activity-logs/:id`
- **Purpose**: Get specific activity log
- **Auth**: Bearer token required
- **Response**: Activity log with full details and relations

**PUT** `/api/activity-logs/:id`
- **Purpose**: Update activity log
- **Auth**: Bearer token required
- **Request Body**: Partial update fields

**DELETE** `/api/activity-logs/:id`
- **Purpose**: Delete activity log
- **Auth**: Bearer token required
- **Roles**: admin, ceo

---

## 6. CEO DASHBOARD MODULE

### Base URL: `/api/ceo-dashboard`

**GET** `/api/ceo-dashboard`
- **Purpose**: Get comprehensive CEO dashboard data
- **Auth**: Bearer token required
- **Roles**: admin, ceo
- **Response**: Complete dashboard with all metrics and insights

**GET** `/api/ceo-dashboard/drill-down/:entityType/:entityId`
- **Purpose**: Drill down into specific entity details
- **Auth**: Bearer token required
- **Roles**: admin, ceo
- **Entity Types**: fund, portfolio, pipeline, department, task
- **Response**: Detailed entity information with related data

**GET** `/api/ceo-dashboard/fund-performance/:fundId`
- **Purpose**: Get specific fund performance metrics
- **Auth**: Bearer token required
- **Response**: Fund performance with IRR, TVPI, DPI, AUM

**GET** `/api/ceo-dashboard/funds-performance`
- **Purpose**: Get all funds performance comparison
- **Auth**: Bearer token required
- **Response**: Comparative fund performance data

**GET** `/api/ceo-dashboard/pipeline-analytics`
- **Purpose**: Get investment pipeline analytics
- **Auth**: Bearer token required
- **Response**: Pipeline metrics, conversion rates, time-to-close

**GET** `/api/ceo-dashboard/portfolio-health`
- **Purpose**: Get portfolio health metrics
- **Auth**: Bearer token required
- **Response**: Portfolio valuation, sector breakdown, top/bottom performers

**GET** `/api/ceo-dashboard/operational-metrics`
- **Purpose**: Get operational metrics
- **Auth**: Bearer token required
- **Response**: Expenses, budget variance, headcount, task summary

**GET** `/api/ceo-dashboard/hierarchical-tasks`
- **Purpose**: Get hierarchical task view
- **Auth**: Bearer token required
- **Response**: Tasks organized by hierarchy with progress

**GET** `/api/ceo-dashboard/key-insights`
- **Purpose**: Get AI-generated key insights
- **Auth**: Bearer token required
- **Response**: Key insights and recommendations

**GET** `/api/ceo-dashboard/real-time-metrics`
- **Purpose**: Get real-time metrics
- **Auth**: Bearer token required
- **Response**: Live metrics and alerts

**GET** `/api/ceo-dashboard/advanced-deal-metrics`
- **Purpose**: Get advanced deal metrics
- **Auth**: Bearer token required
- **Response**: Manager-specific deal tracking and analytics

---

## 7. STAKEHOLDER MANAGEMENT MODULE

### Base URL: `/api/stakeholders`

#### 7.1 Stakeholder CRUD

**POST** `/api/stakeholders`
- **Purpose**: Create new stakeholder
- **Auth**: Bearer token required
- **Roles**: admin, ceo, fund_manager
- **Request Body**:
```json
{
  "name": "ABC Pension Fund",
  "type": "institutional",
  "email": "contact@abcpension.com",
  "phone": "+1-555-0123",
  "address": "123 Financial District, New York, NY",
  "investmentAmount": 50000000,
  "relationshipManagerId": "user_123",
  "status": "active",
  "notes": "Long-term institutional investor"
}
```

**GET** `/api/stakeholders`
- **Purpose**: Get all stakeholders with filtering
- **Auth**: Bearer token required
- **Query Params**: type, status, relationshipManagerId
- **Response**: Array of stakeholders with engagement data

**GET** `/api/stakeholders/:id`
- **Purpose**: Get specific stakeholder
- **Auth**: Bearer token required
- **Response**: Stakeholder with onboarding and engagement history

**PUT** `/api/stakeholders/:id`
- **Purpose**: Update stakeholder
- **Auth**: Bearer token required
- **Roles**: admin, ceo, fund_manager
- **Request Body**: Partial update fields

**DELETE** `/api/stakeholders/:id`
- **Purpose**: Delete stakeholder
- **Auth**: Bearer token required
- **Roles**: admin, ceo

#### 7.2 Stakeholder Onboarding

**POST** `/api/stakeholders/:id/onboarding`
- **Purpose**: Initiate stakeholder onboarding
- **Auth**: Bearer token required
- **Roles**: admin, ceo, fund_manager
- **Request Body**:
```json
{
  "onboardingType": "new_investor",
  "assignedToId": "user_456",
  "targetCompletionDate": "2025-02-15",
  "requirements": ["KYC", "AML", "Investment Agreement"],
  "notes": "High priority onboarding"
}
```

**GET** `/api/stakeholders/:id/onboarding`
- **Purpose**: Get stakeholder onboarding status
- **Auth**: Bearer token required
- **Response**: Onboarding progress and requirements

**PUT** `/api/stakeholders/onboarding/:id`
- **Purpose**: Update onboarding progress
- **Auth**: Bearer token required
- **Request Body**:
```json
{
  "status": "in_progress",
  "completedRequirements": ["KYC", "AML"],
  "notes": "Investment agreement pending legal review"
}
```

#### 7.3 Stakeholder Engagement

**POST** `/api/stakeholders/:id/engagement`
- **Purpose**: Log stakeholder engagement
- **Auth**: Bearer token required
- **Request Body**:
```json
{
  "engagementType": "quarterly_call",
  "title": "Q1 2025 Performance Review",
  "description": "Quarterly performance review call with portfolio updates",
  "scheduledDate": "2025-04-15",
  "duration": 60,
  "participants": ["user_123", "user_456"],
  "notes": "Positive feedback on portfolio performance"
}
```

**GET** `/api/stakeholders/:id/engagement`
- **Purpose**: Get stakeholder engagement history
- **Auth**: Bearer token required
- **Response**: Array of engagement activities

---

## 8. PERFORMANCE REVIEW MODULE

### Base URL: `/api/performance-reviews`

#### 8.1 Performance Review CRUD

**POST** `/api/performance-reviews`
- **Purpose**: Create performance review
- **Auth**: Bearer token required
- **Roles**: admin, ceo, hr_manager
- **Request Body**:
```json
{
  "revieweeId": "user_123",
  "reviewerId": "user_456",
  "reviewPeriod": "Q1 2025",
  "reviewType": "quarterly",
  "reviewDate": "2025-04-01",
  "goals": [
    {
      "goalId": "goal_123",
      "achievement": 85.0,
      "comments": "Exceeded expectations"
    }
  ],
  "criteria": {
    "technical_skills": 4.5,
    "communication": 4.0,
    "leadership": 3.5,
    "teamwork": 4.2
  },
  "overallScore": 4.1,
  "strengths": ["Strong technical skills", "Good communication"],
  "areasForImprovement": ["Leadership development"],
  "developmentPlan": "Attend leadership training program"
}
```

**GET** `/api/performance-reviews`
- **Purpose**: Get all performance reviews with filtering
- **Auth**: Bearer token required
- **Query Params**: revieweeId, reviewerId, reviewPeriod, reviewType, status
- **Response**: Array of performance reviews with feedback

**GET** `/api/performance-reviews/:id`
- **Purpose**: Get specific performance review
- **Auth**: Bearer token required
- **Response**: Performance review with feedback and goals

**PUT** `/api/performance-reviews/:id`
- **Purpose**: Update performance review
- **Auth**: Bearer token required
- **Roles**: admin, ceo, hr_manager
- **Request Body**: Partial update fields

**DELETE** `/api/performance-reviews/:id`
- **Purpose**: Delete performance review
- **Auth**: Bearer token required
- **Roles**: admin, ceo

#### 8.2 Performance Review Feedback

**POST** `/api/performance-reviews/:id/feedback`
- **Purpose**: Add feedback to performance review
- **Auth**: Bearer token required
- **Request Body**:
```json
{
  "feedbackProviderId": "user_789",
  "feedbackType": "peer",
  "rating": 4.0,
  "comments": "Great team player, always helpful",
  "suggestions": "Could take more initiative on projects"
}
```

**GET** `/api/performance-reviews/:id/feedback`
- **Purpose**: Get performance review feedback
- **Auth**: Bearer token required
- **Response**: Array of feedback entries

---

## 9. AUTOMATED REPORTING MODULE

### Base URL: `/api/automated-reporting`

#### 9.1 Report Templates

**POST** `/api/automated-reporting/templates`
- **Purpose**: Create report template
- **Auth**: Bearer token required
- **Roles**: admin, ceo, cfo
- **Request Body**:
```json
{
  "name": "Monthly Variance Report",
  "description": "Monthly budget variance analysis report",
  "reportType": "variance",
  "frequency": "monthly",
  "template": {
    "sections": ["executive_summary", "variance_analysis", "recommendations"],
    "filters": ["department", "category", "variance_threshold"]
  },
  "isActive": true
}
```

**GET** `/api/automated-reporting/templates`
- **Purpose**: Get all report templates
- **Auth**: Bearer token required
- **Query Params**: reportType, frequency, isActive
- **Response**: Array of report templates

**GET** `/api/automated-reporting/templates/:id`
- **Purpose**: Get specific report template
- **Auth**: Bearer token required
- **Response**: Report template with configuration

**PUT** `/api/automated-reporting/templates/:id`
- **Purpose**: Update report template
- **Auth**: Bearer token required
- **Roles**: admin, ceo, cfo
- **Request Body**: Partial update fields

**DELETE** `/api/automated-reporting/templates/:id`
- **Purpose**: Delete report template
- **Auth**: Bearer token required
- **Roles**: admin, ceo

#### 9.2 Generated Reports

**POST** `/api/automated-reporting/generate`
- **Purpose**: Generate report from template
- **Auth**: Bearer token required
- **Roles**: admin, ceo, cfo
- **Request Body**:
```json
{
  "templateId": "template_123",
  "reportPeriod": "2025-01",
  "filters": {
    "department": "engineering",
    "variance_threshold": 5.0
  },
  "format": "pdf"
}
```

**GET** `/api/automated-reporting/reports`
- **Purpose**: Get all generated reports
- **Auth**: Bearer token required
- **Query Params**: templateId, reportPeriod, status, format
- **Response**: Array of generated reports

**GET** `/api/automated-reporting/reports/:id`
- **Purpose**: Get specific generated report
- **Auth**: Bearer token required
- **Response**: Report with data and download link

#### 9.3 Variance Reports

**POST** `/api/automated-reporting/variance-reports`
- **Purpose**: Create variance report
- **Auth**: Bearer token required
- **Roles**: admin, ceo, cfo
- **Request Body**:
```json
{
  "reportPeriod": "Q1 2025",
  "reportType": "budget_variance",
  "status": "draft",
  "actualExpenses": 1200000,
  "budgetedExpenses": 1000000,
  "variance": 200000,
  "variancePercentage": 20.0,
  "significantVariances": [
    {
      "category": "travel",
      "variance": 50000,
      "variancePercentage": 25.0
    }
  ],
  "explanations": {
    "travel": "Increased client meetings and conferences"
  },
  "actionItems": [
    "Review travel policy",
    "Implement approval process"
  ],
  "preparedBy": "user_123"
}
```

**GET** `/api/automated-reporting/variance-reports`
- **Purpose**: Get all variance reports
- **Auth**: Bearer token required
- **Query Params**: reportPeriod, status, preparedBy
- **Response**: Array of variance reports

#### 9.4 Turnover Analysis Reports

**POST** `/api/automated-reporting/turnover-reports`
- **Purpose**: Create turnover analysis report
- **Auth**: Bearer token required
- **Roles**: admin, ceo, hr_manager
- **Request Body**:
```json
{
  "reportPeriod": "Q1 2025",
  "status": "draft",
  "totalEmployees": 150,
  "employeesLeft": 12,
  "turnoverRate": 8.0,
  "voluntaryTurnover": 8,
  "involuntaryTurnover": 4,
  "departmentBreakdown": {
    "engineering": 5,
    "sales": 3,
    "marketing": 2,
    "operations": 2
  },
  "roleBreakdown": {
    "senior": 4,
    "mid": 6,
    "junior": 2
  },
  "tenureBreakdown": {
    "0-1 years": 6,
    "1-3 years": 4,
    "3-5 years": 2
  },
  "exitInterviewData": {
    "common_reasons": ["better_opportunity", "compensation", "work_life_balance"],
    "average_ratings": {
      "work_environment": 3.8,
      "management": 3.5,
      "compensation": 3.2
    }
  },
  "commonReasons": {
    "better_opportunity": 5,
    "compensation": 3,
    "work_life_balance": 2
  },
  "retentionRecommendations": [
    "Improve compensation packages",
    "Enhance work-life balance policies",
    "Provide better career development opportunities"
  ],
  "preparedBy": "user_456"
}
```

**GET** `/api/automated-reporting/turnover-reports`
- **Purpose**: Get all turnover analysis reports
- **Auth**: Bearer token required
- **Query Params**: reportPeriod, status, preparedBy
- **Response**: Array of turnover analysis reports

---

## Testing Notes

### Authentication
All endpoints require Bearer token authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

### Role-Based Access
- **admin**: Full access to all endpoints
- **ceo**: Access to most endpoints with some restrictions on delete operations
- **fund_manager**: Access to performance goals, tasks, and stakeholder management
- **hr_manager**: Access to performance reviews and turnover reports
- **cfo**: Access to automated reporting and variance reports

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
1. Start with KPI creation to define performance metrics
2. Create departments to organize users
3. Set up performance goals with hierarchical cascading
4. Create tasks linked to goals and KPIs
5. Log activities to track progress
6. Use CEO dashboard for real-time monitoring
7. Manage stakeholders and their engagement
8. Conduct performance reviews
9. Generate automated reports for analysis

### Key Features
- **Hierarchical Goal Cascading**: Company goals automatically create department and individual sub-goals
- **Department Boundary Rules**: Non-admin users can only assign tasks within their department
- **KPI Integration**: Tasks can be linked to KPIs for automatic progress tracking
- **Real-time Dashboard**: CEO dashboard provides comprehensive real-time insights
- **Automated Reporting**: Generate variance and turnover reports automatically
- **Activity Logging**: Complete audit trail of all activities and changes

This core performance management system provides the foundation for organizational performance tracking and management, with full integration between all modules.
