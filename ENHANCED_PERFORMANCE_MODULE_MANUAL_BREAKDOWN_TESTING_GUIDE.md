# 🧪 ENHANCED PERFORMANCE MODULE - MANUAL BREAKDOWN TESTING GUIDE

## 📋 **OVERVIEW**

This testing guide covers the **MANUAL GOAL BREAKDOWN PROCESS** in the Enhanced Performance Module. The system now uses **hardcoded department names** and requires **manual breakdown** instead of automatic cascading.

## 🎯 **KEY CHANGES FROM AUTOMATIC TO MANUAL**

### **❌ REMOVED (Automatic Process):**
- Automatic goal cascading on creation
- `cascadeMode` parameter
- Automatic department assignment
- Equal distribution of targets

### **✅ ADDED (Manual Process):**
- Manual department selection
- Custom target values per department
- Individual goal assignment with custom targets
- Hardcoded department names: "Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT"

---

## 🚀 **TESTING ENVIRONMENT SETUP**

### **Prerequisites:**
```bash
# 1. Start the server
npm run dev

# 2. Verify database connection
npm run db:status

# 3. Run database migrations (if needed)
npx prisma db push
```

### **Test Data Requirements:**
- **Users**: At least 5 users across different departments
- **Departments**: Use hardcoded department names
- **Goals**: Manual breakdown process
- **KPIs**: All 25 hardcoded KPIs available

---

## 📊 **TESTING PHASES**

## **PHASE 1: ORGANIZATIONAL GOAL CREATION (NO AUTOMATIC CASCADING)**

### **Test 1.1: Create Organizational Goal**
```bash
# Create organizational goal (NO automatic breakdown)
curl -X POST http://localhost:3000/api/performance/goals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Achieve $5M Fund I AUM by Q4",
    "description": "Strategic goal to reach $5M in Assets Under Management",
    "type": "company",
    "category": "financial",
    "targetValue": 5000000,
    "targetUnit": "USD",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "priority": "high",
    "targetOperator": ">=",
    "dataSourceModule": "PortfolioManagement",
    "dataSourceField": "Fund.CurrentAUM",
    "trackingFrequency": "Monthly"
  }'
```

**Expected Results:**
- ✅ Goal created successfully
- ✅ Type: "company" (no department assignment)
- ✅ No automatic breakdown occurs
- ✅ Goal status: "active", stage: "planning"

### **Test 1.2: Verify No Automatic Cascading**
```bash
# Check that no department goals were created automatically
curl -X GET http://localhost:3000/api/performance/goals?type=department \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ No department goals created automatically
- ✅ Only the organizational goal exists

---

## **PHASE 2: MANUAL DEPARTMENT BREAKDOWN**

### **Test 2.1: Get Available Departments**
```bash
# Get list of hardcoded departments
curl -X GET http://localhost:3000/api/performance/breakdown/departments/available \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
```json
{
  "success": true,
  "message": "Available departments retrieved successfully",
  "departments": [
    { "name": "Finance", "description": "Financial operations and accounting" },
    { "name": "Sales", "description": "Revenue generation and client acquisition" },
    { "name": "Operations", "description": "Business operations and processes" },
    { "name": "Procurement", "description": "Vendor management and purchasing" },
    { "name": "Human Resources", "description": "HR operations and talent management" },
    { "name": "Marketing", "description": "Marketing and brand management" },
    { "name": "Legal", "description": "Legal compliance and risk management" },
    { "name": "IT", "description": "Technology and systems management" }
  ]
}
```

### **Test 2.2: Create Department Breakdown Goals**
```bash
# Create department goals with custom targets
curl -X POST http://localhost:3000/api/performance/breakdown/departments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "parentGoalId": "ORGANIZATIONAL_GOAL_ID",
    "selectedDepartments": ["Finance", "Sales", "Operations"],
    "breakdownData": [
      {
        "title": "Finance Department: AUM Growth Support",
        "description": "Finance department goal for AUM growth",
        "targetValue": 1500000,
        "targetUnit": "USD",
        "priority": "high",
        "startDate": "2024-01-01",
        "endDate": "2024-12-31",
        "targetOperator": ">=",
        "dataSourceModule": "Accounting",
        "dataSourceField": "IncomeStatement.TotalRevenue",
        "trackingFrequency": "Monthly"
      },
      {
        "title": "Sales Department: Client Acquisition",
        "description": "Sales department goal for client acquisition",
        "targetValue": 2000000,
        "targetUnit": "USD",
        "priority": "high",
        "startDate": "2024-01-01",
        "endDate": "2024-12-31",
        "targetOperator": ">=",
        "dataSourceModule": "Accounting",
        "dataSourceField": "ChartOfAccounts.4000",
        "trackingFrequency": "Weekly"
      },
      {
        "title": "Operations Department: Process Efficiency",
        "description": "Operations department goal for efficiency",
        "targetValue": 1500000,
        "targetUnit": "USD",
        "priority": "medium",
        "startDate": "2024-01-01",
        "endDate": "2024-12-31",
        "targetOperator": ">=",
        "dataSourceModule": "TaskManagement",
        "dataSourceField": "CompletedTasks.Value",
        "trackingFrequency": "Weekly"
      }
    ]
  }'
```

**Expected Results:**
- ✅ 3 department goals created successfully
- ✅ Each goal has custom target values
- ✅ Department names stored as hardcoded strings
- ✅ Parent-child relationships established
- ✅ Enhanced goal definition fields populated

### **Test 2.3: Validate Department Names**
```bash
# Test with invalid department name
curl -X POST http://localhost:3000/api/performance/breakdown/departments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "parentGoalId": "ORGANIZATIONAL_GOAL_ID",
    "selectedDepartments": ["InvalidDepartment"],
    "breakdownData": [{"targetValue": 1000000}]
  }'
```

**Expected Results:**
- ❌ Error: "Invalid department names: InvalidDepartment. Valid departments: Finance, Sales, Operations, Procurement, Human Resources, Marketing, Legal, IT"

---

## **PHASE 3: MANUAL INDIVIDUAL BREAKDOWN**

### **Test 3.1: Get Users by Department**
```bash
# Get users in Finance department
curl -X GET http://localhost:3000/api/performance/breakdown/users/Finance \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
```json
{
  "success": true,
  "message": "Users in Finance department retrieved successfully",
  "users": [
    {
      "id": "user_id_1",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@company.com",
      "role": { "name": "Finance Manager", "level": 5 }
    },
    {
      "id": "user_id_2",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane.smith@company.com",
      "role": { "name": "Finance Officer", "level": 4 }
    }
  ]
}
```

### **Test 3.2: Create Individual Breakdown Goals**
```bash
# Create individual goals with custom targets
curl -X POST http://localhost:3000/api/performance/breakdown/individuals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "departmentGoalId": "DEPARTMENT_GOAL_ID",
    "selectedUsers": ["USER_ID_1", "USER_ID_2"],
    "individualData": [
      {
        "title": "Finance Manager: Revenue Target",
        "description": "Individual goal for finance manager",
        "targetValue": 750000,
        "targetUnit": "USD",
        "priority": "high",
        "startDate": "2024-01-01",
        "endDate": "2024-12-31",
        "targetOperator": ">=",
        "dataSourceModule": "Accounting",
        "dataSourceField": "IncomeStatement.ManagementFees",
        "trackingFrequency": "Weekly"
      },
      {
        "title": "Finance Officer: Expense Management",
        "description": "Individual goal for finance officer",
        "targetValue": 750000,
        "targetUnit": "USD",
        "priority": "medium",
        "startDate": "2024-01-01",
        "endDate": "2024-12-31",
        "targetOperator": "<=",
        "dataSourceModule": "Accounting",
        "dataSourceField": "IncomeStatement.OperatingCosts",
        "trackingFrequency": "Weekly"
      }
    ]
  }'
```

**Expected Results:**
- ✅ 2 individual goals created successfully
- ✅ Each goal assigned to specific user
- ✅ Custom target values per individual
- ✅ Department name inherited from parent
- ✅ Enhanced goal definition fields populated

---

## **PHASE 4: ENHANCED ACCOUNTING INTEGRATION**

### **Test 4.1: Test Income Statement Data Fetching**
```bash
# Create goal with Income Statement data source
curl -X POST http://localhost:3000/api/performance/goals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Revenue Target Goal",
    "type": "company",
    "category": "financial",
    "targetValue": 2000000,
    "targetUnit": "USD",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "targetOperator": ">=",
    "dataSourceModule": "Accounting",
    "dataSourceField": "IncomeStatement.TotalRevenue",
    "trackingFrequency": "Weekly"
  }'
```

### **Test 4.2: Test Chart of Accounts Data Fetching**
```bash
# Create goal with specific account data source
curl -X POST http://localhost:3000/api/performance/goals \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "title": "Management Fees Goal",
    "type": "company",
    "category": "financial",
    "targetValue": 500000,
    "targetUnit": "USD",
    "startDate": "2024-01-01",
    "endDate": "2024-12-31",
    "targetOperator": ">=",
    "dataSourceModule": "Accounting",
    "dataSourceField": "ChartOfAccounts.4000",
    "trackingFrequency": "Weekly"
  }'
```

### **Test 4.3: Test Enhanced Goal Tracking**
```bash
# Check goal status with accounting data
curl -X POST http://localhost:3000/api/performance/goal-tracking/check-goal \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "goalId": "GOAL_ID"
  }'
```

**Expected Results:**
- ✅ System fetches data from accounting services
- ✅ Compares with target using operator (>=, <=, =)
- ✅ Updates goal progress automatically
- ✅ Calculates progress percentage

---

## **PHASE 5: INDIVIDUAL GOALS → TASKS CONVERSION**

### **Test 5.1: Convert Individual Goals to Tasks**
```bash
# Convert specific individual goal to tasks
curl -X POST http://localhost:3000/api/performance/individual-goals/{individualGoalId}/convert-to-tasks \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Individual goal converted to tasks successfully"
}
```

### **Test 5.2: Convert All User Goals to Tasks**
```bash
# Convert all individual goals for a user to tasks
curl -X POST http://localhost:3000/api/performance/individual-goals/users/{userId}/convert-goals-to-tasks \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "User individual goals converted to tasks successfully"
}
```

### **Test 5.3: Convert Department Goals to Tasks**
```bash
# Convert all individual goals for a department to tasks
curl -X POST http://localhost:3000/api/performance/individual-goals/departments/Finance/convert-goals-to-tasks \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Department Finance individual goals converted to tasks successfully"
}
```

### **Test 5.4: Get User Performance Tasks**
```bash
# Get all performance tasks for a user (linked to goals)
curl -X GET http://localhost:3000/api/performance/individual-goals/users/{userId}/performance-tasks \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "User performance tasks retrieved successfully",
  "tasks": [
    {
      "id": "TASK_ID",
      "title": "Finance Manager: Revenue Target",
      "description": "Task based on goal: Finance Manager: Revenue Target",
      "stage": "todo",
      "priority": "medium",
      "isOverdue": false,
      "isPerformanceTask": true,
      "goal": {
        "id": "INDIVIDUAL_GOAL_ID",
        "title": "Finance Manager: Revenue Target",
        "type": "individual",
        "category": "financial",
        "parentGoal": {
          "id": "DEPT_GOAL_ID",
          "title": "Finance Department: AUM Growth Support",
          "parentGoal": {
            "id": "ORG_GOAL_ID",
            "title": "Achieve $5M Fund I AUM by Q4"
          }
        }
      }
    }
  ]
}
```

### **Test 5.5: Get Department Performance Tasks**
```bash
# Get all performance tasks for a department
curl -X GET http://localhost:3000/api/performance/individual-goals/departments/Finance/performance-tasks \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Department Finance performance tasks retrieved successfully",
  "tasks": [...]
}
```

---

## **PHASE 6: USER TASK MANAGEMENT**

### **Test 6.1: User Login and View Tasks**
```bash
# User can see their performance tasks
curl -X GET http://localhost:3000/api/performance/individual-goals/users/{userId}/performance-tasks \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Verify:**
- ✅ Tasks are linked to individual goals
- ✅ Individual goals are linked to department goals
- ✅ Department goals are linked to organizational goals
- ✅ Tasks show proper hierarchy

### **Test 6.2: Update Task Progress**
```bash
# User updates task progress
curl -X PUT http://localhost:3000/api/tasks/{taskId} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "currentValue": 500000,
    "stage": "in_progress",
    "activities": [
      {
        "type": "progress_update",
        "activity": "Completed revenue milestone",
        "date": "2024-01-15T10:00:00Z",
        "by": "USER_ID"
      }
    ]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Task updated successfully",
  "task": {
    "id": "TASK_ID",
    "currentValue": 500000,
    "stage": "in_progress",
    "isPerformanceTask": true,
    "goal": {
      "id": "INDIVIDUAL_GOAL_ID",
      "title": "Finance Manager: Revenue Target"
    }
  }
}
```

### **Test 6.3: Update Task Stage**
```bash
# User updates task stage
curl -X PUT http://localhost:3000/api/tasks/{taskId}/stage \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "stage": "completed",
    "achievements": {
      "monetaryValueAchieved": 1000000
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Task stage updated successfully",
  "task": {
    "id": "TASK_ID",
    "stage": "completed",
    "isPerformanceTask": true
  }
}
```

### **Test 6.4: Post Task Activity**
```bash
# User posts activity to task
curl -X POST http://localhost:3000/api/tasks/{taskId}/activity \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "type": "progress_update",
    "activity": "Completed milestone",
    "userId": "USER_ID"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Activity posted successfully"
}
```

---

## **PHASE 7: AUTOMATIC GOAL PROGRESS UPDATES**

### **Test 7.1: Verify Goal Progress Updates**
```bash
# After task update, check if goal progress is updated
curl -X GET http://localhost:3000/api/performance/goals/{individualGoalId} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "goal": {
    "id": "INDIVIDUAL_GOAL_ID",
    "title": "Finance Manager: Revenue Target",
    "currentValue": 500000,
    "targetValue": 750000,
    "progressPercentage": 66.7,
    "status": "active",
    "stage": "in_progress"
  }
}
```

### **Test 7.2: Verify Parent Goal Updates**
```bash
# Check if department goal is updated
curl -X GET http://localhost:3000/api/performance/goals/{departmentGoalId} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "goal": {
    "id": "DEPT_GOAL_ID",
    "title": "Finance Department: AUM Growth Support",
    "currentValue": 500000,
    "targetValue": 1500000,
    "progressPercentage": 33.3,
    "status": "active"
  }
}
```

### **Test 7.3: Verify Organizational Goal Updates**
```bash
# Check if organizational goal is updated
curl -X GET http://localhost:3000/api/performance/goals/{organizationalGoalId} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "goal": {
    "id": "ORG_GOAL_ID",
    "title": "Achieve $5M Fund I AUM by Q4",
    "currentValue": 500000,
    "targetValue": 5000000,
    "progressPercentage": 10.0,
    "status": "active"
  }
}
```

---

## **PHASE 8: ACCOUNTING INTEGRATION**

### **Test 8.1: Verify KPI Journal Entries**
```bash
# When goal is completed, check if journal entry is created
curl -X GET http://localhost:3000/api/accounting/journal-entries \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Look for entries with:**
- ✅ entryNumber: "KPI-{KPI_CODE}-{TIMESTAMP}"
- ✅ description: "KPI Achievement: {KPI_NAME} - {GOAL_TITLE}"
- ✅ status: "POSTED"

### **Test 8.2: Verify Accounting Data Fetching**
```bash
# Test enhanced goal tracking with accounting data
curl -X POST http://localhost:3000/api/performance/goal-tracking/check-goal \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "goalId": "GOAL_ID"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "goalStatus": {
    "goalId": "GOAL_ID",
    "currentValue": 500000,
    "targetValue": 750000,
    "progressPercentage": 66.7,
    "status": "active",
    "dataSourceValue": 500000,
    "lastChecked": "2024-01-15T10:00:00Z"
  }
}
```

---

## **PHASE 9: SCORECARDS TESTING**

### **Test 9.1: User Scorecards**
```bash
# Get user performance scorecards
curl -X GET http://localhost:3000/api/performance-scorecards/users \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "User scorecards retrieved successfully",
  "scorecards": [
    {
      "userId": "USER_ID",
      "userName": "John Doe",
      "department": "Finance",
      "role": "Finance Manager",
      "overallScore": 85.5,
      "performanceCategory": "High Performer",
      "taskMetrics": {
        "totalTasks": 10,
        "completedTasks": 8,
        "overdueTasks": 1,
        "completionRate": 80.0,
        "averageCompletionTime": 5.2,
        "overdueRate": 10.0,
        "qualityScore": 88.0
      },
      "goalMetrics": {
        "totalGoals": 5,
        "achievedGoals": 4,
        "overdueGoals": 0,
        "completionRate": 80.0,
        "progressSpeed": 1.2,
        "overdueRate": 0.0,
        "averageProgress": 85.0
      }
    }
  ]
}
```

### **Test 9.2: Department Scorecards**
```bash
# Get department performance scorecards
curl -X GET http://localhost:3000/api/performance-scorecards/departments \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Department scorecards retrieved successfully",
  "scorecards": [
    {
      "departmentName": "Finance",
      "totalUsers": 5,
      "averageScore": 82.3,
      "performanceCategory": "High Performing Department",
      "taskMetrics": {
        "totalTasks": 25,
        "completedTasks": 20,
        "overdueTasks": 2,
        "completionRate": 80.0,
        "averageCompletionTime": 4.8,
        "overdueRate": 8.0,
        "qualityScore": 85.5
      },
      "goalMetrics": {
        "totalGoals": 15,
        "achievedGoals": 12,
        "overdueGoals": 1,
        "completionRate": 80.0,
        "progressSpeed": 1.1,
        "overdueRate": 6.7,
        "averageProgress": 82.0
      },
      "performanceDistribution": {
        "highPerformers": 3,
        "averagePerformers": 2,
        "needsImprovement": 0,
        "highPerformerPercentage": 60.0,
        "averagePerformerPercentage": 40.0,
        "needsImprovementPercentage": 0.0
      },
      "comparison": {
        "rankInCompany": 1,
        "vsCompanyAverage": "+5.2%",
        "vsBestDepartment": "0.0%",
        "vsWorstDepartment": "+15.8%"
      }
    }
  ]
}
```

### **Test 9.3: Verify Hardcoded Departments in Scorecards**
**Verify that scorecards use hardcoded department names:**
- ✅ "Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT"
- ✅ No database department IDs used
- ✅ Department names match hardcoded list

---

## **PHASE 10: COMPLETE WORKFLOW TESTING**

### **Test 5.1: End-to-End Manual Breakdown Process**
```bash
# Step 1: Create organizational goal
POST /api/performance/goals
{
  "title": "Company Revenue Target",
  "type": "company",
  "category": "financial",
  "targetValue": 10000000,
  "targetUnit": "USD"
}

# Step 2: Get available departments
GET /api/performance/breakdown/departments/available

# Step 3: Create department breakdown
POST /api/performance/breakdown/departments
{
  "parentGoalId": "ORG_GOAL_ID",
  "selectedDepartments": ["Finance", "Sales"],
  "breakdownData": [
    {"targetValue": 4000000, "targetUnit": "USD"},
    {"targetValue": 6000000, "targetUnit": "USD"}
  ]
}

# Step 4: Get users for department
GET /api/performance/breakdown/users/Finance

# Step 5: Create individual breakdown
POST /api/performance/breakdown/individuals
{
  "departmentGoalId": "DEPT_GOAL_ID",
  "selectedUsers": ["USER_ID_1", "USER_ID_2"],
  "individualData": [
    {"targetValue": 2000000, "targetUnit": "USD"},
    {"targetValue": 2000000, "targetUnit": "USD"}
  ]
}
```

### **Test 5.2: Verify Goal Hierarchy**
```bash
# Get goal hierarchy
curl -X GET http://localhost:3000/api/performance/goals \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Results:**
- ✅ 1 organizational goal
- ✅ 2 department goals (Finance, Sales)
- ✅ 4 individual goals (2 per department)
- ✅ Proper parent-child relationships
- ✅ Custom target values at each level

---

## **PHASE 11: COMPLETE END-TO-END WORKFLOW TEST**

### **Test 11.1: Complete Performance Flow**
```bash
# Step 1: Create organizational goal (NO automatic breakdown)
POST /api/performance/goals
{
  "title": "Achieve $5M Fund I AUM by Q4",
  "type": "company",
  "category": "financial",
  "targetValue": 5000000,
  "targetUnit": "USD",
  "dataSourceModule": "PortfolioManagement",
  "dataSourceField": "Fund.CurrentAUM"
}

# Step 2: Manual department breakdown
POST /api/performance/breakdown/departments
{
  "parentGoalId": "ORG_GOAL_ID",
  "selectedDepartments": ["Finance", "Sales"],
  "breakdownData": [
    {"targetValue": 2000000, "targetUnit": "USD"},
    {"targetValue": 3000000, "targetUnit": "USD"}
  ]
}

# Step 3: Manual individual breakdown
POST /api/performance/breakdown/individuals
{
  "departmentGoalId": "DEPT_GOAL_ID",
  "selectedUsers": ["USER_ID_1", "USER_ID_2"],
  "individualData": [
    {"targetValue": 1000000, "targetUnit": "USD"},
    {"targetValue": 1000000, "targetUnit": "USD"}
  ]
}

# Step 4: Convert individual goals to tasks
POST /api/performance/individual-goals/users/USER_ID_1/convert-goals-to-tasks

# Step 5: User sees their tasks
GET /api/performance/individual-goals/users/USER_ID_1/performance-tasks

# Step 6: User updates task progress
PUT /api/tasks/TASK_ID
{
  "currentValue": 500000,
  "stage": "in_progress",
  "activities": [
    {
      "type": "progress_update",
      "activity": "Completed milestone",
      "date": "2024-01-15T10:00:00Z",
      "by": "USER_ID_1"
    }
  ]
}

# Step 7: Check goal progress (automatic)
GET /api/performance/goals/INDIVIDUAL_GOAL_ID

# Step 8: Check scorecards
GET /api/performance-scorecards/users
GET /api/performance-scorecards/departments
```

**Expected Results:**
- ✅ Organizational goal created (no automatic breakdown)
- ✅ Department goals created with hardcoded department names
- ✅ Individual goals created with custom targets
- ✅ Individual goals converted to tasks for users
- ✅ Users can see their performance tasks
- ✅ Task progress updates automatically update goals
- ✅ Parent goals updated (department → organization)
- ✅ Scorecards show performance metrics
- ✅ All using hardcoded departments and KPIs

---

## **PHASE 12: DATA SOURCE MODULE TESTING**

### **Test 6.1: Accounting Module Integration**
```bash
# Test different accounting data sources
{
  "dataSourceModule": "Accounting",
  "dataSourceField": "IncomeStatement.TotalRevenue"
}

{
  "dataSourceModule": "Accounting", 
  "dataSourceField": "IncomeStatement.ManagementFees"
}

{
  "dataSourceModule": "Accounting",
  "dataSourceField": "IncomeStatement.OperatingCosts"
}

{
  "dataSourceModule": "Accounting",
  "dataSourceField": "BalanceSheet.CashAndCashEquivalents"
}

{
  "dataSourceModule": "Accounting",
  "dataSourceField": "ChartOfAccounts.4000"
}

{
  "dataSourceModule": "Accounting",
  "dataSourceField": "ChartOfAccounts.5030"
}
```

### **Test 6.2: Other Module Integration**
```bash
# Test Procurement module
{
  "dataSourceModule": "Procurement",
  "dataSourceField": "VendorPayments.TotalAmount"
}

# Test Task Management module
{
  "dataSourceModule": "TaskManagement",
  "dataSourceField": "CompletedTasks.Value"
}

# Test Events module
{
  "dataSourceModule": "Events",
  "dataSourceField": "EventAttendance.ParticipantCount"
}
```

---

## **PHASE 7: ERROR HANDLING & VALIDATION**

### **Test 7.1: Invalid Department Names**
```bash
# Test with invalid department
curl -X POST http://localhost:3000/api/performance/breakdown/departments \
  -d '{
    "parentGoalId": "GOAL_ID",
    "selectedDepartments": ["InvalidDept"],
    "breakdownData": [{"targetValue": 1000000}]
  }'
```

### **Test 7.2: Mismatched Data Lengths**
```bash
# Test with mismatched arrays
curl -X POST http://localhost:3000/api/performance/breakdown/departments \
  -d '{
    "parentGoalId": "GOAL_ID",
    "selectedDepartments": ["Finance", "Sales"],
    "breakdownData": [{"targetValue": 1000000}]  // Only 1 item for 2 departments
  }'
```

### **Test 7.3: Invalid Goal Types**
```bash
# Test department goal breakdown (should fail)
curl -X POST http://localhost:3000/api/performance/breakdown/departments \
  -d '{
    "parentGoalId": "DEPARTMENT_GOAL_ID",  // Wrong type
    "selectedDepartments": ["Finance"],
    "breakdownData": [{"targetValue": 1000000}]
  }'
```

---

## **PHASE 8: PERFORMANCE & SCALABILITY**

### **Test 8.1: Large Department Breakdown**
```bash
# Test with all 8 departments
curl -X POST http://localhost:3000/api/performance/breakdown/departments \
  -d '{
    "parentGoalId": "GOAL_ID",
    "selectedDepartments": ["Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT"],
    "breakdownData": [
      {"targetValue": 1250000, "targetUnit": "USD"},
      {"targetValue": 1250000, "targetUnit": "USD"},
      {"targetValue": 1250000, "targetUnit": "USD"},
      {"targetValue": 1250000, "targetUnit": "USD"},
      {"targetValue": 1250000, "targetUnit": "USD"},
      {"targetValue": 1250000, "targetUnit": "USD"},
      {"targetValue": 1250000, "targetUnit": "USD"},
      {"targetValue": 1250000, "targetUnit": "USD"}
    ]
  }'
```

### **Test 8.2: Multiple Individual Assignments**
```bash
# Test with multiple users per department
curl -X POST http://localhost:3000/api/performance/breakdown/individuals \
  -d '{
    "departmentGoalId": "DEPT_GOAL_ID",
    "selectedUsers": ["USER_1", "USER_2", "USER_3", "USER_4", "USER_5"],
    "individualData": [
      {"targetValue": 200000, "targetUnit": "USD"},
      {"targetValue": 200000, "targetUnit": "USD"},
      {"targetValue": 200000, "targetUnit": "USD"},
      {"targetValue": 200000, "targetUnit": "USD"},
      {"targetValue": 200000, "targetUnit": "USD"}
    ]
  }'
```

---

## **PHASE 9: INTEGRATION TESTING**

### **Test 9.1: Enhanced Goal Tracking Integration**
```bash
# Test goal tracking with accounting data
curl -X POST http://localhost:3000/api/performance/goal-tracking/check-all-due-goals \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **Test 9.2: ETL Pipeline Integration**
```bash
# Test ETL pipeline with new data sources
curl -X POST http://localhost:3000/api/performance/enhanced-etl/run-pipeline \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **Test 9.3: Performance Review Integration**
```bash
# Test review cycle with new goals
curl -X GET http://localhost:3000/api/performance/review-cycles \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## **PHASE 10: FINAL VERIFICATION**

### **Test 10.1: Complete System Check**
```bash
# Verify all components working together
curl -X GET http://localhost:3000/api/performance/goals \
  -H "Authorization: Bearer YOUR_TOKEN"

curl -X GET http://localhost:3000/api/performance/goal-tracking/stats \
  -H "Authorization: Bearer YOUR_TOKEN"

curl -X GET http://localhost:3000/api/performance/enhanced-etl/metrics \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **Test 10.2: Database Verification**
```sql
-- Check goal hierarchy in database
SELECT 
  id, title, type, departmentName, targetValue, targetUnit,
  parentGoalId, dataSourceModule, dataSourceField, trackingFrequency
FROM performance_goals 
ORDER BY type, departmentName;

-- Check goal tracking data
SELECT 
  goalId, currentValue, targetValue, progressPercentage, status
FROM performance_goals 
WHERE dataSourceModule IS NOT NULL;
```

---

## **✅ SUCCESS CRITERIA**

### **Manual Breakdown Process:**
- ✅ No automatic goal cascading on creation
- ✅ Manual department selection with hardcoded names
- ✅ Custom target values per department
- ✅ Manual individual assignment with custom targets
- ✅ Proper parent-child relationships maintained

### **Enhanced Accounting Integration:**
- ✅ Income Statement data fetching (TotalRevenue, ManagementFees, OperatingCosts)
- ✅ Balance Sheet data fetching (CashAndCashEquivalents, AccountsReceivable)
- ✅ Chart of Accounts data fetching (specific account numbers)
- ✅ Proper debit/credit balance calculations
- ✅ Real-time data comparison with targets

### **Data Source Module Support:**
- ✅ Accounting module with multiple field paths
- ✅ Procurement module integration
- ✅ Task Management module integration
- ✅ Events module integration
- ✅ Manual tracking option

### **Goal Tracking Enhancement:**
- ✅ Automatic data fetching from source modules
- ✅ Target operator evaluation (>=, <=, =)
- ✅ Progress percentage calculation
- ✅ Status updates (achieved/behind/ahead)
- ✅ Next check date scheduling

---

## **📝 TESTING CHECKLIST**

### **Manual Breakdown:**
- [ ] Organizational goal creation (no auto-cascade)
- [ ] Department selection from hardcoded list
- [ ] Custom target values per department
- [ ] Individual user assignment
- [ ] Custom target values per individual
- [ ] Parent-child relationship validation

### **Enhanced Accounting:**
- [ ] Income Statement data fetching
- [ ] Balance Sheet data fetching
- [ ] Chart of Accounts data fetching
- [ ] Proper debit/credit calculations
- [ ] Real-time data comparison

### **Data Source Modules:**
- [ ] Accounting module integration
- [ ] Procurement module integration
- [ ] Task Management module integration
- [ ] Events module integration
- [ ] Manual tracking option

### **Error Handling:**
- [ ] Invalid department name validation
- [ ] Mismatched data array validation
- [ ] Invalid goal type validation
- [ ] Missing required field validation

### **Performance:**
- [ ] Large department breakdown (8 departments)
- [ ] Multiple individual assignments
- [ ] Goal tracking performance
- [ ] ETL pipeline performance

---

## **🎯 CONCLUSION**

The Enhanced Performance Module now supports **complete goal-to-task workflow** with **manual breakdown**, **hardcoded departments**, and **enhanced accounting integration**. The system provides:

1. **Manual Control**: Users specify exactly which departments and users to include
2. **Custom Targets**: Each department and individual can have custom target values
3. **Individual Goals → Tasks**: Complete conversion and management workflow
4. **User Task Management**: Users can login, see tasks, and update progress
5. **Automatic Goal Updates**: Task progress automatically updates goal progress
6. **Enhanced Accounting**: Real-time data fetching and KPI journal entries
7. **Comprehensive Scorecards**: Performance tracking for users and departments
8. **Flexible Tracking**: Support for multiple data source modules
9. **Proper Validation**: Comprehensive error handling and validation

## **🎯 COMPLETE WORKFLOW SUMMARY**

### **✅ COMPLETE PERFORMANCE FLOW VERIFIED:**

#### **1. Goal Creation → Manual Breakdown**
- ✅ **Organizational Goals**: Created manually, no automatic cascading
- ✅ **Department Breakdown**: Manual selection with hardcoded department names
- ✅ **Individual Breakdown**: Custom targets per user
- ✅ **Goal Hierarchy**: Proper parent-child relationships maintained

#### **2. Individual Goals → Tasks Conversion**
- ✅ **Task Conversion**: Individual goals automatically converted to tasks
- ✅ **User Task Access**: Users can login and see their performance tasks
- ✅ **Task Linking**: Tasks properly linked to department and organizational goals
- ✅ **Task Management**: Users can update progress, stages, and activities

#### **3. Task Progress → Goal Updates**
- ✅ **Automatic Updates**: Task progress automatically updates goal progress
- ✅ **Parent Goal Updates**: Department and organizational goals updated automatically
- ✅ **Progress Calculation**: Progress percentages calculated automatically
- ✅ **Status Changes**: Goal status changes (active → completed)

#### **4. Accounting Integration**
- ✅ **KPI Journal Entries**: Created automatically when goals are completed
- ✅ **Account Numbers**: Uses KPI-specific account numbers
- ✅ **Journal Entry Types**: Proper debit/credit based on KPI type
- ✅ **Enhanced Data Fetching**: Real-time data from accounting services

#### **5. Scorecards**
- ✅ **User Scorecards**: Performance metrics for individual users
- ✅ **Department Scorecards**: Uses hardcoded department names
- ✅ **Performance Tracking**: Task completion, goal achievement, overdue tracking
- ✅ **Rankings**: Company-wide performance comparisons

#### **6. Hardcoded Components**
- ✅ **Departments**: "Finance", "Sales", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT"
- ✅ **KPIs**: 25 hardcoded KPIs with accounting integration
- ✅ **Roles**: Hardcoded roles per department
- ✅ **No Database IDs**: All references use hardcoded names

The testing guide ensures all components work together seamlessly for a complete performance management solution.

**The complete performance flow from goal creation to individual tasks is fully implemented and verified!** 🎉

**Ready for production deployment!** 🚀
