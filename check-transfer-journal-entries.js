// Direct database query to check journal entries for transfers
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkTransferJournalEntries() {
  console.log('🔍 Checking journal entries for transfers...\n');
  
  try {
    // 1. Check for transfer-related journal entries
    console.log('📊 Step 1: Finding transfer-related journal entries...');
    const transferJournalEntries = await prisma.journalEntry.findMany({
      where: {
        OR: [
          { referenceNumber: { contains: 'TR-OUT-' } },
          { referenceNumber: { contains: 'TR-IN-' } },
          { description: { contains: 'Transfer' } }
        ]
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: {
              select: {
                accountNo: true,
                accountName: true
              }
            }
          }
        },
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`✅ Found ${transferJournalEntries.length} transfer-related journal entries\n`);
    
    // 2. Display each journal entry with its lines
    transferJournalEntries.forEach((entry, index) => {
      console.log(`📝 Journal Entry ${index + 1}:`);
      console.log(`   ID: ${entry.id}`);
      console.log(`   Reference: ${entry.referenceNumber}`);
      console.log(`   Description: ${entry.description}`);
      console.log(`   Date: ${entry.transactionDate}`);
      console.log(`   Total Amount: $${entry.totalAmount}`);
      console.log(`   Status: ${entry.status}`);
      console.log(`   Created By: ${entry.createdBy.firstName} ${entry.createdBy.lastName}`);
      console.log(`   Created At: ${entry.createdAt}`);
      console.log('');
      
      // Display journal entry lines
      if (entry.journalEntryLines && entry.journalEntryLines.length > 0) {
        console.log(`   📋 Journal Entry Lines (${entry.journalEntryLines.length}):`);
        entry.journalEntryLines.forEach((line, lineIndex) => {
          console.log(`      Line ${lineIndex + 1}:`);
          console.log(`        Account: ${line.chartOfAccount?.accountNo || 'N/A'} - ${line.chartOfAccount?.accountName || 'N/A'}`);
          console.log(`        Debit: $${line.debitAmount}`);
          console.log(`        Credit: $${line.creditAmount}`);
          console.log(`        Description: ${line.description}`);
          console.log('');
        });
      }
      
      console.log('   ' + '─'.repeat(60));
      console.log('');
    });
    
    // 3. Check for cashbook transfers
    console.log('🔄 Step 2: Checking cashbook transfers...');
    const transfers = await prisma.cashbookTransfer.findMany({
      include: {
        fromBank: {
          select: {
            name: true,
            accountNumber: true
          }
        },
        toBank: {
          select: {
            name: true,
            accountNumber: true
          }
        },
        createdBy: {
          select: {
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    console.log(`✅ Found ${transfers.length} cashbook transfers\n`);
    
    transfers.forEach((transfer, index) => {
      console.log(`💸 Transfer ${index + 1}:`);
      console.log(`   ID: ${transfer.id}`);
      console.log(`   Reference: ${transfer.reference}`);
      console.log(`   Description: ${transfer.description}`);
      console.log(`   Amount: $${transfer.amount}`);
      console.log(`   From: ${transfer.fromBank.name} (${transfer.fromBank.accountNumber})`);
      console.log(`   To: ${transfer.toBank.name} (${transfer.toBank.accountNumber})`);
      console.log(`   Date: ${transfer.transferDate}`);
      console.log(`   Status: ${transfer.status}`);
      console.log(`   Created By: ${transfer.createdBy.firstName} ${transfer.createdBy.lastName}`);
      console.log(`   Created At: ${transfer.createdAt}`);
      console.log('');
    });
    
    // 4. Summary
    console.log('📈 SUMMARY:');
    console.log(`   Total Journal Entries: ${transferJournalEntries.length}`);
    console.log(`   Total Transfers: ${transfers.length}`);
    console.log(`   Transfer Entries with TR-OUT: ${transferJournalEntries.filter(e => e.referenceNumber?.includes('TR-OUT-')).length}`);
    console.log(`   Transfer Entries with TR-IN: ${transferJournalEntries.filter(e => e.referenceNumber?.includes('TR-IN-')).length}`);
    
    // 5. Check if transfers have corresponding journal entries
    console.log('\n🔍 Step 3: Verifying transfer-to-journal-entry mapping...');
    let mappedTransfers = 0;
    
    for (const transfer of transfers) {
      const hasOutgoingJournal = transferJournalEntries.some(entry => 
        entry.referenceNumber?.includes(`TR-OUT-`) && 
        entry.description?.includes(transfer.toBank.name)
      );
      
      const hasIncomingJournal = transferJournalEntries.some(entry => 
        entry.referenceNumber?.includes(`TR-IN-`) && 
        entry.description?.includes(transfer.fromBank.name)
      );
      
      if (hasOutgoingJournal && hasIncomingJournal) {
        mappedTransfers++;
        console.log(`✅ Transfer ${transfer.reference} has both outgoing and incoming journal entries`);
      } else {
        console.log(`⚠️ Transfer ${transfer.reference} missing journal entries`);
      }
    }
    
    console.log(`\n📊 Final Result: ${mappedTransfers}/${transfers.length} transfers have complete journal entries`);
    
  } catch (error) {
    console.error('❌ Error checking journal entries:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the check
checkTransferJournalEntries();
