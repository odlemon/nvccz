# Payroll Module 

## 🚀 **Complete Testing Guide for All 35 Payroll Endpoints**

This guide provides step-by-step instructions for testing all payroll endpoints

---

## 📋 **PREREQUISITES**

### **1. Authentication Setup**
- First, you need to authenticate and get a JWT token
- Use the existing auth endpoint: `POST /api/auth/login`
- Copy the token from the response for all subsequent requests


### **STEP 2: TAX RULES MANAGEMENT**

#### **2.1 Create Tax Rules**
```
POST /api/payroll/tax-rules
```
**Description**: Create tax rules for PAYE, NSSA, and AIDS Levy

**Request Body Examples:**

**PAYE Tax Rule:**
```json
{
  "name": "PAYE Tax - USD",
  "type": "PAYE",
  "rate": 20.0,
  "threshold": 500.0,
  "ceiling": null,
  "effectiveDate": "2024-01-01T00:00:00.000Z",
  "endDate": null,
  "currencyId": "USD_CURRENCY_ID"
}
```

**Custom Tax Examples:**
```json
{
  "name": "Health Insurance Tax",
  "type": "HEALTH_INSURANCE",
  "rate": 2.5,
  "threshold": 500,
  "currencyId": "USD_CURRENCY_ID"
}
```

```json
{
  "name": "Company Pension Fund",
  "type": "PENSION_FUND",
  "rate": 5.0,
  "ceiling": 10000,
  "currencyId": "USD_CURRENCY_ID"
}
```

```json
{
  "name": "Skills Development Levy",
  "type": "TRAINING_LEVY",
  "rate": 1.0,
  "threshold": 2000,
  "currencyId": "USD_CURRENCY_ID"
}
```

**NSSA Contribution:**
```json
{
  "name": "NSSA Contribution - USD",
  "type": "NSSA",
  "rate": 4.5,
  "threshold": null,
  "ceiling": 1000.0,
  "effectiveDate": "2024-01-01T00:00:00.000Z",
  "endDate": null,
  "currencyId": "USD_CURRENCY_ID"
}
```

**AIDS Levy:**
```json
{
  "name": "AIDS Levy - USD",
  "type": "AIDS_LEVY",
  "rate": 3.0,
  "threshold": null,
  "ceiling": null,
  "effectiveDate": "2024-01-01T00:00:00.000Z",
  "endDate": null,
  "currencyId": "USD_CURRENCY_ID"
}
```

#### **2.2 Get Tax Rules**
```
GET /api/payroll/tax-rules
```
**Description**: Retrieve all tax rules

#### **2.3 Update Tax Rule**
```
PUT /api/payroll/tax-rules/{taxRuleId}
```
**Description**: Update an existing tax rule

**Request Body:**
```json
{
  "name": "Updated PAYE Tax - USD",
  "rate": 25.0,
  "threshold": 600.0
}
```

#### **2.4 Delete Tax Rule**
```
DELETE /api/payroll/tax-rules/{taxRuleId}
```
**Description**: Delete a tax rule

---

### **STEP 3: ALLOWANCE TYPES MANAGEMENT**

#### **3.1 Create Allowance Types**
```
POST /api/payroll/allowance-types
```
**Description**: Create different types of allowances

**Request Body Examples:**

**Housing Allowance:**
```json
{
  "name": "Housing Allowance",
  "code": "HOUSING",
  "description": "Monthly housing allowance",
  "isTaxable": true
}
```

**Transport Allowance:**
```json
{
  "name": "Transport Allowance",
  "code": "TRANSPORT",
  "description": "Monthly transport allowance",
  "isTaxable": false
}
```

**Medical Allowance:**
```json
{
  "name": "Medical Allowance",
  "code": "MEDICAL",
  "description": "Monthly medical allowance",
  "isTaxable": true
}
```

#### **3.2 Get Allowance Types**
```
GET /api/payroll/allowance-types
```
**Description**: Retrieve all allowance types

#### **3.3 Update Allowance Type**
```
PUT /api/payroll/allowance-types/{allowanceTypeId}
```
**Description**: Update an allowance type

**Request Body:**
```json
{
  "name": "Updated Housing Allowance",
  "description": "Updated monthly housing allowance",
  "isTaxable": false
}
```

#### **3.4 Delete Allowance Type**
```
DELETE /api/payroll/allowance-types/{allowanceTypeId}
```
**Description**: Delete an allowance type

---

### **STEP 4: DEDUCTION TYPES MANAGEMENT**

#### **4.1 Create Deduction Types**
```
POST /api/payroll/deduction-types
```
**Description**: Create different types of deductions

**Request Body Examples:**

**Loan Deduction:**
```json
{
  "name": "Staff Loan",
  "code": "LOAN",
  "description": "Monthly loan repayment",
  "isStatutory": false
}
```

**Pension Contribution:**
```json
{
  "name": "Pension Contribution",
  "code": "PENSION",
  "description": "Monthly pension contribution",
  "isStatutory": true
}
```

#### **4.2 Get Deduction Types**
```
GET /api/payroll/deduction-types
```
**Description**: Retrieve all deduction types

#### **4.3 Update Deduction Type**
```
PUT /api/payroll/deduction-types/{deductionTypeId}
```
**Description**: Update a deduction type

**Request Body:**
```json
{
  "name": "Updated Staff Loan",
  "description": "Updated monthly loan repayment"
}
```

#### **4.4 Delete Deduction Type**
```
DELETE /api/payroll/deduction-types/{deductionTypeId}
```
**Description**: Delete a deduction type

---

### **STEP 5: BANK FILE TEMPLATES MANAGEMENT**

#### **5.1 Create Bank File Template**
```
POST /api/payroll/bank-templates
```
**Description**: Create bank file templates for different banks

**Request Body:**
```json
{
  "name": "Standard Bank Template",
  "bankName": "Standard Bank",
  "delimiter": ",",
  "hasHeader": true,
  "columnOrder": [
    "Employee Name",
    "Bank Name",
    "Branch Code",
    "Account Number",
    "Payment Amount (Net Pay)",
    "Payment Reference"
  ]
}
```

#### **5.2 Get Bank File Templates**
```
GET /api/payroll/bank-templates
```
**Description**: Retrieve all bank file templates

#### **5.3 Update Bank File Template**
```
PUT /api/payroll/bank-templates/{templateId}
```
**Description**: Update a bank file template

**Request Body:**
```json
{
  "name": "Updated Standard Bank Template",                                               
  "delimiter": ";",
  "hasHeader": false
}
```

#### **5.4 Delete Bank File Template**
```
DELETE /api/payroll/bank-templates/{templateId}
```
**Description**: Delete a bank file template

---

### **STEP 6: EMPLOYEE MANAGEMENT**

#### **6.1 Create Employee**
```
POST /api/payroll/employees
```
**Description**: Create an employee from an existing user

**Request Body:**
```json
{
  "userId": "USER_ID_FROM_AUTH_SYSTEM",
  "bankName": "Standard Bank",
  "branchCode": "001",
  "accountNumber": "1234567890",
  "basicSalary": 2500.00,
  "currencyId": "USD_CURRENCY_ID",
  "idNumber": "123456789",
  "nextOfKin": "John Doe - Brother",
  "nextOfKinContact": {
    "name": "John Doe",
    "relationship": "Brother",
    "phone": "+263771234567",
    "email": "john.doe@example.com",
    "address": "123 Family Street, Harare, Zimbabwe"
  },
  "address": "123 Main Street, Harare, Zimbabwe",
  "pictureUrl": "https://example.com/employee-photos/employee123.jpg"
}
```

**Note**: 
- The `userId` must be from an existing user in the system
- The `employeeNumber` is auto-generated by the system (format: EMP001, EMP002, etc.)
- You can get user IDs from the existing user management system

#### **6.2 Get All Employees**
```
GET /api/payroll/employees
```
**Description**: Retrieve all employees

#### **6.3 Update Employee**
```
PUT /api/payroll/employees/{employeeId}
```
**Description**: Update employee information

**Request Body:**
```json
{
  "bankName": "CBZ Bank",
  "branchCode": "002",
  "accountNumber": "0987654321",
  "basicSalary": 3000.00,
  "isActive": true
}
```

**Note**: The `employeeNumber` is auto-generated and cannot be updated manually.

#### **6.4 Delete Employee (Soft Delete)**
```
DELETE /api/payroll/employees/{employeeId}
```
**Description**: Soft delete an employee (sets isActive to false, preserves historical data)

#### **6.5 Permanently Delete Employee**
```
DELETE /api/payroll/employees/{employeeId}/permanent
```
**Description**: Permanently delete an employee and all related payroll data
**WARNING**: This will permanently delete all payroll history, payslips, and related data

---

### **STEP 7: SALARY STRUCTURE MANAGEMENT**

#### **7.1 Create Salary Structure**
```
POST /api/payroll/salary-structures
```
**Description**: Assign allowances to employees

**Request Body:**
```json
{
  "employeeId": "EMPLOYEE_ID_FROM_STEP_6",
  "allowanceTypeId": "ALLOWANCE_TYPE_ID_FROM_STEP_3",
  "amount": 500.00,
  "currencyId": "USD_CURRENCY_ID",
  "effectiveDate": "2024-01-01T00:00:00.000Z",
  "endDate": null
}
```

#### **7.2 Get Employee Salary Structures**
```
GET /api/payroll/salary-structures/employee/{employeeId}
```
**Description**: Get salary structures for a specific employee

#### **7.3 Update Salary Structure**
```
PUT /api/payroll/salary-structures/{salaryStructureId}
```
**Description**: Update a salary structure

**Request Body:**
```json
{
  "amount": 750.00,
  "isActive": true,
  "endDate": "2024-12-31T23:59:59.000Z"
}
```

#### **7.4 Delete Salary Structure**
```
DELETE /api/payroll/salary-structures/{salaryStructureId}
```
**Description**: Delete a salary structure

---

### **STEP 8: LEAVE BALANCE MANAGEMENT**

#### **8.1 Create/Update Leave Balance**
```
POST /api/payroll/leave-balances
```
**Description**: Set leave balances for employees

**Request Body:**
```json
{
  "employeeId": "EMPLOYEE_ID_FROM_STEP_6",
  "leaveType": "Annual Leave",
  "balance": 21.0,
  "currencyId": "USD_CURRENCY_ID"
}
```

#### **8.2 Get All Leave Balances**
```
GET /api/payroll/leave-balances
```
**Description**: Get all leave balances

**Query Parameters:**
- `employeeId` (optional): Filter by specific employee

---

### **STEP 9: PAYROLL RUNS**

#### **9.1 Create Payroll Run**
```
POST /api/payroll/payroll-runs
```
**Description**: Create a new payroll run

**Request Body:**
```json
{
  "name": "March 2024 Payroll",
  "payPeriod": "March 2024",
  "startDate": "2024-03-01T00:00:00.000Z",
  "endDate": "2024-03-31T23:59:59.000Z",
  "currencyId": "USD_CURRENCY_ID"
}
```

#### **9.2 Get All Payroll Runs**
```
GET /api/payroll/payroll-runs
```
**Description**: Get all payroll runs with pagination

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `status` (optional): Filter by status (DRAFT, PROCESSING, COMPLETED, CANCELLED)

#### **9.3 Process Payroll Run**
```
POST /api/payroll/payroll-runs/{payrollRunId}/process
```
**Description**: Process a payroll run (calculate all employee payrolls)

#### **9.4 Get Payroll Run Summary**
```
GET /api/payroll/payroll-runs/{payrollRunId}
```
**Description**: Get detailed summary of a payroll run

---

### **STEP 10: BANK FILE GENERATION**

#### **10.1 Generate Bank File**
```
POST /api/payroll/payroll-runs/{payrollRunId}/bank-file
```
**Description**: Generate bank file for salary payments

**Request Body:**
```json
{
  "bankTemplateId": "BANK_TEMPLATE_ID_FROM_STEP_5"
}
```

**Note**: The `bankTemplateId` is **REQUIRED**. You must create a bank template first (Step 5) and use its ID here.

**Response**: CSV file download

---

### **STEP 11: PAYSLIPS**

#### **11.1 Get Employee Payslip**
```
GET /api/payroll/payslips/{employeeId}/{payrollRunId}
```
**Description**: Get payslip for specific employee and payroll run

---

### **STEP 12: EMPLOYEE PORTAL**

#### **12.1 Get Employee Portal Info**
```
GET /api/payroll/employee/portal
```
**Description**: Get current employee's payroll information (uses authenticated user)

#### **12.2 Get Employee Payslips**
```
GET /api/payroll/employee/payslips
```
**Description**: Get current employee's payslips (uses authenticated user)

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

#### **12.3 Get Employee Leave Balances**
```
GET /api/payroll/employee/leave-balances
```
**Description**: Get current employee's leave balances (uses authenticated user)

---

## 🔄 **TESTING WORKFLOW**

### **Complete End-to-End Test:**

1. **Setup Phase:**
   - Create tax rules (PAYE, NSSA, AIDS Levy)
   - Create allowance types (Housing, Transport, Medical)
   - Create deduction types (Loan, Pension)
   - Create bank file template

2. **Employee Setup:**
   - Create employee from existing user
   - Create salary structures (assign allowances)
   - Set leave balances

3. **Payroll Processing:**
   - Create payroll run
   - Process payroll run (calculates all payrolls)
   - Generate bank file
   - View payslips

4. **Employee Portal:**
   - Test employee self-service endpoints

---

## 📝 **TESTING NOTES**

### **Important IDs to Track:**
- Currency IDs (from existing system)
- User IDs (from existing auth system)
- Tax Rule IDs
- Allowance Type IDs
- Deduction Type IDs
- Bank Template IDs
- Employee IDs
- Salary Structure IDs
- Payroll Run IDs

### **Expected Response Format:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### **Error Response Format:**
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

---
