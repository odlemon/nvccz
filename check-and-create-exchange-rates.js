const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function checkAndCreateExchangeRates() {
  let token = '';
  let userId = '';

  console.log('🔍 Checking and Creating Exchange Rates...\n');

  // Login
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    token = loginRes.data.token;
    // Get user ID from login response or find admin user
    userId = loginRes.data.user?.id;
    if (!userId) {
      // Find admin user by email
      try {
        const usersRes = await axios.get(`${BASE_URL}/api/users`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { email: ADMIN_EMAIL }
        });
        const users = usersRes.data.data || usersRes.data || [];
        const adminUser = Array.isArray(users) ? users.find(u => u.email === ADMIN_EMAIL) : users;
        userId = adminUser?.id;
      } catch (e) {
        // If we can't get user ID, we'll try without it (some endpoints might not require it)
        console.warn('⚠️  Could not get user ID, will try to create rates without it');
      }
    }
    console.log('✅ Login successful\n');
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return;
  }

  // Get currencies
  let usdCurrency = null;
  let zwlCurrency = null;
  try {
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const currencies = currenciesRes.data.data || [];
    
    usdCurrency = currencies.find(c => c.code === 'USD');
    zwlCurrency = currencies.find(c => c.code === 'ZWL');
    
    if (!usdCurrency) {
      console.error('❌ USD currency not found!');
      return;
    }
    if (!zwlCurrency) {
      console.error('❌ ZWL currency not found!');
      return;
    }
    
    console.log(`📊 Currencies:`);
    console.log(`   USD: ${usdCurrency.name} (ID: ${usdCurrency.id})`);
    console.log(`   ZWL: ${zwlCurrency.name} (ID: ${zwlCurrency.id})\n`);
  } catch (error) {
    console.error('❌ Error getting currencies:', error.message);
    return;
  }

  // Check existing exchange rates
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📈 Checking Existing Exchange Rates...');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  let existingRates = [];
  try {
    const ratesRes = await axios.get(`${BASE_URL}/api/accounting/multi-currency/exchange-rates`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { 
        limit: 1000,
        fromCurrencyId: zwlCurrency.id,
        toCurrencyId: usdCurrency.id
      }
    });
    
    existingRates = ratesRes.data?.data || ratesRes.data || [];
    if (!Array.isArray(existingRates)) {
      existingRates = [];
    }
    
    console.log(`📊 Found ${existingRates.length} existing ZWL → USD exchange rates\n`);
    
    if (existingRates.length > 0) {
      console.log('Existing rates:');
      existingRates.slice(0, 10).forEach(rate => {
        console.log(`   ${rate.date}: ${rate.rate} (Active: ${rate.isActive ? '✅' : '❌'})`);
      });
      if (existingRates.length > 10) {
        console.log(`   ... and ${existingRates.length - 10} more`);
      }
      console.log('');
    }
  } catch (error) {
    console.error('⚠️  Error getting exchange rates:', error.message);
    existingRates = [];
  }

  // Check what dates need exchange rates by looking at journal entries
  console.log('═══════════════════════════════════════════════════════════');
  console.log('💼 Checking Journal Entry Dates with ZWL...');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  let datesNeedingRates = new Set();
  try {
    // Get journal entries with ZWL currency
    const jeRes = await axios.get(`${BASE_URL}/api/accounting/journal-entries`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { 
        limit: 1000,
        status: 'ALL'
      }
    });
    
    const entries = jeRes.data.data || jeRes.data || [];
    const zwlEntries = entries.filter(e => e.currencyId === zwlCurrency.id);
    
    console.log(`📊 Found ${zwlEntries.length} journal entries in ZWL\n`);
    
    if (zwlEntries.length > 0) {
      zwlEntries.forEach(entry => {
        if (entry.transactionDate) {
          const date = new Date(entry.transactionDate).toISOString().split('T')[0];
          datesNeedingRates.add(date);
        }
      });
      
      console.log(`📅 Dates with ZWL transactions: ${datesNeedingRates.size}\n`);
      const dateArray = Array.from(datesNeedingRates).sort();
      console.log('Sample dates:', dateArray.slice(0, 10).join(', '));
      if (dateArray.length > 10) {
        console.log(`... and ${dateArray.length - 10} more dates\n`);
      }
    } else {
      console.log('✅ No ZWL transactions found - no exchange rates needed\n');
    }
  } catch (error) {
    console.error('⚠️  Error checking journal entries:', error.message);
  }

  // Create exchange rates for missing dates
  if (datesNeedingRates.size > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔧 Creating Missing Exchange Rates...');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // Use a reasonable exchange rate (you may need to adjust this)
    // Example: 1 ZWL = 0.001 USD (or whatever the current rate is)
    const defaultRate = 0.001; // Adjust this to the actual rate
    
    console.log(`💡 Using default rate: 1 ZWL = ${defaultRate} USD`);
    console.log(`   (You may need to adjust this rate based on actual market rates)\n`);
    
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    const datesToCreate = Array.from(datesNeedingRates).sort();
    
    for (const date of datesToCreate) {
      // Check if rate already exists
      const exists = existingRates.some(r => r.date === date);
      
      if (exists) {
        skippedCount++;
        continue;
      }
      
      try {
        const createRes = await axios.post(
          `${BASE_URL}/api/accounting/multi-currency/exchange-rates`,
          {
            effectiveDate: date, // API uses effectiveDate, not date
            fromCurrencyId: zwlCurrency.id,
            toCurrencyId: usdCurrency.id,
            rate: defaultRate
            // createdById is automatically set by the controller from req.user.id
          },
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        
        createdCount++;
        if (createdCount % 10 === 0) {
          process.stdout.write(`   Created ${createdCount}/${datesToCreate.length} rates...\r`);
        }
      } catch (error) {
        errorCount++;
        if (error.response?.status !== 400 || !error.response?.data?.message?.includes('already exists')) {
          console.error(`\n   ⚠️  Error creating rate for ${date}: ${error.response?.data?.message || error.message}`);
        } else {
          skippedCount++;
        }
      }
    }
    
    console.log(`\n\n✅ Exchange Rate Creation Summary:`);
    console.log(`   Created: ${createdCount}`);
    console.log(`   Skipped (already exist): ${skippedCount}`);
    console.log(`   Errors: ${errorCount}\n`);
  }

  // Test currency conversion
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 Testing Currency Conversion...');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  try {
    const testDate = Array.from(datesNeedingRates).sort()[0] || '2025-01-01';
    const testAmount = 1000; // 1000 ZWL
    
    const convertRes = await axios.post(
      `${BASE_URL}/api/accounting/multi-currency/convert`,
      {
        amount: testAmount,
        fromCurrencyId: zwlCurrency.id,
        toCurrencyId: usdCurrency.id,
        date: testDate
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    const result = convertRes.data.data || convertRes.data;
    console.log(`✅ Conversion Test Successful:`);
    console.log(`   ${testAmount} ${result.fromCurrency} = ${result.convertedAmount.toFixed(2)} ${result.toCurrency}`);
    console.log(`   Exchange Rate: ${result.exchangeRate}`);
    console.log(`   Date: ${testDate}\n`);
  } catch (error) {
    console.error('❌ Conversion Test Failed:', error.response?.data?.message || error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
    }
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');
}

checkAndCreateExchangeRates();

