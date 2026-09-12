// @ts-nocheck
/**
 * Manually Add passwordChangedAt Column Script
 * 
 * This script manually adds the passwordChangedAt column to the User table
 * and sets it for the admin user to invalidate all existing tokens.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addPasswordChangedAtColumn() {
  console.log('🔧 ADDING passwordChangedAt COLUMN');
  console.log('=' .repeat(60));
  console.log('');

  try {
    // First, let's check what tables exist
    console.log('📝 Checking database structure...');
    const tables = await prisma.$queryRaw<Array<{TABLE_NAME: string}>>`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME LIKE '%user%' OR TABLE_NAME LIKE '%User%'
    `;
    console.log('Found tables:', tables);

    // Try different table name variations
    const tableNames = ['User', 'user', 'users', 'Users'];
    
    for (const tableName of tableNames) {
      try {
        console.log(`📝 Attempting to add passwordChangedAt column to ${tableName} table...`);
        
        // Check if column already exists
        const columnExists = await prisma.$queryRaw<Array<{COLUMN_NAME: string}>>`
          SELECT COLUMN_NAME 
          FROM information_schema.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ${tableName}
          AND COLUMN_NAME = 'passwordChangedAt'
        `;

        if (columnExists.length > 0) {
          console.log(`✅ Column already exists in ${tableName} table`);
        } else {
          // Add the column
          await prisma.$executeRawUnsafe(`
            ALTER TABLE \`${tableName}\` 
            ADD COLUMN passwordChangedAt DATETIME NULL
          `);
          console.log(`✅ Column added successfully to ${tableName} table`);
        }

        // Set passwordChangedAt for admin user to invalidate existing tokens
        console.log('');
        console.log('🔐 Setting passwordChangedAt for admin user...');
        await prisma.$executeRawUnsafe(`
          UPDATE \`${tableName}\` 
          SET passwordChangedAt = NOW() 
          WHERE email = 'admin@nvccz.co.zw'
        `);
        console.log('✅ Admin user updated - all existing tokens are now invalid');
        
        console.log('');
        console.log('🎉 DATABASE UPDATE COMPLETE!');
        console.log('=' .repeat(60));
        console.log('');
        console.log('✅ All existing admin sessions have been invalidated');
        console.log('✅ Users will need to login again with the new password');
        console.log('');
        
        return; // Success, exit
      } catch (error: any) {
        if (error.message && error.message.includes("doesn't exist")) {
          console.log(`⚠️  Table ${tableName} doesn't exist, trying next...`);
          continue;
        } else if (error.message && error.message.includes('Duplicate column name')) {
          console.log(`⚠️  Column already exists in ${tableName}, updating admin user only...`);
          
          // Just update the admin user
          await prisma.$executeRawUnsafe(`
            UPDATE \`${tableName}\` 
            SET passwordChangedAt = NOW() 
            WHERE email = 'admin@nvccz.co.zw'
          `);
          console.log('✅ Admin user updated - all existing tokens are now invalid');
          return;
        } else {
          throw error;
        }
      }
    }

    throw new Error('Could not find User table in database');

  } catch (error: any) {
    console.error('❌ Error updating database:', error);
    throw error;
  }
}

async function main() {
  try {
    await addPasswordChangedAtColumn();
  } catch (error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
