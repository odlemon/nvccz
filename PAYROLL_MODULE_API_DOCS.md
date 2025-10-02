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
    "nextOfKin": "string",
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
    "pdfPath": null,
    "isGenerated": false,
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z",
    "employee": {
      "id": "string",
      "employeeNumber": "EMP001",
      "user": {
        "firstName": "Mavis",
        "lastName": "Christopher"
      }
    },
    "payrollRun": {
      "id": "string",
      "name": "March 2024 Payroll",
      "payPeriod": "March 2024"
    },
    "currency": {
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$"
    }
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

#### **Create Deduction Type**
```http
POST /api/payroll/deduction-types
```

**Request Body:**
```json
{
  "name": "Union Dues",
  "code": "UNION",
  "description": "Monthly union membership dues",
  "isStatutory": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deduction type created successfully",
  "data": {
    "id": "string",
    "name": "Union Dues",
    "code": "UNION",
    "description": "Monthly union membership dues",
    "isStatutory": false,
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

#### **Get Deduction Types**
```http
GET /api/payroll/deduction-types
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "Union Dues",
      "code": "UNION",
      "description": "Monthly union membership dues",
      "isStatutory": false,
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
# Union Dues
curl -X POST http://localhost:3000/api/payroll/deduction-types \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Union Dues",
    "code": "UNION",
    "description": "Monthly union membership dues",
    "isStatutory": false
  }'

# Absent Deduction
curl -X POST http://localhost:3000/api/payroll/deduction-types \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Absent Deduction",
    "code": "ABSENT",
    "description": "Deduction for absent days",
    "isStatutory": false
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
- **PAYE**: $51,100.00
- **NSSA**: $9,765.00
- **AIDS Levy**: $7,273.36
- **Union Dues**: $4,340.00
- **Absent Deduction**: $4,173.08
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

