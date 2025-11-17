const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

// Admin credentials
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

let TOKEN = null;

async function login() {
  try {
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    if (loginResponse.data.success || loginResponse.data.token) {
      TOKEN = loginResponse.data.token || loginResponse.data.data?.token;
      console.log('✅ Login successful!\n');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Login error:', error.response?.data || error.message);
    return false;
  }
}

async function traceAssetBug() {
  try {
    console.log('🔍 TRACING ASSET BALANCE SHEET BUG');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Step 1: Find the asset directly from database
    console.log('STEP 1: Finding the asset...\n');
    const asset = await prisma.asset.findFirst({
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    if (!asset) {
      console.log('❌ No asset found');
      return;
    }

    console.log(`✅ Found asset: ${asset.assetName} (${asset.assetCode})`);
    console.log(`   - Asset Account ID: ${asset.assetAccountId}`);
    console.log(`   - Cost: $${asset.cost}`);
    console.log(`   - Purchase Date: ${asset.purchaseDate}\n`);

    // Step 2: Get the asset's GL account
    console.log('STEP 2: Getting asset GL account...\n');
    const assetAccount = await prisma.chartOfAccounts.findUnique({
      where: { id: asset.assetAccountId }
    });

    if (!assetAccount) {
      console.log('❌ Asset GL account not found');
      return;
    }

    console.log(`✅ Asset GL Account:`);
    console.log(`   - Account No: ${assetAccount.accountNo}`);
    console.log(`   - Account Name: ${assetAccount.accountName}`);
    console.log(`   - Account Type: ${assetAccount.accountType}`);
    console.log(`   - Financial Statement: ${assetAccount.financialStatement}`);
    console.log(`   - Is Active: ${assetAccount.isActive}\n`);

    // Step 3: Find the journal entry for this asset
    console.log('STEP 3: Finding journal entry for asset acquisition...\n');
    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: {
          contains: `ASSET-${asset.assetCode}`
        }
      },
      include: {
        cashbookEntries: true
      }
    });

    if (!journalEntry) {
      console.log('❌ Journal entry not found');
      return;
    }

    console.log(`✅ Found journal entry: ${journalEntry.referenceNumber}`);
    console.log(`   - ID: ${journalEntry.id}`);
    console.log(`   - Status: ${journalEntry.status}`);
    console.log(`   - Transaction Date: ${journalEntry.transactionDate}`);
    console.log(`   - Currency ID: ${journalEntry.currencyId || 'null'}`);
    console.log(`   - Cashbook Entries: ${journalEntry.cashbookEntries.length}\n`);

    // Step 4: Get ALL journal entry lines for this journal entry
    console.log('STEP 4: Getting ALL journal entry lines for this journal entry...\n');
    const allJournalLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntryId: journalEntry.id
      },
      include: {
        chartOfAccount: {
          select: {
            id: true,
            accountNo: true,
            accountName: true,
            accountType: true,
            financialStatement: true
          }
        }
      }
    });

    console.log(`✅ Found ${allJournalLines.length} journal entry line(s) for this journal entry:\n`);
    allJournalLines.forEach((line, index) => {
      console.log(`   Line ${index + 1}:`);
      console.log(`      - Account: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
      console.log(`      - Account Type: ${line.chartOfAccount.accountType}`);
      console.log(`      - Financial Statement: ${line.chartOfAccount.financialStatement}`);
      console.log(`      - Debit: $${line.debitAmount}`);
      console.log(`      - Credit: $${line.creditAmount}`);
      console.log(`      - Account ID: ${line.chartOfAccountId}`);
      console.log('');
    });

    // Step 5: Check what the balance sheet query would fetch
    console.log('STEP 5: Testing what the Balance Sheet query fetches...\n');
    
    const asOfDate = new Date(asset.purchaseDate);
    asOfDate.setHours(23, 59, 59, 999);
    
    const startDate = new Date(0);
    const endDate = new Date(asOfDate);

    console.log(`   Query Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}\n`);

    // Build the exact query the balance sheet uses
    const journalEntryWhere = {
      transactionDate: {
        gte: startDate,
        lte: endDate
      },
      status: 'POSTED',
      AND: [
        {
          referenceNumber: {
            not: {
              startsWith: 'VR-'
            }
          }
        },
        {
          referenceNumber: {
            not: {
              startsWith: 'REV-'
            }
          }
        },
        {
          OR: [
            {
              cashbookEntries: {
                none: {}
              }
            },
            {
              cashbookEntries: {
                every: {
                  AND: [
                    { status: { not: 'VOIDED' } },
                    { reversedAt: null }
                  ]
                }
              }
            }
          ]
        }
      ]
    };

    console.log('   Query Structure:');
    console.log(JSON.stringify(journalEntryWhere, null, 2));
    console.log('');

    // Test if the journal entry matches the filter
    console.log('   Testing if journal entry matches the filter...');
    const matchingJE = await prisma.journalEntry.findFirst({
      where: {
        ...journalEntryWhere,
        id: journalEntry.id
      }
    });

    if (matchingJE) {
      console.log('   ✅ Journal entry MATCHES the filter\n');
    } else {
      console.log('   ❌ Journal entry does NOT match the filter\n');
    }

    // Get journal entry lines that the balance sheet would fetch
    console.log('   Fetching journal entry lines using balance sheet query...');
    const balanceSheetLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          is: journalEntryWhere
        }
      },
      include: {
        chartOfAccount: {
          select: {
            id: true,
            accountNo: true,
            accountName: true,
            accountType: true,
            financialStatement: true
          }
        },
        journalEntry: {
          select: {
            id: true,
            referenceNumber: true,
            transactionDate: true,
            status: true,
            currencyId: true
          }
        }
      }
    });

    console.log(`   ✅ Balance sheet query found ${balanceSheetLines.length} journal entry line(s)\n`);

    // Check if our asset's journal entry lines are in the results
    const assetLinesInResults = balanceSheetLines.filter(line => 
      line.journalEntryId === journalEntry.id
    );

    console.log(`   Asset journal entry lines in results: ${assetLinesInResults.length}\n`);

    if (assetLinesInResults.length > 0) {
      console.log('   ✅ Asset journal entry lines ARE in the balance sheet query results:\n');
      assetLinesInResults.forEach((line, index) => {
        console.log(`      Line ${index + 1}:`);
        console.log(`         - Account: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
        console.log(`         - Account Type: ${line.chartOfAccount.accountType}`);
        console.log(`         - Debit: $${line.debitAmount}`);
        console.log(`         - Credit: $${line.creditAmount}`);
        console.log('');
      });
    } else {
      console.log('   ❌ Asset journal entry lines are NOT in the balance sheet query results\n');
      console.log('   This means the query filter is excluding them!\n');
    }

    // Step 6: Check which accounts the balance sheet would process
    console.log('STEP 6: Checking which accounts the balance sheet would process...\n');
    
    const accountIds = new Set();
    balanceSheetLines.forEach(line => {
      accountIds.add(line.chartOfAccountId);
    });

    const accounts = await prisma.chartOfAccounts.findMany({
      where: {
        id: { in: Array.from(accountIds) },
        accountType: { in: ['Fixed Asset', 'Long-Term Asset'] }
      }
    });

    console.log(`   Fixed Asset accounts in query results: ${accounts.length}\n`);
    accounts.forEach(acc => {
      console.log(`      - ${acc.accountNo} - ${acc.accountName} (${acc.accountType})`);
    });
    console.log('');

    // Check if asset account is in the list
    const assetAccountInList = accounts.find(acc => acc.id === assetAccount.id);
    if (assetAccountInList) {
      console.log(`   ✅ Asset account ${assetAccount.accountNo} IS in the list\n`);
    } else {
      console.log(`   ❌ Asset account ${assetAccount.accountNo} is NOT in the list\n`);
    }

    // Step 7: Calculate what the balance would be for the asset account
    console.log('STEP 7: Calculating balance for asset account from query results...\n');
    
    const assetAccountLines = balanceSheetLines.filter(line => 
      line.chartOfAccountId === assetAccount.id
    );

    console.log(`   Journal entry lines for account ${assetAccount.accountNo}: ${assetAccountLines.length}\n`);

    if (assetAccountLines.length > 0) {
      let balance = 0;
      assetAccountLines.forEach(line => {
        // Assets: Debits increase, Credits decrease
        balance += Number(line.debitAmount) - Number(line.creditAmount);
        console.log(`      - ${line.journalEntry.referenceNumber}: Debit $${line.debitAmount}, Credit $${line.creditAmount}`);
      });
      console.log(`\n   Calculated Balance: $${balance.toFixed(2)}\n`);
    } else {
      console.log('   ❌ No journal entry lines found for asset account in query results\n');
    }

    // Step 8: Check what the balance sheet API actually returns
    console.log('STEP 8: Checking what the Balance Sheet API actually returns...\n');
    
    try {
      await login();
      
      const balanceSheetResponse = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: {
          asOfDate: asOfDate.toISOString().split('T')[0]
        }
      });

      const balanceSheet = balanceSheetResponse.data.data || balanceSheetResponse.data;
      const fixedAssets = balanceSheet.assets?.fixedAssets?.accounts || [];
      const totalFixedAssets = balanceSheet.assets?.fixedAssets?.total || 0;

      console.log(`   API Response:`);
      console.log(`      - Total Fixed Assets: $${totalFixedAssets}`);
      console.log(`      - Number of Fixed Asset accounts: ${fixedAssets.length}\n`);

      if (fixedAssets.length > 0) {
        console.log('   Fixed Asset accounts in API response:');
        fixedAssets.forEach(acc => {
          console.log(`      - ${acc.accountNo} - ${acc.accountName}: $${acc.balance}`);
        });
        console.log('');
      }

      const assetInAPI = fixedAssets.find(acc => acc.accountNo === assetAccount.accountNo);
      if (assetInAPI) {
        console.log(`   ✅ Asset account ${assetAccount.accountNo} IS in API response\n`);
      } else {
        console.log(`   ❌ Asset account ${assetAccount.accountNo} is NOT in API response\n`);
      }
    } catch (apiError) {
      console.log(`   ⚠️  Could not fetch from API: ${apiError.message}\n`);
    }

    // Summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Asset: ${asset.assetName}`);
    console.log(`Asset Account: ${assetAccount.accountNo} - ${assetAccount.accountName}`);
    console.log(`Journal Entry: ${journalEntry.referenceNumber} (${journalEntry.status})`);
    console.log(`Journal Entry Lines: ${allJournalLines.length}`);
    console.log(`Balance Sheet Query Results: ${balanceSheetLines.length} lines`);
    console.log(`Asset Lines in Query: ${assetLinesInResults.length}`);
    console.log(`Asset Account in Query: ${assetAccountInList ? 'YES ✅' : 'NO ❌'}`);
    console.log(`Calculated Balance: $${assetAccountLines.length > 0 ? (assetAccountLines.reduce((sum, line) => sum + Number(line.debitAmount) - Number(line.creditAmount), 0)).toFixed(2) : '0.00'}`);
    
    let assetInAPI = false;
    try {
      await login();
      const balanceSheetResponse = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
        params: {
          asOfDate: asOfDate.toISOString().split('T')[0]
        }
      });
      const balanceSheet = balanceSheetResponse.data.data || balanceSheetResponse.data;
      const fixedAssets = balanceSheet.assets?.fixedAssets?.accounts || [];
      assetInAPI = fixedAssets.some(acc => acc.accountNo === assetAccount.accountNo);
    } catch (e) {
      // Already logged above
    }
    
    console.log(`Asset in API Response: ${assetInAPI ? 'YES ✅' : 'NO ❌'}`);
    console.log('\n🔍 DIAGNOSIS:');
    if (assetLinesInResults.length > 0 && assetAccountInList && !assetInAPI) {
      console.log('   ⚠️  Query finds the asset, but API does not return it.');
      console.log('   This suggests the issue is in the balance sheet service processing logic.');
      console.log('   Check if accounts with zero balance are being skipped incorrectly.');
    } else if (assetLinesInResults.length === 0) {
      console.log('   ❌ Query is not finding the asset lines.');
      console.log('   Check the journalEntryWhere filter in BalanceSheetService.ts');
    } else {
      console.log('   ✅ Everything looks correct!');
    }
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

traceAssetBug();

