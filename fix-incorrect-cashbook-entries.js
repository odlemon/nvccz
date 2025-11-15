const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');
const axios = require('axios');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

let token = '';

async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    token = response.data.token;
    console.log('✅ Logged in successfully\n');
    return token;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function findProblematicEntries() {
  console.log('🔍 Finding problematic cashbook entries...\n');
  
  // Find cashbook receipts that:
  // 1. Have glAccountId set (should be GL transactions)
  // 2. Are linked to journal entries that credited Accounts Receivable (1200)
  // 3. Were created around Nov 15, 2025 (the problematic date)
  
  const problematicDate = new Date('2025-11-15');
  const startDate = new Date(problematicDate);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(problematicDate);
  endDate.setHours(23, 59, 59, 999);
  
  // Get Accounts Receivable account
  const arAccount = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1200', isActive: true }
  });
  
  if (!arAccount) {
    console.log('⚠️  Accounts Receivable account (1200) not found');
    return [];
  }
  
  // Find cashbook entries from Nov 15 that have glAccountId but credited A/R
  const cashbookEntries = await prisma.cashbookEntry.findMany({
    where: {
      transactionDate: {
        gte: startDate,
        lte: endDate
      },
      type: 'RECEIPT',
      status: 'POSTED',
      glAccountId: { not: null }, // Has GL account (should be Revenue)
      journalEntryId: { not: null }
    },
    include: {
      journalEntry: {
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: true
            }
          }
        }
      },
      glAccount: true
    }
  });
  
  console.log(`📊 Found ${cashbookEntries.length} cashbook receipts from Nov 15 with GL accounts\n`);
  
  // Filter to find entries that incorrectly credited A/R
  const problematic = [];
  
  for (const entry of cashbookEntries) {
    if (!entry.journalEntry) continue;
    
    // Check if any journal entry line credited A/R
    const arCredit = entry.journalEntry.journalEntryLines.find(
      line => line.chartOfAccountId === arAccount.id && 
              line.creditAmount > 0
    );
    
    if (arCredit) {
      // This entry incorrectly credited A/R when it should have credited the GL account
      problematic.push({
        cashbookEntry: entry,
        arCreditAmount: arCredit.creditAmount,
        shouldCreditAccount: entry.glAccount
      });
    }
  }
  
  console.log(`⚠️  Found ${problematic.length} problematic entries that incorrectly credited A/R\n`);
  
  return problematic;
}

async function createCorrectingJournalEntry(problematicEntry, userId) {
  const entry = problematicEntry.cashbookEntry;
  const arCreditAmount = problematicEntry.arCreditAmount;
  const correctAccount = problematicEntry.shouldCreditAccount;
  
  console.log(`\n📝 Creating correcting journal entry for: ${entry.id}`);
  console.log(`   Original: Credited A/R (1200) with ${arCreditAmount}`);
  console.log(`   Should have: Credited ${correctAccount.accountNo} (${correctAccount.accountName})`);
  
  // Get bank account
  const bank = await prisma.bank.findUnique({
    where: { id: entry.bankId },
    include: { glAccount: true, currency: true }
  });
  
  if (!bank) {
    throw new Error('Bank account not found');
  }
  
  // Create correcting journal entry
  // Dr. Accounts Receivable (to reverse the incorrect credit)
  // Cr. Revenue Account (to correctly credit revenue)
  
  const journalEntry = await prisma.journalEntry.create({
    data: {
      transactionDate: new Date(),
      referenceNumber: `CORR-${entry.journalEntry.referenceNumber}`,
      description: `CORRECTION: Fix incorrect A/R credit for ${entry.description}`,
      totalAmount: arCreditAmount,
      currencyId: bank.currency.id,
      status: 'POSTED',
      createdById: userId
    }
  });
  
  // 1. Debit Accounts Receivable (reverse the incorrect credit)
  await prisma.journalEntryLine.create({
    data: {
      journalEntryId: journalEntry.id,
      chartOfAccountId: entry.journalEntry.journalEntryLines.find(
        line => line.chartOfAccount.accountNo === '1200'
      ).chartOfAccountId,
      debitAmount: arCreditAmount,
      creditAmount: new Decimal(0),
      description: `CORRECTION: Reverse incorrect A/R credit`
    }
  });
  
  // 2. Credit Revenue Account (correct account)
  await prisma.journalEntryLine.create({
    data: {
      journalEntryId: journalEntry.id,
      chartOfAccountId: correctAccount.id,
      debitAmount: new Decimal(0),
      creditAmount: arCreditAmount,
      description: `CORRECTION: Credit correct Revenue account`
    }
  });
  
  console.log(`   ✅ Created correcting journal entry: ${journalEntry.referenceNumber}`);
  
  return journalEntry;
}

async function main() {
  try {
    await login();
    
    // Get admin user ID
    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@nvccz.co.zw' }
    });
    
    if (!adminUser) {
      throw new Error('Admin user not found');
    }
    
    const problematicEntries = await findProblematicEntries();
    
    if (problematicEntries.length === 0) {
      console.log('✅ No problematic entries found. All entries are correct!\n');
      return;
    }
    
    console.log('\n📋 Summary of problematic entries:');
    console.log('=' .repeat(80));
    for (const entry of problematicEntries) {
      const cb = entry.cashbookEntry;
      console.log(`\nEntry ID: ${cb.id}`);
      console.log(`  Date: ${cb.transactionDate.toISOString().split('T')[0]}`);
      console.log(`  Description: ${cb.description}`);
      console.log(`  Amount: $${cb.amount}`);
      console.log(`  Incorrectly credited: A/R (1200) with $${entry.arCreditAmount}`);
      console.log(`  Should credit: ${entry.shouldCreditAccount.accountNo} (${entry.shouldCreditAccount.accountName})`);
      console.log(`  Journal Entry: ${cb.journalEntry.referenceNumber}`);
    }
    console.log('\n' + '='.repeat(80));
    
    console.log(`\n🔧 Creating correcting journal entries...\n`);
    
    let corrected = 0;
    let errors = 0;
    
    for (const problematicEntry of problematicEntries) {
      try {
        await createCorrectingJournalEntry(problematicEntry, adminUser.id);
        corrected++;
      } catch (error) {
        console.error(`\n❌ Error correcting entry ${problematicEntry.cashbookEntry.id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n\n✅ Correction Summary:`);
    console.log(`   Total problematic entries: ${problematicEntries.length}`);
    console.log(`   Successfully corrected: ${corrected}`);
    console.log(`   Errors: ${errors}`);
    
    if (corrected > 0) {
      console.log(`\n📊 The correcting journal entries will:`);
      console.log(`   1. Debit Accounts Receivable (reversing the incorrect credit)`);
      console.log(`   2. Credit the correct Revenue account`);
      console.log(`\n   This will fix the negative A/R balance and correctly record revenue.`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();

