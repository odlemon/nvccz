const axios = require('axios');
const BASE = 'http://localhost:3003';

async function checkAndCreateVATAccounts() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Checking and Creating VAT Accounts                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;

  // Get all chart of accounts
  const accountsRes = await axios.get(BASE + '/api/accounting/chart-of-accounts', {
    headers: { Authorization: 'Bearer ' + token }
  });

  const accounts = accountsRes.data.data || [];
  console.log(`📋 Found ${accounts.length} existing accounts\n`);

  // Check for VAT Input account
  const vatInputAccount = accounts.find(acc => 
    acc.accountName?.toLowerCase().includes('vat input') ||
    acc.accountName?.toLowerCase().includes('vat recoverable')
  );

  // Check for VAT Output account
  const vatOutputAccount = accounts.find(acc => 
    acc.accountName?.toLowerCase().includes('vat output') ||
    acc.accountName?.toLowerCase().includes('vat payable')
  );

  console.log('Checking VAT accounts...\n');

  // Create VAT Input account if missing
  if (!vatInputAccount) {
    console.log('⚠️  VAT Input account not found');
    console.log('   Creating VAT Input account...');
    
    try {
      const createRes = await axios.post(BASE + '/api/accounting/chart-of-accounts', {
        accountNo: '2100',
        accountName: 'VAT Input',
        accountType: 'Current Liability',
        financialStatement: 'Balance Sheet',
        notes: 'VAT recoverable on purchases and expenses',
        isActive: true
      }, {
        headers: { Authorization: 'Bearer ' + token }
      });
      
      console.log('   ✅ VAT Input account created:', createRes.data.data?.accountNo || '2100');
      console.log('      Account Name:', createRes.data.data?.accountName || 'VAT Input');
      console.log('      Account Type:', createRes.data.data?.accountType || 'Current Liability\n');
    } catch (e) {
      if (e.response?.status === 409) {
        console.log('   ⚠️  Account 2100 already exists, checking if it can be used...\n');
      } else {
        console.log('   ❌ Error creating VAT Input account:', e.response?.data?.message || e.message);
        // Try alternative account number
        try {
          const createRes2 = await axios.post(BASE + '/api/accounting/chart-of-accounts', {
            accountNo: '2101',
            accountName: 'VAT Input',
            accountType: 'Current Liability',
            financialStatement: 'Balance Sheet',
            notes: 'VAT recoverable on purchases and expenses',
            isActive: true
          }, {
            headers: { Authorization: 'Bearer ' + token }
          });
          console.log('   ✅ VAT Input account created with number 2101\n');
        } catch (e2) {
          console.log('   ❌ Failed to create with alternative number:', e2.response?.data?.message || e2.message, '\n');
        }
      }
    }
  } else {
    console.log('✅ VAT Input account exists:');
    console.log(`   Account: ${vatInputAccount.accountNo} - ${vatInputAccount.accountName}`);
    console.log(`   Type: ${vatInputAccount.accountType}\n`);
  }

  // Create VAT Output account if missing
  if (!vatOutputAccount) {
    console.log('⚠️  VAT Output account not found');
    console.log('   Creating VAT Output account...');
    
    try {
      const createRes = await axios.post(BASE + '/api/accounting/chart-of-accounts', {
        accountNo: '2200',
        accountName: 'VAT Output',
        accountType: 'Current Liability',
        financialStatement: 'Balance Sheet',
        notes: 'VAT payable on sales and revenue',
        isActive: true
      }, {
        headers: { Authorization: 'Bearer ' + token }
      });
      
      console.log('   ✅ VAT Output account created:', createRes.data.data?.accountNo || '2200');
      console.log('      Account Name:', createRes.data.data?.accountName || 'VAT Output');
      console.log('      Account Type:', createRes.data.data?.accountType || 'Current Liability\n');
    } catch (e) {
      if (e.response?.status === 409) {
        console.log('   ⚠️  Account 2200 already exists, checking if it can be used...\n');
      } else {
        console.log('   ❌ Error creating VAT Output account:', e.response?.data?.message || e.message);
        // Try alternative account number
        try {
          const createRes2 = await axios.post(BASE + '/api/accounting/chart-of-accounts', {
            accountNo: '2201',
            accountName: 'VAT Output',
            accountType: 'Current Liability',
            financialStatement: 'Balance Sheet',
            notes: 'VAT payable on sales and revenue',
            isActive: true
          }, {
            headers: { Authorization: 'Bearer ' + token }
          });
          console.log('   ✅ VAT Output account created with number 2201\n');
        } catch (e2) {
          console.log('   ❌ Failed to create with alternative number:', e2.response?.data?.message || e2.message, '\n');
        }
      }
    }
  } else {
    console.log('✅ VAT Output account exists:');
    console.log(`   Account: ${vatOutputAccount.accountNo} - ${vatOutputAccount.accountName}`);
    console.log(`   Type: ${vatOutputAccount.accountType}\n`);
  }

  // Final verification
  console.log('📋 Final Verification:\n');
  const finalAccountsRes = await axios.get(BASE + '/api/accounting/chart-of-accounts', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const finalAccounts = finalAccountsRes.data.data || [];
  
  const finalVATInput = finalAccounts.find(acc => 
    acc.accountName?.toLowerCase().includes('vat input') ||
    acc.accountName?.toLowerCase().includes('vat recoverable')
  );
  const finalVATOutput = finalAccounts.find(acc => 
    acc.accountName?.toLowerCase().includes('vat output') ||
    acc.accountName?.toLowerCase().includes('vat payable')
  );

  if (finalVATInput && finalVATOutput) {
    console.log('✅ Both VAT accounts are ready!');
    console.log(`   VAT Input: ${finalVATInput.accountNo} - ${finalVATInput.accountName}`);
    console.log(`   VAT Output: ${finalVATOutput.accountNo} - ${finalVATOutput.accountName}\n`);
  } else {
    console.log('⚠️  One or both VAT accounts are still missing\n');
  }

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  CHECK COMPLETE                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

checkAndCreateVATAccounts().catch(e => {
  console.error('Error:', e.response?.data || e.message);
  process.exit(1);
});


