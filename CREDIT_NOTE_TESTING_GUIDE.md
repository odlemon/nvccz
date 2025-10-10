# 📄 **CREDIT NOTE SYSTEM - TESTING GUIDE**

## 📋 **OVERVIEW**

This guide will help you test the complete Credit Note System implementation. The system includes:
- **Credit Note Creation and Management**
- **Credit Note Application to Invoices**
- **Automatic Journal Entry Creation**
- **Credit Note Status Tracking**
- **Customer Credit Note Management**

## 🚀 **SETUP REQUIREMENTS**

### **1. Database Migration**
```bash
# Run the migration to create credit note tables
npx prisma migrate dev --name credit-note-system
```

### **2. Create Required Chart of Accounts**
Before testing, ensure you have these accounts in your Chart of Accounts:
- **Accounts Receivable Account** (e.g., "1010 - Accounts Receivable")
- **Sales Account** (e.g., "4000 - Sales Revenue")

## 🧪 **TESTING SCENARIOS**

### **TEST 1: Create Credit Notes**

#### **1.1 Create Basic Credit Note**
```bash
POST /api/accounting/credit-notes
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "customerId": "YOUR_CUSTOMER_ID",
  "amount": 100.00,
  "vatAmount": 15.00,
  "totalAmount": 115.00,
  "currencyId": "YOUR_CURRENCY_ID",
  "reason": "Product defect - customer returned item"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Credit note created successfully",
  "data": {
    "id": "credit_note_id",
    "customerId": "customer_id",
    "amount": "100.00",
    "vatAmount": "15.00",
    "totalAmount": "115.00",
    "creditNoteNumber": "CN-2024-0001",
    "reason": "Product defect - customer returned item",
    "status": "DRAFT",
    "appliedAmount": "0.00",
    "remainingAmount": "115.00",
    "customer": {
      "id": "customer_id",
      "name": "Customer Name",
      "email": "customer@example.com"
    },
    "currency": {
      "id": "currency_id",
      "code": "USD",
      "symbol": "$"
    }
  }
}
```

#### **1.2 Create Credit Note Linked to Invoice**
```bash
POST /api/accounting/credit-notes
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "customerId": "YOUR_CUSTOMER_ID",
  "invoiceId": "YOUR_INVOICE_ID",
  "amount": 200.00,
  "vatAmount": 30.00,
  "totalAmount": 230.00,
  "currencyId": "YOUR_CURRENCY_ID",
  "reason": "Invoice overcharge - correcting billing error"
}
```

### **TEST 2: Credit Note Management**

#### **2.1 Get All Credit Notes**
```bash
GET /api/accounting/credit-notes?page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **2.2 Get Single Credit Note**
```bash
GET /api/accounting/credit-notes/CREDIT_NOTE_ID
Authorization: Bearer YOUR_TOKEN
```

#### **2.3 Update Credit Note (Draft Only)**
```bash
PUT /api/accounting/credit-notes/CREDIT_NOTE_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "amount": 120.00,
  "vatAmount": 18.00,
  "totalAmount": 138.00,
  "reason": "Updated reason for credit note"
}
```

#### **2.4 Send Credit Note**
```bash
POST /api/accounting/credit-notes/CREDIT_NOTE_ID/send
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Credit note sent successfully",
  "data": {
    "id": "credit_note_id",
    "status": "SENT",
    "creditNoteNumber": "CN-2024-0001"
  }
}
```

### **TEST 3: Apply Credit Note to Invoice**

#### **3.1 Apply Full Credit Note**
```bash
POST /api/accounting/credit-notes/CREDIT_NOTE_ID/apply
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "invoiceId": "YOUR_INVOICE_ID",
  "amount": 115.00
}
```

**Expected Results:**
1. **Credit Note Status Updated**: `status = "APPLIED"`
2. **Applied Amount Updated**: `appliedAmount = 115.00`
3. **Remaining Amount Updated**: `remainingAmount = 0.00`
4. **Journal Entry Created**:
   - Dr Accounts Receivable: 115.00
   - Cr Accounts Receivable: 115.00 (net effect is zero)

#### **3.2 Apply Partial Credit Note**
```bash
POST /api/accounting/credit-notes/CREDIT_NOTE_ID/apply
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "invoiceId": "YOUR_INVOICE_ID",
  "amount": 50.00
}
```

**Expected Results:**
1. **Credit Note Status Updated**: `status = "PARTIALLY_APPLIED"`
2. **Applied Amount Updated**: `appliedAmount = 50.00`
3. **Remaining Amount Updated**: `remainingAmount = 65.00`

### **TEST 4: Customer Credit Notes**

#### **4.1 Get Customer Credit Notes**
```bash
GET /api/accounting/credit-notes/customer/CUSTOMER_ID?page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **4.2 Get Credit Notes by Status**
```bash
GET /api/accounting/credit-notes?status=DRAFT&page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **4.3 Get Credit Notes by Customer**
```bash
GET /api/accounting/credit-notes?customerId=CUSTOMER_ID&page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

### **TEST 5: Credit Note Dashboard**

#### **5.1 Get Credit Note Dashboard**
```bash
GET /api/accounting/credit-notes/dashboard/credit-note-dashboard
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "totalCreditNotes": 5,
    "draftCreditNotes": 2,
    "sentCreditNotes": 2,
    "appliedCreditNotes": 1,
    "totalAmount": 575.00,
    "appliedAmount": 115.00,
    "remainingAmount": 460.00,
    "recentCreditNotes": [
      {
        "id": "credit_note_id",
        "creditNoteNumber": "CN-2024-0001",
        "totalAmount": "115.00",
        "status": "SENT",
        "customer": {
          "name": "Customer Name",
          "email": "customer@example.com"
        },
        "currency": {
          "code": "USD",
          "symbol": "$"
        }
      }
    ]
  }
}
```

### **TEST 6: Credit Note Operations**

#### **6.1 Delete Credit Note (Draft Only)**
```bash
DELETE /api/accounting/credit-notes/CREDIT_NOTE_ID
Authorization: Bearer YOUR_TOKEN
```

**Expected Results:**
1. **Credit Note Soft Deleted**: `isActive = false`
2. **Only Draft Credit Notes** can be deleted

#### **6.2 Test Cannot Delete Sent Credit Note**
```bash
DELETE /api/accounting/credit-notes/SENT_CREDIT_NOTE_ID
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "error": "Failed to delete credit note",
  "details": "Only draft credit notes can be deleted"
}
```

## 🔍 **VALIDATION CHECKS**

### **1. Database Validation**
After each test, verify in your database:

```sql
-- Check credit notes
SELECT * FROM credit_notes;

-- Check journal entries for credit notes
SELECT je.*, jel.* 
FROM journal_entries je
JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
WHERE je.description LIKE '%Credit note%';
```

### **2. Journal Entry Validation**
Verify that journal entries are created correctly:

#### **Credit Note Creation:**
- **Debit**: Sales Account (115.00)
- **Credit**: Accounts Receivable (115.00)

#### **Credit Note Application:**
- **Debit**: Accounts Receivable (115.00)
- **Credit**: Accounts Receivable (115.00)
- **Net Effect**: Zero (reduces receivable balance)

### **3. Credit Note Number Validation**
- Credit notes should have unique sequential numbers
- Format: `CN-YYYY-NNNN` (e.g., CN-2024-0001)
- Numbers should increment automatically

### **4. Status Flow Validation**
- **DRAFT** → **SENT** → **APPLIED** (or **PARTIALLY_APPLIED**)
- Cannot apply draft credit notes
- Cannot delete sent/applied credit notes

## 🚨 **ERROR SCENARIOS TO TEST**

### **1. Missing Required Fields**
```bash
POST /api/accounting/credit-notes
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "customerId": "customer_id"
  // Missing required fields
}
```

### **2. Invalid Customer ID**
```bash
POST /api/accounting/credit-notes
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "customerId": "NON_EXISTENT_ID",
  "amount": 100.00,
  "totalAmount": 100.00,
  "currencyId": "currency_id"
}
```

### **3. Apply Credit Note to Wrong Customer**
```bash
POST /api/accounting/credit-notes/CREDIT_NOTE_ID/apply
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "invoiceId": "INVOICE_FROM_DIFFERENT_CUSTOMER",
  "amount": 100.00
}
```

### **4. Apply More Than Remaining Amount**
```bash
POST /api/accounting/credit-notes/CREDIT_NOTE_ID/apply
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "invoiceId": "INVOICE_ID",
  "amount": 1000.00  // More than credit note amount
}
```

### **5. Update Sent Credit Note**
```bash
PUT /api/accounting/credit-notes/SENT_CREDIT_NOTE_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "amount": 200.00
}
```

## 📊 **SUCCESS CRITERIA**

### **✅ All Tests Should Pass If:**
1. **Credit notes can be created** with proper validation
2. **Credit note numbers** are generated sequentially
3. **Status transitions** work correctly (DRAFT → SENT → APPLIED)
4. **Journal entries are created** automatically for all operations
5. **Credit note application** reduces customer balances correctly
6. **Partial applications** work correctly
7. **Customer credit note queries** return accurate data
8. **Dashboard data** is accurate and up-to-date
9. **Error handling** works for invalid inputs
10. **Database integrity** is maintained throughout

### **🎯 Key Features Verified:**
- ✅ **Credit Note Lifecycle Management**
- ✅ **Automatic Journal Entry Creation**
- ✅ **Credit Note Application System**
- ✅ **Status Tracking and Validation**
- ✅ **Customer Credit Note Management**
- ✅ **Dashboard Analytics**

## 🚀 **NEXT STEPS**

After successful testing:
1. **Document any issues** found during testing
2. **Verify journal entries** are created correctly
3. **Test with real data** scenarios
4. **Performance test** with large datasets
5. **Integration testing** with invoice system

---

**🎉 Congratulations!** You've successfully tested the Credit Note System. This system now provides:
- Complete credit note lifecycle management
- Automatic journal entry creation
- Credit note application to invoices
- Comprehensive customer credit management
- Full integration with the accounting system

The system is ready for production use! 🚀

