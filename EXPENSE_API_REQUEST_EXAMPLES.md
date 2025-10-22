# 📋 EXPENSE API REQUEST EXAMPLES

## 🎯 **Request Body Format**

The API request body remains the same - you still send `categoryId`, but the system now uses hardcoded category names internally.

### **POST** `/api/accounting/expenses`

```json
{
  "vendorId": "string",
  "categoryId": "string", 
  "amount": "number",
  "currencyId": "string",
  "transactionDate": "string (ISO date)",
  "description": "string",
  "isTaxable": "boolean",
  "paymentMethod": "CASH | BANK | CREDIT",
  "receiptNumber": "string (optional)"
}
```

---

## 📊 **Complete Request Examples**

### **1. Salaries and Wages (Expense)**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "categoryId": "salaries_category_id_from_database",
  "amount": 5000,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-15",
  "description": "Monthly payroll expense",
  "isTaxable": true,
  "paymentMethod": "BANK",
  "receiptNumber": "PAY-2024-001"
}
```

**Expected Journal Entry:**
```
Dr. 5030 - Salaries and Wages        $5,000.00
Dr. 1101 - VAT Input                 $750.00
    Cr. 1000 - Cash and Cash Equivalents $5,750.00
```

### **2. Travel and Accommodation (Expense)**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "categoryId": "travel_category_id_from_database",
  "amount": 1200,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-15",
  "description": "Business travel expenses",
  "isTaxable": true,
  "paymentMethod": "BANK"
}
```

**Expected Journal Entry:**
```
Dr. 5070 - Travel Expense            $1,200.00
Dr. 1101 - VAT Input                 $180.00
    Cr. 1000 - Cash and Cash Equivalents $1,380.00
```

### **3. Operations (Expense)**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "categoryId": "operations_category_id_from_database",
  "amount": 2000,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-15",
  "description": "Monthly utilities",
  "isTaxable": true,
  "paymentMethod": "BANK"
}
```

**Expected Journal Entry:**
```
Dr. 5090 - Other Operating Expenses  $2,000.00
Dr. 1101 - VAT Input                 $300.00
    Cr. 1000 - Cash and Cash Equivalents $2,300.00
```

### **4. Branding and Marketing (Expense)**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "categoryId": "marketing_category_id_from_database",
  "amount": 3000,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-15",
  "description": "Marketing campaign",
  "isTaxable": true,
  "paymentMethod": "BANK"
}
```

**Expected Journal Entry:**
```
Dr. 5060 - Marketing Expense          $3,000.00
Dr. 1101 - VAT Input                 $450.00
    Cr. 1000 - Cash and Cash Equivalents $3,450.00
```

### **5. Office Equipment (Fixed Asset) ⭐**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "categoryId": "office_equipment_category_id_from_database",
  "amount": 2500,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-15",
  "description": "Computer purchase",
  "isTaxable": true,
  "paymentMethod": "BANK"
}
```

**Expected Journal Entry:**
```
Dr. 1100 - Office Equipment          $2,500.00
Dr. 1101 - VAT Input                 $375.00
    Cr. 1000 - Cash and Cash Equivalents $2,875.00
```

---

## 💳 **Payment Method Examples**

### **Cash Payment**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "categoryId": "salaries_category_id",
  "amount": 500,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-15",
  "description": "Petty cash salary advance",
  "isTaxable": false,
  "paymentMethod": "CASH"
}
```

**Expected Journal Entry:**
```
Dr. 5030 - Salaries and Wages        $500.00
    Cr. 1030 - Petty Cash             $500.00
```

### **Credit Payment**
```json
{
  "vendorId": "cmg97iu9b0000ung8h8u3bg02",
  "categoryId": "travel_category_id",
  "amount": 800,
  "currencyId": "usd_currency_id",
  "transactionDate": "2024-01-15",
  "description": "Hotel booking on credit",
  "isTaxable": true,
  "paymentMethod": "CREDIT"
}
```

**Expected Journal Entry:**
```
Dr. 5070 - Travel Expense            $800.00
Dr. 1101 - VAT Input                 $120.00
    Cr. 2000 - Accounts Payable       $920.00
```

---

## 🔧 **cURL Examples**

### **Basic Expense Creation**
```bash
curl -X POST http://localhost:3000/api/accounting/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "vendorId": "cmg97iu9b0000ung8h8u3bg02",
    "categoryId": "salaries_category_id",
    "amount": 5000,
    "currencyId": "usd_currency_id",
    "transactionDate": "2024-01-15",
    "description": "Monthly payroll expense",
    "isTaxable": true,
    "paymentMethod": "BANK"
  }'
```

### **Office Equipment Purchase**
```bash
curl -X POST http://localhost:3000/api/accounting/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "vendorId": "cmg97iu9b0000ung8h8u3bg02",
    "categoryId": "office_equipment_category_id",
    "amount": 2500,
    "currencyId": "usd_currency_id",
    "transactionDate": "2024-01-15",
    "description": "Computer purchase",
    "isTaxable": true,
    "paymentMethod": "BANK"
  }'
```

---

## 📋 **Field Descriptions**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `vendorId` | string | ✅ | ID of the vendor/supplier |
| `categoryId` | string | ✅ | ID of the expense category (system will get name) |
| `amount` | number | ✅ | Expense amount (before VAT) |
| `currencyId` | string | ✅ | ID of the currency |
| `transactionDate` | string | ✅ | Date in ISO format (YYYY-MM-DD) |
| `description` | string | ✅ | Description of the expense |
| `isTaxable` | boolean | ✅ | Whether VAT applies (true/false) |
| `paymentMethod` | string | ✅ | Payment method: "CASH", "BANK", or "CREDIT" |
| `receiptNumber` | string | ❌ | Optional receipt number |

---

## 🎯 **Key Points**

✅ **Request format unchanged** - still send `categoryId`  
✅ **System internally uses category names** for hardcoded mapping  
✅ **No changes needed** in frontend/mobile apps  
✅ **Same API endpoint** and request structure  
✅ **Hardcoded mappings** provide better performance  

The API request body remains exactly the same - the hardcoded category system works behind the scenes! 🎉
