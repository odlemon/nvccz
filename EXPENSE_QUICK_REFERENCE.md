# Expense Categories Quick Reference Card

## 🎯 All 5 Categories with Account Mappings

| # | Category | Account | Account Name | Description |
|---|----------|---------|--------------|-------------|
| 1 | **Salaries and Wages** | 5000 | Salaries and Wages | Employee compensation |
| 2 | **Travel and Accommodation** | 5030 | Travel and Entertainment | Business travel expenses |
| 3 | **Operations** | 5090 | Other Operating Expenses | General operational costs |
| 4 | **Branding and Marketing** | 5040 | Marketing and PR | Marketing and advertising |
| 5 | **Office Equipment** | 5020 | Office Equipment | Office supplies and equipment |

## 💳 Payment Method Accounts

| Payment Method | Account | Account Name | Effect |
|----------------|---------|--------------|--------|
| **BANK** | 1000 | Cash and Cash Equivalents | Reduces bank balance |
| **CASH** | 1000 | Cash and Cash Equivalents | Reduces cash balance |
| **CREDIT** | 2000 | Accounts Payable | Increases liability |

## 📊 VAT Treatment

| VAT Status | VAT Rate | VAT Input Account | Journal Entry |
|------------|----------|-------------------|----------------|
| **Taxable** | 15% | 1101 (VAT Input) | Include VAT Input debit |
| **Non-Taxable** | 0% | None | No VAT Input account |

## 🔄 Complete Journal Entry Patterns

### Pattern 1: Taxable Expense via Bank
```
Dr. [Expense Account]     $[Amount]
Dr. 1101 - VAT Input      $[VAT Amount]
    Cr. 1000 - Bank        $[Total Amount]
```

### Pattern 2: Taxable Expense via Cash
```
Dr. [Expense Account]     $[Amount]
Dr. 1101 - VAT Input      $[VAT Amount]
    Cr. 1000 - Cash        $[Total Amount]
```

### Pattern 3: Taxable Expense on Credit
```
Dr. [Expense Account]     $[Amount]
Dr. 1101 - VAT Input      $[VAT Amount]
    Cr. 2000 - Payable     $[Total Amount]
```

### Pattern 4: Non-Taxable Expense (Any Payment Method)
```
Dr. [Expense Account]     $[Amount]
    Cr. [Payment Account]  $[Amount]
```

## 📋 Real Examples

### Salaries and Wages (5000)
- **Bank Payment**: Dr. 5000 ($8,000) + Dr. 1101 ($1,200) → Cr. 1000 ($9,200)
- **Cash Payment**: Dr. 5000 ($500) → Cr. 1000 ($500)
- **Credit Payment**: Dr. 5000 ($6,000) + Dr. 1101 ($900) → Cr. 2000 ($6,900)

### Travel and Accommodation (5030)
- **Bank Payment**: Dr. 5030 ($1,500) + Dr. 1101 ($225) → Cr. 1000 ($1,725)
- **Cash Payment**: Dr. 5030 ($50) + Dr. 1101 ($7.50) → Cr. 1000 ($57.50)
- **Credit Payment**: Dr. 5030 ($800) + Dr. 1101 ($120) → Cr. 2000 ($920)

### Operations (5090)
- **Bank Payment**: Dr. 5090 ($2,000) + Dr. 1101 ($300) → Cr. 1000 ($2,300)
- **Cash Payment**: Dr. 5090 ($100) + Dr. 1101 ($15) → Cr. 1000 ($115)
- **Credit Payment**: Dr. 5090 ($3,000) + Dr. 1101 ($450) → Cr. 2000 ($3,450)

### Branding and Marketing (5040)
- **Bank Payment**: Dr. 5040 ($5,000) + Dr. 1101 ($750) → Cr. 1000 ($5,750)
- **Cash Payment**: Dr. 5040 ($200) + Dr. 1101 ($30) → Cr. 1000 ($230)
- **Credit Payment**: Dr. 5040 ($1,200) + Dr. 1101 ($180) → Cr. 2000 ($1,380)

### Office Equipment (5020)
- **Bank Payment**: Dr. 5020 ($2,500) + Dr. 1101 ($375) → Cr. 1000 ($2,875)
- **Cash Payment**: Dr. 5020 ($150) + Dr. 1101 ($22.50) → Cr. 1000 ($172.50)
- **Credit Payment**: Dr. 5020 ($4,000) + Dr. 1101 ($600) → Cr. 2000 ($4,600)

## ⚡ Quick Decision Tree

```
Expense Created
├── Is it Taxable?
│   ├── YES (15% VAT)
│   │   ├── Payment Method?
│   │   │   ├── BANK → Dr. [Category Account] + Dr. 1101 → Cr. 1000
│   │   │   ├── CASH → Dr. [Category Account] + Dr. 1101 → Cr. 1000
│   │   │   └── CREDIT → Dr. [Category Account] + Dr. 1101 → Cr. 2000
│   └── NO (0% VAT)
│       ├── Payment Method?
│       │   ├── BANK → Dr. [Category Account] → Cr. 1000
│       │   ├── CASH → Dr. [Category Account] → Cr. 1000
│       │   └── CREDIT → Dr. [Category Account] → Cr. 2000
```

## 🎯 Category Selection Guide

| Business Activity | Category | Account |
|-------------------|----------|---------|
| Payroll, wages, bonuses | Salaries and Wages | 5000 |
| Flights, hotels, meals | Travel and Accommodation | 5030 |
| Rent, utilities, supplies | Operations | 5090 |
| Ads, campaigns, PR | Branding and Marketing | 5040 |
| Computers, furniture, tools | Office Equipment | 5020 |

## ✅ Verification Checklist

For every expense created, verify:
- [ ] Correct expense account (5000s) is debited
- [ ] VAT Input (1101) is debited if taxable
- [ ] Payment account is credited correctly
- [ ] Debits = Credits (balanced entry)
- [ ] Amounts are accurate
- [ ] Category matches business activity

## 🚀 API Usage

```javascript
// Create expense with category
POST /api/accounting/expenses
{
  "vendorId": "vendor_id",
  "categoryId": "category_id",  // Use the correct category ID
  "amount": 1000,
  "currencyId": "currency_id",
  "transactionDate": "2024-01-15",
  "description": "Business expense",
  "isTaxable": true,
  "paymentMethod": "BANK"  // or "CASH" or "CREDIT"
}
```

This system ensures every expense is properly categorized and generates accurate journal entries! 🎉
