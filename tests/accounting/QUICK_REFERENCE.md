# Accounting Tests Quick Reference

## 🚀 Quick Start

### 1. Start Server
```bash
npm start
```

### 2. Run Basic Test
```powershell
powershell -ExecutionPolicy Bypass -File tests/accounting/test-expense-simple.ps1
```

## 📋 Test Scripts Overview

| Script | Purpose | Status |
|--------|---------|--------|
| `test-expense-simple.ps1` | Basic expense creation workflow | ✅ Working |
| `test-vendors-complete.ps1` | Full vendor CRUD testing | ✅ Working |
| `test-currency-crud.ps1` | Currency management | ✅ Working |
| `test-expense-categories.ps1` | Category management | ✅ Working |
| `test-expenses.ps1` | Comprehensive expense testing | ✅ Working |
| `reset-vendors.ps1` | Reset vendors to default | ✅ Working |
| `create-test-user.ps1` | Create test user | ⚠️ Not needed |

## 🔑 Credentials

**Admin Login:**
- Email: `admin@nvccz.co.zw`
- Password: `admin123`

## 📊 Expected Results

### Expense Creation Test
- **Input**: 300 ZWL Legal Fees (Taxable)
- **VAT**: 43.5 ZWL (14.5%)
- **Total**: 343.5 ZWL
- **Status**: POSTED
- **Journal Entry**: Auto-generated

### Vendor Test
- **Vendors Created**: 12 (CBZ Bank, Chambers Legal, etc.)
- **Categories**: 9 (Professional Services, Travel, etc.)
- **Currencies**: 2 (ZWL default, USD inactive)

## 🛠️ Troubleshooting

### Common Commands
```powershell
# Check server status
curl http://localhost:3000/api/health

# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nvccz.co.zw","password":"admin123"}'

# List vendors
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/accounting/vendors
```

### Error Solutions
1. **401 Unauthorized**: Check admin credentials
2. **500 Server Error**: Check database connection
3. **PowerShell Errors**: Run with `-ExecutionPolicy Bypass`

## 📈 Test Coverage

- ✅ Authentication
- ✅ Vendor CRUD
- ✅ Currency Management
- ✅ Expense Categories
- ✅ Expense Creation
- ✅ VAT Calculation
- ✅ Double-Entry Journal
- ✅ Soft Delete

## 🎯 Next Tests

1. **Invoice Creation**: Test invoice generation
2. **Bank Reconciliation**: Test CSV upload
3. **Financial Reports**: Test P&L generation
4. **Advanced VAT**: Test complex VAT scenarios

---

**Last Test**: 2025-08-04
**Status**: ✅ All core functionality working 