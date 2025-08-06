# Cash Flow Statement Implementation

## Overview

The Cash Flow Statement implementation provides comprehensive financial reporting capabilities that categorize and analyze cash movements into three main activities: Operating, Investing, and Financing. This follows standard accounting principles and provides detailed insights into a company's liquidity and cash management.

## Architecture

The implementation follows a modular architecture with separate concerns:

### File Structure
```
src/services/
├── CashFlowService.ts                    # Main service facade
└── cashflow/
    ├── types.ts                          # TypeScript interfaces
    ├── CashFlowCalculationService.ts     # Core calculation logic
    ├── CashFlowCategorizationService.ts  # Account categorization
    └── CashFlowBalanceService.ts         # Balance calculations

src/controllers/
└── CashFlowController.ts                 # HTTP request handling

src/routes/
└── cashFlowRoutes.ts                     # API route definitions
```

## Key Features

### 1. Cash Flow Categories

#### Operating Activities
- **Revenue and Expenses**: Sales, cost of goods sold, operating expenses
- **Current Assets**: Accounts receivable, inventory, prepaid expenses
- **Current Liabilities**: Accounts payable, accrued expenses
- **Working Capital Changes**: Net changes in current assets and liabilities

#### Investing Activities
- **Fixed Assets**: Equipment, machinery, buildings, property
- **Investments**: Securities, bonds, stocks
- **Asset Disposals**: Sale of fixed assets
- **Depreciation**: Non-cash adjustments

#### Financing Activities
- **Debt**: Loans, mortgages, bank borrowings
- **Equity**: Capital contributions, shareholder investments
- **Cash Accounts**: Direct cash movements
- **Dividends**: Distributions to shareholders

### 2. API Endpoints

#### POST `/api/accounting/cash-flow/generate`
Generates a complete cash flow statement for a specified period.

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
  "data": {
    "period": {
      "startDate": "2024-01-01T00:00:00.000Z",
      "endDate": "2024-01-31T00:00:00.000Z"
    },
    "operatingActivities": {
      "accounts": [...],
      "total": 15000,
      "description": "Cash flows from operating activities"
    },
    "investingActivities": {
      "accounts": [...],
      "total": -5000,
      "description": "Cash flows from investing activities"
    },
    "financingActivities": {
      "accounts": [...],
      "total": 2000,
      "description": "Cash flows from financing activities"
    },
    "netCashFlow": 12000,
    "beginningCashBalance": 50000,
    "endingCashBalance": 62000,
    "currency": {
      "id": "currency-id",
      "code": "ZWL",
      "name": "Zimbabwe Dollar"
    },
    "generatedAt": "2024-01-31T10:00:00.000Z"
  }
}
```

#### POST `/api/accounting/cash-flow/summary`
Returns high-level totals without detailed account breakdowns.

#### POST `/api/accounting/cash-flow/detailed`
Returns detailed cash flow with transaction-level information for each account.

#### POST `/api/accounting/cash-flow/comprehensive`
Returns comprehensive analysis with statistics and detailed transaction breakdowns.

#### POST `/api/accounting/cash-flow/comparative`
Compares cash flow statements across multiple periods.

#### GET `/api/accounting/cash-flow`
Query-based endpoint supporting different report types.

## Implementation Details

### Account Categorization Logic

The system automatically categorizes accounts based on:

1. **Account Type**: Revenue, Expense, Asset, Liability, Equity
2. **Account Name Keywords**: Specific terms that indicate cash flow category
3. **Financial Statement**: Income Statement accounts default to Operating

#### Operating Activity Keywords
- Revenue/Expense accounts
- Accounts receivable/payable
- Inventory, prepaid expenses
- Sales, wages, rent, utilities
- Management fees, administrative expenses

#### Investing Activity Keywords
- Equipment, machinery, vehicles
- Buildings, property, land
- Investments, securities, bonds
- Fixed assets, capital assets
- Depreciation, amortization

#### Financing Activity Keywords
- Loans, mortgages, bank loans
- Long-term debt, short-term debt
- Capital, equity, shareholder
- Dividends, cash, bank accounts
- Drawings, withdrawals, contributions

### Cash Balance Calculation

The system calculates:
- **Beginning Cash Balance**: All transactions before the start date
- **Ending Cash Balance**: Beginning balance + net cash flow
- **Net Cash Flow**: Sum of all three activity categories

### Balance Sheet Reconciliation

The implementation ensures:
- Changes in current assets affect operating cash flow
- Changes in current liabilities affect operating cash flow
- Fixed asset purchases are investing activities
- Debt and equity changes are financing activities

## Usage Examples

### Basic Cash Flow Generation
```javascript
const response = await fetch('/api/accounting/cash-flow/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token'
  },
  body: JSON.stringify({
    startDate: '2024-01-01',
    endDate: '2024-01-31'
  })
});

const cashFlow = await response.json();
console.log('Net Cash Flow:', cashFlow.data.netCashFlow);
```

### Comparative Analysis
```javascript
const response = await fetch('/api/accounting/cash-flow/comparative', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-token'
  },
  body: JSON.stringify({
    periods: [
      {
        startDate: '2023-01-01',
        endDate: '2023-01-31'
      },
      {
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      }
    ]
  })
});
```

## Testing

Run the comprehensive test suite:

```powershell
.\tests\accounting\test-cash-flow.ps1
```

The test script validates:
- ✅ Cash flow generation
- ✅ Summary reports
- ✅ Detailed breakdowns
- ✅ Comprehensive analysis
- ✅ Comparative statements
- ✅ GET endpoint functionality

## Security & Authorization

All endpoints require:
- **Authentication**: Valid JWT token
- **Authorization**: Admin or Accountant role
- **Input Validation**: Date ranges and required fields
- **Error Handling**: Comprehensive error responses

## Performance Considerations

- **Efficient Queries**: Optimized database queries with proper indexing
- **Modular Design**: Small, focused service files (< 100 lines each)
- **Caching**: Consider implementing Redis for frequently accessed reports
- **Pagination**: For large datasets, implement pagination

## Future Enhancements

1. **Direct Method Support**: Add direct method cash flow calculation
2. **Indirect Method**: Implement reconciliation from net income
3. **Forecasting**: Cash flow projections and budgeting
4. **Export Features**: PDF, Excel export capabilities
5. **Real-time Updates**: WebSocket integration for live updates
6. **Advanced Analytics**: Trend analysis and cash flow ratios

## Integration with Chart of Accounts

The system automatically integrates with the existing chart of accounts structure:

- **Account Types**: Asset, Liability, Equity, Revenue, Expense
- **Financial Statements**: Balance Sheet, Income Statement
- **Account Hierarchy**: Parent-child relationships
- **Currency Support**: Multi-currency cash flow statements

## Error Handling

Comprehensive error handling includes:
- Invalid date ranges
- Missing required parameters
- Database connection issues
- Currency not found
- Authorization failures
- Validation errors

## Monitoring & Logging

- Request/response logging
- Performance metrics
- Error tracking
- Audit trails for financial reports

This implementation provides a robust, scalable foundation for cash flow reporting that follows accounting best practices and provides valuable insights for financial decision-making. 