# 🧪 CSV Import Testing Guide

## 📋 **SRD-Compliant Batch Processing Implementation**

### **🎯 What We Built:**

1. **CSV Import Service** - Handles file upload to Firebase and parsing
2. **Batch Processing** - Creates unposted batch with all transactions
3. **Validation** - Validates each transaction before creating batch
4. **Batch Posting** - Posts entire batch to GL at once (SRD-compliant)

### **🔧 API Endpoints:**

#### **1. Import CSV File**
```
POST /api/cashbook/batches/import
Content-Type: multipart/form-data
Authorization: Bearer <token>

Body: FormData with 'file' field containing CSV
```

#### **2. List All Batches**
```
GET /api/cashbook/batches?page=1&limit=10&status=DRAFT
Authorization: Bearer <token>
```

#### **3. Get Batch Details**
```
GET /api/cashbook/batches/{batchId}
Authorization: Bearer <token>
```

#### **4. Update Batch**
```
PUT /api/cashbook/batches/{batchId}
Authorization: Bearer <token>

Body: { "name": "Updated Name", "description": "Updated Description" }
```

#### **5. Post Batch to GL**
```
POST /api/cashbook/batches/{batchId}/post
Authorization: Bearer <token>
```

#### **6. Delete Batch**
```
DELETE /api/cashbook/batches/{batchId}
Authorization: Bearer <token>
```

### **📄 Sample CSV Format:**

```csv
bankId,transactionDate,description,amount,reference,counterpartyType,customerId,vendorId,glAccountId,vatCode,projectCode,discount
cmh6uttcj0001un0o61btp3ns,2025-01-15,Customer Payment - Invoice #INV-001,1500.00,RCP-001,CUSTOMER,cmh3c8jk60000un0ke5broxit,,,15%,PROJ-001,0
cmh6uttcj0001un0o61btp3ns,2025-01-15,GL Receipt - Share Capital,5000.00,RCP-002,GL,,,,cmh3c1toy000dunxkn03z31zv,15%,,0
```

### **🧪 Testing Steps:**

#### **Step 1: Start Server**
```bash
npm run dev
```

#### **Step 2: Get Authentication Token**
```bash
# Login to get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@nvccz.com", "password": "admin123"}'
```

#### **Step 3: Import CSV File**
```bash
curl -X POST http://localhost:3000/api/cashbook/batches/import \
  -H "Authorization: Bearer <your-token>" \
  -F "file=@sample-cashbook-transactions-clean.csv"
```

#### **Step 4: Check Batch Details**
```bash
curl -X GET http://localhost:3000/api/cashbook/batches/{batchId} \
  -H "Authorization: Bearer <your-token>"
```

#### **Step 5: List All Batches**
```bash
curl -X GET "http://localhost:3000/api/cashbook/batches?page=1&limit=10&status=DRAFT" \
  -H "Authorization: Bearer <your-token>"
```

#### **Step 6: Update Batch**
```bash
curl -X PUT http://localhost:3000/api/cashbook/batches/{batchId} \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Batch Name", "description": "Updated description"}'
```

#### **Step 7: Post Batch to GL**
```bash
curl -X POST http://localhost:3000/api/cashbook/batches/{batchId}/post \
  -H "Authorization: Bearer <your-token>"
```

#### **Step 8: Delete Batch (if not posted)**
```bash
curl -X DELETE http://localhost:3000/api/cashbook/batches/{batchId} \
  -H "Authorization: Bearer <your-token>"
```

### **📊 Expected Response:**

#### **Import Response:**
```json
{
  "success": true,
  "message": "CSV imported successfully",
  "data": {
    "batchId": "cmh...",
    "totalTransactions": 10,
    "validTransactions": 10,
    "invalidTransactions": 0,
    "errors": [],
    "fileUrl": "https://firebasestorage.googleapis.com/..."
  }
}
```

#### **Batch Details Response:**
```json
{
  "success": true,
  "message": "Batch retrieved successfully",
  "data": {
    "id": "cmh...",
    "name": "CSV Import - 2025-01-15",
    "status": "DRAFT",
    "totalAmount": "20050.00",
    "transactions": [
      {
        "id": "cmh...",
        "type": "RECEIPT",
        "amount": "1500.00",
        "description": "Customer Payment - Invoice #INV-001",
        "status": "DRAFT"
      }
    ]
  }
}
```

### **🎯 SRD Compliance:**

✅ **Batch Mode Entry** - Multiple transactions in one session  
✅ **CSV Import** - Import CSV with multiple transactions  
✅ **Unposted Batch** - All transactions start as DRAFT  
✅ **Batch Review** - Preview batch before posting  
✅ **Batch Posting** - Post entire batch to GL at once  
✅ **Firebase Storage** - Files uploaded to Firebase  
✅ **Double-Entry** - Automatic journal entry creation  
✅ **Validation** - Transaction validation before batch creation  

### **🔍 Behind the Scenes:**

1. **File Upload** → Firebase Storage
2. **CSV Parsing** → Extract transaction data
3. **Validation** → Check bank, customer, vendor, GL accounts
4. **Batch Creation** → Create unposted batch
5. **Transaction Creation** → Create individual cashbook entries (DRAFT)
6. **Batch Posting** → Create journal entries for all transactions
7. **Status Update** → Mark batch and transactions as POSTED

### **🚨 Error Handling:**

#### **CSV Import Errors:**
```json
{
  "success": false,
  "message": "Failed to import CSV",
  "error": "Row 2: Bank account not found",
  "data": {
    "batchId": null,
    "totalTransactions": 10,
    "validTransactions": 8,
    "invalidTransactions": 2,
    "errors": [
      "Row 2: Bank account not found",
      "Row 5: Customer not found"
    ]
  }
}
```

#### **Batch Update Errors:**
```json
{
  "success": false,
  "message": "Failed to update batch",
  "error": "Cannot update a posted batch"
}
```

#### **Permission Errors:**
```json
{
  "success": false,
  "message": "Failed to update batch",
  "error": "You do not have permission to update this batch"
}
```

#### **Delete Posted Batch Error:**
```json
{
  "success": false,
  "message": "Failed to delete batch",
  "error": "Cannot delete a posted batch"
}
```

### **📝 Notes:**

- All transactions start as **DRAFT** status
- Batch posting creates **journal entries** for double-entry accounting
- **Firebase** handles file storage
- **Validation** ensures data integrity
- **SRD-compliant** batch processing workflow
- **Error handling** for all operations with detailed error messages
- **Permission checks** prevent unauthorized access
- **Status validation** prevents invalid operations on posted batches
