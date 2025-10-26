# CASHBOOK ADVANCED FEATURES TESTING GUIDE

## **📋 OVERVIEW**

This guide covers testing for the newly implemented advanced cashbook features that are required by the SRD:

- **Open Item Matching** - Customer/supplier invoice allocation
- **Transaction Reversal** - Error correction functionality  
- **Cashbook Transfers** - Inter-bank transfers
- **Entry Types Management** - D/C designation and account access control
- **Period Lockout** - Data integrity protection
- **Audit Trail** - Complete transaction history

---

## **🔧 PREREQUISITES**

### **Server Setup**
```bash
# Ensure server is running
npm run dev

# Server should be accessible at:
# http://localhost:3000
# API Documentation: http://localhost:3000/api-docs
```

### **Authentication**
All endpoints require authentication. Use the admin credentials:
- **Email**: `admin@nvccz.co.zw`
- **Password**: `admin123`

### **Required Data**
Before testing, ensure you have:
- Bank accounts created
- Customers and suppliers
- Chart of accounts
- Some posted transactions for reversal testing

---

## **🏦 1. OPEN ITEM MATCHING**

### **1.1 Get Customer Open Items**
**Endpoint**: `GET /api/cashbook/open-items/customers/{customerId}`

**Test Steps**:
1. Get a customer ID from existing customers
2. Call the endpoint to retrieve open invoices

**Example Request**:
```bash
curl -X GET "http://localhost:3000/api/cashbook/open-items/customers/cmh3c8jk60000un0ke5broxit" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Found 3 open invoices for customer",
  "data": [
    {
      "id": "invoice_id",
      "customerId": "cmh3c8jk60000un0ke5broxit",
      "invoiceNumber": "INV-001",
      "invoiceDate": "2025-10-01T00:00:00.000Z",
      "dueDate": "2025-10-31T00:00:00.000Z",
      "originalAmount": 1000.00,
      "outstandingAmount": 1000.00,
      "currency": "USD",
      "description": "Invoice INV-001",
      "status": "OPEN"
    }
  ]
}
```

### **1.2 Get Supplier Open Items**
**Endpoint**: `GET /api/cashbook/open-items/suppliers/{supplierId}`

**Test Steps**:
1. Get a supplier ID from existing suppliers
2. Call the endpoint to retrieve open invoices

**Example Request**:
```bash
curl -X GET "http://localhost:3000/api/cashbook/open-items/suppliers/cmh3c7tcr0000uni4ho18pluc" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### **1.3 Match Payment to Invoices**
**Endpoint**: `POST /api/cashbook/open-items/match/:paymentId`

**Test Steps**:
1. Create a payment transaction first
2. Get the payment ID
3. Match it to specific invoices

**Example Request**:
```json
{
  "allocations": [
    {
      "openItemId": "invoice_id_1",
      "allocatedAmount": 500.00,
      "discountAmount": 0.00,
      "description": "Partial payment for INV-001"
    },
    {
      "openItemId": "invoice_id_2", 
      "allocatedAmount": 300.00,
      "discountAmount": 0.00,
      "description": "Partial payment for INV-002"
    }
  ]
}
```

### **1.4 Get Payment Allocations**
**Endpoint**: `GET /api/cashbook/open-items/allocations/{paymentId}`

**Test Steps**:
1. Use a payment ID that has been matched
2. Retrieve all allocations for that payment

### **1.5 Get Matching Summary**
**Endpoint**: `GET /api/cashbook/open-items/summary`

**Query Parameters**:
- `customerId` (optional): Filter by customer
- `supplierId` (optional): Filter by supplier

---

## **🔄 2. TRANSACTION REVERSAL**

### **2.1 Check if Transaction Can Be Reversed**
**Endpoint**: `GET /api/cashbook/transactions/{transactionId}/can-reverse`

**Test Steps**:
1. Get a posted transaction ID
2. Check if it can be reversed

**Example Request**:
```bash
curl -X GET "http://localhost:3000/api/cashbook/transactions/transaction_id_here/can-reverse" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Transaction can be reversed",
  "data": {
    "canReverse": true,
    "reason": "OK"
  }
}
```

### **2.2 Reverse a Transaction**
**Endpoint**: `POST /api/cashbook/transactions/{transactionId}/reverse`

**Test Steps**:
1. Use a posted transaction ID
2. Provide reversal reason and description

**Example Request**:
```json
{
  "reason": "Data entry error",
  "description": "Incorrect amount entered",
  "reverseDate": "2025-10-26T00:00:00.000Z"
}
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Transaction successfully reversed",
  "data": {
    "originalTransactionId": "original_id",
    "reversalTransactionId": "reversal_id",
    "reversalAmount": 1000.00,
    "reversalDate": "2025-10-26T00:00:00.000Z",
    "reason": "Data entry error"
  }
}
```

### **2.3 Get Reversal History**
**Endpoint**: `GET /api/cashbook/transactions/{transactionId}/reversal-history`

**Test Steps**:
1. Use a transaction ID that has been reversed
2. Get all reversal transactions

### **2.4 Get All Reversals**
**Endpoint**: `GET /api/cashbook/reversals`

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)

---

## **💸 3. CASHBOOK TRANSFERS**

### **3.1 Create Transfer**
**Endpoint**: `POST /api/cashbook/transfers`

**Test Steps**:
1. Get two different bank account IDs
2. Create a transfer between them

**Example Request**:
```json
{
  "fromBankId": "bank_id_1",
  "toBankId": "bank_id_2", 
  "amount": 5000.00,
  "transferDate": "2025-10-26T00:00:00.000Z",
  "description": "Transfer from Main Account to Petty Cash",
  "reference": "TR-001",
  "projectCode": "PROJ-001"
}
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Transfer created successfully",
  "data": {
    "transferId": "transfer_id",
    "fromTransactionId": "from_transaction_id",
    "toTransactionId": "to_transaction_id",
    "amount": 5000.00,
    "transferDate": "2025-10-26T00:00:00.000Z"
  }
}
```

### **3.2 Get Transfer Details**
**Endpoint**: `GET /api/cashbook/transfers/{transferId}`

**Test Steps**:
1. Use a transfer ID from previous step
2. Get detailed transfer information

### **3.3 List Transfers**
**Endpoint**: `GET /api/cashbook/transfers`

**Query Parameters**:
- `page` (optional): Page number
- `limit` (optional): Items per page
- `fromBankId` (optional): Filter by source bank
- `toBankId` (optional): Filter by destination bank
- `dateFrom` (optional): Filter from date
- `dateTo` (optional): Filter to date

### **3.4 Get Transfer Summary**
**Endpoint**: `GET /api/cashbook/transfers/summary`

**Query Parameters**:
- `dateFrom` (optional): Filter from date
- `dateTo` (optional): Filter to date

---

## **⚙️ 4. ENTRY TYPES MANAGEMENT**

### **4.1 Create Entry Type**
**Endpoint**: `POST /api/cashbook/entry-types`

**Test Steps**:
1. Create different entry types for receipts and payments
2. Test various counterparty types

**Example Request - Customer Receipt**:
```json
{
  "name": "Customer Receipt",
  "description": "Receipt from customer payment",
  "transactionType": "RECEIPT",
  "counterpartyType": "CUSTOMER",
  "defaultGlAccountId": "gl_account_id",
  "isActive": true,
  "requiresProjectCode": false,
  "requiresReference": true,
  "autoGenerateReference": true,
  "referencePrefix": "CR",
  "debitCreditLogic": "AUTO",
  "defaultDebitCredit": "CREDIT"
}
```

**Example Request - Supplier Payment**:
```json
{
  "name": "Supplier Payment",
  "description": "Payment to supplier",
  "transactionType": "PAYMENT",
  "counterpartyType": "SUPPLIER",
  "defaultGlAccountId": "gl_account_id",
  "isActive": true,
  "requiresProjectCode": true,
  "requiresReference": true,
  "autoGenerateReference": true,
  "referencePrefix": "SP",
  "debitCreditLogic": "AUTO",
  "defaultDebitCredit": "DEBIT"
}
```

### **4.2 Get All Entry Types**
**Endpoint**: `GET /api/cashbook/entry-types`

**Query Parameters**:
- `transactionType` (optional): Filter by RECEIPT or PAYMENT
- `isActive` (optional): Filter by active status

### **4.3 Get Entry Type by ID**
**Endpoint**: `GET /api/cashbook/entry-types/{entryTypeId}`

### **4.4 Update Entry Type**
**Endpoint**: `PUT /api/cashbook/entry-types/{entryTypeId}`

**Test Steps**:
1. Update an existing entry type
2. Test validation rules

### **4.5 Delete Entry Type**
**Endpoint**: `DELETE /api/cashbook/entry-types/{entryTypeId}`

**Test Steps**:
1. Try to delete an entry type not used in transactions
2. Try to delete one that is in use (should fail)

### **4.6 Get Entry Types for Transaction**
**Endpoint**: `GET /api/cashbook/entry-types/transaction/{transactionType}`

**Test Steps**:
1. Get entry types for RECEIPT transactions
2. Get entry types for PAYMENT transactions
3. Test with counterparty type filters

### **4.7 Get Entry Type Statistics**
**Endpoint**: `GET /api/cashbook/entry-types/statistics`

### **4.8 Validate Entry Type Configuration**
**Endpoint**: `GET /api/cashbook/entry-types/{entryTypeId}/validate`

---

## **🔒 5. PERIOD LOCKOUT**

### **5.1 Lock Accounting Period**
**Endpoint**: `POST /api/cashbook/periods/lock`

**Test Steps**:
1. Lock a specific month/year
2. Try to create transactions in locked period (should fail)

**Example Request**:
```json
{
  "year": 2025,
  "month": 10,
  "reason": "Month-end closing"
}
```

### **5.2 Unlock Accounting Period**
**Endpoint**: `POST /api/cashbook/periods/unlock`

**Test Steps**:
1. Unlock a previously locked period
2. Verify transactions can be created again

### **5.3 Get Period Lockout Status**
**Endpoint**: `GET /api/cashbook/periods/status`

**Query Parameters**:
- `year` (optional): Specific year
- `month` (optional): Specific month

---

## **📊 6. AUDIT TRAIL**

### **6.1 Get Audit Trail**
**Endpoint**: `GET /api/cashbook/audit-trail`

**Query Parameters**:
- `entityType` (optional): Filter by entity type
- `entityId` (optional): Filter by entity ID
- `action` (optional): Filter by action
- `userId` (optional): Filter by user
- `dateFrom` (optional): Filter from date
- `dateTo` (optional): Filter to date
- `page` (optional): Page number
- `limit` (optional): Items per page

### **6.2 Get Transaction Audit Trail**
**Endpoint**: `GET /api/cashbook/audit-trail/transactions/{transactionId}`

**Test Steps**:
1. Use a transaction ID
2. Get all audit entries for that transaction

### **6.3 Get Batch Audit Trail**
**Endpoint**: `GET /api/cashbook/audit-trail/batches/{batchId}`

**Test Steps**:
1. Use a batch ID
2. Get all audit entries for that batch

---

## **🧪 COMPREHENSIVE TEST SCENARIOS**

### **Scenario 1: Complete Customer Payment Workflow**
1. **Create Customer Receipt Entry Type**
2. **Create a receipt transaction** using the entry type
3. **Post the transaction** to GL
4. **Get customer open items** to see available invoices
5. **Match payment to invoices** with allocations
6. **Verify payment allocations** were created
7. **Check audit trail** for all actions

### **Scenario 2: Error Correction Workflow**
1. **Create a payment transaction** and post it
2. **Check if transaction can be reversed**
3. **Reverse the transaction** with reason
4. **Verify reversal transaction** was created
5. **Check reversal history** for original transaction
6. **Verify journal entries** were properly reversed

### **Scenario 3: Inter-Bank Transfer Workflow**
1. **Create two bank accounts** if not exists
2. **Create a transfer** between the accounts
3. **Verify both transactions** were created (outgoing and incoming)
4. **Check journal entries** for proper double-entry
5. **Get transfer details** and verify all data
6. **List transfers** with various filters

### **Scenario 4: Entry Type Management Workflow**
1. **Create various entry types** for different scenarios
2. **Validate entry type configurations**
3. **Get entry types for transaction creation**
4. **Update entry types** and test validation
5. **Get entry type statistics**
6. **Try to delete unused entry types**

### **Scenario 5: Period Lockout Workflow**
1. **Create transactions** in current period
2. **Lock the current period**
3. **Try to create new transactions** (should fail)
4. **Try to reverse transactions** (should fail)
5. **Unlock the period**
6. **Verify transactions can be created again**

---

## **📋 POSTMAN COLLECTION**

### **Environment Variables**
```json
{
  "baseUrl": "http://localhost:3000",
  "token": "YOUR_AUTH_TOKEN_HERE",
  "customerId": "cmh3c8jk60000un0ke5broxit",
  "supplierId": "cmh3c7tcr0000uni4ho18pluc",
  "bankId1": "bank_account_id_1",
  "bankId2": "bank_account_id_2",
  "glAccountId": "gl_account_id"
}
```

### **Collection Structure**
```
Cashbook Advanced Features
├── Authentication
│   └── Login
├── Open Item Matching
│   ├── Get Customer Open Items
│   ├── Get Supplier Open Items
│   ├── Match Payment to Invoices
│   ├── Get Payment Allocations
│   └── Get Matching Summary
├── Transaction Reversal
│   ├── Check Can Reverse
│   ├── Reverse Transaction
│   ├── Get Reversal History
│   └── Get All Reversals
├── Cashbook Transfers
│   ├── Create Transfer
│   ├── Get Transfer Details
│   ├── List Transfers
│   └── Get Transfer Summary
├── Entry Types Management
│   ├── Create Entry Type
│   ├── Get All Entry Types
│   ├── Get Entry Type by ID
│   ├── Update Entry Type
│   ├── Delete Entry Type
│   ├── Get Entry Types for Transaction
│   ├── Get Entry Type Statistics
│   └── Validate Entry Type Configuration
├── Period Lockout
│   ├── Lock Period
│   ├── Unlock Period
│   └── Get Period Status
└── Audit Trail
    ├── Get Audit Trail
    ├── Get Transaction Audit Trail
    └── Get Batch Audit Trail
```

---

## **🚨 ERROR TESTING**

### **Common Error Scenarios**
1. **Invalid IDs**: Use non-existent IDs for all endpoints
2. **Unauthorized Access**: Test without authentication token
3. **Invalid Data**: Send malformed JSON or missing required fields
4. **Business Logic Errors**: 
   - Try to reverse already reversed transactions
   - Try to match more than payment amount
   - Try to create transfers to same bank
   - Try to delete entry types in use

### **Expected Error Responses**
```json
{
  "success": false,
  "message": "Error description",
  "timestamp": "2025-10-26T06:00:00.000Z"
}
```

---

## **✅ SUCCESS CRITERIA**

### **Open Item Matching**
- ✅ Can retrieve open invoices for customers and suppliers
- ✅ Can match payments to specific invoices
- ✅ Can unmatch payments from invoices
- ✅ Proper validation of allocation amounts
- ✅ Invoice status updates correctly

### **Transaction Reversal**
- ✅ Can check if transaction can be reversed
- ✅ Can reverse posted transactions
- ✅ Creates proper reversal journal entries
- ✅ Prevents reversal of already reversed transactions
- ✅ Respects period lockout rules

### **Cashbook Transfers**
- ✅ Can create transfers between different banks
- ✅ Creates both outgoing and incoming transactions
- ✅ Proper double-entry journal entries
- ✅ Validates bank account existence and status
- ✅ Generates proper transfer references

### **Entry Types Management**
- ✅ Can create, read, update, delete entry types
- ✅ Proper validation of entry type configuration
- ✅ Prevents deletion of entry types in use
- ✅ Supports all counterparty types and transaction types
- ✅ Auto-generates references when configured

### **Period Lockout**
- ✅ Can lock and unlock accounting periods
- ✅ Prevents transactions in locked periods
- ✅ Prevents reversals in locked periods
- ✅ Provides period status information

### **Audit Trail**
- ✅ Records all cashbook actions
- ✅ Provides detailed audit information
- ✅ Supports filtering and pagination
- ✅ Tracks user actions and timestamps

---

## **📈 PERFORMANCE TESTING**

### **Load Testing Scenarios**
1. **Bulk Open Item Matching**: Match 100+ payments to invoices
2. **Mass Transaction Reversal**: Reverse 50+ transactions
3. **Multiple Transfers**: Create 20+ transfers simultaneously
4. **Entry Type Management**: Create 50+ entry types
5. **Audit Trail Queries**: Query large audit trail datasets

### **Performance Expectations**
- **Response Time**: < 2 seconds for most operations
- **Bulk Operations**: < 10 seconds for 100+ items
- **Concurrent Users**: Support 10+ simultaneous users
- **Database**: Efficient queries with proper indexing

---

## **🔍 DEBUGGING TIPS**

### **Common Issues**
1. **Authentication Errors**: Check token validity and format
2. **Database Errors**: Verify Prisma schema and connections
3. **Validation Errors**: Check required fields and data types
4. **Business Logic Errors**: Review SRD requirements and implementation

### **Logging**
- Check server logs for detailed error information
- Use console.log statements in services for debugging
- Monitor database queries for performance issues

### **Database Queries**
```sql
-- Check open items
SELECT * FROM Invoice WHERE status IN ('SENT', 'PARTIALLY_PAID');

-- Check payment allocations
SELECT * FROM PaymentAllocation;

-- Check audit trail
SELECT * FROM AuditTrail WHERE entityType = 'CASHBOOK_ENTRY';

-- Check period lockouts
SELECT * FROM PeriodLockout WHERE isLocked = true;
```

---

This comprehensive testing guide covers all the advanced cashbook features required by the SRD. Follow the test scenarios systematically to ensure all functionality works correctly and meets the business requirements.
