# 🔍 Check Server Logs - Currency ID Tracking

## 📋 **What to Look For in Server Logs**

When you call:
```
GET /api/performance/analytics/kpi?startDate=2025-11-01&endDate=2025-11-30&currencyId=cmh3bymy70000una4yk8leusu
```

You should see these log messages in order:

### **1. Controller Log (First)**
```
[PerformanceAnalyticsController] Received query params: {
  kpiId: undefined,
  department: undefined,
  startDate: '2025-11-01',
  endDate: '2025-11-30',
  currencyId: 'cmh3bymy70000una4yk8leusu'  ← Should show the currencyId, NOT "NOT PROVIDED"
}
```

### **2. Service Log (Second)**
```
[PerformanceAnalytics] Setting currencyId in balanceSheetParams: cmh3bymy70000una4yk8leusu
```
OR (if not working):
```
[PerformanceAnalytics] ⚠️ No currencyId provided or currencyId is empty
```

### **3. Balance Sheet Loading Log (Third)**
```
[PerformanceAnalytics] Loading Balance Sheet with params:
   asOfDate: 2025-11-30T...
   currencyId: cmh3bymy70000una4yk8leusu  ← Should NOT say "NOT PROVIDED ⚠️"
```

### **4. Balance Sheet Service Log (Fourth)**
```
════════════════════════════════════════════════════════════════
📊 GENERATING BALANCE SHEET
════════════════════════════════════════════════════════════════
📅 As of Date: 2025-11-30
💱 Currency ID: cmh3bymy70000una4yk8leusu  ← Should NOT say "Default"
```
Then:
```
   💱 Currency filter applied: cmh3bymy70000una4yk8leusu
   ⚠️  Only journal entries with this currency will be included
```

---

## ❌ **If Currency ID is NOT Working, You'll See:**

```
[PerformanceAnalyticsController] Received query params: { currencyId: 'NOT PROVIDED' }
[PerformanceAnalytics] ⚠️ No currencyId provided or currencyId is empty
[PerformanceAnalytics] Loading Balance Sheet with params: { currencyId: 'NOT PROVIDED ⚠️' }
💱 Currency ID: Default
💱 No currency filter - including all currencies
```

---

## ✅ **Expected Result if Working:**

1. Controller logs show currencyId received
2. Service logs show currencyId being set
3. Balance Sheet logs show currencyId received
4. Balance Sheet applies currency filter
5. **Accounts Payable Outstanding = $2,690.00** ✅

---

## 🔧 **If Currency ID is Missing:**

### **Check Query Parameter:**
Make sure the URL includes `currencyId`:
```
?startDate=2025-11-01&endDate=2025-11-30&currencyId=cmh3bymy70000una4yk8leusu
```

### **Check Controller:**
Look for: `[PerformanceAnalyticsController] Received query params:`
- If currencyId shows as `undefined` or missing, the query parameter isn't being extracted

### **Check Service:**
Look for: `[PerformanceAnalytics] Setting currencyId in balanceSheetParams:`
- If you see the warning instead, currencyId wasn't passed correctly

---

## 📊 **Quick Test:**

1. Check server logs for the messages above
2. If currencyId is showing as "NOT PROVIDED" or "Default", it's not being passed
3. If it shows the correct currencyId but still shows wrong value ($9,040), there's a different issue

**Share the log output and I'll help fix it!**

