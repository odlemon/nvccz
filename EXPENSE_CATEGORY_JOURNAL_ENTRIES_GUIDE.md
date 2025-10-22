# Expense Category Journal Entries Implementation Guide

## Overview

This guide explains the implementation of category-based journal entries for the expense system. The system now properly maps expense categories to specific chart of accounts, ensuring accurate financial reporting and proper double-entry bookkeeping.

## Problem Solved

**Before**: All expenses were posted to a generic expense account, making it impossible to track expenses by category in financial reports.

**After**: Each expense category is mapped to a specific chart of accounts, enabling detailed expense tracking and proper financial reporting.

## Implementation Details

### 1. Hardcoded Category Mappings

The system now includes hardcoded mappings between expense categories and chart of accounts:

```typescript
const categoryAccountMapping: { [key: string]: string } = {
  "Salaries and Wages": "5000",        // Account 5000: Salaries and Wages
  "Travel and Accommodation": "5030",   // Account 5030: Travel and Entertainment  
  "Operations": "5090",                // Account 5090: Other Operating Expenses
  "Branding and Marketing": "5040",     // Account 5040: Marketing and PR
  "Office Equipment": "5020"            // Account 5020: Office Equipment
};
```

### 2. Updated Journal Entry Logic

The `getExpenseAccount()` method in `JournalEntryService.ts` now:

1. **Fetches the expense category** from the database
2. **Maps the category name** to a specific chart of accounts account number
3. **Finds the corresponding account** in the chart of accounts
4. **Falls back to a default expense account** if category is not mapped

### 3. Expense Categories Created

The system seeds 5 expense categories:

| Category Name | Description | Chart of Accounts |
|---------------|-------------|-------------------|
| **Salaries and Wages** | Employee salaries, wages, and compensation | Account 5000 |
| **Travel and Accommodation** | Business travel, accommodation, and related expenses | Account 5030 |
| **Operations** | General operational expenses and overhead costs | Account 5090 |
| **Branding and Marketing** | Marketing campaigns, advertising, and branding expenses | Account 5040 |
| **Office Equipment** | Purchase and maintenance of office equipment and supplies | Account 5020 |

## Journal Entry Examples

### Example 1: Salaries and Wages Expense

**Transaction**: Payroll expense of $5,000 (taxable)

**Journal Entry**:
```
Dr. Salaries and Wages (5000)     $5,000.00
Dr. VAT Input (1101)              $750.00
    Cr. Bank Account (1000)       $5,750.00
```

### Example 2: Travel and Accommodation Expense

**Transaction**: Business travel expense of $1,200 (taxable)

**Journal Entry**:
```
Dr. Travel and Entertainment (5030) $1,200.00
Dr. VAT Input (1101)               $180.00
    Cr. Bank Account (1000)        $1,380.00
```

### Example 3: Marketing Expense

**Transaction**: Marketing campaign expense of $2,500 (taxable)

**Journal Entry**:
```
Dr. Marketing and PR (5040)        $2,500.00
Dr. VAT Input (1101)               $375.00
    Cr. Bank Account (1000)         $2,875.00
```

## Setup Instructions

### 1. Seed Expense Categories

Run the following command to create the expense categories:

```bash
npm run seed:expense-categories
```

### 2. Verify Chart of Accounts

Ensure the following accounts exist in your chart of accounts:

- **5000**: Salaries and Wages (Expense)
- **5020**: Office Equipment (Expense)  
- **5030**: Travel and Entertainment (Expense)
- **5040**: Marketing and PR (Expense)
- **5090**: Other Operating Expenses (Expense)

### 3. Test the Implementation

Create an expense with a specific category and verify the journal entry uses the correct account:

```bash
curl -X POST http://localhost:3000/api/accounting/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "vendorId": "vendor_id",
    "categoryId": "category_id", 
    "amount": 1000,
    "currencyId": "currency_id",
    "transactionDate": "2024-01-15",
    "description": "Test expense",
    "isTaxable": true
  }'
```

## Benefits

### 1. **Accurate Financial Reporting**
- Income statements now show expenses by category
- Better cost center analysis
- Improved budget tracking

### 2. **Proper Double-Entry Bookkeeping**
- Each expense category has its own account
- Clear audit trail for each expense type
- Compliance with accounting standards

### 3. **Enhanced Analytics**
- Track spending patterns by category
- Identify cost optimization opportunities
- Better financial decision making

## API Integration

### Frontend Integration

When creating expenses from the frontend, ensure you:

1. **Fetch available categories**:
```javascript
GET /api/accounting/expense-categories
```

2. **Create expense with category**:
```javascript
POST /api/accounting/expenses
{
  "vendorId": "string",
  "categoryId": "string",  // Use the category ID from step 1
  "amount": number,
  "currencyId": "string",
  "transactionDate": "date",
  "description": "string",
  "isTaxable": boolean
}
```

### Category Selection

The frontend should display categories in a user-friendly format:

```javascript
// Example category selection UI
const categories = [
  { id: "cat1", name: "Salaries and Wages", description: "Employee compensation" },
  { id: "cat2", name: "Travel and Accommodation", description: "Business travel expenses" },
  { id: "cat3", name: "Operations", description: "General operational costs" },
  { id: "cat4", name: "Branding and Marketing", description: "Marketing and advertising" },
  { id: "cat5", name: "Office Equipment", description: "Office supplies and equipment" }
];
```

## Troubleshooting

### Common Issues

1. **"Expense category not found"**
   - Ensure categories are seeded: `npm run seed:expense-categories`
   - Verify category ID is correct

2. **"Expense account not found"**
   - Ensure chart of accounts is properly seeded
   - Verify account numbers match the mapping

3. **"No specific account mapping"**
   - Check if category name matches exactly (case-sensitive)
   - Verify category is in the hardcoded mapping

### Debugging

Enable debug logging to see category mapping:

```typescript
console.log(`Mapping category: ${expenseCategory.name} to account: ${accountNumber}`);
```

## Future Enhancements

### 1. **Dynamic Category Management**
- Allow adding new categories through API
- Dynamic account mapping configuration
- Category hierarchy support

### 2. **Advanced Reporting**
- Category-based expense reports
- Budget vs actual by category
- Trend analysis by expense type

### 3. **Integration Features**
- Import categories from external systems
- Bulk category assignment
- Category-based approval workflows

## Conclusion

The expense category journal entries system provides:

✅ **Proper double-entry bookkeeping** for each expense category  
✅ **Accurate financial reporting** with category-level detail  
✅ **Enhanced expense tracking** and analytics  
✅ **Compliance** with accounting standards  

This implementation ensures that every expense is properly categorized and recorded in the correct chart of accounts, providing a solid foundation for financial reporting and analysis.
