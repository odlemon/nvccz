// Script to create a new admin user and check journal entries
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';

async function createAdminUser() {
  console.log('👤 Creating a new admin user...\n');
  
  try {
    const userData = {
      firstName: 'Test',
      lastName: 'Admin',
      email: 'testadmin@nvccz.co.zw',
      password: 'test123',
      roleId: 'admin' // You might need to adjust this based on your role system
    };
    
    const response = await axios.post(`${API_BASE_URL}/api/auth/register`, userData);
    
    if (response.data.success) {
      console.log('✅ Admin user created successfully!');
      console.log(`📧 Email: ${userData.email}`);
      console.log(`🔑 Password: ${userData.password}`);
      
      // Now try to login with the new user
      await loginAndCheck(userData.email, userData.password);
    } else {
      console.log('❌ Failed to create admin user:', response.data.message);
    }
    
  } catch (error) {
    console.log('❌ Error creating admin user:', error.response?.data?.message || error.message);
    console.log('\n💡 The registration endpoint might not exist or have different requirements.');
    console.log('   Let\'s try a different approach...');
  }
}

async function loginAndCheck(email, password) {
  console.log(`\n🔐 Logging in with ${email}...`);
  
  try {
    const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      email: email,
      password: password
    });
    
    if (loginResponse.data.success) {
      const token = loginResponse.data.data.token;
      console.log('✅ Login successful!');
      
      // Now check journal entries
      await checkJournalEntries(token);
    } else {
      console.log('❌ Login failed:', loginResponse.data.message);
    }
    
  } catch (error) {
    console.log('❌ Login error:', error.response?.data?.message || error.message);
  }
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
          console.log('\n🔧 SOLUTION:');
          console.log('   The issue is in the CashbookTransferService.createTransferJournalEntries() method.');
          console.log('   The journal entry creation is failing silently.');
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
  console.log('🚀 Create Admin User & Check Journal Entries');
  console.log('════════════════════════════════════════════════════════════════');
  
  await createAdminUser();
  
  console.log('\n🎉 Check complete!');
}

main();
