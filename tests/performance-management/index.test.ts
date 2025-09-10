import { setupTests, cleanupTests } from './setup';

// Main test suite for Performance Management Module
describe('Performance Management Module - Complete Test Suite', () => {
  beforeAll(async () => {
    await setupTests();
  });

  afterAll(async () => {
    await cleanupTests();
  });

  // Import all test suites
  require('./auth.test');
  require('./kpi.test');
  require('./department.test');
  require('./goal.test');
  require('./task.test');
  require('./activity.test');
  require('./integration.test');
});



