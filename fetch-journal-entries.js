// Script to fetch journal entries for transfers
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000'; // Adjust if your server runs on different port

// You'll need to replace this with a valid JWT token
const authToken = "YOUR_JWT_TOKEN_HERE";

async function fetchJournalEntries() {
  console.log('📊 Fetching journal entries to verify transfer accounting...\n');
  
  try {
    // Fetch all journal entries
    console.log('📥 Fetching all journal entries...');
    const journalResponse = await axios.get(`${API_BASE_URL}/api/journal-entries`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      params: {
        page: 1,
        limit: 100 // Get more entries to find transfer-related ones
      }
    });
    
    if (journalResponse.data.success) {
      const journalEntries = journalResponse.data.data.journalEntries || journalResponse.data.data;
      
      console.log(`✅ Found ${journalEntries.length} journal entries\n`);
      
      // Filter for transfer-related journal entries
      const transferEntries = journalEntries.filter(entry => 
        entry.referenceNumber && (
          entry.referenceNumber.includes('TR-OUT-') || 
          entry.referenceNumber.includes('TR-IN-') ||
          entry.description.includes('Transfer')
        )
      );
      
      console.log(`🔄 Found ${transferEntries.length} transfer-related journal entries:\n`);
      
      transferEntries.forEach((entry, index) => {
        console.log(`📝 Journal Entry ${index + 1}:`);
        console.log(`   ID: ${entry.id}`);
        console.log(`   Reference: ${entry.referenceNumber}`);
        console.log(`   Description: ${entry.description}`);
        console.log(`   Date: ${entry.transactionDate}`);
        console.log(`   Amount: $${entry.totalAmount}`);
        console.log(`   Status: ${entry.status}`);
        console.log(`   Created: ${entry.createdAt}`);
        console.log('');
      });
      
      // Now fetch journal entry lines for transfer entries
      if (transferEntries.length > 0) {
        console.log('📋 Fetching journal entry lines for transfer entries...\n');
        
        for (const entry of transferEntries.slice(0, 2)) { // Check first 2 entries
          try {
            const linesResponse = await axios.get(`${API_BASE_URL}/api/journal-entries/${entry.id}/lines`, {
              headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (linesResponse.data.success) {
              const lines = linesResponse.data.data;
              console.log(`📊 Journal Entry Lines for ${entry.referenceNumber}:`);
              
              lines.forEach((line, lineIndex) => {
                console.log(`   Line ${lineIndex + 1}:`);
                console.log(`     Account: ${line.chartOfAccount?.accountNo || 'N/A'} - ${line.chartOfAccount?.accountName || 'N/A'}`);
                console.log(`     Debit: $${line.debitAmount}`);
                console.log(`     Credit: $${line.creditAmount}`);
                console.log(`     Description: ${line.description}`);
                console.log('');
              });
            }
          } catch (lineError) {
            console.log(`⚠️ Could not fetch lines for entry ${entry.id}: ${lineError.message}`);
          }
        }
      }
      
      // Summary
      console.log('📈 SUMMARY:');
      console.log(`   Total Journal Entries: ${journalEntries.length}`);
      console.log(`   Transfer-Related Entries: ${transferEntries.length}`);
      console.log(`   Transfer Entries with TR-OUT: ${transferEntries.filter(e => e.referenceNumber?.includes('TR-OUT-')).length}`);
      console.log(`   Transfer Entries with TR-IN: ${transferEntries.filter(e => e.referenceNumber?.includes('TR-IN-')).length}`);
      
    } else {
      console.error('❌ Failed to fetch journal entries:', journalResponse.data.message);
    }
    
  } catch (error) {
    console.error('❌ Error fetching journal entries:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Instructions for running the test
console.log('📋 INSTRUCTIONS:');
console.log('1. Make sure your server is running');
console.log('2. Replace "YOUR_JWT_TOKEN_HERE" with a valid JWT token');
console.log('3. Run: node fetch-journal-entries.js\n');

// Run the test
fetchJournalEntries();
