# 🔍 **CASHBOOK MODELS VERIFICATION**

## ✅ **EXISTING MODELS IN SCHEMA.PRISMA**

### **Core Models (All Present):**
- ✅ **User** (line 11) - For authentication and audit
- ✅ **ChartOfAccounts** (line 558) - For GL accounts
- ✅ **Customer** (line 700) - For customer transactions
- ✅ **Vendor** (line 584) - For supplier transactions
- ✅ **Bank** (line 3583) - For bank accounts
- ✅ **Invoice** (line 849) - For Open Item matching
- ✅ **CashbookEntry** (line 3606) - Main cashbook transactions

### **Supporting Models (All Present):**
- ✅ **JournalEntry** - For GL posting
- ✅ **Currency** - For multi-currency support
- ✅ **Expense** - For expense management
- ✅ **BankReconciliation** - For reconciliation

---

## ❌ **MISSING MODELS FOR COMPLETE CASHBOOK**

### **1. PaymentAllocation Model (MISSING)**
```prisma
model PaymentAllocation {
  id              String   @id @default(cuid())
  cashbookEntryId String
  invoiceId       String
  allocatedAmount Decimal  @db.Decimal(18, 2)
  discountAmount  Decimal  @db.Decimal(18, 2) @default(0)
  notes           String?
  createdById     String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  cashbookEntry   CashbookEntry @relation(fields: [cashbookEntryId], references: [id], onDelete: Cascade)
  invoice         Invoice       @relation(fields: [invoiceId], references: [id])
  createdBy       User          @relation(fields: [createdById], references: [id])
  
  @@map("payment_allocations")
}
```

### **2. Reference Number Management (MISSING)**
```prisma
model ReferenceNumberConfig {
  id              String   @id @default(cuid())
  type            String   // RECEIPT, PAYMENT, BATCH
  prefix          String
  currentNumber   Int      @default(0)
  incrementBy     Int      @default(1)
  resetPeriod     String   // DAILY, MONTHLY, YEARLY, NEVER
  lastResetDate   DateTime @default(now())
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@map("reference_number_configs")
}
```

### **3. Template Management (MISSING)**
```prisma
model CashbookTemplate {
  id              String   @id @default(cuid())
  name            String
  description     String
  projectCode     String?
  glAccountId     String?
  vatCode         String?
  isActive        Boolean  @default(true)
  createdById     String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  createdBy       User             @relation(fields: [createdById], references: [id])
  glAccount       ChartOfAccounts? @relation("TemplateGLAccount", fields: [glAccountId], references: [id])
  
  @@map("cashbook_templates")
}
```

### **4. Discount Management (MISSING)**
```prisma
model DiscountConfig {
  id              String   @id @default(cuid())
  entityType      String   // CUSTOMER, SUPPLIER
  entityId         String
  discountType    String   // PERCENTAGE, FIXED
  discountValue   Decimal  @db.Decimal(10, 4)
  minAmount       Decimal? @db.Decimal(18, 2)
  maxAmount       Decimal? @db.Decimal(18, 2)
  validFrom       DateTime
  validTo         DateTime?
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  customer        Customer? @relation(fields: [entityId], references: [id])
  vendor          Vendor?   @relation(fields: [entityId], references: [id])
  
  @@map("discount_configs")
}
```

### **5. Bank Statement Management (MISSING)**
```prisma
model BankStatement {
  id              String   @id @default(cuid())
  bankId          String
  statementDate   DateTime
  openingBalance  Decimal  @db.Decimal(18, 2)
  closingBalance  Decimal  @db.Decimal(18, 2)
  totalDebits     Decimal  @db.Decimal(18, 2)
  totalCredits    Decimal  @db.Decimal(18, 2)
  isReconciled    Boolean  @default(false)
  reconciledAt    DateTime?
  reconciledById  String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  bank            Bank                    @relation(fields: [bankId], references: [id])
  reconciledBy    User?                   @relation("BankStatementReconciledBy", fields: [reconciledById], references: [id])
  items           BankStatementItem[]
  mismatches      ReconciliationMismatch[]
  
  @@map("bank_statements")
}

model BankStatementItem {
  id                    String   @id @default(cuid())
  statementId           String
  transactionDate       DateTime
  description           String
  reference             String?
  debitAmount           Decimal  @db.Decimal(18, 2)
  creditAmount          Decimal  @db.Decimal(18, 2)
  balance               Decimal  @db.Decimal(18, 2)
  isMatched             Boolean  @default(false)
  matchedTransactionId  String?
  createdAt             DateTime @default(now())
  
  // Relations
  statement             BankStatement        @relation(fields: [statementId], references: [id])
  matchedTransaction    CashbookEntry?      @relation(fields: [matchedTransactionId], references: [id])
  
  @@map("bank_statement_items")
}

model ReconciliationMismatch {
  id              String   @id @default(cuid())
  statementId     String
  transactionId   String?
  type            String   // MISSING_IN_STATEMENT, MISSING_IN_SYSTEM, AMOUNT_MISMATCH, DATE_MISMATCH
  description     String
  systemAmount    Decimal? @db.Decimal(18, 2)
  statementAmount Decimal? @db.Decimal(18, 2)
  systemDate      DateTime?
  statementDate   DateTime?
  severity        String   // LOW, MEDIUM, HIGH
  isResolved      Boolean  @default(false)
  resolvedAt      DateTime?
  resolvedById    String?
  createdAt       DateTime @default(now())
  
  // Relations
  statement       BankStatement @relation(fields: [statementId], references: [id])
  transaction     CashbookEntry? @relation(fields: [transactionId], references: [id])
  resolvedBy      User?         @relation("MismatchResolvedBy", fields: [resolvedById], references: [id])
  
  @@map("reconciliation_mismatches")
}
```

---

## 🔧 **REQUIRED SCHEMA ADDITIONS**

### **Add to existing Invoice model:**
```prisma
// Add these fields to Invoice model (around line 849):
dueDate           DateTime?
paidAmount        Decimal  @db.Decimal(15, 2) @default(0)
outstandingAmount Decimal  @db.Decimal(15, 2)
vendorId          String?  // For supplier invoices
vendor            Vendor?  @relation(fields: [vendorId], references: [id])
allocations       PaymentAllocation[]
```

### **Add to existing CashbookEntry model:**
```prisma
// Add this relation to CashbookEntry model (around line 3606):
allocations       PaymentAllocation[]
```

### **Add to existing User model:**
```prisma
// Add these relations to User model (around line 11):
allocations       PaymentAllocation[]
templates         CashbookTemplate[]
bankStatementsReconciled BankStatement[] @relation("BankStatementReconciledBy")
mismatchesResolved ReconciliationMismatch[] @relation("MismatchResolvedBy")
```

### **Add to existing Vendor model:**
```prisma
// Add these relations to Vendor model (around line 584):
invoices          Invoice[]
discountConfigs   DiscountConfig[]
```

### **Add to existing Customer model:**
```prisma
// Add this relation to Customer model (around line 700):
discountConfigs   DiscountConfig[]
```

### **Add to existing ChartOfAccounts model:**
```prisma
// Add this relation to ChartOfAccounts model (around line 558):
templates         CashbookTemplate[] @relation("TemplateGLAccount")
```

### **Add to existing Bank model:**
```prisma
// Add this relation to Bank model (around line 3583):
statements        BankStatement[]
```

---

## 🎯 **FINAL RESULT**

Once all these models and relations are added to `schema.prisma`, we'll have:

✅ **Complete Cashbook Module** - All requirements met
✅ **Open Item Matching** - Customer and supplier invoice allocation
✅ **Reference Number Management** - Auto-increment references
✅ **Template Management** - Repeated descriptions/projects
✅ **Discount Management** - Settlement discounts
✅ **Bank Reconciliation** - Full reconciliation workflow
✅ **Audit Trail** - Complete transaction history

**Total Models Needed: 12 new models + 6 existing model enhancements**


