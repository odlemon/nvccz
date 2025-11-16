# 📦 WHAT IS A PURCHASE ORDER (PO)?

**Date:** January 2025  
**Purpose:** Explanation of Purchase Orders in the procurement workflow

---

## 🎯 **WHAT IS A PURCHASE ORDER (PO)?**

A **Purchase Order (PO)** is a **formal document** that you send to a vendor to confirm your intention to purchase goods or services from them.

Think of it as a **contract** or **order confirmation** that says:
- "Yes, we want to buy these items from you"
- "These are the prices we agreed on"
- "Please deliver to this address by this date"
- "We'll pay you according to these terms"

---

## 📋 **KEY CHARACTERISTICS OF A PO**

### **1. Formal Commitment Document**

A PO is like a **written contract** between you and the vendor:
- ✅ Specifies what you're buying
- ✅ Lists quantities and prices
- ✅ Sets delivery terms and dates
- ✅ Defines payment terms

### **2. Created AFTER Vendor Selection**

PO is created **after** you've decided which vendor to use:
- ✅ You've received quotes from vendors
- ✅ You've selected the winning vendor
- ✅ You've agreed on prices and terms
- ✅ Now you create PO to formalize the purchase

### **3. Sent to Vendor**

PO is **sent to the vendor** (via email):
- ✅ Vendor receives the PO
- ✅ Vendor acknowledges receipt
- ✅ Vendor starts preparing/delivering goods
- ✅ Vendor knows they can invoice you for this PO

### **4. NO Accounting Impact**

Creating a PO does **NOT** create accounting entries:
- ❌ No expense recorded yet
- ❌ No liability created yet
- ❌ No cash affected yet

**Why?** Because you haven't received goods/services yet - it's just a commitment document!

---

## 🔄 **PO IN THE OLD vs NEW FLOW**

### **❌ OLD FLOW (With PO as Required Step):**

```
1. Create Requisition
   ↓
2. Select ONE vendor (already decided)
   ↓
3. Create PO → Send to vendor
   ↓
4. Vendor delivers goods
   ↓
5. Vendor sends invoice
   ↓
6. Approve invoice
   ↓
7. Pay vendor
```

**In Old Flow:** PO was **required** because you selected the vendor upfront.

---

### **✅ NEW FLOW (RFQ-Based - PO is Optional):**

```
1. Create Requisition
   ↓
2. Approve Requisition
   ↓
3. Create RFQ → Send to MULTIPLE vendors
   ↓
4. Vendors submit quotations
   ↓
5. Accept winning quotation
   ↓
6. [OPTIONAL] Create PO → Send to vendor
   OR
   ✅ System creates Invoice directly from quotation
   ↓
7. Approve Invoice
   ↓
8. Pay vendor
```

**In New Flow:** PO is **optional** because the system can create invoices directly from quotations!

---

## 🤔 **WHEN TO USE PO vs SKIP PO**

### **✅ USE PO (Optional Step) - When:**

1. **Formal Contract Needed:**
   - Large purchases requiring formal documentation
   - Complex orders with multiple terms and conditions
   - Legal/compliance requirements

2. **Delivery Tracking:**
   - Need to track deliveries against PO
   - Match invoices to POs for verification
   - Quality control and inspection process

3. **Multi-Stage Delivery:**
   - Goods delivered in multiple shipments
   - Need to track partial deliveries
   - Invoice matching against PO

4. **Internal Control:**
   - Approval process requires PO
   - Audit trail needs PO document
   - Financial controls require PO

---

### **✅ SKIP PO (Direct to Invoice) - When:**

1. **Simple Purchases:**
   - Small, straightforward orders
   - Services (no physical delivery)
   - Recurring purchases with established vendors

2. **RFQ-Based Flow:**
   - Competitive bidding already done
   - Quotation accepted = commitment
   - Invoice created directly from quotation

3. **Quick Processing:**
   - Need to process quickly
   - Reduce paperwork
   - Streamline workflow

**In Your System:** ✅ You can skip PO because invoices are created directly from quotations!

---

## 📊 **PO vs INVOICE - KEY DIFFERENCES**

| Aspect | Purchase Order (PO) | Invoice |
|--------|---------------------|---------|
| **Who Creates** | You (buyer) | Vendor (seller) |
| **When** | Before delivery | After delivery |
| **Purpose** | Commit to purchase | Request payment |
| **Status** | Commitment document | Payment request |
| **Accounting Impact** | ❌ None | ✅ Yes (on payment) |
| **Sent To** | Vendor | You (buyer) |

---

## 💡 **PO IN YOUR CURRENT WORKFLOW**

### **Current RFQ-Based Flow (What You're Using):**

```
✅ REQUISITION → APPROVE → RFQ → QUOTATIONS → 
   ACCEPT QUOTATION → INVOICE (directly) → 
   APPROVE → PAYMENT → COMPLETE
```

**PO is NOT required** because:
- ✅ Quotation acceptance = commitment
- ✅ Invoice created directly from quotation
- ✅ No need for separate PO document

---

### **Optional PO Flow (If You Want to Add It):**

```
✅ REQUISITION → APPROVE → RFQ → QUOTATIONS → 
   ACCEPT QUOTATION → [OPTIONAL: CREATE PO] → 
   SEND PO TO VENDOR → VENDOR DELIVERS → 
   INVOICE → APPROVE → PAYMENT → COMPLETE
```

**When to add PO:**
- If you need formal PO document
- If you want to track deliveries against PO
- If you need PO for invoice matching

---

## 🎯 **SUMMARY**

### **What is a PO?**
A **Purchase Order** is a formal document you send to a vendor to confirm your purchase commitment.

### **Is PO Required in Your System?**
**NO** - PO is **optional** in the RFQ-based workflow.

### **Current Flow:**
- ✅ **Requisition** → **RFQ** → **Quotations** → **Invoice** (directly)
- ❌ **PO is skipped** - Invoice created from quotation

### **When to Use PO:**
- ✅ If you need formal PO document
- ✅ For delivery tracking
- ✅ For invoice matching
- ✅ For large/complex orders

### **Your System Status:**
- ✅ PO creation **available** (optional)
- ✅ PO email sending **available** (optional)
- ✅ Current workflow works **without PO** (recommended for simplicity)

---

**Bottom Line:** A PO is like a formal order confirmation. In your RFQ-based flow, you can skip it because accepting a quotation is already a commitment, and invoices are created directly from quotations.

---

**End of Document**

