# Testing Documentation

This folder contains all testing scripts and documentation for the NVCC accounting module.

## 📁 Folder Structure

```
tests/
├── README.md                    # This file
├── accounting/                  # PowerShell test scripts
│   ├── test-vendors-complete.ps1
│   ├── reset-vendors.ps1
│   ├── test-vendor-crud.ps1
│   ├── test-currency-crud.ps1
│   ├── test-expense-categories.ps1
│   ├── test-expenses.ps1
│   ├── test-expense-simple.ps1
│   └── create-test-user.ps1
└── docs/                       # Documentation files
    ├── API_DOCUMENTATION.md
    ├── API_INTEGRATION_GUIDE.md
    ├── comprehensive-api-test-guide.md
    ├── create-role.md
    ├── HOMEPAGE_API_DOCS.md
    ├── NESTED_REPLIES_API.md
    ├── NOTIFICATIONS_API.md
    ├── online-activity-guide.md
    ├── SWAGGER_DOCUMENTATION_SUMMARY.md
    ├── SWAGGER_GUIDE.md
    ├── test-api.md
    ├── test-homepage-events.md
    ├── test-login.md
    ├── test-newsletter-image.md
    ├── test-notifications.md
    └── test-swagger.md
```

## 🧪 Test Scripts

### Accounting Module Tests

All PowerShell scripts in the `accounting/` folder test the accounting functionality:

#### **Vendor Management**
- `test-vendors-complete.ps1` - Comprehensive vendor CRUD testing
- `reset-vendors.ps1` - Reset vendors to default state
- `test-vendor-crud.ps1` - Basic vendor CRUD operations

#### **Currency Management**
- `test-currency-crud.ps1` - Currency CRUD operations (ZWL, USD)

#### **Expense Categories**
- `test-expense-categories.ps1` - Expense category management

#### **Expense Management**
- `test-expenses.ps1` - Full expense workflow testing
- `test-expense-simple.ps1` - Simplified expense creation test

#### **User Management**
- `create-test-user.ps1` - Create test user (if needed)

## 🚀 Running Tests

### Prerequisites
1. Ensure the server is running: `npm start`
2. Database should be connected and seeded
3. Admin credentials: `admin@nvccz.co.zw` / `admin123`

### Running Individual Tests

```powershell
# Test vendors
powershell -ExecutionPolicy Bypass -File tests/accounting/test-vendors-complete.ps1

# Test currencies
powershell -ExecutionPolicy Bypass -File tests/accounting/test-currency-crud.ps1

# Test expense creation
powershell -ExecutionPolicy Bypass -File tests/accounting/test-expense-simple.ps1
```

### Running All Tests

```powershell
# Run all accounting tests
Get-ChildItem tests/accounting/*.ps1 | ForEach-Object {
    Write-Host "Running $($_.Name)..." -ForegroundColor Yellow
    powershell -ExecutionPolicy Bypass -File $_.FullName
}
```

## 📋 Test Coverage

### ✅ Completed Tests
- [x] Vendor CRUD operations
- [x] Currency management (ZWL, USD)
- [x] Expense category management
- [x] Expense creation with VAT calculation
- [x] Double-entry journal entry generation
- [x] Authentication and authorization
- [x] Soft delete functionality

### 🔄 In Progress
- [ ] Invoice creation and management
- [ ] Bank reconciliation
- [ ] Financial reports generation
- [ ] Advanced VAT reporting

### 📊 Test Results Summary

**Latest Test Results (2025-08-04):**
- ✅ Authentication: Working with admin credentials
- ✅ Vendor Management: 12 vendors created and managed
- ✅ Currency Management: ZWL (default), USD configured
- ✅ Expense Categories: 9 categories with hierarchical structure
- ✅ Expense Creation: 300 ZWL + 43.5 VAT = 343.5 total
- ✅ Double-Entry: Journal entries created automatically
- ✅ VAT Calculation: 14.5% correctly applied

## 🔧 Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify admin credentials: `admin@nvccz.co.zw` / `admin123`
   - Check server is running on port 3000

2. **Database Connection Issues**
   - Ensure MySQL is running
   - Check `.env` file configuration
   - Run `npx prisma db push` if schema changed

3. **PowerShell Execution Policy**
   - Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

4. **Missing Data**
   - Run Chart of Accounts seeding: `npm run seed:chart-of-accounts`
   - Ensure vendors and categories exist before testing expenses

## 📚 Documentation

All API documentation and guides are in the `docs/` folder:

- **API Documentation**: Complete API reference
- **Integration Guides**: Step-by-step integration instructions
- **Test Guides**: Detailed testing procedures
- **Swagger Documentation**: Interactive API documentation

## 🎯 Next Steps

1. **Complete Invoice Module**: Implement invoice creation and management
2. **Bank Reconciliation**: Add CSV upload and matching functionality
3. **Financial Reports**: Implement P&L, Balance Sheet, Cash Flow reports
4. **Frontend Integration**: Connect with React/Vue frontend
5. **Advanced Testing**: Add Jest unit tests for services

---

**Last Updated**: 2025-08-04
**Test Status**: ✅ Core accounting functionality working
**Next Priority**: Invoice module implementation 