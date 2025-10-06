# 📊 **Payroll Module API Documentation**

## 🎯 **Overview**
The Payroll Module is a comprehensive, dynamic payroll management system designed for Zimbabwean businesses. It provides automated salary calculations, statutory compliance (PAYE, NSSA, AIDS Levy), multi-currency support, and bank file generation.

## 🏗️ **Key Features**
- **Dynamic Tax System**: Admin-configurable tax rules and rates
- **Multi-Currency Support**: USD and ZWL support
- **Statutory Compliance**: Automated PAYE, NSSA, and AIDS Levy calculations
- **Bank File Generation**: CSV export for bulk salary payments
- **Employee Portal**: Self-service payslip access
- **Flexible Allowances & Deductions**: Customizable salary components

## 📊 **Payroll Components**

### **Deductions (Non-Tax Items)**
- **Pension Fund**: Employee retirement contributions
- **Health Insurance**: Medical coverage premiums
- **Union Dues**: Membership fees
- **Employee Loans**: Salary advances
- **Savings Schemes**: Voluntary savings

### **Tax Rules (Government Taxes)**
- **PAYE**: Pay As You Earn tax
- **NSSA**: National Social Security Authority
- **AIDS Levy**: Health levy for all employees

---

## 📋 **API Endpoints**

### **1. Employee Management**

#### **Create Employee**
```http
POST /api/payroll/employees
```

**Request Body:**
```json
{
  "userId": "string",
  "bankName": "CBZ Bank Limited",
  "branchCode": "001",
  "accountNumber": "1004149",
  "basicSalary": 130200.00,
  "currencyId": "string",
  "idNumber": "string",
  "nextOfKin": "string",
  "nextOfKinContact": {
    "name": "string",
    "relationship": "string",
    "phone": "string",
    "email": "string",
    "address": "string"
  },
  "address": "string",
  "pictureUrl": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Employee created successfully",
  "data": {
    "id": "string",
    "userId": "string",
    "employeeNumber": "EMP001",
    "bankName": "CBZ Bank Limited",
    "branchCode": "001",
    "accountNumber": "1004149",
    "basicSalary": 130200.00,
    "currencyId": "string",
    "idNumber": "string",
    "nextOfKin": "John Doe - Brother",
    "nextOfKinContact": {
      "name": "John Doe",
      "relationship": "Brother",
      "phone": "+263771234567",
      "email": "john.doe@example.com",
      "address": "123 Family Street, Harare, Zimbabwe"
    },
    "address": "string",
    "pictureUrl": "string",
    "isActive": true,
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z",
    "user": {
      "firstName": "Mavis",
      "lastName": "Christopher",
      "email": "mavis@company.com"
    },
    "currency": {
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$"
    }
  }
}
```

#### **Get All Employees**
```http
GET /api/payroll/employees
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "userId": "string",
      "employeeNumber": "EMP001",
      "bankName": "CBZ Bank Limited",
      "branchCode": "001",
      "accountNumber": "1004149",
      "basicSalary": 130200.00,
      "currencyId": "string",
      "isActive": true,
      "user": {
        "firstName": "Mavis",
        "lastName": "Christopher",
        "email": "mavis@company.com"
      },
      "currency": {
        "code": "USD",
        "name": "US Dollar",
        "symbol": "$"
      }
    }
  ]
}
```

---

### **2. Payroll Run Management**

#### **Create Payroll Run**
```http
POST /api/payroll/payroll-runs
```

**Request Body:**
```json
{
  "name": "March 2024 Payroll",
  "payPeriod": "March 2024",
  "startDate": "2024-03-01T00:00:00Z",
  "endDate": "2024-03-31T23:59:59Z",
  "currencyId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payroll run created successfully",
  "data": {
    "id": "string",
    "name": "March 2024 Payroll",
    "payPeriod": "March 2024",
    "startDate": "2024-03-01T00:00:00Z",
    "endDate": "2024-03-31T23:59:59Z",
    "status": "DRAFT",
    "totalGrossPay": 0,
    "totalDeductions": 0,
    "totalNetPay": 0,
    "currencyId": "string",
    "createdById": "string",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z",
    "currency": {
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$"
    },
    "createdBy": {
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@company.com"
    }
  }
}
```

#### **Process Payroll Run**
```http
POST /api/payroll/payroll-runs/{payrollRunId}/process
```

**Response:**
```json
{
  "success": true,
  "message": "Payroll run processed successfully",
  "data": {
    "id": "string",
    "name": "March 2024 Payroll",
    "payPeriod": "March 2024",
    "status": "COMPLETED",
    "totalGrossPay": 242445.39,
    "totalDeductions": 69378.08,
    "totalNetPay": 173067.31,
    "employeePayrolls": [
      {
        "id": "string",
        "employeeId": "string",
        "basicSalary": 130200.00,
        "totalAllowances": 112245.39,
        "totalDeductions": 69378.08,
        "grossPay": 242445.39,
        "netPay": 173067.31,
        "employee": {
          "id": "string",
          "employeeNumber": "EMP001",
          "user": {
            "firstName": "Mavis",
            "lastName": "Christopher"
          }
        }
      }
    ]
  }
}
```

#### **Get Payroll Run Summary**
```http
GET /api/payroll/payroll-runs/{payrollRunId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "March 2024 Payroll",
    "payPeriod": "March 2024",
    "status": "COMPLETED",
    "totalGrossPay": 242445.39,
    "totalDeductions": 69378.08,
    "totalNetPay": 173067.31,
    "currency": {
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$"
    },
    "createdBy": {
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@company.com"
    },
    "employeePayrolls": [
      {
        "id": "string",
        "employeeId": "string",
        "basicSalary": 130200.00,
        "totalAllowances": 112245.39,
        "totalDeductions": 69378.08,
        "grossPay": 242445.39,
        "netPay": 173067.31,
        "employee": {
          "id": "string",
          "employeeNumber": "EMP001",
          "user": {
            "firstName": "Mavis",
            "lastName": "Christopher"
          }
        }
      }
    ]
  }
}
```

---

### **3. Bank File Generation**

#### **Generate Bank File**
```http
POST /api/payroll/payroll-runs/{payrollRunId}/bank-file
```

**Request Body:**
```json
{
  "bankTemplateId": "string"
}
```

**Response:** CSV file download

**CSV Format:**
```csv
Employee Name,Bank Name,Branch Code,Account Number,Payment Amount (Net Pay),Payment Reference
Mavis Christopher,CBZ Bank Limited,001,1004149,173067.31,EMP001
```

---

### **4. Payslip Management**

#### **Get Employee Payslip**
```http
GET /api/payroll/payslips/{employeeId}/{payrollRunId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "employeeId": "string",
    "payrollRunId": "string",
    "grossPay": 242445.39,
    "totalDeductions": 69378.08,
    "netPay": 173067.31,
    "currencyId": "string",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z",
    "employee": {
      "id": "string",
      "userId": "string",
      "employeeNumber": "EMP001",
      "bankName": "CBZ Bank Limited",
      "branchCode": "001",
      "accountNumber": "1004149",
      "basicSalary": 130200.00,
      "currencyId": "string",
      "idNumber": "123456789",
      "nextOfKin": "John Doe - Brother - +263771234567",
      "address": "123 Main Street, Harare, Zimbabwe",
      "pictureUrl": "https://example.com/employee-photos/employee123.jpg",
      "isActive": true,
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-15T10:00:00Z",
      "user": {
        "firstName": "Mavis",
        "lastName": "Christopher",
        "email": "mavis@company.com"
      },
      "currency": {
        "code": "USD",
        "name": "US Dollar",
        "symbol": "$"
      }
    },
    "payrollRun": {
      "id": "string",
      "name": "March 2024 Payroll",
      "payPeriod": "March 2024",
      "startDate": "2024-03-01T00:00:00Z",
      "endDate": "2024-03-31T23:59:59Z",
      "status": "COMPLETED"
    },
    "currency": {
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$"
    },
    "companyName": "National Venture Capital Company of Zimbabwe"
  }
}
```

---

### **5. Tax Rules Management**

#### **Create Tax Rule**
```http
POST /api/payroll/tax-rules
```

**Request Body:**
```json
{
  "name": "PAYE Tax",
  "type": "PAYE",
  "rate": 20.0,
  "threshold": 50000.00,
  "ceiling": 100000.00,
  "effectiveDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-12-31T23:59:59Z",
  "currencyId": "string"
}
```

**Note**: The `type` field is now completely flexible - you can use any string value you want:
- Standard types: "PAYE", "NSSA", "AIDS_LEVY"
- Custom types: "HEALTH_INSURANCE", "PENSION_FUND", "TRAINING_LEVY", "UNION_DUES", etc.
- Any custom string: "COMPANY_SPECIFIC_TAX", "REGIONAL_LEVY", etc.

**Response:**
```json
{
  "success": true,
  "message": "Tax rule created successfully",
  "data": {
    "id": "string",
    "name": "PAYE Tax",
    "type": "PAYE",
    "rate": 20.0,
    "threshold": 50000.00,
    "ceiling": 100000.00,
    "isActive": true,
    "effectiveDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-12-31T23:59:59Z",
    "currencyId": "string",
    "createdById": "string",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z",
    "currency": {
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$"
    },
    "createdBy": {
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@company.com"
    }
  }
}
```

#### **Get Tax Rules**
```http
GET /api/payroll/tax-rules?currencyId={currencyId}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "PAYE Tax",
      "type": "PAYE",
      "rate": 20.0,
      "threshold": 50000.00,
      "ceiling": 100000.00,
      "isActive": true,
      "effectiveDate": "2024-01-01T00:00:00Z",
      "endDate": "2024-12-31T23:59:59Z",
      "currency": {
        "code": "USD",
        "name": "US Dollar",
        "symbol": "$"
      },
      "createdBy": {
        "firstName": "Admin",
        "lastName": "User",
        "email": "admin@company.com"
      }
    }
  ]
}
```

---

### **6. Allowance Types Management**

#### **Create Allowance Type**
```http
POST /api/payroll/allowance-types
```

**Request Body:**
```json
{
  "name": "Housing Allowance",
  "code": "HOUSING",
  "description": "Monthly housing allowance",
  "isTaxable": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Allowance type created successfully",
  "data": {
    "id": "string",
    "name": "Housing Allowance",
    "code": "HOUSING",
    "description": "Monthly housing allowance",
    "isTaxable": true,
    "isActive": true,
    "createdById": "string",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z",
    "createdBy": {
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@company.com"
    }
  }
}
```

#### **Get Allowance Types**
```http
GET /api/payroll/allowance-types
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "Housing Allowance",
      "code": "HOUSING",
      "description": "Monthly housing allowance",
      "isTaxable": true,
      "isActive": true,
      "createdBy": {
        "firstName": "Admin",
        "lastName": "User",
        "email": "admin@company.com"
      }
    }
  ]
}
```

---

### **7. Deduction Types Management**

> **📝 Important Distinction:**
> - **Deductions** = Non-tax items (Pension, Health Insurance, Union Dues, Loans, Advances)
> - **Tax Rules** = Government taxes (PAYE, NSSA, AIDS Levy)
> 
> Deductions are separate from tax rules and are calculated before tax rules are applied.

#### **Create Deduction Type**
```http
POST /api/payroll/deduction-types
```

**Request Body:**
```json
{
  "name": "Pension Fund",
  "code": "PENSION",
  "description": "Employee pension fund contribution",
  "rate": 5.0,                    // 5% of gross pay
  "threshold": 1000.00,           // Only if gross > $1000
  "ceiling": 2000.00,             // Max $2000 deduction
  "isStatutory": false,           // Not statutory
  "effectiveDate": "2024-01-01T00:00:00Z",
  "currencyId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deduction type created successfully",
  "data": {
    "id": "string",
    "name": "Pension Fund",
    "code": "PENSION",
    "description": "Employee pension fund contribution",
    "rate": 5.0,
    "threshold": 1000.00,
    "ceiling": 2000.00,
    "isStatutory": false,
    "isActive": true,
    "effectiveDate": "2024-01-01T00:00:00Z",
    "endDate": null,
    "currencyId": "string",
    "createdById": "string",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z",
    "currency": {
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$"
    },
    "createdBy": {
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@company.com"
    }
  }
}
```

#### **Get Deduction Types**
```http
GET /api/payroll/deduction-types
```

#### **Get Single Deduction Type**
```http
GET /api/payroll/deduction-types/{id}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "Pension Fund",
    "code": "PENSION",
    "description": "Employee pension fund contribution",
    "rate": 5.0,
    "threshold": 1000.00,
    "ceiling": 2000.00,
    "isStatutory": false,
    "isActive": true,
    "effectiveDate": "2024-01-01T00:00:00Z",
    "currency": {
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$"
    },
    "createdBy": {
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@company.com"
    },
    "employeeDeductions": [
      {
        "id": "string",
        "employeeId": "emp123",
        "amount": null,
        "rate": null,
        "isActive": true,
        "effectiveDate": "2024-01-01T00:00:00Z",
        "employee": {
          "id": "emp123",
          "employeeNumber": "EMP001",
          "user": {
            "firstName": "John",
            "lastName": "Doe",
            "email": "john.doe@company.com"
          }
        }
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "Pension Fund",
      "code": "PENSION",
      "description": "Employee pension fund contribution",
      "rate": 5.0,
      "threshold": 1000.00,
      "ceiling": 2000.00,
      "isStatutory": false,
      "isActive": true,
      "effectiveDate": "2024-01-01T00:00:00Z",
      "currency": {
        "code": "USD",
        "name": "US Dollar",
        "symbol": "$"
      },
      "createdBy": {
        "firstName": "Admin",
        "lastName": "User",
        "email": "admin@company.com"
      },
      "employeeDeductions": [
        {
          "id": "string",
          "employeeId": "emp123",
          "amount": null,
          "rate": null,
          "isActive": true,
          "effectiveDate": "2024-01-01T00:00:00Z",
          "employee": {
            "id": "emp123",
            "employeeNumber": "EMP001",
            "user": {
              "firstName": "John",
              "lastName": "Doe",
              "email": "john.doe@company.com"
            }
          }
        },
        {
          "id": "string",
          "employeeId": "emp456",
          "amount": 100.00,
          "rate": null,
          "isActive": true,
          "effectiveDate": "2024-01-01T00:00:00Z",
          "employee": {
            "id": "emp456",
            "employeeNumber": "EMP002",
            "user": {
              "firstName": "Jane",
              "lastName": "Smith",
              "email": "jane.smith@company.com"
            }
          }
        }
      ]
    }
  ]
}
```

#### **Assign Employees to Deduction Type**
```http
PUT /api/payroll/deduction-types/{deductionTypeId}/employees
```

**Note:** This endpoint only works for non-statutory deductions. Statutory deductions apply to all employees automatically.

**Request Body:**
```json
{
  "employeeIds": ["emp123", "emp456", "emp789"],
}
```

**Note:** 
- The deduction type's `effectiveDate` is used for when the deduction applies
- If `amount` is provided, it will be used as a fixed deduction amount
- If `rate` is provided, it will override the deduction type's default rate for these employees
- If neither is provided, the deduction type's default rate will be used

**Response:**
```json
{
  "success": true,
  "message": "Employees assigned to deduction type successfully",
  "data": [
    {
      "id": "string",
      "employeeId": "emp123",
      "deductionTypeId": "string",
      "amount": 100.00,
      "rate": 2.5,
      "isActive": true,
      "effectiveDate": "2024-01-01T00:00:00Z",
      "employee": {
        "id": "emp123",
        "employeeNumber": "EMP001",
        "user": {
          "firstName": "John",
          "lastName": "Doe"
        }
      }
    }
  ]
}
```

**Error Response (Statutory Deduction):**
```json
{
  "success": false,
  "message": "Cannot assign employees to statutory deductions. Statutory deductions apply to all employees automatically."
}
```

#### **Remove Employees from Deduction Type**
```http
DELETE /api/payroll/deduction-types/{deductionTypeId}/employees
```

**Note:** This endpoint only works for non-statutory deductions. Statutory deductions apply to all employees automatically.

**Request Body:**
```json
{
  "employeeIds": ["emp123", "emp456"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Employees removed from deduction type successfully",
  "data": {
    "removedCount": 2,
    "remainingEmployees": [
      {
        "id": "emp789",
        "employeeNumber": "EMP003",
        "user": {
          "firstName": "Jane",
          "lastName": "Smith"
        }
      }
    ]
  }
}
```

---

### **8. Bank File Templates Management**

#### **Create Bank File Template**
```http
POST /api/payroll/bank-templates
```

**Request Body:**
```json
{
  "name": "CBZ Bank Template",
  "bankName": "CBZ Bank Limited",
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

**Response:**
```json
{
  "success": true,
  "message": "Bank file template created successfully",
  "data": {
    "id": "string",
    "name": "CBZ Bank Template",
    "bankName": "CBZ Bank Limited",
    "delimiter": ",",
    "hasHeader": true,
    "columnOrder": "[\"Employee Name\",\"Bank Name\",\"Branch Code\",\"Account Number\",\"Payment Amount (Net Pay)\",\"Payment Reference\"]",
    "isActive": true,
    "createdById": "string",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z",
    "createdBy": {
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@company.com"
    }
  }
}
```

#### **Get Bank File Templates**
```http
GET /api/payroll/bank-templates
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "CBZ Bank Template",
      "bankName": "CBZ Bank Limited",
      "delimiter": ",",
      "hasHeader": true,
      "columnOrder": "[\"Employee Name\",\"Bank Name\",\"Branch Code\",\"Account Number\",\"Payment Amount (Net Pay)\",\"Payment Reference\"]",
      "isActive": true,
      "createdBy": {
        "firstName": "Admin",
        "lastName": "User",
        "email": "admin@company.com"
      }
    }
  ]
}
```

---

## 🔧 **Setup Instructions**

### **1. Database Migration**
```bash
npx prisma migrate dev --name add-payroll-module
npx prisma generate
```

### **2. Initial Data Setup**

#### **Create Default Tax Rules**
```bash
# PAYE Tax Rule
curl -X POST http://localhost:3000/api/payroll/tax-rules \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PAYE Tax",
    "type": "PAYE",
    "rate": 20.0,
    "threshold": 50000.00,
    "effectiveDate": "2024-01-01T00:00:00Z",
    "currencyId": "USD_CURRENCY_ID"
  }'

# NSSA Contribution
curl -X POST http://localhost:3000/api/payroll/tax-rules \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NSSA Contribution",
    "type": "NSSA",
    "rate": 4.5,
    "ceiling": 100000.00,
    "effectiveDate": "2024-01-01T00:00:00Z",
    "currencyId": "USD_CURRENCY_ID"
  }'

# AIDS Levy
curl -X POST http://localhost:3000/api/payroll/tax-rules \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AIDS Levy",
    "type": "AIDS_LEVY",
    "rate": 3.0,
    "effectiveDate": "2024-01-01T00:00:00Z",
    "currencyId": "USD_CURRENCY_ID"
  }'
```

#### **Create Default Allowance Types**
```bash
# Housing Allowance
curl -X POST http://localhost:3000/api/payroll/allowance-types \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Housing Allowance",
    "code": "HOUSING",
    "description": "Monthly housing allowance",
    "isTaxable": true
  }'

# Transport Allowance
curl -X POST http://localhost:3000/api/payroll/allowance-types \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Transport Allowance",
    "code": "TRANSPORT",
    "description": "Monthly transport allowance",
    "isTaxable": true
  }'

# Attendance Bonus
curl -X POST http://localhost:3000/api/payroll/allowance-types \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Attendance Bonus",
    "code": "ATTENDANCE",
    "description": "Monthly attendance bonus",
    "isTaxable": true
  }'
```

#### **Create Default Deduction Types**
```bash
# Pension Fund (Employee-Specific)
curl -X POST http://localhost:3000/api/payroll/deduction-types \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pension Fund",
    "code": "PENSION",
    "description": "Employee pension fund contribution",
    "rate": 5.0,
    "threshold": 1000.00,
    "ceiling": 2000.00,
    "isStatutory": false,
    "effectiveDate": "2024-01-01T00:00:00Z",
    "currencyId": "USD_CURRENCY_ID"
  }'

# Health Insurance (Employee-Specific)
curl -X POST http://localhost:3000/api/payroll/deduction-types \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Health Insurance",
    "code": "HEALTH",
    "description": "Employee health insurance premium",
    "rate": 2.5,
    "threshold": 500.00,
    "ceiling": 1500.00,
    "isStatutory": false,
    "effectiveDate": "2024-01-01T00:00:00Z",
    "currencyId": "USD_CURRENCY_ID"
  }'

# Union Dues (Employee-Specific)
curl -X POST http://localhost:3000/api/payroll/deduction-types \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Union Dues",
    "code": "UNION",
    "description": "Monthly union membership dues",
    "rate": 2.0,
    "threshold": 1000.00,
    "ceiling": 500.00,
    "isStatutory": false,
    "effectiveDate": "2024-01-01T00:00:00Z",
    "currencyId": "USD_CURRENCY_ID"
  }'

# AIDS Levy (Statutory - Applies to All)
curl -X POST http://localhost:3000/api/payroll/deduction-types \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "AIDS Levy",
    "code": "AIDS_LEVY",
    "description": "Mandatory AIDS levy for all employees",
    "rate": 3.0,
    "isStatutory": true,
    "effectiveDate": "2024-01-01T00:00:00Z",
    "currencyId": "USD_CURRENCY_ID"
  }'
```

#### **Create Bank File Template**
```bash
curl -X POST http://localhost:3000/api/payroll/bank-templates \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CBZ Bank Template",
    "bankName": "CBZ Bank Limited",
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
  }'
```

---

## 📊 **Payroll Calculation Example**

### **Effective Date Logic**
The payroll system uses effective dates to ensure deductions are only applied when they are active:

- **Deduction Type Effective Date**: When the deduction type becomes active
- **Employee Assignment Effective Date**: When the deduction is assigned to an employee
- **End Date**: When the deduction expires (null = never expires)
- **Payroll Period**: Only deductions effective during the payroll period are applied

### **Sample Employee Data**
- **Basic Salary**: $130,200.00
- **Housing Allowance**: $54,250.00
- **Transport Allowance**: $32,550.00
- **Attendance Bonus**: $933.00
- **Night Allowance**: $778.00
- **Overtime**: $7,042.07
- **Overtime on Holiday**: $16,692.32

### **Calculation Results**
- **Total Earnings**: $242,445.39

**Deductions (Non-Tax):**
- **Employee-Specific Deductions**:
  - **Union Dues**: $4,340.00 (2% of gross)
  - **Pension Fund**: $2,000.00 (fixed amount)
  - **Health Insurance**: $1,500.00 (fixed amount)
- **Statutory Deductions**:
  - **AIDS Levy**: $7,273.36 (3% of gross)

**Tax Rules (Government Taxes):**
- **PAYE**: $51,100.00 (20% of gross)
- **NSSA**: $9,765.00 (3% of gross)

- **Total Deductions**: $76,651.44
- **Net Pay**: $165,793.95

---

## 🔒 **Security & Authentication**

All endpoints require authentication via JWT token:
```http
Authorization: Bearer YOUR_JWT_TOKEN
```

## 📝 **Error Handling**

Standard error response format:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

## 🚀 **Getting Started**

1. **Run Database Migration**: `npx prisma migrate dev --name add-payroll-module`
2. **Generate Prisma Client**: `npx prisma generate`
3. **Set up Initial Data**: Use the setup instructions above
4. **Create Employees**: Convert existing users to employees
5. **Configure Tax Rules**: Set up PAYE, NSSA, and AIDS Levy rules
6. **Create Payroll Run**: Process your first payroll

---

## 📞 **Support**

For technical support or questions about the Payroll Module, please contact the development team or refer to the main API documentation.

