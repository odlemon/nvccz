const axios = require('axios');

const BASE_URL = 'http://localhost:3004';
const TIMEOUT = 30000;

// Helper function to make API requests
async function apiRequest(method, endpoint, data = null, token = null) {
  const config = {
    method,
    url: `${BASE_URL}${endpoint}`,
    timeout: TIMEOUT,
    validateStatus: () => true,
    headers: {}
  };

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (data) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return response;
  } catch (error) {
    if (error.response) {
      return error.response;
    }
    throw error;
  }
}

async function test() {
  console.log('\n===============================================================');
  console.log('AUDIT LOG - VOIDING TRANSACTION LOG UAT TEST');
  console.log('===============================================================\n');

  try {
    // Step 1: Login
    console.log('Step 1: Logging in...');
    const loginResponse = await apiRequest('POST', '/api/auth/login', {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });

    if (loginResponse.status !== 200) {
      throw new Error(`Login failed: ${loginResponse.status} - ${JSON.stringify(loginResponse.data)}`);
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    console.log(`   User: ${loginResponse.data.user.firstName} ${loginResponse.data.user.lastName}`);
    console.log(`   Token: ${token.substring(0, 20)}...\n`);

    // Step 2: Create a manual journal entry to void
    console.log('Step 2: Creating a manual journal entry...');
    
    // First, get currency
    const currenciesResponse = await apiRequest('GET', '/api/accounting/currencies', null, token);
    let currencyId = null;
    if (currenciesResponse.status === 200 && currenciesResponse.data.data && currenciesResponse.data.data.length > 0) {
      currencyId = currenciesResponse.data.data[0].id;
    } else {
      throw new Error('No currency found');
    }

    // Get chart of accounts for journal entry lines
    const accountsResponse = await apiRequest('GET', '/api/accounting/chart-of-accounts?limit=5', null, token);
    let accounts = [];
    if (accountsResponse.status === 200 && accountsResponse.data.data) {
      accounts = accountsResponse.data.data;
    } else {
      throw new Error('No chart of accounts found');
    }

    if (accounts.length < 2) {
      throw new Error('Need at least 2 accounts for journal entry');
    }

    const journalEntryData = {
      transactionDate: new Date().toISOString(),
      referenceNumber: `JE-TEST-${Date.now()}`,
      description: 'Test Journal Entry for Void Audit Log',
      currencyId: currencyId,
      journalEntryLines: [
        {
          chartOfAccountId: accounts[0].id,
          debitAmount: 1000,
          creditAmount: 0,
          description: 'Test Debit Entry'
        },
        {
          chartOfAccountId: accounts[1].id,
          debitAmount: 0,
          creditAmount: 1000,
          description: 'Test Credit Entry'
        }
      ]
    };

    const createJEResponse = await apiRequest('POST', '/api/accounting/journal-entries', journalEntryData, token);
    
    if (createJEResponse.status !== 200 && createJEResponse.status !== 201) {
      throw new Error(`Failed to create journal entry: ${createJEResponse.status} - ${JSON.stringify(createJEResponse.data)}`);
    }

    const journalEntryId = createJEResponse.data.data.journalEntry.id;
    const journalEntryRef = createJEResponse.data.data.journalEntry.referenceNumber;
    console.log('✅ Journal Entry created:');
    console.log(`   ID: ${journalEntryId}`);
    console.log(`   Reference: ${journalEntryRef}`);
    console.log(`   Status: ${createJEResponse.data.data.journalEntry.status}\n`);

    // Step 3: Post the journal entry (if not already posted)
    if (createJEResponse.data.data.journalEntry.status === 'PENDING') {
      console.log('Step 3: Posting journal entry...');
      const postResponse = await apiRequest('PATCH', `/api/accounting/journal-entries/${journalEntryId}/post`, null, token);
      
      if (postResponse.status !== 200) {
        throw new Error(`Failed to post journal entry: ${postResponse.status} - ${JSON.stringify(postResponse.data)}`);
      }
      
      console.log('✅ Journal entry posted\n');
    } else {
      console.log('Step 3: Journal entry already posted\n');
    }

    // Step 4: Void the journal entry
    console.log('Step 4: Voiding journal entry...');
    const voidTimestamp = new Date();
    const voidResponse = await apiRequest('PATCH', `/api/accounting/journal-entries/${journalEntryId}/void`, null, token);
    
    if (voidResponse.status !== 200) {
      throw new Error(`Failed to void journal entry: ${voidResponse.status} - ${JSON.stringify(voidResponse.data)}`);
    }

    console.log('✅ Journal entry voided successfully');
    console.log(`   Status: ${voidResponse.data.data.status}`);
    if (voidResponse.data.data.reversalJournalEntry) {
      console.log(`   Reversal Journal Entry: ${voidResponse.data.data.reversalJournalEntry.referenceNumber}`);
    }
    console.log('');

    // Step 5: Retrieve audit log for the voided transaction
    console.log('Step 5: Retrieving audit log for voided transaction...');
    const auditLogResponse = await apiRequest('GET', `/api/audit-logs?entityType=JournalEntry&entityId=${journalEntryId}&action=VOID`, null, token);
    
    if (auditLogResponse.status !== 200) {
      throw new Error(`Failed to retrieve audit log: ${auditLogResponse.status} - ${JSON.stringify(auditLogResponse.data)}`);
    }

    const auditLogs = auditLogResponse.data.data || auditLogResponse.data.auditLogs || [];
    
    if (auditLogs.length === 0) {
      throw new Error('No audit log found for voided transaction');
    }

    // Find the most recent VOID audit log
    const voidAuditLog = auditLogs.find(log => log.action === 'VOID') || auditLogs[0];
    
    console.log('✅ Audit log retrieved:');
    console.log(`   Audit Log ID: ${voidAuditLog.id}`);
    console.log(`   Action: ${voidAuditLog.action}`);
    console.log(`   Entity Type: ${voidAuditLog.entityType}`);
    console.log(`   Entity ID: ${voidAuditLog.entityId}`);
    console.log(`   User ID: ${voidAuditLog.userId}`);
    console.log(`   Created At: ${voidAuditLog.createdAt}`);
    console.log('');

    // Step 6: Verify audit log contains all required fields
    console.log('Step 6: Verifying audit log contains all required fields...');
    console.log('===============================================================');
    console.log('UAT VERIFICATION');
    console.log('===============================================================\n');

    const verificationResults = {
      originalTransactionDetails: false,
      voidTimestamp: false,
      userId: false,
      reversingJournalEntryReference: false
    };

    // 1. Check for original transaction details
    if (voidAuditLog.oldValues && voidAuditLog.oldValues.journalEntry) {
      const originalJE = voidAuditLog.oldValues.journalEntry;
      if (originalJE.id && originalJE.referenceNumber && originalJE.description) {
        verificationResults.originalTransactionDetails = true;
        console.log('✅ PASS: Original transaction details found');
        console.log(`   - ID: ${originalJE.id}`);
        console.log(`   - Reference: ${originalJE.referenceNumber}`);
        console.log(`   - Description: ${originalJE.description}`);
        console.log(`   - Status: ${originalJE.status}`);
        console.log(`   - Transaction Date: ${originalJE.transactionDate}`);
        console.log(`   - Total Amount: ${originalJE.totalAmount}`);
        
        if (voidAuditLog.oldValues.journalEntryLines && voidAuditLog.oldValues.journalEntryLines.length > 0) {
          console.log(`   - Journal Entry Lines: ${voidAuditLog.oldValues.journalEntryLines.length} lines`);
        }
      } else {
        console.log('❌ FAIL: Original transaction details incomplete');
      }
    } else {
      console.log('❌ FAIL: Original transaction details not found in oldValues');
    }
    console.log('');

    // 2. Check for void timestamp
    if (voidAuditLog.newValues && voidAuditLog.newValues.voidDetails) {
      const voidDetails = voidAuditLog.newValues.voidDetails;
      if (voidDetails.voidedAt) {
        verificationResults.voidTimestamp = true;
        console.log('✅ PASS: Date/time of void found');
        console.log(`   - Voided At: ${voidDetails.voidedAt}`);
      } else {
        console.log('❌ FAIL: Void timestamp not found in voidDetails');
      }
    } else if (voidAuditLog.createdAt) {
      // Fallback: use createdAt as void timestamp
      verificationResults.voidTimestamp = true;
      console.log('✅ PASS: Date/time of void found (from createdAt)');
      console.log(`   - Created At: ${voidAuditLog.createdAt}`);
    } else {
      console.log('❌ FAIL: Void timestamp not found');
    }
    console.log('');

    // 3. Check for user ID who performed the void
    if (voidAuditLog.userId) {
      verificationResults.userId = true;
      console.log('✅ PASS: User ID who performed the void found');
      console.log(`   - User ID: ${voidAuditLog.userId}`);
      
      if (voidAuditLog.user) {
        console.log(`   - User Name: ${voidAuditLog.user.firstName} ${voidAuditLog.user.lastName}`);
        console.log(`   - User Email: ${voidAuditLog.user.email}`);
      }
    } else {
      console.log('❌ FAIL: User ID not found');
    }
    console.log('');

    // 4. Check for reference to Reversing Journal ID
    if (voidAuditLog.newValues && voidAuditLog.newValues.voidDetails) {
      const voidDetails = voidAuditLog.newValues.voidDetails;
      if (voidDetails.reversalJournalEntry) {
        const reversalJE = voidDetails.reversalJournalEntry;
        if (reversalJE.id && reversalJE.referenceNumber) {
          verificationResults.reversingJournalEntryReference = true;
          console.log('✅ PASS: Reference to Reversing Journal Entry found');
          console.log(`   - Reversal Journal Entry ID: ${reversalJE.id}`);
          console.log(`   - Reversal Journal Entry Reference: ${reversalJE.referenceNumber}`);
          console.log(`   - Description: ${reversalJE.description}`);
          console.log(`   - Transaction Date: ${reversalJE.transactionDate}`);
        } else {
          console.log('❌ FAIL: Reversing journal entry reference incomplete');
        }
      } else {
        console.log('⚠️  WARNING: No reversing journal entry found (may be expected if transaction was not posted)');
        console.log(`   - Original Status: ${voidAuditLog.oldValues?.journalEntry?.status || 'unknown'}`);
      }
    } else {
      console.log('❌ FAIL: Reversing journal entry reference not found in voidDetails');
    }
    console.log('');

    // Summary
    console.log('===============================================================');
    console.log('VERIFICATION SUMMARY');
    console.log('===============================================================');
    const allPassed = Object.values(verificationResults).every(v => v === true);
    
    console.log(`✅ Original Transaction Details: ${verificationResults.originalTransactionDetails ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Date/Time of Void: ${verificationResults.voidTimestamp ? 'PASS' : 'FAIL'}`);
    console.log(`✅ User ID Who Performed Void: ${verificationResults.userId ? 'PASS' : 'FAIL'}`);
    
    // Reversing journal entry is only required if transaction was posted
    const wasPosted = voidAuditLog.oldValues?.journalEntry?.status === 'POSTED';
    if (wasPosted) {
      console.log(`✅ Reversing Journal Entry Reference: ${verificationResults.reversingJournalEntryReference ? 'PASS' : 'FAIL'}`);
    } else {
      console.log(`⚠️  Reversing Journal Entry Reference: N/A (transaction was not posted)`);
    }
    console.log('');

    if (allPassed || (!wasPosted && verificationResults.originalTransactionDetails && verificationResults.voidTimestamp && verificationResults.userId)) {
      console.log('✅ UAT TEST PASSED: All required audit log fields are present');
    } else {
      console.log('❌ UAT TEST FAILED: Some required audit log fields are missing');
    }
    console.log('===============================================================\n');

    // Display full audit log for inspection
    console.log('Full Audit Log (for inspection):');
    console.log(JSON.stringify(voidAuditLog, null, 2));
    console.log('');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

test();

