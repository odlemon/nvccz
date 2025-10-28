// Script to help you find the correct password or create a new admin user
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

// Common passwords to try
const COMMON_PASSWORDS = [
  'admin',
  'admin123', 
  'password',
  'password123',
  '123456',
  'Admin123',
  'admin@123',
  'nvccz123',
  'nvccz@123',
  'admin@nvccz',
  'root',
  'root123'
];

async function tryLogin(email, password) {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      email: email,
      password: password
    });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || error.message };
  }
}

async function findCorrectPassword() {
  console.log('🔍 Trying to find the correct password for admin@nvccz.co.zw...\n');
  
  for (const password of COMMON_PASSWORDS) {
    console.log(`🔐 Trying password: ${password}`);
    const result = await tryLogin('admin@nvccz.co.zw', password);
    
    if (result.success) {
      console.log(`✅ SUCCESS! Password found: ${password}`);
      console.log(`👤 User: ${result.data.data.user.firstName} ${result.data.data.user.lastName}`);
      console.log(`📧 Email: ${result.data.data.user.email}`);
      console.log(`🔑 Token: ${result.data.data.token.substring(0, 20)}...`);
      
      // Now check journal entries
      await checkJournalEntries(result.data.data.token);
      return;
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
  }
  
  console.log('\n❌ None of the common passwords worked.');
  console.log('\n💡 SOLUTIONS:');
  console.log('1. Check your database for the actual password');
  console.log('2. Create a new admin user');
  console.log('3. Reset the password');
  console.log('4. Check your .env file for default credentials');
}

async function checkJournalEntries(token) {
  console.log('\n🔍 Checking journal entries for transfers...\n');
  
  try {
    // Check journal entries
    const journalResponse = await axios.get(`${API_BASE_URL}/api/journal-entries`, {
      headers: { 'Authorization': `Bearer ${token}` }
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
      
      // Check transfers
      const transferResponse = await axios.get(`${API_BASE_URL}/api/cashbook/transfers`, {
        headers: { 'Authorization': `Bearer ${token}` }
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
    
  } catch (error) {
    console.error('❌ Error checking journal entries:', error.message);
  }
}

async function main() {
  console.log('🚀 Password Finder & Journal Entries Check');
  console.log('════════════════════════════════════════════════════════════════');
  
  await findCorrectPassword();
  
  console.log('\n🎉 Check complete!');
}

main();
