#!/usr/bin/env ts-node

/**
 * Fix Cashbook Entries with null createdById
 * 
 * This script identifies and fixes cashbook entries that have null createdById values.
 * It assigns them to a default system user or the first available user.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixCashbookNullCreatedBy() {
  try {
    console.log('🔍 Checking for cashbook entries with null createdById...');
    
    // Find entries with null createdById
    const nullEntries = await prisma.cashbookEntry.findMany({
      where: {
        createdById: null
      },
      select: {
        id: true,
        description: true,
        transactionDate: true,
        amount: true
      }
    });

    console.log(`📊 Found ${nullEntries.length} entries with null createdById`);

    if (nullEntries.length === 0) {
      console.log('✅ No entries with null createdById found. Database is clean!');
      return;
    }

    // Find the first available user to assign as creator
    const firstUser = await prisma.user.findFirst({
      select: { id: true, firstName: true, lastName: true, email: true }
    });

    if (!firstUser) {
      console.error('❌ No users found in the database. Cannot fix null createdById values.');
      return;
    }

    console.log(`👤 Assigning entries to user: ${firstUser.firstName} ${firstUser.lastName} (${firstUser.email})`);

    // Update all null entries with the first user's ID
    const updateResult = await prisma.cashbookEntry.updateMany({
      where: {
        createdById: null
      },
      data: {
        createdById: firstUser.id
      }
    });

    console.log(`✅ Updated ${updateResult.count} entries with createdById: ${firstUser.id}`);

    // Verify the fix
    const remainingNullEntries = await prisma.cashbookEntry.count({
      where: {
        createdById: null
      }
    });

    if (remainingNullEntries === 0) {
      console.log('🎉 All null createdById values have been fixed!');
    } else {
      console.log(`⚠️  Warning: ${remainingNullEntries} entries still have null createdById`);
    }

    // Show some examples of the fixed entries
    const sampleFixedEntries = await prisma.cashbookEntry.findMany({
      where: {
        createdById: firstUser.id
      },
      include: {
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      take: 5,
      orderBy: {
        updatedAt: 'desc'
      }
    });

    console.log('\n📋 Sample of fixed entries:');
    sampleFixedEntries.forEach((entry, index) => {
      console.log(`  ${index + 1}. ${entry.description} - $${entry.amount} (Created by: ${entry.createdBy?.firstName} ${entry.createdBy?.lastName})`);
    });

  } catch (error) {
    console.error('❌ Error fixing cashbook null createdById:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  fixCashbookNullCreatedBy()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export { fixCashbookNullCreatedBy };
