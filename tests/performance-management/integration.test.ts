import { getAuthenticatedRequest, createTestKpi, createTestDepartment, createTestGoal, createTestTask, createTestActivityLog } from './setup';

describe('Performance Management Integration Tests', () => {
  let createdKpiId: string;
  let createdDepartmentId: string;
  let createdGoalId: string;
  let createdTaskId: string;
  let createdActivityLogId: string;

  describe('End-to-End Workflow: KPI → Department → Goal → Task → Activity', () => {
    it('should create complete performance management workflow', async () => {
      // Step 1: Create KPI
      const kpiData = createTestKpi();
      kpiData.name = 'Integration Test KPI';
      
      const kpiResponse = await getAuthenticatedRequest()
        .post('/api/kpis')
        .send(kpiData)
        .expect(201);
      
      createdKpiId = kpiResponse.body.data.id;
      expect(kpiResponse.body.data.name).toBe(kpiData.name);

      // Step 2: Create Department
      const departmentData = createTestDepartment();
      departmentData.name = 'Integration Test Department';
      
      const departmentResponse = await getAuthenticatedRequest()
        .post('/api/departments')
        .send(departmentData)
        .expect(201);
      
      createdDepartmentId = departmentResponse.body.data.id;
      expect(departmentResponse.body.data.name).toBe(departmentData.name);

      // Step 3: Create Performance Goal with KPI and Department
      const goalData = createTestGoal(createdDepartmentId, createdKpiId);
      goalData.title = 'Integration Test Goal';
      
      const goalResponse = await getAuthenticatedRequest()
        .post('/api/performance/goals')
        .send(goalData)
        .expect(201);
      
      createdGoalId = goalResponse.body.data.id;
      expect(goalResponse.body.data.title).toBe(goalData.title);
      expect(goalResponse.body.data.departmentId).toBe(createdDepartmentId);
      expect(goalResponse.body.data.kpiId).toBe(createdKpiId);

      // Step 4: Create Task with Goal
      const taskData = createTestTask(createdGoalId);
      taskData.title = 'Integration Test Task';
      
      const taskResponse = await getAuthenticatedRequest()
        .post('/api/tasks')
        .send(taskData)
        .expect(201);
      
      createdTaskId = taskResponse.body.data.id;
      expect(taskResponse.body.data.title).toBe(taskData.title);
      expect(taskResponse.body.data.goalId).toBe(createdGoalId);

      // Step 5: Create Activity Log with all associations
      const activityData = createTestActivityLog(createdGoalId, createdTaskId, createdKpiId);
      activityData.title = 'Integration Test Activity';
      
      const activityResponse = await getAuthenticatedRequest()
        .post('/api/activity-logs')
        .send(activityData)
        .expect(201);
      
      createdActivityLogId = activityResponse.body.data.id;
      expect(activityResponse.body.data.title).toBe(activityData.title);
      expect(activityResponse.body.data.goalId).toBe(createdGoalId);
      expect(activityResponse.body.data.taskId).toBe(createdTaskId);
      expect(activityResponse.body.data.kpiId).toBe(createdKpiId);
    });

    it('should verify relationships in GET operations', async () => {
      // Verify Goal includes Department and KPI
      const goalResponse = await getAuthenticatedRequest()
        .get(`/api/performance/goals/${createdGoalId}`)
        .expect(200);
      
      expect(goalResponse.body.data.department).toBeDefined();
      expect(goalResponse.body.data.department.id).toBe(createdDepartmentId);
      expect(goalResponse.body.data.kpi).toBeDefined();
      expect(goalResponse.body.data.kpi.id).toBe(createdKpiId);

      // Verify Task includes Goal
      const taskResponse = await getAuthenticatedRequest()
        .get(`/api/tasks/${createdTaskId}`)
        .expect(200);
      
      expect(taskResponse.body.data.goal).toBeDefined();
      expect(taskResponse.body.data.goal.id).toBe(createdGoalId);

      // Verify Activity Log includes all associations
      const activityResponse = await getAuthenticatedRequest()
        .get(`/api/activity-logs/${createdActivityLogId}`)
        .expect(200);
      
      expect(activityResponse.body.data.goal).toBeDefined();
      expect(activityResponse.body.data.goal.id).toBe(createdGoalId);
      expect(activityResponse.body.data.task).toBeDefined();
      expect(activityResponse.body.data.task.id).toBe(createdTaskId);
      expect(activityResponse.body.data.kpi).toBeDefined();
      expect(activityResponse.body.data.kpi.id).toBe(createdKpiId);
    });
  });

  describe('Task Overdue Logic Integration', () => {
    it('should handle overdue task workflow', async () => {
      // Create a task with past date
      const pastTaskData = createTestTask(createdGoalId);
      pastTaskData.title = 'Overdue Integration Task';
      pastTaskData.date = new Date('2024-01-01T00:00:00Z'); // Past date
      pastTaskData.stage = 'todo';

      const createResponse = await getAuthenticatedRequest()
        .post('/api/tasks')
        .send(pastTaskData)
        .expect(201);

      const overdueTaskId = createResponse.body.data.id;

      // Update stage to trigger overdue logic
      const stageData = {
        stage: 'in_progress'
      };

      const updateResponse = await getAuthenticatedRequest()
        .put(`/api/tasks/${overdueTaskId}/stage`)
        .send(stageData)
        .expect(200);

      expect(updateResponse.body.data.isOverdue).toBe(true);
      expect(updateResponse.body.data.overdueStatus).toBeDefined();

      // Post activity for overdue task
      const activityData = {
        activityType: 'task_progress',
        title: 'Overdue task progress',
        description: 'Making progress on overdue task',
        monetaryValueAchieved: 10000.00,
        percentValueAchieved: 20.00
      };

      const activityResponse = await getAuthenticatedRequest()
        .post(`/api/tasks/${overdueTaskId}/activity`)
        .send(activityData)
        .expect(201);

      expect(activityResponse.body.data.taskId).toBe(overdueTaskId);
    });
  });

  describe('Goal Hierarchy Integration', () => {
    it('should create parent-child goal relationship', async () => {
      // Create parent goal
      const parentGoalData = createTestGoal(createdDepartmentId, createdKpiId);
      parentGoalData.title = 'Parent Integration Goal';

      const parentResponse = await getAuthenticatedRequest()
        .post('/api/performance/goals')
        .send(parentGoalData)
        .expect(201);

      const parentGoalId = parentResponse.body.data.id;

      // Create child goal
      const childGoalData = createTestGoal(createdDepartmentId, createdKpiId);
      childGoalData.title = 'Child Integration Goal';
      childGoalData.parentGoalId = parentGoalId;

      const childResponse = await getAuthenticatedRequest()
        .post('/api/performance/goals')
        .send(childGoalData)
        .expect(201);

      const childGoalId = childResponse.body.data.id;

      // Verify parent-child relationship
      expect(childResponse.body.data.parentGoalId).toBe(parentGoalId);

      // Verify parent goal includes child
      const parentGetResponse = await getAuthenticatedRequest()
        .get(`/api/performance/goals/${parentGoalId}`)
        .expect(200);

      expect(parentGetResponse.body.data.subGoals).toBeDefined();
      expect(parentGetResponse.body.data.subGoals.length).toBeGreaterThan(0);
    });
  });

  describe('Progress Tracking Integration', () => {
    it('should track progress across goal and task', async () => {
      // Update goal progress
      const goalProgressData = {
        monetaryValueAchieved: 500000.00,
        percentValueAchieved: 50.00
      };

      const goalUpdateResponse = await getAuthenticatedRequest()
        .put(`/api/performance/goals/${createdGoalId}`)
        .send(goalProgressData)
        .expect(200);

      expect(goalUpdateResponse.body.data.monetaryValueAchieved).toBe(goalProgressData.monetaryValueAchieved);
      expect(goalUpdateResponse.body.data.percentValueAchieved).toBe(goalProgressData.percentValueAchieved);

      // Update task progress
      const taskProgressData = {
        monetaryValueAchieved: 25000.00,
        percentValueAchieved: 50.00
      };

      const taskUpdateResponse = await getAuthenticatedRequest()
        .put(`/api/tasks/${createdTaskId}`)
        .send(taskProgressData)
        .expect(200);

      expect(taskUpdateResponse.body.data.monetaryValueAchieved).toBe(taskProgressData.monetaryValueAchieved);
      expect(taskUpdateResponse.body.data.percentValueAchieved).toBe(taskProgressData.percentValueAchieved);

      // Post activity with progress
      const activityData = {
        activityType: 'progress_update',
        title: 'Progress Update',
        description: 'Updated progress on goal and task',
        monetaryValueAchieved: 100000.00,
        percentValueAchieved: 10.00
      };

      const activityResponse = await getAuthenticatedRequest()
        .post('/api/activity-logs')
        .send(activityData)
        .expect(201);

      expect(activityResponse.body.data.monetaryValueAchieved).toBe(activityData.monetaryValueAchieved);
      expect(activityResponse.body.data.percentValueAchieved).toBe(activityData.percentValueAchieved);
    });
  });

  describe('Statistics Integration', () => {
    it('should provide comprehensive statistics across all modules', async () => {
      // Get KPI statistics
      const kpiStatsResponse = await getAuthenticatedRequest()
        .get('/api/kpis/statistics')
        .expect(200);

      expect(kpiStatsResponse.body.data.totalKpis).toBeGreaterThan(0);

      // Get Department statistics
      const deptStatsResponse = await getAuthenticatedRequest()
        .get('/api/departments/statistics')
        .expect(200);

      expect(deptStatsResponse.body.data.totalDepartments).toBeGreaterThan(0);

      // Get Goal statistics
      const goalStatsResponse = await getAuthenticatedRequest()
        .get('/api/performance/goals/statistics')
        .expect(200);

      expect(goalStatsResponse.body.data.totalGoals).toBeGreaterThan(0);

      // Get Task statistics
      const taskStatsResponse = await getAuthenticatedRequest()
        .get('/api/tasks/statistics')
        .expect(200);

      expect(taskStatsResponse.body.data.totalTasks).toBeGreaterThan(0);

      // Get Activity Log statistics
      const activityStatsResponse = await getAuthenticatedRequest()
        .get('/api/activity-logs/statistics')
        .expect(200);

      expect(activityStatsResponse.body.data.totalActivityLogs).toBeGreaterThan(0);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle cascade deletion properly', async () => {
      // Try to delete department with associated goals
      const deleteResponse = await getAuthenticatedRequest()
        .delete(`/api/departments/${createdDepartmentId}`)
        .expect(400);

      expect(deleteResponse.body.success).toBe(false);
      expect(deleteResponse.body.message).toContain('associated');

      // Try to delete KPI with associated goals
      const kpiDeleteResponse = await getAuthenticatedRequest()
        .delete(`/api/kpis/${createdKpiId}`)
        .expect(400);

      expect(kpiDeleteResponse.body.success).toBe(false);
      expect(kpiDeleteResponse.body.message).toContain('associated');
    });

    it('should handle invalid relationship references', async () => {
      // Try to create goal with non-existent department
      const invalidGoalData = createTestGoal('non-existent-department-id');
      
      const response = await getAuthenticatedRequest()
        .post('/api/performance/goals')
        .send(invalidGoalData)
        .expect(400);

      expect(response.body.success).toBe(false);

      // Try to create task with non-existent goal
      const invalidTaskData = createTestTask('non-existent-goal-id');
      
      const taskResponse = await getAuthenticatedRequest()
        .post('/api/tasks')
        .send(invalidTaskData)
        .expect(400);

      expect(taskResponse.body.success).toBe(false);
    });
  });

  afterAll(async () => {
    // Clean up test data in reverse order of creation
    if (createdActivityLogId) {
      // Activity logs are read-only, no deletion needed
    }
    
    if (createdTaskId) {
      await getAuthenticatedRequest()
        .delete(`/api/tasks/${createdTaskId}`)
        .expect(200);
    }
    
    if (createdGoalId) {
      await getAuthenticatedRequest()
        .delete(`/api/performance/goals/${createdGoalId}`)
        .expect(200);
    }
    
    if (createdDepartmentId) {
      await getAuthenticatedRequest()
        .delete(`/api/departments/${createdDepartmentId}`)
        .expect(200);
    }
    
    if (createdKpiId) {
      await getAuthenticatedRequest()
        .delete(`/api/kpis/${createdKpiId}`)
        .expect(200);
    }
  });
});



