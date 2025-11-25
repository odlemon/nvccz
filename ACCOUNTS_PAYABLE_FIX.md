# 🔧 Accounts Payable KPI Discrepancy Fix

## 🐛 **Problem**

Performance KPI shows: **$9,040**  
Balance Sheet shows: **$2,690.00**  
**Discrepancy: $6,350**

## 🔍 **Root Cause**

The debug script revealed:
- **WITH currency filter**: $2,690.00 ✅ (matches Balance Sheet)
- **WITHOUT currency filter**: **-$9,040.00** ❌ (becomes $9,040 after Math.abs())

The performance analytics is **NOT filtering by currency** even though we added the parameter support.

## 🔧 **Solution**

The Balance Sheet service correctly applies currency filtering when `currencyId` is provided. However, the performance analytics might not be passing it correctly, or the Balance Sheet is being called without the currency filter.

### **Verification Steps:**

1. **Check if currencyId is being passed:**
   - Controller extracts `currencyId` from query params ✅
   - Service method accepts `currencyId` parameter ✅
   - Balance Sheet params include `currencyId` ✅

2. **Check if Balance Sheet applies filter:**
   - Balance Sheet service checks `params.currencyId` ✅
   - Adds to `journalEntryWhere` filter ✅

### **Next Steps:**

1. **Restart the server** to ensure latest code is running
2. **Test the endpoint with currencyId:**
   ```
   GET /api/performance/analytics/kpi?startDate=2025-11-01&endDate=2025-11-30&currencyId=cmh3bymy70000una4yk8leusu
   ```
3. **Check server logs** for:
   - `[PerformanceAnalytics] Loading Balance Sheet with params:`
   - `💱 Currency filter applied: cmh3bymy70000una4yk8leusu`

4. **If still not working**, check if there's a cached Balance Sheet or if the currencyId is being lost somewhere in the call chain.

## 📊 **Expected Result**

After fix, both should show: **$2,690.00**

---
**Status**: Debug logging added, investigation in progress

