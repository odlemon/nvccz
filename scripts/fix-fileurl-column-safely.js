// Safe script to modify application_documents.fileUrl column from VARCHAR to TEXT
// This script verifies the current state, makes the change, and verifies again

const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixFileUrlColumn() {
  console.log('🔧 Fixing application_documents.fileUrl column...\n');
  
  let connection;
  
  try {
    // Check for DATABASE_URL
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL environment variable not found!');
      console.error('   Please set it in your .env file');
      process.exit(1);
    }

    console.log('📋 Connecting to database...');
    
    // Parse DATABASE_URL from environment
    // Format: mysql://user:password@host:port/database
    const dbUrl = new URL(process.env.DATABASE_URL);
    const host = dbUrl.hostname;
    const port = parseInt(dbUrl.port) || 3306;
    const user = dbUrl.username;
    const password = dbUrl.password;
    const database = dbUrl.pathname.slice(1); // Remove leading /

    // Create connection
    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
      ssl: {
        rejectUnauthorized: false
      },
      connectTimeout: 60000,
    });

    console.log('✅ Connected to database\n');

    // Step 1: Check current column structure
    console.log('📊 Step 1: Checking current column structure...');
    const [beforeCheck] = await connection.execute(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE,
        COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'application_documents'
        AND COLUMN_NAME = 'fileUrl'
    `);

    if (beforeCheck.length === 0) {
      console.error('❌ Column fileUrl not found in application_documents table!');
      return;
    }

    const currentState = beforeCheck[0];
    console.log('Current state:', {
      dataType: currentState.DATA_TYPE,
      maxLength: currentState.CHARACTER_MAXIMUM_LENGTH,
      nullable: currentState.IS_NULLABLE,
      columnType: currentState.COLUMN_TYPE
    });

    // Check if already TEXT type
    if (currentState.DATA_TYPE === 'text') {
      console.log('\n✅ Column is already TEXT type. No changes needed.');
      return;
    }

    // Step 2: Check for existing data and max length
    console.log('\n📊 Step 2: Checking existing data...');
    const [dataCheck] = await connection.execute(`
      SELECT 
        COUNT(*) as total_rows,
        MAX(CHAR_LENGTH(fileUrl)) as max_url_length,
        COUNT(CASE WHEN CHAR_LENGTH(fileUrl) > 191 THEN 1 END) as urls_over_191
      FROM application_documents
    `);

    console.log('Data statistics:', {
      totalRows: dataCheck[0].total_rows,
      maxUrlLength: dataCheck[0].max_url_length,
      urlsOver191: dataCheck[0].urls_over_191
    });

    // Step 3: Make the change
    console.log('\n🔧 Step 3: Modifying column to TEXT...');
    await connection.execute(`
      ALTER TABLE \`application_documents\` 
      MODIFY COLUMN \`fileUrl\` TEXT NOT NULL
    `);
    console.log('✅ Column modified successfully\n');

    // Step 4: Verify the change
    console.log('📊 Step 4: Verifying the change...');
    const [afterCheck] = await connection.execute(`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE,
        COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'application_documents'
        AND COLUMN_NAME = 'fileUrl'
    `);

    const newState = afterCheck[0];
    console.log('New state:', {
      dataType: newState.DATA_TYPE,
      maxLength: newState.CHARACTER_MAXIMUM_LENGTH,
      nullable: newState.IS_NULLABLE,
      columnType: newState.COLUMN_TYPE
    });

    if (newState.DATA_TYPE === 'text') {
      console.log('\n✅ SUCCESS! Column is now TEXT type.');
      console.log('\n📝 Next step: Run "npx prisma generate" to regenerate Prisma client');
    } else {
      console.log('\n⚠️  WARNING: Column type might not have changed as expected');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 Database connection closed');
    }
  }
}

// Run the script
fixFileUrlColumn()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

