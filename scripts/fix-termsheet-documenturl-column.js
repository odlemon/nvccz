// Script to manually modify term_sheets.documentUrl column to TEXT type
// This avoids Prisma migration drift issues
const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixTermSheetDocumentUrlColumn() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  // Parse database URL
  // Format: mysql://user:password@host:port/database?params
  const url = new URL(dbUrl);
  const host = url.hostname;
  const port = parseInt(url.port) || 3306;
  const database = url.pathname.replace('/', '');
  const user = url.username;
  const password = url.password;

  console.log('🔧 Term Sheet DocumentUrl Column Fix');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Host: ${host}`);
  console.log(`Port: ${port}`);
  console.log(`Database: ${database}`);
  console.log(`User: ${user}`);
  console.log('');

  let connection;

  try {
    // Create connection
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database
    });

    console.log('✅ Connected to database');

    // Check current column type
    console.log('\n📋 Checking current column type...');
    const [columns] = await connection.query(`
      SELECT 
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'term_sheets'
        AND COLUMN_NAME = 'documentUrl'
    `, [database]);

    if (columns.length === 0) {
      console.log('❌ Column documentUrl not found in term_sheets table');
      return;
    }

    const currentColumn = columns[0];
    console.log(`Current Type: ${currentColumn.COLUMN_TYPE}`);
    console.log(`Nullable: ${currentColumn.IS_NULLABLE}`);
    console.log(`Default: ${currentColumn.COLUMN_DEFAULT || 'NULL'}`);

    // Check if already TEXT type
    if (currentColumn.COLUMN_TYPE.toLowerCase().includes('text')) {
      console.log('\n✅ Column is already TEXT type. No changes needed.');
      return;
    }

    // Backup current data (if any)
    console.log('\n💾 Checking for existing data...');
    const [rows] = await connection.query(`
      SELECT COUNT(*) as count 
      FROM term_sheets 
      WHERE documentUrl IS NOT NULL
    `);

    const count = rows[0].count;
    console.log(`Found ${count} term sheets with documentUrl`);

    if (count > 0) {
      console.log('⚠️  Warning: There is existing data in documentUrl column.');
      console.log('   The column will be modified, but data should be preserved.');
    }

    // Modify column to TEXT
    console.log('\n🔄 Modifying column to TEXT type...');
    await connection.query(`
      ALTER TABLE term_sheets 
      MODIFY COLUMN documentUrl TEXT NULL
    `);

    console.log('✅ Column modified successfully!');

    // Verify the change
    console.log('\n🔍 Verifying column type...');
    const [updatedColumns] = await connection.query(`
      SELECT 
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'term_sheets'
        AND COLUMN_NAME = 'documentUrl'
    `, [database]);

    const updatedColumn = updatedColumns[0];
    console.log(`New Type: ${updatedColumn.COLUMN_TYPE}`);
    console.log(`Nullable: ${updatedColumn.IS_NULLABLE}`);

    if (updatedColumn.COLUMN_TYPE.toLowerCase().includes('text')) {
      console.log('\n✅ Column successfully changed to TEXT type!');
    } else {
      console.log('\n⚠️  Column type change may not have worked as expected.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✅ Database connection closed');
    }
  }
}

// Run the fix
fixTermSheetDocumentUrlColumn()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

