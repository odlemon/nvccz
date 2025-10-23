# 🔄 **STEP-BY-STEP SEEDING GUIDE**

## 📋 **OVERVIEW**

This guide shows you how to run the seeders step by step. Each seeder is designed to be run independently and handles existing data safely.

---

## 🚀 **SEEDING ORDER**

### **Step 1: Departments** 
```bash
npx ts-node scripts/01-seed-departments.ts
```
- Creates 8 hardcoded departments
- Safe to run multiple times
- **Dependencies**: None

### **Step 2: Roles**
```bash
npx ts-node scripts/02-seed-roles.ts
```
- Creates 40 hardcoded roles (5 per department)
- Safe to run multiple times
- **Dependencies**: Departments (Step 1)

### **Step 3: Admin User**
```bash
npx ts-node scripts/03-seed-admin.ts
```
- Creates admin user with full permissions
- Assigns admin to Operations department
- **Dependencies**: Departments (Step 1), Roles (Step 2)

### **Step 4: Currencies**
```bash
npx ts-node scripts/04-seed-currencies.ts
```
- Creates USD and ZWL currencies
- Safe to run multiple times
- **Dependencies**: None

### **Step 5: KPIs**
```bash
npx ts-node scripts/05-seed-kpis.ts
```
- Creates 27 hardcoded KPIs for performance tracking
- Safe to run multiple times
- **Dependencies**: Departments (Step 1)

### **Step 6: Chart of Accounts**
```bash
npx ts-node scripts/06-seed-chart-of-accounts.ts
```
- Creates comprehensive chart of accounts
- Safe to run multiple times
- **Dependencies**: None

### **Step 7: Vendors**
```bash
npx ts-node scripts/07-seed-vendors.ts
```
- Creates 8 sample vendors
- Safe to run multiple times
- **Dependencies**: None

### **Step 8: Customers**
```bash
npx ts-node scripts/08-seed-customers.ts
```
- Creates 8 sample customers
- Safe to run multiple times
- **Dependencies**: None

### **Step 9: Journal Entries**
```bash
npx ts-node scripts/09-seed-journal-entries.ts
```
- Creates 10 sample journal entries
- Safe to run multiple times
- **Dependencies**: Admin user (Step 3), Currencies (Step 4), Chart of Accounts (Step 6)

---

## 🎯 **QUICK START**

### **Option 1: Run All Steps in Order**
```bash
# Run each step in sequence
npx ts-node scripts/01-seed-departments.ts
npx ts-node scripts/02-seed-roles.ts
npx ts-node scripts/03-seed-admin.ts
npx ts-node scripts/04-seed-currencies.ts
npx ts-node scripts/05-seed-kpis.ts
npx ts-node scripts/06-seed-chart-of-accounts.ts
npx ts-node scripts/07-seed-vendors.ts
npx ts-node scripts/08-seed-customers.ts
npx ts-node scripts/09-seed-journal-entries.ts
```

### **Option 2: Run Specific Steps**
```bash
# Only run what you need
npx ts-node scripts/01-seed-departments.ts
npx ts-node scripts/02-seed-roles.ts
npx ts-node scripts/03-seed-admin.ts
```

---

## 🔍 **WHAT EACH STEP CREATES**

### **Step 1: Departments (8 items)**
- Finance, Sales, Operations, Procurement
- Human Resources, Marketing, Legal, IT

### **Step 2: Roles (40 items)**
- 5 roles per department (Manager, Officer, Specialist, Assistant, Member)
- Each role has appropriate permissions based on level

### **Step 3: Admin User (1 item)**
- Email: admin@nvccz.co.zw
- Password: admin123
- Role: admin (full permissions)
- Department: Operations

### **Step 4: Currencies (2 items)**
- USD (US Dollar)
- ZWL (Zimbabwean Dollar)

### **Step 5: KPIs (27 items)**
- 10 Finance KPIs, 5 Sales KPIs, 2 Operations KPIs
- 5 Procurement KPIs, 5 HR KPIs
- Each KPI linked to appropriate department

### **Step 6: Chart of Accounts (30+ items)**
- Assets (1000s): Cash, Equipment, Receivables
- Liabilities (2000s): Payables, Accruals, Loans
- Equity (3000s): Share Capital, Retained Earnings
- Revenue (4000s): Management Fees, Investment Gains
- Operating Expenses (5000s): Salaries, Rent, Travel, etc.

### **Step 7: Vendors (8 items)**
- Office Supplies, Tech Solutions, Legal Associates
- Marketing Pro, Travel Services, Insurance Partners
- Utilities Provider, Professional Services

### **Step 8: Customers (8 items)**
- ABC Investment Fund, XYZ Capital Partners
- Global Ventures, Tech Startup, Manufacturing Co
- Retail Chain, Healthcare Group, Education Foundation

### **Step 9: Journal Entries (10 items)**
- Initial Capital Investment, Office Rent, Salaries
- Equipment Purchase, Service Revenue, Utilities
- Professional Fees, Marketing, Travel Expenses

---

## ✅ **SEEDER SAFETY FEATURES**

### **All Seeders Are Safe to Run Multiple Times**
- **Skip Logic**: Check for existing data before creating
- **No Duplicates**: Unique constraints are respected
- **No Errors**: Graceful handling of existing data

### **Dependency Checking**
- Each seeder checks for required dependencies
- Clear error messages if dependencies are missing
- Safe to run in any order (with proper dependencies)

### **Data Integrity**
- All journal entries are balanced (debits = credits)
- Foreign key relationships are maintained
- No orphaned records created

---

## 🚨 **TROUBLESHOOTING**

### **Common Issues**

#### **"Department not found" Error**
```bash
# Run departments seeder first
npx ts-node scripts/01-seed-departments.ts
```

#### **"Admin user not found" Error**
```bash
# Run admin seeder first
npx ts-node scripts/03-seed-admin.ts
```

#### **"Currency not found" Error**
```bash
# Run currencies seeder first
npx ts-node scripts/04-seed-currencies.ts
```

#### **"Chart of accounts not found" Error**
```bash
# Run chart of accounts seeder first
npx ts-node scripts/06-seed-chart-of-accounts.ts
```

### **Reset and Start Fresh**
```bash
# If you need to start over
npx prisma db reset
# Then run the seeders in order
```

---

## 🎉 **FINAL RESULT**

After running all steps, you'll have:
- ✅ 8 departments with 40 roles
- ✅ 1 admin user with full permissions
- ✅ 2 currencies (USD, ZWL)
- ✅ 27 KPIs for performance tracking
- ✅ Complete chart of accounts
- ✅ 8 vendors and 8 customers
- ✅ 10 sample journal entries
- ✅ Fully functional system ready for use

---

## 💡 **TIPS**

1. **Run in Order**: Follow the dependency chain for best results
2. **Check Output**: Each seeder shows what it creates
3. **Safe to Repeat**: All seeders handle existing data gracefully
4. **Individual Control**: Run only what you need
5. **Clear Errors**: Each seeder provides helpful error messages

**🎯 You now have complete control over your seeding process!**
