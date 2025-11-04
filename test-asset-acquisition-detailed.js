const axios = require('axios');
const BASE = 'http://localhost:3003';

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  DETAILED TEST: Asset Acquisition Journal Verification      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;
  const userId = loginRes.data.user.id;

  // Get accounts
  console.log('Getting GL accounts...');
  const accountsRes = await axios.get(BASE + '/api/accounting/chart-of-accounts', {
    headers: { Authorization: 'Bearer ' + token },
    params: { isActive: true }
  });
  
  const accounts = accountsRes.data.data || [];
  
  // Find or create Fixed Asset account in 12xx range
  let fixedAssetAccount = accounts.find(acc => 
    acc.accountNo?.startsWith('12') && acc.accountType === 'Fixed Asset'
  );
  
  if (!fixedAssetAccount) {
    console.log('Creating Fixed Asset account in 12xx range...');
    try {
      const createRes = await axios.post(BASE + '/api/accounting/chart-of-accounts', {
        accountNo: '1200',
        accountName: 'Fixed Assets - Office Equipment',
        accountType: 'Fixed Asset',
        financialStatement: 'Balance Sheet',
        isActive: true
      }, {
        headers: { Authorization: 'Bearer ' + token }
      });
      fixedAssetAccount = createRes.data.data || createRes.data;
      console.log(`✅ Created: ${fixedAssetAccount.accountNo} - ${fixedAssetAccount.accountName}`);
    } catch (e) {
      console.log(`⚠️  Could not create: ${e.response?.data?.message || e.message}`);
      fixedAssetAccount = accounts.find(acc => acc.accountType === 'Fixed Asset');
      if (!fixedAssetAccount) {
        console.log('❌ No Fixed Asset account available');
        return;
      }
    }
  } else {
    console.log(`✅ Using: ${fixedAssetAccount.accountNo} - ${fixedAssetAccount.accountName}`);
  }

  // Get Accounts Payable account
  const apAccount = accounts.find(acc => 
    acc.accountName?.toLowerCase().includes('accounts payable') ||
    acc.accountName?.toLowerCase().includes('creditors control') ||
    (acc.accountNo?.startsWith('20') && acc.accountType === 'Current Liability')
  );
  
  if (!apAccount) {
    console.log('❌ Accounts Payable account not found');
    return;
  }
  console.log(`✅ Accounts Payable: ${apAccount.accountNo} - ${apAccount.accountName}\n`);

  // Get vendor
  const vendorsRes = await axios.get(BASE + '/api/accounting/vendors', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const vendor = (vendorsRes.data.data || [])[0];

  // Get currency
  const currenciesRes = await axios.get(BASE + '/api/accounting/currencies', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const currency = (currenciesRes.data.data || []).find(c => c.code === 'USD') || (currenciesRes.data.data || [])[0];

  // Create Creditor Bill
  console.log('Creating Creditor Bill...');
  const invoiceRes = await axios.post(BASE + '/api/procurement/invoices', {
    vendorId: vendor.id,
    invoiceDate: new Date().toISOString(),
    currencyId: currency.id,
    items: [{ itemName: 'Computer', quantity: 1, unitPrice: 1500.00, unit: 'unit' }]
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const invoiceId = invoiceRes.data.data?.id;
  console.log(`✅ Creditor Bill created: ${invoiceId}\n`);

  // Create Asset linked to bill
  console.log('Creating Asset linked to Creditor Bill...');
  const assetRes = await axios.post(BASE + '/api/accounting/assets', {
    assetName: 'Computer',
    assetCode: `TEST-${Date.now()}`,
    purchaseDate: new Date().toISOString(),
    cost: 1500.00,
    usefulLifeYears: 5,
    depreciationMethod: 'STRAIGHT_LINE',
    assetAccountId: fixedAssetAccount.id,
    accumulatedDepreciationAccountId: fixedAssetAccount.id, // Simplified for test
    depreciationExpenseAccountId: fixedAssetAccount.id, // Simplified for test
    invoiceId: invoiceId
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });
  
  const asset = assetRes.data.data;
  console.log(`✅ Asset created: ${asset.assetName} (${asset.assetCode})\n`);

  // Verify Journal Entry
  console.log('Verifying Journal Entry...');
  const jeRes = await axios.get(BASE + '/api/accounting/journal-entries', {
    headers: { Authorization: 'Bearer ' + token },
    params: { limit: 20, status: 'POSTED' }
  });

  const allJE = jeRes.data.data || [];
  const assetJE = allJE.find(je => je.referenceNumber?.includes(asset.assetCode));

  if (assetJE) {
    const jeDetailsRes = await axios.get(BASE + '/api/accounting/journal-entries/' + assetJE.id, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    const jeDetails = jeDetailsRes.data.data?.journalEntry || jeDetailsRes.data.data;
    const lines = jeDetails?.journalEntryLines || [];

    console.log(`Journal Entry: ${jeDetails.referenceNumber}`);
    console.log(`Description: ${jeDetails.description}\n`);

    let drFixedAsset = null;
    let crAccountsPayable = null;
    let totalDebit = 0;
    let totalCredit = 0;

    lines.forEach(line => {
      const accountNo = line.chartOfAccount?.accountNo || 'N/A';
      const accountName = line.chartOfAccount?.accountName || 'N/A';
      const accountType = line.chartOfAccount?.accountType || 'N/A';
      const debit = parseFloat(line.debitAmount || 0);
      const credit = parseFloat(line.creditAmount || 0);
      
      totalDebit += debit;
      totalCredit += credit;

      if (debit > 0 && (accountNo.startsWith('12') || accountType === 'Fixed Asset')) {
        drFixedAsset = { accountNo, accountName, amount: debit };
        console.log(`✅ DR Fixed Asset (${accountNo}): $${debit.toFixed(2)}`);
      }
      
      if (credit > 0 && (accountNo.startsWith('20') || accountName.toLowerCase().includes('accounts payable') || accountName.toLowerCase().includes('creditor'))) {
        crAccountsPayable = { accountNo, accountName, amount: credit };
        console.log(`✅ CR Accounts Payable/Creditors (${accountNo}): $${credit.toFixed(2)}`);
      }
    });

    console.log(`\nTotal Debit: $${totalDebit.toFixed(2)}`);
    console.log(`Total Credit: $${totalCredit.toFixed(2)}`);
    console.log(`Balanced: ${Math.abs(totalDebit - totalCredit) < 0.01 ? '✅' : '❌'}\n`);

    // Final verification
    if (drFixedAsset && crAccountsPayable && Math.abs(totalDebit - totalCredit) < 0.01) {
      console.log('✅✅✅ UAT REQUIREMENTS MET ✅✅✅');
      console.log(`   ✅ DR Fixed Asset Account (${drFixedAsset.accountNo}): $${drFixedAsset.amount.toFixed(2)}`);
      console.log(`   ✅ CR Creditors Control/Bank Account (${crAccountsPayable.accountNo}): $${crAccountsPayable.amount.toFixed(2)}`);
      console.log(`   ✅ Journal entry is balanced\n`);
    } else {
      console.log('❌ UAT REQUIREMENTS NOT MET');
      if (!drFixedAsset) console.log('   ❌ Missing DR Fixed Asset Account');
      if (!crAccountsPayable) console.log('   ❌ Missing CR Accounts Payable/Creditors Control');
      if (Math.abs(totalDebit - totalCredit) >= 0.01) console.log('   ❌ Journal entry not balanced\n');
    }
  } else {
    console.log('❌ Asset acquisition journal entry not found\n');
  }
}

test().catch(e => {
  console.error('\n❌ Test Error:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Data:', JSON.stringify(e.response.data, null, 2));
  }
  process.exit(1);
});



