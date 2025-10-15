# 📊 PROCUREMENT MODULE - LOGGING GUIDE

**Comprehensive Logging for Accounting Operations**  
**Date**: October 14, 2025

---

## 🎯 OVERVIEW

The procurement module now includes **comprehensive logging** for all accounting-related operations. This allows you to see exactly what's happening at each step of the invoice approval and payment process.

### **What's Logged:**
- ✅ Invoice approval (liability creation)
- ✅ Payment processing (liability clearance)  
- ✅ Journal entry creation (debit/credit details)
- ✅ Account validation
- ✅ Balance verification
- ✅ Error details

---

## 📋 LOG LOCATIONS

### **Where Logs Appear:**

1. **Server Console** - Primary location (stdout)
2. **PM2 Logs** - If using PM2: `pm2 logs`
3. **Container Logs** - If using Docker: `docker logs <container>`
4. **Log Files** - If configured in your logger

### **Log Levels:**

- ℹ️ **INFO**: Normal operations (console.log)
- ✅ **SUCCESS**: Successful operations (console.log)
- ⚠️ **WARNING**: Validation issues (console.warn)
- ❌ **ERROR**: Failures (console.error)

---

## 📝 EXAMPLE OUTPUT: INVOICE APPROVAL

When you approve an invoice, you'll see these logs:

```
════════════════════════════════════════════════════════════════
✅ PROCUREMENT INVOICE APPROVAL STARTED
════════════════════════════════════════════════════════════════
📋 Invoice ID: inv-11111
👤 Approved By: user-admin-123

🔍 Step 1: Retrieving invoice details...
✅ Invoice Found: VENDOR-INV-OCT-2025
   Vendor: Property Management Ltd
   Subtotal: $5000.00
   Tax (VAT): $725.00
   Total Amount: $5725.00
   Current Status: MATCHED

🔒 Step 2: Validating invoice status...
   ✅ Invoice is ready for approval

💰 Step 3: Creating journal entry (EXPENSE + LIABILITY)...
   This will:
   • DEBIT Expense Account: $5000.00
   • DEBIT VAT Input Account: $725.00
   • CREDIT Accounts Payable: $5725.00 (Creates liability)

   📝 Using CREDIT payment method (not BANK)
   ℹ️  This creates a liability without immediately reducing cash
   ℹ️  Cash will be reduced later when payment is processed

   ✅ Journal Entry Created: JE-2025-1234

📝 Step 4: Updating invoice status...
   New Status: APPROVED
   Payment Status: PENDING (awaiting payment)
   ✅ Invoice updated successfully

📊 Step 5: Creating audit log...
   ✅ Audit log created

════════════════════════════════════════════════════════════════
✅ INVOICE APPROVED SUCCESSFULLY!
════════════════════════════════════════════════════════════════
📋 Invoice: VENDOR-INV-OCT-2025
🏢 Vendor: Property Management Ltd
💰 Total Amount: $5725.00
📊 Status: APPROVED
💳 Payment Status: PENDING
🆔 Journal Entry: JE-2025-1234

📌 ACCOUNTING IMPACT:
   • Expense Recognized: $5000.00
   • VAT Input (Recoverable): $725.00
   • Accounts Payable (Liability): $5725.00

⏭️  NEXT STEP: Process payment to clear the liability
════════════════════════════════════════════════════════════════
```

### **What This Tells You:**

1. **Invoice Details**: Who approved it, vendor name, amounts
2. **Validation**: All checks passed
3. **Accounting Impact**: Exactly which accounts are affected
4. **Payment Method**: CREDIT (creates liability, not immediate payment)
5. **Journal Entry**: Reference number for tracking
6. **Next Steps**: What to do next (process payment)

---

## 💸 EXAMPLE OUTPUT: PAYMENT PROCESSING

When you process a payment, you'll see these logs:

```
════════════════════════════════════════════════════════════════
🚀 PROCUREMENT PAYMENT PROCESSING STARTED
════════════════════════════════════════════════════════════════
📋 Invoice ID: inv-11111
💰 Payment Amount: $5725.00
💳 Payment Method: BANK
👤 Processed By: user-admin-123

🔍 Step 1: Retrieving invoice details...
✅ Invoice Found: VENDOR-INV-OCT-2025
   Vendor: Property Management Ltd
   Total Amount: $5725.00
   Status: APPROVED
   Payment Status: PENDING

🔒 Step 2: Validating payment request...
   ✅ Invoice is approved
   ✅ Invoice is not already paid
   ✅ Payment amount valid ($5725.00 <= $5725.00)
   ℹ️  FULL PAYMENT: Paying entire invoice amount

💰 Step 3: Creating payment journal entry...
   This will:
   • DEBIT Accounts Payable (reduce liability): $5725.00
   • CREDIT BANK Account (reduce cash): $5725.00


╔════════════════════════════════════════════════════════════════╗
║  VENDOR PAYMENT JOURNAL ENTRY - CREATION STARTED               ║
╚════════════════════════════════════════════════════════════════╝
📝 Invoice Number: VENDOR-INV-OCT-2025
💰 Payment Amount: $5725.00
💳 Payment Method: BANK
📅 Transaction Date: 2025-10-14
🔖 Payment Reference: TXN-14OCT2025-001
🏦 Bank Account ID: zig-account-id

🔍 Step 1: Retrieving Accounts Payable account...
✅ Found: 2000 - Accounts Payable

🔍 Step 2: Retrieving BANK account...
✅ Using Specific Account: 1030 - Bank Account - ZIG

📋 Step 3: Creating Journal Entry Header...
   Reference: VENDOR-PAY-VENDOR-INV-OCT-2025
   Status: POSTED (immediately posted)
✅ Journal Entry Created: ID = je-33333

📊 Step 4: Creating Journal Entry Lines (Double-Entry)...
────────────────────────────────────────────────────────────────

   Line 1: DEBIT
   Account: 2000 - Accounts Payable
   Amount: $5725.00
   Effect: Clears vendor liability (reduces amount owed)
   ✅ Debit line created

   Line 2: CREDIT
   Account: 1030 - Bank Account - ZIG
   Amount: $5725.00
   Effect: Reduces cash/bank balance (money leaves account)
   ✅ Credit line created

⚖️  Step 5: Verifying Double-Entry Balance...
   Total Debits:  $5725.00
   Total Credits: $5725.00
   Difference:    $0.00
   ✅ Entry is BALANCED!

╔════════════════════════════════════════════════════════════════╗
║  VENDOR PAYMENT JOURNAL ENTRY - CREATED SUCCESSFULLY           ║
╚════════════════════════════════════════════════════════════════╝
📌 Reference Number: VENDOR-PAY-VENDOR-INV-OCT-2025
💰 Total Amount: $5725.00
📊 Status: POSTED
🆔 Journal Entry ID: je-33333


📝 Step 4: Updating invoice payment status...
   New Payment Status: PAID
   Payment Date: 2025-10-14
   Payment Reference: TXN-14OCT2025-001
   ✅ Invoice updated successfully

📊 Step 5: Creating audit log...
   ✅ Audit log created

════════════════════════════════════════════════════════════════
✅ PAYMENT PROCESSED SUCCESSFULLY!
════════════════════════════════════════════════════════════════
📋 Invoice: VENDOR-INV-OCT-2025
🏢 Vendor: Property Management Ltd
💰 Amount Paid: $5725.00
💳 Via: BANK (Ref: TXN-14OCT2025-001)
📊 Payment Status: PAID
💵 Remaining Balance: $0.00
🆔 Journal Entry: VENDOR-PAY-VENDOR-INV-OCT-2025
════════════════════════════════════════════════════════════════
```

### **What This Tells You:**

1. **Payment Details**: Amount, method, who processed it
2. **Validation**: All checks passed (approved, not paid, valid amount)
3. **Payment Type**: Full or partial
4. **Account Details**: Exact accounts being debited/credited
5. **Journal Entry Creation**: Step-by-step line creation
6. **Balance Verification**: Confirms debits = credits
7. **Final Status**: PAID with remaining balance

---

## 🔍 EXAMPLE OUTPUT: PARTIAL PAYMENT

When you make a partial payment:

```
🔒 Step 2: Validating payment request...
   ✅ Invoice is approved
   ✅ Invoice is not already paid
   ✅ Payment amount valid ($3000.00 <= $5725.00)
   ℹ️  PARTIAL PAYMENT: Paying $3000.00 of $5725.00
   ℹ️  Remaining Balance: $2725.00

... (journal entry created for $3000)...

════════════════════════════════════════════════════════════════
✅ PAYMENT PROCESSED SUCCESSFULLY!
════════════════════════════════════════════════════════════════
📋 Invoice: VENDOR-INV-OCT-2025
🏢 Vendor: Property Management Ltd
💰 Amount Paid: $3000.00
💳 Via: BANK (Ref: TXN-001)
📊 Payment Status: PARTIALLY_PAID
💵 Remaining Balance: $2725.00
🆔 Journal Entry: VENDOR-PAY-VENDOR-INV-OCT-2025
════════════════════════════════════════════════════════════════
```

**Key Difference:**
- Status shows **PARTIALLY_PAID** instead of PAID
- **Remaining Balance** shows what's left to pay
- Journal entry is for **partial amount only**

---

## ❌ EXAMPLE OUTPUT: ERROR SCENARIOS

### **Error 1: Invoice Not Found**
```
════════════════════════════════════════════════════════════════
🚀 PROCUREMENT PAYMENT PROCESSING STARTED
════════════════════════════════════════════════════════════════
📋 Invoice ID: invalid-id
💰 Payment Amount: $5725.00
💳 Payment Method: BANK
👤 Processed By: user-admin-123

🔍 Step 1: Retrieving invoice details...
❌ ERROR: Invoice not found

════════════════════════════════════════════════════════════════
❌ ERROR PROCESSING PAYMENT
════════════════════════════════════════════════════════════════
Error details: Error: Invoice not found
    at ProcurementService.payProcurementInvoice...
════════════════════════════════════════════════════════════════
```

### **Error 2: Invoice Not Approved**
```
🔍 Step 1: Retrieving invoice details...
✅ Invoice Found: VENDOR-INV-OCT-2025
   Vendor: Property Management Ltd
   Total Amount: $5725.00
   Status: PENDING
   Payment Status: PENDING

🔒 Step 2: Validating payment request...
❌ VALIDATION FAILED: Invoice status is "PENDING", must be "APPROVED"

════════════════════════════════════════════════════════════════
❌ ERROR PROCESSING PAYMENT
════════════════════════════════════════════════════════════════
Error details: Error: Invoice must be approved before payment can be processed
════════════════════════════════════════════════════════════════
```

### **Error 3: Already Paid**
```
🔒 Step 2: Validating payment request...
   ✅ Invoice is approved
❌ VALIDATION FAILED: Invoice has already been paid

════════════════════════════════════════════════════════════════
❌ ERROR PROCESSING PAYMENT
════════════════════════════════════════════════════════════════
Error details: Error: Invoice has already been paid
════════════════════════════════════════════════════════════════
```

### **Error 4: Overpayment**
```
🔒 Step 2: Validating payment request...
   ✅ Invoice is approved
   ✅ Invoice is not already paid
❌ VALIDATION FAILED: Payment amount ($10000.00) exceeds invoice total ($5725.00)

════════════════════════════════════════════════════════════════
❌ ERROR PROCESSING PAYMENT
════════════════════════════════════════════════════════════════
Error details: Error: Payment amount ($10000) cannot exceed invoice total ($5725)
════════════════════════════════════════════════════════════════
```

### **Error 5: Unbalanced Entry**
```
⚖️  Step 5: Verifying Double-Entry Balance...
   Total Debits:  $5725.00
   Total Credits: $5000.00
   Difference:    $725.00
   ❌ ERROR: Entry is UNBALANCED!

╔════════════════════════════════════════════════════════════════╗
║  ❌ ERROR CREATING VENDOR PAYMENT JOURNAL ENTRY                ║
╚════════════════════════════════════════════════════════════════╝
Error details: Error: Journal entry is unbalanced! Debits: 5725, Credits: 5000
```

---

## 🔧 HOW TO VIEW LOGS

### **Method 1: Real-Time Server Console**
```bash
# Start your server normally
npm run dev
# OR
npm start

# Logs will appear in the console as operations happen
```

### **Method 2: PM2 Logs (Production)**
```bash
# View all logs
pm2 logs

# View specific app logs
pm2 logs your-app-name

# View only recent logs
pm2 logs --lines 100

# Follow logs in real-time
pm2 logs --lines 0
```

### **Method 3: Docker Logs**
```bash
# View logs
docker logs <container-name>

# Follow logs in real-time
docker logs -f <container-name>

# View last 100 lines
docker logs --tail 100 <container-name>
```

### **Method 4: Log File (if configured)**
```bash
# If you're using a file logger
tail -f logs/app.log

# OR with grep for filtering
tail -f logs/app.log | grep "PAYMENT"
tail -f logs/app.log | grep "ERROR"
```

---

## 🎯 FILTERING LOGS

### **Filter by Operation:**

```bash
# Payment processing only
pm2 logs | grep "PAYMENT PROCESSING"

# Invoice approval only
pm2 logs | grep "INVOICE APPROVAL"

# Journal entries only
pm2 logs | grep "JOURNAL ENTRY"

# Errors only
pm2 logs | grep "ERROR"

# Balance verification
pm2 logs | grep "Balance"
```

### **Filter by Invoice:**

```bash
# Specific invoice
pm2 logs | grep "VENDOR-INV-OCT-2025"

# All invoices with specific vendor
pm2 logs | grep "Property Management Ltd"
```

---

## 📊 LOG STRUCTURE

### **Log Sections:**

Each operation has **5 main steps**:

1. **Header** - Operation name and parameters
2. **Retrieval** - Fetching data from database
3. **Validation** - Checking business rules
4. **Action** - Creating journal entries, updating records
5. **Summary** - Final status and accounting impact

### **Key Indicators:**

| Symbol | Meaning |
|--------|---------|
| 🚀 | Operation started |
| 🔍 | Retrieving/searching |
| 🔒 | Validating |
| 💰 | Creating journal entry |
| 📝 | Updating records |
| 📊 | Creating audit log |
| ✅ | Success |
| ❌ | Error/failure |
| ℹ️  | Information |
| ⚖️  | Balance check |
| 🆔 | ID/reference |

---

## 🎓 UNDERSTANDING THE LOGS

### **Invoice Approval Logs Show:**

1. **What expense is being recognized**: Rent, utilities, etc.
2. **How much VAT can be recovered**: Tax input
3. **Liability created**: Accounts Payable amount
4. **Journal entry reference**: For tracking
5. **Next step**: Process payment

**Accounting Impact:**
```
Dr  Expense Account    $5,000
Dr  VAT Input            $725
    Cr  A/P              $5,725 ← You now owe this
```

### **Payment Processing Logs Show:**

1. **Which liability is being cleared**: Accounts Payable
2. **Which account is being reduced**: Cash/Bank
3. **Payment details**: Reference, method
4. **Balance verification**: Debits = Credits
5. **Remaining balance**: For partial payments

**Accounting Impact:**
```
Dr  Accounts Payable  $5,725 ← Clearing debt
    Cr  Bank           $5,725 ← Money leaving
```

---

## ✅ BEST PRACTICES

### **1. Monitor Logs During Testing**
```bash
# Keep logs open while testing
pm2 logs --lines 0

# Test invoice approval → Check logs
# Test payment → Check logs
# Verify each step appears correctly
```

### **2. Check Balance Verification**
Look for this in every payment:
```
⚖️  Step 5: Verifying Double-Entry Balance...
   Total Debits:  $5725.00
   Total Credits: $5725.00
   Difference:    $0.00
   ✅ Entry is BALANCED!
```

If difference is > $0.00, there's a problem!

### **3. Save Important Logs**
```bash
# Save approval logs
pm2 logs | grep "INVOICE APPROVED SUCCESSFULLY" > invoice-approvals.log

# Save payment logs
pm2 logs | grep "PAYMENT PROCESSED SUCCESSFULLY" > payments.log

# Save errors
pm2 logs | grep "ERROR" > errors.log
```

### **4. Monitor for Errors**
```bash
# Watch for errors in real-time
pm2 logs | grep --line-buffered "ERROR"

# Alert on balance issues
pm2 logs | grep --line-buffered "UNBALANCED"
```

---

## 🎉 SUMMARY

You now have **comprehensive logging** that shows:

- ✅ Every step of invoice approval
- ✅ Every step of payment processing
- ✅ Exact accounts affected
- ✅ Debit and credit amounts
- ✅ Balance verification
- ✅ Error details with context
- ✅ Accounting impact summary

The logs are:
- 📊 **Structured** - Easy to read and follow
- 🎯 **Detailed** - Shows every operation
- ⚖️  **Verified** - Checks balances at each step
- ❌ **Informative** - Clear error messages
- 🔍 **Traceable** - Includes reference numbers

---

**Happy Logging!** 📊✅

Monitor your logs to see exactly what's happening in your accounting system!


