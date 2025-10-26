// @ts-nocheck
import { dbConnection } from '../src/utils/database';

async function testBatchService() {
  try {
    console.log('🧪 Testing Batch Service Database Connection');
    
    // Test database connection
    const prisma = dbConnection.getPrismaClient();
    console.log('✅ Prisma client obtained:', !!prisma);
    
    // Test a simple query
    const userCount = await prisma.user.count();
    console.log('✅ User count query successful:', userCount);
    
    // Test batch query
    const batchCount = await prisma.cashbookImportBatch.count();
    console.log('✅ Batch count query successful:', batchCount);
    
    console.log('🎉 All database operations successful!');
    
  } catch (error: any) {
    console.error('❌ Error testing batch service:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

testBatchService();
