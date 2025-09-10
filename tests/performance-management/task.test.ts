import { getAuthenticatedRequest, createTestTask, createTestGoal, createTestDepartment, createTestKpi } from './setup';

describe('Task CRUD and Functionality Tests', () => {
  let createdTaskId: string;
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

    // Create test goal
    const goalData = createTestGoal(createdDepartmentId, createdKpiId);
    const goalResponse = await getAuthenticatedRequest()
      .post('/api/performance/goals')
      .send(goalData);
    createdGoalId = goalResponse.body.data.id;
  });

  describe('POST /api/tasks - CREATE TASK', () => {
    it('should create a new task successfully', async () => {
      const taskData = createTestTask(createdGoalId);
      
      const response = await getAuthenticatedRequest()
        .post('/api/tasks')
        .send(taskData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.title).toBe(taskData.title);
      expect(response.body.data.description).toBe(taskData.description);
      expect(response.body.data.team).toEqual(taskData.team);
      expect(response.body.data.stage).toBe(taskData.stage);
      expect(response.body.data.priority).toBe(taskData.priority);
      expect(response.body.data.goalId).toBe(taskData.goalId);
      expect(response.body.data.isPerformanceTask).toBe(taskData.isPerformanceTask);
      expect(response.body.data.monetaryValue).toBe(taskData.monetaryValue);
      expect(response.body.data.percentValue).toBe(taskData.percentValue);

      createdTaskId = response.body.data.id;
    });

    it('should create task without goal association', async () => {
      const taskData = createTestTask();
      taskData.title = 'Standalone Task';

      const response = await getAuthenticatedRequest()
        .post('/api/tasks')
        .send(taskData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.title).toBe(taskData.title);
      expect(response.body.data.goalId).toBeNull();
    });

    it('should create task with different stages', async () => {
      const taskData = createTestTask();
      taskData.title = 'In Progress Task';
      taskData.stage = 'in_progress';

      const response = await getAuthenticatedRequest()
        .post('/api/tasks')
        .send(taskData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.stage).toBe('in_progress');
    });

    it('should fail with missing required fields', async () => {
      const response = await getAuthenticatedRequest()
        .post('/api/tasks')
        .send({
          description: 'Task without title'
          // Missing 'title' field
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should fail with invalid goal ID', async () => {
      const taskData = createTestTask('invalid-goal-id');
      
      const response = await getAuthenticatedRequest()
        .post('/api/tasks')
        .send(taskData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/tasks/:id - READ TASK BY ID', () => {
    it('should get task by ID successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get(`/api/tasks/${createdTaskId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id', createdTaskId);
      expect(response.body.data).toHaveProperty('title');
      expect(response.body.data).toHaveProperty('stage');
      expect(response.body.data).toHaveProperty('priority');
      expect(response.body.data).toHaveProperty('createdAt');
      expect(response.body.data).toHaveProperty('updatedAt');
      
      // Check relations
      expect(response.body.data).toHaveProperty('goal');
    });

    it('should return 404 for non-existent task', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/tasks/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('not found');
    });
  });

  describe('GET /api/tasks - READ ALL TASKS', () => {
    it('should get all tasks successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/tasks')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      
      // Check if our created task is in the list
      const createdTask = response.body.data.find((task: any) => task.id === createdTaskId);
      expect(createdTask).toBeDefined();
    });

    it('should support pagination parameters', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/tasks?page=1&limit=5')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by stage', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/tasks?stage=todo')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // All returned tasks should be in todo stage
      response.body.data.forEach((task: any) => {
        expect(task.stage).toBe('todo');
      });
    });

    it('should filter by goal ID', async () => {
      const response = await getAuthenticatedRequest()
        .get(`/api/tasks?goalId=${createdGoalId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // All returned tasks should belong to the specified goal
      response.body.data.forEach((task: any) => {
        expect(task.goalId).toBe(createdGoalId);
      });
    });
  });

  describe('PUT /api/tasks/:id - UPDATE TASK', () => {
    it('should update task successfully', async () => {
      const updateData = {
        title: 'Updated Task Title',
        description: 'Updated task description',
        priority: 'critical',
        stage: 'in_progress'
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/tasks/${createdTaskId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.title).toBe(updateData.title);
      expect(response.body.data.description).toBe(updateData.description);
      expect(response.body.data.priority).toBe(updateData.priority);
      expect(response.body.data.stage).toBe(updateData.stage);
    });

    it('should update progress values', async () => {
      const updateData = {
        monetaryValueAchieved: 25000.00,
        percentValueAchieved: 50.00
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/tasks/${createdTaskId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.monetaryValueAchieved).toBe(updateData.monetaryValueAchieved);
      expect(response.body.data.percentValueAchieved).toBe(updateData.percentValueAchieved);
    });

    it('should update only provided fields', async () => {
      const updateData = {
        priority: 'low'
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/tasks/${createdTaskId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.priority).toBe(updateData.priority);
      // Other fields should remain unchanged
      expect(response.body.data.title).toBe('Updated Task Title');
    });

    it('should return 404 for non-existent task update', async () => {
      const response = await getAuthenticatedRequest()
        .put('/api/tasks/non-existent-id')
        .send({ title: 'Updated Title' })
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('PUT /api/tasks/:id/stage - UPDATE TASK STAGE (Overdue Logic)', () => {
    it('should update task stage successfully', async () => {
      const stageData = {
        stage: 'completed',
        monetaryValueAchieved: 50000.00,
        percentValueAchieved: 100.00
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/tasks/${createdTaskId}/stage`)
        .send(stageData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.stage).toBe(stageData.stage);
      expect(response.body.data.monetaryValueAchieved).toBe(stageData.monetaryValueAchieved);
      expect(response.body.data.percentValueAchieved).toBe(stageData.percentValueAchieved);
    });

    it('should handle overdue logic for past due tasks', async () => {
      // Create a task with past date
      const pastTaskData = createTestTask();
      pastTaskData.title = 'Overdue Task';
      pastTaskData.date = new Date('2024-01-01T00:00:00Z'); // Past date
      pastTaskData.stage = 'todo';

      const createResponse = await getAuthenticatedRequest()
        .post('/api/tasks')
        .send(pastTaskData)
        .expect(201);

      const pastTaskId = createResponse.body.data.id;

      // Update stage to test overdue logic
      const stageData = {
        stage: 'in_progress'
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/tasks/${pastTaskId}/stage`)
        .send(stageData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.stage).toBe(stageData.stage);
      expect(response.body.data.isOverdue).toBe(true);
      expect(response.body.data.overdueStatus).toBeDefined();
    });

    it('should fail with invalid stage', async () => {
      const stageData = {
        stage: 'invalid_stage'
      };

      const response = await getAuthenticatedRequest()
        .put(`/api/tasks/${createdTaskId}/stage`)
        .send(stageData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('POST /api/tasks/:id/activity - POST TASK ACTIVITY', () => {
    it('should post task activity successfully', async () => {
      const activityData = {
        activityType: 'task_completion',
        title: 'Task completed',
        description: 'Successfully completed the task',
        monetaryValueAchieved: 50000.00,
        percentValueAchieved: 100.00
      };

      const response = await getAuthenticatedRequest()
        .post(`/api/tasks/${createdTaskId}/activity`)
        .send(activityData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.activityType).toBe(activityData.activityType);
      expect(response.body.data.title).toBe(activityData.title);
      expect(response.body.data.description).toBe(activityData.description);
      expect(response.body.data.taskId).toBe(createdTaskId);
      expect(response.body.data.monetaryValueAchieved).toBe(activityData.monetaryValueAchieved);
      expect(response.body.data.percentValueAchieved).toBe(activityData.percentValueAchieved);
    });

    it('should fail with missing required fields', async () => {
      const response = await getAuthenticatedRequest()
        .post(`/api/tasks/${createdTaskId}/activity`)
        .send({
          description: 'Activity without title'
          // Missing 'title' field
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });

    it('should return 404 for non-existent task activity', async () => {
      const response = await getAuthenticatedRequest()
        .post('/api/tasks/non-existent-id/activity')
        .send({
          activityType: 'task_completion',
          title: 'Test Activity'
        })
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('DELETE /api/tasks/:id - DELETE TASK', () => {
    it('should delete task successfully', async () => {
      const response = await getAuthenticatedRequest()
        .delete(`/api/tasks/${createdTaskId}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toContain('deleted');
    });

    it('should return 404 for non-existent task deletion', async () => {
      const response = await getAuthenticatedRequest()
        .delete('/api/tasks/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('GET /api/tasks/statistics - TASK STATISTICS', () => {
    it('should get task statistics successfully', async () => {
      const response = await getAuthenticatedRequest()
        .get('/api/tasks/statistics')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalTasks');
      expect(response.body.data).toHaveProperty('tasksByStage');
      expect(response.body.data).toHaveProperty('tasksByPriority');
      expect(response.body.data).toHaveProperty('overdueTasks');
      expect(response.body.data).toHaveProperty('performanceTasks');
      expect(typeof response.body.data.totalTasks).toBe('number');
    });
  });
});



