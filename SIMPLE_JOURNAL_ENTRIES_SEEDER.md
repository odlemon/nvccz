# 📚 **SIMPLE JOURNAL ENTRIES SEEDER**

## 📋 **OVERVIEW**

This document describes the simple journal entries seeder that creates basic accounting data with vendors, customers, and journal entries for testing purposes.

---

## 🌱 **SEEDER FILE**

### **`scripts/seed-simple-journal-entries.ts`**
- **Purpose**: Create simple journal entries with vendors and customers
- **Features**:
  - Creates 2 vendors and 2 customers
  - Creates 10 simple journal entries
  - Demonstrates double-entry bookkeeping
  - Shows account balances and financial summary

---

## 🏢 **DATA CREATED**

### **Vendors Created**
1. **Office Supplies Ltd**
   - Email: orders@officesupplies.com
   - Phone: +263 4 123456
   - Address: 123 Business Street, Harare

2. **Tech Solutions Inc**
   - Email: sales@techsolutions.com
   - Phone: +263 4 234567
   - Address: 456 Tech Avenue, Harare

### **Customers Created**
1. **ABC Corporation**
   - Email: finance@abccorp.com
   - Phone: +263 4 345678
   - Address: 789 Corporate Plaza, Harare

2. **XYZ Enterprises**
   - Email: accounts@xyzent.com
   - Phone: +263 4 456789
   - Address: 321 Enterprise Building, Harare

---

## 📝 **JOURNAL ENTRIES CREATED**

### **1. Initial Capital Investment ($100,000)**
- **Debit**: Cash $100,000
- **Credit**: Share Capital $100,000
- **Purpose**: Initial shareholders' investment

### **2. Office Rent Payment ($5,000)**
- **Debit**: Rent Expense $5,000
- **Credit**: Cash $5,000
- **Purpose**: Monthly office rent

### **3. Employee Salaries ($15,000)**
- **Debit**: Salaries and Wages $15,000
- **Credit**: Cash $15,000
- **Purpose**: Monthly salary payment

### **4. Office Supplies Purchase ($2,000)**
- **Debit**: Office Supplies Expense $2,000
- **Credit**: Cash $2,000
- **Purpose**: Purchase from Office Supplies Ltd

### **5. Computer Equipment Purchase ($10,000)**
- **Debit**: Office Equipment $10,000
- **Credit**: Cash $10,000
- **Purpose**: Purchase from Tech Solutions Inc

### **6. Service Revenue - Cash ($25,000)**
- **Debit**: Cash $25,000
- **Credit**: Sales Revenue $25,000
- **Purpose**: Consulting services for ABC Corporation (cash)

### **7. Service Revenue - Credit ($20,000)**
- **Debit**: Accounts Receivable $20,000
- **Credit**: Sales Revenue $20,000
- **Purpose**: Consulting services for XYZ Enterprises (on credit)

### **8. Receivables Collection ($20,000)**
- **Debit**: Cash $20,000
- **Credit**: Accounts Receivable $20,000
- **Purpose**: Payment received from XYZ Enterprises

### **9. Utility Bills Payment ($3,000)**
- **Debit**: Utilities Expense $3,000
- **Credit**: Cash $3,000
- **Purpose**: Electricity, water, internet bills

### **10. Legal and Audit Fees ($5,000)**
- **Debit**: Professional Fees $5,000
- **Credit**: Cash $5,000
- **Purpose**: Legal and audit services

---

## 💰 **ACCOUNT BALANCES**

### **Key Account Balances**
- **Cash and Cash Equivalents**: +$105,000
- **Share Capital**: -$100,000
- **Rent Expense**: +$5,000
- **Salaries and Wages**: +$15,000
- **Office Supplies Expense**: +$2,000
- **Office Equipment**: +$10,000
- **Sales Revenue**: -$45,000
- **Utilities Expense**: +$3,000
- **Professional Fees**: +$5,000

### **Financial Summary**
- **Cash Balance**: $105,000
- **Total Revenue**: $45,000
- **Total Expenses**: $30,000
- **Net Income**: $15,000

---

## 🎯 **BUSINESS SCENARIOS DEMONSTRATED**

### **💰 Capital & Investment**
- Initial capital investment from shareholders
- Proper equity recording

### **🏢 Operations**
- Rent payments for office space
- Employee salary payments
- Office supplies and equipment purchases

### **💼 Revenue Generation**
- Cash sales to customers
- Credit sales with receivables
- Collection of outstanding receivables

### **📊 Expense Management**
- Utility bill payments
- Professional service fees
- Proper expense categorization

---

## 🔧 **TECHNICAL FEATURES**

### **✅ Double-Entry Validation**
- All journal entries are properly balanced
- Debits always equal credits
- Automatic validation before creation

### **✅ Account Mapping**
- Uses chart of accounts for proper account identification
- Validates account existence before creating entries

### **✅ Currency Support**
- Uses default USD currency
- Proper currency assignment to all transactions

### **✅ User Assignment**
- All journal entries assigned to admin user
- Proper user tracking for audit purposes

---

## 🚀 **USAGE**

### **Run the Seeder**
```bash
npx ts-node scripts/seed-simple-journal-entries.ts
```

### **Clear Existing Data**
```bash
npx ts-node scripts/clear-journal-entries.ts
```

### **Fresh Start**
```bash
npx ts-node scripts/clear-journal-entries.ts
npx ts-node scripts/seed-simple-journal-entries.ts
```

---

## 📊 **DATA SUMMARY**

### **Entities Created**
- **2 Vendors**: Office Supplies Ltd, Tech Solutions Inc
- **2 Customers**: ABC Corporation, XYZ Enterprises
- **10 Journal Entries**: Comprehensive business transactions
- **20 Journal Entry Lines**: Detailed transaction breakdown

### **Financial Impact**
- **Total Transaction Value**: $200,000
- **Cash Flow**: $105,000 positive balance
- **Revenue Generated**: $45,000
- **Expenses Incurred**: $30,000
- **Net Income**: $15,000

---

## 💡 **KEY BENEFITS**

### **🎯 Simple Testing**
- Easy to understand business scenarios
- Clear vendor and customer relationships
- Straightforward journal entries

### **📊 Realistic Data**
- Business-appropriate transaction amounts
- Real-world vendor and customer names
- Proper accounting principles

### **🔧 Technical Validation**
- Double-entry bookkeeping verification
- Account balance calculations
- Financial statement preparation

### **🚀 Quick Setup**
- Minimal dependencies
- Fast execution
- Clear success indicators

---

## 🎉 **SUCCESS METRICS**

### **✅ Data Creation**
- ✅ 2 vendors created successfully
- ✅ 2 customers created successfully
- ✅ 10 journal entries created successfully
- ✅ 20 journal entry lines created successfully

### **✅ Accounting Validation**
- ✅ All entries properly balanced
- ✅ Account balances calculated correctly
- ✅ Financial summary generated
- ✅ Double-entry bookkeeping verified

### **✅ Business Logic**
- ✅ Realistic business scenarios
- ✅ Proper vendor/customer relationships
- ✅ Appropriate transaction amounts
- ✅ Complete accounting cycle

---

**🎉 The Simple Journal Entries Seeder is complete and ready for use!**

**📚 Perfect for basic accounting module testing with realistic data!**

**🚀 Quick setup with vendors, customers, and balanced journal entries!**
