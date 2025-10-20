# 🚀 VENDOR QUOTATION SYSTEM - QUICK START GUIDE

## ⚡ **5-MINUTE SETUP**

### **Step 1: Run Database Migration** (1 min)
```bash
# Navigate to project directory
cd /path/to/nvccz

# Run the migration
npx prisma migrate deploy

# Verify migration
npx prisma studio
```

### **Step 2: Rebuild TypeScript** (1 min)
```bash
# Build the project
npm run build

# Or for development
npm run dev
```

### **Step 3: Restart Server** (30 seconds)
```bash
# Using PM2
pm2 restart nvccz-api

# Or manually
npm run start
```

### **Step 4: Verify Installation** (1 min)
```bash
# Test public endpoint (no auth needed)
curl -X POST http://localhost:3000/api/vendor-quotations/submit \
  -H "Content-Type: application/json" \
  -d '{
    "rfqNumber": "TEST-001",
    "vendorName": "Test Vendor",
    "vendorEmail": "test@vendor.com",
    "companyName": "Test Company",
    "currencyCode": "USD",
    "items": [
      {
        "itemName": "Test Item",
        "quantity": 1,
        "unitPrice": 100
      }
    ]
  }'

# Should return 201 Created with quotation details
```

### **Step 5: Check Swagger Docs** (30 seconds)
```bash
# Open in browser
http://localhost:3000/api-docs

# Look for "Vendor Quotations" section
```

---

## 🎯 **WHAT YOU GET**

### **New Public Endpoint** (No Authentication)
- `POST /api/vendor-quotations/submit` - Vendors submit quotations

### **New Authenticated Endpoints**
- `GET /api/vendor-quotations` - View all quotations
- `GET /api/vendor-quotations/:id` - View single quotation
- `GET /api/vendor-quotations/rfq/:rfqNumber` - View quotations by RFQ
- `POST /api/vendor-quotations/:id/accept` - Accept quotation (auto-creates invoice!)
- `POST /api/vendor-quotations/:id/reject` - Reject quotation
- `DELETE /api/vendor-quotations/:id` - Delete quotation

### **Enhanced Features**
- ✅ RFQ emails now include "Submit Quotation Online" button
- ✅ Accepted quotations automatically create invoices
- ✅ Email notifications (accept/reject/payment)
- ✅ Payment confirmations sent to vendors

---

## 🧪 **QUICK TEST**

### **Test 1: Send RFQ (Existing Flow)**
```bash
POST http://localhost:3000/api/procurement/rfq
Authorization: Bearer YOUR_TOKEN

{
  "requisitionId": "YOUR_REQ_ID",
  "title": "Test RFQ",
  "vendorIds": ["VENDOR_1", "VENDOR_2"],
  "items": [{"itemName": "Test Item", "quantity": 1}]
}
```

**Result:** Vendors receive email with quotation link! ✨

---

### **Test 2: Vendor Submits Quotation (NEW!)**
```bash
POST http://localhost:3000/api/vendor-quotations/submit
# NO AUTHORIZATION NEEDED!

{
  "rfqNumber": "RFQ-FROM-STEP-1",
  "vendorName": "John Doe",
  "vendorEmail": "john@vendor.com",
  "companyName": "ABC Ltd",
  "currencyCode": "USD",
  "items": [
    {
      "itemName": "Test Item",
      "quantity": 1,
      "unitPrice": 150.00
    }
  ]
}
```

**Result:** Quotation created! ✨

---

### **Test 3: Accept Quotation (NEW!)**
```bash
POST http://localhost:3000/api/vendor-quotations/{quotationId}/accept
Authorization: Bearer YOUR_TOKEN

{
  "reviewNotes": "Best price!",
  "createInvoice": true
}
```

**Result:** 
- ✅ Quotation accepted
- ✅ Invoice automatically created
- ✅ Email sent to vendor ✨

---

### **Test 4: Pay Invoice (Enhanced)**
```bash
POST http://localhost:3000/api/procurement/invoices/{invoiceId}/payment
Authorization: Bearer YOUR_TOKEN

{
  "paymentAmount": 150.00,
  "paymentMethod": "BANK",
  "paymentReference": "TXN-001"
}
```

**Result:** 
- ✅ Payment processed
- ✅ Accounting entries created
- ✅ Payment confirmation email sent to vendor ✨

---

## 📧 **EMAIL TESTING**

To test emails, check your email service logs:
```bash
# Check for email notifications
tail -f logs/app.log | grep "email sent"
```

Or check the ZeptoMail dashboard for sent emails.

---

## 🐛 **TROUBLESHOOTING**

### **Issue: Migration fails**
```bash
# Reset and retry
npx prisma migrate reset
npx prisma migrate deploy
```

### **Issue: Quotation submission fails**
- Check vendor exists in vendor table
- Check currency code matches existing currency
- Verify all required fields are provided

### **Issue: Emails not sending**
- Verify `ZEPTO_API_KEY` in .env
- Check email addresses are valid
- Look for errors in console logs

### **Issue: Cannot accept quotation**
- Vendor email must match an existing vendor in the system
- Add vendor first if not exists:
```bash
POST /api/accounting/vendors
{
  "name": "Vendor Name",
  "email": "vendor@email.com"
}
```

---

## 📚 **DOCUMENTATION**

- **Complete Testing Guide:** `PROCUREMENT_VENDOR_QUOTATION_TESTING_GUIDE.md`
- **Implementation Details:** `VENDOR_QUOTATION_IMPLEMENTATION_SUMMARY.md`
- **Original Procurement Flow:** `PROCUREMENT_END_TO_END_TESTING_GUIDE.md`
- **API Docs:** http://localhost:3000/api-docs

---

## ✅ **VERIFICATION CHECKLIST**

After setup, verify:
- [ ] Migration applied successfully
- [ ] Server restarted
- [ ] Public quotation endpoint works (no auth)
- [ ] Authenticated endpoints work
- [ ] Swagger docs show new endpoints
- [ ] RFQ email includes quotation link
- [ ] Quotation acceptance creates invoice
- [ ] Email notifications are sent

---

## 🎉 **YOU'RE READY!**

The Vendor Quotation System is now live and ready to use!

**Next Steps:**
1. Test the complete flow with real vendors
2. Customize email templates if needed
3. Build the frontend quotation form
4. Train users on the new system

**Need Help?**
- Check the full documentation in `PROCUREMENT_VENDOR_QUOTATION_TESTING_GUIDE.md`
- Review implementation details in `VENDOR_QUOTATION_IMPLEMENTATION_SUMMARY.md`
- Check API docs at `/api-docs`

---

**Version:** 1.0.0  
**Last Updated:** October 15, 2025  
**Status:** ✅ Production Ready






