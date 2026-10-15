import request from 'supertest';

const TEST_CONFIG = {
  baseUrl: process.env.TEST_API_URL || 'http://localhost:3010',
  adminCredentials: {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  }
};

describe('CEO Dashboard Tests', () => {
  let authToken: string;
  let fundId: string;
  let portfolioCompanyId: string;
  let departmentId: string;
  let taskId: string;

  beforeAll(async () => {
    // Login as admin
    const loginResponse = await request(TEST_CONFIG.baseUrl)
      .post('/api/auth/login')
      .send(TEST_CONFIG.adminCredentials);

    authToken = loginResponse.body.token;
    console.log('✅ Admin authentication successful');

    // Create test data for dashboard
    await createTestData();
  });

  async function createTestData() {
    // Create test fund
    const fundData = {
      name: `CEO Dashboard Test Fund ${Date.now()}`,
      description: 'Test fund for CEO dashboard',
      totalAmount: 10000000.00,
      minInvestment: 100000.00,
      maxInvestment: 1000000.00,
      focusIndustries: ['Technology', 'Fintech'],
      applicationStart: new Date('2024-01-01T00:00:00Z'),
      applicationEnd: new Date('2024-12-31T23:59:59Z'),
      status: 'OPEN'
    };
    
    const fundResponse = await request(TEST_CONFIG.baseUrl)
      .post('/api/funds')
      .set('Authorization', `Bearer ${authToken}`)
      .send(fundData);
    fundId = fundResponse.body.fund.id;

    // Create test portfolio company
    const portfolioData = {
      name: `CEO Dashboard Test Company ${Date.now()}`,
      registrationNumber: `REG-${Date.now()}`,
      industry: 'Technology',
      foundingDate: new Date('2020-01-01T00:00:00Z'),
      address: 'Test Address',
      annualRevenue: 5000000.00,
      fundId: fundId
    };
    
    const portfolioResponse = await request(TEST_CONFIG.baseUrl)
      .post('/api/portfolio-companies')
      .set('Authorization', `Bearer ${authToken}`)
      .send(portfolioData);
    portfolioCompanyId = portfolioResponse.body.portfolioCompany.id;

    // Create test department
    const departmentData = {
      name: `CEO Dashboard Test Department ${Date.now()}`,
      description: 'Test department for CEO dashboard',
      branch: 'main'
    };
    
    const departmentResponse = await request(TEST_CONFIG.baseUrl)
      .post('/api/departments')
      .set('Authorization', `Bearer ${authToken}`)
      .send(departmentData);
    departmentId = departmentResponse.body.department.id;

    // Create test task
    const taskData = {
      title: `CEO Dashboard Test Task ${Date.now()}`,
      description: 'Test task for CEO dashboard',
      team: ['user1', 'user2'],
      stage: 'in_progress',
      date: new Date('2025-12-31T23:59:59Z'),
      priority: 'high',
      branch: 'main',
      department: 'Test Department',
      ruleset: 'agile'
    };
    
    const taskResponse = await request(TEST_CONFIG.baseUrl)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send(taskData);
    taskId = taskResponse.body.task.id;
  }

  describe('CEO Dashboard - Main Dashboard', () => {
    it('should get comprehensive CEO dashboard data', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 CEO DASHBOARD Response Status:', response.status);
      console.log('🔍 CEO DASHBOARD Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('financialPerformance');
      expect(response.body.data).toHaveProperty('investmentPipeline');
      expect(response.body.data).toHaveProperty('portfolioHealth');
      expect(response.body.data).toHaveProperty('operationalMetrics');
      expect(response.body.data).toHaveProperty('hierarchicalTaskView');
      expect(response.body.data).toHaveProperty('keyInsights');
      expect(response.body.data).toHaveProperty('lastUpdated');

      // Verify financial performance structure
      expect(response.body.data.financialPerformance).toHaveProperty('totalAUM');
      expect(response.body.data.financialPerformance).toHaveProperty('totalFunds');
      expect(response.body.data.financialPerformance).toHaveProperty('activeFunds');
      expect(response.body.data.financialPerformance).toHaveProperty('fundPerformance');
      expect(response.body.data.financialPerformance).toHaveProperty('averageIRR');
      expect(response.body.data.financialPerformance).toHaveProperty('averageTVPI');
      expect(response.body.data.financialPerformance).toHaveProperty('averageDPI');

      // Verify investment pipeline structure
      expect(response.body.data.investmentPipeline).toHaveProperty('totalPipelineValue');
      expect(response.body.data.investmentPipeline).toHaveProperty('totalDeals');
      expect(response.body.data.investmentPipeline).toHaveProperty('dealsByStage');
      expect(response.body.data.investmentPipeline).toHaveProperty('averageTimeToClose');
      expect(response.body.data.investmentPipeline).toHaveProperty('conversionRates');

      // Verify portfolio health structure
      expect(response.body.data.portfolioHealth).toHaveProperty('totalPortfolioValue');
      expect(response.body.data.portfolioHealth).toHaveProperty('totalCompanies');
      expect(response.body.data.portfolioHealth).toHaveProperty('averageValuation');
      expect(response.body.data.portfolioHealth).toHaveProperty('sectorBreakdown');
      expect(response.body.data.portfolioHealth).toHaveProperty('topPerformers');
      expect(response.body.data.portfolioHealth).toHaveProperty('bottomPerformers');

      // Verify operational metrics structure
      expect(response.body.data.operationalMetrics).toHaveProperty('totalExpenses');
      expect(response.body.data.operationalMetrics).toHaveProperty('budgetedExpenses');
      expect(response.body.data.operationalMetrics).toHaveProperty('expenseVariance');
      expect(response.body.data.operationalMetrics).toHaveProperty('expenseVariancePercentage');
      expect(response.body.data.operationalMetrics).toHaveProperty('employeeHeadcount');
      expect(response.body.data.operationalMetrics).toHaveProperty('departmentBreakdown');
      expect(response.body.data.operationalMetrics).toHaveProperty('taskSummary');

      // Verify hierarchical task view structure
      expect(response.body.data.hierarchicalTaskView).toHaveProperty('totalTasks');
      expect(response.body.data.hierarchicalTaskView).toHaveProperty('completedTasks');
      expect(response.body.data.hierarchicalTaskView).toHaveProperty('inProgressTasks');
      expect(response.body.data.hierarchicalTaskView).toHaveProperty('overdueTasks');
      expect(response.body.data.hierarchicalTaskView).toHaveProperty('assignedTasks');
      expect(response.body.data.hierarchicalTaskView).toHaveProperty('tasksByDepartment');

      // Verify key insights structure
      expect(Array.isArray(response.body.data.keyInsights)).toBe(true);
      response.body.data.keyInsights.forEach((insight: any) => {
        expect(insight).toHaveProperty('type');
        expect(insight).toHaveProperty('title');
        expect(insight).toHaveProperty('description');
        expect(['success', 'warning', 'error', 'info']).toContain(insight.type);
      });
    });
  });

  describe('CEO Dashboard - Drill-down Functionality', () => {
    it('should get fund drill-down data', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/ceo-dashboard/drill-down/fund/${fundId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 FUND DRILL-DOWN Response Status:', response.status);
      console.log('🔍 FUND DRILL-DOWN Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('type', 'fund');
      expect(response.body.data).toHaveProperty('id', fundId);
      expect(response.body.data).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('relatedData');
      expect(response.body.data.data).toHaveProperty('fund');
      expect(response.body.data.data).toHaveProperty('performance');
    });

    it('should get portfolio drill-down data', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/ceo-dashboard/drill-down/portfolio/${portfolioCompanyId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 PORTFOLIO DRILL-DOWN Response Status:', response.status);
      console.log('🔍 PORTFOLIO DRILL-DOWN Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('type', 'portfolio');
      expect(response.body.data).toHaveProperty('id', portfolioCompanyId);
      expect(response.body.data).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('relatedData');
    });

    it('should get department drill-down data', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/ceo-dashboard/drill-down/department/${departmentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 DEPARTMENT DRILL-DOWN Response Status:', response.status);
      console.log('🔍 DEPARTMENT DRILL-DOWN Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('type', 'department');
      expect(response.body.data).toHaveProperty('id', departmentId);
      expect(response.body.data).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('relatedData');
    });

    it('should get task drill-down data', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/ceo-dashboard/drill-down/task/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 TASK DRILL-DOWN Response Status:', response.status);
      console.log('🔍 TASK DRILL-DOWN Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('type', 'task');
      expect(response.body.data).toHaveProperty('id', taskId);
      expect(response.body.data).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('relatedData');
    });

    it('should handle invalid drill-down type', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/ceo-dashboard/drill-down/invalid/test-id`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 INVALID DRILL-DOWN Response Status:', response.status);
      console.log('🔍 INVALID DRILL-DOWN Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('Invalid drill-down type');
    });
  });

  describe('CEO Dashboard - Fund Performance', () => {
    it('should get specific fund performance', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/ceo-dashboard/fund-performance/${fundId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 FUND PERFORMANCE Response Status:', response.status);
      console.log('🔍 FUND PERFORMANCE Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('fundId', fundId);
      expect(response.body.data).toHaveProperty('fundName');
      expect(response.body.data).toHaveProperty('totalAmount');
      expect(response.body.data).toHaveProperty('remainingAmount');
      expect(response.body.data).toHaveProperty('disbursedAmount');
      expect(response.body.data).toHaveProperty('irr');
      expect(response.body.data).toHaveProperty('tvpi');
      expect(response.body.data).toHaveProperty('dpi');
      expect(response.body.data).toHaveProperty('portfolioCompanies');
      expect(response.body.data).toHaveProperty('totalInvestments');
      expect(response.body.data).toHaveProperty('averageInvestmentSize');
      expect(response.body.data).toHaveProperty('status');
    });

    it('should get all funds performance', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/funds-performance')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 ALL FUNDS PERFORMANCE Response Status:', response.status);
      console.log('🔍 ALL FUNDS PERFORMANCE Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('aum');
      expect(response.body.data).toHaveProperty('fundPerformance');
      expect(Array.isArray(response.body.data.fundPerformance)).toBe(true);
      expect(response.body.data.aum).toHaveProperty('totalAUM');
      expect(response.body.data.aum).toHaveProperty('totalFunds');
      expect(response.body.data.aum).toHaveProperty('activeFunds');
      expect(response.body.data.aum).toHaveProperty('totalDisbursed');
      expect(response.body.data.aum).toHaveProperty('totalRemaining');
      expect(response.body.data.aum).toHaveProperty('fundBreakdown');
    });
  });

  describe('CEO Dashboard - Pipeline Analytics', () => {
    it('should get investment pipeline analytics', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/pipeline-analytics')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 PIPELINE ANALYTICS Response Status:', response.status);
      console.log('🔍 PIPELINE ANALYTICS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalPipelineValue');
      expect(response.body.data).toHaveProperty('totalDeals');
      expect(response.body.data).toHaveProperty('dealsByStage');
      expect(response.body.data).toHaveProperty('averageTimeToClose');
      expect(response.body.data).toHaveProperty('conversionRates');
      expect(Array.isArray(response.body.data.dealsByStage)).toBe(true);
      expect(Array.isArray(response.body.data.conversionRates)).toBe(true);
    });
  });

  describe('CEO Dashboard - Portfolio Health', () => {
    it('should get portfolio health metrics', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/portfolio-health')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 PORTFOLIO HEALTH Response Status:', response.status);
      console.log('🔍 PORTFOLIO HEALTH Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalPortfolioValue');
      expect(response.body.data).toHaveProperty('totalCompanies');
      expect(response.body.data).toHaveProperty('averageValuation');
      expect(response.body.data).toHaveProperty('sectorBreakdown');
      expect(response.body.data).toHaveProperty('topPerformers');
      expect(response.body.data).toHaveProperty('bottomPerformers');
      expect(Array.isArray(response.body.data.sectorBreakdown)).toBe(true);
      expect(Array.isArray(response.body.data.topPerformers)).toBe(true);
      expect(Array.isArray(response.body.data.bottomPerformers)).toBe(true);
    });
  });

  describe('CEO Dashboard - Operational Metrics', () => {
    it('should get operational metrics', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/operational-metrics')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 OPERATIONAL METRICS Response Status:', response.status);
      console.log('🔍 OPERATIONAL METRICS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalExpenses');
      expect(response.body.data).toHaveProperty('budgetedExpenses');
      expect(response.body.data).toHaveProperty('expenseVariance');
      expect(response.body.data).toHaveProperty('expenseVariancePercentage');
      expect(response.body.data).toHaveProperty('employeeHeadcount');
      expect(response.body.data).toHaveProperty('departmentBreakdown');
      expect(response.body.data).toHaveProperty('taskSummary');
      expect(Array.isArray(response.body.data.departmentBreakdown)).toBe(true);
      expect(response.body.data.taskSummary).toHaveProperty('total');
      expect(response.body.data.taskSummary).toHaveProperty('completed');
      expect(response.body.data.taskSummary).toHaveProperty('inProgress');
      expect(response.body.data.taskSummary).toHaveProperty('overdue');
      expect(response.body.data.taskSummary).toHaveProperty('assigned');
    });
  });

  describe('CEO Dashboard - Hierarchical Task View', () => {
    it('should get hierarchical task view', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/hierarchical-tasks')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 HIERARCHICAL TASKS Response Status:', response.status);
      console.log('🔍 HIERARCHICAL TASKS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('totalTasks');
      expect(response.body.data).toHaveProperty('completedTasks');
      expect(response.body.data).toHaveProperty('inProgressTasks');
      expect(response.body.data).toHaveProperty('overdueTasks');
      expect(response.body.data).toHaveProperty('assignedTasks');
      expect(response.body.data).toHaveProperty('tasksByDepartment');
      expect(Array.isArray(response.body.data.tasksByDepartment)).toBe(true);
    });

    it('should get hierarchical task view for specific department', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get(`/api/ceo-dashboard/hierarchical-tasks?departmentId=${departmentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 DEPARTMENT TASKS Response Status:', response.status);
      console.log('🔍 DEPARTMENT TASKS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('department');
      expect(response.body.data).toHaveProperty('tasks');
      expect(response.body.data).toHaveProperty('summary');
      expect(Array.isArray(response.body.data.tasks)).toBe(true);
      expect(response.body.data.summary).toHaveProperty('total');
      expect(response.body.data.summary).toHaveProperty('completed');
      expect(response.body.data.summary).toHaveProperty('inProgress');
      expect(response.body.data.summary).toHaveProperty('overdue');
      expect(response.body.data.summary).toHaveProperty('assigned');
    });
  });

  describe('CEO Dashboard - Key Insights', () => {
    it('should get key insights and alerts', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/key-insights')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 KEY INSIGHTS Response Status:', response.status);
      console.log('🔍 KEY INSIGHTS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('insights');
      expect(response.body.data).toHaveProperty('lastUpdated');
      expect(Array.isArray(response.body.data.insights)).toBe(true);
      
      response.body.data.insights.forEach((insight: any) => {
        expect(insight).toHaveProperty('type');
        expect(insight).toHaveProperty('title');
        expect(insight).toHaveProperty('description');
        expect(['success', 'warning', 'error', 'info']).toContain(insight.type);
      });
    });
  });

  describe('CEO Dashboard - Real-time Metrics', () => {
    it('should get real-time metrics for specific metrics', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/real-time-metrics?metrics=aum,pipeline')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 REAL-TIME METRICS Response Status:', response.status);
      console.log('🔍 REAL-TIME METRICS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('metrics');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data.metrics).toHaveProperty('aum');
      expect(response.body.data.metrics).toHaveProperty('pipeline');
    });

    it('should handle missing metrics parameter', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/real-time-metrics')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 MISSING METRICS Response Status:', response.status);
      console.log('🔍 MISSING METRICS Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('Metrics parameter is required');
    });
  });

  describe('CEO Dashboard - Error Handling', () => {
    it('should handle unauthorized access', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard');

      console.log('🔍 UNAUTHORIZED Response Status:', response.status);
      console.log('🔍 UNAUTHORIZED Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle invalid fund ID for performance', async () => {
      const response = await request(TEST_CONFIG.baseUrl)
        .get('/api/ceo-dashboard/fund-performance/invalid-fund-id')
        .set('Authorization', `Bearer ${authToken}`);

      console.log('🔍 INVALID FUND ID Response Status:', response.status);
      console.log('🔍 INVALID FUND ID Response Body:', JSON.stringify(response.body, null, 2));

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('Fund with ID invalid-fund-id not found');
    });
  });
});


