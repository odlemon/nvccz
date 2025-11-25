# 📊 Accounts Payable Outstanding - Matching Guide

## 🎯 Where to Find Accounts Payable on Balance Sheet

### **Balance Sheet Endpoint:**
```
GET /api/accounting/balance-sheet?asOfDate=2025-11-30&currencyId=cmh3bymy70000una4yk8leusu
```

### **Response Structure:**
The Accounts Payable Outstanding value is located at:

```json
{
  "success": true,
  "data": {
    "liabilities": {
      "currentLiabilities": {
        "accounts": [
          {
            "accountNo": "2000",           // ← Account Number
            "accountName": "Accounts Payable",  // ← Account Name
            "balance": 12345.67             // ← THIS VALUE should match performance KPI
          },
          // ... other current liability accounts
        ],
        "total": 12345.67                  // ← If 2000 is the only account, this should also match
      }
    }
  }
}
```

---

## 🔍 **Exact Path to Check:**

**Path**: `data.liabilities.currentLiabilities.accounts[].balance` where `accountNo === "2000"`

**Account Details**:
- **Account Number**: `2000`
- **Account Name**: `"Accounts Payable"` or `"Accounts Payable Control"` or `"Creditors Control"`
- **Account Type**: `"Current Liability"`

---

## ✅ **How to Verify They Match:**

### **1. Performance Analytics:**
```bash
GET /api/performance/analytics/kpi?startDate=2025-11-01&endDate=2025-11-30&currencyId=cmh3bymy70000una4yk8leusu
```

**Look for**: KPI named `"Accounts Payable Outstanding"` → `totalCurrentValue`

### **2. Balance Sheet:**
```bash
GET /api/accounting/balance-sheet?asOfDate=2025-11-30&currencyId=cmh3bymy70000una4yk8leusu
```

**Look for**: 
- Path: `data.liabilities.currentLiabilities.accounts[]`
- Filter: Find object where `accountNo === "2000"`
- Value: `balance` field

### **3. These Values Should Match:**

```
Performance KPI: totalCurrentValue = 12345.67
Balance Sheet:   accountNo "2000".balance = 12345.67
✅ MUST BE EQUAL
```

---

## 📋 **Quick Comparison Steps:**

1. **Get Performance KPI value:**
   ```json
   {
     "kpiAnalytics": [
       {
         "kpi": {
           "name": "Accounts Payable Outstanding"
         },
         "totalCurrentValue": 12345.67  // ← Performance value
       }
     ]
   }
   ```

2. **Get Balance Sheet value:**
   ```json
   {
     "liabilities": {
       "currentLiabilities": {
         "accounts": [
           {
             "accountNo": "2000",
             "accountName": "Accounts Payable",
             "balance": 12345.67  // ← Balance Sheet value
           }
         ]
       }
     }
   }
   ```

3. **Compare**: Both values should be **exactly equal** ✅

---

## ⚠️ **Important Notes:**

- **Account Number**: Must be exactly `"2000"`
- **Date**: Balance Sheet uses `asOfDate` = `endDate` from performance query
- **Currency**: Both must use the same `currencyId`
- **Calculation**: Both use same method from `BalanceSheetService`

---

## 🔧 **If Values Don't Match:**

1. Check that both endpoints use the same `currencyId`
2. Verify `asOfDate` on Balance Sheet = `endDate` from performance query
3. Check that account 2000 exists in Balance Sheet response
4. Ensure both are using POSTED journal entries only

---

## 📍 **Direct JSON Path:**

**Performance**: `response.data.kpiAnalytics[].totalCurrentValue` (where KPI name = "Accounts Payable Outstanding")

**Balance Sheet**: `response.data.liabilities.currentLiabilities.accounts[].balance` (where accountNo = "2000")

