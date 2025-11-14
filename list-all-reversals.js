const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function listAllReversals() {
  let token = '';

  console.log('🔐 Step 1: Logging in...');
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

  // Option 1: Get ALL reversals (no ID needed)
  console.log('📋 Option 1: Getting ALL reversals (no ID needed)...');
  console.log('   Endpoint: GET /api/cashbook/reversals\n');
  try {
    const allReversalsRes = await axios.get(
      `${BASE_URL}/api/cashbook/reversals?page=1&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const reversals = allReversalsRes.data.data?.reversals || [];
    const pagination = allReversalsRes.data.data?.pagination || {};

    console.log(`✅ Found ${pagination.total || reversals.length} total reversal(s)`);
    console.log(`   Page: ${pagination.page || 1} of ${pagination.pages || 1}\n`);

    if (reversals.length === 0) {
      console.log('   No reversals found in the system.\n');
    } else {
      console.log('📝 Reversal Examples:\n');
      reversals.forEach((rev, index) => {
        console.log(`   ${index + 1}. Reversal Entry:`);
        console.log(`      ID: ${rev.id}`);
        console.log(`      Description: ${rev.description}`);
        console.log(`      Type: ${rev.type} (opposite of original)`);
        console.log(`      Amount: ${parseFloat(rev.amount).toFixed(2)}`);
        console.log(`      Date: ${rev.transactionDate}`);
        console.log(`      Reference: ${rev.reference || 'N/A'}`);
        console.log(`      Reason: ${rev.reversalReason || 'N/A'}`);
        console.log(`      Original Transaction ID: ${rev.originalTransactionId}`);
        
        if (rev.originalTransaction) {
          console.log(`      Original Description: ${rev.originalTransaction.description}`);
          console.log(`      Original Type: ${rev.originalTransaction.type}`);
          console.log(`      Original Amount: ${parseFloat(rev.originalTransaction.amount).toFixed(2)}`);
        }
        
        if (rev.bank) {
          console.log(`      Bank: ${rev.bank.name}`);
        }
        if (rev.customer) {
          console.log(`      Customer: ${rev.customer.name}`);
        }
        if (rev.vendor) {
          console.log(`      Vendor: ${rev.vendor.name}`);
        }
        console.log('');
      });
    }
  } catch (error) {
    console.error('❌ Error getting all reversals:', error.response?.data || error.message);
  }

  // Option 2: Get reversals for a specific transaction (requires ID)
  console.log('📋 Option 2: Getting reversals for a SPECIFIC transaction (requires ID)...');
  console.log('   Endpoint: GET /api/cashbook/transactions/:transactionId/reversal-history\n');
  
  // First, get a transaction that has been reversed
  try {
    const entriesRes = await axios.get(
      `${BASE_URL}/api/cashbook/entries?status=POSTED&limit=10&includeReversals=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    const entries = entriesRes.data.data.entries || entriesRes.data.data || [];
    const reversedEntry = entries.find(e => e.reversedAt);
    
    if (reversedEntry) {
      console.log(`   Found a reversed transaction: ${reversedEntry.id}`);
      console.log(`   Description: ${reversedEntry.description}\n`);
      
      const reversalHistoryRes = await axios.get(
        `${BASE_URL}/api/cashbook/transactions/${reversedEntry.id}/reversal-history`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      const history = reversalHistoryRes.data.data || [];
      console.log(`   ✅ Found ${history.length} reversal(s) for this transaction:\n`);
      
      history.forEach((rev, index) => {
        console.log(`   ${index + 1}. Reversal:`);
        console.log(`      ID: ${rev.id}`);
        console.log(`      Description: ${rev.description}`);
        console.log(`      Type: ${rev.type}`);
        console.log(`      Amount: ${parseFloat(rev.amount).toFixed(2)}`);
        console.log(`      Date: ${rev.transactionDate}`);
        console.log(`      Reason: ${rev.reversalReason || 'N/A'}`);
        console.log('');
      });
    } else {
      console.log('   No reversed transactions found to show example.\n');
    }
  } catch (error) {
    console.error('❌ Error getting reversal history:', error.response?.data || error.message);
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📚 API Endpoints Summary:');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('1. Get ALL reversals (no ID needed):');
  console.log('   GET /api/cashbook/reversals?page=1&limit=50');
  console.log('   Query params: page, limit');
  console.log('   Returns: All reversals created by the logged-in user');
  console.log('');
  console.log('2. Get reversals for a SPECIFIC transaction (ID required):');
  console.log('   GET /api/cashbook/transactions/:transactionId/reversal-history');
  console.log('   Path param: transactionId (the original transaction ID)');
  console.log('   Returns: All reversals for that specific transaction');
  console.log('');
  console.log('3. Check if a transaction CAN be reversed:');
  console.log('   GET /api/cashbook/transactions/:transactionId/can-reverse');
  console.log('   Returns: { canReverse: boolean, reason: string }');
  console.log('');
  console.log('4. Reverse a transaction:');
  console.log('   POST /api/cashbook/transactions/:transactionId/reverse');
  console.log('   Body: { reason: string, description?: string, reverseDate?: date }');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════\n');
}

listAllReversals().catch(console.error);

