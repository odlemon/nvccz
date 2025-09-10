import { getAuthenticatedRequest, createTestActivityLog, createTestGoal, createTestTask, createTestDepartment, createTestKpi } from './setup';

describe('Activity Log CRUD Tests', () => {
  let createdActivityLogId: string;
  let createdGoalId: string;
  let createdTaskId: string;
  let createdKpiId: string;

  beforeAll(async () => {
    // Create test department first
    const departmentData = createTestDepartment();
    const departmentResponse = await getAuthenticatedRequest()
      .post('/api/departments')
      .send(departmentData);
    const createdDepartmentId = departmentResponse.body.data.id;

    // Create test KPI
    const kpiData = createTestKpi();
    const kpiResponse = await getAuthenticatedRequest()
      .post('/api/kpis')
      .send(kpiData);
    createdKpiId = kpiResponse.body.data.id;

    // Create test goal
    const goalData = createTestGoal(createdDepartmentId, createdKpiId);
    const goalResponse = await getAuthenticatedRequest()
      .post('/api/performance/goals')
      .send(goalData);
    createdGoalId = goalResponse.body.data.id;

    // Create test task
    const taskData = createTestTask(createdGoalId);
    const taskResponse = await getAuthenticatedRequest()
      .post('/api/tasks')
      .send(taskData);
    createdTaskId = taskResponse.body.data.id;
  });

  describe('POST /api/activity-logs - CREATE ACTIVITY LOG', () => {
    it('should create a new activity log successfully', async () => {
      const activityData = createTestActivityLog(createdGoalId, createdTaskId, createdKpiId);
      
      const response = await getAuthenticatedRequest()
        .post('/api/activity-logs')
        .send(activityData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.activityType).toBe(activityData.activityType);
      expect(response.body.data.title).toBe(activityData.title);
      expect(response.body.data.description).toBe(activityData.description);
      expect(response.body.data.goalId).toBe(activityData.goalId);
      expect(response.body.data.taskId).toBe(activityData.taskId);
      expect(response.body.data.kpiId).toBe(activityData.kpiId);
      expect(response.body.data.monetaryValueAchieved).toBe(activityData.monetaryValueAchieved);
      expect(response.body.data.percentValueAchieved).toBe(activityData.percentValueAchieved);

      createdActivityLogId = response.body.data.id;
    });

    it('should create activity log with only goal association', async () => {
      const activityData = createTestActivityLog(createdGoalId);
      activityData.title = 'Goal-only Activity';

      const response = await getAuthenticatedRequest()
        .post('/api/activity-logs')
        .send(activityData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.title).toBe(activityData.title);
      expect(response.body.data.goalId).toBe(activityData.goalId);
      expect(response.body.data.taskId).toBeNull();
      expect(response.body.data.kpiId).toBeNull();
    });

    it('should create activity log with only task association', async () => {
      const activityData = createTestActivityLog(undefined, createdTaskId);
      activityData.title = 'Task-only Activity';

      const response = await getAuthenticatedRequest()
        .post('/api/activity-logs')
        .send(activityData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.title).toBe(activityData.title);
      expect(response.body.data.goalId).toBeNull();
      expect(response.body.data.taskId).toBe(activityData.taskId);
      expect(response.body.data.kpiId).toBeNull();
    });

    it('should create activity log with only KPI association', async () => {
      const activityData = createTestActivityLog(undefined, undefined, createdKpiId);
      activityData.title = 'KPI-only Activity';

      const response = await getAuthenticatedRequest()
        .post('/api/activity-logs')
        .send(activityData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.title).toBe(activityData.title);
      expect(response.body.data.goalId).toBeNull();
      expect(response.body.data.taskId).toBeNull();
      expect(response.body.data.kpiId).toBe(activityData.kpiId);
    });

    it('should create standalone activity log', async () => {
      const activityData = createTestActivityLog();
      activityData.title = 'Standalone Activity';

      const response = await getAuthenticatedRequest()
        .post('/api/activity-logs')
        .send(activityData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.title).toBe(activityData.title);
      expect(response.body.data.goalId).toBeNull();
      expect(response.body.data.taskId).toBeNull();
      expect(response.body.data.kpiId).toBeNull();
    });

    it('should fail with missing required fields', async () => {
      const response = await getAuthenticatedRequest()
        .post('/api/activity-logs')
        .send({
          description: 'Activity without title'
          // Missing 'title' field
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should fail with invalid goal ID', async () => {
      const activityData = createTestActivityLog('invalid-goal-id');
      
      const response = await getAuthenticatedRequest()
        .post('/api/activity-logs')
        .send(activityData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should fail with invalid task ID', async () => {
      const activityData = createTestActivityLog(undefined, 'invalid-task-id');
      
      const response = await getAuthenticatedRequest()
        .post('/api/activity-logs')
        .send(activityData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should fail with invalid KPI ID', async () => {
      const activityData = createTestActivityLog(undefined, undefined, 'invalid-kpi-id');
      
      const response = await getAuthenticatedRequest()
        .post('/api/activity-logs')
        .send(activityData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/activity-logs/:id - READ ACTIVITY LOG BY ID', () => {
    it('should get activity log by ID successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get(`/api/activity-logs/${createdActivityLogId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id', createdActivityLogId);
      expect(response.body.data).toHaveProperty('activityType');
      expect(response.body.data).toHaveProperty('title');
      expect(response.body.data).toHaveProperty('description');
      expect(response.body.data).toHaveProperty('createdAt');
      
      // Check relations
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('goal');
      expect(response.body.data).toHaveProperty('task');
      expect(response.body.data).toHaveProperty('kpi');
    });

    it('should return 404 for non-existent activity log', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/activity-logs/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('not found');
    });
  });

  describe('GET /api/activity-logs - READ ALL ACTIVITY LOGS', () => {
    it('should get all activity logs successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/activity-logs')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Check if our created activity log is in the list
      const createdActivityLog = response.body.data.find((log: any) => log.id === createdActivityLogId);
      expect(createdActivityLog).toBeDefined();
    });

    it('should support pagination parameters', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/activity-logs?page=1&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by activity type', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/activity-logs?activityType=goal_update')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // All returned activity logs should be of the specified type
      response.body.data.forEach((log: any) => {
        expect(log.activityType).toBe('goal_update');
      });
    });

    it('should filter by goal ID', async () => {
      const response = await getAuthenticatedRequest()
        .get(`/api/activity-logs?goalId=${createdGoalId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // All returned activity logs should belong to the specified goal
      response.body.data.forEach((log: any) => {
        expect(log.goalId).toBe(createdGoalId);
      });
    });

    it('should filter by task ID', async () => {
      const response = await getAuthenticatedRequest()
        .get(`/api/activity-logs?taskId=${createdTaskId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // All returned activity logs should belong to the specified task
      response.body.data.forEach((log: any) => {
        expect(log.taskId).toBe(createdTaskId);
      });
    });

    it('should filter by KPI ID', async () => {
      const response = await getAuthenticatedRequest()
        .get(`/api/activity-logs?kpiId=${createdKpiId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // All returned activity logs should belong to the specified KPI
      response.body.data.forEach((log: any) => {
        expect(log.kpiId).toBe(createdKpiId);
      });
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2025-01-01T00:00:00Z').toISOString();
      const endDate = new Date('2025-12-31T23:59:59Z').toISOString();

      const response = await getAuthenticatedRequest()
        .get(`/api/activity-logs?startDate=${startDate}&endDate=${endDate}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/activity-logs/statistics - ACTIVITY LOG STATISTICS', () => {
    it('should get activity log statistics successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/activity-logs/statistics')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalActivityLogs');
      expect(response.body.data).toHaveProperty('activityLogsByType');
      expect(response.body.data).toHaveProperty('recentActivityLogs');
      expect(response.body.data).toHaveProperty('activityLogsByDate');
      expect(typeof response.body.data.totalActivityLogs).toBe('number');
    });
  });
});



