const mysql = require('mysql2/promise');
require('dotenv').config();

async function testDatabaseConnection() {
  console.log('🔍 Testing Database Connection to Aiven...\n');
  
  // Parse the DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  console.log('📋 Database URL:', dbUrl.replace(/\/\/.*@/, '//***:***@')); // Hide credentials
  
  try {
    // Create connection with timeout settings
    const connection = await mysql.createConnection({
      host: 'nvcc-veximagames-0d4d.d.aivencloud.com',
      port: 24079,
      user: 'avnadmin',
      password: 'AVNS_krm65lR20GfGftQmBjJ',
      database: 'defaultdb',
      ssl: {
        rejectUnauthorized: false
      },
      connectTimeout: 60000, // 60 seconds
      acquireTimeout: 60000, // 60 seconds
      timeout: 60000, // 60 seconds
      charset: 'utf8mb4'
    });

    console.log('✅ Database connection established successfully!\n');

    // Test basic query
    console.log('🔍 Testing basic query...');
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('✅ Basic query result:', rows[0]);

    // Get database information
    console.log('\n📊 Database Information:');
    const [dbInfo] = await connection.execute('SELECT DATABASE() as current_db, VERSION() as version');
    console.log('Current Database:', dbInfo[0].current_db);
    console.log('MySQL Version:', dbInfo[0].version);

    // List all tables
    console.log('\n📋 Listing all tables:');
    const [tables] = await connection.execute(`
      SELECT 
        TABLE_NAME as table_name,
        TABLE_ROWS as table_rows,
        DATA_LENGTH as data_length,
        INDEX_LENGTH as index_length
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = 'defaultdb'
      ORDER BY TABLE_NAME
    `);
    
    console.log('Found', tables.length, 'tables:');
    tables.forEach(table => {
      console.log(`  - ${table.table_name} (${table.table_rows} rows)`);
    });

    // Check for Investment Implementation related tables
    console.log('\n🔍 Checking for Investment Implementation tables:');
    const investmentTables = tables.filter(table => 
      table.table_name.includes('investment') || 
      table.table_name.includes('fund') ||
      table.table_name.includes('milestone') ||
      table.table_name.includes('disbursement')
    );
    
    if (investmentTables.length > 0) {
      console.log('Found Investment Implementation tables:');
      investmentTables.forEach(table => {
        console.log(`  ✅ ${table.table_name}`);
      });
    } else {
      console.log('❌ No Investment Implementation tables found');
    }

    // Test connection pool
    console.log('\n🔍 Testing connection pool...');
    const pool = mysql.createPool({
      host: 'nvcc-veximagames-0d4d.d.aivencloud.com',
      port: 24079,
      user: 'avnadmin',
      password: 'AVNS_krm65lR20GfGftQmBjJ',
      database: 'defaultdb',
      ssl: {
        rejectUnauthorized: false
      },
      connectionLimit: 10,
      acquireTimeout: 60000,
      timeout: 60000,
      charset: 'utf8mb4'
    });

    const [poolTest] = await pool.execute('SELECT 1 as pool_test');
    console.log('✅ Connection pool test result:', poolTest[0]);

    // Get connection statistics
    console.log('\n📈 Connection Statistics:');
    const [connections] = await connection.execute(`
      SHOW STATUS LIKE 'Threads_connected'
    `);
    console.log('Active Connections:', connections[0].Value);

    const [maxConnections] = await connection.execute(`
      SHOW VARIABLES LIKE 'max_connections'
    `);
    console.log('Max Connections:', maxConnections[0].Value);

    // Close connections
    await connection.end();
    await pool.end();
    
    console.log('\n✅ All connections closed successfully!');
    console.log('\n🎉 Database connection test completed successfully!');

  } catch (error) {
    console.error('\n❌ Database connection failed:');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Possible solutions:');
      console.log('1. Check if the database server is running');
      console.log('2. Verify the host and port are correct');
      console.log('3. Check firewall settings');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('\n💡 Possible solutions:');
      console.log('1. Network connection is slow');
      console.log('2. Increase connection timeout');
      console.log('3. Try from a different network');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 Possible solutions:');
      console.log('1. Check username and password');
      console.log('2. Verify user permissions');
    }
  }
}

// Test Prisma connection specifically
async function testPrismaConnection() {
  console.log('\n🔍 Testing Prisma Connection...\n');
  
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });

    // Test Prisma connection
    await prisma.$connect();
    console.log('✅ Prisma connection established successfully!');

    // Test a simple query
    const result = await prisma.$queryRaw`SELECT 1 as prisma_test`;
    console.log('✅ Prisma query result:', result);

    // List all models (tables)
    console.log('\n📋 Prisma Models (Tables):');
    const tables = await prisma.$queryRaw`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = 'defaultdb'
      ORDER BY TABLE_NAME
    `;
    
    tables.forEach(table => {
      console.log(`  - ${table.TABLE_NAME}`);
    });

    await prisma.$disconnect();
    console.log('\n✅ Prisma connection closed successfully!');

  } catch (error) {
    console.error('\n❌ Prisma connection failed:');
    console.error('Error:', error.message);
  }
}

// Run the tests
async function runTests() {
  console.log('🚀 Starting Database Connection Tests...\n');
  
  await testDatabaseConnection();
  await testPrismaConnection();
  
  console.log('\n🏁 All tests completed!');
}

// Run if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testDatabaseConnection, testPrismaConnection };
