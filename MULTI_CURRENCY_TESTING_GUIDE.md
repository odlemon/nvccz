# 💱 **MULTI-CURRENCY SYSTEM - TESTING GUIDE**

## 📋 **OVERVIEW**

This guide will help you test the complete Multi-Currency System implementation. The system includes:
- **Exchange Rate Management**
- **Currency Conversion**
- **Multi-Currency Payment Processing**
- **Forex Gain/Loss Calculation**
- **Automatic Journal Entry Creation**

## 🚀 **SETUP REQUIREMENTS**

### **1. Database Migration**
```bash
# Run the migration to create multi-currency tables
npx prisma migrate dev --name multi-currency-system
```

### **2. Create Required Chart of Accounts**
Before testing, ensure you have these accounts in your Chart of Accounts:
- **Foreign Exchange Account** (e.g., "6000 - Foreign Exchange Gain/Loss")
- **Accounts Receivable Account** (e.g., "1010 - Accounts Receivable")

## 🧪 **TESTING SCENARIOS**

### **TEST 1: Exchange Rate Management**

#### **1.1 Create Exchange Rate**
```bash
POST /api/accounting/multi-currency/exchange-rates
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "date": "2024-01-01",
  "fromCurrencyId": "USD_CURRENCY_ID",
  "toCurrencyId": "EUR_CURRENCY_ID",
  "rate": 0.85
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Exchange rate created successfully",
  "data": {
    "id": "exchange_rate_id",
    "date": "2024-01-01T00:00:00.000Z",
    "fromCurrencyId": "USD_CURRENCY_ID",
    "toCurrencyId": "EUR_CURRENCY_ID",
    "rate": "0.850000",
    "isActive": true,
    "fromCurrency": {
      "id": "USD_CURRENCY_ID",
      "code": "USD",
      "name": "US Dollar",
      "symbol": "$"
    },
    "toCurrency": {
      "id": "EUR_CURRENCY_ID",
      "code": "EUR",
      "name": "Euro",
      "symbol": "€"
    }
  }
}
```

#### **1.2 Create Multiple Exchange Rates**
```bash
# USD to EUR
POST /api/accounting/multi-currency/exchange-rates
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "date": "2024-01-01",
  "fromCurrencyId": "USD_CURRENCY_ID",
  "toCurrencyId": "EUR_CURRENCY_ID",
  "rate": 0.85
}

# USD to GBP
POST /api/accounting/multi-currency/exchange-rates
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "date": "2024-01-01",
  "fromCurrencyId": "USD_CURRENCY_ID",
  "toCurrencyId": "GBP_CURRENCY_ID",
  "rate": 0.78
}

# EUR to USD (reverse rate)
POST /api/accounting/multi-currency/exchange-rates
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "date": "2024-01-01",
  "fromCurrencyId": "EUR_CURRENCY_ID",
  "toCurrencyId": "USD_CURRENCY_ID",
  "rate": 1.18
}
```

### **TEST 2: Currency Conversion**

#### **2.1 Convert Currency (Same Day)**
```bash
POST /api/accounting/multi-currency/convert
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "amount": 1000.00,
  "fromCurrencyId": "USD_CURRENCY_ID",
  "toCurrencyId": "EUR_CURRENCY_ID",
  "date": "2024-01-01"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "originalAmount": 1000.00,
    "convertedAmount": 850.00,
    "exchangeRate": 0.85,
    "fromCurrency": "USD",
    "toCurrency": "EUR"
  }
}
```

#### **2.2 Convert Currency (Historical Date)**
```bash
POST /api/accounting/multi-currency/convert
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "amount": 1000.00,
  "fromCurrencyId": "USD_CURRENCY_ID",
  "toCurrencyId": "EUR_CURRENCY_ID",
  "date": "2024-01-15"
}
```

#### **2.3 Convert Same Currency**
```bash
POST /api/accounting/multi-currency/convert
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "amount": 1000.00,
  "fromCurrencyId": "USD_CURRENCY_ID",
  "toCurrencyId": "USD_CURRENCY_ID"
}
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "originalAmount": 1000.00,
    "convertedAmount": 1000.00,
    "exchangeRate": 1,
    "fromCurrency": "Same",
    "toCurrency": "Same"
  }
}
```

### **TEST 3: Multi-Currency Payment Processing**

#### **3.1 Process Multi-Currency Payment with Gain**
```bash
POST /api/accounting/multi-currency/payments
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "invoiceId": "INVOICE_ID",
  "paymentCurrencyId": "EUR_CURRENCY_ID",
  "paymentAmount": 850.00
}
```

**Expected Results:**
1. **Forex Gain/Loss Record Created**:
   - Original Amount: 1000.00 USD
   - Converted Amount: 850.00 EUR
   - Exchange Rate: 0.85
   - Gain/Loss: 0.00 (no gain/loss in this case)

2. **Journal Entry Created**:
   - Dr Accounts Receivable: 1000.00 USD
   - Cr Accounts Receivable: 1000.00 USD (net effect is zero)

#### **3.2 Process Multi-Currency Payment with Loss**
```bash
POST /api/accounting/multi-currency/payments
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "invoiceId": "INVOICE_ID",
  "paymentCurrencyId": "EUR_CURRENCY_ID",
  "paymentAmount": 900.00
}
```

**Expected Results:**
1. **Forex Loss Record Created**:
   - Original Amount: 1000.00 USD
   - Converted Amount: 900.00 EUR
   - Exchange Rate: 0.90
   - Loss: 100.00 USD

2. **Journal Entry Created**:
   - Dr Foreign Exchange Loss: 100.00 USD
   - Cr Accounts Receivable: 100.00 USD

### **TEST 4: Exchange Rate Management**

#### **4.1 Get Exchange Rates**
```bash
GET /api/accounting/multi-currency/exchange-rates?page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **4.2 Get Exchange Rates by Currency Pair**
```bash
GET /api/accounting/multi-currency/exchange-rates?fromCurrencyId=USD_CURRENCY_ID&toCurrencyId=EUR_CURRENCY_ID
Authorization: Bearer YOUR_TOKEN
```

#### **4.3 Get Exchange Rates by Date Range**
```bash
GET /api/accounting/multi-currency/exchange-rates?dateFrom=2024-01-01&dateTo=2024-01-31
Authorization: Bearer YOUR_TOKEN
```

#### **4.4 Update Exchange Rate**
```bash
PUT /api/accounting/multi-currency/exchange-rates/EXCHANGE_RATE_ID
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "rate": 0.87
}
```

#### **4.5 Delete Exchange Rate**
```bash
DELETE /api/accounting/multi-currency/exchange-rates/EXCHANGE_RATE_ID
Authorization: Bearer YOUR_TOKEN
```

### **TEST 5: Forex Gain/Loss Management**

#### **5.1 Get Forex Gain/Loss Records**
```bash
GET /api/accounting/multi-currency/forex-gain-loss?page=1&limit=10
Authorization: Bearer YOUR_TOKEN
```

#### **5.2 Get Forex Gain/Loss by Invoice**
```bash
GET /api/accounting/multi-currency/forex-gain-loss?invoiceId=INVOICE_ID
Authorization: Bearer YOUR_TOKEN
```

#### **5.3 Get Forex Gain/Loss by Type**
```bash
GET /api/accounting/multi-currency/forex-gain-loss?gainLossType=GAIN
Authorization: Bearer YOUR_TOKEN
```

#### **5.4 Get Forex Gain/Loss by Date Range**
```bash
GET /api/accounting/multi-currency/forex-gain-loss?dateFrom=2024-01-01&dateTo=2024-01-31
Authorization: Bearer YOUR_TOKEN
```

### **TEST 6: Multi-Currency Dashboard**

#### **6.1 Get Multi-Currency Dashboard**
```bash
GET /api/accounting/multi-currency/dashboard/multi-currency-dashboard
Authorization: Bearer YOUR_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "totalExchangeRates": 15,
    "activeExchangeRates": 12,
    "totalForexGainLoss": 8,
    "totalGains": 250.00,
    "totalLosses": 150.00,
    "recentExchangeRates": [
      {
        "id": "exchange_rate_id",
        "date": "2024-01-01T00:00:00.000Z",
        "rate": "0.850000",
        "fromCurrency": {
          "code": "USD",
          "name": "US Dollar",
          "symbol": "$"
        },
        "toCurrency": {
          "code": "EUR",
          "name": "Euro",
          "symbol": "€"
        }
      }
    ],
    "recentForexGainLoss": [
      {
        "id": "forex_id",
        "transactionDate": "2024-01-15T00:00:00.000Z",
        "originalAmount": "1000.00",
        "convertedAmount": "850.00",
        "gainLossAmount": "0.00",
        "gainLossType": "GAIN",
        "invoice": {
          "invoiceNumber": "INV-001",
          "totalAmount": "1000.00"
        },
        "fromCurrency": {
          "code": "USD",
          "symbol": "$"
        },
        "toCurrency": {
          "code": "EUR",
          "symbol": "€"
        }
      }
    ]
  }
}
```

## 🔍 **VALIDATION CHECKS**

### **1. Database Validation**
After each test, verify in your database:

```sql
-- Check exchange rates
SELECT * FROM exchange_rates ORDER BY date DESC;

-- Check forex gain/loss
SELECT * FROM forex_gain_loss ORDER BY transaction_date DESC;

-- Check journal entries for forex transactions
SELECT je.*, jel.* 
FROM journal_entries je
JOIN journal_entry_lines jel ON je.id = jel.journal_entry_id
WHERE je.description LIKE '%Forex%' OR je.description LIKE '%Foreign Exchange%';
```

### **2. Exchange Rate Validation**
Verify that exchange rates are handled correctly:
- **Same currency conversion** returns rate of 1
- **Reverse rates** are calculated correctly (1/rate)
- **Historical rates** are retrieved for past dates
- **Rate precision** is maintained (6 decimal places)

### **3. Forex Gain/Loss Validation**
Verify that forex gain/loss calculations are accurate:
- **Gain**: When converted amount > original amount
- **Loss**: When converted amount < original amount
- **Journal entries** reflect the gain/loss correctly
- **Running totals** are calculated properly

### **4. Currency Conversion Validation**
Verify that currency conversions are accurate:
- **Amount × Exchange Rate = Converted Amount**
- **Precision** is maintained throughout calculations
- **Error handling** for missing exchange rates

## 🚨 **ERROR SCENARIOS TO TEST**

### **1. Missing Required Fields**
```bash
POST /api/accounting/multi-currency/exchange-rates
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "date": "2024-01-01"
  // Missing required fields
}
```

### **2. Invalid Currency IDs**
```bash
POST /api/accounting/multi-currency/exchange-rates
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "date": "2024-01-01",
  "fromCurrencyId": "NON_EXISTENT_ID",
  "toCurrencyId": "EUR_CURRENCY_ID",
  "rate": 0.85
}
```

### **3. Same Currency Exchange Rate**
```bash
POST /api/accounting/multi-currency/exchange-rates
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "date": "2024-01-01",
  "fromCurrencyId": "USD_CURRENCY_ID",
  "toCurrencyId": "USD_CURRENCY_ID",
  "rate": 1.00
}
```

### **4. Duplicate Exchange Rate**
```bash
POST /api/accounting/multi-currency/exchange-rates
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "date": "2024-01-01",
  "fromCurrencyId": "USD_CURRENCY_ID",
  "toCurrencyId": "EUR_CURRENCY_ID",
  "rate": 0.85
}
# This should fail if rate already exists for this date and currency pair
```

### **5. Convert Currency with Missing Rate**
```bash
POST /api/accounting/multi-currency/convert
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "amount": 1000.00,
  "fromCurrencyId": "USD_CURRENCY_ID",
  "toCurrencyId": "NON_EXISTENT_CURRENCY_ID"
}
```

### **6. Process Payment with Non-existent Invoice**
```bash
POST /api/accounting/multi-currency/payments
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json

{
  "invoiceId": "NON_EXISTENT_INVOICE_ID",
  "paymentCurrencyId": "EUR_CURRENCY_ID",
  "paymentAmount": 850.00
}
```

## 📊 **SUCCESS CRITERIA**

### **✅ All Tests Should Pass If:**
1. **Exchange rates can be created** with proper validation
2. **Currency conversions** are accurate and precise
3. **Multi-currency payments** process correctly
4. **Forex gain/loss calculations** are accurate
5. **Journal entries are created** automatically for all transactions
6. **Exchange rate management** works correctly
7. **Forex gain/loss tracking** is comprehensive
8. **Dashboard data** is accurate and up-to-date
9. **Error handling** works for invalid inputs
10. **Database integrity** is maintained throughout

### **🎯 Key Features Verified:**
- ✅ **Exchange Rate Management**
- ✅ **Currency Conversion**
- ✅ **Multi-Currency Payment Processing**
- ✅ **Forex Gain/Loss Calculation**
- ✅ **Automatic Journal Entry Creation**
- ✅ **Dashboard Analytics**

## 🚀 **NEXT STEPS**

After successful testing:
1. **Document any issues** found during testing
2. **Verify forex calculations** are accurate
3. **Test with real data** scenarios
4. **Performance test** with large datasets
5. **Integration testing** with other modules

---

**🎉 Congratulations!** You've successfully tested the Multi-Currency System. This system now provides:
- Complete exchange rate management
- Accurate currency conversion
- Multi-currency payment processing
- Automatic forex gain/loss calculation
- Full integration with the accounting system

The system is ready for production use! 🚀

