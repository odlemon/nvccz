const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function voidDuplicateRevaluations() {
  let token = '';

  console.log('🔧 Voiding Duplicate REV-FX Revaluation Entries\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get admin user ID directly from database
  try {
    const adminUser = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
      select: { id: true }
    });
    
    if (!adminUser) {
      console.error('❌ Admin user not found!');
      await prisma.$disconnect();
      return;
    }
    
    const userId = adminUser.id;
    console.log('✅ Found admin user\n');

    // Find the 3 duplicate entries
    const duplicates = await prisma.journalEntry.findMany({
      where: {
        referenceNumber: {
          in: [
            'REV-FX-y8qtrkng-1763107915237',
            'REV-FX-y8qtrkng-1763108650545',
            'REV-FX-y8qtrkng-1763108754645'
          ]
        }
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc' // Keep the first one, void the last 2
      }
    });

    console.log(`Found ${duplicates.length} duplicate entries\n`);

    if (duplicates.length === 3) {
      // Keep the first one (oldest), void the last 2
      const toKeep = duplicates[0];
      const toVoid = duplicates.slice(1);

      console.log(`Keeping: ${toKeep.referenceNumber} (created: ${toKeep.createdAt.toISOString()})\n`);
      console.log(`Voiding ${toVoid.length} duplicate entries:\n`);

      for (const entry of toVoid) {
        try {
          // Update status to VOID
          await prisma.journalEntry.update({
            where: { id: entry.id },
            data: {
              status: 'VOID',
              description: `${entry.description} - VOIDED: Duplicate revaluation entry`
            }
          });

          console.log(`✅ Voided: ${entry.referenceNumber}`);
          console.log(`   Amount: ${entry.totalAmount.toString()}`);
          console.log(`   Lines: ${entry.journalEntryLines.length}\n`);
        } catch (error) {
          console.error(`❌ Error voiding ${entry.referenceNumber}:`, error.message);
        }
      }

      console.log('✅ Duplicate entries voided successfully\n');
    } else {
      console.log(`⚠️  Expected 3 entries, found ${duplicates.length}. Skipping void operation.\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  } finally {
    await prisma.$disconnect();
  }
}

voidDuplicateRevaluations();

