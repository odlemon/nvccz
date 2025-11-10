//@ts-nocheck
import 'dotenv/config';
import { prisma } from '../src/utils/database';

async function resetPrismaConnection() {
  try {
    console.log('🔌 Disconnecting Prisma client...');
    await prisma.$disconnect();

    console.log('🔄 Reconnecting Prisma client...');
    await prisma.$connect();

    console.log('✅ Connection re-established. Running SELECT 1 ...');
    await prisma.$queryRaw`SELECT 1`;

    console.log('✅ Database connection healthy.');
  } catch (error: any) {
    console.error('❌ Failed to reset Prisma connection:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

resetPrismaConnection();


