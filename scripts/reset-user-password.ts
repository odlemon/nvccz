import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function resetPassword() {
  try {
    const email = 'janeterica@gmail.com';
    const newPassword = 'jane123';

    console.log('🔍 Finding user...');
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      }
    });

    if (!user) {
      console.error(`❌ User with email ${email} not found`);
      return;
    }

    console.log(`✅ Found user: ${user.firstName} ${user.lastName} (${user.email})`);
    console.log(`   User ID: ${user.id}\n`);

    console.log('🔐 Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log('✅ Password hashed\n');

    console.log('📝 Updating password...');
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        updatedAt: new Date()
      }
    });

    console.log('✅ Password reset successfully!');
    console.log(`   Email: ${email}`);
    console.log(`   New Password: ${newPassword}\n`);

    console.log('📊 Final Status:');
    console.log(`   User: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Password: Reset to "${newPassword}"`);

  } catch (error: any) {
    console.error('\n❌ Error resetting password:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
