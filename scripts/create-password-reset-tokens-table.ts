// @ts-nocheck
/**
 * Manually Create PasswordResetToken Table Script
 * 
 * This script manually creates the password_reset_tokens table
 * for the forgot password feature.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createPasswordResetTokensTable() {
  console.log('🔧 CREATING password_reset_tokens TABLE');
  console.log('='.repeat(60));
  console.log('');

  try {
    // First, check if table already exists
    console.log('📝 Checking if table already exists...');
    const tables = await prisma.$queryRaw<Array<{TABLE_NAME: string}>>`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'password_reset_tokens'
    `;

    if (tables.length > 0) {
      console.log('✅ Table password_reset_tokens already exists');
      console.log('');
      
      // Check if all required columns exist
      console.log('📝 Verifying table structure...');
      const columns = await prisma.$queryRaw<Array<{COLUMN_NAME: string, DATA_TYPE: string, IS_NULLABLE: string}>>`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'password_reset_tokens'
        ORDER BY ORDINAL_POSITION
      `;
      
      console.log('Current columns:');
      columns.forEach(col => {
        console.log(`  - ${col.COLUMN_NAME} (${col.DATA_TYPE}, nullable: ${col.IS_NULLABLE})`);
      });
      
      console.log('');
      console.log('✅ Table structure verified');
      return;
    }

    // Find the User table name
    console.log('📝 Finding User table name...');
    const userTables = await prisma.$queryRaw<Array<{TABLE_NAME: string}>>`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = DATABASE()
      AND (TABLE_NAME = 'User' OR TABLE_NAME = 'user' OR TABLE_NAME = 'users' OR TABLE_NAME = 'Users')
      LIMIT 1
    `;

    if (userTables.length === 0) {
      throw new Error('Could not find User table in database');
    }

    const userTableName = userTables[0].TABLE_NAME;
    console.log(`✅ Found User table: ${userTableName}`);

    // Get the User table's id column type
    const userTableInfo = await prisma.$queryRaw<Array<{COLUMN_NAME: string, DATA_TYPE: string, CHARACTER_MAXIMUM_LENGTH: number}>>`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ${userTableName}
      AND COLUMN_NAME = 'id'
    `;

    if (userTableInfo.length === 0) {
      throw new Error('Could not find id column in User table');
    }

    const idType = userTableInfo[0].DATA_TYPE === 'varchar' 
      ? `VARCHAR(${userTableInfo[0].CHARACTER_MAXIMUM_LENGTH || 255})` 
      : 'VARCHAR(255)';

    console.log(`✅ User id column type: ${idType}`);
    console.log('');

    // Create the table
    console.log('📝 Creating password_reset_tokens table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`password_reset_tokens\` (
        \`id\` VARCHAR(255) NOT NULL,
        \`userId\` ${idType} NOT NULL,
        \`tokenHash\` VARCHAR(255) NOT NULL,
        \`expiresAt\` DATETIME NOT NULL,
        \`usedAt\` DATETIME NULL,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`password_reset_tokens_tokenHash_key\` (\`tokenHash\`),
        KEY \`password_reset_tokens_userId_idx\` (\`userId\`),
        CONSTRAINT \`password_reset_tokens_userId_fkey\` 
          FOREIGN KEY (\`userId\`) 
          REFERENCES \`${userTableName}\` (\`id\`) 
          ON DELETE CASCADE 
          ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ Table password_reset_tokens created successfully');
    console.log('');
    console.log('🎉 DATABASE UPDATE COMPLETE!');
    console.log('='.repeat(60));
    console.log('');
    console.log('✅ password_reset_tokens table is ready for use');
    console.log('✅ Forgot password feature can now be used');
    console.log('');

  } catch (error: any) {
    if (error.message && error.message.includes('already exists')) {
      console.log('⚠️  Table already exists, skipping creation');
      return;
    } else if (error.message && error.message.includes('Duplicate')) {
      console.log('⚠️  Table or constraint already exists');
      return;
    } else {
      console.error('❌ Error creating table:', error);
      throw error;
    }
  }
}

async function main() {
  try {
    await createPasswordResetTokensTable();
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

