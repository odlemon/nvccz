// Quick test to check if journal entries exist for transfers
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000';
const authToken = "YOUR_JWT_TOKEN_HERE"; // Replace with your token

async function quickJournalCheck() {
  console.log('🔍 Quick check for transfer journal entries...\n');
  
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
      console.log(`✅ Found ${entries.length} journal entries`);
      
      // Look for transfer-related entries
      const transferEntries = entries.filter(entry => 
        entry.referenceNumber?.includes('TR-') || 
        entry.description?.includes('Transfer')
      );
      
      console.log(`🔄 Found ${transferEntries.length} transfer-related journal entries:`);
      transferEntries.forEach((entry, i) => {
        console.log(`   ${i+1}. ${entry.referenceNumber} - ${entry.description} - $${entry.totalAmount}`);
      });
      
      if (transferEntries.length === 0) {
        console.log('⚠️ No transfer journal entries found!');
        console.log('   This suggests journal entries are not being created for transfers.');
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
      console.log(`✅ Found ${entries.length} cashbook entries`);
      
      // Look for transfer-related entries
      const transferEntries = entries.filter(entry => 
        entry.description?.includes('TRANSFER') || 
        entry.reference?.includes('TR-')
      );
      
      console.log(`🔄 Found ${transferEntries.length} transfer-related cashbook entries:`);
      transferEntries.forEach((entry, i) => {
        console.log(`   ${i+1}. ${entry.reference} - ${entry.description} - $${entry.amount} (${entry.type})`);
      });
      
      // Check if these entries have journal entry IDs
      const entriesWithJournalIds = transferEntries.filter(entry => entry.journalEntryId);
      console.log(`📝 ${entriesWithJournalIds.length}/${transferEntries.length} transfer entries have journal entry IDs`);
      
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
      
      transfers.forEach((transfer, i) => {
        console.log(`   ${i+1}. ${transfer.reference} - ${transfer.description} - $${transfer.amount}`);
        console.log(`      From: ${transfer.fromBank?.name} To: ${transfer.toBank?.name}`);
        console.log(`      Status: ${transfer.status} Created: ${transfer.createdAt}`);
      });
      
    } else {
      console.log('❌ Failed to fetch transfers:', transferResponse.data.message);
    }
    
    console.log('\n📋 SUMMARY:');
    console.log('If you see transfer entries but no journal entries, the journal entry creation might be failing.');
    console.log('If you see journal entries with TR-OUT- and TR-IN- references, the system is working correctly.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    }
  }
}

// Run the check
quickJournalCheck();
