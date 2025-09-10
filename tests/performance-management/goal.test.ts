import { getAuthenticatedRequest, createTestGoal, createTestKpi, createTestDepartment } from './setup';

describe('Performance Goal CRUD Tests', () => {
  let createdGoalId: string;
  let createdDepartmentId: string;
  let createdKpiId: string;

  beforeAll(async () => {
    // Create test department first
    const departmentData = createTestDepartment();
    const departmentResponse = await getAuthenticatedRequest()
      .post('/api/departments')
      .send(departmentData);
    createdDepartmentId = departmentResponse.body.data.id;

    // Create test KPI
    const kpiData = createTestKpi();
    const kpiResponse = await getAuthenticatedRequest()
      .post('/api/kpis')
      .send(kpiData);
    createdKpiId = kpiResponse.body.data.id;
  });

  describe('POST /api/performance/goals - CREATE PERFORMANCE GOAL', () => {
    it('should create a new performance goal successfully', async () => {
      const goalData = createTestGoal(createdDepartmentId, createdKpiId);
      
      const response = await getAuthenticatedRequest()
        .post('/api/performance/goals')
        .send(goalData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.title).toBe(goalData.title);
      expect(response.body.data.description).toBe(goalData.description);
      expect(response.body.data.type).toBe(goalData.type);
      expect(response.body.data.category).toBe(goalData.category);
      expect(response.body.data.departmentId).toBe(goalData.departmentId);
      expect(response.body.data.kpiId).toBe(goalData.kpiId);
      expect(response.body.data.monetaryValue).toBe(goalData.monetaryValue);
      expect(response.body.data.percentValue).toBe(goalData.percentValue);
      expect(response.body.data.status).toBe(goalData.status);
      expect(response.body.data.priority).toBe(goalData.priority);
      expect(response.body.data.stage).toBe(goalData.stage);

      createdGoalId = response.body.data.id;
    });

    it('should create goal without KPI', async () => {
      const goalData = createTestGoal(createdDepartmentId);
      goalData.title = 'Goal Without KPI';

      const response = await getAuthenticatedRequest()
        .post('/api/performance/goals')
        .send(goalData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.title).toBe(goalData.title);
      expect(response.body.data.kpiId).toBeNull();
    });

    it('should create goal with parent goal (hierarchy)', async () => {
      const parentGoalData = createTestGoal(createdDepartmentId);
      parentGoalData.title = 'Parent Goal';

      const parentResponse = await getAuthenticatedRequest()
        .post('/api/performance/goals')
        .send(parentGoalData)
        .expect(201);

      const childGoalData = createTestGoal(createdDepartmentId);
      childGoalData.title = 'Child Goal';
      childGoalData.parentGoalId = parentResponse.body.data.id;

      const response = await getAuthenticatedRequest()
        .post('/api/performance/goals')
        .send(childGoalData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.parentGoalId).toBe(parentResponse.body.data.id);
    });

    it('should fail with missing required fields', async () => {
      const response = await getAuthenticatedRequest()
        .post('/api/performance/goals')
        .send({
          description: 'Goal without title'
          // Missing 'title' field
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should fail with invalid department ID', async () => {
      const goalData = createTestGoal('invalid-department-id');
      
      const response = await getAuthenticatedRequest()
        .post('/api/performance/goals')
        .send(goalData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should fail with invalid date range', async () => {
      const goalData = createTestGoal(createdDepartmentId);
      goalData.startDate = new Date('2025-12-31T23:59:59Z');
      goalData.endDate = new Date('2025-01-01T00:00:00Z'); // End before start

      const response = await getAuthenticatedRequest()
        .post('/api/performance/goals')
        .send(goalData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/performance/goals/:id - READ PERFORMANCE GOAL BY ID', () => {
    it('should get performance goal by ID successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get(`/api/performance/goals/${createdGoalId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id', createdGoalId);
      expect(response.body.data).toHaveProperty('title');
      expect(response.body.data).toHaveProperty('type');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
      
      // Check relations
      expect(response.body.data).toHaveProperty('department');
      expect(response.body.data).toHaveProperty('kpi');
    });

    it('should return 404 for non-existent goal', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/performance/goals/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('not found');
    });
  });

  describe('GET /api/performance/goals - READ ALL PERFORMANCE GOALS', () => {
    it('should get all performance goals successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/performance/goals')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Check if our created goal is in the list
      const createdGoal = response.body.data.find((goal: any) => goal.id === createdGoalId);
      expect(createdGoal).toBeDefined();
    });

    it('should support pagination parameters', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/performance/goals?page=1&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/performance/goals?status=active')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // All returned goals should be active
      response.body.data.forEach((goal: any) => {
        expect(goal.status).toBe('active');
      });
    });

    it('should filter by department', async () => {
      const response = await getAuthenticatedRequest()
        .get(`/api/performance/goals?departmentId=${createdDepartmentId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // All returned goals should belong to the specified department
      response.body.data.forEach((goal: any) => {
        expect(goal.departmentId).toBe(createdDepartmentId);
      });
    });
  });

  describe('PUT /api/performance/goals/:id - UPDATE PERFORMANCE GOAL', () => {
    it('should update performance goal successfully', async () => {
      const updateData = {
        title: 'Updated Revenue Goal',
        description: 'Updated goal description',
        monetaryValue: 1200000.00,
        percentValue: 30.00,
        status: 'in_progress'
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/performance/goals/${createdGoalId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.title).toBe(updateData.title);
      expect(response.body.data.description).toBe(updateData.description);
      expect(response.body.data.monetaryValue).toBe(updateData.monetaryValue);
      expect(response.body.data.percentValue).toBe(updateData.percentValue);
      expect(response.body.data.status).toBe(updateData.status);
    });

    it('should update progress values', async () => {
      const updateData = {
        monetaryValueAchieved: 600000.00,
        percentValueAchieved: 50.00
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/performance/goals/${createdGoalId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.monetaryValueAchieved).toBe(updateData.monetaryValueAchieved);
      expect(response.body.data.percentValueAchieved).toBe(updateData.percentValueAchieved);
    });

    it('should update only provided fields', async () => {
      const updateData = {
        priority: 'critical'
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/performance/goals/${createdGoalId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.priority).toBe(updateData.priority);
      // Other fields should remain unchanged
      expect(response.body.data.title).toBe('Updated Revenue Goal');
    });

    it('should return 404 for non-existent goal update', async () => {
      const response = await getAuthenticatedRequest()
        .put('/api/performance/goals/non-existent-id')
        .send({ title: 'Updated Title' })
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('DELETE /api/performance/goals/:id - DELETE PERFORMANCE GOAL', () => {
    it('should delete performance goal successfully', async () => {
      const response = await getAuthenticatedRequest()
        .delete(`/api/performance/goals/${createdGoalId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent goal deletion', async () => {
      const response = await getAuthenticatedRequest()
        .delete('/api/performance/goals/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/performance/goals/statistics - PERFORMANCE GOAL STATISTICS', () => {
    it('should get performance goal statistics successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/performance/goals/statistics')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalGoals');
      expect(response.body.data).toHaveProperty('activeGoals');
      expect(response.body.data).toHaveProperty('completedGoals');
      expect(response.body.data).toHaveProperty('goalsByStatus');
      expect(response.body.data).toHaveProperty('goalsByType');
      expect(response.body.data).toHaveProperty('goalsByPriority');
      expect(typeof response.body.data.totalGoals).toBe('number');
    });
  });
});



