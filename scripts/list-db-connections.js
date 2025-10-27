// @ts-nocheck
const { PrismaClient } = require('@prisma/client');

async function listDatabaseConnections() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Listing all active database connections...');
    
    // Get all connections to the current database
    const result = await prisma.$queryRaw`
      SELECT 
        ID as connection_id,
        USER as user_name,
        HOST as host,
        DB as database_name,
        COMMAND as command,
        TIME as time_seconds,
        STATE as state,
        LEFT(INFO, 100) as query_info
      FROM information_schema.PROCESSLIST 
      WHERE DB = DATABASE()
      ORDER BY TIME DESC
    `;
    
    console.log('\n📊 Active connections to current database:');
    console.table(result);
    
    // Get total connection count
    const countResult = await prisma.$queryRaw`
      SELECT COUNT(*) as total_connections 
      FROM information_schema.PROCESSLIST 
      WHERE DB = DATABASE()
    `;
    
    console.log(`\n📈 Total active connections: ${countResult[0].total_connections}`);
    
    // Get connection details by user
    const userConnections = await prisma.$queryRaw`
      SELECT 
        USER as user_name,
        COUNT(*) as connection_count,
        MAX(TIME) as max_time_seconds,
        MIN(TIME) as min_time_seconds
      FROM information_schema.PROCESSLIST 
      WHERE DB = DATABASE()
      GROUP BY USER
      ORDER BY connection_count DESC
    `;
    
    console.log('\n👥 Connections by user:');
    console.table(userConnections);
    
  } catch (error) {
    console.error('❌ Error listing connections:', error);
  } finally {
    await prisma.$disconnect();
  }
}

listDatabaseConnections();
