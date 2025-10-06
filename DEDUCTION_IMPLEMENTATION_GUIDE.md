

### 1. Create Deduction Type
```http
POST /api/payroll/deduction-types
```

**Request Body:**
```json
{
  "name": "Pension Fund",
  "code": "PENSION",
  "description": "Employee pension fund contribution",
  "rate": 5.0,
  "threshold": 1000.00,
  "ceiling": 2000.00,
  "isStatutory": false,
  "effectiveDate": "2024-01-01T00:00:00Z",
  "endDate": null,
  "currencyId": "USD_CURRENCY_ID"
}
```

### 2. Get All Deduction Types
```http
GET /api/payroll/deduction-types
```

**Response includes:**
- Deduction type details
- Assigned employees (for non-statutory deductions)
- Only shows custom `amount`/`rate` when they exist

### 3. Assign Employees to Deduction (Non-Statutory Only)
```http
PUT /api/payroll/deduction-types/{deductionTypeId}/employees
```

**Request Body:**
```json
{
  "employeeIds": ["emp123", "emp456", "emp789"],
}
```

### 4. Remove Employees from Deduction
```http
DELETE /api/payroll/deduction-types/{deductionTypeId}/employees
```

**Request Body:**
```json
{
  "employeeIds": ["emp123", "emp456"]
}
```

## Implementation Steps

### Step 1: Database Migration
```bash
# Generate migration
npx prisma migrate dev --name add_deduction_system

# Apply migration
npx prisma migrate deploy
```

### Step 2: Create Default Deduction Types

#### Statutory Deductions (Apply to All Employees)
```json
{
  "name": "AIDS Levy",
  "code": "AIDS_LEVY",
  "description": "Government AIDS levy - statutory deduction",
  "rate": 3.0,
  "isStatutory": true,
  "effectiveDate": "2024-01-01T00:00:00Z"
}
```

#### Non-Statutory Deductions (Manual Assignment Required)
```json
{
  "name": "Pension Fund",
  "code": "PENSION",
  "description": "Employee pension fund contribution",
  "rate": 5.0,
  "threshold": 1000.00,
  "ceiling": 2000.00,
  "isStatutory": false,
  "effectiveDate": "2024-01-01T00:00:00Z"
}
```


