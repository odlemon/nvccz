# 🏗️ **ASSET MANAGEMENT SYSTEM - TESTING GUIDE**

## 📋 **OVERVIEW**

This guide will help you test the complete Asset Management System implementation. The system includes:
- **Asset Creation and Management**
- **Depreciation Calculations (Straight-Line & Diminishing Balance)**
- **Asset Disposal with Gain/Loss Calculation**
- **Asset Register and Depreciation Schedule**
- **Automatic Journal Entry Creation**

## 🚀 **SETUP REQUIREMENTS**

### **1. Database Migration**
```bash
# Run the migration to create asset tables
npx prisma migrate dev --name asset-management-system
```

### **2. Create Required Chart of Accounts**
Before testing, ensure you have these accounts in your Chart of Accounts:
- **Asset Account** (e.g., "1100 - Office Equipment")
- **Accumulated Depreciation Account** (e.g., "1300 - Accumulated Depreciation")
- **Depreciation Expense Account** (e.g., "5000 - Depreciation Expense")
- **Cash Account** (e.g., "1000 - Cash and Cash Equivalents")

## 🧪 **TESTING SCENARIOS**

### **TEST 1: Create Assets**

#### **1.1 Create Basic Asset (Straight-Line Depreciation)**
```bash
POST /api/accounting/assets
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "assetName": "Dell Laptop Computer",
  "assetCode": "LAPTOP-001",
  "description": "Dell Latitude 5520 Laptop for office use",
  "purchaseDate": "2024-01-01",
  "cost": 1500.00,
  "usefulLifeYears": 3,
  "depreciationMethod": "STRAIGHT_LINE",
  "salvageValue": 150.00,
  "assetAccountId": "YOUR_ASSET_ACCOUNT_ID",
  "accumulatedDepreciationAccountId": "YOUR_ACCUMULATED_DEPRECIATION_ACCOUNT_ID",
  "depreciationExpenseAccountId": "YOUR_DEPRECIATION_EXPENSE_ACCOUNT_ID",
  "location": "Office Building A",
  "serialNumber": "DL5520-001",
  "warrantyExpiry": "2026-01-01"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Asset created successfully",
  "data": {
    "id": "asset_id",
    "assetName": "Dell Laptop Computer",
    "assetCode": "LAPTOP-001",
    "cost": "1500.00",
    "currentBookValue": "1500.00",
    "usefulLifeYears": 3,
    "depreciationMethod": "STRAIGHT_LINE",
    "salvageValue": "150.00",
    "status": "IN_USE",
    "assetAccount": {
      "id": "account_id",
      "accountNo": "1100",
      "accountName": "Office Equipment"
    },
    "accumulatedDepreciationAccount": {
      "id": "account_id",
      "accountNo": "1300",
      "accountName": "Accumulated Depreciation"
    },
    "depreciationExpenseAccount": {
      "id": "account_id",
      "accountNo": "5000",
      "accountName": "Depreciation Expense"
    }
  }
}
```

#### **1.2 Create Asset with Diminishing Balance Depreciation**
```bash
POST /api/accounting/assets
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "assetName": "Office Printer",
  "assetCode": "PRINTER-001",
  "description": "HP LaserJet Pro Printer",
  "purchaseDate": "2024-01-01",
  "cost": 800.00,
  "usefulLifeYears": 5,
  "depreciationMethod": "DIMINISHING_BALANCE",
  "salvageValue": 50.00,
  "assetAccountId": "YOUR_ASSET_ACCOUNT_ID",
  "accumulatedDepreciationAccountId": "YOUR_ACCUMULATED_DEPRECIATION_ACCOUNT_ID",
  "depreciationExpenseAccountId": "YOUR_DEPRECIATION_EXPENSE_ACCOUNT_ID",
  "location": "Office Building A",
  "serialNumber": "HP-LJ-001"
}
```

### **TEST 2: Calculate Depreciation**

#### **2.1 Calculate Monthly Depreciation (Straight-Line)**
```bash
POST /api/accounting/assets/LAPTOP-001/depreciation
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "period": "2024-01"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Depreciation calculated successfully",
  "data": {
    "id": "depreciation_id",
    "assetId": "asset_id",
    "period": "2024-01",
    "depreciationAmount": "37.50",
    "accumulatedDepreciation": "37.50",
    "bookValue": "1462.50",
    "isPosted": false
  }
}
```

**Expected Calculation:**
- Monthly Depreciation = (Cost - Salvage Value) / (Useful Life × 12)
- Monthly Depreciation = (1500 - 150) / (3 × 12) = 1350 / 36 = 37.50

#### **2.2 Calculate Monthly Depreciation (Diminishing Balance)**
```bash
POST /api/accounting/assets/PRINTER-001/depreciation
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "period": "2024-01"
}
```

**Expected Calculation:**
- Rate = 2 / Useful Life = 2 / 5 = 0.4 (40%)
- Monthly Rate = 0.4 / 12 = 0.0333 (3.33%)
- Monthly Depreciation = 800 × 0.0333 = 26.67

### **TEST 3: Post Depreciation Journal Entry**

#### **3.1 Post Depreciation**
```bash
POST /api/accounting/assets/depreciation/DEPRECIATION_ID/post
Authorization: Bearer YOUR_TOKEN
```

**Expected Results:**
1. **Journal Entry Created**:
   - Dr Depreciation Expense: 37.50
   - Cr Accumulated Depreciation: 37.50
2. **Depreciation Record Updated**: `isPosted = true`
3. **Asset Book Value Updated**: `currentBookValue = 1462.50`

### **TEST 4: Asset Disposal**

#### **4.1 Dispose Asset with Gain**
```bash
POST /api/accounting/assets/LAPTOP-001/dispose
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "disposalDate": "2024-12-31",
  "disposalValue": 200.00,
  "disposalMethod": "SALE",
  "description": "Sold to employee at discounted price"
}
```

**Expected Results:**
1. **Asset Status Updated**: `status = "DISPOSED"`
2. **Disposal Record Created** with gain/loss calculation
3. **Journal Entry Created**:
   - Dr Cash: 200.00
   - Dr Accumulated Depreciation: (total depreciation)
   - Cr Asset Account: 1500.00
   - Cr Gain on Disposal: (if applicable)

#### **4.2 Dispose Asset with Loss**
```bash
POST /api/accounting/assets/PRINTER-001/dispose
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "disposalDate": "2024-12-31",
  "disposalValue": 30.00,
  "disposalMethod": "SCRAP",
  "description": "Scrapped due to irreparable damage"
}
```

### **TEST 5: Asset Management**

#### **5.1 Get All Assets**
```bash
GET /api/accounting/assets?page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **5.2 Search Assets**
```bash
GET /api/accounting/assets?search=laptop&page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **5.3 Get Single Asset**
```bash
GET /api/accounting/assets/ASSET_ID
Authorization: Bearer YOUR_TOKEN
```

#### **5.4 Update Asset**
```bash
PUT /api/accounting/assets/ASSET_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "assetName": "Updated Dell Laptop Computer",
  "description": "Updated description",
  "location": "Office Building B"
}
```

#### **5.5 Delete Asset (Soft Delete)**
```bash
DELETE /api/accounting/assets/ASSET_ID
Authorization: Bearer YOUR_TOKEN
```

### **TEST 6: Asset Reports**

#### **6.1 Get Asset Register**
```bash
GET /api/accounting/assets/register/asset-register
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "assetId": "asset_id",
      "assetName": "Dell Laptop Computer",
      "assetCode": "LAPTOP-001",
      "cost": 1500.00,
      "accumulatedDepreciation": 37.50,
      "bookValue": 1462.50,
      "status": "IN_USE",
      "purchaseDate": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### **6.2 Get Depreciation Schedule**
```bash
GET /api/accounting/assets/ASSET_ID/depreciation-schedule
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "period": "2024-01",
      "depreciationAmount": 37.50,
      "accumulatedDepreciation": 37.50,
      "bookValue": 1462.50,
      "isPosted": true
    },
    {
      "period": "2024-02",
      "depreciationAmount": 37.50,
      "accumulatedDepreciation": 75.00,
      "bookValue": 1425.00,
      "isPosted": false
    }
  ]
}
```

#### **6.3 Get Asset Dashboard**
```bash
GET /api/accounting/assets/dashboard/asset-dashboard
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "totalAssets": 2,
    "activeAssets": 2,
    "disposedAssets": 0,
    "totalCost": 2300.00,
    "totalDepreciation": 37.50,
    "recentDepreciation": [
      {
        "id": "depreciation_id",
        "period": "2024-01",
        "depreciationAmount": "37.50",
        "asset": {
          "assetName": "Dell Laptop Computer",
          "assetCode": "LAPTOP-001"
        },
        "createdBy": {
          "firstName": "John",
          "lastName": "Doe"
        }
      }
    ]
  }
}
```

## 🔍 **VALIDATION CHECKS**

### **1. Database Validation**
After each test, verify in your database:

```sql
-- Check assets
SELECT * FROM assets;

-- Check depreciation records
SELECT * FROM depreciation_records ORDER BY created_at DESC;

-- Check asset disposal records
SELECT * FROM asset_disposal_records;

-- Check journal entries for asset transactions
SELECT je.*, jel.* 
FROM journal_entries je
JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
WHERE je.description LIKE '%Asset%' OR je.description LIKE '%Depreciation%';
```

### **2. Journal Entry Validation**
Verify that journal entries are created correctly:

#### **Asset Acquisition:**
- **Debit**: Asset Account (1500.00)
- **Credit**: Cash Account (1500.00)

#### **Depreciation:**
- **Debit**: Depreciation Expense (37.50)
- **Credit**: Accumulated Depreciation (37.50)

#### **Asset Disposal:**
- **Debit**: Cash (200.00)
- **Debit**: Accumulated Depreciation (total depreciation)
- **Credit**: Asset Account (1500.00)
- **Credit**: Gain on Disposal (if applicable)

### **3. Depreciation Calculation Validation**

#### **Straight-Line Method:**
- Monthly Depreciation = (Cost - Salvage Value) / (Useful Life × 12)
- Example: (1500 - 150) / (3 × 12) = 37.50

#### **Diminishing Balance Method:**
- Rate = 2 / Useful Life
- Monthly Rate = Rate / 12
- Monthly Depreciation = Current Book Value × Monthly Rate

## 🚨 **ERROR SCENARIOS TO TEST**

### **1. Missing Required Fields**
```bash
POST /api/accounting/assets
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "assetName": "Test Asset"
  // Missing required fields
}
```

### **2. Invalid Depreciation Method**
```bash
POST /api/accounting/assets
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "assetName": "Test Asset",
  "assetCode": "TEST-001",
  "cost": 1000.00,
  "usefulLifeYears": 3,
  "depreciationMethod": "INVALID_METHOD",
  "assetAccountId": "account_id",
  "accumulatedDepreciationAccountId": "account_id",
  "depreciationExpenseAccountId": "account_id"
}
```

### **3. Duplicate Asset Code**
```bash
POST /api/accounting/assets
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "assetName": "Duplicate Asset",
  "assetCode": "LAPTOP-001", // Same as existing
  "cost": 1000.00,
  "usefulLifeYears": 3,
  "depreciationMethod": "STRAIGHT_LINE",
  "assetAccountId": "account_id",
  "accumulatedDepreciationAccountId": "account_id",
  "depreciationExpenseAccountId": "account_id"
}
```

### **4. Calculate Depreciation for Disposed Asset**
```bash
POST /api/accounting/assets/DISPOSED_ASSET_ID/depreciation
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "period": "2024-01"
}
```

## 📊 **SUCCESS CRITERIA**

### **✅ All Tests Should Pass If:**
1. **Assets can be created** with proper validation
2. **Depreciation calculations** are accurate for both methods
3. **Journal entries are created** automatically for all transactions
4. **Asset disposal** handles gain/loss correctly
5. **Asset register** shows accurate information
6. **Depreciation schedule** tracks all periods correctly
7. **Dashboard data** is accurate and up-to-date
8. **Error handling** works for invalid inputs
9. **Database integrity** is maintained throughout

### **🎯 Key Features Verified:**
- ✅ **Asset Lifecycle Management**
- ✅ **Automatic Depreciation Calculation**
- ✅ **Journal Entry Integration**
- ✅ **Asset Disposal with Gain/Loss**
- ✅ **Comprehensive Reporting**
- ✅ **Dashboard Analytics**

## 🚀 **NEXT STEPS**

After successful testing:
1. **Document any issues** found during testing
2. **Verify journal entries** are created correctly
3. **Test with real data** scenarios
4. **Performance test** with large datasets
5. **Integration testing** with other modules

---

**🎉 Congratulations!** You've successfully tested the Asset Management System. This system now provides:
- Complete asset lifecycle management
- Automatic depreciation calculations
- Asset disposal with gain/loss tracking
- Comprehensive reporting and analytics
- Full integration with the accounting system

The system is ready for production use! 🚀

