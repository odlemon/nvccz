# 👥 PROCUREMENT MODULE - TESTING USERS GUIDE

## 🔐 **ALL TEST USERS SHARE THE SAME PASSWORD**

```
Password: TestPass123!
```

---

## 📋 **REQUIRED TEST USERS (5 Users)**

### **Minimum Required for Full Testing:**

You need **at least 2-3 users** to test the complete workflow:

1. **One HEAD or DEPUTY** (to approve requisitions)
2. **One MEMBER** (to create requisitions)
3. **Optional: Additional approvers** (for multi-step approval testing)

---

## 🎯 **TESTING SCENARIOS & REQUIRED USERS**

### **Scenario 1: Basic Requisition Flow** ✅ **MINIMUM**

**Required Users: 2**

| User | Email | Role | Purpose |
|------|-------|------|---------|
| **Creator** | `proc.buyer@testnvccz.com` | BUYER (MEMBER) | Create requisition |
| **Approver** | `proc.manager@testnvccz.com` | PROC_MGR (HEAD) | Approve requisition |

**Test Flow:**
1. Login as **Buyer** → Create requisition
2. Login as **Manager** → Approve requisition

---

### **Scenario 2: Multi-Step Approval** ✅ **RECOMMENDED**

**Required Users: 3+**

| User | Email | Role | Purpose |
|------|-------|------|---------|
| **Creator** | `proc.buyer@testnvccz.com` | BUYER (MEMBER) | Create requisition |
| **Step 1 Approver** | `proc.manager@testnvccz.com` | PROC_MGR (HEAD) | Approve Step 1 |
| **Step 2 Approver** | `proc.officer@testnvccz.com` | PROC_OFF (DEPUTY) | Approve Step 2 |

**Test Flow:**
1. Login as **Buyer** → Create requisition
2. Login as **Manager** → Approve Step 1
3. Login as **Officer** → Approve Step 2 (if configured)

---

### **Scenario 3: Complete Procurement Workflow** ✅ **FULL TEST**

**Required Users: 3-5**

| User | Email | Role | Purpose |
|------|-------|------|---------|
| **Creator** | `proc.buyer@testnvccz.com` | BUYER (MEMBER) | Create requisition, RFQ, invoice |
| **Requisition Approver** | `proc.manager@testnvccz.com` | PROC_MGR (HEAD) | Approve requisition |
| **Invoice Approver** | `proc.officer@testnvccz.com` | PROC_OFF (DEPUTY) | Approve invoice (if config requires) |
| **Payment Processor** | `proc.buyer@testnvccz.com` | BUYER (MEMBER) | Process payment |

**Test Flow:**
1. **Buyer** → Create requisition
2. **Manager** → Approve requisition
3. **Buyer** → Create RFQ
4. **Buyer** → Accept quotation → Create PO
5. **Buyer** → Create GRN
6. **Buyer** → Create invoice
7. **Officer** → Approve invoice (if required)
8. **Buyer** → Process payment

---

## 📊 **QUICK REFERENCE - ALL 5 TEST USERS**

| # | Name | Email | Role Code | Dept Role | Can Approve Req? | Use For |
|---|------|-------|-----------|-----------|------------------|---------|
| 1 | **Manager** | `proc.manager@testnvccz.com` | `PROC_MGR` | `HEAD` | ✅ Yes | Approve requisitions, invoices, POs |
| 2 | **Officer** | `proc.officer@testnvccz.com` | `PROC_OFF` | `DEPUTY` | ✅ Yes | Approve requisitions, invoices, POs |
| 3 | **Buyer** | `proc.buyer@testnvccz.com` | `BUYER` | `MEMBER` | ❌ No | Create requisitions, RFQs, invoices |
| 4 | **Coordinator** | `proc.coordinator@testnvccz.com` | `PROC_COORD` | `MEMBER` | ❌ No | Create requisitions, coordinate |
| 5 | **Member** | `proc.member@testnvccz.com` | `PROC_MEM` | `MEMBER` | ❌ No | Create requisitions, basic tasks |

---

## 🎯 **RECOMMENDED TESTING SETUP**

### **For Quick Testing (Minimum):**
- ✅ **Buyer** (`proc.buyer@testnvccz.com`) - Create requisitions
- ✅ **Manager** (`proc.manager@testnvccz.com`) - Approve requisitions

### **For Complete Testing (Recommended):**
- ✅ **Buyer** (`proc.buyer@testnvccz.com`) - Create requisitions, RFQs, invoices
- ✅ **Manager** (`proc.manager@testnvccz.com`) - Approve requisitions (Step 1)
- ✅ **Officer** (`proc.officer@testnvccz.com`) - Approve requisitions (Step 2), invoices

### **For Full Workflow Testing:**
- ✅ All 5 users to test different role combinations

---

## 🔑 **KEY ROLES EXPLAINED**

### **Department Roles (for Requisition Approvals):**

| Role | Can Approve Requisitions? | Users |
|------|---------------------------|-------|
| **HEAD** | ✅ Yes | Manager |
| **DEPUTY** | ✅ Yes | Officer |
| **MEMBER** | ❌ No | Buyer, Coordinator, Member |

### **System Role Codes (for Invoice/PO Approvals):**

| Role Code | Can Approve Invoices/POs? | Depends On |
|-----------|---------------------------|------------|
| **PROC_MGR** | ✅ Yes* | Approval config |
| **PROC_OFF** | ✅ Yes* | Approval config |
| **BUYER** | ✅ Yes* | Approval config |
| **PROC_COORD** | ✅ Yes* | Approval config |
| **PROC_MEM** | ✅ Yes* | Approval config |

*Only if approval configuration includes this role code

---

## 📝 **TESTING CHECKLIST**

### **Basic Testing (2 users):**
- [ ] Login as **Buyer** → Create requisition
- [ ] Login as **Manager** → View requisitions (filtered by department)
- [ ] Login as **Manager** → Approve requisition
- [ ] Check email notifications (HEAD should receive email)

### **Complete Testing (3+ users):**
- [ ] Login as **Buyer** → Create requisition
- [ ] Login as **Manager** → Approve Step 1
- [ ] Login as **Officer** → Approve Step 2 (if configured)
- [ ] Check email notifications (all approvers and submitter)
- [ ] Test rejection flow (reject at any step)
- [ ] Check rejection email to submitter

### **Full Workflow Testing (3-5 users):**
- [ ] Create requisition → Approve → Create RFQ
- [ ] Accept quotation → Create PO → Send PO
- [ ] Create GRN → Create invoice → Approve invoice
- [ ] Process payment → Check accounting entries
- [ ] Verify all email notifications sent

---

## 🚀 **QUICK START**

**Minimum Setup (2 users):**
```
1. proc.buyer@testnvccz.com (Password: TestPass123!)
2. proc.manager@testnvccz.com (Password: TestPass123!)
```

**Recommended Setup (3 users):**
```
1. proc.buyer@testnvccz.com (Password: TestPass123!)
2. proc.manager@testnvccz.com (Password: TestPass123!)
3. proc.officer@testnvccz.com (Password: TestPass123!)
```

---

**All users are already created and ready to use!** 🎉

