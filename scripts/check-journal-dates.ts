// @ts-nocheck
/**
 * Check Journal Entry Dates
 * 
 * This script checks the actual dates of journal entries to understand the date filtering issue.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkJournalDates() {
  console.log('📅 Checking Journal Entry Dates...');
  console.log('=' .repeat(50));

  try {
    const entries = await prisma.journalEntry.findMany({
      orderBy: { transactionDate: 'asc' }
    });
    
    console.log('📊 Journal Entries Found:', entries.length);
    
    if (entries.length > 0) {
      console.log('\n📅 Journal Entry Dates:');
      entries.forEach((entry, index) => {
        console.log(`  Entry ${index + 1}:`);
        console.log(`    Reference: ${entry.referenceNumber}`);
        console.log(`    Date: ${entry.transactionDate.toISOString()}`);
        console.log(`    Date (Local): ${entry.transactionDate.toLocaleString()}`);
        console.log(`    Status: ${entry.status}`);
        console.log('    ---');
      });
    }

    const today = new Date();
    const filterDate = new Date('2025-10-23');
    const endOfDay = new Date('2025-10-23T23:59:59.999Z');
    
    console.log('\n📅 Date Comparison:');
    console.log('  Today:', today.toISOString());
    console.log('  Filter Date (start of day):', filterDate.toISOString());
    console.log('  Filter Date (end of day):', endOfDay.toISOString());
    
    // Test different date filters
    console.log('\n🔍 Testing Date Filters:');
    
    // Filter 1: Exact date (start of day)
    const entries1 = await prisma.journalEntry.findMany({
      where: {
        transactionDate: {
          lte: filterDate
        },
        status: 'POSTED'
      }
    });
    console.log(`  Entries <= ${filterDate.toISOString()}: ${entries1.length}`);
    
    // Filter 2: End of day
    const entries2 = await prisma.journalEntry.findMany({
      where: {
        transactionDate: {
          lte: endOfDay
        },
        status: 'POSTED'
      }
    });
    console.log(`  Entries <= ${endOfDay.toISOString()}: ${entries2.length}`);
    
    // Filter 3: No date filter
    const entries3 = await prisma.journalEntry.findMany({
      where: {
        status: 'POSTED'
      }
    });
    console.log(`  All POSTED entries: ${entries3.length}`);

  } catch (error) {
    console.error('❌ Error checking journal dates:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkJournalDates();
