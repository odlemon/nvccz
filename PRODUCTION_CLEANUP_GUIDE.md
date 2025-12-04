# 🧹 **PRODUCTION CLEANUP GUIDE**

## 📋 **OVERVIEW**

This guide provides step-by-step instructions for cleaning the database before production deployment. It removes all non-essential data while preserving critical system data.

---

## ⚠️ **BEFORE YOU START**

### **1. Backup Your Database**
```bash
# Create a backup before running cleanup
mysqldump -u [username] -p [database_name] > backup_before_cleanup.sql
```

### **2. Test in Development First**
- Always test the cleanup script in a development/staging environment first
- Verify that essential data is preserved
- Verify that the system functions correctly after cleanup

### **3. Review Essential Data**
- Review `ESSENTIAL_DATA_ANALYSIS.md` to understand what will be preserved
- Ensure all essential data is correctly identified

---

## 🚀 **RUNNING THE CLEANUP**

### **Step 1: Review the Cleanup Script**
```bash
# Review the cleanup script
cat scripts/cleanup-non-essential-data.ts
```

### **Step 2: Run the Cleanup Script**
```bash
# Run the cleanup script
npx ts-node scripts/cleanup-non-essential-data.ts
```

### **Step 3: Verify Results**
The script will automatically verify that essential data is preserved. Check the output for:
- ✅ Admin user preserved
- ✅ Admin role preserved
- ✅ All roles preserved
- ✅ All departments preserved
- ✅ All currencies preserved
- ✅ All chart of accounts preserved
- ✅ All KPIs preserved

---

## ✅ **WHAT WILL BE PRESERVED**

### **Essential Data (Will NOT be deleted):**
1. **Admin User**: `admin@nvccz.co.zw`
2. **Admin Role**: Role with name `admin`
3. **All Roles**: All 40+ hardcoded roles
4. **All Departments**: 8 hardcoded departments
5. **Currencies**: USD and ZWL
6. **Chart of Accounts**: Complete chart of accounts structure
7. **KPIs**: All 27 hardcoded KPIs

### **Optional Configuration (May be preserved):**
- Procurement Approval Configs
- Tax Rules
- Allowance Types
- Deduction Types
- Salary Structures
- Entry Type Configs
- Reference Number Configs
- Period Lockouts

---

## ❌ **WHAT WILL BE DELETED**

### **All Transaction Data:**
- Journal Entries
- Expenses
- Invoices
- Revenues
- Cashbook Entries
- Bank Reconciliations
- Payment Allocations
- Cashbook Transfers
- Cashbook Batches
- Bank Statements

### **All Business Data:**
- Customers
- Vendors
- Applications
- Portfolio Companies
- Funds
- Clients
- Investment Data
- Performance Goals
- Tasks
- Activities
- Procurement Data
- Payroll Data
- Inventory Data
- Asset Data
- Financial Reports
- Content & Communication
- Notifications
- Stakeholder Data
- Reporting Data
- Deal Management Data
- Risk Management Data
- Budget Data
- Portfolio Valuation Data
- Exit Interviews
- Company Profiles
- Targets
- Banks
- Expense Categories
- Revenue Sources & Categories

---

## 📊 **EXPECTED RESULTS**

After cleanup, your database should contain approximately:
- **1 user** (admin only)
- **~41 roles** (1 admin + 40 hardcoded)
- **8 departments**
- **2 currencies** (USD, ZWL)
- **~50-60 chart of accounts**
- **27 KPIs**

**Total Essential Records**: ~130-140 records

---

## 🔄 **AFTER CLEANUP**

### **1. Verify System Functionality**
- Test admin login
- Verify roles and permissions
- Check chart of accounts
- Verify currencies
- Check KPIs

### **2. Re-seed Optional Data (If Needed)**
If you need sample data for testing or development:
```bash
# Re-seed vendors and customers (optional)
npx ts-node scripts/07-seed-vendors.ts
npx ts-node scripts/08-seed-customers.ts

# Re-seed journal entries (optional)
npx ts-node scripts/09-seed-journal-entries.ts
```

### **3. Create Production Users**
After cleanup, create production users:
```bash
# Use the admin account to create production users via API or admin panel
```

---

## 🛠️ **TROUBLESHOOTING**

### **Issue: Admin user not found**
**Solution**: Ensure admin user exists before running cleanup:
```bash
npx ts-node scripts/03-seed-admin.ts
```

### **Issue: Foreign key constraint errors**
**Solution**: The cleanup script uses transactions and handles dependencies. If errors occur:
1. Check the error message
2. Verify all related data is being deleted
3. Check for any missing models in the cleanup script

### **Issue: Essential data deleted**
**Solution**: 
1. Restore from backup
2. Review the cleanup script
3. Check the essential data identification logic
4. Re-run cleanup after fixing issues

---

## 📝 **MANUAL CLEANUP (Alternative)**

If you prefer to manually clean specific tables:

```sql
-- Delete all users except admin
DELETE FROM users WHERE email != 'admin@nvccz.co.zw';

-- Delete all journal entries
DELETE FROM journal_entry_lines;
DELETE FROM journal_entries;

-- Delete all expenses
DELETE FROM expenses;

-- Continue with other tables...
```

**Note**: Be careful with foreign key constraints when doing manual cleanup.

---

## 🎯 **BEST PRACTICES**

1. **Always backup first**: Never run cleanup without a backup
2. **Test in development**: Always test in a non-production environment first
3. **Verify after cleanup**: Always verify essential data is preserved
4. **Document changes**: Document any customizations to the cleanup script
5. **Review regularly**: Review and update the cleanup script as new models are added

---

## 📚 **RELATED DOCUMENTATION**

- `ESSENTIAL_DATA_ANALYSIS.md` - Detailed analysis of essential vs non-essential data
- `scripts/cleanup-non-essential-data.ts` - The cleanup script
- `scripts/README-STEP-BY-STEP-SEEDING.md` - Seeding guide for re-creating data

---

## ⚡ **QUICK REFERENCE**

```bash
# 1. Backup database
mysqldump -u [username] -p [database_name] > backup.sql

# 2. Run cleanup
npx ts-node scripts/cleanup-non-essential-data.ts

# 3. Verify results (script does this automatically)

# 4. Test system functionality

# 5. Create production users
```

---

## 🆘 **SUPPORT**

If you encounter issues:
1. Check the error messages
2. Review the cleanup script
3. Verify essential data exists before cleanup
4. Restore from backup if needed
5. Review `ESSENTIAL_DATA_ANALYSIS.md` for details

---

**Last Updated**: 2024
**Version**: 1.0

