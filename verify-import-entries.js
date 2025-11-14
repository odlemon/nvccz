const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function verifyImport() {
  try {
    console.log('🔐 Logging in...');
    
    // Login
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    const headers = { 'Authorization': `Bearer ${token}` };
    
    console.log('✅ Login successful\n');
    
    // Get the batch
    console.log('📊 Getting batch details...');
    const batchId = 'cmhy3i1gr0001una07gg97kb6'; // From previous test
    
    try {
      const batchResponse = await axios.get(`${BASE_URL}/api/cashbook/batches/${batchId}`, { headers });
      
      console.log('✅ Batch retrieved successfully');
      console.log('\nBatch Details:');
      console.log(JSON.stringify(batchResponse.data, null, 2));
      
      if (batchResponse.data.data && batchResponse.data.data.transactions) {
        const transactions = batchResponse.data.data.transactions;
        console.log(`\n📝 Found ${transactions.length} transactions:`);
        
        transactions.forEach((tx, index) => {
          console.log(`\n${index + 1}. ${tx.description}`);
          console.log(`   Type: ${tx.type}`);
          console.log(`   Amount: ${tx.amount}`);
          console.log(`   Bank: ${tx.bank?.name || 'N/A'}`);
          console.log(`   Counterparty: ${tx.counterpartyType}`);
          if (tx.customer) {
            console.log(`   Customer: ${tx.customer.name}`);
          }
          if (tx.vendor) {
            console.log(`   Vendor: ${tx.vendor.name}`);
          }
          if (tx.glAccount) {
            console.log(`   GL Account: ${tx.glAccount.accountNo} - ${tx.glAccount.accountName}`);
          }
          console.log(`   Status: ${tx.status}`);
        });
      }
    } catch (error) {
      console.error('❌ Failed to get batch:', error.response?.data || error.message);
    }
    
    // List all batches
    console.log('\n📋 Listing all batches...');
    try {
      const batchesResponse = await axios.get(`${BASE_URL}/api/cashbook/batches?page=1&limit=10`, { headers });
      
      if (batchesResponse.data.data && batchesResponse.data.data.batches) {
        const batches = batchesResponse.data.data.batches;
        console.log(`\n✅ Found ${batches.length} batches:`);
        
        batches.forEach((batch, index) => {
          console.log(`\n${index + 1}. ${batch.name}`);
          console.log(`   ID: ${batch.id}`);
          console.log(`   Status: ${batch.status}`);
          console.log(`   Total Amount: ${batch.totalAmount}`);
          console.log(`   Created: ${batch.createdAt}`);
        });
      }
    } catch (error) {
      console.error('❌ Failed to list batches:', error.response?.data || error.message);
    }
    
    console.log('\n✅ Verification complete!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

verifyImport();

