// @ts-nocheck
/**
 * Remove passwordChangedAt Column Script
 * 
 * This script manually removes the passwordChangedAt column from the users table.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function removePasswordChangedAtColumn() {
  console.log('🔧 REMOVING passwordChangedAt COLUMN');
  console.log('=' .repeat(60));
  console.log('');

  try {
    // Manually execute SQL to drop the column
    console.log('📝 Dropping passwordChangedAt column from users table...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE users 
      DROP COLUMN passwordChangedAt
    `);
    console.log('✅ Column removed successfully');

    console.log('');
    console.log('🎉 DATABASE UPDATE COMPLETE!');
    console.log('=' .repeat(60));
    console.log('');
    console.log('✅ passwordChangedAt column has been removed');
    console.log('');

  } catch (error: any) {
    // If column doesn't exist, that's okay
    if (error.message && (error.message.includes("doesn't exist") || error.message.includes("Unknown column"))) {
      console.log('⚠️  Column does not exist - nothing to remove');
      console.log('✅ Database is already clean');
    } else {
      console.error('❌ Error removing column:', error);
      throw error;
    }
  }
}

async function main() {
  try {
    await removePasswordChangedAtColumn();
  } catch (error) {
    console.error('❌ Operation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

