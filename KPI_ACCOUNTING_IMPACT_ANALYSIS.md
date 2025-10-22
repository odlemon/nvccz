# 📊 KPI ACCOUNTING IMPACT ANALYSIS

## 🎯 **OVERVIEW**

This document analyzes which KPIs have accounting effects and what those effects are when KPI tasks are completed.

---

## ✅ **KPIs WITH ACCOUNTING EFFECTS** (22 out of 25 KPIs)

### **Financial Impact Summary:**
- **22 KPIs** have `isFinancial: true` - these generate journal entries
- **3 KPIs** have `isFinancial: false` - these are tracking only, no journal entries

---

## 💰 **FINANCE & ACCOUNTING KPIs** (10 KPIs - ALL FINANCIAL)

### **Revenue KPIs:**
| KPI Code | Name | Account | Effect | Journal Entry |
|----------|------|---------|--------|---------------|
| `TOTAL_REVENUE` | Total Revenue | 4000 (Sales Revenue) | **Increases Revenue** | **Credit** to Sales Revenue |
| `SALES_REVENUE` | Sales Revenue | 4000 (Sales Revenue) | **Increases Revenue** | **Credit** to Sales Revenue |

### **Expense KPIs:**
| KPI Code | Name | Account | Effect | Journal Entry |
|----------|------|---------|--------|---------------|
| `OPERATING_EXPENSES` | Operating Expenses | 5090 (Other Operating Expenses) | **Increases Expenses** | **Debit** to Other Operating Expenses |
| `MARKETING_EXPENSE` | Marketing Expense | 5060 (Marketing Expense) | **Increases Expenses** | **Debit** to Marketing Expense |
| `SALES_COMMISSION_EXPENSE` | Sales Commission Expense | 5030 (Salaries and Wages) | **Increases Expenses** | **Debit** to Salaries and Wages |
| `ADVERTISING_SPEND` | Advertising Spend | 5060 (Marketing Expense) | **Increases Expenses** | **Debit** to Marketing Expense |
| `PAYROLL_EXPENSE` | Payroll Expense | 5030 (Salaries and Wages) | **Increases Expenses** | **Debit** to Salaries and Wages |
| `STAFF_WELFARE_EXPENSE` | Staff Welfare Expense | 5090 (Other Operating Expenses) | **Increases Expenses** | **Debit** to Other Operating Expenses |
| `TRAINING_EXPENSE` | Training Expense | 5090 (Other Operating Expenses) | **Increases Expenses** | **Debit** to Other Operating Expenses |
| `RECRUITMENT_COST` | Recruitment Cost | 5090 (Other Operating Expenses) | **Increases Expenses** | **Debit** to Other Operating Expenses |
| `PROCUREMENT_SPEND` | Procurement Spend | 5090 (Other Operating Expenses) | **Increases Expenses** | **Debit** to Other Operating Expenses |
| `PRODUCTION_EXPENSE` | Production Expense | 5090 (Other Operating Expenses) | **Increases Expenses** | **Debit** to Other Operating Expenses |
| `RAW_MATERIAL_COST` | Raw Material Cost | 5090 (Other Operating Expenses) | **Increases Expenses** | **Debit** to Other Operating Expenses |

### **Asset KPIs:**
| KPI Code | Name | Account | Effect | Journal Entry |
|----------|------|---------|--------|---------------|
| `CASH_FLOW_NET` | Cash Flow (Net) | 1000 (Cash and Cash Equivalents) | **Increases Cash** | **Debit** to Cash and Cash Equivalents |
| `ACCOUNTS_RECEIVABLE_OUTSTANDING` | Accounts Receivable Outstanding | 1200 (Accounts Receivable Control) | **Increases Receivables** | **Debit** to Accounts Receivable Control |
| `CASH_BALANCE` | Cash Balance | 1000 (Cash and Cash Equivalents) | **Increases Cash** | **Debit** to Cash and Cash Equivalents |
| `SUPPLIER_PAYMENTS_MADE` | Supplier Payments Made | 1000 (Cash and Cash Equivalents) | **Decreases Cash** | **Credit** to Cash and Cash Equivalents |

### **Liability KPIs:**
| KPI Code | Name | Account | Effect | Journal Entry |
|----------|------|---------|--------|---------------|
| `ACCOUNTS_PAYABLE_OUTSTANDING` | Accounts Payable Outstanding | 2000 (Accounts Payable) | **Increases Payables** | **Credit** to Accounts Payable |
| `TOTAL_LIABILITIES` | Total Liabilities | Various Liability Accounts | **Increases Liabilities** | **Credit** to Liability Accounts |
| `OUTSTANDING_SUPPLIER_INVOICES` | Outstanding Supplier Invoices | 2000 (Accounts Payable) | **Increases Payables** | **Credit** to Accounts Payable |

### **Equity KPIs:**
| KPI Code | Name | Account | Effect | Journal Entry |
|----------|------|---------|--------|---------------|
| `NET_PROFIT` | Net Profit | 3200 (Current Year Earnings) | **Increases Equity** | **Credit** to Current Year Earnings |
| `SHAREHOLDERS_EQUITY` | Shareholders' Equity | 3000 (Share Capital) | **Increases Equity** | **Credit** to Share Capital |

---

## ❌ **KPIs WITHOUT ACCOUNTING EFFECTS** (3 KPIs - TRACKING ONLY)

### **Non-Financial KPIs:**
| KPI Code | Name | Department | Reason |
|----------|------|------------|--------|
| `BUDGET_UTILISATION` | Budget Utilisation | Finance | **Percentage tracking only** - no journal entries |
| `PROMOTIONAL_BUDGET_UTILISATION` | Promotional Budget Utilisation | Sales | **Percentage tracking only** - no journal entries |
| `HR_BUDGET_UTILISATION` | HR Budget Utilisation | Human Resources | **Percentage tracking only** - no journal entries |
| `PROCUREMENT_BUDGET_UTILISATION` | Procurement Budget Utilisation | Procurement | **Percentage tracking only** - no journal entries |
| `COST_PER_PURCHASE_ORDER` | Cost per Purchase Order | Procurement | **Calculated metric only** - no journal entries |

---

## 🔄 **ACCOUNTING IMPACT BY DEPARTMENT**

### **💰 Finance Department (10 KPIs - ALL FINANCIAL)**
- **Revenue Effects**: 2 KPIs (TOTAL_REVENUE, SALES_REVENUE)
- **Expense Effects**: 1 KPI (OPERATING_EXPENSES)
- **Asset Effects**: 3 KPIs (CASH_FLOW_NET, ACCOUNTS_RECEIVABLE_OUTSTANDING, CASH_BALANCE)
- **Liability Effects**: 2 KPIs (ACCOUNTS_PAYABLE_OUTSTANDING, TOTAL_LIABILITIES)
- **Equity Effects**: 2 KPIs (NET_PROFIT, SHAREHOLDERS_EQUITY)

### **💼 Sales Department (4 KPIs - ALL FINANCIAL)**
- **Revenue Effects**: 1 KPI (SALES_REVENUE)
- **Expense Effects**: 3 KPIs (MARKETING_EXPENSE, SALES_COMMISSION_EXPENSE, ADVERTISING_SPEND)

### **👥 Human Resources Department (4 KPIs - ALL FINANCIAL)**
- **Expense Effects**: 4 KPIs (PAYROLL_EXPENSE, STAFF_WELFARE_EXPENSE, TRAINING_EXPENSE, RECRUITMENT_COST)

### **📦 Procurement Department (4 KPIs - ALL FINANCIAL)**
- **Expense Effects**: 1 KPI (PROCUREMENT_SPEND)
- **Asset Effects**: 1 KPI (SUPPLIER_PAYMENTS_MADE)
- **Liability Effects**: 1 KPI (OUTSTANDING_SUPPLIER_INVOICES)

### **⚙️ Operations Department (2 KPIs - ALL FINANCIAL)**
- **Expense Effects**: 2 KPIs (PRODUCTION_EXPENSE, RAW_MATERIAL_COST)

---

## 📈 **JOURNAL ENTRY PATTERNS**

### **Revenue KPIs (2 KPIs):**
```
When Revenue KPI task is completed:
- Credit: Sales Revenue (4000)
- Debit: Cash/Accounts Receivable (depending on payment method)
```

### **Expense KPIs (11 KPIs):**
```
When Expense KPI task is completed:
- Debit: Specific Expense Account (5030, 5060, 5090)
- Credit: Cash/Accounts Payable (depending on payment method)
```

### **Asset KPIs (4 KPIs):**
```
When Asset KPI task is completed:
- Debit: Asset Account (1000, 1200)
- Credit: Cash/Other Asset (depending on transaction type)
```

### **Liability KPIs (3 KPIs):**
```
When Liability KPI task is completed:
- Credit: Liability Account (2000)
- Debit: Cash/Expense (depending on transaction type)
```

### **Equity KPIs (2 KPIs):**
```
When Equity KPI task is completed:
- Credit: Equity Account (3000, 3200)
- Debit: Cash/Other Asset (depending on transaction type)
```

---

## 🎯 **IMPLEMENTATION IMPLICATIONS**

### **When KPI Tasks Are Completed:**

1. **Check `isFinancial` flag** - only process if `true`
2. **Get account mapping** from `accountNumber` field
3. **Determine journal entry type** from `journalEntryType` field
4. **Create journal entry** with:
   - **Debit/Credit** based on `journalEntryType`
   - **Account** from `accountNumber`
   - **Amount** from KPI task value
   - **Description** from KPI name and task details

### **Example Implementation:**
```typescript
// When PAYROLL_EXPENSE KPI task is completed
const kpi = getKPIByCode("PAYROLL_EXPENSE");
if (kpi.isFinancial) {
  // Create journal entry:
  // Debit: Salaries and Wages (5030) - $5,000
  // Credit: Cash (1000) - $5,000
}
```

---

## 📊 **SUMMARY STATISTICS**

- **Total KPIs**: 25
- **Financial KPIs**: 22 (88%)
- **Non-Financial KPIs**: 3 (12%)
- **Revenue KPIs**: 2
- **Expense KPIs**: 11
- **Asset KPIs**: 4
- **Liability KPIs**: 3
- **Equity KPIs**: 2

---

**🎯 Key Takeaway**: 88% of KPIs have direct accounting effects and will generate journal entries when their associated tasks are completed, providing real-time financial impact tracking across all departments.
