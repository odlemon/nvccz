// Complete script to login and check journal entries for transfers
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000'; // Adjust if your server runs on different port

// Login credentials - UPDATE THESE
const LOGIN_CREDENTIALS = {
  email: "admin@nvccz.co.zw", // Update with your email
  password: "your_password_here" // Update with your password
};

let authToken = null;

async function login() {
  console.log('🔐 Logging in...');
  
  try {
    const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, LOGIN_CREDENTIALS, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (loginResponse.data.success) {
      authToken = loginResponse.data.data.token;
      console.log('✅ Login successful!');
      console.log(`👤 User: ${loginResponse.data.data.user.firstName} ${loginResponse.data.data.user.lastName}`);
      console.log(`📧 Email: ${loginResponse.data.data.user.email}`);
      return true;
    } else {
      console.error('❌ Login failed:', loginResponse.data.message);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Login error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    }
    return false;
  }
}

async function checkJournalEntries() {
  console.log('\n🔍 Checking journal entries for transfers...\n');
  
  try {
    // Method 1: Check journal entries API
    console.log('📊 Method 1: Checking journal entries API...');
    const journalResponse = await axios.get(`${API_BASE_URL}/api/journal-entries`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (journalResponse.data.success) {
      const entries = journalResponse.data.data?.journalEntries || journalResponse.data.data || [];
      console.log(`✅ Found ${entries.length} total journal entries`);
      
      // Look for transfer-related entries
      const transferEntries = entries.filter(entry => 
        entry.referenceNumber?.includes('TR-') || 
        entry.description?.includes('Transfer')
      );
      
      console.log(`🔄 Found ${transferEntries.length} transfer-related journal entries:`);
      transferEntries.forEach((entry, i) => {
        console.log(`   ${i+1}. ${entry.referenceNumber} - ${entry.description} - $${entry.totalAmount}`);
        console.log(`      Date: ${entry.transactionDate} Status: ${entry.status}`);
      });
      
      if (transferEntries.length === 0) {
        console.log('⚠️ No transfer journal entries found!');
        console.log('   This suggests journal entries are not being created for transfers.');
      } else {
        console.log('✅ Transfer journal entries are being created correctly!');
      }
      
    } else {
      console.log('❌ Failed to fetch journal entries:', journalResponse.data.message);
    }
    
    // Method 2: Check cashbook entries for transfers
    console.log('\n📊 Method 2: Checking cashbook entries...');
    const cashbookResponse = await axios.get(`${API_BASE_URL}/api/cashbook/entries`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (cashbookResponse.data.success) {
      const entries = cashbookResponse.data.data || [];
      console.log(`✅ Found ${entries.length} total cashbook entries`);
      
      // Look for transfer-related entries
      const transferEntries = entries.filter(entry => 
        entry.description?.includes('TRANSFER') || 
        entry.reference?.includes('TR-')
      );
      
      console.log(`🔄 Found ${transferEntries.length} transfer-related cashbook entries:`);
      transferEntries.forEach((entry, i) => {
        console.log(`   ${i+1}. ${entry.reference} - ${entry.description} - $${entry.amount} (${entry.type})`);
        console.log(`      Bank: ${entry.bank?.name} Journal ID: ${entry.journalEntryId || 'None'}`);
      });
      
      // Check if these entries have journal entry IDs
      const entriesWithJournalIds = transferEntries.filter(entry => entry.journalEntryId);
      console.log(`📝 ${entriesWithJournalIds.length}/${transferEntries.length} transfer entries have journal entry IDs`);
      
      if (entriesWithJournalIds.length < transferEntries.length) {
        console.log('⚠️ Some transfer entries are missing journal entry IDs!');
      }
      
    } else {
      console.log('❌ Failed to fetch cashbook entries:', cashbookResponse.data.message);
    }
    
    // Method 3: Check transfers directly
    console.log('\n📊 Method 3: Checking transfers...');
    const transferResponse = await axios.get(`${API_BASE_URL}/api/cashbook/transfers`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (transferResponse.data.success) {
      const transfers = transferResponse.data.data?.transfers || transferResponse.data.data || [];
      console.log(`✅ Found ${transfers.length} transfers`);
      
      console.log('\n📋 Transfer Details:');
      transfers.forEach((transfer, i) => {
        console.log(`   ${i+1}. Transfer ID: ${transfer.id}`);
        console.log(`      Reference: ${transfer.reference}`);
        console.log(`      Description: ${transfer.description}`);
        console.log(`      Amount: $${transfer.amount}`);
        console.log(`      From: ${transfer.fromBank?.name} (${transfer.fromBank?.accountNumber})`);
        console.log(`      To: ${transfer.toBank?.name} (${transfer.toBank?.accountNumber})`);
        console.log(`      Date: ${transfer.transferDate}`);
        console.log(`      Status: ${transfer.status}`);
        console.log(`      Created: ${transfer.createdAt}`);
        console.log('');
      });
      
    } else {
      console.log('❌ Failed to fetch transfers:', transferResponse.data.message);
    }
    
    // Summary
    console.log('📋 FINAL SUMMARY:');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ If you see journal entries with TR-OUT- and TR-IN- references:');
    console.log('   → Journal entries are being created correctly');
    console.log('   → Double-entry accounting is working');
    console.log('');
    console.log('❌ If you see transfers but no journal entries:');
    console.log('   → Journal entry creation is failing');
    console.log('   → Need to debug the CashbookTransferService');
    console.log('');
    console.log('🔍 If you see cashbook entries but no journal entry IDs:');
    console.log('   → Journal entries are not being linked properly');
    console.log('════════════════════════════════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ Error checking journal entries:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    }
  }
}

async function main() {
  console.log('🚀 Starting Journal Entries Check for Transfers');
  console.log('════════════════════════════════════════════════════════════════');
  
  // Step 1: Login
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('\n❌ Cannot proceed without authentication. Please check your credentials.');
    console.log('📝 Update LOGIN_CREDENTIALS in the script with your email and password.');
    return;
  }
  
  // Step 2: Check journal entries
  await checkJournalEntries();
  
  console.log('\n🎉 Check complete!');
}

// Instructions
console.log('📋 INSTRUCTIONS:');
console.log('1. Update LOGIN_CREDENTIALS with your email and password');
console.log('2. Make sure your server is running on port 3000');
console.log('3. Run: node login-and-check-journal-entries.js');
console.log('');

// Run the main function
main();
