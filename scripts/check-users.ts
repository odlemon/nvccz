// @ts-nocheck
import { dbConnection } from '../src/utils/database';

async function checkUsers() {
  try {
    console.log('👥 Checking users in database...');
    
    const prisma = dbConnection.getPrismaClient();
    
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        roleId: true
      }
    });
    
    console.log('📊 Users found:', users.length);
    users.forEach(user => {
      console.log(`- ${user.email} (${user.firstName} ${user.lastName}) - Role: ${user.roleId}`);
    });
    
    if (users.length === 0) {
      console.log('⚠️ No users found. You may need to run the seeders first.');
    }
    
  } catch (error: any) {
    console.error('❌ Error checking users:', error.message);
  }
}

checkUsers();

