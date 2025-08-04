# Accounting Module Test Documentation

## Overview

This document provides comprehensive testing documentation for the accounting module, covering VAT calculations, double-entry bookkeeping, expense management, and API endpoints.

## Test Structure

```
src/tests/accounting/
├── VATService.test.ts           # VAT calculation logic tests
├── JournalEntryService.test.ts  # Double-entry bookkeeping tests
├── ExpenseService.test.ts       # Expense business logic tests
└── controllers/
    └── ExpenseController.test.ts # API endpoint integration tests
```

## Test Categories

### 1. VATService Tests (`VATService.test.ts`)

**Purpose**: Verify VAT calculation logic for Zimbabwean tax law (14.5%)

**Key Test Cases**:
- ✅ VAT calculation for various amounts
- ✅ Decimal amount handling
- ✅ Zero and negative amount edge cases
- ✅ Prisma Decimal type compatibility
- ✅ Total calculation with VAT
- ✅ VAT extraction from total amounts
- ✅ VAT eligibility validation
- ✅ Rate consistency across calculations

**Example Test**:
```typescript
it('should calculate VAT correctly for a given amount', () => {
  const amount = 1000;
  const expectedVAT = 145; // 14.5% of 1000
  
  const result = VATService.calculateVAT(amount);
  
  expect(result).toBe(expectedVAT);
});
```

### 2. JournalEntryService Tests (`JournalEntryService.test.ts`)

**Purpose**: Verify double-entry bookkeeping logic and journal entry creation

**Key Test Cases**:
- ✅ Expense journal entry creation with VAT
- ✅ Expense journal entry without VAT (non-taxable)
- ✅ Account lookup validation (expense, VAT input, accounts payable)
- ✅ Journal entry balance validation
- ✅ Error handling for missing accounts
- ✅ Journal entry retrieval with lines
- ✅ Date range filtering

**Example Test**:
```typescript
it('should create expense journal entry with VAT correctly', async () => {
  const params = {
    expenseId: 'expense-id',
    amount: 1000,
    vatAmount: 145,
    totalAmount: 1145,
    categoryId: 'category-id',
    vendorId: 'vendor-id',
    currencyId: 'currency-id',
    isTaxable: true,
    description: 'Legal Fees',
    createdById: 'user-id'
  };

  const result = await JournalEntryService.createExpenseJournalEntry(params);

  expect(result.journalEntryLines).toHaveLength(3);
  // Verify expense account debit
  expect(result.journalEntryLines[0].debitAmount).toBe(1000);
  // Verify VAT input debit
  expect(result.journalEntryLines[1].debitAmount).toBe(145);
  // Verify accounts payable credit
  expect(result.journalEntryLines[2].creditAmount).toBe(1145);
});
```

### 3. ExpenseService Tests (`ExpenseService.test.ts`)

**Purpose**: Verify expense creation and management business logic

**Key Test Cases**:
- ✅ Expense creation with VAT calculation
- ✅ Expense creation without VAT (non-taxable)
- ✅ Vendor, category, and currency validation
- ✅ Data validation (required fields, positive amounts)
- ✅ Expense retrieval with relations
- ✅ Expense pagination and filtering
- ✅ Expense summary statistics
- ✅ Error handling for invalid data

**Example Test**:
```typescript
it('should create expense with VAT correctly', async () => {
  const params = {
    vendorId: 'vendor-id',
    categoryId: 'category-id',
    amount: 1000,
    currencyId: 'currency-id',
    transactionDate: new Date(),
    description: 'Legal consultation',
    receiptNumber: 'RCP-001',
    isTaxable: true,
    createdById: 'user-id'
  };

  const result = await ExpenseService.createExpense(params);

  expect(result.amount).toBe(1000);
  expect(result.vatAmount).toBe(145);
  expect(result.totalAmount).toBe(1145);
  expect(result.status).toBe('POSTED');
});
```

### 4. ExpenseController Tests (`ExpenseController.test.ts`)

**Purpose**: Verify API endpoint functionality and request/response handling

**Key Test Cases**:
- ✅ POST /api/accounting/expenses - Create expense
- ✅ GET /api/accounting/expenses - List expenses with pagination
- ✅ GET /api/accounting/expenses/:id - Get expense by ID
- ✅ PUT /api/accounting/expenses/:id - Update expense
- ✅ DELETE /api/accounting/expenses/:id - Delete expense
- ✅ POST /api/accounting/expenses/calculate-vat - VAT preview
- ✅ GET /api/accounting/expenses/summary - Expense summary
- ✅ Error handling and validation
- ✅ Authentication and authorization

**Example Test**:
```typescript
it('should create expense successfully', async () => {
  mockRequest.body = {
    vendorId: 'vendor-id',
    categoryId: 'category-id',
    amount: 1000,
    currencyId: 'currency-id',
    transactionDate: new Date(),
    description: 'Legal consultation',
    receiptNumber: 'RCP-001',
    isTaxable: true
  };

  await expenseController.createExpense(mockRequest as any, mockResponse as Response, mockNext);

  expect(mockResponse.status).toHaveBeenCalledWith(201);
  expect(mockResponse.json).toHaveBeenCalledWith({
    success: true,
    message: 'Expense created successfully',
    data: mockExpense
  });
});
```

## Running Tests

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Only Accounting Tests
```bash
npm run test:accounting
```

## Test Configuration

### Jest Configuration (`jest.config.js`)
- **Preset**: `ts-jest` for TypeScript support
- **Test Environment**: Node.js
- **Coverage**: HTML, LCOV, and text reports
- **Timeout**: 10 seconds per test
- **Mocking**: Automatic mock restoration

### Test Setup (`src/tests/setup.ts`)
- Environment variable configuration
- Prisma client mocking
- Logger mocking
- Global test utilities

## Test Coverage Goals

| Component | Target Coverage | Current Status |
|-----------|----------------|----------------|
| VATService | 100% | ✅ Complete |
| JournalEntryService | 95% | ✅ Complete |
| ExpenseService | 90% | ✅ Complete |
| ExpenseController | 85% | ✅ Complete |

## Test Data Examples

### VAT Calculation Examples
```typescript
// Input: 1000 ZWL, Taxable: true
// Output: VAT = 145 ZWL, Total = 1145 ZWL

// Input: 100.50 ZWL, Taxable: true  
// Output: VAT = 14.57 ZWL, Total = 115.07 ZWL

// Input: 500 ZWL, Taxable: false
// Output: VAT = 0 ZWL, Total = 500 ZWL
```

### Journal Entry Examples
```typescript
// Taxable Expense (1000 ZWL)
// Dr Legal Fees 1000
// Dr VAT Input 145
// Cr Accounts Payable 1145

// Non-taxable Expense (1000 ZWL)
// Dr Legal Fees 1000
// Cr Accounts Payable 1000
```

### API Request Examples
```typescript
// Create Expense
POST /api/accounting/expenses
{
  "vendorId": "vendor-123",
  "categoryId": "category-456", 
  "amount": 1000,
  "currencyId": "currency-789",
  "transactionDate": "2024-01-15",
  "description": "Legal consultation",
  "receiptNumber": "RCP-001",
  "isTaxable": true
}

// VAT Preview
POST /api/accounting/expenses/calculate-vat
{
  "amount": 1000,
  "isTaxable": true
}
```

## Error Handling Tests

### Validation Errors
- Missing required fields
- Invalid data types
- Negative amounts
- Non-existent references

### Business Logic Errors
- Inactive vendors/categories/currencies
- Missing Chart of Accounts
- Database connection failures
- Journal entry balance violations

### API Error Responses
```typescript
// 400 Bad Request
{
  "success": false,
  "message": "Vendor ID is required"
}

// 404 Not Found
{
  "success": false,
  "message": "Expense not found"
}

// 500 Internal Server Error
{
  "success": false,
  "message": "Database connection failed"
}
```

## Performance Considerations

### Test Performance
- Mock database operations for fast execution
- Isolate business logic from external dependencies
- Use test-specific data sets
- Parallel test execution where possible

### Production Performance
- VAT calculations optimized for decimal precision
- Database queries with proper indexing
- Pagination for large datasets
- Caching for frequently accessed data

## Continuous Integration

### GitHub Actions Example
```yaml
name: Accounting Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:coverage
      - run: npm run test:accounting
```

## Maintenance

### Adding New Tests
1. Follow existing test patterns
2. Use descriptive test names
3. Mock external dependencies
4. Test both success and error cases
5. Update documentation

### Updating Tests
1. Run tests before making changes
2. Update mocks when interfaces change
3. Maintain test data consistency
4. Review coverage reports

## Troubleshooting

### Common Issues
- **Mock not working**: Check import paths and mock setup
- **Type errors**: Ensure TypeScript configuration includes test files
- **Database errors**: Verify Prisma client mocking
- **Timeout errors**: Increase Jest timeout for complex tests

### Debug Commands
```bash
# Run specific test file
npm test -- VATService.test.ts

# Run with verbose output
npm test -- --verbose

# Run with coverage for specific file
npm test -- --coverage --testPathPattern=VATService
```

## Conclusion

This comprehensive test suite ensures the accounting module's reliability, accuracy, and maintainability. The tests cover all critical business logic, API endpoints, and edge cases, providing confidence in the system's financial calculations and data integrity. 