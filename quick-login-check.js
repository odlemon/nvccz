// Simple script using the admin credentials from your transfer data
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

// Using the admin credentials from your transfer data
const LOGIN_CREDENTIALS = {
  email: "admin@nvccz.co.zw",
  password: "admin123" // Common default password - update if different
};

let authToken = null;

async function loginAndCheck() {
  console.log('🔐 Logging in as admin@nvccz.co.zw...');
  
  try {
    // Login
    const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, LOGIN_CREDENTIALS);
    
    if (loginResponse.data.success) {
      authToken = loginResponse.data.data.token;
      console.log('✅ Login successful!');
      console.log(`👤 User: ${loginResponse.data.data.user.firstName} ${loginResponse.data.data.user.lastName}`);
      
      // Now check journal entries
      console.log('\n🔍 Checking journal entries...');
      
      const journalResponse = await axios.get(`${API_BASE_URL}/api/journal-entries`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (journalResponse.data.success) {
        const entries = journalResponse.data.data?.journalEntries || journalResponse.data.data || [];
        console.log(`📊 Found ${entries.length} total journal entries`);
        
        // Look for transfer entries
        const transferEntries = entries.filter(entry => 
          entry.referenceNumber?.includes('TR-') || 
          entry.description?.includes('Transfer')
        );
        
        console.log(`🔄 Transfer-related journal entries: ${transferEntries.length}`);
        
        if (transferEntries.length > 0) {
          console.log('\n✅ JOURNAL ENTRIES FOUND FOR TRANSFERS:');
          transferEntries.forEach((entry, i) => {
            console.log(`   ${i+1}. ${entry.referenceNumber}`);
            console.log(`      ${entry.description}`);
            console.log(`      Amount: $${entry.totalAmount} | Status: ${entry.status}`);
            console.log(`      Date: ${entry.transactionDate}`);
            console.log('');
          });
        } else {
          console.log('\n❌ NO JOURNAL ENTRIES FOUND FOR TRANSFERS!');
          console.log('   This means the journal entry creation is not working.');
        }
        
        // Also check transfers
        console.log('🔍 Checking transfers...');
        const transferResponse = await axios.get(`${API_BASE_URL}/api/cashbook/transfers`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (transferResponse.data.success) {
          const transfers = transferResponse.data.data?.transfers || transferResponse.data.data || [];
          console.log(`📊 Found ${transfers.length} transfers`);
          
          if (transfers.length > 0 && transferEntries.length === 0) {
            console.log('\n🚨 PROBLEM IDENTIFIED:');
            console.log(`   - ${transfers.length} transfers exist`);
            console.log(`   - ${transferEntries.length} journal entries for transfers`);
            console.log('   - Journal entries are NOT being created for transfers!');
          } else if (transfers.length > 0 && transferEntries.length > 0) {
            console.log('\n✅ SYSTEM WORKING CORRECTLY:');
            console.log(`   - ${transfers.length} transfers exist`);
            console.log(`   - ${transferEntries.length} journal entries for transfers`);
            console.log('   - Journal entries are being created properly!');
          }
        }
        
      } else {
        console.log('❌ Failed to fetch journal entries:', journalResponse.data.message);
      }
      
    } else {
      console.log('❌ Login failed:', loginResponse.data.message);
      console.log('💡 Try updating the password in the script');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.status === 401) {
      console.log('💡 Login failed - please check the password');
    }
  }
}

console.log('🚀 Quick Journal Entries Check');
console.log('════════════════════════════════════════════════════════════════');
console.log('📝 Using admin@nvccz.co.zw credentials');
console.log('💡 If login fails, update the password in the script');
console.log('');

loginAndCheck();
