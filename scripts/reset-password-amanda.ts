// @ts-nocheck
/**
 * Reset password for amandablack@gmail.com to amanda123
 */

import { prisma } from '../src/utils/database';
import bcrypt from 'bcrypt';

async function resetPassword() {
  try {
    const email = 'amandablack@gmail.com';
    const newPassword = 'amanda123';

    console.log('🔐 Resetting password for:', email);
    console.log('📝 New password:', newPassword);
    console.log('');

    // Find user
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim() }
    });

    if (!user) {
      console.log('❌ User not found with email:', email);
      return;
    }

    console.log('✅ User found:');
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   User ID: ${user.id}`);
    console.log('');

    // Hash the new password
    console.log('🔐 Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log('✅ Password hashed\n');

    // Update password
    console.log('📝 Updating password in database...');
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    console.log('✅ Password reset successfully!');
    console.log('');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 Updated Credentials:');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Email: ${email}`);
    console.log(`Password: ${newPassword}`);
    console.log('════════════════════════════════════════════════════════════════');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the reset
resetPassword()
  .then(() => {
    console.log('\n✅ Password reset completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Password reset failed:', error);
    process.exit(1);
  });

