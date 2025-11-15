const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function fixCurrencySetup() {
  let token = '';

  console.log('🔧 Fixing Currency Setup...\n');

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
    
    // Find USD
    const usdCurrency = currencies.find(c => c.code === 'USD');
    if (!usdCurrency) {
      console.error('❌ USD currency not found!');
      return;
    }

    console.log(`📊 Found USD: ${usdCurrency.name} (ID: ${usdCurrency.id})`);
    console.log(`   Currently Default: ${usdCurrency.isDefault ? '✅ YES' : '❌ NO'}\n`);

    // Set USD as default if not already
    if (!usdCurrency.isDefault) {
      console.log('🔧 Setting USD as default currency...');
      try {
        const setDefaultRes = await axios.post(
          `${BASE_URL}/api/accounting/currencies/${usdCurrency.id}/set-default`,
          {},
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        console.log('✅ USD set as default currency!\n');
      } catch (error) {
        console.error('❌ Failed to set USD as default:', error.response?.data || error.message);
        return;
      }
    } else {
      console.log('✅ USD is already the default currency\n');
    }

    // Check exchange rates
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📈 Checking Exchange Rates...');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    try {
      const ratesRes = await axios.get(`${BASE_URL}/api/accounting/multi-currency/exchange-rates`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 100 }
      });
      
      const rates = ratesRes.data?.data || ratesRes.data || [];
      
      if (!Array.isArray(rates) || rates.length === 0) {
        console.log('⚠️  NO EXCHANGE RATES FOUND!\n');
        console.log('💡 SOLUTION:');
        console.log('   1. If all transactions are in USD, no exchange rates needed');
        console.log('   2. If you have transactions in other currencies, create exchange rates');
        console.log('   3. For USD to USD, conversion will automatically use rate of 1.0\n');
        
        // Check what other currencies exist
        const otherCurrencies = currencies.filter(c => c.code !== 'USD' && c.isActive);
        if (otherCurrencies.length > 0) {
          console.log(`📊 Other active currencies found:`);
          otherCurrencies.forEach(c => {
            console.log(`   - ${c.code}: ${c.name}`);
            console.log(`     Need exchange rate: ${c.code} → USD`);
          });
          console.log('\n💡 To create exchange rates, use:');
          console.log(`   POST /api/accounting/multi-currency/exchange-rates`);
          console.log(`   Body: { date, fromCurrencyId, toCurrencyId, rate }\n`);
        }
      } else {
        console.log(`✅ Found ${rates.length} exchange rates\n`);
      }
    } catch (error) {
      console.error('❌ Error checking exchange rates:', error.message);
      if (error.response) {
        console.error('   Status:', error.response.status);
      }
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ CURRENCY SETUP SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('✅ Base Currency: USD (set as default)');
    console.log('💡 Currency Conversion:');
    console.log('   - Transactions in USD: No conversion needed (rate = 1.0)');
    console.log('   - Transactions in other currencies: Need exchange rates');
    console.log('   - Missing rates will cause warnings but won\'t break reports\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixCurrencySetup();

