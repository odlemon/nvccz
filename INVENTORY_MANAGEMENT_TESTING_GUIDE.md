# 🧪 **INVENTORY MANAGEMENT SYSTEM - TESTING GUIDE**

## 📋 **OVERVIEW**

This guide will help you test the complete Inventory Management System implementation. The system includes:
- **Perpetual Inventory Tracking**
- **COGS (Cost of Goods Sold) Management**
- **Stock Movement Recording**
- **Inventory Valuation**
- **Reorder Level Alerts**
- **Sales Invoice Integration**

## 🚀 **SETUP REQUIREMENTS**

### **1. Database Migration**
```bash
# Run the migration to create inventory tables
npx prisma migrate dev --name inventory-management-system
```

### **2. Create Required Chart of Accounts**
Before testing, ensure you have these accounts in your Chart of Accounts:
- **Inventory Asset Account** (e.g., "1200 - Inventory Asset")
- **Cost of Goods Sold Account** (e.g., "5000 - Cost of Goods Sold")

## 🧪 **TESTING SCENARIOS**

### **TEST 1: Create Inventory Items**

#### **1.1 Create Basic Inventory Item**
```bash
POST /api/accounting/inventory/items
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "itemName": "Laptop Computer",
  "skuNumber": "LAPTOP-001",
  "description": "Dell Latitude 5520 Laptop",
  "costOfPurchase": 1200.00,
  "quantityOnHand": 10,
  "reorderLevel": 2,
  "unitOfMeasure": "pieces",
  "inventoryAssetAccountId": "YOUR_INVENTORY_ASSET_ACCOUNT_ID"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Inventory item created successfully",
  "data": {
    "id": "item_id",
    "itemName": "Laptop Computer",
    "skuNumber": "LAPTOP-001",
    "quantityOnHand": "10.00",
    "costOfPurchase": "1200.00",
    "reorderLevel": "2.00",
    "isActive": true,
    "supplier": null,
    "inventoryAssetAccount": {
      "id": "account_id",
      "accountNo": "1200",
      "accountName": "Inventory Asset"
    },
    "stockMovements": [
      {
        "id": "movement_id",
        "movementType": "IN",
        "quantity": "10.00",
        "unitCost": "1200.00",
        "totalCost": "12000.00",
        "reference": "INITIAL_STOCK",
        "description": "Initial stock entry"
      }
    ]
  }
}
```

#### **1.2 Create Item with Supplier**
```bash
POST /api/accounting/inventory/items
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "itemName": "Office Chair",
  "skuNumber": "CHAIR-001",
  "description": "Ergonomic Office Chair",
  "costOfPurchase": 250.00,
  "quantityOnHand": 5,
  "reorderLevel": 1,
  "unitOfMeasure": "pieces",
  "supplierId": "YOUR_SUPPLIER_ID",
  "inventoryAssetAccountId": "YOUR_INVENTORY_ASSET_ACCOUNT_ID"
}
```

### **TEST 2: Stock Movement Management**

#### **2.1 Record Stock In Movement**
```bash
POST /api/accounting/inventory/movements
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "itemId": "YOUR_ITEM_ID",
  "movementType": "IN",
  "quantity": 5,
  "unitCost": 1200.00,
  "reference": "PO-2024-001",
  "description": "Purchase order received"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Stock movement recorded successfully",
  "data": {
    "id": "movement_id",
    "itemId": "item_id",
    "movementType": "IN",
    "quantity": "5.00",
    "unitCost": "1200.00",
    "totalCost": "6000.00",
    "reference": "PO-2024-001",
    "description": "Purchase order received"
  }
}
```

#### **2.2 Record Stock Out Movement**
```bash
POST /api/accounting/inventory/movements
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "itemId": "YOUR_ITEM_ID",
  "movementType": "OUT",
  "quantity": 2,
  "unitCost": 1200.00,
  "reference": "SALE-2024-001",
  "description": "Sold to customer"
}
```

#### **2.3 Test Insufficient Stock (Should Fail)**
```bash
POST /api/accounting/inventory/movements
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "itemId": "YOUR_ITEM_ID",
  "movementType": "OUT",
  "quantity": 100,
  "unitCost": 1200.00,
  "reference": "SALE-2024-002",
  "description": "Attempt to sell more than available"
}
```

**Expected Response:**
```json
{
  "error": "Failed to record stock movement",
  "details": "Insufficient stock quantity"
}
```

### **TEST 3: Inventory Valuation**

#### **3.1 Get Inventory Valuation (Average Cost)**
```bash
GET /api/accounting/inventory/valuation?method=AVERAGE
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "totalValue": 18000.00,
    "itemCount": 2,
    "valuation": [
      {
        "itemId": "item_id_1",
        "itemName": "Laptop Computer",
        "quantity": 13.00,
        "unitCost": 1200.00,
        "totalValue": 15600.00
      },
      {
        "itemId": "item_id_2",
        "itemName": "Office Chair",
        "quantity": 5.00,
        "unitCost": 250.00,
        "totalValue": 1250.00
      }
    ]
  }
}
```

#### **3.2 Get Inventory Valuation (FIFO Method)**
```bash
GET /api/accounting/inventory/valuation?method=FIFO
Authorization: Bearer YOUR_TOKEN
```

### **TEST 4: Sales Invoice Processing**

#### **4.1 Process Sales Invoice with Inventory Items**
```bash
POST /api/accounting/inventory/sales-invoice
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "invoiceId": "YOUR_INVOICE_ID",
  "items": [
    {
      "itemId": "YOUR_ITEM_ID",
      "quantity": 2,
      "unitPrice": 1500.00
    }
  ]
}
```

**Expected Results:**
1. **Stock quantity should decrease** by 2 units
2. **COGS journal entry should be created**:
   - Dr Cost of Goods Sold: 2400.00 (2 × 1200.00)
   - Cr Inventory Asset: 2400.00
3. **Sales invoice item record should be created**

#### **4.2 Test Insufficient Stock for Sales (Should Fail)**
```bash
POST /api/accounting/inventory/sales-invoice
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "invoiceId": "YOUR_INVOICE_ID",
  "items": [
    {
      "itemId": "YOUR_ITEM_ID",
      "quantity": 100,
      "unitPrice": 1500.00
    }
  ]
}
```

**Expected Response:**
```json
{
  "error": "Failed to process sales invoice",
  "details": "Insufficient stock for item Laptop Computer"
}
```

### **TEST 5: Inventory Management**

#### **5.1 Get All Inventory Items**
```bash
GET /api/accounting/inventory/items?page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **5.2 Search Inventory Items**
```bash
GET /api/accounting/inventory/items?search=laptop&page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **5.3 Get Single Inventory Item**
```bash
GET /api/accounting/inventory/items/YOUR_ITEM_ID
Authorization: Bearer YOUR_TOKEN
```

#### **5.4 Update Inventory Item**
```bash
PUT /api/accounting/inventory/items/YOUR_ITEM_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "itemName": "Updated Laptop Computer",
  "description": "Updated description",
  "reorderLevel": 3
}
```

#### **5.5 Get Stock Movements for Item**
```bash
GET /api/accounting/inventory/items/YOUR_ITEM_ID/movements?page=1&limit=20
Authorization: Bearer YOUR_TOKEN
```

### **TEST 6: Reorder Level Alerts**

#### **6.1 Create Item with Low Stock**
```bash
POST /api/accounting/inventory/items
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "itemName": "Low Stock Item",
  "skuNumber": "LOW-001",
  "description": "Item with low stock",
  "costOfPurchase": 50.00,
  "quantityOnHand": 1,
  "reorderLevel": 5,
  "unitOfMeasure": "pieces",
  "inventoryAssetAccountId": "YOUR_INVENTORY_ASSET_ACCOUNT_ID"
}
```

#### **6.2 Get Reorder Level Alerts**
```bash
GET /api/accounting/inventory/reorder-alerts
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "itemId": "item_id",
      "itemName": "Low Stock Item",
      "currentQuantity": 1.00,
      "reorderLevel": 5.00,
      "supplierName": null
    }
  ]
}
```

### **TEST 7: Inventory Dashboard**

#### **7.1 Get Inventory Dashboard Data**
```bash
GET /api/accounting/inventory/dashboard
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "totalItems": 3,
    "activeItems": 3,
    "lowStockItems": 1,
    "totalValue": 18000.00,
    "recentMovements": [
      {
        "id": "movement_id",
        "movementType": "OUT",
        "quantity": "2.00",
        "unitCost": "1200.00",
        "totalCost": "2400.00",
        "reference": "SALE-2024-001",
        "description": "Sold to customer",
        "item": {
          "itemName": "Laptop Computer",
          "skuNumber": "LAPTOP-001"
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
-- Check inventory items
SELECT * FROM inventory_items;

-- Check stock movements
SELECT * FROM stock_movements ORDER BY created_at DESC;

-- Check sales invoice items
SELECT * FROM sales_invoice_items;

-- Check journal entries for COGS
SELECT je.*, jel.* 
FROM journal_entries je
JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
WHERE je.description LIKE '%COGS%';
```

### **2. Journal Entry Validation**
Verify that COGS journal entries are created correctly:
- **Debit**: Cost of Goods Sold account
- **Credit**: Inventory Asset account
- **Amount**: Quantity × Unit Cost

### **3. Stock Quantity Validation**
- Stock quantities should update correctly after movements
- Negative quantities should be prevented
- Initial stock should create an "IN" movement

## 🚨 **ERROR SCENARIOS TO TEST**

### **1. Missing Required Fields**
```bash
POST /api/accounting/inventory/items
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "itemName": "Test Item"
  // Missing required fields
}
```

### **2. Invalid Movement Type**
```bash
POST /api/accounting/inventory/movements
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "itemId": "YOUR_ITEM_ID",
  "movementType": "INVALID",
  "quantity": 1,
  "unitCost": 100.00
}
```

### **3. Non-existent Item**
```bash
POST /api/accounting/inventory/movements
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "itemId": "NON_EXISTENT_ID",
  "movementType": "IN",
  "quantity": 1,
  "unitCost": 100.00
}
```

## 📊 **SUCCESS CRITERIA**

### **✅ All Tests Should Pass If:**
1. **Inventory items can be created** with proper validation
2. **Stock movements are recorded** and quantities updated
3. **COGS journal entries are created** automatically on sales
4. **Inventory valuation** calculates correctly
5. **Reorder level alerts** work properly
6. **Sales invoice processing** reduces stock and creates COGS
7. **Dashboard data** is accurate and up-to-date
8. **Error handling** works for invalid inputs
9. **Database integrity** is maintained throughout

### **🎯 Key Features Verified:**
- ✅ **Perpetual Inventory System**
- ✅ **Automatic COGS Recording**
- ✅ **Stock Movement Tracking**
- ✅ **Inventory Valuation**
- ✅ **Reorder Level Management**
- ✅ **Sales Integration**
- ✅ **Dashboard Analytics**

## 🚀 **NEXT STEPS**

After successful testing:
1. **Document any issues** found during testing
2. **Verify journal entries** are created correctly
3. **Test with real data** scenarios
4. **Performance test** with large datasets
5. **Integration testing** with other modules

---

**🎉 Congratulations!** You've successfully tested the Inventory Management System. This system now provides:
- Complete perpetual inventory tracking
- Automatic COGS management
- Real-time stock monitoring
- Integration with sales processes
- Comprehensive reporting and analytics

The system is ready for production use! 🚀

