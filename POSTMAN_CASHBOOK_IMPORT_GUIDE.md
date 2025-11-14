# 📮 Postman Guide: Cashbook CSV Import Testing

## 🔐 Step 1: Login to Get Authentication Token

### Endpoint
```
POST https://nvccz-pi.vercel.app/api/auth/login
```

### Headers
```
Content-Type: application/json
```

### Body (JSON)
```json
{
  "email": "admin@nvccz.co.zw",
  "password": "admin123"
}
```

### Response
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

**Copy the `token` value for use in subsequent requests.**

---

## 📥 Step 2: Download CSV Template (Optional)

### Endpoint
```
GET https://nvccz-pi.vercel.app/api/cashbook/batches/import/template
```

### Headers
```
Authorization: Bearer {YOUR_TOKEN_HERE}
```

### Response
- Downloads a CSV file with:
  - Current bank names
  - Sample customer names
  - Sample vendor names
  - Sample GL account numbers
  - Example transactions

**Use this template to create your import file.**

---

## 📤 Step 3: Import CSV File

### Endpoint
```
POST https://nvccz-pi.vercel.app/api/cashbook/batches/import
```

### Headers
```
Authorization: Bearer {YOUR_TOKEN_HERE}
Content-Type: multipart/form-data
```

### Body (form-data)
- **Key:** `file`
- **Type:** File
- **Value:** Select your CSV file (e.g., `sample-cashbook-transactions.csv`)

### CSV Format
```csv
bankName,transactionDate,description,amount,reference,counterpartyType,customerName,vendorName,glAccountNo,vatCode,projectCode,discount
Main Bank Account,2025-11-14,Customer Payment - Invoice #INV-001,1500.00,RCP-001,CUSTOMER,ABC Investment Fund,,,15%,PROJ-001,0
Main Bank Account,2025-11-14,GL Receipt - Share Capital,5000.00,RCP-002,GL,,,3000,15%,,0
Main Bank Account,2025-11-14,Supplier Payment - Office Supplies,250.00,PAY-001,SUPPLIER,,Office Supplies Ltd,,15%,PROJ-002,0
```

### Response
```json
{
  "success": true,
  "message": "CSV imported successfully",
  "data": {
    "batchId": "cmhy3mk8j0001untw3b85m4sx",
    "totalTransactions": 15,
    "validTransactions": 15,
    "invalidTransactions": 0,
    "errors": [],
    "fileUrl": "https://firebasestorage.googleapis.com/..."
  }
}
```

**Save the `batchId` for next steps.**

---

## 📋 Step 4: Get Batch Details

### Endpoint
```
GET https://nvccz-pi.vercel.app/api/cashbook/batches/{batchId}
```

### Headers
```
Authorization: Bearer {YOUR_TOKEN_HERE}
```

### Example
```
GET https://nvccz-pi.vercel.app/api/cashbook/batches/cmhy3mk8j0001untw3b85m4sx
```

### Response
- Returns batch with all transactions
- Shows cashbook entries created
- Shows validation status

---

## 📤 Step 5: Post Batch to GL (Create Journal Entries)

### Endpoint
```
POST https://nvccz-pi.vercel.app/api/cashbook/batches/{batchId}/post
```

### Headers
```
Authorization: Bearer {YOUR_TOKEN_HERE}
Content-Type: application/json
```

### Body (JSON)
```json
{}
```

### Example
```
POST https://nvccz-pi.vercel.app/api/cashbook/batches/cmhy3mk8j0001untw3b85m4sx/post
```

### Response
- Creates journal entries for all transactions
- Updates batch status to "POSTED"
- Returns journal entry IDs

---

## 📖 Step 6: Verify Journal Entries

### Endpoint
```
GET https://nvccz-pi.vercel.app/api/accounting/journal-entries/{journalEntryId}
```

### Headers
```
Authorization: Bearer {YOUR_TOKEN_HERE}
```

### Example
```
GET https://nvccz-pi.vercel.app/api/accounting/journal-entries/cmhy3abc123...
```

### Response
- Shows journal entry details
- Shows all journal entry lines (debits and credits)
- Verifies double-entry accounting

---

## 📊 Step 7: List All Batches (Optional)

### Endpoint
```
GET https://nvccz-pi.vercel.app/api/cashbook/batches?page=1&limit=10&status=PENDING
```

### Headers
```
Authorization: Bearer {YOUR_TOKEN_HERE}
```

### Query Parameters
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)
- `status`: Filter by status (PENDING, POSTED, etc.)

---

## 📝 CSV File Format Reference

### Required Columns
- `bankName` - Bank account name (e.g., "Main Bank Account")
- `transactionDate` - Date in YYYY-MM-DD format
- `description` - Transaction description
- `amount` - Transaction amount (positive number)
- `reference` - Reference number
- `counterpartyType` - Must be: CUSTOMER, SUPPLIER, or GL

### Optional Columns
- `customerName` - Required if counterpartyType is CUSTOMER
- `vendorName` - Required if counterpartyType is SUPPLIER
- `glAccountNo` - Required if counterpartyType is GL (e.g., "3000")
- `vatCode` - VAT code: 15%, 0%, or EXEMPT (default: 15%)
- `projectCode` - Project code (optional)
- `discount` - Discount amount (default: 0)

### Example CSV
```csv
bankName,transactionDate,description,amount,reference,counterpartyType,customerName,vendorName,glAccountNo,vatCode,projectCode,discount
Main Bank Account,2025-11-14,Customer Payment,1500.00,RCP-001,CUSTOMER,ABC Investment Fund,,,15%,PROJ-001,0
Main Bank Account,2025-11-14,Share Capital,5000.00,RCP-002,GL,,,3000,15%,,0
Main Bank Account,2025-11-14,Office Supplies,250.00,PAY-001,SUPPLIER,,Office Supplies Ltd,,15%,PROJ-002,0
```

---

## ✅ Validation Rules

1. **Bank Name**: Must match an active bank account name (case-insensitive)
2. **Date**: Must be valid date in YYYY-MM-DD format, cannot be in future
3. **Amount**: Must be positive number
4. **Customer Name**: Required for CUSTOMER transactions, must exist in database
5. **Vendor Name**: Required for SUPPLIER transactions, must exist in database
6. **GL Account No**: Required for GL transactions, must exist in database
7. **Counterparty Type**: Must be exactly: CUSTOMER, SUPPLIER, or GL

---

## 🚨 Common Errors

### Error: "Bank account not found"
- **Solution**: Use exact bank name from database
- **Check**: GET `/api/cashbook/banks` to see available banks

### Error: "Customer not found"
- **Solution**: Use exact customer name from database
- **Check**: GET `/api/accounting/customers` to see available customers

### Error: "Vendor not found"
- **Solution**: Use exact vendor name from database
- **Check**: GET `/api/accounting/vendors` to see available vendors

### Error: "GL account not found"
- **Solution**: Use exact account number (e.g., "3000", "2000")
- **Check**: GET `/api/accounting/chart-of-accounts` to see available accounts

---

## 📋 Quick Test Checklist

- [ ] Login successful, token obtained
- [ ] CSV template downloaded (optional)
- [ ] CSV file created with valid data
- [ ] Import request sent successfully
- [ ] All transactions validated (no errors)
- [ ] Batch details retrieved
- [ ] Batch posted to GL
- [ ] Journal entries created
- [ ] Journal entries balanced (debits = credits)
- [ ] All cashbook entries have journal entries

---

## 🔗 Production URLs

- **Base URL**: `https://nvccz-pi.vercel.app`
- **Login**: `POST /api/auth/login`
- **Template**: `GET /api/cashbook/batches/import/template`
- **Import**: `POST /api/cashbook/batches/import`
- **Batch Details**: `GET /api/cashbook/batches/{batchId}`
- **Post Batch**: `POST /api/cashbook/batches/{batchId}/post`
- **Journal Entry**: `GET /api/accounting/journal-entries/{journalEntryId}`

---

## 💡 Tips for Postman

1. **Save Token**: Create an environment variable `token` and use `{{token}}` in Authorization header
2. **File Upload**: In Postman, select "Body" → "form-data" → Change key type to "File"
3. **Collection**: Create a Postman collection with all these requests
4. **Tests**: Add tests to verify response structure and status codes

