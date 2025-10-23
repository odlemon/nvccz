# 🧪 ENHANCED PERFORMANCE MODULE TESTING GUIDE

## 📋 **OVERVIEW**

This comprehensive testing guide covers the complete Enhanced Performance Module implementation, including all workflows, API endpoints, data flows, and integration points. The module follows the **Organizational Performance Management (OPM)** workflow with goal cascade, tracking, accounting integration, and performance reviews.

## 🎯 **TESTING SCOPE**

### **Module Components to Test:**
1. **Enhanced Goal Definition Form Fields** (4 new fields)
2. **Enhanced Goal Tracking Logic** (Data source integration)
3. **Enhanced ETL Pipeline** (Cross-module data sync)
4. **Performance Review Cycle Management** (Deadline management)
5. **Enhanced KPIs** (12 new KPIs with accounting integration)
6. **Complete Workflow** (Goal cascade → Tracking → Review → Sync)

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

# 4. Seed test data (if needed)
npm run seed:performance-data
```

### **Test Data Requirements:**
- **Users**: At least 5 users across different departments
- **Departments**: Finance, Sales, Operations, Procurement, HR, Marketing, Legal, IT
- **Goals**: Mix of organizational, departmental, and individual goals
- **KPIs**: All 25 hardcoded KPIs available
- **Review Cycles**: At least 1 active review cycle

---

## 📊 **TESTING PHASES**

## **PHASE 1: ENHANCED GOAL DEFINITION FORM FIELDS**

### **Test 1.1: Create Goal with Enhanced Fields**
```bash
# Test Data
POST /api/performance/goals
{
  "title": "Achieve $2M in total revenue",
  "description": "Generate $2,000,000 in total revenue by end of year",
  "type": "company",
  "category": "financial",
  "targetValue": 2000000,
  "targetUnit": "USD",
  "currentValue": 0,
  "priority": "high",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "targetOperator": ">=",
  "dataSourceModule": "Accounting",
  "dataSourceField": "IncomeStatement.TotalRevenue",
  "trackingFrequency": "Weekly"
}
```

**Expected Results:**
- ✅ Goal created successfully
- ✅ All 4 enhanced fields stored in database
- ✅ `nextCheckDate` calculated based on frequency
- ✅ Goal status: "active", stage: "planning"

### **Test 1.2: Validate Enhanced Field Requirements**
```bash
# Test missing required fields
POST /api/performance/goals
{
  "title": "Test Goal",
  "type": "company",
  "category": "financial"
  // Missing targetValue, targetUnit, startDate, endDate
}
```

**Expected Results:**
- ❌ Validation error: "Title, type, category, start date, end date, target value, and target unit are required"

### **Test 1.3: Test Different Data Source Modules**
```bash
# Test Accounting module
{
  "dataSourceModule": "Accounting",
  "dataSourceField": "IncomeStatement.TotalRevenue"
}

# Test Procurement module
{
  "dataSourceModule": "Procurement", 
  "dataSourceField": "InvoiceProcessingTime"
}

# Test Task Management module
{
  "dataSourceModule": "TaskManagement",
  "dataSourceField": "TaskCompletionRate"
}

# Test Events module
{
  "dataSourceModule": "Events",
  "dataSourceField": "EventRSVPRate"
}
```

**Expected Results:**
- ✅ All modules accepted
- ✅ Field paths validated
- ✅ Next check date calculated

---

## **PHASE 2: ENHANCED GOAL TRACKING LOGIC**

### **Test 2.1: Check Individual Goal Status**
```bash
# Test goal status checking
POST /api/performance/goal-tracking/{goalId}
```

**Expected Results:**
- ✅ Goal status retrieved
- ✅ Current value fetched from data source
- ✅ Target operator evaluation performed
- ✅ Progress percentage calculated
- ✅ Status updated (achieved/behind/ahead)
- ✅ Next check date updated

### **Test 2.2: Check All Due Goals**
```bash
# Test bulk goal checking
POST /api/performance/goal-tracking/check-all
```

**Expected Results:**
- ✅ All due goals checked
- ✅ Results returned with status updates
- ✅ Statistics calculated (total, achieved, behind, ahead)

### **Test 2.3: Test Data Source Module Integration**
```bash
# Test Accounting data extraction
# Goal with dataSourceModule: "Accounting", dataSourceField: "IncomeStatement.TotalRevenue"
```

**Expected Results:**
- ✅ Revenue data extracted from journal entries
- ✅ Current value calculated correctly
- ✅ Progress percentage accurate

```bash
# Test Procurement data extraction  
# Goal with dataSourceModule: "Procurement", dataSourceField: "InvoiceProcessingTime"
```

**Expected Results:**
- ✅ Invoice processing time calculated
- ✅ Average processing time in days
- ✅ Data source integration working

### **Test 2.4: Test Target Operator Evaluation**
```bash
# Test >= operator
{
  "targetOperator": ">=",
  "targetValue": 1000000,
  "currentValue": 1200000
}
# Expected: isSuccess = true

# Test <= operator
{
  "targetOperator": "<=",
  "targetValue": 500000,
  "currentValue": 400000
}
# Expected: isSuccess = true

# Test = operator
{
  "targetOperator": "=",
  "targetValue": 1000000,
  "currentValue": 1000000
}
# Expected: isSuccess = true
```

### **Test 2.5: Test Frequency-based Scheduling**
```bash
# Test Daily frequency
{
  "trackingFrequency": "Daily"
}
# Expected: nextCheckDate = now + 1 day

# Test Weekly frequency
{
  "trackingFrequency": "Weekly"
}
# Expected: nextCheckDate = now + 7 days

# Test Monthly frequency
{
  "trackingFrequency": "Monthly"
}
# Expected: nextCheckDate = now + 30 days
```

---

## **PHASE 3: ENHANCED ETL PIPELINE**

### **Test 3.1: Run Complete ETL Pipeline**
```bash
# Test full ETL pipeline
POST /api/performance/enhanced-etl/run
```

**Expected Results:**
- ✅ Data extracted from all source modules
- ✅ KPIs calculated and transformed
- ✅ Data loaded to external_data collection
- ✅ Pipeline completed successfully

### **Test 3.2: Extract Data from Source Modules**
```bash
# Test data extraction
GET /api/performance/enhanced-etl/extract
```

**Expected Results:**
- ✅ Accounting data: Revenue, expenses, assets, liabilities
- ✅ Procurement data: Invoice processing, contract approval
- ✅ Task data: Completion rates, training, onboarding
- ✅ Event data: RSVP rates, attendance

### **Test 3.3: Get Current Metrics**
```bash
# Test metrics retrieval
GET /api/performance/enhanced-etl/metrics
```

**Expected Results:**
- ✅ All 12 enhanced KPIs returned
- ✅ Financial KPIs: Revenue growth, operating expenses, net profit
- ✅ Operational KPIs: Task completion, training, onboarding
- ✅ Procurement KPIs: Invoice processing, contract approval

### **Test 3.4: Test ETL Statistics**
```bash
# Test ETL statistics
GET /api/performance/enhanced-etl/stats
```

**Expected Results:**
- ✅ Financial statistics available
- ✅ Operational statistics available
- ✅ Procurement statistics available
- ✅ Data source integration confirmed

---

## **PHASE 4: PERFORMANCE REVIEW CYCLE MANAGEMENT**

### **Test 4.1: Create Review Cycle**
```bash
# Test review cycle creation
POST /api/performance/review-cycles
{
  "title": "Q4 2024 Performance Review Cycle",
  "reviewPeriodStart": "2024-10-01",
  "reviewPeriodEnd": "2024-12-31",
  "selfAssessmentDeadline": "2024-12-15",
  "peerReviewDeadline": "2024-12-20",
  "managerReviewDeadline": "2024-12-25",
  "availableReviewTypes": ["Self", "Manager", "Peer"],
  "reviewRatingScale": "1-5 Scale"
}
```

**Expected Results:**
- ✅ Review cycle created successfully
- ✅ Date validation passed
- ✅ Deadlines properly set
- ✅ Rating scale configured

### **Test 4.2: Test Deadline Management**
```bash
# Test deadline checking
POST /api/performance/review-cycles/check-deadlines
```

**Expected Results:**
- ✅ Self-assessment deadline checked
- ✅ Peer review deadline checked
- ✅ Manager review deadline checked
- ✅ Overdue notifications sent

### **Test 4.3: Get Review Cycle Statistics**
```bash
# Test cycle statistics
GET /api/performance/review-cycles/{cycleId}/stats
```

**Expected Results:**
- ✅ Total reviews counted
- ✅ Completion rate calculated
- ✅ Review type breakdown
- ✅ Deadline information

### **Test 4.4: Test Active Review Cycle**
```bash
# Test active cycle retrieval
GET /api/performance/review-cycles/active
```

**Expected Results:**
- ✅ Active cycle returned
- ✅ All deadline information
- ✅ Review types available
- ✅ Rating scale configured

---

## **PHASE 5: ENHANCED KPIs TESTING**

### **Test 5.1: Financial KPIs (Accounting Integration)**
```bash
# Test Revenue Growth KPI
{
  "kpiCode": "REVENUE_GROWTH",
  "dataSource": "Accounting.IncomeStatement.ManagementFees",
  "expectedJournalEntry": "Credit Sales Revenue (4000)"
}

# Test Operating Expenses KPI
{
  "kpiCode": "OPERATING_EXPENSES", 
  "dataSource": "Accounting.IncomeStatement.OperatingCosts.Total",
  "expectedJournalEntry": "Debit Operating Expenses"
}
```

**Expected Results:**
- ✅ KPI data extracted from accounting module
- ✅ Journal entries generated for financial KPIs
- ✅ Real-time financial impact tracking

### **Test 5.2: Operational KPIs (Task Management Integration)**
```bash
# Test Task Completion Rate KPI
{
  "kpiCode": "TASK_COMPLETION_RATE",
  "dataSource": "TaskManagement.TaskCompletionRate",
  "expectedBehavior": "Tracking only, no journal entries"
}

# Test Time to Hire KPI
{
  "kpiCode": "TIME_TO_HIRE",
  "dataSource": "TaskManagement.HiringTasks.AverageTime",
  "expectedBehavior": "Tracking only, no journal entries"
}
```

**Expected Results:**
- ✅ KPI data extracted from task management
- ✅ No journal entries for non-financial KPIs
- ✅ Progress tracking accurate

### **Test 5.3: Procurement KPIs**
```bash
# Test Invoice Processing Time KPI
{
  "kpiCode": "INVOICE_PROCESSING_TIME",
  "dataSource": "Procurement.InvoiceProcessingTime",
  "expectedBehavior": "Tracking only, no journal entries"
}
```

**Expected Results:**
- ✅ Processing time calculated from procurement data
- ✅ Average time in days returned
- ✅ Data source integration working

### **Test 5.4: Events KPIs**
```bash
# Test Event RSVP Rate KPI
{
  "kpiCode": "EVENT_RSVP_RATE",
  "dataSource": "Events.RSVPRate",
  "expectedBehavior": "Tracking only, no journal entries"
}
```

**Expected Results:**
- ✅ RSVP rate calculated from events data
- ✅ Percentage accuracy confirmed
- ✅ Event effectiveness tracked

---

## **PHASE 6: COMPLETE WORKFLOW TESTING**

### **Test 6.1: Goal Cascade Workflow**
```bash
# Step 1: Create Organizational Goal
POST /api/performance/goals
{
  "title": "Achieve $5M Fund I AUM by Q4",
  "type": "company",
  "category": "financial",
  "targetValue": 5000000,
  "targetUnit": "USD"
}

# Step 2: Create Departmental Goal (Finance)
POST /api/performance/goals
{
  "title": "Improve expense reporting efficiency by 15%",
  "type": "department",
  "category": "operational",
  "parentGoalId": "{organizational_goal_id}",
  "departmentId": "Finance"
}

# Step 3: Create Individual Goal
POST /api/performance/goals
{
  "title": "Process 100 invoices within 48 hours",
  "type": "individual",
  "category": "operational",
  "parentGoalId": "{departmental_goal_id}",
  "assignedToId": "{user_id}"
}
```

**Expected Results:**
- ✅ Goal hierarchy created
- ✅ Parent-child relationships established
- ✅ Department assignments working
- ✅ Individual assignments working

### **Test 6.2: Progress Tracking Workflow**
```bash
# Step 1: Update Individual Goal Progress
PUT /api/performance/goals/{goalId}/progress
{
  "currentValue": 95,
  "notes": "Completed 95 invoices in 48 hours"
}

# Step 2: Check Goal Status
POST /api/performance/goal-tracking/{goalId}

# Step 3: Verify Roll-up Calculation
GET /api/performance/goals/{parent_goal_id}
```

**Expected Results:**
- ✅ Individual progress updated
- ✅ Goal status recalculated
- ✅ Parent goal progress updated
- ✅ Roll-up calculation accurate

### **Test 6.3: Accounting Integration Workflow**
```bash
# Step 1: Complete Financial KPI Task
POST /api/performance/goals/{goalId}/complete
{
  "achievedValue": 200000,
  "kpiCode": "SALES_REVENUE"
}

# Step 2: Verify Journal Entry Creation
GET /api/accounting/journal-entries?goalId={goal_id}
```

**Expected Results:**
- ✅ Goal marked as completed
- ✅ Journal entry automatically created
- ✅ Accounting integration working
- ✅ Financial impact tracked

### **Test 6.4: Performance Review Workflow**
```bash
# Step 1: Create Review Cycle
POST /api/performance/review-cycles
{
  "title": "Q4 2024 Performance Review Cycle",
  "reviewPeriodStart": "2024-10-01",
  "reviewPeriodEnd": "2024-12-31",
  "selfAssessmentDeadline": "2024-12-15",
  "peerReviewDeadline": "2024-12-20",
  "managerReviewDeadline": "2024-12-25"
}

# Step 2: Create Performance Review
POST /api/performance/reviews
{
  "cycleId": "{cycle_id}",
  "revieweeId": "{user_id}",
  "reviewerId": "{manager_id}",
  "reviewType": "MANAGER"
}

# Step 3: Complete Review Process
PUT /api/performance/reviews/{review_id}
{
  "status": "COMPLETED",
  "finalRating": "EXCEEDS_EXPECTATIONS",
  "isSignedOff": true
}
```

**Expected Results:**
- ✅ Review cycle created
- ✅ Performance review created
- ✅ Review process completed
- ✅ Digital sign-off working

### **Test 6.5: ETL Pipeline Workflow**
```bash
# Step 1: Run ETL Pipeline
POST /api/performance/enhanced-etl/run

# Step 2: Check External Data
GET /api/performance/enhanced-etl/metrics

# Step 3: Verify Goal Status Updates
POST /api/performance/goal-tracking/check-all
```

**Expected Results:**
- ✅ ETL pipeline completed
- ✅ External data updated
- ✅ Goal statuses updated
- ✅ Cross-module sync working

---

## **PHASE 7: ERROR HANDLING & EDGE CASES**

### **Test 7.1: Invalid Data Source Modules**
```bash
# Test invalid module
{
  "dataSourceModule": "InvalidModule",
  "dataSourceField": "SomeField"
}
# Expected: Error handling for unknown modules
```

### **Test 7.2: Invalid Field Paths**
```bash
# Test invalid field path
{
  "dataSourceModule": "Accounting",
  "dataSourceField": "InvalidField.Path"
}
# Expected: Graceful error handling
```

### **Test 7.3: Missing Data**
```bash
# Test when source data is empty
# Expected: Default values returned, no crashes
```

### **Test 7.4: Network Failures**
```bash
# Test ETL pipeline with network issues
# Expected: Retry logic, error logging
```

---

## **PHASE 8: PERFORMANCE TESTING**

### **Test 8.1: Bulk Goal Creation**
```bash
# Create 100 goals simultaneously
# Expected: All goals created successfully
# Performance: < 5 seconds
```

### **Test 8.2: ETL Pipeline Performance**
```bash
# Run ETL pipeline with large dataset
# Expected: Pipeline completes successfully
# Performance: < 30 seconds
```

### **Test 8.3: Goal Tracking Performance**
```bash
# Check 1000 goals simultaneously
# Expected: All goals checked successfully
# Performance: < 10 seconds
```

---

## **PHASE 9: INTEGRATION TESTING**

### **Test 9.1: Cross-Module Data Flow**
```bash
# Test complete data flow:
# Accounting → ETL → Goal Tracking → Review
```

### **Test 9.2: Real-time Updates**
```bash
# Test real-time goal status updates
# Expected: Status changes reflected immediately
```

### **Test 9.3: Notification System**
```bash
# Test deadline notifications
# Expected: Notifications sent to appropriate users
```

---

## **PHASE 10: USER ACCEPTANCE TESTING**

### **Test 10.1: Executive Dashboard**
```bash
# Test organizational goal visibility
# Expected: All organizational goals visible
```

### **Test 10.2: Manager Dashboard**
```bash
# Test departmental goal management
# Expected: Department goals and team progress visible
```

### **Test 10.3: Employee Dashboard**
```bash
# Test individual goal tracking
# Expected: Personal goals and progress visible
```

---

## 📊 **TESTING CHECKLIST**

### **✅ Enhanced Goal Definition Form Fields**
- [ ] Target Operator (>=, <=, =) working
- [ ] Data Source Module integration
- [ ] Data Source Field/Path extraction
- [ ] Tracking Frequency scheduling

### **✅ Enhanced Goal Tracking Logic**
- [ ] Data source module integration
- [ ] Field/path extraction working
- [ ] Target operator evaluation
- [ ] Frequency-based tracking

### **✅ Enhanced ETL Pipeline**
- [ ] Source module data extraction
- [ ] KPI calculation logic
- [ ] External data collection
- [ ] Scheduled data sync

### **✅ Performance Review Enhancement**
- [ ] Review cycle management
- [ ] Deadline management
- [ ] Digital sign-off
- [ ] Rating scale configuration

### **✅ Enhanced KPIs**
- [ ] All 12 KPIs implemented
- [ ] Data source mappings correct
- [ ] Accounting integration working
- [ ] Non-financial KPIs tracking only

### **✅ Complete Workflow**
- [ ] Goal cascade working
- [ ] Progress tracking accurate
- [ ] Accounting integration functional
- [ ] Performance reviews complete
- [ ] ETL pipeline synchronized

---

## 🚨 **COMMON ISSUES & SOLUTIONS**

### **Issue 1: Goal Status Not Updating**
**Solution**: Check data source module configuration and field paths

### **Issue 2: ETL Pipeline Failing**
**Solution**: Verify source module data availability and connection

### **Issue 3: Review Cycle Deadlines Not Working**
**Solution**: Check date validation and notification system

### **Issue 4: KPI Data Not Accurate**
**Solution**: Verify data source field paths and calculation logic

---

## 📈 **SUCCESS CRITERIA**

### **Functional Requirements:**
- ✅ All 4 enhanced goal definition fields working
- ✅ Enhanced goal tracking logic functional
- ✅ Enhanced ETL pipeline operational
- ✅ Performance review cycle management complete
- ✅ All 12 enhanced KPIs implemented
- ✅ Complete workflow end-to-end

### **Performance Requirements:**
- ✅ Goal creation: < 2 seconds
- ✅ Goal tracking: < 5 seconds for 100 goals
- ✅ ETL pipeline: < 30 seconds
- ✅ Review cycle creation: < 3 seconds

### **Integration Requirements:**
- ✅ Accounting module integration
- ✅ Procurement module integration
- ✅ Task management integration
- ✅ Events module integration
- ✅ Cross-module data synchronization

---

## 🎯 **TESTING COMPLETION**

Once all phases are completed successfully, the Enhanced Performance Module will be:

- ✅ **Fully Functional**: All features working as designed
- ✅ **Performance Optimized**: Meeting all performance requirements
- ✅ **Integration Ready**: All modules integrated properly
- ✅ **Production Ready**: Ready for deployment

**🎉 ENHANCED PERFORMANCE MODULE TESTING: COMPLETE! 🎉**
