# 🏦 **CASHBOOK MODULE - COMPLETE IMPLEMENTATION PLAN**

## 📋 **UNDERSTANDING THE COMPLETE WORKFLOW**

Based on both the **User Story SRD** and **Core Technical Logic**, here's what we're building:

---

## 🎯 **CORE CONCEPT: SAGE PASTEL-STYLE CASHBOOK**

### **🏦 What is a Cashbook?**
- **Digital Bank Register**: The absolute source of truth for all cash movements
- **Two Sides**: Receipts (money in) and Payments (money out)
- **Double-Entry**: Every transaction affects two accounts
- **Batch Processing**: Multiple transactions before posting to GL

---

## 🔄 **COMPLETE USER WORKFLOW**

### **💰 RECEIPTS WORKFLOW (Money Coming In):**

#### **Step 1: Select Cashbook Account**
- User chooses which bank account to work with
- System shows current balance and available cashbooks

#### **Step 2: Set Period & Date**
- Select accounting period
- Enter transaction date (when money actually moved)

#### **Step 3: Choose Entry Type**
- **Customer Receipt**: Money from customer (allocates to invoices)
- **GL Receipt**: Direct income (sales, interest, capital, loans)
- **Supplier Receipt**: Refund from supplier

#### **Step 4: Enter Transaction Details**
- Reference number (auto-increments)
- Description ("Payment for INV1234")
- Amount (gross or excluding VAT)
- Discount (if applicable)
- Project code (if enabled)

#### **Step 5: Open Item Matching (Customer Only)**
- If customer has open invoices, show matching screen
- Allocate payment to specific invoices
- Handle partial payments and overpayments

#### **Step 6: Batch Entry**
- Repeat for multiple receipts
- System shows running total
- Preview before posting

#### **Step 7: Post to GL**
- Review batch
- Print/backup options
- Post to General Ledger
- Generate audit trail

**Accounting Treatment:**
```
Dr. Bank Account (Asset increases)
Cr. Customer/GL Account (Revenue/Asset/Liability)
```

### **💸 PAYMENTS WORKFLOW (Money Going Out):**

#### **Step 1: Select Cashbook Account**
- Choose bank account to pay from
- System shows available balance

#### **Step 2: Set Period & Date**
- Select accounting period
- Enter transaction date

#### **Step 3: Choose Entry Type**
- **Supplier Payment**: Pay supplier (allocates to bills)
- **GL Payment**: Direct expense (rent, utilities, fees)
- **Customer Payment**: Refund to customer

#### **Step 4: Enter Transaction Details**
- Reference number
- Description ("Rent payment for January")
- Amount
- Discount (if applicable)
- Project code

#### **Step 5: Open Item Matching (Supplier Only)**
- If supplier has open bills, show matching screen
- Allocate payment to specific bills
- Handle partial payments

#### **Step 6: Batch Entry**
- Multiple payment lines
- Running total display
- Preview before posting

#### **Step 7: Post to GL**
- Review batch
- Post to General Ledger
- Update supplier balances

**Accounting Treatment:**
```
Dr. Supplier/GL Account (Expense/Asset/Liability)
Cr. Bank Account (Asset decreases)
```

---

## 🏗️ **TECHNICAL ARCHITECTURE WE'RE BUILDING**

### **📊 Database Structure:**

#### **1. CashbookTransaction (Header)**
```typescript
model CashbookTransaction {
  id: string
  bankId: string                    // Which bank account
  transactionDate: DateTime         // When money moved
  transactionType: 'RECEIPT' | 'PAYMENT'
  totalAmount: Decimal              // Total gross amount
  reference: string                 // Cheque number, EFT ref
  description: string              // Bank statement description
  status: 'DRAFT' | 'POSTED' | 'VOIDED'
  journalEntryId: string?          // Link to GL posting
  isReconciled: boolean            // Bank reconciliation
  reconciledAt: DateTime?
  createdById: string
  createdAt: DateTime
  updatedAt: DateTime
}
```

#### **2. CashbookLineItem (Details)**
```typescript
model CashbookLineItem {
  id: string
  transactionId: string            // Link to header
  contraGlAccountId: string        // Where money goes/comes from
  amount: Decimal                  // Gross amount
  vatCodeId: string               // VAT code (15%, 0%, exempt)
  vatAmount: Decimal              // Calculated VAT
  netAmount: Decimal              // Amount excluding VAT
  debtorCreditorId?: string       // Customer/Supplier (if applicable)
  description: string             // Line description
  projectCode?: string           // Project allocation
  discount?: Decimal             // Settlement discount
}
```

#### **3. Bank Account (Cashbook)**
```typescript
model Bank {
  id: string
  name: string                    // "Main Bank Account - USD"
  accountNumber: string          // "USD-001-123456"
  currencyId: string             // USD, ZWL, etc.
  glAccountId: string            // Link to GL account (1010, 1020)
  isActive: boolean
  currentBalance: Decimal         // Real-time balance
}
```

### **🔄 Two-Stage Processing:**

#### **Stage 1: Entry & Batching (Unposted)**
- User enters transactions
- System validates but doesn't post to GL
- `journalEntryId = null`
- Status: `DRAFT`

#### **Stage 2: Batch Posting (Posted)**
- User reviews batch
- System creates journal entries
- Updates GL balances
- Status: `POSTED`

---

## 💰 **VAT INTEGRATION**

### **VAT Codes:**
- **15% Standard Rate**: Zimbabwe standard VAT
- **0% Zero Rate**: Exempt transactions
- **Exempt**: Non-taxable transactions

### **VAT Accounts:**
- **2100 - VAT Output**: VAT collected on sales
- **2110 - VAT Input**: VAT paid on purchases

### **VAT Calculation:**
```typescript
// For Receipts (Output VAT)
vatAmount = amount * 0.15
netAmount = amount - vatAmount

// For Payments (Input VAT)  
vatAmount = amount * 0.15
netAmount = amount - vatAmount
```

---

## 🔗 **GCS INTEGRATION LOGIC**

### **G (General Ledger):**
- Direct posting to GL accounts
- No customer/supplier involvement
- Examples: Rent, utilities, fees

### **C (Customer):**
- Integrates with Debtors module
- Allocates to specific invoices
- Updates customer balances
- Uses Debtors Control Account (1200)

### **S (Supplier):**
- Integrates with Creditors module  
- Allocates to specific bills
- Updates supplier balances
- Uses Creditors Control Account (2000)

---

## 🏦 **BANK RECONCILIATION WORKFLOW**

### **Reconciliation Process:**
1. **Select Bank Account**: Choose which bank to reconcile
2. **Set Period End Date**: Up to which date to reconcile
3. **View Unreconciled Items**: All posted but unreconciled transactions
4. **Match with Bank Statement**: Tick items that appear on statement
5. **Enter Statement Balance**: Final balance from bank
6. **Validate Match**: System balance = Statement balance
7. **Finalize**: Mark items as reconciled

### **Reconciliation Status:**
- **N (Not Reconciled)**: Posted but not matched to statement
- **R (Reconciled)**: Matched to bank statement
- **Final State**: Cannot be edited once reconciled

---

## 🎯 **WHAT WE NEED TO BUILD**

### **❌ Current Issues:**
1. **No Bank Accounts**: Missing bank setup
2. **No Line Items**: Missing CashbookLineItem structure
3. **No VAT Integration**: Missing VAT calculation
4. **No GCS Logic**: Missing General/Customer/Supplier integration
5. **No Two-Stage Processing**: Missing batch workflow
6. **No Reconciliation**: Missing bank reconciliation

### **✅ Implementation Plan:**

#### **Phase 1: Core Data Structure**
- [ ] Add CashbookLineItem model to schema
- [ ] Create bank account seeder
- [ ] Link banks to GL accounts
- [ ] Add VAT codes and accounts

#### **Phase 2: Two-Stage Processing**
- [ ] Implement batch entry (unposted)
- [ ] Implement batch posting (GL update)
- [ ] Add journal entry generation
- [ ] Add batch preview/edit

#### **Phase 3: VAT Integration**
- [ ] Add VAT calculation logic
- [ ] Implement VAT posting
- [ ] Test VAT scenarios

#### **Phase 4: GCS Integration**
- [ ] Implement General logic
- [ ] Integrate with Debtors module
- [ ] Integrate with Creditors module
- [ ] Add open item matching

#### **Phase 5: Bank Reconciliation**
- [ ] Add reconciliation status tracking
- [ ] Implement reconciliation workflow
- [ ] Add balance matching
- [ ] Test reconciliation scenarios

#### **Phase 6: User Interface**
- [ ] Create cashbook selection screen
- [ ] Build receipt/payment entry forms
- [ ] Add batch review screen
- [ ] Implement reconciliation wizard

---

## 🎉 **EXPECTED OUTCOME**

After implementation, we'll have:

### **✅ Complete Cashbook System:**
- **Multiple Bank Accounts**: Each with GL account links
- **Receipts & Payments**: Full transaction processing
- **VAT Integration**: Automatic VAT calculation and posting
- **GCS Integration**: General, Customer, Supplier logic
- **Bank Reconciliation**: Statement matching and validation
- **Audit Trail**: Complete transaction history
- **Sage Pastel Experience**: Intuitive, efficient data entry

### **✅ Key Features:**
- **Batch Processing**: Multiple transactions before posting
- **Open Item Matching**: Allocate payments to invoices/bills
- **Real-time Validation**: Balance checks and error prevention
- **Export/Import**: Batch transfer capabilities
- **Reporting**: Transaction history and reconciliation reports

---

## 🚀 **READY TO IMPLEMENT**

The cashbook module will be a **comprehensive financial management system** that:

1. **Replicates Sage Pastel functionality** with modern web interface
2. **Maintains double-entry integrity** with automatic posting
3. **Supports all transaction types** (receipts, payments, transfers)
4. **Integrates with all modules** (GL, Debtors, Creditors, VAT)
5. **Provides bank reconciliation** with statement matching
6. **Ensures complete audit trail** with two-stage processing

**This is a complete rebuild of the current cashbook implementation to match the specification.**


