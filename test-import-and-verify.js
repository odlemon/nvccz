const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3000';

async function testImportAndVerify() {
  try {
    console.log('🔐 Step 1: Logging in...');
    
    // Login
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    const headers = { 'Authorization': `Bearer ${token}` };
    
    console.log('✅ Login successful\n');
    
    // Step 2: Test Import
    console.log('📤 Step 2: Testing CSV import...');
    const csvFile = 'sample-cashbook-transactions.csv';
    
    if (!fs.existsSync(csvFile)) {
      console.error(`❌ CSV file not found: ${csvFile}`);
      return;
    }
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(csvFile), {
      filename: csvFile,
      contentType: 'text/csv'
    });
    
    let batchId;
    try {
      const importResponse = await axios.post(
        `${BASE_URL}/api/cashbook/batches/import`,
        formData,
        {
          headers: {
            ...headers,
            ...formData.getHeaders()
          }
        }
      );
      
      console.log('✅ Import successful!');
      const result = importResponse.data.data;
      batchId = result.batchId;
      
      console.log(`\n📊 Import Summary:`);
      console.log(`   Batch ID: ${batchId}`);
      console.log(`   Total Transactions: ${result.totalTransactions}`);
      console.log(`   Valid Transactions: ${result.validTransactions}`);
      console.log(`   Invalid Transactions: ${result.invalidTransactions}`);
      
      if (result.errors && result.errors.length > 0) {
        console.log(`\n❌ Errors:`);
        result.errors.forEach(error => console.log(`   - ${error}`));
      }
      
    } catch (error) {
      console.error('❌ Import failed:', error.response?.data || error.message);
      return;
    }
    
    // Step 3: Get Batch Details
    console.log('\n📋 Step 3: Getting batch details...');
    try {
      const batchResponse = await axios.get(`${BASE_URL}/api/cashbook/batches/${batchId}`, { headers });
      const batch = batchResponse.data.data;
      
      console.log(`✅ Batch retrieved: ${batch.name}`);
      console.log(`   Status: ${batch.status}`);
      console.log(`   Total Amount: ${batch.totalAmount}`);
      console.log(`   Transactions: ${batch.transactions.length}`);
      
      // Step 4: Verify Cashbook Entries
      console.log('\n💰 Step 4: Verifying cashbook entries...');
      
      const cashbookEntries = batch.transactions;
      let totalAmount = 0;
      let receiptsCount = 0;
      let paymentsCount = 0;
      let receiptsTotal = 0;
      let paymentsTotal = 0;
      
      console.log(`\n📝 Found ${cashbookEntries.length} cashbook entries:\n`);
      
      cashbookEntries.forEach((entry, index) => {
        const amount = parseFloat(entry.amount);
        totalAmount += amount;
        
        if (entry.type === 'RECEIPT') {
          receiptsCount++;
          receiptsTotal += amount;
        } else {
          paymentsCount++;
          paymentsTotal += amount;
        }
        
        console.log(`${index + 1}. ${entry.description}`);
        console.log(`   Type: ${entry.type}`);
        console.log(`   Amount: ${amount.toFixed(2)}`);
        console.log(`   Bank: ${entry.bank.name}`);
        console.log(`   Counterparty: ${entry.counterpartyType}`);
        if (entry.customer) {
          console.log(`   Customer: ${entry.customer.name}`);
        }
        if (entry.vendor) {
          console.log(`   Vendor: ${entry.vendor.name}`);
        }
        if (entry.glAccount) {
          console.log(`   GL Account: ${entry.glAccount.accountNo} - ${entry.glAccount.accountName}`);
        }
        console.log(`   Status: ${entry.status}`);
        console.log(`   Journal Entry: ${entry.journalEntryId || 'Not posted yet'}`);
        console.log('');
      });
      
      console.log(`\n📊 Cashbook Summary:`);
      console.log(`   Total Entries: ${cashbookEntries.length}`);
      console.log(`   Receipts: ${receiptsCount} (Total: ${receiptsTotal.toFixed(2)})`);
      console.log(`   Payments: ${paymentsCount} (Total: ${paymentsTotal.toFixed(2)})`);
      console.log(`   Net Amount: ${(receiptsTotal - paymentsTotal).toFixed(2)}`);
      console.log(`   Batch Total: ${parseFloat(batch.totalAmount).toFixed(2)}`);
      
      // Step 5: Post Batch to create Journal Entries
      console.log('\n📤 Step 5: Posting batch to create journal entries...');
      try {
        const postResponse = await axios.post(
          `${BASE_URL}/api/cashbook/batches/${batchId}/post`,
          {},
          { headers }
        );
        
        console.log('✅ Batch posted successfully!');
        console.log(`   Journal Entries Created: ${postResponse.data.data?.journalEntries?.length || 0}`);
        
        // Step 6: Get Updated Batch with Journal Entries
        console.log('\n📋 Step 6: Getting updated batch with journal entries...');
        const updatedBatchResponse = await axios.get(`${BASE_URL}/api/cashbook/batches/${batchId}`, { headers });
        const updatedBatch = updatedBatchResponse.data.data;
        
        // Step 7: Verify Journal Entries
        console.log('\n📖 Step 7: Verifying journal entries...');
        
        const journalEntries = [];
        for (const entry of updatedBatch.transactions) {
          if (entry.journalEntryId) {
            try {
              const jeResponse = await axios.get(
                `${BASE_URL}/api/accounting/journal-entries/${entry.journalEntryId}`,
                { headers }
              );
              journalEntries.push(jeResponse.data.data);
            } catch (error) {
              console.error(`   ⚠️  Could not fetch journal entry ${entry.journalEntryId}:`, error.message);
            }
          }
        }
        
        console.log(`\n✅ Found ${journalEntries.length} journal entries:\n`);
        
        let totalDebits = 0;
        let totalCredits = 0;
        
        journalEntries.forEach((je, index) => {
          console.log(`${index + 1}. ${je.referenceNumber}`);
          console.log(`   Description: ${je.description}`);
          console.log(`   Date: ${je.transactionDate}`);
          console.log(`   Total Amount: ${parseFloat(je.totalAmount).toFixed(2)}`);
          console.log(`   Status: ${je.status}`);
          console.log(`   Lines: ${je.journalEntryLines.length}`);
          
          let jeDebits = 0;
          let jeCredits = 0;
          
          je.journalEntryLines.forEach((line, lineIndex) => {
            const debit = parseFloat(line.debitAmount || 0);
            const credit = parseFloat(line.creditAmount || 0);
            jeDebits += debit;
            jeCredits += credit;
            totalDebits += debit;
            totalCredits += credit;
            
            console.log(`   ${lineIndex + 1}. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
            if (debit > 0) {
              console.log(`      Debit: ${debit.toFixed(2)}`);
            }
            if (credit > 0) {
              console.log(`      Credit: ${credit.toFixed(2)}`);
            }
          });
          
          console.log(`   Total Debits: ${jeDebits.toFixed(2)}, Total Credits: ${jeCredits.toFixed(2)}`);
          console.log(`   Balanced: ${Math.abs(jeDebits - jeCredits) < 0.01 ? '✅' : '❌'}`);
          console.log('');
        });
        
        console.log(`\n📊 Journal Entry Summary:`);
        console.log(`   Total Journal Entries: ${journalEntries.length}`);
        console.log(`   Total Debits: ${totalDebits.toFixed(2)}`);
        console.log(`   Total Credits: ${totalCredits.toFixed(2)}`);
        console.log(`   Balanced: ${Math.abs(totalDebits - totalCredits) < 0.01 ? '✅' : '❌'}`);
        
        // Step 8: Verify Double-Entry Accounting
        console.log('\n✅ Step 8: Verifying double-entry accounting...');
        
        if (Math.abs(totalDebits - totalCredits) < 0.01) {
          console.log('✅ All journal entries are balanced (debits = credits)');
        } else {
          console.log(`❌ Journal entries are not balanced! Difference: ${Math.abs(totalDebits - totalCredits).toFixed(2)}`);
        }
        
        // Verify each transaction has a journal entry
        const entriesWithJE = updatedBatch.transactions.filter(e => e.journalEntryId);
        console.log(`\n📊 Entry Verification:`);
        console.log(`   Entries with Journal Entries: ${entriesWithJE.length}/${updatedBatch.transactions.length}`);
        
        if (entriesWithJE.length === updatedBatch.transactions.length) {
          console.log('✅ All entries have journal entries');
        } else {
          console.log('❌ Some entries are missing journal entries');
          updatedBatch.transactions
            .filter(e => !e.journalEntryId)
            .forEach(e => {
              console.log(`   - Missing JE: ${e.description} (${e.id})`);
            });
        }
        
      } catch (error) {
        console.error('❌ Failed to post batch:', error.response?.data || error.message);
        if (error.response?.data) {
          console.log('Error details:', JSON.stringify(error.response.data, null, 2));
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to get batch:', error.response?.data || error.message);
    }
    
    console.log('\n✅ Verification complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Run test
testImportAndVerify();

