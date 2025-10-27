const { PrismaClient } = require('@prisma/client');

// Test the singleton instance
async function testSingletonConnection() {
  console.log('🔍 Testing singleton PrismaClient instance...\n');
  
  try {
    // Import the singleton instance
    const { prisma } = require('./src/utils/database');
    
    console.log('📊 Testing singleton prisma instance...');
    
    // Test connection
    await prisma.$connect();
    console.log('✅ Singleton connection successful!');

    // Test a simple query
    const userCount = await prisma.user.count();
    console.log(`👥 Users found: ${userCount}`);

    // Test user lookup (like in auth middleware)
    const users = await prisma.user.findMany({
      take: 1,
      include: {
        role: true
      }
    });
    
    if (users.length > 0) {
      console.log(`👤 Sample user: ${users[0].email}`);
      console.log(`🔑 User role: ${users[0].role?.name || 'No role'}`);
    }

    console.log('\n✅ All singleton tests passed!');
    
    // Don't disconnect - let the singleton manage its own connection
    
  } catch (error) {
    console.error('❌ Singleton test failed:', error.message);
    
    if (error.message.includes('Can\'t reach database server')) {
      console.log('\n🔧 Database connection issue detected!');
      console.log('This might be why authentication is failing.');
    }
    
    process.exit(1);
  }
}

// Run the test
testSingletonConnection();
