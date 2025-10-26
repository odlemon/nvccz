# 🎯 **PERFORMANCE MODULE USER STORY FLOW**

## 📊 **COMPLETE USER JOURNEY WITH API INTERACTIONS**

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    🎯 PERFORMANCE MODULE USER STORY FLOW                        │
│                           From Goal Setting to Performance Review               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## **👑 STAGE 1: EXECUTIVE GOAL SETTING**

### **User Story:** *"As an Executive, I want to set strategic organizational goals so that the company has clear direction and measurable objectives."*

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           🏢 EXECUTIVE DASHBOARD                                │
│                                                                                 │
│  Executive logs in and creates strategic organizational goals                   │
│  Goals cascade down to departments and individuals                             │
│                                                                                 │
│  📊 Available Departments: Finance, Sales, Operations, Procurement,             │
│     Human Resources, Marketing, Legal, IT                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### **API Request: Create Organizational Goal**
```http
POST /api/performance/goals
Authorization: Bearer {executive_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Achieve $5M Fund I AUM by Q4",
  "description": "Grow Fund I Assets Under Management to $5,000,000 by end of Q4",
  "type": "company",
  "category": "financial",
  "targetValue": 5000000,
  "targetUnit": "USD",
  "currentValue": 0,
  "priority": "high",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "targetOperator": ">=",
  "dataSourceModule": "Accounting",
  "dataSourceField": "BalanceSheet.TotalAssets",
  "trackingFrequency": "Monthly"
}
```

**Response Body:**
```json
{
  "success": true,
  "message": "Organizational goal created successfully",
  "data": {
    "id": "goal_001",
    "title": "Achieve $5M Fund I AUM by Q4",
    "type": "company",
    "category": "financial",
    "targetValue": 5000000,
    "currentValue": 0,
    "progressPercentage": 0,
    "status": "active",
    "stage": "planning",
    "nextCheckDate": "2024-02-01T00:00:00.000Z",
    "createdAt": "2024-01-01T10:00:00.000Z"
  }
}
```

---

## **🏢 STAGE 2: DEPARTMENTAL GOAL BREAKDOWN**

### **User Story:** *"As a Department Manager, I want to break down organizational goals into departmental objectives so that my team has clear targets aligned with company strategy."*

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        🏢 DEPARTMENT MANAGER DASHBOARD                         │
│                                                                                 │
│  Department Manager sees organizational goals and creates breakdown             │
│  Selects specific departments and sets custom targets                          │
│  Goals are assigned to department teams                                        │
│                                                                                 │
│  📊 Available Departments: Finance, Sales, Operations, Procurement,             │
│     Human Resources, Marketing, Legal, IT                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### **API Request: Create Department Breakdown**
```http
POST /api/performance/breakdown/departments
Authorization: Bearer {manager_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "parentGoalId": "goal_001",
  "selectedDepartments": ["Finance", "Sales", "Operations"],
  "breakdownData": [
    {
      "departmentName": "Finance",
      "title": "Finance: Achieve $2M AUM Growth",
      "description": "Finance department responsible for $2M of the $5M AUM target",
      "targetValue": 2000000,
      "targetUnit": "USD",
      "priority": "high",
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "targetOperator": ">=",
      "dataSourceModule": "Accounting",
      "dataSourceField": "BalanceSheet.TotalAssets",
      "trackingFrequency": "Monthly"
    },
    {
      "departmentName": "Sales",
      "title": "Sales: Acquire 50 New Clients",
      "description": "Sales department to acquire 50 new clients contributing to AUM",
      "targetValue": 50,
      "targetUnit": "clients",
      "priority": "high",
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "targetOperator": ">=",
      "dataSourceModule": "TaskManagement",
      "dataSourceField": "ClientAcquisitionRate",
      "trackingFrequency": "Weekly"
    },
    {
      "departmentName": "Operations",
      "title": "Operations: Support $1M AUM Growth",
      "description": "Operations department to support $1M AUM growth through efficiency",
      "targetValue": 1000000,
      "targetUnit": "USD",
      "priority": "medium",
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "targetOperator": ">=",
      "dataSourceModule": "Accounting",
      "dataSourceField": "BalanceSheet.TotalAssets",
      "trackingFrequency": "Monthly"
    }
  ]
}
```

**Response Body:**
```json
{
  "success": true,
  "message": "Department goals created successfully",
  "data": {
    "parentGoalId": "goal_001",
    "createdGoals": [
      {
        "id": "goal_002",
        "title": "Finance: Achieve $2M AUM Growth",
        "type": "department",
        "departmentName": "Finance",
        "targetValue": 2000000,
        "status": "active"
      },
      {
        "id": "goal_003", 
        "title": "Sales: Acquire 50 New Clients",
        "type": "department",
        "departmentName": "Sales",
        "targetValue": 50,
        "status": "active"
      },
      {
        "id": "goal_004",
        "title": "Operations: Support $1M AUM Growth", 
        "type": "department",
        "departmentName": "Operations",
        "targetValue": 1000000,
        "status": "active"
      }
    ]
  }
}
```

---

## **👥 STAGE 3: INDIVIDUAL GOAL ASSIGNMENT**

### **User Story:** *"As a Department Manager, I want to assign departmental goals to specific team members so that everyone has clear individual responsibilities."*

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        👥 TEAM MEMBER ASSIGNMENT                                │
│                                                                                 │
│  Department Manager assigns goals to specific team members                     │
│  Each team member gets personalized targets based on their role                │
│  Goals are converted into actionable tasks                                     │
│                                                                                 │
│  👤 Available Team Members: Finance Manager, Sales Rep, Operations Coordinator  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### **API Request: Create Individual Goals**
```http
POST /api/performance/breakdown/individuals
Authorization: Bearer {manager_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "departmentGoalId": "goal_002",
  "selectedUsers": ["user_001", "user_002"],
  "individualData": [
    {
      "userId": "user_001",
      "title": "Finance Manager: Process $2M in AUM Transactions",
      "description": "Finance Manager responsible for processing $2M in AUM transactions",
      "targetValue": 2000000,
      "targetUnit": "USD",
      "priority": "high",
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "targetOperator": ">=",
      "dataSourceModule": "Accounting",
      "dataSourceField": "BalanceSheet.TotalAssets",
      "trackingFrequency": "Monthly"
    },
    {
      "userId": "user_002",
      "title": "Finance Officer: Complete 100 AUM Reports",
      "description": "Finance Officer to complete 100 AUM reports supporting the target",
      "targetValue": 100,
      "targetUnit": "reports",
      "priority": "medium",
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "targetOperator": ">=",
      "dataSourceModule": "TaskManagement",
      "dataSourceField": "TaskCompletionRate",
      "trackingFrequency": "Weekly"
    }
  ]
}
```

**Response Body:**
```json
{
  "success": true,
  "message": "Individual goals created successfully",
  "data": {
    "departmentGoalId": "goal_002",
    "createdGoals": [
      {
        "id": "goal_005",
        "title": "Finance Manager: Process $2M in AUM Transactions",
        "type": "individual",
        "assignedUserId": "user_001",
        "targetValue": 2000000,
        "status": "active"
      },
      {
        "id": "goal_006",
        "title": "Finance Officer: Complete 100 AUM Reports", 
        "type": "individual",
        "assignedUserId": "user_002",
        "targetValue": 100,
        "status": "active"
      }
    ]
  }
}
```

---

## **📋 STAGE 4: GOAL TO TASK CONVERSION**

### **User Story:** *"As a Team Member, I want my performance goals converted into actionable tasks so that I know exactly what work to do."*

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        📋 TASK CONVERSION AUTOMATION                            │
│                                                                                 │
│  System automatically converts individual goals into tasks                      │
│  Tasks are linked to goals and include performance metrics                      │
│  Team members can see their tasks in their dashboard                           │
│                                                                                 │
│  🔄 Automatic Process: Goal → Task → Progress Tracking                          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### **API Request: Convert Goals to Tasks**
```http
POST /api/performance/individual-goals/{goalId}/convert-to-tasks
Authorization: Bearer {user_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "individualGoalId": "goal_005"
}
```

**Response Body:**
```json
{
  "success": true,
  "message": "Goal converted to tasks successfully",
  "data": {
    "goalId": "goal_005",
    "createdTasks": [
      {
        "id": "task_001",
        "title": "Process AUM Transaction Batch 1",
        "description": "Process first batch of $500K AUM transactions",
        "assignedUserId": "user_001",
        "goalId": "goal_005",
        "isPerformanceTask": true,
        "status": "pending",
        "priority": "high",
        "dueDate": "2024-01-15T00:00:00.000Z"
      },
      {
        "id": "task_002",
        "title": "Process AUM Transaction Batch 2", 
        "description": "Process second batch of $500K AUM transactions",
        "assignedUserId": "user_001",
        "goalId": "goal_005",
        "isPerformanceTask": true,
        "status": "pending",
        "priority": "high",
        "dueDate": "2024-01-30T00:00:00.000Z"
      }
    ]
  }
}
```

---

## **📊 STAGE 5: PROGRESS TRACKING & UPDATES**

### **User Story:** *"As a Team Member, I want to update my task progress so that my manager and the system can track my performance against goals."*

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        📊 TEAM MEMBER DASHBOARD                                 │
│                                                                                 │
│  Team Member sees their tasks and updates progress                             │
│  System automatically updates linked goal progress                            │
│  Real-time progress tracking across all levels                                │
│                                                                                 │
│  📈 Progress Updates: Task → Goal → Department → Organization                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### **API Request: Update Task Progress**
```http
PUT /api/tasks/{taskId}
Authorization: Bearer {user_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "in_progress",
  "progress": 50,
  "notes": "Completed first half of AUM transaction processing"
}
```

**Response Body:**
```json
{
  "success": true,
  "message": "Task updated successfully",
  "data": {
    "taskId": "task_001",
    "status": "in_progress",
    "progress": 50,
    "updatedAt": "2024-01-10T14:30:00.000Z",
    "linkedGoalUpdated": true,
    "goalProgress": {
      "goalId": "goal_005",
      "currentValue": 250000,
      "progressPercentage": 12.5,
      "status": "active"
    }
  }
}
```

### **API Request: Complete Task**
```http
PUT /api/tasks/{taskId}
Authorization: Bearer {user_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "status": "completed",
  "progress": 100,
  "notes": "Successfully completed AUM transaction processing"
}
```

**Response Body:**
```json
{
  "success": true,
  "message": "Task completed successfully",
  "data": {
    "taskId": "task_001",
    "status": "completed",
    "progress": 100,
    "completedAt": "2024-01-15T16:00:00.000Z",
    "linkedGoalUpdated": true,
    "goalProgress": {
      "goalId": "goal_005",
      "currentValue": 500000,
      "progressPercentage": 25,
      "status": "active"
    },
    "accountingIntegration": {
      "journalEntryCreated": true,
      "journalEntryId": "je_001",
      "amount": 500000,
      "account": "AUM Transactions"
    }
  }
}
```

---

## **💰 STAGE 6: ACCOUNTING INTEGRATION**

### **User Story:** *"As a Finance Manager, I want financial KPIs to automatically generate journal entries so that our accounting records reflect performance achievements."*

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        💰 AUTOMATIC ACCOUNTING INTEGRATION                      │
│                                                                                 │
│  When financial KPIs are achieved, system creates journal entries              │
│  Real-time financial impact tracking                                           │
│  Department-specific account mappings                                           │
│                                                                                 │
│  🔄 KPI Achievement → Journal Entry → Financial Impact                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### **API Request: Check KPI Accounting Integration**
```http
GET /api/performance/goal-tracking/{goalId}/accounting-impact
Authorization: Bearer {finance_token}
Content-Type: application/json
```

**Response Body:**
```json
{
  "success": true,
  "message": "Accounting impact retrieved successfully",
  "data": {
    "goalId": "goal_005",
    "kpiInfo": {
      "name": "AUM Growth",
      "accountNumber": "1000",
      "accountType": "Asset",
      "journalEntryType": "Debit"
    },
    "journalEntries": [
      {
        "id": "je_001",
        "referenceNumber": "JE-2024-001",
        "description": "AUM Growth Achievement - $500,000",
        "totalAmount": 500000,
        "status": "POSTED",
        "createdAt": "2024-01-15T16:00:00.000Z",
        "lines": [
          {
            "accountNo": "1000",
            "accountName": "Cash and Cash Equivalents",
            "debitAmount": 500000,
            "creditAmount": 0
          },
          {
            "accountNo": "4000", 
            "accountName": "Management Fees Income",
            "debitAmount": 0,
            "creditAmount": 500000
          }
        ]
      }
    ]
  }
}
```

---

## **📈 STAGE 7: PERFORMANCE SCORECARDS**

### **User Story:** *"As a Manager, I want to see performance scorecards for my team so that I can track progress and provide feedback."*

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        📈 PERFORMANCE SCORECARDS                                │
│                                                                                 │
│  Managers view team performance dashboards                                     │
│  Real-time progress tracking across all levels                                 │
│  Department and individual scorecards available                                │
│                                                                                 │
│  📊 Scorecards: Individual → Department → Organization                         │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### **API Request: Get Department Scorecard**
```http
GET /api/performance/scorecards/departments/{departmentName}
Authorization: Bearer {manager_token}
Content-Type: application/json
```

**Response Body:**
```json
{
  "success": true,
  "message": "Department scorecard retrieved successfully",
  "data": {
    "departmentName": "Finance",
    "scorecard": {
      "totalGoals": 3,
      "completedGoals": 1,
      "inProgressGoals": 2,
      "overdueGoals": 0,
      "averageProgress": 45.5,
      "performanceRating": "Good",
      "goals": [
        {
          "id": "goal_002",
          "title": "Finance: Achieve $2M AUM Growth",
          "targetValue": 2000000,
          "currentValue": 500000,
          "progressPercentage": 25,
          "status": "active",
          "stage": "execution"
        },
        {
          "id": "goal_007",
          "title": "Finance: Reduce Processing Time",
          "targetValue": 48,
          "currentValue": 35,
          "progressPercentage": 73,
          "status": "active", 
          "stage": "execution"
        }
      ],
      "teamMembers": [
        {
          "userId": "user_001",
          "name": "Finance Manager",
          "totalTasks": 5,
          "completedTasks": 2,
          "inProgressTasks": 3,
          "performanceRating": "Good"
        }
      ]
    }
  }
}
```

### **API Request: Get Individual Scorecard**
```http
GET /api/performance/scorecards/users/{userId}
Authorization: Bearer {user_token}
Content-Type: application/json
```

**Response Body:**
```json
{
  "success": true,
  "message": "User scorecard retrieved successfully",
  "data": {
    "userId": "user_001",
    "userName": "Finance Manager",
    "department": "Finance",
    "scorecard": {
      "totalGoals": 2,
      "completedGoals": 0,
      "inProgressGoals": 2,
      "overdueGoals": 0,
      "averageProgress": 45.5,
      "performanceRating": "Good",
      "goals": [
        {
          "id": "goal_005",
          "title": "Finance Manager: Process $2M in AUM Transactions",
          "targetValue": 2000000,
          "currentValue": 500000,
          "progressPercentage": 25,
          "status": "active"
        }
      ],
      "tasks": [
        {
          "id": "task_001",
          "title": "Process AUM Transaction Batch 1",
          "status": "completed",
          "progress": 100,
          "completedAt": "2024-01-15T16:00:00.000Z"
        },
        {
          "id": "task_002",
          "title": "Process AUM Transaction Batch 2",
          "status": "in_progress",
          "progress": 0,
          "dueDate": "2024-01-30T00:00:00.000Z"
        }
      ]
    }
  }
}
```

---

## **🔄 STAGE 8: PERFORMANCE REVIEW CYCLE**

### **User Story:** *"As a Manager, I want to conduct performance reviews so that I can provide feedback and plan for the next period."*

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        🔄 PERFORMANCE REVIEW CYCLE                              │
│                                                                                 │
│  Managers create review cycles and conduct performance reviews                 │
│  Multi-stage review process with deadlines                                     │
│  Digital sign-off and action planning                                           │
│                                                                                 │
│  📋 Review Process: Self → Peer → Manager → Sign-off                           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### **API Request: Create Review Cycle**
```http
POST /api/performance/review-cycles
Authorization: Bearer {manager_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "Q1 2024 Performance Review Cycle",
  "reviewPeriodStart": "2024-01-01",
  "reviewPeriodEnd": "2024-03-31",
  "selfAssessmentDeadline": "2024-04-05",
  "peerReviewDeadline": "2024-04-10",
  "managerReviewDeadline": "2024-04-15"
}
```

**Response Body:**
```json
{
  "success": true,
  "message": "Review cycle created successfully",
  "data": {
    "id": "cycle_001",
    "title": "Q1 2024 Performance Review Cycle",
    "reviewPeriodStart": "2024-01-01",
    "reviewPeriodEnd": "2024-03-31",
    "selfAssessmentDeadline": "2024-04-05",
    "peerReviewDeadline": "2024-04-10",
    "managerReviewDeadline": "2024-04-15",
    "status": "active",
    "createdAt": "2024-01-01T10:00:00.000Z"
  }
}
```

### **API Request: Create Performance Review**
```http
POST /api/performance/reviews
Authorization: Bearer {manager_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "cycleId": "cycle_001",
  "revieweeId": "user_001",
  "reviewerId": "manager_001",
  "reviewType": "MANAGER"
}
```

**Response Body:**
```json
{
  "success": true,
  "message": "Performance review created successfully",
  "data": {
    "id": "review_001",
    "cycleId": "cycle_001",
    "revieweeId": "user_001",
    "reviewerId": "manager_001",
    "reviewType": "MANAGER",
    "status": "PENDING",
    "createdAt": "2024-01-01T10:00:00.000Z"
  }
}
```

---

## **📊 STAGE 9: ETL PIPELINE & DATA SYNCHRONIZATION**

### **User Story:** *"As a System Administrator, I want the system to automatically sync data across modules so that performance metrics are always up-to-date."*

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        📊 ETL PIPELINE & DATA SYNC                              │
│                                                                                 │
│  System automatically extracts data from all modules                           │
│  Transforms and loads data into performance metrics                            │
│  Real-time goal status updates based on latest data                           │
│                                                                                 │
│  🔄 ETL Process: Extract → Transform → Load → Update Goals                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### **API Request: Run ETL Pipeline**
```http
POST /api/performance/enhanced-etl/run
Authorization: Bearer {admin_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "modules": ["Accounting", "Procurement", "TaskManagement", "Events"],
  "forceRefresh": true
}
```

**Response Body:**
```json
{
  "success": true,
  "message": "ETL pipeline completed successfully",
  "data": {
    "pipelineId": "etl_001",
    "status": "completed",
    "startedAt": "2024-01-15T10:00:00.000Z",
    "completedAt": "2024-01-15T10:05:00.000Z",
    "duration": "5 minutes",
    "modulesProcessed": [
      {
        "module": "Accounting",
        "recordsExtracted": 150,
        "recordsTransformed": 150,
        "recordsLoaded": 150,
        "status": "success"
      },
      {
        "module": "Procurement",
        "recordsExtracted": 75,
        "recordsTransformed": 75,
        "recordsLoaded": 75,
        "status": "success"
      }
    ],
    "goalsUpdated": 12,
    "metricsCalculated": 25
  }
}
```

### **API Request: Get Current Metrics**
```http
GET /api/performance/enhanced-etl/metrics
Authorization: Bearer {admin_token}
Content-Type: application/json
```

**Response Body:**
```json
{
  "success": true,
  "message": "Current metrics retrieved successfully",
  "data": {
    "lastUpdated": "2024-01-15T10:05:00.000Z",
    "metrics": {
      "financial": {
        "totalRevenue": 2500000,
        "operatingExpenses": 800000,
        "netProfit": 1700000,
        "cashFlow": 1200000
      },
      "operational": {
        "taskCompletionRate": 85.5,
        "trainingCompletionRate": 92.3,
        "onboardingSuccessRate": 88.7
      },
      "procurement": {
        "invoiceProcessingTime": 2.5,
        "contractApprovalTime": 5.2,
        "supplierPaymentTime": 3.8
      }
    },
    "goalsStatus": {
      "totalGoals": 25,
      "activeGoals": 20,
      "completedGoals": 3,
      "overdueGoals": 2
    }
  }
}
```

---

## **🎯 COMPLETE FLOW SUMMARY**

### **📋 User Journey Stages:**
1. **👑 Executive Goal Setting** - Strategic organizational goals
2. **🏢 Departmental Breakdown** - Goals broken down by department
3. **👥 Individual Assignment** - Goals assigned to team members
4. **📋 Task Conversion** - Goals converted to actionable tasks
5. **📊 Progress Tracking** - Team members update progress
6. **💰 Accounting Integration** - Financial KPIs generate journal entries
7. **📈 Performance Scorecards** - Managers view team performance
8. **🔄 Performance Reviews** - Multi-stage review process
9. **📊 ETL Pipeline** - Cross-module data synchronization

### **🔄 Data Flow:**
```
Organizational Goals → Departmental Goals → Individual Goals → Tasks → Progress Updates → Goal Status Updates → Accounting Integration → Performance Scorecards → Review Cycles
```

### **💡 Key Features:**
- **User Story Driven** - Each stage represents a real user need
- **API Integration** - Complete request/response examples
- **Real-time Updates** - Progress flows up the hierarchy
- **Accounting Integration** - Financial KPIs create journal entries
- **Performance Tracking** - Scorecards at all levels
- **Review Management** - Structured performance review process
- **Data Synchronization** - ETL pipeline keeps data current

**🎉 This flow provides a complete user journey from goal setting to performance review with full API integration!**
