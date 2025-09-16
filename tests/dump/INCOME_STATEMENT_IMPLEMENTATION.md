# Income Statement Implementation

## Overview

This document describes the implementation of the Income Statement functionality in the accounting system. The income statement is a financial report that shows the company's revenue, expenses, and net income for a specific period.

## Architecture

### Service Layer
- **IncomeStatementService**: Core business logic for generating income statements
- **JournalEntryService**: Existing service for journal entry management

### Controller Layer
- **IncomeStatementController**: HTTP request handling and validation

### Route Layer
- **incomeStatementRoutes**: API endpoint definitions with Swagger documentation

## Key Features

### 1. Income Statement Generation
- Calculates revenue and expenses from posted journal entries
- Supports multiple currencies
- Filters by date range
- Only includes POSTED journal entries (not PENDING or VOID)

### 2. Account Classification
- **Revenue Accounts**: Credits increase, Debits decrease
- **Expense Accounts**: Debits increase, Credits decrease
- Filters by `financialStatement = "Income Statement"`

### 3. Multiple Report Types
- **Summary**: High-level totals only
- **Detailed**: Includes transaction breakdown per account
- **Comparative**: Multiple periods side-by-side

## API Endpoints

### POST `/api/accounting/income-statement/generate`
Generate a complete income statement for a specific period.

**Request Body:**
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "currencyId": "optional-currency-id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Income statement generated successfully",
  "data": {
    "period": {
      "startDate": "2024-01-01T00:00:00.000Z",
      "endDate": "2024-01-31T23:59:59.999Z"
    },
    "revenue": {
      "accounts": [...],
      "total": 50000.00
    },
    "expenses": {
      "accounts": [...],
      "total": 30000.00
    },
    "netIncome": 20000.00,
    "currency": {
      "id": "currency-id",
      "code": "USD",
      "name": "US Dollar"
    },
    "generatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### POST `/api/accounting/income-statement/detailed`
Get detailed income statement with transaction breakdown.

### POST `/api/accounting/income-statement/summary`
Get income statement summary (high-level totals).

### POST `/api/accounting/income-statement/comparative`
Compare income statements across multiple periods.

**Request Body:**
```json
{
  "periods": [
    {
      "startDate": "2024-01-01",
      "endDate": "2024-01-31"
    },
    {
      "startDate": "2024-02-01",
      "endDate": "2024-02-29"
    }
  ]
}
```

### GET `/api/accounting/income-statement`
Get income statement using query parameters.

**Query Parameters:**
- `startDate`: Start date (required)
- `endDate`: End date (required)
- `currencyId`: Currency ID (optional)
- `type`: Report type - "summary" or "detailed" (default: "summary")

## Database Schema

### ChartOfAccounts
```sql
CREATE TABLE chart_of_accounts (
  id VARCHAR(191) PRIMARY KEY,
  accountNo VARCHAR(191) UNIQUE NOT NULL,
  accountName VARCHAR(191) NOT NULL,
  accountType VARCHAR(191) NOT NULL,
  financialStatement VARCHAR(191) NOT NULL,
  notes TEXT,
  parentId VARCHAR(191),
  isActive BOOLEAN DEFAULT true,
  createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
);
```

### JournalEntry
```sql
CREATE TABLE journal_entries (
  id VARCHAR(191) PRIMARY KEY,
  transactionDate DATETIME(3) NOT NULL,
  referenceNumber VARCHAR(191) UNIQUE NOT NULL,
  description VARCHAR(191) NOT NULL,
  totalAmount DECIMAL(15,2) NOT NULL,
  currencyId VARCHAR(191) NOT NULL,
  status VARCHAR(191) DEFAULT 'PENDING',
  createdById VARCHAR(191) NOT NULL,
  createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
);
```

### JournalEntryLine
```sql
CREATE TABLE journal_entry_lines (
  id VARCHAR(191) PRIMARY KEY,
  journalEntryId VARCHAR(191) NOT NULL,
  chartOfAccountId VARCHAR(191) NOT NULL,
  debitAmount DECIMAL(15,2) DEFAULT 0.00,
  creditAmount DECIMAL(15,2) DEFAULT 0.00,
  description VARCHAR(191) NOT NULL,
  vatAmount DECIMAL(15,2),
  createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
);
```

## Business Logic

### Account Balance Calculation
1. **Revenue Accounts**: Net Amount = Total Credits - Total Debits
2. **Expense Accounts**: Net Amount = Total Debits - Total Credits

### Filtering Logic
- Only includes journal entries with `status = "POSTED"`
- Filters by `financialStatement = "Income Statement"`
- Groups by `accountType` (Revenue/Expense)
- Supports currency filtering

### Net Income Calculation
```
Net Income = Total Revenue - Total Expenses
```

## Security & Permissions

### Authentication
- All endpoints require JWT authentication
- Token must be included in Authorization header: `Bearer <token>`

### Authorization
- Requires `admin` or `accountant` role
- Implemented via `permissionAuth` middleware

## Error Handling

### Common Error Scenarios
1. **Invalid Date Range**: Start date must be before end date
2. **No Posted Entries**: No journal entries found for the period
3. **Currency Not Found**: Invalid or inactive currency
4. **Unauthorized Access**: Insufficient permissions

### Error Response Format
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error information"
}
```

## Testing

### Test Script
Run the test script to verify functionality:
```powershell
.\tests\accounting\test-income-statement.ps1
```

### Test Coverage
- Basic income statement generation
- Detailed income statement with transactions
- Summary income statement
- Comparative income statement
- GET endpoint with query parameters
- Error handling scenarios

## Future Enhancements

### Planned Features
1. **Balance Sheet Integration**: Connect with balance sheet calculations
2. **Cash Flow Statement**: Add cash flow statement generation
3. **Export Functionality**: PDF/Excel export capabilities
4. **Real-time Updates**: WebSocket integration for live updates
5. **Advanced Filtering**: Filter by account categories, vendors, customers
6. **Audit Trail**: Track who generated which reports

### Scalability Considerations
- The current implementation processes all journal entries in memory
- For large datasets, consider pagination or streaming
- Add caching for frequently accessed reports
- Consider database views for complex calculations

## Integration with Existing System

### Journal Entry Workflow
1. Create journal entries (PENDING status)
2. Post journal entries (POSTED status)
3. Generate income statements from POSTED entries only

### Chart of Accounts
- Revenue accounts must have `financialStatement = "Income Statement"`
- Expense accounts must have `financialStatement = "Income Statement"`
- Account types must be "Revenue" or "Expense"

### Currency Support
- Defaults to active currency if not specified
- Supports multi-currency reporting
- All amounts stored as Decimal(15,2)

## Maintenance

### Data Integrity
- Regular validation of account balances
- Reconciliation with general ledger
- Audit trail for report generation

### Performance Optimization
- Index on `transactionDate`, `status`, `currencyId`
- Consider materialized views for complex reports
- Implement caching for frequently accessed data

## Conclusion

The income statement implementation provides a solid foundation for financial reporting. The modular design allows for easy extension and maintenance. The separation of concerns between service, controller, and route layers ensures maintainability and testability.

The implementation follows proper accounting principles and integrates seamlessly with the existing journal entry system. Future enhancements can be added without modifying the core logic, making it a scalable solution for financial reporting needs. 