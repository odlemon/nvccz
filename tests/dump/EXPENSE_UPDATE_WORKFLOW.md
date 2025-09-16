# Expense Update Workflow with Double-Entry Bookkeeping

## Overview

The expense system now supports proper double-entry bookkeeping when updating expenses. When an expense is modified after it has been posted, the system automatically creates reversal journal entries to maintain accounting integrity.

## How It Works

### 1. Creating an Expense

When you create an expense, the system:
- Calculates VAT if the expense is taxable
- Creates a journal entry with the appropriate debits and credits
- Links the expense to the journal entry

**Example:**
```
Amount: 300 ZWL, Taxable: Yes
VAT: 43.50 ZWL (14.5% rate)
Total: 343.50 ZWL

Journal Entry:
Dr Legal Fees         300.00
Dr VAT Input          43.50
    Cr Bank Account       343.50
```

### 2. Updating a Posted Expense

When you update a posted expense, the system follows this workflow:

#### Step 1: Create Reversal Journal Entry
The system creates a reversal entry that cancels out the original transaction:

```
Original Entry (to be reversed):
Dr Legal Fees         300.00
Dr VAT Input          43.50
    Cr Bank Account       343.50

Reversal Entry:
Cr Legal Fees         300.00
Cr VAT Input          43.50
    Dr Bank Account       343.50
```

#### Step 2: Update the Expense
The expense record is updated with the new amounts and calculations.

#### Step 3: Create New Journal Entry
A new journal entry is created with the updated amounts:

```
Updated Entry (500 ZWL):
Dr Legal Fees         500.00
Dr VAT Input          72.50
    Cr Bank Account       572.50
```

### 3. Net Effect

The net effect of the reversal + new entry is:
```
Net Change:
Dr Legal Fees         200.00 (500 - 300)
Dr VAT Input          29.00  (72.50 - 43.50)
    Cr Bank Account       229.00 (572.50 - 343.50)
```

## API Endpoints

### Update Expense
```
PUT /api/accounting/expenses/{id}
```

**Request Body:**
```json
{
  "vendorId": "string",
  "categoryId": "string", 
  "amount": 500,
  "currencyId": "string",
  "transactionDate": "2024-01-15",
  "description": "Updated Legal Fees",
  "receiptNumber": "string",
  "isTaxable": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Expense updated successfully",
  "data": {
    "id": "expense-id",
    "amount": 500,
    "vatAmount": 72.50,
    "totalAmount": 572.50,
    "status": "POSTED",
    "journalEntry": {
      "id": "new-journal-entry-id",
      "referenceNumber": "JE-1234567890-123",
      "status": "POSTED"
    }
  }
}
```

## Status Handling

### DRAFT Expenses
- Can be updated directly without journal entry complications
- No reversal entries are created
- Changes are applied immediately

### POSTED Expenses
- Require reversal journal entries for financial changes
- Non-financial changes (description, receipt number) are updated directly
- Financial changes trigger the full reversal + new entry workflow

## Financial Changes That Trigger Reversals

The following field changes will trigger the reversal workflow:
- `amount` - Changes the base expense amount
- `isTaxable` - Changes VAT calculation
- `categoryId` - Changes the expense account used

## Non-Financial Changes

These changes can be made directly without reversals:
- `description` - Expense description
- `receiptNumber` - Receipt reference
- `transactionDate` - Transaction date
- `vendorId` - Vendor (if no financial impact)

## Journal Entry References

### Original Entry
- Created when expense is first posted
- Reference: `JE-{timestamp}-{random}`

### Reversal Entry  
- Created when updating posted expenses
- Reference: `JE-{timestamp}-{random}`
- Description: `REVERSAL: {original-description}`

### Updated Entry
- Created after reversal for the new amounts
- Reference: `JE-{timestamp}-{random}`
- Description: `UPDATED: {new-description}`

## Error Handling

### Common Errors
- **Expense not found**: The expense ID doesn't exist
- **Invalid status**: Trying to update an expense with an unsupported status
- **Missing accounts**: Required chart of accounts not found (VAT Input, Bank Account, etc.)

### Validation
- All amounts must be positive
- VAT calculations are validated
- Journal entries are balanced (debits = credits)

## Testing the Workflow

### Prerequisites
1. Set up chart of accounts with:
   - Expense account (e.g., "Legal Fees")
   - VAT Input account
   - Bank Account
2. Create vendors and expense categories
3. Set up currencies

### Test Scenario
1. Create expense: 300 ZWL, taxable
2. Verify journal entry: Dr Legal Fees 300, Dr VAT Input 43.50, Cr Bank 343.50
3. Update expense: 500 ZWL, taxable  
4. Verify reversal entry: Cr Legal Fees 300, Cr VAT Input 43.50, Dr Bank 343.50
5. Verify new entry: Dr Legal Fees 500, Dr VAT Input 72.50, Cr Bank 572.50
6. Verify net effect: Dr Legal Fees 200, Dr VAT Input 29.00, Cr Bank 229.00

## Benefits

1. **Accounting Integrity**: Maintains proper double-entry bookkeeping
2. **Audit Trail**: Complete history of all changes
3. **Compliance**: Meets accounting standards and audit requirements
4. **Transparency**: Clear visibility into what changed and when
5. **Reversibility**: All changes can be traced and reversed if needed

## Implementation Details

### Database Changes
- No schema changes required
- Uses existing journal entry and journal entry line tables
- Maintains referential integrity

### Performance Considerations
- Each update creates 2 additional journal entries
- Consider archiving old journal entries for performance
- Monitor database growth with high update frequency

### Security
- All journal entries are created with proper user attribution
- Audit trail maintained for compliance
- No direct journal entry manipulation allowed 