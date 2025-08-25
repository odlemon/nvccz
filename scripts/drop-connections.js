const mysql = require('mysql2/promise');
require('dotenv').config();

async function dropConnections() {
  console.log('🔍 Dropping Database Connections...\n');
  
  try {
    // Create connection to manage other connections
    const connection = await mysql.createConnection({
      host: 'nvcc-veximagames-0d4d.d.aivencloud.com',
      port: 24079,
      user: 'avnadmin',
      password: 'AVNS_krm65lR20GfGftQmBjJ',
      database: 'defaultdb',
      ssl: {
        rejectUnauthorized: false
      },
      connectTimeout: 60000,
      charset: 'utf8mb4'
    });

    console.log('✅ Management connection established successfully!\n');

    // Get current connections
    console.log('📋 Current Active Connections:');
    const [connections] = await connection.execute(`
      SELECT 
        ID as connection_id,
        USER as user,
        HOST as host,
        DB as database,
        COMMAND as command,
        TIME as time_seconds,
        STATE as state
      FROM information_schema.PROCESSLIST 
      WHERE (DB = 'defaultdb' OR DB IS NULL)
      ORDER BY TIME DESC
    `);

    console.log(`Found ${connections.length} total connections:`);
    connections.forEach(conn => {
      console.log(`  - ID: ${conn.connection_id}, User: ${conn.user}, Host: ${conn.host}, Time: ${conn.time_seconds}s, State: ${conn.state}`);
    });

    // Filter out our management connection and system connections
    const killableConnections = connections.filter(conn => 
      conn.user === 'avnadmin' && 
      conn.connection_id !== connection.threadId &&
      conn.command !== 'Sleep' &&
      conn.time_seconds > 0
    );

    console.log(`\n🔍 Found ${killableConnections.length} killable connections:`);
    killableConnections.forEach(conn => {
      console.log(`  - ID: ${conn.connection_id}, Time: ${conn.time_seconds}s, State: ${conn.state}`);
    });

    // Kill 2 connections (or less if fewer available)
    const connectionsToKill = killableConnections.slice(0, 2);
    
    if (connectionsToKill.length === 0) {
      console.log('\n⚠️ No killable connections found. All connections are either:');
      console.log('  - System connections');
      console.log('  - Sleep connections (idle)');
      console.log('  - Our management connection');
      return;
    }

    console.log(`\n🗑️ Killing ${connectionsToKill.length} connections:`);
    
    for (const conn of connectionsToKill) {
      try {
        console.log(`  - Killing connection ID: ${conn.connection_id}`);
        await connection.execute(`KILL ${conn.connection_id}`);
        console.log(`    ✅ Successfully killed connection ${conn.connection_id}`);
      } catch (error) {
        console.log(`    ❌ Failed to kill connection ${conn.connection_id}: ${error.message}`);
      }
    }

    // Wait a moment for connections to close
    console.log('\n⏳ Waiting for connections to close...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check remaining connections
    console.log('\n📋 Remaining Active Connections:');
    const [remainingConnections] = await connection.execute(`
      SELECT 
        ID as connection_id,
        USER as user,
        HOST as host,
        DB as database,
        COMMAND as command,
        TIME as time_seconds,
        STATE as state
      FROM information_schema.PROCESSLIST 
      WHERE (DB = 'defaultdb' OR DB IS NULL)
      ORDER BY TIME DESC
    `);

    console.log(`Remaining connections: ${remainingConnections.length}`);
    remainingConnections.forEach(conn => {
      console.log(`  - ID: ${conn.connection_id}, User: ${conn.user}, Host: ${conn.host}, Time: ${conn.time_seconds}s, State: ${conn.state}`);
    });

    // Get connection statistics
    console.log('\n📈 Updated Connection Statistics:');
    const [activeConnections] = await connection.execute(`
      SHOW STATUS LIKE 'Threads_connected'
    `);
    console.log('Active Connections:', activeConnections[0].Value);

    const [maxConnections] = await connection.execute(`
      SHOW VARIABLES LIKE 'max_connections'
    `);
    console.log('Max Connections:', maxConnections[0].Value);

    // Close management connection
    await connection.end();
    console.log('\n✅ Management connection closed successfully!');
    console.log('\n🎉 Connection cleanup completed!');

  } catch (error) {
    console.error('\n❌ Failed to drop connections:');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
  }
}

// Alternative method: Kill connections by time
async function dropOldConnections() {
  console.log('🔍 Dropping Old Database Connections...\n');
  
  try {
    const connection = await mysql.createConnection({
      host: 'nvcc-veximagames-0d4d.d.aivencloud.com',
      port: 24079,
      user: 'avnadmin',
      password: 'AVNS_krm65lR20GfGftQmBjJ',
      database: 'defaultdb',
      ssl: {
        rejectUnauthorized: false
      },
      connectTimeout: 60000,
      charset: 'utf8mb4'
    });

    // Kill connections that have been running for more than 30 seconds
    console.log('🗑️ Killing connections older than 30 seconds...');
    const [result] = await connection.execute(`
      SELECT ID 
      FROM information_schema.PROCESSLIST 
      WHERE USER = 'avnadmin' 
        AND ID != ${connection.threadId}
        AND TIME > 30
      LIMIT 2
    `);

    if (result.length === 0) {
      console.log('⚠️ No old connections found to kill');
    } else {
      console.log(`Found ${result.length} old connections to kill:`);
      for (const conn of result) {
        try {
          console.log(`  - Killing connection ID: ${conn.ID}`);
          await connection.execute(`KILL ${conn.ID}`);
          console.log(`    ✅ Successfully killed connection ${conn.ID}`);
        } catch (error) {
          console.log(`    ❌ Failed to kill connection ${conn.ID}: ${error.message}`);
        }
      }
    }

    await connection.end();
    console.log('\n✅ Old connection cleanup completed!');

  } catch (error) {
    console.error('\n❌ Failed to drop old connections:', error.message);
  }
}

// Run the connection cleanup
async function runCleanup() {
  console.log('🚀 Starting Connection Cleanup...\n');
  
  await dropConnections();
  console.log('\n---');
  await dropOldConnections();
  
  console.log('\n🏁 Connection cleanup completed!');
}

// Run if this file is executed directly
if (require.main === module) {
  runCleanup().catch(console.error);
}

module.exports = { dropConnections, dropOldConnections };
