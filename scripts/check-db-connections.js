const { PrismaClient } = require('@prisma/client');

async function checkDatabaseConnections() {
  console.log('🔍 Checking database connections...\n');
  
  try {
    // Create a new Prisma client to test connection
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });

    console.log('📊 Database URL:', process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@'));
    console.log('⏰ Connection timeout:', process.env.DB_SERVER_SELECTION_TIMEOUT || 'default');
    console.log('🔢 Max pool size:', process.env.DB_MAX_POOL_SIZE || 'default');
    
    // Test connection
    console.log('\n🔄 Testing database connection...');
    await prisma.$connect();
    console.log('✅ Database connection successful!');

    // Check connection pool status
    console.log('\n📈 Checking connection pool status...');
    
    // Try to get some basic info
    const userCount = await prisma.user.count();
    console.log(`👥 Total users: ${userCount}`);

    // Check if we can query other tables
    const customerCount = await prisma.customer.count();
    console.log(`🏢 Total customers: ${customerCount}`);

    const vendorCount = await prisma.vendor.count();
    console.log(`🏭 Total vendors: ${vendorCount}`);

    const currencyCount = await prisma.currency.count();
    console.log(`💰 Total currencies: ${currencyCount}`);

    console.log('\n✅ All database queries successful!');
    
    // Disconnect
    await prisma.$disconnect();
    console.log('🔌 Disconnected from database');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    
    if (error.message.includes('Can\'t reach database server')) {
      console.log('\n🔧 Troubleshooting suggestions:');
      console.log('1. Check if the database server is running');
      console.log('2. Verify the DATABASE_URL in your .env file');
      console.log('3. Check network connectivity to the database server');
      console.log('4. Verify database credentials');
      console.log('5. Check if the database server allows connections from your IP');
    }
    
    process.exit(1);
  }
}

// Run the check
checkDatabaseConnections();
