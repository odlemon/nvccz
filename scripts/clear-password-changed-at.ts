// @ts-nocheck
/**
 * Clear passwordChangedAt Script
 * 
 * This script clears the passwordChangedAt field for all users
 * to fully revert the token invalidation feature.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearPasswordChangedAt() {
  console.log('🔧 CLEARING passwordChangedAt FIELD');
  console.log('=' .repeat(60));
  console.log('');

  try {
    // Clear passwordChangedAt for all users
    console.log('💾 Clearing passwordChangedAt for all users...');
    await prisma.$executeRawUnsafe(`
      UPDATE users 
      SET passwordChangedAt = NULL
    `);

    console.log('✅ passwordChangedAt cleared for all users');
    console.log('');
    console.log('🎉 REVERT COMPLETE!');
    console.log('=' .repeat(60));
    console.log('');
    console.log('✅ Token invalidation feature has been fully reverted');
    console.log('✅ All existing sessions will continue to work');
    console.log('');

  } catch (error) {
    console.error('❌ Error clearing passwordChangedAt:', error);
    throw error;
  }
}

async function main() {
  try {
    await clearPasswordChangedAt();
  } catch (error) {
    console.error('❌ Operation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

