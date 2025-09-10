# Performance Management Module Tests

This directory contains comprehensive tests for the Performance Management Module using [supertest](https://www.npmjs.com/package/supertest).

## Test Structure

### Test Files
- `setup.ts` - Test configuration and helper functions
- `auth.test.ts` - Authentication tests
- `kpi.test.ts` - KPI CRUD tests
- `department.test.ts` - Department CRUD tests
- `goal.test.ts` - Performance Goal CRUD tests
- `task.test.ts` - Task CRUD and functionality tests
- `activity.test.ts` - Activity Log CRUD tests
- `integration.test.ts` - End-to-end integration tests
- `index.test.ts` - Main test suite runner

### Test Configuration
- `jest.config.js` - Jest configuration for the test suite
- `README.md` - This documentation file

## Test Coverage

### CRUD Operations (Tested for each module)
- ✅ **CREATE** - Create new records
- ✅ **READ** - Get single record by ID
- ✅ **READ ALL** - Get all records with pagination
- ✅ **UPDATE** - Update existing records
- ✅ **DELETE** - Delete records
- ✅ **STATISTICS** - Get module statistics

### Functionality Tests
- ✅ **Authentication** - Bearer token validation
- ✅ **Overdue Logic** - Task overdue detection and handling
- ✅ **Progress Tracking** - Monetary and percentage progress updates
- ✅ **Goal Hierarchy** - Parent-child goal relationships
- ✅ **KPI Integration** - KPI association with goals
- ✅ **Activity Logging** - Comprehensive activity tracking

### Integration Tests
- ✅ **End-to-End Workflow** - Complete KPI → Department → Goal → Task → Activity flow
- ✅ **Relationship Validation** - Proper foreign key relationships
- ✅ **Cascade Operations** - Proper handling of dependent records
- ✅ **Error Handling** - Invalid data and relationship handling

## Running Tests

### Prerequisites
1. Ensure the application is running on the configured port
2. Admin credentials are available:
   - Email: `admin@nvccz.co.zw`
   - Password: `admin123`

### Run All Tests
```bash
npm test -- tests/performance-management
```

### Run Specific Test Files
```bash
# Authentication tests
npm test -- tests/performance-management/auth.test.ts

# KPI tests
npm test -- tests/performance-management/kpi.test.ts

# Department tests
npm test -- tests/performance-management/department.test.ts

# Performance Goal tests
npm test -- tests/performance-management/goal.test.ts

# Task tests
npm test -- tests/performance-management/task.test.ts

# Activity Log tests
npm test -- tests/performance-management/activity.test.ts

# Integration tests
npm test -- tests/performance-management/integration.test.ts
```

### Run with Coverage
```bash
npm test -- --coverage tests/performance-management
```

## Test Data

### Test Credentials
- **Admin Email**: `admin@nvccz.co.zw`
- **Admin Password**: `admin123`

### Test Data Factory
The `setup.ts` file provides factory functions for creating test data:
- `createTestKpi()` - Creates test KPI data
- `createTestDepartment()` - Creates test department data
- `createTestGoal()` - Creates test performance goal data
- `createTestTask()` - Creates test task data
- `createTestActivityLog()` - Creates test activity log data

## Expected Results

### Success Criteria
- ✅ All CRUD operations return expected status codes (200, 201, 404)
- ✅ All authentication tests pass
- ✅ All relationship validations work correctly
- ✅ Overdue logic functions properly
- ✅ Progress tracking updates correctly
- ✅ Statistics endpoints return valid data
- ✅ Error handling works as expected

### Test Output
Each test suite provides detailed output including:
- Test execution time
- Pass/fail status for each test
- Coverage reports (when enabled)
- Error details for failed tests

## Troubleshooting

### Common Issues
1. **Authentication Failures**: Verify admin credentials are correct
2. **Database Connection**: Ensure the application can connect to the database
3. **Port Conflicts**: Check that the application is running on the expected port
4. **Timeout Issues**: Increase timeout in jest.config.js if needed

### Debug Mode
Run tests with verbose output:
```bash
npm test -- --verbose tests/performance-management
```

## Dependencies

- `supertest` - HTTP assertion library
- `@types/supertest` - TypeScript definitions
- `jest` - Test framework
- `ts-jest` - TypeScript preprocessor for Jest

## Notes

- Tests are designed to be independent and can run in any order
- Test data is cleaned up after each test suite
- All tests use Bearer token authentication
- Tests cover both success and error scenarios
- Integration tests verify end-to-end workflows



