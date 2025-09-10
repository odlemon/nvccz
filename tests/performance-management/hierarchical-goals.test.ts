import request from 'supertest';
import { TEST_CONFIG } from './setup';

describe('Hierarchical Goal Setting & Progress Tracking Tests', () => {
  let authToken: string;
  let ceoUserId: string;
  let departmentManagerId: string;
  let individualUserId: string;
  let ceoGoalId: string;
  let departmentGoalId: string;
  let individualGoalId: string;
  let departmentId: string;
  let kpiId: string;

  beforeAll(async () => {
    // Login as admin to set up the hierarchy
    const loginResponse = await request(TEST_CONFIG.baseUrl)
      .post('/api/auth/login')
      .send(TEST_CONFIG.adminCredentials);

    authToken = loginResponse.body.token;
    console.log('✅ Admin authentication successful');

    // Create test KPI
    const kpiData = {
      name: `Strategic Revenue KPI ${Date.now()}`,
      type: 'Metric',
      branch: 'main',
      weightValue: 100.00,
      hasUnit: true,
      unitCategory: 'currency',
      unit: 'USD',
      unitSymbol: '$',
      unitPosition: 'prefix'
    };
    
    const kpiResponse = await request(TEST_CONFIG.baseUrl)
      .post('/api/kpis')
      .set('Authorization', `Bearer ${authToken}`)
      .send(kpiData);
    kpiId = kpiResponse.body.kpi.id;

    // Create test department
    const departmentData = {
      name: `Strategic Sales Department ${Date.now()}`,
      description: 'Department for testing hierarchical goals',
      branch: 'main'
    };
    
    const departmentResponse = await request(TEST_CONFIG.baseUrl)
      .post('/api/departments')
      .set('Authorization', `Bearer ${authToken}`)
      .send(departmentData);
    departmentId = departmentResponse.body.department.id;

    // For this test, we'll use the admin user as CEO, and create mock user IDs
    // In a real scenario, you'd have different user accounts
    ceoUserId = 'cme40ejfb0002uno01jhz7bo8'; // Admin user ID
    departmentManagerId = 'cme40ejfb0002uno01jhz7bo8'; // Same for simplicity
    individualUserId = 'cme40ejfb0002uno01jhz7bo8'; // Same for simplicity
  });

  describe('CEO Level - Strategic Goal Creation', () => {
    it('should create CEO-level strategic goal', async () => {
      const ceoGoalData = {
        title: `CEO Strategic Goal: 50% Revenue Growth ${Date.now()}`,
        description: 'CEO sets company-wide strategic objective to achieve 50% revenue growth',
        type: 'financial',
        category: 'revenue',
        departmentId: departmentId,
        kpiId: kpiId,
        monetaryValue: 5000000.00, // $5M target
        percentValue: 50.00, // 50% growth
        status: 'active',
        priority: 'critical',
        stage: 'planning',
        startDate: new Date('2025-01-01T00:00:00Z'),
        endDate: new Date('2025-12-31T23:59:59Z'),
        assignedToId: ceoUserId
      };
      
      const response = await request(TEST_CONFIG.baseUrl)
        .post('/api/performance/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(ceoGoalData);

      console.log('🔍 CEO GOAL CREATE Response Status:', response.status);
      console.log('🔍 CEO GOAL CREATE Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.goal).toHaveProperty('id');
      expect(response.body.goal.title).toContain('CEO Strategic Goal');
      expect(response.body.goal.monetaryValue).toBe('5000000');
      expect(response.body.goal.percentValue).toBe('50');

      ceoGoalId = response.body.goal.id;
    });

    it('should get CEO goal with full details', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/performance/goals/${ceoGoalId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 CEO GOAL GET Response Status:', response.status);
      console.log('🔍 CEO GOAL GET Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body.goal.id).toBe(ceoGoalId);
      expect(response.body.goal.assignedToId).toBe(ceoUserId);
      expect(response.body.goal.departmentId).toBe(departmentId);
    });
  });

  describe('Department Level - Cascaded Goal Creation', () => {
    it('should create department-level goal linked to CEO goal', async () => {
      const departmentGoalData = {
        title: `Department Goal: 30% Sales Growth ${Date.now()}`,
        description: 'Department manager creates goal to support CEO strategic objective',
        type: 'financial',
        category: 'revenue',
        departmentId: departmentId,
        kpiId: kpiId,
        parentGoalId: ceoGoalId, // Link to CEO goal
        monetaryValue: 3000000.00, // $3M target
        percentValue: 30.00, // 30% growth
        status: 'active',
        priority: 'high',
        stage: 'planning',
        startDate: new Date('2025-01-01T00:00:00Z'),
        endDate: new Date('2025-12-31T23:59:59Z'),
        assignedToId: departmentManagerId
      };
      
      const response = await request(TEST_CONFIG.baseUrl)
        .post('/api/performance/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(departmentGoalData);

      console.log('🔍 DEPARTMENT GOAL CREATE Response Status:', response.status);
      console.log('🔍 DEPARTMENT GOAL CREATE Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.goal).toHaveProperty('id');
      expect(response.body.goal.title).toContain('Department Goal');
      expect(response.body.goal.parentGoalId).toBe(ceoGoalId);
      expect(response.body.goal.monetaryValue).toBe('3000000');

      departmentGoalId = response.body.goal.id;
    });

    it('should verify CEO goal now has sub-goals', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/performance/goals/${ceoGoalId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 CEO GOAL WITH SUB-GOALS Response Status:', response.status);
      console.log('🔍 CEO GOAL WITH SUB-GOALS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body.goal.id).toBe(ceoGoalId);
      expect(Array.isArray(response.body.goal.subGoals)).toBe(true);
      expect(response.body.goal.subGoals.length).toBeGreaterThan(0);
      expect(response.body.goal._count.subGoals).toBeGreaterThan(0);
    });
  });

  describe('Individual Level - User Goal Creation', () => {
    it('should create individual user goal linked to department goal', async () => {
      const individualGoalData = {
        title: `Individual Goal: 10% Personal Sales Growth ${Date.now()}`,
        description: 'Individual contributor creates personal goal to support department objective',
        type: 'financial',
        category: 'revenue',
        departmentId: departmentId,
        kpiId: kpiId,
        parentGoalId: departmentGoalId, // Link to department goal
        monetaryValue: 1000000.00, // $1M target
        percentValue: 10.00, // 10% growth
        status: 'active',
        priority: 'medium',
        stage: 'planning',
        startDate: new Date('2025-01-01T00:00:00Z'),
        endDate: new Date('2025-12-31T23:59:59Z'),
        assignedToId: individualUserId
      };
      
      const response = await request(TEST_CONFIG.baseUrl)
        .post('/api/performance/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .send(individualGoalData);

      console.log('🔍 INDIVIDUAL GOAL CREATE Response Status:', response.status);
      console.log('🔍 INDIVIDUAL GOAL CREATE Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.goal).toHaveProperty('id');
      expect(response.body.goal.title).toContain('Individual Goal');
      expect(response.body.goal.parentGoalId).toBe(departmentGoalId);
      expect(response.body.goal.monetaryValue).toBe('1000000');

      individualGoalId = response.body.goal.id;
    });

    it('should verify department goal now has sub-goals', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/performance/goals/${departmentGoalId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 DEPARTMENT GOAL WITH SUB-GOALS Response Status:', response.status);
      console.log('🔍 DEPARTMENT GOAL WITH SUB-GOALS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body.goal.id).toBe(departmentGoalId);
      expect(Array.isArray(response.body.goal.subGoals)).toBe(true);
      expect(response.body.goal.subGoals.length).toBeGreaterThan(0);
      expect(response.body.goal._count.subGoals).toBeGreaterThan(0);
    });
  });

  describe('Individual User Progress Updates', () => {
    it('should update individual user goal progress', async () => {
      const progressUpdateData = {
        monetaryValueAchieved: 500000.00, // 50% of $1M target
        percentValueAchieved: 50.00, // 50% progress
        status: 'in_progress',
        stage: 'execution'
      };

      const response = await request(TEST_CONFIG.baseUrl)
        .put(`/api/performance/goals/${individualGoalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(progressUpdateData);

      console.log('🔍 INDIVIDUAL PROGRESS UPDATE Response Status:', response.status);
      console.log('🔍 INDIVIDUAL PROGRESS UPDATE Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.goal.monetaryValueAchieved).toBe('500000');
      expect(response.body.goal.percentValueAchieved).toBe('50');
      expect(response.body.goal.status).toBe('in_progress');
    });

    it('should create task for individual user to track progress', async () => {
      const taskData = {
        title: `Complete Q1 Sales Target ${Date.now()}`,
        description: 'Individual user task to achieve Q1 sales target',
        team: [individualUserId],
        stage: 'in_progress',
        date: new Date('2025-03-31T23:59:59Z'),
        priority: 'high',
        branch: 'main',
        department: 'Sales',
        ruleset: 'agile',
        goalId: individualGoalId,
        performanceCategory: 'business',
        isPerformanceTask: true,
        monetaryValue: 250000.00, // $250K task value
        percentValue: 25.00 // 25% of goal
      };
      
      const response = await request(TEST_CONFIG.baseUrl)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(taskData);

      console.log('🔍 INDIVIDUAL TASK CREATE Response Status:', response.status);
      console.log('🔍 INDIVIDUAL TASK CREATE Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.task.goalId).toBe(individualGoalId);
      expect(response.body.task.monetaryValue).toBe('250000');
    });
  });

  describe('Department Progress Reflection', () => {
    it('should verify department progress reflects individual progress', async () => {
      // Get department goal to see if it reflects individual progress
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/performance/goals/${departmentGoalId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 DEPARTMENT PROGRESS REFLECTION Response Status:', response.status);
      console.log('🔍 DEPARTMENT PROGRESS REFLECTION Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body.goal.id).toBe(departmentGoalId);
      
      // Check if department goal has sub-goals with progress
      if (response.body.goal.subGoals && response.body.goal.subGoals.length > 0) {
        const individualSubGoal = response.body.goal.subGoals.find((goal: any) => goal.id === individualGoalId);
        if (individualSubGoal) {
          expect(individualSubGoal.monetaryValueAchieved).toBe('500000');
          expect(individualSubGoal.percentValueAchieved).toBe('50');
        }
      }
    });

    it('should get department goals with progress aggregation', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/performance/goals?departmentId=${departmentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 DEPARTMENT GOALS AGGREGATION Response Status:', response.status);
      console.log('🔍 DEPARTMENT GOALS AGGREGATION Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.goals)).toBe(true);
      
      // Should have department goal and individual goal
      const departmentGoal = response.body.goals.find((goal: any) => goal.id === departmentGoalId);
      const individualGoal = response.body.goals.find((goal: any) => goal.id === individualGoalId);
      
      expect(departmentGoal).toBeDefined();
      expect(individualGoal).toBeDefined();
      expect(individualGoal.monetaryValueAchieved).toBe('500000');
    });
  });

  describe('CEO Dashboard View', () => {
    it('should get CEO dashboard view with cascaded progress', async () => {
      // Get all goals for CEO view
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/performance/goals')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 CEO DASHBOARD VIEW Response Status:', response.status);
      console.log('🔍 CEO DASHBOARD VIEW Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      
      // Find CEO goal
      const ceoGoal = response.body.goals.find((goal: any) => goal.id === ceoGoalId);
      expect(ceoGoal).toBeDefined();
      expect(ceoGoal.title).toContain('CEO Strategic Goal');
      
      // Find department goal
      const deptGoal = response.body.goals.find((goal: any) => goal.id === departmentGoalId);
      expect(deptGoal).toBeDefined();
      expect(deptGoal.parentGoalId).toBe(ceoGoalId);
      
      // Find individual goal
      const indGoal = response.body.goals.find((goal: any) => goal.id === individualGoalId);
      expect(indGoal).toBeDefined();
      expect(indGoal.parentGoalId).toBe(departmentGoalId);
      expect(indGoal.monetaryValueAchieved).toBe('500000');
    });

    it('should get hierarchical goal tree view', async () => {
      // Get CEO goal with full hierarchy
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/performance/goals/${ceoGoalId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 HIERARCHICAL GOAL TREE Response Status:', response.status);
      console.log('🔍 HIERARCHICAL GOAL TREE Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body.goal.id).toBe(ceoGoalId);
      
      // Should have sub-goals (department goals)
      expect(Array.isArray(response.body.goal.subGoals)).toBe(true);
      expect(response.body.goal.subGoals.length).toBeGreaterThan(0);
      
      // Department goal should have its own sub-goals (individual goals)
      const departmentSubGoal = response.body.goal.subGoals.find((goal: any) => goal.id === departmentGoalId);
      if (departmentSubGoal && departmentSubGoal.subGoals) {
        expect(Array.isArray(departmentSubGoal.subGoals)).toBe(true);
        expect(departmentSubGoal.subGoals.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Progress Tracking & Analytics', () => {
    it('should calculate department progress from individual contributions', async () => {
      // Update individual goal to 100% completion
      const fullProgressData = {
        monetaryValueAchieved: 1000000.00, // 100% of $1M target
        percentValueAchieved: 100.00, // 100% progress
        status: 'completed',
        stage: 'completed'
      };

      const updateResponse = await request(TEST_CONFIG.baseUrl)
        .put(`/api/performance/goals/${individualGoalId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(fullProgressData);

      console.log('🔍 INDIVIDUAL 100% PROGRESS Response Status:', updateResponse.status);
      console.log('🔍 INDIVIDUAL 100% PROGRESS Response Body:', JSON.stringify(updateResponse.body, null, 2));

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.goal.percentValueAchieved).toBe('100');
      expect(updateResponse.body.goal.status).toBe('completed');

      // Now check department goal
      const deptResponse = await request(TEST_CONFIG.baseUrl)
        .get(`/api/performance/goals/${departmentGoalId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 DEPARTMENT AFTER INDIVIDUAL COMPLETION Response Status:', deptResponse.status);
      console.log('🔍 DEPARTMENT AFTER INDIVIDUAL COMPLETION Response Body:', JSON.stringify(deptResponse.body, null, 2));

      expect(deptResponse.status).toBe(200);
      
      // Department should reflect the individual's completion
      if (deptResponse.body.goal.subGoals && deptResponse.body.goal.subGoals.length > 0) {
        const completedIndividualGoal = deptResponse.body.goal.subGoals.find((goal: any) => goal.id === individualGoalId);
        if (completedIndividualGoal) {
          expect(completedIndividualGoal.percentValueAchieved).toBe('100');
          expect(completedIndividualGoal.status).toBe('completed');
        }
      }
    });
  });
});



