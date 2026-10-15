import request from 'supertest';
import app from '../../src/app';

// Test configuration
export const TEST_CONFIG = {
  baseUrl: process.env.TEST_API_URL || 'http://localhost:3010',
  adminCredentials: {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  }
};

// Global test variables
export let authToken: string = '';
export let testKpiId: string = '';
export let testDepartmentId: string = '';
export let testGoalId: string = '';
export let testTaskId: string = '';
export let testActivityLogId: string = '';

// Helper function to get authenticated request
export const getAuthenticatedRequest = () => {
  return request(app).set('Authorization', `Bearer ${authToken}`);
};

// Helper function to login and get token
export const loginAdmin = async (): Promise<string> => {
  const response = await request(app)
    .post('/api/auth/login')
    .send(TEST_CONFIG.adminCredentials)
    .expect(200);

  const token = response.body?.data?.token || response.body?.token;
  if (!response.body.success || !token) {
    throw new Error('Failed to login admin user');
  }

  return token;
};

// Setup function to run before all tests
export const setupTests = async () => {
  try {
    authToken = await loginAdmin();
    console.log('✅ Admin authentication successful');
  } catch (error) {
    console.error('❌ Admin authentication failed:', error);
    throw error;
  }
};

// Cleanup function to run after all tests
export const cleanupTests = async () => {
  // Clean up test data if needed
  console.log('🧹 Test cleanup completed');
};

// Test data factories
export const createTestKpi = () => ({
  name: 'Test Revenue Growth',
  type: 'Metric',
  branch: 'main',
  weightValue: 25.50,
  hasUnit: true,
  unitCategory: 'currency',
  unit: 'USD',
  unitSymbol: '$',
  unitPosition: 'prefix'
});

export const createTestDepartment = () => ({
  name: 'Test Engineering',
  description: 'Test software development department',
  branch: 'main'
});

export const createTestGoal = (departmentId: string, kpiId?: string) => ({
  title: 'Test Revenue Goal',
  description: 'Test achieving 25% revenue growth',
  type: 'financial',
  category: 'revenue',
  departmentId,
  kpiId,
  monetaryValue: 1000000.00,
  percentValue: 25.00,
  status: 'active',
  priority: 'high',
  stage: 'planning',
  startDate: new Date('2025-01-01T00:00:00Z'),
  endDate: new Date('2025-12-31T23:59:59Z')
});

export const createTestTask = (goalId?: string) => ({
  title: 'Test Task Implementation',
  description: 'Test implementing new feature',
  team: ['user1', 'user2', 'user3'],
  stage: 'todo',
  date: new Date('2025-01-15T00:00:00Z'),
  priority: 'high',
  assets: 'test-files.zip',
  branch: 'main',
  department: 'Engineering',
  ruleset: 'agile',
  goalId,
  performanceCategory: 'business',
  isPerformanceTask: true,
  monetaryValue: 50000.00,
  percentValue: 5.00
});

export const createTestActivityLog = (goalId?: string, taskId?: string, kpiId?: string) => ({
  activityType: 'goal_update',
  title: 'Test Activity Update',
  description: 'Test updating goal progress',
  goalId,
  taskId,
  kpiId,
  monetaryValueAchieved: 500000.00,
  percentValueAchieved: 50.00
});
