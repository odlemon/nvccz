const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testCurrencyExchangeRates() {
  let token = '';

  console.log('🔍 Checking Currency and Exchange Rate Setup...\n');

  // Login
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    token = loginRes.data.token;
    console.log('✅ Login successful\n');
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return;
  }

  // Get all currencies
  try {
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const currencies = currenciesRes.data.data || [];
    
    console.log(`📊 Found ${currencies.length} currencies:\n`);
    currencies.forEach(c => {
      console.log(`   ${c.code} - ${c.name}`);
      console.log(`      ID: ${c.id}`);
      console.log(`      Default: ${c.isDefault ? '✅ YES' : '❌ NO'}`);
      console.log(`      Active: ${c.isActive ? '✅ YES' : '❌ NO'}`);
      console.log('');
    });

    // Find base currency
    const baseCurrency = currencies.find(c => c.isDefault && c.isActive);
    if (baseCurrency) {
      console.log(`\n💱 Base Currency: ${baseCurrency.code} (${baseCurrency.name})\n`);
    } else {
      console.log(`\n⚠️  No default active currency found!\n`);
    }

    // Get exchange rates
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📈 Checking Exchange Rates...');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    try {
      const ratesRes = await axios.get(`${BASE_URL}/api/accounting/multi-currency/exchange-rates`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 100 }
      });
      
      const rates = ratesRes.data.data || ratesRes.data || [];
      console.log(`📊 Found ${Array.isArray(rates) ? rates.length : 0} exchange rates:\n`);
      
      if (!Array.isArray(rates) || rates.length === 0) {
        console.log('⚠️  NO EXCHANGE RATES FOUND!');
        console.log('   This is why currency conversion is failing.\n');
        console.log('   You need to create exchange rates for currency pairs.\n');
      } else {
        // Group by currency pair
        const rateMap = new Map();
        rates.forEach(rate => {
          const key = `${rate.fromCurrency.code} → ${rate.toCurrency.code}`;
          if (!rateMap.has(key)) {
            rateMap.set(key, []);
          }
          rateMap.get(key).push(rate);
        });
        
        rateMap.forEach((rateList, pair) => {
          console.log(`   ${pair}:`);
          rateList.slice(0, 5).forEach(rate => {
            console.log(`      ${rate.date}: ${rate.rate} (Active: ${rate.isActive ? '✅' : '❌'})`);
          });
          if (rateList.length > 5) {
            console.log(`      ... and ${rateList.length - 5} more`);
          }
          console.log('');
        });
      }
    } catch (error) {
      console.error('❌ Error getting exchange rates:', error.message);
      if (error.response) {
        console.error('   Status:', error.response.status);
        console.error('   Data:', JSON.stringify(error.response.data, null, 2));
      }
    }

    // Check what currencies are used in journal entries
    console.log('═══════════════════════════════════════════════════════════');
    console.log('💼 Checking Journal Entry Currencies...');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    try {
      // Get a sample of journal entries to see what currencies are used
      const jeRes = await axios.get(`${BASE_URL}/api/accounting/journal-entries`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 10 }
      });
      
      const entries = jeRes.data.data || jeRes.data || [];
      const currencyUsage = new Map();
      
      entries.forEach(entry => {
        if (entry.currency) {
          const code = entry.currency.code || entry.currencyId;
          currencyUsage.set(code, (currencyUsage.get(code) || 0) + 1);
        }
      });
      
      console.log('Currencies used in journal entries:');
      currencyUsage.forEach((count, code) => {
        console.log(`   ${code}: ${count} entries`);
      });
      
      if (baseCurrency && currencyUsage.size > 0) {
        const hasBaseCurrency = currencyUsage.has(baseCurrency.code);
        const otherCurrencies = Array.from(currencyUsage.keys()).filter(c => c !== baseCurrency.code);
        
        if (otherCurrencies.length > 0) {
          console.log(`\n⚠️  Transactions exist in currencies other than base (${baseCurrency.code}):`);
          otherCurrencies.forEach(code => {
            console.log(`   - ${code}`);
            console.log(`     Need exchange rate: ${code} → ${baseCurrency.code}`);
          });
        }
      }
    } catch (error) {
      console.error('❌ Error checking journal entries:', error.message);
    }

  } catch (error) {
    console.error('❌ Error getting currencies:', error.message);
  }
}

testCurrencyExchangeRates();

