import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixCashbookUserIds() {
  try {
    console.log('🔧 Fixing cashbook user IDs...');
    
    // Get the first user as a default
    const defaultUser = await prisma.user.findFirst();
    
    if (!defaultUser) {
      console.log('❌ No users found in database');
      return;
    }
    
    console.log(`📝 Using default user: ${defaultUser.email} (${defaultUser.id})`);
    
    // Update cashbook entries with NULL createdById
    const updatedCashbook = await prisma.cashbookEntry.updateMany({
      where: {
        createdById: null
      },
      data: {
        createdById: defaultUser.id
      }
    });
    
    console.log(`✅ Updated ${updatedCashbook.count} cashbook entries`);
    
    // Update journal entries with NULL createdById
    const updatedJournal = await prisma.journalEntry.updateMany({
      where: {
        createdById: null
      },
      data: {
        createdById: defaultUser.id
      }
    });
    
    console.log(`✅ Updated ${updatedJournal.count} journal entries`);
    
    console.log('🎉 All user IDs fixed!');
    
  } catch (error) {
    console.error('❌ Error fixing user IDs:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixCashbookUserIds();
