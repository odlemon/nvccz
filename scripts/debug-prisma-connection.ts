// @ts-nocheck
import { dbConnection } from '../src/utils/database';

async function debugPrismaConnection() {
  try {
    console.log('🔍 Debugging Prisma Connection');
    
    // Test 1: Check if dbConnection exists
    console.log('1. dbConnection exists:', !!dbConnection);
    
    // Test 2: Check if getPrismaClient method exists
    console.log('2. getPrismaClient method exists:', typeof dbConnection.getPrismaClient === 'function');
    
    // Test 3: Try to get Prisma client
    const prisma = dbConnection.getPrismaClient();
    console.log('3. Prisma client obtained:', !!prisma);
    console.log('4. Prisma client type:', typeof prisma);
    
    // Test 4: Check if prisma has the expected methods
    console.log('5. cashbookBatch method exists:', typeof prisma.cashbookBatch === 'object');
    console.log('6. cashbookEntry method exists:', typeof prisma.cashbookEntry === 'object');
    console.log('7. user method exists:', typeof prisma.user === 'object');
    
    // Test 5: Try a simple query
    const userCount = await prisma.user.count();
    console.log('8. User count query successful:', userCount);
    
    // Test 6: Try batch query
    const batchCount = await prisma.cashbookBatch.count();
    console.log('9. Batch count query successful:', batchCount);
    
    console.log('✅ All Prisma connection tests passed!');
    
  } catch (error: any) {
    console.error('❌ Prisma connection error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

debugPrismaConnection();

